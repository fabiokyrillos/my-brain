import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireUser } from "@/lib/auth/require-user";

import { createProposedMemory, setMemoryLifecycle, updateMemory } from "./actions";
import { idleMemoryEditState, idleMemoryProposalState } from "./edit-state";

/**
 * The first lifecycle Memories have ever had (UX-10), and DEC-5's confirmed
 * write.
 *
 * These cases are written around the ways this can be wrong and cost the owner
 * something real: a cross-tenant write, a change with no record of who made it,
 * a physical delete where an archive was promised, a cross-tenant relation
 * presented as an outage, and a double-submit leaving the same sentence stored
 * twice.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));
// The embedding is a best-effort side call; failing it here keeps these cases
// about the write contract rather than about the provider.
vi.mock("@/lib/ai", () => ({ getAIProvider: () => { throw new Error("no provider in tests"); } }));
vi.mock("@/lib/ai/usage", () => ({ recordAIUsage: vi.fn() }));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const MEMORY_ID = "22222222-2222-4222-8222-222222222222";
const PERSON_ID = "33333333-3333-4333-8333-333333333333";

type Result = { data: unknown; error: { code?: string; message?: string } | null };
type AuditInsert = (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;

const storedRow = {
  content: "prefiro reuniões pela manhã",
  kind: "preference",
  sensitivity: "normal",
  important: false,
  person_id: null,
  project_id: null,
  valid_from: null,
  valid_until: null,
};

/** Records every `eq` so ownership can be asserted rather than assumed. */
function memoryStub(read: Result, write: Result) {
  const eqCalls: Array<[string, unknown]> = [];
  let isUpdate = false;
  const stub: Record<string, unknown> = {};
  stub.select = vi.fn(() => stub);
  stub.update = vi.fn(() => { isUpdate = true; return stub; });
  stub.delete = vi.fn(() => stub);
  stub.eq = vi.fn((column: string, value: unknown) => { eqCalls.push([column, value]); return stub; });
  stub.limit = vi.fn(() => stub);
  stub.maybeSingle = vi.fn(async () => (isUpdate ? write : read));
  return {
    stub,
    eqCalls,
    get updated() { return (stub.update as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]; },
    get deleted() { return (stub.delete as ReturnType<typeof vi.fn>).mock.calls.length; },
  };
}

function client(
  memories: { stub: Record<string, unknown> },
  audit: ReturnType<typeof vi.fn<AuditInsert>> = vi.fn<AuditInsert>(async () => ({ error: null })),
) {
  return {
    from: vi.fn((table: string) => {
      if (table === "audit_logs") return { insert: audit };
      if (table === "agent_preferences") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
      }
      return memories.stub;
    }),
  };
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const editForm = (overrides: Record<string, string> = {}) => form({
  memoryId: MEMORY_ID,
  locale: "pt-BR",
  content: "prefiro reuniões pela manhã",
  kind: "preference",
  sensitivity: "normal",
  personId: "",
  projectId: "",
  ...overrides,
});

beforeEach(() => vi.clearAllMocks());

