import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireUser } from "@/lib/auth/require-user";

import {
  applyDeletion,
  confirmDeletion,
  previewDeletion,
  undoDeletion,
} from "./actions";
import { IDLE_DELETION_STATE } from "./state";
import { CONSEQUENCE_KEYS, RETENTION_KINDS } from "./contracts";
import { getDeletionCopy } from "./copy";

/**
 * The first deletion path this product has ever had.
 *
 * These cases are written around the ways this can be wrong and cost the owner
 * something real: a preview that authorizes, an error that tells a stranger
 * their id is real, an error that leaves the owner unsure whether anything was
 * removed, and a confirmation that survives the facts it was issued against.
 *
 * The database enforces all four; these assertions are about the layer that
 * could still throw the enforcement away by mapping two codes onto one message
 * or by sending a number back that the server should have re-derived.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));

const ENTITY_ID = "44444444-4444-4444-8444-444444444444";
const UNDO_ID = "55555555-5555-4555-8555-555555555555";
const OPERATION_KEY = "deletion-key-0001";

const zeroConsequences = Object.fromEntries(CONSEQUENCE_KEYS.map((key) => [key, 0]));

function form(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  data.set("entityType", "person");
  data.set("entityId", ENTITY_ID);
  data.set("operationKey", OPERATION_KEY);
  data.set("locale", "pt-BR");
  for (const [key, value] of Object.entries(overrides)) data.set(key, value);
  return data;
}

/** Records the arguments so what the client sent can be asserted, not assumed. */
function stub(result: { data: unknown; error: { code?: string; message?: string } | null }) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  vi.mocked(requireUser).mockResolvedValue({
    supabase: {
      rpc: (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        return Promise.resolve(result);
      },
    },
    user: { id: "owner" },
  } as never);
  return calls;
}

beforeEach(() => vi.clearAllMocks());

describe("previewDeletion", () => {
  it("returns the server's own counts and writes nothing", async () => {
    const calls = stub({
      data: {
        entityType: "person",
        entityId: ENTITY_ID,
        consequences: { ...zeroConsequences, relations: 2, entryMentions: 1 },
        undoAvailable: true,
        retention: [...RETENTION_KINDS],
      },
      error: null,
    });

    const state = await previewDeletion(IDLE_DELETION_STATE, form());

    expect(state.status).toBe("previewed");
    expect(state.preview?.consequences.relations).toBe(2);
    // A preview that issued anything would be an authorization, which
    // 2N-CORRECT-010 forbids outright.
    expect(calls).toHaveLength(1);
    expect(calls[0]?.fn).toBe("preview_entity_deletion");
    expect(calls[0]?.args).not.toHaveProperty("p_operation_key");
  });

  it("reports a foreign subject exactly as it reports one that never existed", async () => {
    stub({ data: null, error: { code: "P0002", message: "Subject not available" } });
    const foreign = await previewDeletion(IDLE_DELETION_STATE, form());

    stub({ data: null, error: { code: "P0002", message: "Subject not available" } });
    const absent = await previewDeletion(IDLE_DELETION_STATE, form({ entityId: "66666666-6666-4666-8666-666666666666" }));

    // Identical outcome AND identical sentence. A difference in either would be
    // an oracle for whether another account's id is real.
    expect(foreign.outcome).toBe("unavailable");
    expect(absent.outcome).toBe("unavailable");
    expect(foreign.message).toBe(absent.message);
  });

  it("refuses an entity type the deletion path does not accept, before any call", async () => {
    const calls = stub({ data: null, error: null });
    const state = await previewDeletion(IDLE_DELETION_STATE, form({ entityType: "task" }));

    expect(state.outcome).toBe("unavailable");
    expect(calls).toHaveLength(0);
  });
});

describe("confirmDeletion", () => {
  it("asks the server to issue the confirmation and sends no digest of its own", async () => {
    const calls = stub({
      data: {
        confirmationId: "77777777-7777-4777-8777-777777777777",
        entityType: "person",
        entityId: ENTITY_ID,
        consequences: zeroConsequences,
        undoAvailable: true,
        retention: [...RETENTION_KINDS],
      },
      error: null,
    });

    const state = await confirmDeletion(IDLE_DELETION_STATE, form());

    expect(state.status).toBe("confirmed");
    expect(calls[0]?.fn).toBe("issue_entity_deletion_confirmation");
    // The three arguments are the subject and the key. A fingerprint among them
    // would make the caller a party to deriving its own authorization.
    expect(Object.keys(calls[0]?.args ?? {}).sort()).toEqual([
      "p_entity_id",
      "p_entity_type",
      "p_operation_key",
    ]);
  });
});

describe("applyDeletion", () => {
  it("sends no consequence counts back — the server re-derives them", async () => {
    const calls = stub({
      data: {
        deleted: true,
        entityType: "person",
        entityId: ENTITY_ID,
        consequences: zeroConsequences,
        undoId: UNDO_ID,
        undoExpiresAt: "2026-08-15T00:00:00Z",
      },
      error: null,
    });

    const state = await applyDeletion(IDLE_DELETION_STATE, form());

    expect(state.status).toBe("deleted");
    expect(state.undoId).toBe(UNDO_ID);
    expect(JSON.stringify(calls[0]?.args)).not.toContain("consequences");
  });

  it("reports a changed world as stale rather than as a failure, and keeps nothing", async () => {
    stub({ data: null, error: { code: "55P03", message: "The consequences changed" } });
    const state = await applyDeletion(IDLE_DELETION_STATE, form());

    expect(state.outcome).toBe("stale");
    expect(state.message).toBe(getDeletionCopy("pt-BR").outcomes.stale);
    expect(state.undoId).toBeNull();
  });

  it("collapses missing, consumed and re-aimed confirmations into one refusal", async () => {
    stub({ data: null, error: { code: "42501", message: "Deletion confirmation required" } });
    const state = await applyDeletion(IDLE_DELETION_STATE, form());
    expect(state.outcome).toBe("unconfirmed");
  });

  it("says nothing was removed for an error it does not recognise", async () => {
    stub({ data: null, error: { code: "XX000", message: "unexpected" } });
    const state = await applyDeletion(IDLE_DELETION_STATE, form());

    // The whole operation is one transaction, so "nothing was removed" is the
    // true thing to say about any error — and it is the only safe default.
    expect(state.outcome).toBe("failed");
    expect(state.message).toBe(getDeletionCopy("pt-BR").outcomes.failed);
  });

  it("refuses a response whose shape does not match, rather than rendering undefined", async () => {
    stub({ data: { deleted: true, entityType: "person" }, error: null });
    const state = await applyDeletion(IDLE_DELETION_STATE, form());
    expect(state.outcome).toBe("failed");
  });
});

describe("undoDeletion", () => {
  it("targets the recorded id through the registry that already ships", async () => {
    const calls = stub({ data: { undone: true, affected: 9, entityType: "person" }, error: null });
    const data = form();
    data.set("undoId", UNDO_ID);

    const state = await undoDeletion(IDLE_DELETION_STATE, data);

    expect(state.status).toBe("undone");
    expect(calls[0]?.fn).toBe("undo_operation");
    expect(calls[0]?.args).toEqual({ p_undo_id: UNDO_ID });
  });

  it("does not call the database at all without a recorded id", async () => {
    const calls = stub({ data: null, error: null });
    const state = await undoDeletion(IDLE_DELETION_STATE, form());

    // 2N-CORRECT-007: undo targets recorded ids, never a re-resolved name. With
    // no id there is nothing to target, and guessing would be the defect.
    expect(state.outcome).toBe("failed");
    expect(calls).toHaveLength(0);
  });
});
