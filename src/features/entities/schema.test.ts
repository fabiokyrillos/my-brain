import { describe, expect, it } from "vitest";

import { personUpdateSchema, projectUpdateSchema, PROJECT_STATUSES } from "./schema";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const PERSON_ID = "22222222-2222-4222-8222-222222222222";
const ORGANIZATION_ID = "33333333-3333-4333-8333-333333333333";

function project(overrides: Record<string, unknown> = {}) {
  return {
    projectId: PROJECT_ID,
    locale: "pt-BR",
    name: "Atlas",
    description: "Migração do faturamento",
    status: "active",
    organizationId: ORGANIZATION_ID,
    ...overrides,
  };
}

function person(overrides: Record<string, unknown> = {}) {
  return {
    personId: PERSON_ID,
    locale: "en",
    name: "Marina",
    notes: "Prefers email",
    organizationId: ORGANIZATION_ID,
    ...overrides,
  };
}

describe("projectUpdateSchema", () => {
  it("accepts a complete edit", () => {
    expect(projectUpdateSchema.safeParse(project()).success).toBe(true);
  });

  it("mirrors projects_name_check exactly", () => {
    // 1–160 after trimming. A looser bound would turn a long name into a
    // database error the form cannot explain; a tighter one would refuse a name
    // the column accepts.
    expect(projectUpdateSchema.safeParse(project({ name: "a".repeat(160) })).success).toBe(true);
    expect(projectUpdateSchema.safeParse(project({ name: "a".repeat(161) })).success).toBe(false);
    expect(projectUpdateSchema.safeParse(project({ name: "   " })).success).toBe(false);
  });

  it("accepts every status the column allows and nothing else", () => {
    for (const status of PROJECT_STATUSES) {
      expect(projectUpdateSchema.safeParse(project({ status })).success).toBe(true);
    }
    expect(projectUpdateSchema.safeParse(project({ status: "cancelled" })).success).toBe(false);
  });

  it("stores a cleared description as null, never as an empty string", () => {
    // The column is nullable with no default and the detail page falls back on
    // `null` to render its placeholder. An empty string would be a row that is
    // neither absent nor present: the placeholder stops appearing and nothing
    // takes its place.
    const parsed = projectUpdateSchema.safeParse(project({ description: "   " }));
    expect(parsed.success && parsed.data.description).toBeNull();
  });

  it("reads an unselected company as no company", () => {
    const parsed = projectUpdateSchema.safeParse(project({ organizationId: "" }));
    expect(parsed.success && parsed.data.organizationId).toBeNull();
  });

  it("refuses a company that is not an id", () => {
    expect(projectUpdateSchema.safeParse(project({ organizationId: "acme" })).success).toBe(false);
  });

  it("refuses an unknown field rather than ignoring it", () => {
    // `.strict()`: a forged control must be a rejection, not a silent drop —
    // the same posture `profileSchema` takes.
    expect(projectUpdateSchema.safeParse(project({ userId: "someone-else" })).success).toBe(false);
  });

  it("refuses an id that is not a uuid", () => {
    expect(projectUpdateSchema.safeParse(project({ projectId: "1" })).success).toBe(false);
  });
});

describe("personUpdateSchema", () => {
  it("accepts a complete edit", () => {
    expect(personUpdateSchema.safeParse(person()).success).toBe(true);
  });

  it("stores cleared notes as null", () => {
    const parsed = personUpdateSchema.safeParse(person({ notes: "" }));
    expect(parsed.success && parsed.data.notes).toBeNull();
  });

  it("mirrors people_name_check exactly", () => {
    expect(personUpdateSchema.safeParse(person({ name: "a".repeat(160) })).success).toBe(true);
    expect(personUpdateSchema.safeParse(person({ name: "a".repeat(161) })).success).toBe(false);
  });

  it("has no status field, because the column has none", () => {
    expect(personUpdateSchema.safeParse(person({ status: "active" })).success).toBe(false);
  });

  it("refuses an unknown field rather than ignoring it", () => {
    expect(personUpdateSchema.safeParse(person({ userId: "someone-else" })).success).toBe(false);
  });
});
