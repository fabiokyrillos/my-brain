import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireUser } from "@/lib/auth/require-user";

import { createOrganizationForSubject, linkPersonOrganization } from "./actions";
import { idleEntityEditState } from "./edit-state";

/**
 * `2P-PERSON-001`/`-002`/`-003` — the company, assigned from the person's own
 * section.
 *
 * ## Why this action is narrow, and why that is the test
 *
 * The obvious implementation was to reuse `updatePerson` from the company
 * control by carrying the stored name and notes as hidden inputs. Those are
 * values rendered at some earlier moment, so a note edited in between would be
 * reverted by a company change — silently, with the audit row recording the
 * revert as intentional. That is the cross-section clobber slice 2P.5 had to
 * repair one domain over, and the first case below is what stops it recurring:
 * the payload may contain the company and nothing else.
 *
 * ## The code, and why it is not a message comparison
 *
 * `2P-PERSON-003` asks the created-but-not-linked outcome to be reported
 * distinctly and to not invite a duplicate retry. Reporting it is the action's
 * job and shipped before this slice; refusing the retry is the surface's, and it
 * is behaviour rather than wording — the dialog returns to the selector. That
 * branch needs a token, because comparing against a localized sentence would
 * break the first time either translation is reworded, and the symptom would be
 * a create field left in front of the owner with a name that has already worked.
 *
 * The harness is local, matching `actions.test.ts` and `associations.test.ts`,
 * which each carry their own for the same reason: a shared one would have to
 * serve every table shape in the feature and would stop describing any of them.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PERSON_ID = "33333333-3333-4333-8333-333333333333";
const ORGANIZATION_ID = "44444444-4444-4444-8444-444444444444";

type Result = { data: unknown; error: { code?: string; message?: string } | null };
type AuditInsert = (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;

/** Records every `eq` so ownership is asserted rather than assumed. */
function tableStub(read: Result, write: Result) {
  const eqCalls: Array<[string, unknown]> = [];
  let isUpdate = false;
  const stub: Record<string, unknown> = {};
  stub.select = vi.fn(() => stub);
  stub.update = vi.fn(() => { isUpdate = true; return stub; });
  stub.insert = vi.fn(() => stub);
  stub.eq = vi.fn((column: string, value: unknown) => { eqCalls.push([column, value]); return stub; });
  stub.maybeSingle = vi.fn(async () => (isUpdate ? write : read));
  return { stub, eqCalls, get updated() { return (stub.update as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]; } };
}

