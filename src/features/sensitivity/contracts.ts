/**
 * `2J-PRIVACY-001` … `2J-PRIVACY-005` — the central sensitivity-presentation
 * contract (ADR-095, OD-2J-1).
 *
 * ## What this is, and what it is emphatically not
 *
 * This is a **presentation** contract. It decides whether a surface *renders*
 * content the user already owns. It is **never** an authorization boundary:
 * ownership comes exclusively from the authenticated query plus forced RLS, and
 * nothing here may be relied on to keep one account's rows away from another's.
 * A reviewer who finds this module load-bearing for isolation has found a bug.
 *
 * ## Why it is one module rather than a rule per surface
 *
 * Before Phase 2J the product already disagreed with itself: global search
 * excludes `highly_sensitive` by default (ADR-093), while Hoje, the attention
 * queue and the Work views applied **no** sensitivity predicate at all — and
 * the attention projection renders a 240-character preview of raw entry text.
 * Two surfaces of one product meant two answers to "what does this
 * classification promise?".
 *
 * `2J-PRIVACY-001` fixes that by construction: the rules live here as **data**,
 * every touched surface reads them, and `sensitivity-boundary.test.ts` fails
 * the build if a surface starts testing a literal level on its own.
 *
 * ## Masking, not exclusion — and why that is the safer reading
 *
 * OD-2J-1 says `highly_sensitive` is "excluded/masked" by default. This module
 * chooses **masked in place** everywhere content is listed, because exclusion
 * creates the exact leak the same decision forbids: if a sensitive row is
 * dropped, the visible count is a lie, and any "3 hidden" affordance is an
 * existence oracle wearing a helpful hat. A masked row is honest about *that
 * something is there* while saying nothing about *what* — and the user who
 * wants it can reveal it deliberately.
 *
 * Notifications are the one surface where the content genuinely must not exist
 * in the payload at all, so they get their own outcome (`omit`) rather than a
 * mask the OS could render.
 */

/** Mirrors the CHECK constraint carried by every classified table. */
export const SENSITIVITY_LEVELS = ["normal", "private", "highly_sensitive"] as const;
export type SensitivityLevel = (typeof SENSITIVITY_LEVELS)[number];

/**
 * The surfaces this contract governs.
 *
 * `search` is deliberately absent: ADR-093 signed its behaviour in Phase 2I and
 * OD-2J-1 explicitly does not redefine it. Adding it here would silently
 * re-open a closed decision.
 *
 * `chat` arrives in Phase 2K (`2K-PRIVACY-001`). It is a **new** decision
 * rather than an amendment to ADR-093, and it is the surface this contract was
 * always going to have to reach: Conversar retrieves entries and memories
 * regardless of classification, and before 2K it applied no predicate and no
 * mask at any level. It takes the same posture as every other content surface
 * — masked in place, revealable locally — because exclusion would make a
 * visible count a lie.
 *
 * One property is specific to `chat` and worth stating where the rule lives:
 * the classification consulted is the **current** one, read at render time.
 * OD-2K-2 removed the stored excerpt precisely so there is no second copy that
 * could carry a stale level alongside it.
 *
 * `work` arrives in Phase 2L (`2L-PRIVACY-001`, OD-2L-1 **option B**), and it is
 * the one governed surface whose subject carries **no classification of its
 * own**: `tasks` has no `sensitivity` column and OD-2L-1 B forbids adding one.
 * A task's level is *derived from its source entry* and re-read at presentation
 * time — `task-derivation.ts` is that derivation, and `resolveTaskContent`
 * there is the only thing that asks this module about `work`.
 *
 * Two consequences worth stating where the rule lives. Coverage is **partial by
 * construction**: a manually created task has no source to derive from and is
 * therefore never classified here at all — which is a third answer this module
 * has no member for, and exactly why the derivation returns its own three-arm
 * value rather than a `SensitivityLevel`. And a source that cannot be read
 * resolves to `highly_sensitive`, so the rule below is reached in its most
 * protective arm precisely when the least is known.
 */
/**
 * `calendar` arrives in Phase 2M (`2M-PRIVACY-001`, OD-2M-1 **option A**), and
 * it is the first governed surface that renders **two** kinds of subject whose
 * classification lives somewhere else.
 *
 * Tasks derive through `task-derivation.ts` exactly as they do on `work`.
 * Reminders derive through the *same* mechanism via `reminders.entry_id` — the
 * relationship the audit found had never been used, which is precisely why
 * OD-2M-1 refused option B: a calendar that masked a task title and printed the
 * reminder title beside it would recreate, one entity over, the divergence slice
 * 2L.1 found on Hoje.
 *
 * The other two lanes carry no user text at all. A review appears as its period
 * and renders through `review_summary` when opened (`2M-REVIEW-008`), and an
 * unconfirmed extracted date is a date — so neither needs a rule here, and
 * inventing one would suggest a protection that is not being performed.
 */
