import { describe, expect, it } from "vitest";
import {
  derivePendingPersonCandidates,
  normalizePersonCandidateName,
  parseExtractedPeople,
} from "./person-candidate-contract";

describe("parseExtractedPeople", () => {
  it("accepts bounded extracted people and preserves their source index", () => {
    expect(parseExtractedPeople([
      { name: "  Giovanna   (Gigi) ", evidence: " pra Giovanna(gigi) ", confidence: 1 },
      { name: "Jaime", confidence: 0.8 },
    ])).toEqual([
      { candidateIndex: 0, name: "Giovanna (Gigi)", evidence: "pra Giovanna(gigi)", confidence: 1, role: null },
      { candidateIndex: 1, name: "Jaime", evidence: "", confidence: 0.8, role: null },
    ]);
  });

  it("drops malformed and blank values without shifting valid indexes", () => {
    expect(parseExtractedPeople([
      null,
      { name: " " },
      { name: "Marina", confidence: 2 },
      { name: "João", evidence: 7, confidence: 0.9 },
    ])).toEqual([
      { candidateIndex: 2, name: "Marina", evidence: "", confidence: 1, role: null },
      { candidateIndex: 3, name: "João", evidence: "", confidence: 0.9, role: null },
    ]);
  });

  it("returns an empty list for non-arrays", () => {
    expect(parseExtractedPeople({ name: "Marina" })).toEqual([]);
  });
});

describe("derivePendingPersonCandidates", () => {
  it("keeps only unmatched, unresolved candidate indexes", () => {
    expect(derivePendingPersonCandidates({
      extractedPeople: [
        { name: "Jaime", evidence: "para Jaime", confidence: 1 },
        { name: "Giovanna (Gigi)", evidence: "pra Giovanna(gigi)", confidence: 1 },
      ],
      resolvedCandidateIndexes: new Set([0]),
      linkedNormalizedNames: new Set(["jaime"]),
    })).toEqual([{
      candidateIndex: 1,
      originalName: "Giovanna (Gigi)",
      proposedName: "Giovanna (Gigi)",
      evidence: "pra Giovanna(gigi)",
      confidence: 1,
      role: null,
    }]);
  });

  it("deduplicates equal unresolved names while preserving the first index", () => {
    expect(derivePendingPersonCandidates({
      extractedPeople: [{ name: "João" }, { name: "  JOÃO  " }, { name: "Maria" }],
      resolvedCandidateIndexes: new Set(),
      linkedNormalizedNames: new Set(),
    }).map(({ candidateIndex, originalName }) => ({ candidateIndex, originalName }))).toEqual([
      { candidateIndex: 0, originalName: "João" },
      { candidateIndex: 2, originalName: "Maria" },
    ]);
  });

  it("compares canonical and alias names with Unicode-aware case folding", () => {
    expect(normalizePersonCandidateName("  JOÃO  ")).toBe(normalizePersonCandidateName("João"));
    expect(derivePendingPersonCandidates({
      extractedPeople: [{ name: "João" }],
      resolvedCandidateIndexes: new Set(),
      linkedNormalizedNames: new Set([normalizePersonCandidateName("JOÃO")]),
    })).toEqual([]);
  });
});

describe("Life Brain C.2: a person's role", () => {
  it("is read, trimmed and bounded, and is null when absent or blank", () => {
    expect(parseExtractedPeople([
      { name: "Dr. Silva", evidence: "Dr. Silva", confidence: 0.9, role: "  cardiologista " },
      { name: "Ana", evidence: "Ana", confidence: 0.9, role: "   " },
      { name: "Jaime", evidence: "Jaime", confidence: 0.9 },
      { name: "Bia", evidence: "Bia", confidence: 0.9, role: "a".repeat(120) },
    ]).map((candidate) => candidate.role)).toEqual(["cardiologista", null, null, "a".repeat(80)]);
  });
});
