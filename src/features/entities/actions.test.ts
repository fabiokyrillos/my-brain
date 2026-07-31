import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireUser } from "@/lib/auth/require-user";

import {
  createContext,
  createOrganization,
  createOrganizationForSubject,
  updateContext,
  updateOrganization,
  updatePerson,
  updateProject,
} from "./actions";
import { idleEntityEditState } from "./edit-state";

/**
 * The first write path Projects and People have ever had.
 *
 * These cases are written around the four ways it can be wrong and cost the
 * owner something real: a cross-tenant write, an edit with no record of who
 * made it, a duplicate-name refusal presented as an outage, and a vanished row
 * presented as a retryable failure.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const PERSON_ID = "33333333-3333-4333-8333-333333333333";
const ORGANIZATION_ID = "44444444-4444-4444-8444-444444444444";

type Result = { data: unknown; error: { code?: string; message?: string } | null };
type AuditInsert = (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;

/** Records every `eq` so ownership can be asserted rather than assumed. */
function tableStub(read: Result, write: Result) {
  const eqCalls: Array<[string, unknown]> = [];
  let isUpdate = false;
  const stub: Record<string, unknown> = {};
  stub.select = vi.fn(() => stub);
  stub.update = vi.fn(() => { isUpdate = true; return stub; });
  stub.insert = vi.fn(async () => ({ error: null }));
  stub.eq = vi.fn((column: string, value: unknown) => { eqCalls.push([column, value]); return stub; });
  stub.maybeSingle = vi.fn(async () => (isUpdate ? write : read));
  return { stub, eqCalls, get updated() { return (stub.update as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]; } };
}