function insertStub(result: Result) {
  const stub: Record<string, unknown> = {};
  stub.insert = vi.fn(() => stub);
  stub.select = vi.fn(() => stub);
  stub.maybeSingle = vi.fn(async () => result);
  return { stub };
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

const companyForm = (organizationId: string) => form({
  locale: "pt-BR",
  personId: PERSON_ID,
  organizationId,
});

beforeEach(() => vi.clearAllMocks());

describe("linkPersonOrganization", () => {
  it("writes only the company, and proves ownership on both statements", async () => {
    const people = tableStub(
      { data: { organization_id: null }, error: null },
      { data: { organization_id: ORGANIZATION_ID }, error: null },
    );
    const audit = vi.fn<AuditInsert>(async () => ({ error: null }));
    vi.mocked(requireUser).mockResolvedValue({ supabase: client({ people }, audit), user: { id: USER_ID } } as never);

    const result = await linkPersonOrganization(idleEntityEditState, companyForm(ORGANIZATION_ID));

    expect(result.status).toBe("success");
    expect(result.message).toBe("Empresa atualizada.");
    // The payload is the company and the timestamp — never a name or a note,
    // which this control never showed and therefore must not be able to erase.
    expect(Object.keys(people.updated as Record<string, unknown>).sort()).toEqual([
      "organization_id",
      "updated_at",
    ]);
    // RLS is the trust boundary; the predicate is the belt to its braces. Twice:
    // once on the pre-read, once on the write.
    expect(people.eqCalls).toContainEqual(["user_id", USER_ID]);
    expect(people.eqCalls.filter(([column]) => column === "user_id")).toHaveLength(2);
    expect(audit.mock.calls[0]![0]).toMatchObject({
      action_type: "update_person",
      entity_type: "person",
      entity_id: PERSON_ID,
      actor: "user",
      before_state: { organization_id: null },
      after_state: { organization_id: ORGANIZATION_ID },
    });
  });

  it("records which company was replaced, not only which one is now set", async () => {
    // The assignment overwrites, and an audit row carrying only the result could
    // not answer the question the row exists for.
    const previous = "99999999-9999-4999-8999-999999999999";
    const people = tableStub(
      { data: { organization_id: previous }, error: null },
      { data: { organization_id: ORGANIZATION_ID }, error: null },
    );
    const audit = vi.fn<AuditInsert>(async () => ({ error: null }));
    vi.mocked(requireUser).mockResolvedValue({ supabase: client({ people }, audit), user: { id: USER_ID } } as never);

    await linkPersonOrganization(idleEntityEditState, companyForm(ORGANIZATION_ID));

    expect(audit.mock.calls[0]![0]).toMatchObject({ before_state: { organization_id: previous } });
  });

  it("lets the owner clear the company, because leaving a job is a fact", async () => {
    const people = tableStub(
      { data: { organization_id: ORGANIZATION_ID }, error: null },
      { data: { organization_id: null }, error: null },
    );
    vi.mocked(requireUser).mockResolvedValue({ supabase: client({ people }), user: { id: USER_ID } } as never);

    const result = await linkPersonOrganization(idleEntityEditState, companyForm(""));

    expect(result.status).toBe("success");
    expect(people.updated).toMatchObject({ organization_id: null });
  });

  it("reports a vanished person as gone rather than as a retryable failure", async () => {
    const people = tableStub({ data: null, error: null }, { data: null, error: null });
    vi.mocked(requireUser).mockResolvedValue({ supabase: client({ people }), user: { id: USER_ID } } as never);

    const result = await linkPersonOrganization(idleEntityEditState, companyForm(ORGANIZATION_ID));

    expect(result.status).toBe("error");
    expect(result.message).toBe("Este registro não existe mais.");
  });

  it("refuses a personId that is not a uuid before touching the database", async () => {
    const people = tableStub({ data: null, error: null }, { data: null, error: null });
    const supabase = client({ people });
    vi.mocked(requireUser).mockResolvedValue({ supabase, user: { id: USER_ID } } as never);

    const result = await linkPersonOrganization(
      idleEntityEditState,
      form({ locale: "pt-BR", personId: "not-a-uuid", organizationId: ORGANIZATION_ID }),
    );

    expect(result.status).toBe("error");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("refuses a forged extra field rather than ignoring it", async () => {
    // `personOrganizationSchema` is `.strict()`. A submission carrying `name`
    // would be an attempt at a column this control does not own.
    const people = tableStub({ data: null, error: null }, { data: null, error: null });
    const supabase = client({ people });
    vi.mocked(requireUser).mockResolvedValue({ supabase, user: { id: USER_ID } } as never);

    const result = await linkPersonOrganization(
      idleEntityEditState,
      form({ locale: "pt-BR", personId: PERSON_ID, organizationId: ORGANIZATION_ID, name: "Forged" }),
    );

    expect(result.status).toBe("error");
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe("the failure vocabulary carries a code for the outcomes a surface reshapes", () => {
  it("codes the created-but-not-linked refusal, in both locales", async () => {
    for (const [locale, message] of [
      ["pt-BR", "A empresa foi criada, mas não foi vinculada. Selecione-a na lista."],
      ["en", "The company was created but not linked. Select it from the list."],
    ] as const) {
      const organizations = insertStub({ data: { id: ORGANIZATION_ID, name: "Acme" }, error: null });
      const people = tableStub({ data: null, error: null }, { data: null, error: { message: "conflict" } });
      const supabase = client({ organizations, people });
      vi.mocked(requireUser).mockResolvedValue({ supabase, user: { id: USER_ID } } as never);

      const result = await createOrganizationForSubject(
        idleEntityEditState,
        form({ locale, name: "Acme", description: "", subject: "person", subjectId: PERSON_ID }),
      );

      expect(result.code).toBe("createdButNotLinked");
      expect(result.message).toBe(message);
    }
  });

  it("leaves the refusals no surface reshapes without one", async () => {
    // Not vacuous in the other direction: a code on every failure would make the
    // field meaningless and would invite a surface to branch on one that carries
    // no distinct behaviour.
    const people = tableStub({ data: null, error: null }, { data: null, error: null });
    vi.mocked(requireUser).mockResolvedValue({ supabase: client({ people }), user: { id: USER_ID } } as never);

    const result = await linkPersonOrganization(idleEntityEditState, companyForm(ORGANIZATION_ID));

    expect(result.status).toBe("error");
    expect(result.code ?? null).toBeNull();
  });
});
