/**
 * The Phase 2E outcome vocabulary, declared once (PRD 2E-UX-001).
 *
 * 2E-UX-001 names twelve outcomes and then says of itself: "this list is the
 * source the 2E-I18N-003 exhaustiveness test runs against". Until now no
 * constant declared them. `TASK_MATCH_OUTCOMES` in `matching.ts` is a different
 * and smaller thing — the five verdicts the *match step* can reach — and using
 * it as the copy vocabulary would have left seven outcomes with no localized
 * text and no test able to notice.
 *
 * Declared as an `as const` array rather than a bare union, deliberately.
 * `ConfirmTasksCode` in `src/features/tasks/actions.ts` is a bare union, which
 * is why nothing there can iterate its members and why two of its codes have no
 * test and one has no raising migration at all. 2E-I18N-003 requires iteration,
 * so the vocabulary has to exist at runtime.
 *
 * Slice 2E.3 emits only a subset — the rest belong to slices that do not exist
 * yet — but the copy module covers all twelve, because a vocabulary that grows
 * one entry per slice is a vocabulary whose exhaustiveness test proves nothing
 * until the last slice lands.
 */

/** PRD 2E-UX-001, in the order the requirement lists them. */
export const TASK_COMMAND_OUTCOMES = [
  /** The mutation happened. Slice 2E.4. */
  "applied",
  /** Matched and owned, but the canonical patch yields no field or relation delta. */
  "no_change",
  /** Competing candidates, or one the matcher is not confident enough about. */
  "ambiguous",
  /** The candidate set was truncated, so the answer cannot be trusted to be complete. */
  "ambiguous_overflow",
  /** Identified confidently; the action's gravity still demands a token. Slice 2E.5. */
  "matched_requires_confirmation",
  /** One bounded question was asked. Slice 2E.6. */
  "clarification_requested",
  /** The re-match after a clarification also found nothing. Terminal. Slice 2E.6. */
  "still_unmatched",
  /** Nothing matched, and the command carries a task-like payload. Slice 2E.6. */
  "creation_offered",
  /** The command names something the taxonomy does not offer. Slice 2E.1. */
  "unsupported",
  /** The state moved under the preview. Slices 2E.3-2E.5. */
  "rejected_stale",
  /** Another command reached the task first. Slice 2E.4. */
  "rejected_conflict",
  /** Understood, identified, and still not done — with a declared reason. */
  "refused",
] as const;

export type TaskCommandOutcome = (typeof TASK_COMMAND_OUTCOMES)[number];

/**
 * What a preview resolves to.
 *
 * Four of the five are members of `TASK_COMMAND_OUTCOMES`; `previewed` is not,
 * and that is not an oversight. PRD §11.1 makes `previewed` a *lifecycle state*
 * — `matched → previewed → applied | no_change | …` — while 2E-UX-001's twelve
 * are the outcomes a command can come to rest at. A preview that is ready to
 * apply has not come to rest; it is waiting for the user, which is the whole
 * point of 2E-UX-001's own "every apply is user-initiated" (PRD §23.7).
 *
 * `copy.test.ts` pins the containment in both directions: every disposition
 * except `previewed` must be a declared outcome, and `previewed` must not be
 * one — so the two vocabularies cannot drift apart, and neither can this
 * comment quietly stop being true.
 */
export const TASK_COMMAND_PREVIEW_DISPOSITIONS = [
  /** Ready. A single Apply control is permitted iff the match said `oneStep`. */
  "previewed",
  "matched_requires_confirmation",
  "no_change",
  "rejected_stale",
  "refused",
] as const;

export type TaskCommandPreviewDisposition = (typeof TASK_COMMAND_PREVIEW_DISPOSITIONS)[number];

/**
 * Why a preview refused (2E-UX-001's `refused`, given a reason).
 *
 * One entry today, and that is honest rather than embarrassing: the preview is
 * read-only, so nearly everything that can go wrong at this stage is either
 * staleness (its own disposition, per 2E-DISAMBIG-005) or a validation failure
 * the command schema already rejected one slice earlier. Slices 2E.4 and 2E.5
 * add the database's `2E_*` detail codes, which are a different closed list
 * raised by a different layer.
 *
 * `relation_reference_unresolved` covers both halves of what
 * `resolve_owned_entity_exact` deliberately collapses: the caller owns no
 * entity of that name, or owns more than one. The preview does not pretend to
 * tell them apart, because the resolver does not, and inventing a distinction
 * the data does not support is exactly what a truthful preview must not do.
 */
export const TASK_COMMAND_PREVIEW_REFUSALS = ["relation_reference_unresolved"] as const;

export type TaskCommandPreviewRefusal = (typeof TASK_COMMAND_PREVIEW_REFUSALS)[number];

/**
 * Whether an undo can still be offered, and if not, why (2E-UNDO-006/007).
 *
 * Declared here with the other vocabularies rather than beside the projection
 * that computes it, because `undo-listing.ts` begins `import "server-only"` and
 * `copy.ts` is bundled for the client. A vocabulary a surface must localize
 * cannot live behind a server-only guard, or the copy module would have to
 * import one — which works only because `import type` is erased, and would stop
 * working the moment someone needed the runtime array.
 *
 * 2E-UNDO-007 is the reason `expired` and `unavailable` are separate members:
 * it requires them to be "distinct, localized outcomes", and a single
 * `unavailable` would make the honest "the 24 hours are up" unsayable.
 */
export const TASK_COMMAND_UNDO_STATES = ["available", "expired", "unavailable"] as const;

export type TaskCommandUndoState = (typeof TASK_COMMAND_UNDO_STATES)[number];
