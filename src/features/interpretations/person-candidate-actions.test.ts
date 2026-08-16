import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { assertActiveAccount } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { resolvePersonCandidates, type PersonCandidateActionState } from "./person-candidate-actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ assertActiveAccount: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const entryId = "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6";
const interpretationId = "94f6c9d0-2f4e-4a2e-8f2c-9b2a3c4d5e6f";
const operationKey = "6118fb25-2f80-432a-aa96-0e76d924862e";
const undoId = "4b3700f0-3300-452a-af18-70427f788ff7";
const idle: PersonCandidateActionState = { status: "idle", message: "", undoId: null };

function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  const fields = {
    entryId,
    expectedInterpretationId: interpretationId,
    operationKey,
    locale: "pt-BR",
    resolutions: JSON.stringify([
      { candidateIndex: 0, disposition: "confirmed", resolvedName: "Giovanna" },
      { candidateIndex: 1, disposition: "rejected" },
    ]),
    ...overrides,
  };
  Object.entries(fields).forEach(([key, value]) => data.set(key, value));
  return data;
}

function client(result: { data: unknown; error: null | { code?: string; details?: string; message?: string } }, authenticated = true) {
  const rpc = vi.fn(async () => result);
  return {
    value: {
      auth: { getUser: vi.fn(async () => ({ data: { user: authenticated ? { id: "user-1" } : null } })) },
      rpc,
    },
    rpc,
  };
}

describe("resolvePersonCandidates", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects malformed form data before creating a client", async () => {
    const result = await resolvePersonCandidates(idle, form({ operationKey: "not-a-uuid" }));
    expect(result).toMatchObject({ status: "error", code: "validation_failed", retryable: false });
    expect(createClient).not.toHaveBeenCalled();
  });

  it.each([
    ["duplicate indexes", [
      { candidateIndex: 0, disposition: "confirmed" },
      { candidateIndex: 0, disposition: "rejected" },
    ]],
    ["a rejected edited name", [{ candidateIndex: 0, disposition: "rejected", resolvedName: "No" }]],
    ["an empty list", []],
  ])("rejects %s", async (_label, resolutions) => {
    const result = await resolvePersonCandidates(idle, form({ resolutions: JSON.stringify(resolutions) }));
    expect(result).toMatchObject({ status: "error", code: "validation_failed" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("requires an authenticated owner", async () => {
    const { value, rpc } = client({ data: null, error: null }, false);
    vi.mocked(createClient).mockResolvedValue(value as never);
    const result = await resolvePersonCandidates(idle, form());
    expect(result).toMatchObject({ status: "error", code: "unauthenticated" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls the authoritative RPC and revalidates inbox and people surfaces", async () => {
    const { value, rpc } = client({
      data: {
        operationKey,
        undoId,
        idempotent: false,
        results: [
          { candidateIndex: 0, disposition: "confirmed", personId: "person-1", outcome: "created" },
          { candidateIndex: 1, disposition: "rejected", personId: null, outcome: "ignored" },
        ],
      },
      error: null,
    });
    vi.mocked(createClient).mockResolvedValue(value as never);

    const result = await resolvePersonCandidates(idle, form());

    expect(assertActiveAccount).toHaveBeenCalledWith(value, "user-1", "pt-BR");
    expect(rpc).toHaveBeenCalledWith("resolve_entry_person_candidates", {
      p_entry_id: entryId,
      p_expected_interpretation_id: interpretationId,
      p_operation_key: operationKey,
      p_resolutions: [
        { candidateIndex: 0, disposition: "confirmed", resolvedName: "Giovanna" },
        { candidateIndex: 1, disposition: "rejected" },
      ],
    });
    expect(result).toEqual({
      status: "success", code: "resolved", message: "1 pessoa criada e 1 menção ignorada.",
      undoId, replayed: false, retryable: false,
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/pt-BR/app/inbox/${entryId}`);
    expect(revalidatePath).toHaveBeenCalledWith("/en/app/people");
  });

  it.each([
    ["STALE_INTERPRETATION", "A interpretação mudou. Atualize a página antes de continuar."],
    ["AMBIGUOUS_PERSON_MATCH", "Encontramos mais de uma pessoa com esse nome. Ajuste o nome antes de confirmar."],
    ["CANDIDATE_NOT_FOUND", "Essa menção não existe mais na interpretação atual."],
    ["INVALID_PERSON_NAME", "Revise o nome da pessoa."],
  ])("maps %s without leaking database details", async (details, message) => {
    const { value } = client({ data: null, error: { code: "P0001", details, message: "sensitive sql" } });
    vi.mocked(createClient).mockResolvedValue(value as never);
    expect(await resolvePersonCandidates(idle, form())).toEqual({
      status: "error", code: "operation_failed", message, undoId: null, retryable: false,
    });
  });
});