/**
 * `person`, `project`, `memory` and `file` arrive in Phase 2N slice 2N.0
 * (`2N-PRIVACY-001`, OD-2N-12 **option A**), and they are the surfaces this
 * contract was written to reach.
 *
 * ADR-108's audit found the divergence intact one domain over: the contextual
 * pages render `entries.original_content`, task titles and memory bodies with
 * **no classification applied at all**, and `src/features/entities/**` appeared
 * in no sensitivity reader. That is the same "two surfaces of one product meant
 * two answers" the module header describes, surviving in the four places a user
 * goes to read about a *person*.
 *
 * Two properties are specific to these four and worth stating where the rule
 * lives.
 *
 * **The subject's classification is its own, not a task's.** `entries`,
 * `memories` and `attachments` each carry a `sensitivity` column, so
 * `subject-derivation.ts` reads the row rather than chasing a source — but it
 * keeps the same three-arm answer, because a row the query could not return is
 * still a row this must not print. Tasks rendered on these pages keep deriving
 * through `task-derivation.ts`; nothing is classified twice.
 *
 * **One field on these surfaces has no classification available at all.**
 * `people.notes` is free text about a human being, with no `sensitivity` column
 * and no classifiable source. ADR-110 Decision 4 masks it by default, and
 * `deriveFreeTextSensitivity` resolves it to the most protective level rather
 * than to `undetermined` — the arm that renders in the clear.
 *
 * `graph` was deliberately **absent** until 2N.6. `2N-PRIVACY-001` admits a
 * surface "in the same change that ships their first governed consumer", and
 * 2N.0 shipped no graph; adding it there would have created a governed surface
 * no one reads — a producer with no consumer, which this repository has already
 * paid for twice.
 */
/**
 * `graph` arrives in Phase 2N slice 2N.6 (`2N-RELATION-006`/`-007`, `OD-2N-10`
 * **option B**), **in the same change as its first real consumer**, which is what
 * the paragraph above reserved it for.
 *
 * **The consumer is named, because a surface key with no reader is the failure
 * this contract exists to avoid.** It is `person_relationships.description` — the
 * owner's own sentence about a relationship, rendered on the relations surface
 * through `ProtectedContent` and resolved by `resolveGraphContent`. Every other
 * string that surface renders is a **structural identifier** (`people.name`,
 * `projects.name`, `contexts.name`, `organizations.name`) or a localized
 * vocabulary term, and ADR-110 Decision 2 keeps those visible.
 *
 * `description` is free text about a human being on a table with no
 * `sensitivity` column and no classifiable source — ADR-110 Decision 4's
 * predicate word for word — so it takes Decision 4's posture through
 * `deriveFreeTextSensitivity`, the same one `people.notes` takes.
 *
 * **And the same change makes the person page converge.** Before 2N.6 that page
 * masked `people.notes` and rendered `description` in the clear one section
 * below it: two unclassifiable free-text fields about the same human being,
 * under two postures, on one page. `2N-PRIVACY-001` exists to end exactly that,
 * so the relationship panel now renders `description` through the same
 * component, as `person`.
 *
 * The rules below are identical to the four contextual surfaces, for the reason
 * the module header gives: a dropped item makes a count a lie and its absence an
 * oracle.
 */
export const GOVERNED_SURFACES = [
  "hoje",
  "attention",
  "capture_receipt",
  "review_summary",
  "notification",
  "chat",
  "work",
  "calendar",
  "person",
  "project",
  "memory",
  "file",
  "graph",
] as const;
export type GovernedSurface = (typeof GOVERNED_SURFACES)[number];

/**
 * What a surface may do with a piece of content.
 *
 * - `show`   — render it normally.
 * - `mask`   — render the row/acknowledgement, withhold the text, offer a
 *              local reveal. The item's *existence* is not hidden.
 * - `omit`   — the content must not reach this surface at all, in any form.
 *              Only notifications use this, and only because their payload
 *              leaves the application's control.
 */
export type PresentationOutcome = "show" | "mask" | "omit";

export type Presentation = {
  readonly outcome: PresentationOutcome;
  /** Whether an explicit, local user action may reveal the content in place. */
  readonly revealable: boolean;
};

const SHOW: Presentation = { outcome: "show", revealable: false };
const MASK: Presentation = { outcome: "mask", revealable: true };
const OMIT: Presentation = { outcome: "omit", revealable: false };

/**
 * The rules, as data.
 *
 * `normal` and `private` are unchanged by OD-2J-1 and are shown everywhere the
 * user can already see them — with one exception that is not a change in
 * policy but a change in *medium*: a notification payload leaves the app, so it
 * carries no user content at any level. That is why the notification column is
 * `omit` for all three, and why `notificationCopy()` below exists instead.
 */
