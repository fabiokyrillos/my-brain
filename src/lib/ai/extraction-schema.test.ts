import { describe, expect, it } from "vitest";
import { LIFE_AREAS, entryExtractionSchema, storedEntryExtractionSchema } from "./extraction-schema";

const validExtraction = {
  language: "pt-BR",
  occurredAt: "2026-07-17T23:59:00.000Z",
  isRetroactive: false,
  summary: "Jaime solicitou a atualização e apresentação do relatório de Next Cruise.",
  concepts: ["request_received", "task"],
  contexts: [{ name: "Trabalho", confidence: 0.98, evidence: "pediu para atualizar", inferred: true }],
  organizations: [{ name: "Royal Caribbean", confidence: 0.78, evidence: "Next Cruise", inferred: true }],
  projects: [{ name: "Next Cruise", confidence: 0.99, evidence: "relatório de Next Cruise", inferred: false }],
  people: [
    { name: "Jaime", confidence: 0.99, evidence: "Jaime pediu", inferred: false, role: null },
    { name: "Maria", confidence: 0.99, evidence: "conversar com Maria", inferred: false, role: "gerente" },
  ],
  lifeArea: { kind: "work", confidence: 0.95 },
  taskCandidates: [
    {
      title: "Atualizar o relatório de Next Cruise",
      description: "Preparar os dados e o resultado para apresentação.",
      dueAt: "2026-07-17T23:59:00.000Z",
      waitingOn: null,
      parentIndex: null,
      confidence: 0.93,
      explicit: false,
    },
  ],
  pendingQuestions: [],
  eventCandidates: [],
  confidence: 0.91,
};

describe("entryExtractionSchema", () => {
  it("accepts the complete Jaime interpretation contract", () => {
    expect(entryExtractionSchema.safeParse(validExtraction).success).toBe(true);
  });

  it("rejects confidence outside the normalized range", () => {
    expect(entryExtractionSchema.safeParse({ ...validExtraction, confidence: 1.2 }).success).toBe(false);
  });

  it("rejects malformed occurred dates", () => {
    expect(entryExtractionSchema.safeParse({ ...validExtraction, occurredAt: "next friday" }).success).toBe(false);
  });
});

/*
 * Life Brain C.1 (`LB-C-002`, ADR-148). The model returns one life area per
 * entry, or null, from a closed vocabulary; the strict schema requires the key.
 * A row stored before C.1 has no key at all, and reading it must not fail —
 * that is what `storedEntryExtractionSchema` is for.
 */
describe("people[].role (Life Brain C.2, ADR-151)", () => {
  const withRole = (role: unknown) => ({
    ...validExtraction,
    people: [{ name: "Dr. Silva", confidence: 0.9, evidence: "Dr. Silva", inferred: false, role }],
  });

  it("accepts a role and null", () => {
    expect(entryExtractionSchema.safeParse(withRole("cardiologista")).success).toBe(true);
    expect(entryExtractionSchema.safeParse(withRole(null)).success).toBe(true);
  });

  it("refuses a blank or overlong role, and a person without the key from the model", () => {
    expect(entryExtractionSchema.safeParse(withRole(" ")).success).toBe(false);
    expect(entryExtractionSchema.safeParse(withRole("a".repeat(81))).success).toBe(false);
    const missing = { ...validExtraction, people: [{ name: "Ana", confidence: 0.9, evidence: "Ana", inferred: false }] };
    expect(entryExtractionSchema.safeParse(missing).success).toBe(false);
  });

  it("reads a reading stored before C.2 as a person with no role", () => {
    const stored = { ...validExtraction, people: [{ name: "Ana", confidence: 0.9, evidence: "Ana", inferred: false }] };
    const parsed = storedEntryExtractionSchema.parse(stored);
    expect(parsed.people[0]?.role).toBeNull();
  });
});

describe("lifeArea", () => {
  const withoutLifeArea: Record<string, unknown> = { ...validExtraction };
  delete withoutLifeArea.lifeArea;

  it("is a closed vocabulary of ten, with other as the escape and no legacy kinds", () => {
    expect([...LIFE_AREAS]).toEqual(["health", "family", "home", "finance", "travel", "work", "study", "leisure", "ideas", "other"]);
  });

  it("accepts every area and null", () => {
    for (const kind of LIFE_AREAS) {
      expect(entryExtractionSchema.safeParse({ ...validExtraction, lifeArea: { kind, confidence: 0.7 } }).success, kind).toBe(true);
    }
    expect(entryExtractionSchema.safeParse({ ...validExtraction, lifeArea: null }).success).toBe(true);
  });

  it("refuses an unknown area, a confidence outside 0–1 and a missing key from the model", () => {
    expect(entryExtractionSchema.safeParse({ ...validExtraction, lifeArea: { kind: "pets", confidence: 0.7 } }).success).toBe(false);
    expect(entryExtractionSchema.safeParse({ ...validExtraction, lifeArea: { kind: "personal", confidence: 0.7 } }).success).toBe(false);
    expect(entryExtractionSchema.safeParse({ ...validExtraction, lifeArea: { kind: "home", confidence: 1.2 } }).success).toBe(false);
    expect(entryExtractionSchema.safeParse(withoutLifeArea).success).toBe(false);
  });

  it("reads a row stored before C.1 as having no area, rather than refusing it", () => {
    const parsed = storedEntryExtractionSchema.safeParse(withoutLifeArea);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.lifeArea).toBeNull();
  });
});
