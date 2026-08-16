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
      { candidateIndex: 0, name: "Giovanna (Gigi)", evidence: "pra Giovanna(gigi)", confidence: 1 },
      { candidateIndex: 1, name: "Jaime", evidence: "", confidence: 0.8 },
    ]);
  });

  it("drops malformed and blank values without shifting valid indexes", () => {
    expect(parseExtractedPeople([
      null,
      { name: " " },
      { name: "Marina", confidence: 2 },
      { name: "João", evidence: 7, confidence: 0.9 },
    ])).toEqual([
      { candidateIndex: 2, name: "Marina", evidence: "", confidence: 1 },
      { candidateIndex: 3, name: "João", evidence: "", confidence: 0.9 },
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
