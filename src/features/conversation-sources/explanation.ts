/**
 * `2K-EXPL-001` … `2K-EXPL-007` — how the Brain reached this.
 *
 * ## What this discloses, and what it is
 *
 * The answer path already computes two exclusions and throws both away:
 *
 * 1. everything that scored **below the similarity floor**, and
 * 2. every memory the owner **archived**, dropped by the lifecycle filter.
 *
 * The user is told neither, so they cannot distinguish "the Brain found
 * nothing" from "the Brain found three things and rejected all of them".
 * Nothing needs computing to fix that; two values that already exist need to
 * reach the surface.
 *
 * ## Why these are two booleans and not two counts
 *
 * T-2K-04: explaining what was left out is one refactor away from `search`'s
 * forbidden "3 hidden results". And "don't show a count" is not enough on its
 * own, because **a rate is a count over repeated queries** — an attacker, or an
 * over-sharing screenshot, can binary-search existence by rephrasing.
 *
 * So the payload is the smallest thing that can carry the fact: a flag per
 * exclusion. No count, no score, no similarity, no threshold value. There is
 * nowhere here to put one.
 *
 * ## Why the two exclusions are treated differently, and why that is not arbitrary
 *
 * They are different assets.
 *
 * - The **similarity floor** is a property of *this query*, not of the corpus.
 *   Saying "the closest matches were too weak" tells the user about their own
 *   question. Disclosable.
 * - **Owner-archived memories** are facts the audience created and then
 *   retired. Telling somebody about their own archive is not a disclosure.
 *
 * ## Sensitivity is absent, and structurally so
 *
 * `2K-EXPL-005` forbids disclosing anything excluded for sensitivity, in count,
 * rate or existence. Phase 2K **masks rather than excludes** (OD-2J-1's own
 * doctrine, extended to `chat` in 2K.1), so nothing is excluded for sensitivity
 * at all — and this payload is built from the retrieval result, which does not
 * carry a classification. The property therefore holds because there is no path
 * by which such a fact could reach here, not because a caller remembers not to
 * send one.
 *
 * ## No model reasoning
 *
 * The line is behavioural: what the system **did** is disclosable, how the model
 * **composed** is not. There is no prompt here, no chain of thought, no scoring
 * narrative — and `phase-2k-disclosure-guard.test.ts` fails the build if a field
 * shaped like one appears.
 */

import { z } from "zod";

/**
 * The bounded disclosure.
 *
 * Two booleans, and the shape is the enforcement. A future contributor who
 * wants to add "how many" has to widen a schema that is `.strict()` and get
 * past a guard that names the shapes it refuses.
 */
export const answerExplanationSchema = z
  .object({
    /** `2K-EXPL-003`. Some matches scored below the floor. Never how many. */
    weakMatchesExcluded: z.boolean(),
    /** `2K-EXPL-004`. Some retrieved memories were archived by the owner. */
    archivedMemoriesExcluded: z.boolean(),
  })
  .strict();

export type AnswerExplanation = z.infer<typeof answerExplanationSchema>;

/**
 * Builds the disclosure from what retrieval actually did.
 *
 * Takes **counts** and returns **booleans**, deliberately: the caller has the
 * numbers because it just filtered two arrays, and this is the one place they
 * stop travelling. A signature that returned the counts would put the decision
 * at every call site instead of here.
 */
export function buildAnswerExplanation(input: {
  readonly retrieved: number;
  readonly aboveFloor: number;
  readonly aboveFloorMemories: number;
  readonly inForceMemories: number;
}): AnswerExplanation {
  return {
    weakMatchesExcluded: input.aboveFloor < input.retrieved,
    archivedMemoriesExcluded: input.inForceMemories < input.aboveFloorMemories,
  };
}

/** True when there is anything at all to disclose, so an empty panel is never drawn. */
export function hasDisclosure(explanation: AnswerExplanation | null): boolean {
  if (explanation === null) return false;
  return explanation.weakMatchesExcluded || explanation.archivedMemoriesExcluded;
}

/**
 * `2K-EXPL-007` — whether flagging the *interpretation* has a domain effect.
 *
 * It does not, this phase. Correcting the **source** is reachable and always
 * has been — memory edit and archive ship, and every source in the block links
 * to its object. Correcting the **interpretation** has no domain behind it: no
 * table records it, no action consumes it, and inventing one would be new scope.
 *
 * So the surface **says so** rather than offering a control that records
 * nothing. A button that quietly does nothing is the worse outcome, and it is
 * the one this requirement exists to prevent — `2K-EXPL-007` asks for the
 * absence to be *declared* rather than implied.
 *
 * A function rather than a constant because the answer is a claim about the
 * current domain, and this is where the reason lives beside it.
 */
export function interpretationCorrectionHasDomainEffect(): boolean {
  return false;
}
