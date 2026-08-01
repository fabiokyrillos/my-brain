import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireUser } from "@/lib/auth/require-user";

import {
  associatePersonContext,
  associatePersonProject,
  endPersonContext,
  endPersonProject,
  updatePersonProjectRole,
} from "./associations";
import { idleEntityEditState } from "./edit-state";

/**
 * The only application writer of `person_contexts` and `person_projects`.
 *
 * The load-bearing case is the last describe block: **the Person surface and the
 * Project surface write the identical row**, and the only thing `origin` may
 * change is which page is revalidated and what the audit reason says. If it ever
 * selects a table, a predicate or a payload, EGC-ASSOC-003 has been lost and the
 * two surfaces have quietly become two contracts.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PERSON_ID = "22222222-2222-4222-8222-222222222222";
const CONTEXT_ID = "33333333-3333-4333-8333-333333333333";
const PROJECT_ID = "44444444-4444-4444-8444-444444444444";
const LINK_ID = "55555555-5555-4555-8555-555555555555";

type Result = { data: unknown; error: { code?: string; message?: string } | null };
type AuditInsert = (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;

function tableStub(...results: Result[]) {
  const calls: Array<[string, unknown]> = [];
  const payloads: unknown[] = [];
  const isNull: string[] = [];
  let index = 0;
  const stub: Record<string, unknown> = {};
  stub.select = vi.fn(() => stub);
  stub.insert = vi.fn((row: unknown) => { payloads.push(row); return stub; });
  stub.update = vi.fn((row: unknown) => { payloads.push(row); return stub; });
  stub.eq = vi.fn((column: string, value: unknown) => { calls.push([column, value]); return stub; });
  stub.is = vi.fn((column: string) => { isNull.push(column); return stub; });
  stub.maybeSingle = vi.fn(async () => results[index++] ?? { data: null, error: null });
  return { stub, calls, payloads, isNull };
}

function client(
  tables: Record<string, { stub: Record<string, unknown> }>,
  audit: ReturnType<typeof vi.fn<AuditInsert>> = vi.fn<AuditInsert>(async () => ({ error: null })),
) {
  return {
    supabase: {
      from: vi.fn((table: string) =>
        table === "audit_logs" ? { insert: audit } : tables[table]!.stub,
      ),
    },
    audit,
  };
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const owned = () => tableStub({ data: { id: "owned" }, error: null });

beforeEach(() => vi.clearAllMocks());

describe("associatePersonContext", () => {
  it("writes the link under the caller's id after proving both ends are theirs", async () => {
    const links = tableStub({ data: { id: LINK_ID }, error: null });
    const people = owned();
    const contexts = owned();
    const { supabase, audit } = client({ people, contexts, person_contexts: links });
    vi.mocked(requireUser).mockResolvedValue({ supabase, user: { id: USER_ID } } as never);

    const result = await associatePersonContext(
      idleEntityEditState,
      form({ locale: "pt-BR", personId: PERSON_ID, contextId: CONTEXT_ID }),
    );

    expect(result.status).toBe("success");
    expect(links.payloads[0]).toMatchObject({
      user_id: USER_ID,
      person_id: PERSON_ID,
      context_id: CONTEXT_ID,
      confidence: 1,
    });
    expect(people.calls).toContainEqual(["user_id", USER_ID]);
    expect(contexts.calls).toContainEqual(["user_id", USER_ID]);
    expect(audit.mock.calls[0]![0]).toMatchObject({
      action_type: "associate_person_context",
      entity_type: "person_context",
      actor: "user",
    });
  });

  it("refuses a foreign context with a sentence rather than a 23503", async () => {
    // EGC-ASSOC-007. The composite FK makes the write structurally impossible;
    // this check exists so the refusal is readable.
    const links = tableStub();
    const { supabase } = client({
      people: owned(),
      contexts: tableStub({ data: null, error: null }),
      person_contexts: links,
    });
    vi.mocked(requireUser).mockResolvedValue({ supabase, user: { id: USER_ID } } as never);

    const result = await associatePersonContext(
      idleEntityEditState,
      form({ locale: "pt-BR", personId: PERSON_ID, contextId: CONTEXT_ID }),
    );

    expect(result.message).toBe("Não encontramos esse registro na sua conta.");
    expect(links.payloads).toHaveLength(0);
  });

  it("turns the partial unique index's 23505 into 'already there', not a failure", async () => {
    // `person_contexts_current_idx` covers the live pair only. Hitting it means
    // the owner asked for a state the data is already in — which is not an
    // outage and must not read as one.
    const links = tableStub({ data: null, error: { code: "23505", message: "duplicate key" } });
    const { supabase } = client({ people: owned(), contexts: owned(), person_contexts: links });
    vi.mocked(requireUser).mockResolvedValue({ supabase, user: { id: USER_ID } } as never);

    const result = await associatePersonContext(
      idleEntityEditState,
      form({ locale: "en", personId: PERSON_ID, contextId: CONTEXT_ID }),
    );

    expect(result.message).toBe("That is already recorded.");
  });
});

describe("endPersonContext", () => {
  it("sets valid_until on the live row only, and never deletes", async () => {
    const links = tableStub({ data: { id: LINK_ID }, error: null });
    const { supabase, audit } = client({ person_contexts: links });
    vi.mocked(requireUser).mockResolvedValue({ supabase, user: { id: USER_ID } } as never);

    const result = await endPersonContext(
      idleEntityEditState,
      form({ locale: "pt-BR", personId: PERSON_ID, contextId: CONTEXT_ID }),
    );

    expect(result.status).toBe("success");
    expect(links.payloads[0]).toHaveProperty("valid_until");
    // Load-bearing: without it a second click would overwrite the first end date
    // with a later one and quietly move when the link stopped.
    expect(links.isNull).toContain("valid_until");
    expect(audit.mock.calls[0]![0]).toMatchObject({ action_type: "end_person_context" });
  });
});

describe("associatePersonProject", () => {
  it("keeps the owner's own role wording out of the ledger", async () => {
    // EGC-ASSOC-004: `role` is the owner's domain vocabulary about their own
    // work, not a product taxonomy. That a role was set is recorded; what it
    // said is not.
    const links = tableStub({ data: { id: LINK_ID }, error: null });
    const { supabase, audit } = client({ people: owned(), projects: owned(), person_projects: links });
    vi.mocked(requireUser).mockResolvedValue({ supabase, user: { id: USER_ID } } as never);

    await associatePersonProject(
      idleEntityEditState,
      form({
        locale: "pt-BR",
        personId: PERSON_ID,
        projectId: PROJECT_ID,
        role: "revisora do contrato",
        origin: "person",
      }),
    );

    expect(links.payloads[0]).toMatchObject({ role: "revisora do contrato" });
    expect(JSON.stringify(audit.mock.calls[0]![0].after_state)).not.toContain("revisora");
    expect(audit.mock.calls[0]![0].after_state).toMatchObject({ has_role: true });
  });

  it("normalizes an empty role to null rather than storing an empty string", async () => {
    const links = tableStub({ data: { id: LINK_ID }, error: null });
    const { supabase } = client({ people: owned(), projects: owned(), person_projects: links });
    vi.mocked(requireUser).mockResolvedValue({ supabase, user: { id: USER_ID } } as never);

    await associatePersonProject(
      idleEntityEditState,
      form({ locale: "en", personId: PERSON_ID, projectId: PROJECT_ID, role: "  ", origin: "project" }),
    );

    expect(links.payloads[0]).toMatchObject({ role: null });
  });

  it("refuses a role past 120 before touching the database", async () => {
    const { supabase } = client({ people: owned(), projects: owned(), person_projects: tableStub() });
    vi.mocked(requireUser).mockResolvedValue({ supabase, user: { id: USER_ID } } as never);

    const result = await associatePersonProject(
      idleEntityEditState,
      form({
        locale: "en",
        personId: PERSON_ID,
        projectId: PROJECT_ID,
        role: "x".repeat(121),
        origin: "person",
      }),
    );

    expect(result.status).toBe("error");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("refuses an origin outside the two the schema allows", async () => {
    const { supabase } = client({ people: owned(), projects: owned(), person_projects: tableStub() });
    vi.mocked(requireUser).mockResolvedValue({ supabase, user: { id: USER_ID } } as never);

    const result = await associatePersonProject(
      idleEntityEditState,
      form({ locale: "en", personId: PERSON_ID, projectId: PROJECT_ID, role: "", origin: "admin" }),
    );

    expect(result.status).toBe("error");
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe("updatePersonProjectRole", () => {
  it("changes the role in place rather than ending and re-adding", async () => {
    // Ending and re-adding to fix a typo would write a history saying somebody
    // left a project and rejoined it the same second.
    const links = tableStub(
      { data: { id: LINK_ID, role: "revisora" }, error: null },
      { data: { id: LINK_ID, role: "revisora do contrato" }, error: null },
    );
    const { supabase, audit } = client({ person_projects: links });
    vi.mocked(requireUser).mockResolvedValue({ supabase, user: { id: USER_ID } } as never);

    const result = await updatePersonProjectRole(
      idleEntityEditState,
      form({
        locale: "pt-BR",
        personId: PERSON_ID,
        projectId: PROJECT_ID,
        role: "revisora do contrato",
        origin: "person",
      }),
    );

    expect(result.status).toBe("success");
    expect(links.payloads[0]).toEqual({ role: "revisora do contrato" });
    expect(links.payloads[0]).not.toHaveProperty("valid_until");
    expect(audit.mock.calls[0]![0]).toMatchObject({ action_type: "update_person_project_role" });
  });
});

describe("endPersonProject", () => {
  it("sets valid_until on the live row and never deletes", async () => {
    const links = tableStub({ data: { id: LINK_ID }, error: null });
    const { supabase, audit } = client({ person_projects: links });
    vi.mocked(requireUser).mockResolvedValue({ supabase, user: { id: USER_ID } } as never);

    const result = await endPersonProject(
      idleEntityEditState,
      form({ locale: "pt-BR", personId: PERSON_ID, projectId: PROJECT_ID, origin: "project" }),
    );

    expect(result.status).toBe("success");
    expect(links.payloads[0]).toHaveProperty("valid_until");
    expect(links.isNull).toContain("valid_until");
    expect(audit.mock.calls[0]![0]).toMatchObject({ action_type: "end_person_project" });
  });
});

/**
 * EGC-ASSOC-003, the symmetry claim, asserted rather than intended.
 *
 * This is the test that would fail if somebody gave the Project page its own
 * write path — the PRD's risk R3, and the reason the architecture test in
 * `egc-invariants.test.ts` exists beside it. That one proves there is a single
 * *module*; this one proves the single module does the single *thing*.
 */
