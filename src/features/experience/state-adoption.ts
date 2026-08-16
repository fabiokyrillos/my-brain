/**
 * `2O-RECOVER-002` — the census, and every exception with a reason a guard
 * reads.
 *
 * ## The plan's census does not reproduce, and the difference is recorded here
 *
 * `2O-RECOVER-002` names *"the ten app pages and thirteen feature components
 * that carry their own state copy"*. Re-run against the tree this slice
 * started from, the **total** is nearly right and the **split** is not: the
 * surface-level state blocks live in **16 app route files and 6 feature
 * components**, not 10 and 13.
 *
 * Two categories the plan's sentence does not cover turned up as well, and
 * both genuinely render one of the seven states:
 *
 * - **error and loading sites** carrying their own copy — the app error
 *   boundary, two failed reads on `/app/costs`, the account menu, the offline
 *   notice in the composer, the pending-navigation indicator;
 * - **section-level absences** — 40 `quiet-state` paragraphs saying one
 *   section of an otherwise populated page has nothing in it.
 *
 * The last one is why `UniversalStateLine` exists. Answering 40 sections with
 * the bordered block would have made every populated detail page look like a
 * stack of failures, and answering them with an exception list would have left
 * 40 states outside a vocabulary whose requirement says *wherever it is
 * rendered at all*.
 *
 * ## `quiet-state` is a typography helper, not a state
 *
 * This is the distinction the census turns on, and getting it wrong in either
 * direction is expensive. `.quiet-state` is a muted-paragraph class used for
 * **both** section absences and ordinary explanatory notes — the content
 * promise on the notifications page, the provenance line on a task, the note
 * that planning writes nothing. Counting all 58 uses as states would have
 * converted explanatory prose into "states"; counting none of them would have
 * missed 40 real ones. They are separated by what the paragraph *says*, and
 * the guard re-derives that separation from the tree rather than trusting this
 * file's arithmetic.
 */

/**
 * Class names that once carried a universal state in a surface's own words.
 *
 * Closed. Each may now appear **only** as a styling passthrough on
 * `UniversalStateView` / `UniversalStateLine`, or on a recorded exception —
 * `state-adoption-guard.test.ts` fails otherwise. Keeping the names rather
 * than deleting them preserves the CSS the surfaces still rely on, and makes
 * the guard's subject something that exists rather than something remembered.
 */
export const LEGACY_STATE_CLASSES = [
  "empty-list",
  "empty-state",
  "empty-list-link",
  "empty-interpretation-state",
  "chat-empty",
  "calendar-empty",
  "palette-empty",
  "cost-empty",
  "cost-read-failed",
  "entry-outcomes-empty",
  "task-command-recovery-empty",
  "account-menu-error",
  "capture-error",
  "route-loading",
  "navigation-pending",
] as const;

export type LegacyStateClass = (typeof LEGACY_STATE_CLASSES)[number];

/** Why a site renders a universal state without going through the module. */
export type AdoptionExceptionKind =
  /** The site cannot resolve a locale, and both components require one. */
  | "no-locale-available"
  /**
   * The site does not render a universal state at all — it reports the result
   * of an action the reader just took. Recorded because the census flags it
   * and a later reader would otherwise re-litigate it.
   */
  | "action-feedback-not-a-surface-state"
  /**
   * The detector matched an identifier rather than a sentence.
   *
   * The absence scan reads the JSX expression, not the rendered string, so a
   * copy key whose *name* contains an absence word trips it while the sentence
   * it renders is prose. This is a limitation of the detector and is recorded
   * as one — the alternative was renaming a shipped copy key so a test would
   * stop matching it, which is shaping the product to the guard.
   */
  | "detector-false-positive";