function client(
  tables: Record<string, { stub: Record<string, unknown> }>,
  audit: ReturnType<typeof vi.fn<AuditInsert>> = vi.fn<AuditInsert>(async () => ({ error: null })),
) {
  const auditStub = { insert: audit };
  return {
    from: vi.fn((table: string) => (table === "audit_logs" ? auditStub : tables[table]!.stub)),
  };
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const projectForm = () => form({
  projectId: PROJECT_ID,
  locale: "pt-BR",
  name: "Atlas",
  description: "Migração",
  status: "paused",
  organizationId: ORGANIZATION_ID,
});

const personForm = () => form({
  personId: PERSON_ID,
  locale: "en",
  name: "Marina",
  notes: "Prefers email",
  organizationId: "",
});

beforeEach(() => vi.clearAllMocks());

describe("updateProject", () => {
  it("scopes every statement to the caller, not only to the row id", async () => {
    // RLS is the trust boundary; this predicate is the belt to its braces. A
    // policy loosened in a later migration would silently widen these writes.
    const projects = tableStub(
      { data: { name: "Old", description: null, status: "active", organization_id: null }, error: null },
      { data: { name: "Atlas", description: "Migração", status: "paused", organization_id: ORGANIZATION_ID }, error: null },
    );
    vi.mocked(requireUser).mockResolvedValue({ supabase: client({ projects }), user: { id: USER_ID } } as never);

    const result = await updateProject(idleEntityEditState, projectForm());

    expect(result.status).toBe("success");
    expect(projects.eqCalls).toContainEqual(["user_id", USER_ID]);
    expect(projects.eqCalls.filter(([column]) => column === "user_id")).toHaveLength(2);
  });

  it("records what changed, not only what it now is", async () => {
    const before = { name: "Old", description: null, status: "active", organization_id: null };
    const after = { name: "Atlas", description: "Migração", status: "paused", organization_id: ORGANIZATION_ID };
    const projects = tableStub({ data: before, error: null }, { data: after, error: null });
    const audit = vi.fn<AuditInsert>(async () => ({ error: null }));
    vi.mocked(requireUser).mockResolvedValue({ supabase: client({ projects }, audit), user: { id: USER_ID } } as never);

    await updateProject(idleEntityEditState, projectForm());

    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit.mock.calls[0]![0]).toMatchObject({
      user_id: USER_ID,
      action_type: "update_project",
      entity_type: "project",
      entity_id: PROJECT_ID,
      actor: "user",
      before_state: before,
      after_state: after,
    });
  });

  it("tells a duplicate name apart from an outage", async () => {
    // Renaming onto an existing name is a user mistake with an obvious next
    // step. Reporting it as "could not save" is how someone retries something
    // that can never succeed.
    const projects = tableStub(
      { data: { name: "Old", description: null, status: "active", organization_id: null }, error: null },
      { data: null, error: { code: "23505", message: 'duplicate key value violates unique constraint "projects_user_name_idx"' } },
    );
    vi.mocked(requireUser).mockResolvedValue({ supabase: client({ projects }), user: { id: USER_ID } } as never);

    const result = await updateProject(idleEntityEditState, projectForm());

    expect(result.status).toBe("error");
    expect(result.message).toBe("Esse nome já existe.");
  });

  it("reports a row that is gone as gone, not as retryable", async () => {
    const projects = tableStub({ data: null, error: null }, { data: null, error: null });
    vi.mocked(requireUser).mockResolvedValue({ supabase: client({ projects }), user: { id: USER_ID } } as never);

    const result = await updateProject(idleEntityEditState, projectForm());

    expect(result.message).toBe("Este registro não existe mais.");
  });

  it("refuses an invalid edit before touching the database", async () => {
    const projects = tableStub({ data: null, error: null }, { data: null, error: null });
    const supabase = client({ projects });
    vi.mocked(requireUser).mockResolvedValue({ supabase, user: { id: USER_ID } } as never);

    const result = await updateProject(idleEntityEditState, form({ projectId: "not-a-uuid", locale: "pt-BR", name: "x", status: "active", description: "", organizationId: "" }));

    expect(result.status).toBe("error");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("ignores React's own form fields, which a strict schema would otherwise reject", async () => {
    // The regression this guards is total: a Server Action's FormData carries
    // `$ACTION_*` metadata, and `.strict()` refused every save because of it.
    // Caught only by the live journey — no unit test saw a real submission.
    const projects = tableStub(
      { data: { name: "Old", description: null, status: "active", organization_id: null }, error: null },
      { data: { name: "Atlas", description: "Migração", status: "paused", organization_id: ORGANIZATION_ID }, error: null },
    );
    vi.mocked(requireUser).mockResolvedValue({ supabase: client({ projects }), user: { id: USER_ID } } as never);

    const submitted = projectForm();
    submitted.set("$ACTION_REF_1", "framework-metadata");
    submitted.set("$ACTION_1:0", "{}");

    const result = await updateProject(idleEntityEditState, submitted);

    expect(result.status).toBe("success");
  });

  it("localizes the refusal in English too", async () => {
    const result = await updateProject(idleEntityEditState, form({ projectId: "nope", locale: "en", name: "x", status: "active", description: "", organizationId: "" }));
    expect(result.message).toBe("Review the fields.");
  });

  it("does not fail the edit when only the audit insert fails", async () => {
    // The change did happen. Telling the owner it did not would be the larger
    // lie, and would invite a second save.
    const projects = tableStub(
      { data: { name: "Old", description: null, status: "active", organization_id: null }, error: null },
      { data: { name: "Atlas", description: "Migração", status: "paused", organization_id: ORGANIZATION_ID }, error: null },
    );
    const audit = vi.fn<AuditInsert>(async () => ({ error: { message: "audit unavailable" } }));
    vi.mocked(requireUser).mockResolvedValue({ supabase: client({ projects }, audit), user: { id: USER_ID } } as never);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await updateProject(idleEntityEditState, projectForm());

    expect(result.status).toBe("success");
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});

describe("updatePerson", () => {
  it("scopes every statement to the caller and records the change", async () => {
    const before = { name: "M", notes: null, organization_id: ORGANIZATION_ID };
    const after = { name: "Marina", notes: "Prefers email", organization_id: null };
    const people = tableStub({ data: before, error: null }, { data: after, error: null });
    const audit = vi.fn<AuditInsert>(async () => ({ error: null }));
    vi.mocked(requireUser).mockResolvedValue({ supabase: client({ people }, audit), user: { id: USER_ID } } as never);

    const result = await updatePerson(idleEntityEditState, personForm());

    expect(result.status).toBe("success");
    expect(people.eqCalls.filter(([column]) => column === "user_id")).toHaveLength(2);
    expect(audit.mock.calls[0]![0]).toMatchObject({
      action_type: "update_person",
      entity_type: "person",
      entity_id: PERSON_ID,
      actor: "user",
      before_state: before,
      after_state: after,
    });
  });

  it("writes a cleared company as null rather than an empty string", async () => {
    const people = tableStub(
      { data: { name: "M", notes: null, organization_id: ORGANIZATION_ID }, error: null },
      { data: { name: "Marina", notes: "Prefers email", organization_id: null }, error: null },
    );
    vi.mocked(requireUser).mockResolvedValue({ supabase: client({ people }), user: { id: USER_ID } } as never);

    await updatePerson(idleEntityEditState, personForm());

    expect(people.updated).toMatchObject({ organization_id: null, notes: "Prefers email" });
  });
});

/* -------------------------------------------------------------------------- */
/* Organizations and contexts — EGC.1                                          */
/* -------------------------------------------------------------------------- */

const CONTEXT_ID = "55555555-5555-4555-8555-555555555555";

/**
 * A table that is inserted into and read back, which `tableStub` cannot model.
 *
 * `tableStub` resolves `insert` to a bare `{error}` because the two update
 * actions never read their insert back. The four creating actions do — they need
 * the generated `id` for `createdId` and for the audit row — so the chain has to
 * survive `.insert(…).select(…).maybeSingle()`.
 */
function insertStub(result: Result) {
  const stub: Record<string, unknown> = {};
  stub.insert = vi.fn(() => stub);
  stub.select = vi.fn(() => stub);
  stub.maybeSingle = vi.fn(async () => result);
  return { stub, get inserted() { return (stub.insert as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]; } };
}

describe("createOrganization", () => {
  it("stamps the caller's id on the row and returns what it created", async () => {
    // `createdId` is what the create-and-select affordance selects without
    // re-querying, so an action that succeeded without one would leave the
    // selector showing the old value over a row that exists.
    const organizations = insertStub({
      data: { id: ORGANIZATION_ID, name: "Acme", description: "Cliente" },
      error: null,
    });
    const audit = vi.fn<AuditInsert>(async () => ({ error: null }));
    vi.mocked(requireUser).mockResolvedValue({ supabase: client({ organizations }, audit), user: { id: USER_ID } } as never);

    const result = await createOrganization(
      idleEntityEditState,
      form({ locale: "pt-BR", name: "Acme", description: "Cliente" }),
    );

    expect(result.status).toBe("success");
    expect(result.createdId).toBe(ORGANIZATION_ID);
    expect(organizations.inserted).toMatchObject({ user_id: USER_ID, name: "Acme", description: "Cliente" });
    expect(audit.mock.calls[0]![0]).toMatchObject({
      user_id: USER_ID,
      action_type: "create_organization",
      entity_type: "organization",
      entity_id: ORGANIZATION_ID,
      actor: "user",
    });
  });

  it("records no user content in the audit row beyond the fields it wrote", async () => {
    // EGC-AUDIT-004. `after_state` is the changed fields and nothing else — an
    // audit row is a record of a change, not a second copy of the object.
    const organizations = insertStub({
      data: { id: ORGANIZATION_ID, name: "Acme", description: null },
      error: null,
    });
    const audit = vi.fn<AuditInsert>(async () => ({ error: null }));
    vi.mocked(requireUser).mockResolvedValue({ supabase: client({ organizations }, audit), user: { id: USER_ID } } as never);

    await createOrganization(idleEntityEditState, form({ locale: "pt-BR", name: "Acme", description: "" }));

    expect(audit.mock.calls[0]![0]!.after_state).toEqual({ name: "Acme", description: null });
    expect(audit.mock.calls[0]![0]).not.toHaveProperty("before_state");
  });

  it("tells a duplicate name apart from an outage, in both locales", async () => {
    const duplicate = { data: null, error: { code: "23505", message: "duplicate key value" } };
    const pt = insertStub(duplicate);
    vi.mocked(requireUser).mockResolvedValue({ supabase: client({ organizations: pt }), user: { id: USER_ID } } as never);
    const ptResult = await createOrganization(idleEntityEditState, form({ locale: "pt-BR", name: "Acme", description: "" }));

    const en = insertStub(duplicate);
    vi.mocked(requireUser).mockResolvedValue({ supabase: client({ organizations: en }), user: { id: USER_ID } } as never);
    const enResult = await createOrganization(idleEntityEditState, form({ locale: "en", name: "Acme", description: "" }));

    expect(ptResult.message).toBe("Esse nome já existe.");
    expect(enResult.message).toBe("That name already exists.");
    // The refused input comes back: React 19 resets the form otherwise, and the
    // owner would be told to change a name they can no longer see.
    expect(ptResult.submitted).toMatchObject({ name: "Acme" });
  });

  it("refuses a name past the column bound before touching the database", async () => {
    const organizations = insertStub({ data: null, error: null });
    const supabase = client({ organizations });
    vi.mocked(requireUser).mockResolvedValue({ supabase, user: { id: USER_ID } } as never);

    const result = await createOrganization(
      idleEntityEditState,
      form({ locale: "pt-BR", name: "x".repeat(161), description: "" }),
    );

    expect(result.status).toBe("error");
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe("createContext", () => {
  it("persists the kind and audits the creation", async () => {
    const contexts = insertStub({
      data: { id: CONTEXT_ID, name: "Pessoal", description: null, kind: "personal" },
      error: null,
    });
    const audit = vi.fn<AuditInsert>(async () => ({ error: null }));
    vi.mocked(requireUser).mockResolvedValue({ supabase: client({ contexts }, audit), user: { id: USER_ID } } as never);

    const result = await createContext(
      idleEntityEditState,
      form({ locale: "pt-BR", name: "Pessoal", description: "", kind: "personal" }),
    );

    expect(result.status).toBe("success");
    expect(contexts.inserted).toMatchObject({ user_id: USER_ID, name: "Pessoal", kind: "personal" });
    expect(audit.mock.calls[0]![0]).toMatchObject({
      action_type: "create_context",
      entity_type: "context",
      entity_id: CONTEXT_ID,
      actor: "user",
    });
  });

  it("refuses a kind outside the three the CHECK allows", async () => {
    // The database would refuse it anyway; refusing here is what turns a raw
    // `23514` into a sentence the owner can act on.
    const contexts = insertStub({ data: null, error: null });
    const supabase = client({ contexts });
    vi.mocked(requireUser).mockResolvedValue({ supabase, user: { id: USER_ID } } as never);

    const result = await createContext(
      idleEntityEditState,
      form({ locale: "pt-BR", name: "Pessoal", description: "", kind: "family" }),
    );

    expect(result.status).toBe("error");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("refuses a name past 120, which is the contexts bound and not the other 160", async () => {
    // `contexts_name_check` is 120 where `organizations`, `projects` and
    // `people` are all 160. Reusing the wider bound would let the form accept a
    // value the database then refuses with no sentence to show for it.
    const contexts = insertStub({ data: null, error: null });
    const supabase = client({ contexts });
    vi.mocked(requireUser).mockResolvedValue({ supabase, user: { id: USER_ID } } as never);

    const result = await createContext(
      idleEntityEditState,
      form({ locale: "pt-BR", name: "x".repeat(121), description: "", kind: "work" }),
    );

    expect(result.status).toBe("error");
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe("updateOrganization and updateContext", () => {
  it("scope every statement to the caller and record what changed", async () => {
    const before = { name: "Acme", description: null };
    const after = { name: "Acme Ltd", description: "Cliente" };
    const organizations = tableStub({ data: before, error: null }, { data: after, error: null });
    const audit = vi.fn<AuditInsert>(async () => ({ error: null }));
    vi.mocked(requireUser).mockResolvedValue({ supabase: client({ organizations }, audit), user: { id: USER_ID } } as never);

    const result = await updateOrganization(
      idleEntityEditState,
      form({ organizationId: ORGANIZATION_ID, locale: "pt-BR", name: "Acme Ltd", description: "Cliente" }),
    );

    expect(result.status).toBe("success");
    expect(organizations.eqCalls.filter(([column]) => column === "user_id")).toHaveLength(2);
    expect(audit.mock.calls[0]![0]).toMatchObject({
      action_type: "update_organization",
      entity_type: "organization",
      before_state: before,
      after_state: after,
    });
  });

  it("report a vanished context as gone rather than as retryable", async () => {
    const contexts = tableStub({ data: null, error: null }, { data: null, error: null });
    vi.mocked(requireUser).mockResolvedValue({ supabase: client({ contexts }), user: { id: USER_ID } } as never);

    const result = await updateContext(
      idleEntityEditState,
      form({ contextId: CONTEXT_ID, locale: "en", name: "Personal", description: "", kind: "personal" }),
    );

    expect(result.message).toBe("This record no longer exists.");
  });

  it("scope the context update to the caller and audit it", async () => {
    const before = { name: "Pessoal", description: null, kind: "personal" };
    const after = { name: "Pessoal", description: null, kind: "custom" };
    const contexts = tableStub({ data: before, error: null }, { data: after, error: null });
    const audit = vi.fn<AuditInsert>(async () => ({ error: null }));
    vi.mocked(requireUser).mockResolvedValue({ supabase: client({ contexts }, audit), user: { id: USER_ID } } as never);

    await updateContext(
      idleEntityEditState,
      form({ contextId: CONTEXT_ID, locale: "pt-BR", name: "Pessoal", description: "", kind: "custom" }),
    );

    expect(contexts.eqCalls.filter(([column]) => column === "user_id")).toHaveLength(2);
    expect(audit.mock.calls[0]![0]).toMatchObject({
      action_type: "update_context",
      entity_type: "context",
      before_state: before,
      after_state: after,
    });
  });
});

describe("createOrganizationForSubject", () => {
  /** The two-table client the create-then-assign path needs. */
  function subjectClient(
    organizations: { stub: Record<string, unknown> },
    subject: { stub: Record<string, unknown> },
    table: "people" | "projects",
    audit = vi.fn<AuditInsert>(async () => ({ error: null })),
  ) {
    const auditStub = { insert: audit };
    return {
      supabase: {
        from: vi.fn((name: string) =>
          name === "audit_logs" ? auditStub : name === "organizations" ? organizations.stub : subject.stub,
        ),
      },
      audit,
    };
  }

  it("assigns the organization it just created to the person, under the owner predicate", async () => {
    // A4. The point of this action is that the new company is *selected*, not
    // merely creatable: an owner who has to create it, reopen the form and pick
    // it has been given two steps for one intention.
    const organizations = insertStub({ data: { id: ORGANIZATION_ID, name: "Acme" }, error: null });
    const people = tableStub({ data: null, error: null }, { data: { id: PERSON_ID }, error: null });
    const { supabase, audit } = subjectClient(organizations, people, "people");
    vi.mocked(requireUser).mockResolvedValue({ supabase, user: { id: USER_ID } } as never);

    const result = await createOrganizationForSubject(
      idleEntityEditState,
      form({ locale: "pt-BR", name: "Acme", description: "", subject: "person", subjectId: PERSON_ID }),
    );

    expect(result.status).toBe("success");
    expect(result.createdId).toBe(ORGANIZATION_ID);
    expect(result.message).toBe("Empresa criada e vinculada.");
    expect(people.updated).toMatchObject({ organization_id: ORGANIZATION_ID });
    expect(people.eqCalls).toContainEqual(["user_id", USER_ID]);
    expect(people.eqCalls).toContainEqual(["id", PERSON_ID]);
    // Two audit rows: the creation and the assignment are two facts.
    expect(audit).toHaveBeenCalledTimes(2);
    expect(audit.mock.calls[1]![0]).toMatchObject({ entity_type: "person", entity_id: PERSON_ID });
  });

  it("says the company exists but was not linked, rather than claiming an assignment that failed", async () => {
    // EGC-ORG-006 requires the honesty, not the atomicity. The organization
    // survives and is selectable next time; reporting a flat failure would send
    // the owner to create a duplicate.
    const organizations = insertStub({ data: { id: ORGANIZATION_ID, name: "Acme" }, error: null });
    const projects = tableStub({ data: null, error: null }, { data: null, error: { message: "conflict" } });
    const { supabase } = subjectClient(organizations, projects, "projects");
    vi.mocked(requireUser).mockResolvedValue({ supabase, user: { id: USER_ID } } as never);

    const result = await createOrganizationForSubject(
      idleEntityEditState,
      form({ locale: "en", name: "Acme", description: "", subject: "project", subjectId: PROJECT_ID }),
    );

    expect(result.status).toBe("error");
    expect(result.message).toBe("The company was created but not linked. Select it from the list.");
  });

  it("refuses a forged subject before touching the database", async () => {
    const organizations = insertStub({ data: null, error: null });
    const people = tableStub({ data: null, error: null }, { data: null, error: null });
    const { supabase } = subjectClient(organizations, people, "people");
    vi.mocked(requireUser).mockResolvedValue({ supabase, user: { id: USER_ID } } as never);

    const result = await createOrganizationForSubject(
      idleEntityEditState,
      form({ locale: "pt-BR", name: "Acme", description: "", subject: "task", subjectId: PERSON_ID }),
    );

    expect(result.status).toBe("error");
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