const RULES: Record<GovernedSurface, Record<SensitivityLevel, Presentation>> = {
  hoje: { normal: SHOW, private: SHOW, highly_sensitive: MASK },
  attention: { normal: SHOW, private: SHOW, highly_sensitive: MASK },
  capture_receipt: { normal: SHOW, private: SHOW, highly_sensitive: MASK },
  review_summary: { normal: SHOW, private: SHOW, highly_sensitive: MASK },
  notification: { normal: OMIT, private: OMIT, highly_sensitive: OMIT },
  chat: { normal: SHOW, private: SHOW, highly_sensitive: MASK },
  // Masked rather than excluded, for the reason the module header gives and for
  // one that is sharper on Work than anywhere else: a Work list is a list the
  // user *operates on*. Dropping a row would remove a task from the count, from
  // the filter and from any selection — so the user would act on a set that is
  // not the set they own. The row stays, the content does not.
  work: { normal: SHOW, private: SHOW, highly_sensitive: MASK },
  // Masked rather than excluded, and on a calendar the reason is sharper than
  // anywhere else: dropping a row would leave a **day that looks empty**. A user
  // who cannot see that Thursday is full would plan into it, which is a worse
  // outcome than a masked title and is also a lie about their own data. The row
  // keeps its lane, its instant and its position; the words do not.
  calendar: { normal: SHOW, private: SHOW, highly_sensitive: MASK },
  // The four contextual surfaces take the identical posture, and their sameness
  // is the point rather than a copy-paste. `2N-PRIVACY-004` requires counts
  // computed over everything the user owns, and `2N-PRIVACY-005` requires
  // sensitive rows masked **in position** and not dropped — so a person page
  // that hid three memories would report a count that matches nothing the user
  // can see, and the gap between the number and the rows is itself the oracle
  // OD-2J-1 refuses. A masked row keeps the count honest and says nothing.
  person: { normal: SHOW, private: SHOW, highly_sensitive: MASK },
  project: { normal: SHOW, private: SHOW, highly_sensitive: MASK },
  memory: { normal: SHOW, private: SHOW, highly_sensitive: MASK },
  file: { normal: SHOW, private: SHOW, highly_sensitive: MASK },
  // The relations surface takes the identical posture, and here "masked rather
  // than excluded" has a sharper consequence than anywhere else: an excluded
  // edge would remove a node from the picture, and a missing node in a drawing
  // is not a gap the reader can see — it looks exactly like a person who has no
  // links. The relation stays, its own sentence does not.
  graph: { normal: SHOW, private: SHOW, highly_sensitive: MASK },
};

/** The single entry point. Every governed surface asks this and obeys it. */
export function presentationFor(
  surface: GovernedSurface,
  level: SensitivityLevel,
): Presentation {
  return RULES[surface][level];
}

/**
 * `2J-PRIVACY-004` — the count is computed over everything, masked or not.
 *
 * Exists as a named function rather than as a comment because "don't leak the
 * count" is the rule most easily broken by a well-meaning `.filter()` three
 * refactors from now. A surface that calls this cannot accidentally count only
 * what it rendered in the clear.
 */
export function visibleCount<T>(items: readonly T[]): number {
  return items.length;
}

/**
 * `2J-PRIVACY-001`, notification half — the payload has nowhere to put content.
 *
 * This returns generic copy and takes **no content parameter at all**. That is
 * the point: a privacy property enforced by "callers promise not to pass text"
 * is weaker than a signature that cannot accept it. There is deliberately no
 * overload that takes a title, an excerpt or an entity name.
 */
export function notificationCopy(locale: "pt-BR" | "en"): { title: string; body: string } {
  return locale === "pt-BR"
    ? { title: "My Brain", body: "Você tem algo que precisa da sua atenção." }
    : { title: "My Brain", body: "My Brain has something that needs your attention." };
}

/**
 * The reveal is **local and transient** (OD-2J-1).
 *
 * No accepted preference contract supports a durable "show sensitive content"
 * mode, so this type has no persisted form and no serializer. A future phase
 * that wants one must add a preference contract and amend OD-2J-1 — it cannot
 * arrive by someone storing this in `localStorage`.
 */
export type RevealState = {
  /** Keys currently revealed, for this render only. */
  readonly revealed: ReadonlySet<string>;
};

export const NO_REVEALS: RevealState = { revealed: new Set<string>() };

export function isRevealed(state: RevealState, key: string): boolean {
  return state.revealed.has(key);
}

/**
 * Resolves what a surface should actually render for one item, folding in any
 * active local reveal.
 *
 * Note that `omit` ignores the reveal entirely: a notification payload cannot
 * be "revealed", because by the time the user could act the content has already
 * left the application.
 */
export function resolveContent(
  surface: GovernedSurface,
  level: SensitivityLevel,
  key: string,
  state: RevealState = NO_REVEALS,
): { readonly show: boolean; readonly masked: boolean; readonly revealable: boolean } {
  const presentation = presentationFor(surface, level);
  if (presentation.outcome === "omit") return { show: false, masked: false, revealable: false };
  if (presentation.outcome === "show") return { show: true, masked: false, revealable: false };
  const revealed = isRevealed(state, key);
  return { show: revealed, masked: !revealed, revealable: true };
}

/** Narrows an unvalidated string from the database to the closed vocabulary. */
export function toSensitivityLevel(value: string | null | undefined): SensitivityLevel {
  // Fails **closed**: an unrecognised value is treated as the most protective
  // level, not the least. A row whose classification we cannot read is exactly
  // the row we should not be printing on a phone.
  return (SENSITIVITY_LEVELS as readonly string[]).includes(value ?? "")
    ? (value as SensitivityLevel)
    : "highly_sensitive";
}