export type StateAdoptionException = {
  /** Repository-relative path, forward slashes. */
  readonly site: string;
  readonly kind: AdoptionExceptionKind;
  /** Why, in enough detail that the next reader does not have to re-derive it. */
  readonly reason: string;
  /**
   * A substring that must be present in the file for this exception to be
   * live. An exception whose subject has been deleted is a stale permission,
   * and the guard fails on one rather than carrying it forever.
   */
  readonly evidence: string;
  /**
   * Scopes the exception to ONE flagged paragraph rather than to the file.
   *
   * A file-wide exception is far too much permission for a single sentence:
   * `planner-view.tsx` has four absences, three of which are converted, and
   * exempting the file would have quietly re-permitted those three. When this
   * is set, only a flagged body containing it is excused and everything else
   * in the file is still governed.
   */
  readonly onlyForExpression?: string;
};

export const STATE_ADOPTION_EXCEPTIONS: readonly StateAdoptionException[] = [
  {
    site: "src/app/[locale]/app/loading.tsx",
    kind: "no-locale-available",
    reason:
      "`loading.tsx` accepts no parameters — verified against "
      + "node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md, "
      + "'Loading UI components do not accept any parameters'. Both "
      + "`UniversalStateView` and `UniversalStateLine` require a `locale`, and "
      + "the two ways to manufacture one here each cost more than the "
      + "conversion is worth: `await headers()` makes an instant loading state "
      + "dynamic, and `\"use client\"` ships JavaScript to render a skeleton. "
      + "It already renders BOTH locales' announcements and lets the document's "
      + "`lang` decide, which is the fix slice 2N.0's hosted proof produced — "
      + "so the state is announced correctly; it simply is not announced by "
      + "this module.",
    evidence: "routeLoadingAnnouncements",
  },
  {
    site: "src/features/daily-cycle/needs-attention-list.tsx",
    kind: "action-feedback-not-a-surface-state",
    reason:
      "The `needs-attention-error` paragraph answers a click: the reader "
      + "pressed 'load more' and it failed. That is feedback about an action, "
      + "not a state the surface is in, which is why it is `form-error` and "
      + "why it is `role=\"alert\"` — assertive is right for the direct result "
      + "of something the reader just did, while the vocabulary announces "
      + "`error_recoverable` politely because most of its uses arrive with a "
      + "page render. It is also the sibling of `retryError` on the line "
      + "above, which is unambiguously action feedback; converting one and not "
      + "the other would make two identical things answer differently. This "
      + "slice DID convert it, a component test caught the politeness change, "
      + "and it was reverted rather than the test weakened. The same file's "
      + "`emptyFiltered` absence IS converted.",
    evidence: "form-error needs-attention-error",
  },
  {
    site: "src/features/planning/planner-view.tsx",
    kind: "detector-false-positive",
    reason:
      "`copy.createsNothing` renders \"Esta tela não cria tarefas. Ela só "
      + "organiza o que já existe.\" — a statement about what the planner "
      + "deliberately does NOT do, which is the opposite of a section saying "
      + "it has nothing in it. The absence scan reads the JSX expression, so "
      + "it matches the word inside the identifier and cannot see the "
      + "sentence. Renaming the copy key was declined: it changes shipped "
      + "product code so a test stops matching, and the key's name is accurate "
      + "for what it holds. Scoped to this expression only — the same file's "
      + "`conflicts.none`, `plannedEmpty` and `availableEmpty` are real "
      + "absences and ARE converted.",
    evidence: "copy.createsNothing",
    onlyForExpression: "copy.createsNothing",
  },
];

/**
 * The census, as of this slice. Asserted against the tree by the guard, so a
 * number here that stops being true fails a test rather than misleading a
 * reader — which is the failure mode Phase 2I's audit produced three times.
 */
export const STATE_ADOPTION_CENSUS = {
  /** Files rendering a universal state through the module. */
  minimumFilesThroughTheModule: 40,
  /** Exceptions, which must equal `STATE_ADOPTION_EXCEPTIONS.length`. */
  exceptions: 3,
} as const;