describe("updateMemory", () => {
  it("scopes every statement to the caller, not only to the row id", async () => {
    // RLS is the trust boundary; this predicate is the belt to its braces. A
    // policy loosened in a later migration would silently widen these writes.
    const memories = memoryStub({ data: storedRow, error: null }, { data: storedRow, error: null });
    vi.mocked(requireUser).mockResolvedValue({ supabase: client(memories), user: { id: USER_ID } } as never);

    await updateMemory(idleMemoryEditState, editForm());

    expect(memories.eqCalls).toContainEqual(["user_id", USER_ID]);
    expect(memories.eqCalls.filter(([column]) => column === "user_id")).toHaveLength(2);
  });

  it("records an audit row carrying both the before and the after state", async () => {
    const after = { ...storedRow, kind: "rule", important: true };
    const memories = memoryStub({ data: storedRow, error: null }, { data: after, error: null });
    const audit = vi.fn<AuditInsert>(async () => ({ error: null }));
    vi.mocked(requireUser).mockResolvedValue({
      supabase: client(memories, audit),
      user: { id: USER_ID },
    } as never);

    await updateMemory(idleMemoryEditState, editForm({ kind: "rule", important: "on" }));

    const row = audit.mock.calls[0]![0];
    expect(row.action_type).toBe("update_memory");
    expect(row.entity_type).toBe("memory");
    expect(row.entity_id).toBe(MEMORY_ID);
    expect(row.actor).toBe("user");
    // Without the pre-state the row cannot answer "what changed", which is the
    // question it exists for.
    expect(row.before_state).toEqual(storedRow);
    expect(row.after_state).toEqual(after);
  });

  it("reads the checkbox by presence, since an unticked box submits no key at all", async () => {
    const memories = memoryStub({ data: storedRow, error: null }, { data: storedRow, error: null });
    vi.mocked(requireUser).mockResolvedValue({ supabase: client(memories), user: { id: USER_ID } } as never);

    await updateMemory(idleMemoryEditState, editForm());

    expect((memories.updated as Record<string, unknown>).important).toBe(false);
  });

  it("presents a cross-tenant relation as a choice to fix, not as an outage", async () => {
    // `memories_person_owner_fk` references `(user_id, id)`, so the database
    // refuses this rather than a check this code could forget.
    const memories = memoryStub(
      { data: storedRow, error: null },
      { data: null, error: { code: "23503", message: "memories_person_owner_fk" } },
    );
    vi.mocked(requireUser).mockResolvedValue({ supabase: client(memories), user: { id: USER_ID } } as never);

    const result = await updateMemory(idleMemoryEditState, editForm({ personId: PERSON_ID }));

    expect(result.status).toBe("error");
    expect(result.message).toBe("Escolha uma pessoa ou projeto que existe.");
    // The edit is echoed back, because React 19 resets the form and the owner
    // would otherwise be told to fix something they can no longer see.
    expect(result.submitted?.personId).toBe(PERSON_ID);
  });

  it("reports a vanished row as gone rather than as a retryable failure", async () => {
    const memories = memoryStub({ data: null, error: null }, { data: null, error: null });
    vi.mocked(requireUser).mockResolvedValue({ supabase: client(memories), user: { id: USER_ID } } as never);

    const result = await updateMemory(idleMemoryEditState, editForm());

    expect(result.message).toBe("Esta memória não existe mais.");
  });

  it("refuses a forged control instead of silently dropping it", async () => {
    const memories = memoryStub({ data: storedRow, error: null }, { data: storedRow, error: null });
    vi.mocked(requireUser).mockResolvedValue({ supabase: client(memories), user: { id: USER_ID } } as never);

    const result = await updateMemory(idleMemoryEditState, editForm({ confidence: "0.2" }));

    expect(result.status).toBe("error");
    expect(memories.updated).toBeUndefined();
  });

  it("refuses a kind outside the ten the CHECK constraint allows", async () => {
    const memories = memoryStub({ data: storedRow, error: null }, { data: storedRow, error: null });
    vi.mocked(requireUser).mockResolvedValue({ supabase: client(memories), user: { id: USER_ID } } as never);

    const result = await updateMemory(idleMemoryEditState, editForm({ kind: "invented" }));

    expect(result.status).toBe("error");
    expect(memories.updated).toBeUndefined();
  });
});

describe("setMemoryLifecycle", () => {
  it("archives by ending the validity, and never deletes the row", async () => {
    // The provenance the detail page exists to show lives on this row. A
    // physical delete would destroy it, so archive sets `valid_until` and the
    // row stays intact and auditable.
    const memories = memoryStub({ data: storedRow, error: null }, { data: storedRow, error: null });
    vi.mocked(requireUser).mockResolvedValue({ supabase: client(memories), user: { id: USER_ID } } as never);

    await setMemoryLifecycle(
      idleMemoryEditState,
      form({ memoryId: MEMORY_ID, locale: "pt-BR", transition: "archive" }),
    );

    const updated = memories.updated as Record<string, unknown>;
    expect(typeof updated.valid_until).toBe("string");
    expect(memories.deleted).toBe(0);
  });

  it("reactivates by clearing the end date", async () => {
    const memories = memoryStub({ data: storedRow, error: null }, { data: storedRow, error: null });
    vi.mocked(requireUser).mockResolvedValue({ supabase: client(memories), user: { id: USER_ID } } as never);

    const result = await setMemoryLifecycle(
      idleMemoryEditState,
      form({ memoryId: MEMORY_ID, locale: "en", transition: "restore" }),
    );

    expect((memories.updated as Record<string, unknown>).valid_until).toBeNull();
    expect(result.message).toBe("Memory reactivated.");
  });

  it("audits each transition under its own action type", async () => {
    const memories = memoryStub({ data: storedRow, error: null }, { data: storedRow, error: null });
    const audit = vi.fn<AuditInsert>(async () => ({ error: null }));
    vi.mocked(requireUser).mockResolvedValue({
      supabase: client(memories, audit),
      user: { id: USER_ID },
    } as never);

    await setMemoryLifecycle(
      idleMemoryEditState,
      form({ memoryId: MEMORY_ID, locale: "pt-BR", transition: "archive" }),
    );

    expect(audit.mock.calls[0]![0].action_type).toBe("archive_memory");
  });

  it("accepts only the two named transitions", async () => {
    const memories = memoryStub({ data: storedRow, error: null }, { data: storedRow, error: null });
    vi.mocked(requireUser).mockResolvedValue({ supabase: client(memories), user: { id: USER_ID } } as never);

    const result = await setMemoryLifecycle(
      idleMemoryEditState,
      form({ memoryId: MEMORY_ID, locale: "pt-BR", transition: "delete" }),
    );

    expect(result.status).toBe("error");
    expect(memories.updated).toBeUndefined();
  });

  it("refuses a client-supplied end date, so the audit row's meaning is not client input", async () => {
    const memories = memoryStub({ data: storedRow, error: null }, { data: storedRow, error: null });
    vi.mocked(requireUser).mockResolvedValue({ supabase: client(memories), user: { id: USER_ID } } as never);

    const result = await setMemoryLifecycle(
      idleMemoryEditState,
      form({
        memoryId: MEMORY_ID,
        locale: "pt-BR",
        transition: "archive",
        validUntil: "1999-01-01T00:00:00Z",
      }),
    );

    expect(result.status).toBe("error");
    expect(memories.updated).toBeUndefined();
  });
});

