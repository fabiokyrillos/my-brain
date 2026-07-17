import { describe, expect, it, vi } from "vitest";

type SchemaModule = {
  interpretationPatchSchema?: {
    safeParse: (value: unknown) => { success: boolean; data?: unknown };
  };
};

const modulePath = `./${"schema"}.ts`;
const schemaModule = await vi.importActual<SchemaModule>(modulePath).catch(() => ({}));

const validPatch = {
  entryId: "11111111-1111-4111-8111-111111111111",
  expectedVersion: 2,
  operationKey: "22222222-2222-4222-8222-222222222222",
  summary: "Resumo corrigido",
  concepts: ["decision", "person_note"],
  occurredAt: "2026-07-17T15:00:00-03:00",
  extractedDates: [{ value: "2026-07-20", label: "prazo citado" }],
  entityLinks: [{
    entityType: "person",
    entityId: "33333333-3333-4333-8333-333333333333",
    mention: "Marina",
    confidence: 1,
  }],
  classifications: {
    summary: "fact",
    concepts: "interpretation",
    occurredAt: "fact",
    entities: "fact",
  },
  pendingQuestions: [{ question: "Foi na terça?", reason: "Data ambígua", confidence: 0.5 }],
  correctionReason: "A pessoa e a data estavam incorretas.",
  recordOnly: false,
};

describe("interpretation correction patch", () => {
  it("accepts a complete editable immutable-revision patch", () => {
    expect(schemaModule.interpretationPatchSchema).toBeDefined();
    expect(schemaModule.interpretationPatchSchema?.safeParse(validPatch).success).toBe(true);
  });

  it.each([
    { ...validPatch, expectedVersion: 0 },
    { ...validPatch, operationKey: "not-a-uuid" },
    { ...validPatch, summary: "" },
    { ...validPatch, concepts: [] },
    { ...validPatch, occurredAt: "next Friday" },
    { ...validPatch, entityLinks: [{ ...validPatch.entityLinks[0], entityId: "not-a-uuid" }] },
    { ...validPatch, classifications: { ...validPatch.classifications, summary: "opinion" } },
    { ...validPatch, entityLinks: Array.from({ length: 101 }, () => validPatch.entityLinks[0]) },
  ])("rejects malformed or unbounded correction input", (patch) => {
    expect(schemaModule.interpretationPatchSchema?.safeParse(patch).success).toBe(false);
  });

  it("rejects duplicate entity links", () => {
    const duplicate = { ...validPatch, entityLinks: [validPatch.entityLinks[0], validPatch.entityLinks[0]] };
    expect(schemaModule.interpretationPatchSchema?.safeParse(duplicate).success).toBe(false);
  });
});
