/**
 * `2K-EXPL-002` … `2K-EXPL-007` — the bounded disclosure.
 *
 * The assertions that carry the requirement are the negatives: no count
 * anywhere, no sensitivity fact by any path, and no model reasoning. The
 * positives only prove the payload is not empty.
 */

import { describe, expect, it } from "vitest";

import {
  answerExplanationSchema,
  buildAnswerExplanation,
  hasDisclosure,
  interpretationCorrectionHasDomainEffect,
} from "./explanation";

describe("2K-EXPL-003/004: the two exclusions are disclosed, as facts", () => {
  it("reports weak matches when retrieval dropped some below the floor", () => {
    expect(
      buildAnswerExplanation({ retrieved: 8, aboveFloor: 3, aboveFloorMemories: 0, inForceMemories: 0 })
        .weakMatchesExcluded,
    ).toBe(true);
  });

  it("reports nothing weak when everything retrieved cleared the floor", () => {
    expect(
      buildAnswerExplanation({ retrieved: 3, aboveFloor: 3, aboveFloorMemories: 0, inForceMemories: 0 })
        .weakMatchesExcluded,
    ).toBe(false);
  });

  it("reports archived memories when the lifecycle filter dropped some", () => {
    expect(
      buildAnswerExplanation({ retrieved: 4, aboveFloor: 4, aboveFloorMemories: 3, inForceMemories: 1 })
        .archivedMemoriesExcluded,
    ).toBe(true);
  });

  it("reports none when every retrieved memory was still in force", () => {
    expect(
      buildAnswerExplanation({ retrieved: 4, aboveFloor: 4, aboveFloorMemories: 2, inForceMemories: 2 })
        .archivedMemoriesExcluded,
    ).toBe(false);
  });

  it("keeps the two independent, because they are different facts", () => {
    const weakOnly = buildAnswerExplanation({ retrieved: 5, aboveFloor: 2, aboveFloorMemories: 1, inForceMemories: 1 });
    expect(weakOnly).toEqual({ weakMatchesExcluded: true, archivedMemoriesExcluded: false });

    const archivedOnly = buildAnswerExplanation({ retrieved: 2, aboveFloor: 2, aboveFloorMemories: 2, inForceMemories: 0 });
    expect(archivedOnly).toEqual({ weakMatchesExcluded: false, archivedMemoriesExcluded: true });
  });
});

describe("2K-EXPL-003: never a count, never a score", () => {
  it("carries exactly two boolean fields and nothing else", () => {
    const explanation = buildAnswerExplanation({
      retrieved: 20,
      aboveFloor: 1,
      aboveFloorMemories: 9,
      inForceMemories: 1,
    });
    expect(Object.keys(explanation).sort()).toEqual([
      "archivedMemoriesExcluded",
      "weakMatchesExcluded",
    ]);
    for (const value of Object.values(explanation)) {
      expect(typeof value).toBe("boolean");
    }
  });

  it("produces byte-identical output for wildly different counts", () => {
    /*
     * The property `2K-EXPL-003` actually needs. "Don't render the count" would
     * be a rendering rule; this is a **payload** rule — nineteen dropped
     * matches and one dropped match are the same disclosure, so no count can be
     * reconstructed from the payload by any consumer, present or future.
     */
    const many = buildAnswerExplanation({ retrieved: 20, aboveFloor: 1, aboveFloorMemories: 0, inForceMemories: 0 });
    const one = buildAnswerExplanation({ retrieved: 2, aboveFloor: 1, aboveFloorMemories: 0, inForceMemories: 0 });
    expect(JSON.stringify(many)).toBe(JSON.stringify(one));
  });

  it("refuses a count planted on the payload", () => {
    for (const field of ["hiddenCount", "excludedCount", "sensitiveCount", "count", "score", "similarity", "threshold"]) {
      const planted = { weakMatchesExcluded: true, archivedMemoriesExcluded: false, [field]: 3 };
      expect(answerExplanationSchema.safeParse(planted).success, field).toBe(false);
    }
  });

  it("refuses a prompt, a reasoning trace or a score narrative", () => {
    for (const field of ["prompt", "reasoning", "chainOfThought", "rationale", "scores"]) {
      const planted = { weakMatchesExcluded: true, archivedMemoriesExcluded: false, [field]: "x" };
      expect(answerExplanationSchema.safeParse(planted).success, field).toBe(false);
    }
  });
});

describe("2K-EXPL-005: a sensitivity exclusion is byte-identical to an absence", () => {
  it("has no field that could carry one", () => {
    // Phase 2K **masks** rather than excludes, so nothing is excluded for
    // sensitivity at all — and the builder takes only four counts, none of
    // which is a classification. The property holds because there is no path,
    // not because a caller remembers.
    expect(Object.keys(buildAnswerExplanation({ retrieved: 1, aboveFloor: 1, aboveFloorMemories: 0, inForceMemories: 0 })))
      .not.toContain("sensitive");
    expect(buildAnswerExplanation.length).toBe(1);
  });

  it("cannot be told a source was sensitive", () => {
    // Planting it on the input changes nothing about the output, because the
    // builder reads four named counts.
    const withoutClaim = buildAnswerExplanation({ retrieved: 4, aboveFloor: 2, aboveFloorMemories: 1, inForceMemories: 1 });
    const smuggled = { retrieved: 4, aboveFloor: 2, aboveFloorMemories: 1, inForceMemories: 1, sensitiveExcluded: 2 };
    const withClaim = buildAnswerExplanation(smuggled);
    expect(JSON.stringify(withClaim)).toBe(JSON.stringify(withoutClaim));
  });
});

describe("2K-EXPL-001: nothing to say means nothing is shown", () => {
  it("reports no disclosure when neither exclusion happened", () => {
    expect(hasDisclosure({ weakMatchesExcluded: false, archivedMemoriesExcluded: false })).toBe(false);
  });

  it("reports a disclosure when either happened", () => {
    expect(hasDisclosure({ weakMatchesExcluded: true, archivedMemoriesExcluded: false })).toBe(true);
    expect(hasDisclosure({ weakMatchesExcluded: false, archivedMemoriesExcluded: true })).toBe(true);
  });

  it("reports none for an answer that recorded no explanation at all", () => {
    // Answers written before this slice. Absence is meaningful and is not the
    // same as "nothing was excluded".
    expect(hasDisclosure(null)).toBe(false);
  });
});

describe("2K-EXPL-007: the absent correction path is declared, not implied", () => {
  it("states that flagging the interpretation has no domain effect this phase", () => {
    // Correcting the **source** is reachable and always has been — memory edit
    // and archive ship, and every source links to its object. Correcting the
    // **interpretation** has no table, no action and no consumer, so the
    // surface says so rather than offering a control that records nothing.
    expect(interpretationCorrectionHasDomainEffect()).toBe(false);
  });
});
