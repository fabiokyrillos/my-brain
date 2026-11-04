/**
 * Life Brain C.1 (`LB-C-006`, ADR-148) — the owner's override of a record's
 * sensitivity. Until LB-M1 nothing in the product could write
 * `entries.sensitivity`; a health or finance record now defaults to private,
 * and this is how the owner changes it. The write is the audited RPC
 * `set_entry_sensitivity`, never a table update, and the RPC is what keeps a
 * later reading from overriding the choice.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireUser } from "@/lib/auth/require-user";
import { setEntrySensitivity } from "./entry-sensitivity-actions";
import { idleEntrySensitivityState } from "./entry-sensitivity-state";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));

const ENTRY = "e1111111-1111-4111-8111-111111111111";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function supabaseReturning(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => result);
  const from = vi.fn(() => { throw new Error("no table writes"); });
  vi.mocked(requireUser).mockResolvedValue({ supabase: { rpc, from }, user: { id: "u1" } } as never);
  return { rpc, from };
}

beforeEach(() => vi.clearAllMocks());

describe("setEntrySensitivity", () => {
  it("writes through the audited RPC, never the table", async () => {
    const { rpc, from } = supabaseReturning({ data: { sensitivity: "normal" }, error: null });
    const result = await setEntrySensitivity(idleEntrySensitivityState, form({ locale: "pt-BR", entryId: ENTRY, sensitivity: "normal" }));

    expect(rpc).toHaveBeenCalledWith("set_entry_sensitivity", { p_entry_id: ENTRY, p_sensitivity: "normal" });
    expect(from).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "success", message: "Sensibilidade salva.", sensitivity: "normal" });
  });

  it("refuses a level outside the vocabulary before reaching the database", async () => {
    const { rpc } = supabaseReturning({ data: null, error: null });
    const result = await setEntrySensitivity(idleEntrySensitivityState, form({ locale: "en", entryId: ENTRY, sensitivity: "secret" }));

    expect(rpc).not.toHaveBeenCalled();
    expect(result.status).toBe("error");
    expect(result.message).toBe("Choose one of the levels.");
  });

  it("refuses a malformed entry id", async () => {
    const { rpc } = supabaseReturning({ data: null, error: null });
    const result = await setEntrySensitivity(idleEntrySensitivityState, form({ locale: "pt-BR", entryId: "nope", sensitivity: "private" }));

    expect(rpc).not.toHaveBeenCalled();
    expect(result.status).toBe("error");
  });

  it("says the record is gone when the RPC cannot find it for this owner", async () => {
    supabaseReturning({ data: null, error: { code: "P0002", message: "Entry not found" } });
    const result = await setEntrySensitivity(idleEntrySensitivityState, form({ locale: "pt-BR", entryId: ENTRY, sensitivity: "private" }));

    expect(result).toEqual({ status: "error", message: "Este registro não existe mais.", sensitivity: null });
  });
});