describe("createProposedMemory (DEC-5)", () => {
  /** Insert-shaped stub: the existence probe reads, then the insert returns a row. */
  function insertStub(existing: Result, created: Result) {
    let inserted: Record<string, unknown> | undefined;
    const stub: Record<string, unknown> = {};
    let isInsert = false;
    stub.select = vi.fn(() => stub);
    stub.eq = vi.fn(() => stub);
    stub.limit = vi.fn(() => stub);
    stub.insert = vi.fn((row: Record<string, unknown>) => {
      isInsert = true;
      inserted = row;
      return stub;
    });
    stub.maybeSingle = vi.fn(async () => (isInsert ? created : existing));
    return { stub, get inserted() { return inserted; } };
  }

  const proposalForm = () => form({
    locale: "pt-BR",
    content: "prefiro reuniões pela manhã",
    kind: "preference",
  });

  it("stores the confirmed memory under the caller with the confirmed kind", async () => {
    const memories = insertStub({ data: null, error: null }, { data: { id: MEMORY_ID }, error: null });
    vi.mocked(requireUser).mockResolvedValue({ supabase: client(memories), user: { id: USER_ID } } as never);

    const result = await createProposedMemory(idleMemoryProposalState, proposalForm());

    expect(result.status).toBe("success");
    expect(result.memoryId).toBe(MEMORY_ID);
    const row = memories.inserted!;
    expect(row.user_id).toBe(USER_ID);
    expect(row.content).toBe("prefiro reuniões pela manhã");
    expect(row.kind).toBe("preference");
  });

  it("leaves provenance null rather than naming an entry that does not exist", async () => {
    const memories = insertStub({ data: null, error: null }, { data: { id: MEMORY_ID }, error: null });
    vi.mocked(requireUser).mockResolvedValue({ supabase: client(memories), user: { id: USER_ID } } as never);

    await createProposedMemory(idleMemoryProposalState, proposalForm());

    expect(memories.inserted!.source_entry_id).toBeUndefined();
  });

  it("does not write a confidence, because a hand-written memory is not a probability", async () => {
    const memories = insertStub({ data: null, error: null }, { data: { id: MEMORY_ID }, error: null });
    vi.mocked(requireUser).mockResolvedValue({ supabase: client(memories), user: { id: USER_ID } } as never);

    await createProposedMemory(idleMemoryProposalState, proposalForm());

    expect(memories.inserted!.confidence).toBeUndefined();
  });

  it("audits the creation as the owner's own act", async () => {
    const memories = insertStub({ data: null, error: null }, { data: { id: MEMORY_ID }, error: null });
    const audit = vi.fn<AuditInsert>(async () => ({ error: null }));
    vi.mocked(requireUser).mockResolvedValue({
      supabase: client(memories, audit),
      user: { id: USER_ID },
    } as never);

    await createProposedMemory(idleMemoryProposalState, proposalForm());

    const row = audit.mock.calls[0]![0];
    expect(row.action_type).toBe("create_memory");
    expect(row.actor).toBe("user");
    expect(row.entity_id).toBe(MEMORY_ID);
  });

  // A double-submit must not leave the same sentence stored twice, and
  // `memories` has no unique index to lean on.
  it("is idempotent: a second confirmation reports the first row instead of inserting again", async () => {
    const memories = insertStub(
      { data: { id: MEMORY_ID }, error: null },
      { data: { id: "should-not-be-used" }, error: null },
    );
    vi.mocked(requireUser).mockResolvedValue({ supabase: client(memories), user: { id: USER_ID } } as never);

    const result = await createProposedMemory(idleMemoryProposalState, proposalForm());

    expect(result.status).toBe("duplicate");
    expect(result.memoryId).toBe(MEMORY_ID);
    expect(memories.inserted).toBeUndefined();
    expect(result.message).toBe("Você já tem essa memória.");
  });

  it("refuses an empty proposal instead of storing a blank memory", async () => {
    const memories = insertStub({ data: null, error: null }, { data: null, error: null });
    vi.mocked(requireUser).mockResolvedValue({ supabase: client(memories), user: { id: USER_ID } } as never);

    const result = await createProposedMemory(
      idleMemoryProposalState,
      form({ locale: "pt-BR", content: "   ", kind: "fact" }),
    );

    expect(result.status).toBe("error");
    expect(memories.inserted).toBeUndefined();
  });

  it("refuses a kind outside the CHECK constraint", async () => {
    const memories = insertStub({ data: null, error: null }, { data: null, error: null });
    vi.mocked(requireUser).mockResolvedValue({ supabase: client(memories), user: { id: USER_ID } } as never);

    const result = await createProposedMemory(
      idleMemoryProposalState,
      form({ locale: "en", content: "something", kind: "invented" }),
    );

    expect(result.status).toBe("error");
    expect(memories.inserted).toBeUndefined();
  });
});
