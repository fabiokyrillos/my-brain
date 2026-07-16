import { describe, expect, it } from "vitest";
import { entryExtractionSchema } from "./extraction-schema";

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
    { name: "Jaime", confidence: 0.99, evidence: "Jaime pediu", inferred: false },
    { name: "Maria", confidence: 0.99, evidence: "conversar com Maria", inferred: false },
  ],
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
