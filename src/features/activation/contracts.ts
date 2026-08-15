/**
 * The activation contract — `2O-ACTIVATION-001`, `-002` and `-003`.
 *
 * One typed module declaring what *activation* means for this product, as an
 * **ordered list of observable facts about an account**. Every consumer reads
 * the list from here; nothing restates it in prose, and nothing keeps a second
 * copy.
 *
 * ## Three properties, and each is a requirement rather than a preference
 *
 * **Ordered.** The order is data (`order`), not the accident of an array
 * literal's shape, so a consumer that sorts and a consumer that iterates agree.
 *
 * **Derived.** `OD-2O-3` is signed **A**, so `2O-ACTIVATION-002`'s prohibition
 * is **absolute**: no requirement in this phase may introduce a stored
 * onboarding step, cursor or flag, and there is no branch under which one
 * becomes permitted. Every fact below names the data it is read from, and every
 * one of those tables exists for its own reasons — `entries` is where entries
 * live, not where progress is recorded. That is what makes the path resumable
 * across sessions and devices by construction (`2O-ONBOARD-009`) and what makes
 * an interrupted onboarding indistinguishable from a paused one: there is no
 * cursor to be stale.
 *
 * **Three-valued.** A fact is `satisfied`, `unsatisfied`, or **`unreadable`**,
 * and `2O-ACTIVATION-003` forbids the third being rendered as the second. The
 * distinction is not pedantry: a failed read collapsed into "not done" tells a
 * user to configure a credential they already configured, and the product would
 * be confidently wrong about the one thing it was asked to keep track of.
 * `loadCredentialMetadata` collapses exactly this way — it returns
 * `ABSENT_CREDENTIAL` on error — which is correct for a settings panel that
 * gates AI identically either way, and is why this module does its own read
 * rather than borrowing that one.
 */

/**
 * The five facts, in the order the product asks for them.
 *
 * Each is observable from data the product already keeps. `derivedFrom` names
 * those tables and is asserted, in `contracts.test.ts`, to contain nothing that
 * reads as onboarding bookkeeping — a stored flag would arrive here, as a
 * source, before it arrived anywhere else in the tree.
 */
export type ActivationFactKey =
  | "locale_and_timezone"
  | "ai_credential"
  | "entry_captured"
  | "interpretation_reviewed"
  | "task_confirmed";

/** `2O-ACTIVATION-003`. `unreadable` is a first-class answer, not an error path. */
export type ActivationFactState = "satisfied" | "unsatisfied" | "unreadable";

export type ActivationFactDefinition = Readonly<{
  key: ActivationFactKey;
  /** 1-based position. Declared order is rendered order. */
  order: number;
  /** The existing data the fact is read from. Never a progress store. */
  derivedFrom: readonly string[];
}>;

export const activationFacts = [
  { key: "locale_and_timezone", order: 1, derivedFrom: ["profiles"] },
  { key: "ai_credential", order: 2, derivedFrom: ["user_ai_credentials"] },
  { key: "entry_captured", order: 3, derivedFrom: ["entries"] },
  /*
   * Reviewing an interpretation is an *act*, and the act leaves a row.
   * `entry_task_candidate_resolutions` records every disposition the owner gave
   * a candidate — confirmed or declined — so its existence is exactly "this
   * account has reviewed an interpretation". An entry reaching `awaiting_review`
   * would have been the wrong source: that is the product finishing its work,
   * not the user doing theirs.
   */
  { key: "interpretation_reviewed", order: 4, derivedFrom: ["entry_task_candidate_resolutions"] },
  /*
   * Any task at all. The product materializes a task **only** through a
   * confirmation path — the selective-confirmation RPC for a candidate, and the
   * confirmed standalone creation Phase 2E.6 added — so a row's existence is the
   * owner's act. `created_by` deliberately is **not** consulted: it records the
   * task's *origin* (`agent` for a confirmed standalone creation), not who
   * confirmed it, and filtering on it would miss a task the user really did
   * confirm.
   */
  { key: "task_confirmed", order: 5, derivedFrom: ["tasks"] },
] as const satisfies readonly ActivationFactDefinition[];

export const ACTIVATION_FACT_KEYS = activationFacts.map((fact) => fact.key);

/**
 * One fact's reading.
 *
 * `ok: false` carries no reason on purpose: the reason belongs in a log, and a
 * caller that could branch on it would be tempted to treat some failures as
 * "probably not satisfied".
 */
export type ActivationReading =
  | { readonly ok: true; readonly satisfied: boolean }
  | { readonly ok: false };

export type ActivationFact = Readonly<{
  key: ActivationFactKey;
  order: number;
  state: ActivationFactState;
}>;

export type ActivationProgress = Readonly<{
  facts: readonly ActivationFact[];
  satisfiedCount: number;
  unreadableCount: number;
  /**
   * Three-valued, for the same reason a fact is.
   *
   * `yes` — every fact satisfied. `no` — at least one fact was read and found
   * false, which is knowledge. `unknown` — nothing is known to be missing and
   * something could not be read, so neither answer is honest.
   */
  complete: "yes" | "no" | "unknown";
}>;

export function readingToState(reading: ActivationReading): ActivationFactState {
  if (!reading.ok) return "unreadable";
  return reading.satisfied ? "satisfied" : "unsatisfied";
}

export function deriveActivationProgress(
  readings: Readonly<Record<ActivationFactKey, ActivationReading>>,
): ActivationProgress {
  const facts = activationFacts.map((fact) => ({
    key: fact.key,
    order: fact.order,
    state: readingToState(readings[fact.key]),
  }));

  const satisfiedCount = facts.filter((fact) => fact.state === "satisfied").length;
  const unreadableCount = facts.filter((fact) => fact.state === "unreadable").length;
  const complete = facts.every((fact) => fact.state === "satisfied")
    ? "yes"
    : facts.some((fact) => fact.state === "unsatisfied")
      ? "no"
      : "unknown";

  return Object.freeze({ facts, satisfiedCount, unreadableCount, complete });
}

/**
 * The first fact that is not satisfied, carrying the state it is in.
 *
 * An `unreadable` fact is **offered rather than skipped**. Skipping it would
 * claim it is done and treating it as false would claim it is not; returning it
 * with its state lets the caller say the only true thing — that the product
 * could not tell.
 */
export function nextActivationFact(progress: ActivationProgress): ActivationFact | null {
  return progress.facts.find((fact) => fact.state !== "satisfied") ?? null;
}
