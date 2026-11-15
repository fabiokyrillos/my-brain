import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireUser } from "@/lib/auth/require-user";

import { idleEntityEditState } from "./edit-state";
import { createPersonLink, endPersonLink } from "./relationships";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const LAURA = "22222222-2222-4222-8222-222222222222";
const CAMILA = "33333333-3333-4333-8333-333333333333";
const LINK = "44444444-4444-4444-8444-444444444444";

type Result = { data: unknown; error: { message: string } | null };

/** A chainable stub whose terminal calls resolve to the queued results, in order. */
function chain(results: { awaited?: Result[]; single?: Result[] }) {
  const awaited = [...(results.awaited ?? [])];
  const single = [...(results.single ?? [])];
  const calls: Array<[string, ...unknown[]]> = [];
  const stub: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "in", "or", "not", "update", "insert"]) {
    stub[method] = vi.fn((...args: unknown[]) => {
      calls.push([method, ...args]);
      return stub;
    });
  }
  stub.maybeSingle = vi.fn(async () => single.shift() ?? { data: null, error: null });
  stub.then = (resolve: (value: Result) => unknown) => resolve(awaited.shift() ?? { data: [], error: null });
  return { stub, calls };
}

function setup(tables: Record<string, ReturnType<typeof chain>>) {
  const audit = vi.fn(async () => ({ error: null }));
  vi.mocked(requireUser).mockResolvedValue({
    supabase: { from: vi.fn((table: string) => (table === "audit_logs" ? { insert: audit } : tables[table]!.stub)) },
    user: { id: USER_ID },
  } as never);
  return { audit };
}

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const createForm = (overrides: Record<string, string> = {}) =>
  form({ locale: "pt-BR", personId: LAURA, otherPersonId: CAMILA, relationshipType: "parent", ...overrides });

beforeEach(() => vi.clearAllMocks());

describe("createPersonLink (Life Brain E.2)", () => {
  it("writes '<other> is <type> of <this person>' and audits it", async () => {
    const people = chain({ awaited: [{ data: [{ id: LAURA }, { id: CAMILA }], error: null }] });
    const relationships = chain({ awaited: [{ data: [], error: null }], single: [{ data: { id: LINK }, error: null }] });
    const { audit } = setup({ people, person_relationships: relationships });

    const result = await createPersonLink(idleEntityEditState, createForm());

    expect(result.status).toBe("success");
    const insert = relationships.calls.find(([method]) => method === "insert");
    expect(insert?.[1]).toMatchObject({
      user_id: USER_ID,
      person_id: CAMILA,
      related_person_id: LAURA,
      relationship_type: "parent",
    });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      action_type: "create_person_relationship",
      after_state: { person_id: CAMILA, related_person_id: LAURA, relationship_type: "parent" },
    }));
  });

  it("refuses to link a person to themselves, before any read", async () => {
    const people = chain({});
    setup({ people, person_relationships: chain({}) });
    const result = await createPersonLink(idleEntityEditState, createForm({ otherPersonId: LAURA }));
    expect(result).toMatchObject({ status: "error", message: "Uma pessoa não pode ser ligada a ela mesma." });
    expect(people.calls).toHaveLength(0);
  });

  it("refuses a type that does not read both ways between two people", async () => {
    setup({ people: chain({}), person_relationships: chain({}) });
    const result = await createPersonLink(idleEntityEditState, createForm({ relationshipType: "manager" }));
    expect(result.status).toBe("error");
  });

  it("refuses a person who is not the owner's", async () => {
    const people = chain({ awaited: [{ data: [{ id: LAURA }], error: null }] });
    const relationships = chain({});
    setup({ people, person_relationships: relationships });
    const result = await createPersonLink(idleEntityEditState, createForm());
    expect(result).toMatchObject({ status: "error", message: "Não encontramos essa pessoa na sua conta." });
    expect(relationships.calls.find(([method]) => method === "insert")).toBeUndefined();
  });

  it("refuses the same link written from the other person's page", async () => {
    const people = chain({ awaited: [{ data: [{ id: LAURA }, { id: CAMILA }], error: null }] });
    // Stored: Laura is child of Camila. Asked: Camila is parent of Laura.
    const relationships = chain({
      awaited: [{ data: [{ id: LINK, person_id: LAURA, related_person_id: CAMILA, relationship_type: "child" }], error: null }],
    });
    setup({ people, person_relationships: relationships });
    const result = await createPersonLink(idleEntityEditState, createForm());
    expect(result).toMatchObject({ status: "error", message: "Essa ligação já está registrada." });
    expect(relationships.calls.find(([method]) => method === "insert")).toBeUndefined();
  });
});

describe("endPersonLink (Life Brain E.2)", () => {
  it("sets valid_until on a link this person is an end of, and audits both ends", async () => {
    const relationships = chain({
      single: [{ data: { id: LINK, person_id: CAMILA, related_person_id: LAURA, relationship_type: "parent" }, error: null }],
    });
    const { audit } = setup({ person_relationships: relationships });

    const result = await endPersonLink(idleEntityEditState, form({ locale: "en", personId: LAURA, linkId: LINK }));

    expect(result).toMatchObject({ status: "success", message: "Link ended. The history is still kept." });
    const update = relationships.calls.find(([method]) => method === "update");
    expect(Object.keys(update?.[1] as object)).toEqual(["valid_until"]);
    // Never a relationship to the owner, and only from one of its two ends.
    expect(relationships.calls).toContainEqual(["not", "related_person_id", "is", null]);
    expect(relationships.calls).toContainEqual(["or", `person_id.eq.${LAURA},related_person_id.eq.${LAURA}`]);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action_type: "end_person_relationship" }));
  });

  it("says so when there is no such live link", async () => {
    setup({ person_relationships: chain({ single: [{ data: null, error: null }] }) });
    const result = await endPersonLink(idleEntityEditState, form({ locale: "pt-BR", personId: LAURA, linkId: LINK }));
    expect(result).toMatchObject({ status: "error", message: "Essa ligação já não existe." });
  });
});
