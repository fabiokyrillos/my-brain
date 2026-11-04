import { beforeEach, describe, expect, it, vi } from "vitest";

import { assertActiveAccount } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

import { cancelEvent, confirmEventCandidates, undoEventCandidates } from "./actions";
import { idleEventActionState } from "./state";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ assertActiveAccount: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const ENTRY = "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6";
const READING = "94f6c9d0-2f4e-4a2e-8f2c-9b2a3c4d5e6f";
const KEY = "6118fb25-2f80-432a-aa96-0e76d924862e";
const UNDO = "4b3700f0-3300-452a-af18-70427f788ff7";
const EVENT = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function client(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => result);
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    rpc,
  } as never);
  return rpc;
}

describe("confirmEventCandidates", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends the chosen indexes to the audited RPC and returns its undo", async () => {
    const rpc = client({ data: { eventIds: ["e1", "e2"], undoId: UNDO }, error: null });
    const result = await confirmEventCandidates(idleEventActionState, form({
      entryId: ENTRY, interpretationId: READING, operationKey: KEY, locale: "pt-BR", candidateIndexes: "[1,0]",
    }));
    expect(rpc).toHaveBeenCalledWith("confirm_entry_event_candidates", {
      p_entry_id: ENTRY, p_expected_interpretation_id: READING, p_candidate_indexes: [1, 0], p_operation_key: KEY,
    });
    expect(assertActiveAccount).toHaveBeenCalled();
    expect(result).toEqual({ status: "success", message: "2 eventos na agenda.", undoId: UNDO });
  });

  it("refuses an empty choice before reaching the database", async () => {
    const rpc = client({ data: null, error: null });
    const result = await confirmEventCandidates(idleEventActionState, form({
      entryId: ENTRY, interpretationId: READING, operationKey: KEY, locale: "pt-BR", candidateIndexes: "[]",
    }));
    expect(rpc).not.toHaveBeenCalled();
    expect(result.status).toBe("error");
  });

  it("says the reading changed when the interpretation is stale", async () => {
    client({ data: null, error: { code: "55P03", details: "STALE_INTERPRETATION" } });
    const result = await confirmEventCandidates(idleEventActionState, form({
      entryId: ENTRY, interpretationId: READING, operationKey: KEY, locale: "en", candidateIndexes: "[0]",
    }));
    expect(result).toEqual({ status: "error", message: "This record's reading changed. Refresh the page.", undoId: null });
  });
});

describe("cancelEvent and undoEventCandidates", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cancels through its RPC", async () => {
    const rpc = client({ data: { status: "cancelled" }, error: null });
    const result = await cancelEvent(idleEventActionState, form({ entryId: ENTRY, eventId: EVENT, locale: "pt-BR" }));
    expect(rpc).toHaveBeenCalledWith("cancel_event", { p_event_id: EVENT });
    expect(result.status).toBe("success");
  });

  it("undoes through the undo router", async () => {
    const rpc = client({ data: { undone: true }, error: null });
    const result = await undoEventCandidates(idleEventActionState, form({ entryId: ENTRY, undoId: UNDO, locale: "pt-BR" }));
    expect(rpc).toHaveBeenCalledWith("undo_operation", { p_undo_id: UNDO });
    expect(result).toEqual({ status: "success", message: "Eventos tirados da agenda.", undoId: null });
  });
});