describe("the same row, written from either surface", () => {
  async function writeFrom(origin: "person" | "project") {
    const links = tableStub({ data: { id: LINK_ID }, error: null });
    const { supabase, audit } = client({ people: owned(), projects: owned(), person_projects: links });
    vi.mocked(requireUser).mockResolvedValue({ supabase, user: { id: USER_ID } } as never);

    await associatePersonProject(
      idleEntityEditState,
      form({ locale: "pt-BR", personId: PERSON_ID, projectId: PROJECT_ID, role: "sponsor", origin }),
    );

    return { payload: links.payloads[0], audit: audit.mock.calls[0]![0], tables: supabase.from.mock.calls };
  }

  it("produces a byte-identical payload whichever page the owner was on", async () => {
    const fromPerson = await writeFrom("person");
    vi.clearAllMocks();
    const fromProject = await writeFrom("project");

    expect(fromPerson.payload).toEqual(fromProject.payload);
    expect(fromPerson.tables).toEqual(fromProject.tables);
  });

  it("lets origin change only the audit reason, and nothing that is written", async () => {
    const fromPerson = await writeFrom("person");
    vi.clearAllMocks();
    const fromProject = await writeFrom("project");

    expect(fromPerson.audit.reason).not.toBe(fromProject.audit.reason);
    expect(fromPerson.audit.action_type).toBe(fromProject.audit.action_type);
    expect(fromPerson.audit.entity_type).toBe(fromProject.audit.entity_type);
    expect(fromPerson.audit.after_state).toEqual(fromProject.audit.after_state);
  });
});
