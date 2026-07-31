import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireUser } from "@/lib/auth/require-user";

import { idleEntityEditState } from "./edit-state";
import {
  createOwnerRelationship,
  endOwnerRelationship,
  updateOwnerRelationship,
} from "./relationships";

/**
 * The only writer `public.person_relationships` has ever had.
 *
 * The cases are written around the ways this can be wrong and cost the owner
 * something real: a relationship written against somebody else's person, a
 * "removal" that actually deletes, an end date that moves on a second click, and
 * an audit row that copies the owner's private sentence about another person
 * into a ledger.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PERSON_ID = "22222222-2222-4222-8222-222222222222";
const RELATIONSHIP_ID = "33333333-3333-4333-8333-333333333333";

type Result = { data: unknown; error: { code?: string; message?: string } | null };
type AuditInsert = (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;

/**
 * A table stub that records every predicate and every payload.
 *
 * `results` is consumed in order, one per `maybeSingle()`, because these actions
 * make **several** round trips to the same table — the ownership probe, the
 * duplicate probe, then the write — and a stub that returned one fixed value for
 * all of them could not tell the three apart.
 */
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

const createForm = (overrides: Record<string, string> = {}) =>
  form({
    locale: "pt-BR",
    personId: PERSON_ID,
    relationshipType: "spouse",
    description: "",
    ...overrides,
  });

beforeEach(() => vi.clearAllMocks());

