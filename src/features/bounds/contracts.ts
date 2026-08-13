/**
 * `2N-PERSON-003`, `2N-PROJECT-006`, `2N-KNOWS-008` — the bounds vocabulary,
 * shared by every contextual surface.
 *
 * ## The defect this replaces
 *
 * ADR-108's audit found `.limit(100)` six times on the person page and four on
 * the project page, plus a `.limit(200)` and two `.limit(50)`, and **none of
 * them states its bound**. A user with 140 linked entries sees 100 and is told
 * nothing — the list is not merely incomplete, it *looks complete*, which is a
 * wrong answer wearing the shape of a right one. PRD §4 says a surface that
 * cannot express "there is more" is not complete.
 *
 * ## Why a fetched row cannot answer this, and the probe that can
 *
 * The subtle half is that `.limit(100)` returning exactly 100 rows **does not
 * tell you whether a 101st exists**. A surface that rendered "showing the first
 * 100" whenever it received 100 would lie every time the total is exactly 100 —
 * trading a silent truncation for a confident falsehood, which is worse, because
 * the user cannot tell it is wrong.
 *
 * So the bound is measured rather than guessed: the caller asks for `limit + 1`
 * and this decides. One extra row is the cheapest possible probe and it is
 * exact — `bounded` is true if and only if a further row exists.
 *
 * ## Why the word is `bounded` and not a new one
 *
 * `src/features/search/contracts.ts` already answers this question for the seven
 * search domains, and it answers it with `bounded` on `DomainOutcome` and
 * `totalBounded` on the response. `2N-PERSON-003` says the contextual surfaces
 * state their bound **"in the vocabulary search already uses"**, so this module
 * takes that word rather than minting `truncated`, `capped` or `hasMore`
 * beside it. Two vocabularies for one fact is how a product ends up describing
 * the same truncation two ways on two screens.
 *
 * Search keeps its own limits — its bound is per *domain* and a second total,
 * which is a different shape from a page of related rows — and this module does
 * not reach into it. The shared thing is the word and the meaning, which is what
 * the requirement asks for; a forced merge of two differently-shaped bounds
 * would be a refactor of a closed phase for no user-visible gain.
 */

/**
 * The bound each contextual list is fetched under.
 *
 * Stated once, as data, so a surface cannot quietly disagree with the notice it
 * renders — the number the user is told is necessarily the number that was
 * applied, because both read this.
 *
 * The values preserve the bounds the audit found rather than re-tuning them:
 * this slice makes truncation *honest*, and changing what is shown at the same
 * time would make it impossible to tell which change caused a difference.
 */
export const CONTEXTUAL_LIMIT = 100;
export const RELATION_LIMIT = 50;
export const PICKER_LIMIT = 200;
export const FAILED_JOB_LIMIT = 20;

/**
 * How many rows to ask for when you intend to render `limit` of them.
 *
 * Always used as `limit + BOUND_PROBE`. Named so a call site reads as a
 * deliberate probe rather than as an off-by-one somebody should tidy up.
 */
export const BOUND_PROBE = 1;

/** The number to pass to `.limit()` when you intend to render `limit` rows. */
export function withProbe(limit: number): number {
  return limit + BOUND_PROBE;
}

/**
 * A list that knows whether it is complete.
 *
 * `bounded` is search's word for exactly this fact, and it means the same thing
 * here: **more exist than are being shown**.
 */
export type Bounded<T> = {
  readonly items: readonly T[];
  readonly bounded: boolean;
  /** The bound that was applied, so a notice can state it rather than restate a literal. */
  readonly limit: number;
};

/**
 * Decides the bound from rows fetched with `withProbe(limit)`.
 *
 * Trims the probe row off before returning, so a caller cannot accidentally
 * render it — the probe exists to be counted, never to be shown.
 */
export function boundedList<T>(rows: readonly T[] | null | undefined, limit: number): Bounded<T> {
  const all = rows ?? [];
  const bounded = all.length > limit;
  return { items: bounded ? all.slice(0, limit) : all, bounded, limit };
}

/**
 * The count a surface reports for a bounded list.
 *
 * Deliberately the number of rows **shown**, and deliberately paired with
 * `bounded` rather than replaced by an estimate. `2N-PRIVACY-004` requires a
 * count computed over everything the user owns *including masked rows* — which
 * `boundedList` satisfies, because masking never removes an item here — but no
 * requirement asks a bounded list to know its true total, and inventing one
 * would mean a second query per list to produce a number nobody asked for.
 *
 * A surface says "100" and "there are more", which is two true statements, not
 * one guess.
 */
export function shownCount<T>(list: Bounded<T>): number {
  return list.items.length;
}
