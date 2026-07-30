import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireUser } from "@/lib/auth/require-user";

import { updatePerson, updateProject } from "./actions";
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