describe("createOwnerRelationship", () => {
  it("writes a relationship to the owner, with a null related_person_id", async () => {
    // EGC-REL-001. The null is not missing data — it is what "related to me"
    // means in this schema, and it is the only kind of relationship this slice
    // authors. A sentinel uuid here would need a migration and a backfill.
    const people = tableStub({ data: { id: PERSON_ID }, error: null });
    const relationships = tableStub(
      { data: null, error: null },
      { data: { id: RELATIONSHIP_ID, relationship_type: "spouse", description: null }, error: null },
    );
    const { supabase, audit } = client({ people, person_relationships: relationships });
    vi.mocked(requireUser).mockResolvedValue({ supabase, user: { id: USER_ID } } as never);

    const result = await createOwnerRelationship(idleEntityEditState, createForm());

    expect(result.status).toBe("success");
    expect(relationships.payloads[0]).toMatchObject({
      user_id: USER_ID,
      person_id: PERSON_ID,
      related_person_id: null,
      relationship_type: "spouse",
      // EGC-REL-010: a user-entered fact is not a scored inference.
      confidence: 1,
    });
    expect(audit.mock.calls[0]![0]).toMatchObject({
      action_type: "create_person_relationship",
      entity_type: "person_relationship",
      entity_id: RELATIONSHIP_ID,
      actor: "user",
    });
  });

  it("keeps the owner's own sentence out of the ledger", async () => {
    // `description` is user content about another human being. That it changed
    // is a fact the ledger should hold; what it said is not.
    const people = tableStub({ data: { id: PERSON_ID }, error: null });
    const relationships = tableStub(
      { data: null, error: null },
      { data: { id: RELATIONSHIP_ID, relationship_type: "sibling", description: "brigamos em 2019" }, error: null },
    );
    const { supabase, audit } = client({ people, person_relationships: relationships });
    vi.mocked(requireUser).mockResolvedValue({ supabase, user: { id: USER_ID } } as never);

    await createOwnerRelationship(
      idleEntityEditState,
      createForm({ relationshipType: "sibling", description: "brigamos em 2019" }),
    );

    expect(JSON.stringify(audit.mock.calls[0]![0])).not.toContain("brigamos");
  });

  it("refuses a person the caller does not own, with a sentence rather than a 23503", async () => {
    // EGC-ASSOC-007. The composite FK would refuse it anyway; this check exists
    // so the owner reads a sentence instead of a constraint name.
    const people = tableStub({ data: null, error: null });
    const relationships = tableStub();
    const { supabase } = client({ people, person_relationships: relationships });
    vi.mocked(requireUser).mockResolvedValue({ supabase, user: { id: USER_ID } } as never);

    const result = await createOwnerRelationship(idleEntityEditState, createForm());

    expect(result.status).toBe("error");
    expect(result.message).toBe("Este registro não existe mais.");
    expect(relationships.payloads).toHaveLength(0);
  });

  it("scopes the ownership probe to the caller, not only to the person id", async () => {
    const people = tableStub({ data: { id: PERSON_ID }, error: null });
    const relationships = tableStub(
      { data: null, error: null },
      { data: { id: RELATIONSHIP_ID, relationship_type: "spouse", description: null }, error: null },
    );
    const { supabase } = client({ people, person_relationships: relationships });
    vi.mocked(requireUser).mockResolvedValue({ supabase, user: { id: USER_ID } } as never);

    await createOwnerRelationship(idleEntityEditState, createForm());

    expect(people.calls).toContainEqual(["user_id", USER_ID]);
    expect(people.calls).toContainEqual(["id", PERSON_ID]);
  });

  it("refuses a second live relationship of the same type, which no index enforces", async () => {
    // `person_contexts` and `person_projects` each carry a partial unique index
    // on the live pair; `person_relationships` carries **no unique index at
    // all** — only the plain `(user_id, person_id, valid_until)` index. So this
    // refusal is application-only, with no `23505` behind it, and it is the only
    // thing standing between the owner and two live "spouse" rows.
    const people = tableStub({ data: { id: PERSON_ID }, error: null });
    const relationships = tableStub({ data: { id: RELATIONSHIP_ID }, error: null });
    const { supabase } = client({ people, person_relationships: relationships });
    vi.mocked(requireUser).mockResolvedValue({ supabase, user: { id: USER_ID } } as never);

    const result = await createOwnerRelationship(idleEntityEditState, createForm());

    expect(result.status).toBe("error");
    expect(result.message).toBe("Isso já está registrado.");
    expect(relationships.payloads).toHaveLength(0);
    // The probe looks at live rows only, so an *ended* spouse relationship does
    // not block recording a new one.
    expect(relationships.isNull).toContain("valid_until");
  });

  it("refuses a relationship type outside the vocabulary before touching the database", async () => {
    const people = tableStub();
    const relationships = tableStub();
    const { supabase } = client({ people, person_relationships: relationships });
    vi.mocked(requireUser).mockResolvedValue({ supabase, user: { id: USER_ID } } as never);

    const result = await createOwnerRelationship(
      idleEntityEditState,
      createForm({ relationshipType: "godparent" }),
    );

    expect(result.status).toBe("error");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("refuses a description past 500 and echoes the refused input back", async () => {
    const { supabase } = client({ people: tableStub(), person_relationships: tableStub() });
    vi.mocked(requireUser).mockResolvedValue({ supabase, user: { id: USER_ID } } as never);

    const result = await createOwnerRelationship(
      idleEntityEditState,
      createForm({ description: "x".repeat(501) }),
    );

    expect(result.status).toBe("error");
    expect(result.submitted?.relationshipType).toBe("spouse");
  });
});

describe("updateOwnerRelationship", () => {
  it("changes the type in place rather than ending and recreating", async () => {
    // EGC-REL-008. Getting a category wrong is a correction. Treating it as an
    // end plus a new relationship would write a history saying something
    // happened between two people when nothing did.
    const relationships = tableStub(
      { data: { relationship_type: "friend", description: null }, error: null },
      { data: { relationship_type: "sibling", description: null }, error: null },
    );
    const { supabase, audit } = client({ person_relationships: relationships });
    vi.mocked(requireUser).mockResolvedValue({ supabase, user: { id: USER_ID } } as never);

    const result = await updateOwnerRelationship(
      idleEntityEditState,
      form({
        locale: "pt-BR",
        relationshipId: RELATIONSHIP_ID,
        personId: PERSON_ID,
        relationshipType: "sibling",
        description: "",
      }),
    );

    expect(result.status).toBe("success");
    expect(relationships.payloads[0]).toMatchObject({ relationship_type: "sibling" });
    expect(relationships.payloads[0]).not.toHaveProperty("valid_until");
    expect(audit.mock.calls[0]![0]).toMatchObject({
      action_type: "update_person_relationship",
      before_state: { relationship_type: "friend" },
      after_state: { relationship_type: "sibling" },
    });
  });

  it("refuses to edit a relationship that has already ended", async () => {
    const relationships = tableStub({ data: null, error: null });
    const { supabase } = client({ person_relationships: relationships });
    vi.mocked(requireUser).mockResolvedValue({ supabase, user: { id: USER_ID } } as never);

    const result = await updateOwnerRelationship(
      idleEntityEditState,
      form({
        locale: "en",
        relationshipId: RELATIONSHIP_ID,
        personId: PERSON_ID,
        relationshipType: "friend",
        description: "",
      }),
    );

    expect(result.message).toBe("This record no longer exists.");
    expect(relationships.isNull).toContain("valid_until");
  });
});

describe("endOwnerRelationship", () => {
  it("sets valid_until and never deletes", async () => {
    // EGC-REL-007 and EGC-DEC-2. The row surviving is what lets the product
    // still hold "we were married until 2019".
    const relationships = tableStub({ data: { id: RELATIONSHIP_ID, relationship_type: "spouse" }, error: null });
    const { supabase, audit } = client({ person_relationships: relationships });
    vi.mocked(requireUser).mockResolvedValue({ supabase, user: { id: USER_ID } } as never);

    const result = await endOwnerRelationship(
      idleEntityEditState,
      form({ locale: "pt-BR", relationshipId: RELATIONSHIP_ID, personId: PERSON_ID }),
    );

    expect(result.status).toBe("success");
    expect(relationships.stub.update).toHaveBeenCalledTimes(1);
    expect(relationships.stub.delete).toBeUndefined();
    expect(relationships.payloads[0]).toHaveProperty("valid_until");
    expect(audit.mock.calls[0]![0]).toMatchObject({
      action_type: "end_person_relationship",
      after_state: { relationship_type: "spouse", ended: true },
    });
  });

  it("only ends a live row, so a second click cannot move the end date", async () => {
    // Without `.is("valid_until", null)` on the update, a double submission
    // would overwrite the first end date with a later one and quietly change
    // when the relationship ended.
    const relationships = tableStub({ data: { id: RELATIONSHIP_ID, relationship_type: "spouse" }, error: null });
    const { supabase } = client({ person_relationships: relationships });
    vi.mocked(requireUser).mockResolvedValue({ supabase, user: { id: USER_ID } } as never);

    await endOwnerRelationship(
      idleEntityEditState,
      form({ locale: "pt-BR", relationshipId: RELATIONSHIP_ID, personId: PERSON_ID }),
    );

    expect(relationships.isNull).toContain("valid_until");
    expect(relationships.calls).toContainEqual(["user_id", USER_ID]);
    expect(relationships.calls).toContainEqual(["person_id", PERSON_ID]);
  });

  it("reports an already-ended relationship as gone rather than as a failure", async () => {
    const relationships = tableStub({ data: null, error: null });
    const { supabase } = client({ person_relationships: relationships });
    vi.mocked(requireUser).mockResolvedValue({ supabase, user: { id: USER_ID } } as never);

    const result = await endOwnerRelationship(
      idleEntityEditState,
      form({ locale: "en", relationshipId: RELATIONSHIP_ID, personId: PERSON_ID }),
    );

    expect(result.message).toBe("This record no longer exists.");
  });
});
