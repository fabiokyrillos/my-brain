/**
 * `2I-LANG-001` … `2I-LANG-005` — the product's state vocabulary, as data.
 *
 * ## Why this is a module and not a stylesheet convention
 *
 * Before this file, "attention" looked one way in Registros and another in
 * Trabalho, because each surface chose its own colour at the point of use. The
 * fix is not a palette document — those are ignored — but a **single declared
 * set that a guard can check**, so a surface that hard-codes a state colour
 * fails a test rather than a review.
 *
 * ## The two vocabularies here are deliberately separate
 *
 * A **tone** is what a thing *means* (attention, risk, an AI suggestion). A
 * **universal state** is what a surface is *doing right now* (loading, empty,
 * interpreting, failed). They are separate because the same tone serves several
 * states and the same state carries different tones — collapsing them produced
 * exactly the drift this slice exists to remove.
 *
 * ## Meaning is never carried by colour alone
 *
 * Every tone declares an `icon` and every state declares a `tone` **and** its
 * own text affordance. `2I-LANG-002` and `2I-LANG-006` are enforced by
 * `phase-2i-experience-guard.test.ts`, which fails when a tone has no icon.
 *
 * Dark mode ships (`2I-LANG-007` as restated by ADR-114, reversing owner
 * decision D5). It changes nothing in this module: a tone is a *meaning*, and a
 * meaning does not have a colour. `experience.css` maps each tone to a light and
 * a dark triplet; the guard asserts the dark set is complete rather than absent,
 * so the failure it prevents — a **partial** dark mode — is unchanged.
 */

/** What a thing means. Six, closed. */
export const EXPERIENCE_TONES = [
  "information",
  "success",
  "attention",
  "risk",
  "suggestion",
  "archived",
] as const;

export type ExperienceTone = (typeof EXPERIENCE_TONES)[number];

/**
 * What a surface is doing. Seven, closed.
 *
 * `interpreting` is first-class rather than a flavour of `loading`, and that is
 * the whole point of `2I-LANG-005`: since Phase 2X, `captureEntry` persists the
 * user's words and returns **before** the AI has run. A spinner over content
 * that is already durable tells the user their work might be lost. It is not.
 */
export const UNIVERSAL_STATES = [
  "empty",
  "loading",
  "interpreting",
  "interpretation_failed",
  "error_recoverable",
  "error_terminal",
  "offline",
] as const;

export type UniversalState = (typeof UNIVERSAL_STATES)[number];

/**
 * A tone's non-colour affordance.
 *
 * `icon` is a lucide-react icon *name*, resolved by the component rather than
 * imported here — this module is data and must stay importable from anywhere,
 * including a test that has no React.
 */
export type ToneDefinition = {
  readonly tone: ExperienceTone;
  /** The CSS custom-property suffix: `--tone-<token>-*`. */
  readonly token: string;
  /** lucide-react icon name. Present on every tone — that is the guard. */
  readonly icon: string;
};

export const TONE_DEFINITIONS: Readonly<Record<ExperienceTone, ToneDefinition>> = {
  information: { tone: "information", token: "information", icon: "Info" },
  success: { tone: "success", token: "success", icon: "CircleCheck" },
  attention: { tone: "attention", token: "attention", icon: "TriangleAlert" },
  risk: { tone: "risk", token: "risk", icon: "OctagonAlert" },
  suggestion: { tone: "suggestion", token: "suggestion", icon: "Sparkles" },
  archived: { tone: "archived", token: "archived", icon: "Archive" },
};

/**
 * How each universal state presents, and — the load-bearing part — whether the
 * user's content is safe in it.
 *
 * `contentIsSafe` exists because it is the single most important thing a state
 * can say in this product, and leaving it to per-surface copy is how a
 * reassurance gets forgotten on the one screen that needed it.
 */
export type UniversalStateDefinition = {
  readonly state: UniversalState;
  readonly tone: ExperienceTone;
  /** Does this state imply the user's content is already durable? */
  readonly contentIsSafe: boolean;
  /** Is there an action that can move the user out of this state? */
  readonly recoverable: boolean;
  /**
   * `2O-RECOVER-003` — does this state offer **a way to leave** rather than a
   * way to retry?
   *
   * Declared here rather than left to each call site, because the requirement
   * is a property of the *state* and not of the surface that happens to render
   * it. Before this field `error_terminal` was `recoverable: false` with a null
   * action label, so the one state that most needs an exit was the only state
   * in the vocabulary that could offer nothing at all — a dead end the user had
   * to escape with the browser's back button.
   *
   * Exit and retry are mutually exclusive by construction: the invariant in
   * `phase-2i-experience-guard.test.ts` refuses a state that claims both, so
   * "offer a retry on a terminal error" cannot be reintroduced by a later edit.
   */
  readonly offersExit: boolean;
  /** `aria-live` politeness, or null when the state is not announced. */
  readonly announce: "polite" | "assertive" | null;
};

export const UNIVERSAL_STATE_DEFINITIONS: Readonly<
  Record<UniversalState, UniversalStateDefinition>
> = {
  empty: { state: "empty", tone: "information", contentIsSafe: true, recoverable: true, offersExit: false, announce: null },
  loading: { state: "loading", tone: "information", contentIsSafe: true, recoverable: false, offersExit: false, announce: "polite" },
  // Saved, and still being read by the AI. The reassurance is the requirement.
  interpreting: { state: "interpreting", tone: "information", contentIsSafe: true, recoverable: false, offersExit: false, announce: "polite" },
  // The interpretation failed; the entry did not. Recoverable, and safe.
  interpretation_failed: { state: "interpretation_failed", tone: "attention", contentIsSafe: true, recoverable: true, offersExit: false, announce: "polite" },
  error_recoverable: { state: "error_recoverable", tone: "attention", contentIsSafe: true, recoverable: true, offersExit: false, announce: "polite" },
  // The only state that does not promise safety, because it cannot — and
  // therefore the only one that offers a way OUT instead of a way to retry.
  error_terminal: { state: "error_terminal", tone: "risk", contentIsSafe: false, recoverable: false, offersExit: true, announce: "assertive" },
  offline: { state: "offline", tone: "attention", contentIsSafe: true, recoverable: true, offersExit: false, announce: "polite" },
};

/**
 * `2O-RECOVER-003` — the states that must offer the user something to do.
 *
 * Derived from the vocabulary rather than listed by hand, so a state added
 * later is classified by its own definition instead of by whoever remembers to
 * extend a literal. A state qualifies as an error state when its tone is
 * `attention` or `risk` **and** it is not merely an absence of content.
 */
export const ERROR_STATES = UNIVERSAL_STATES.filter((state) => {
  const definition = UNIVERSAL_STATE_DEFINITIONS[state];
  return definition.tone === "attention" || definition.tone === "risk";
});

/** Does this state owe the user an action out of it? */
export function stateOwesAnAction(state: UniversalState): boolean {
  return (ERROR_STATES as readonly UniversalState[]).includes(state);
}

/** The CSS class a tone renders under. One place, so a guard can find it. */
export function toneClassName(tone: ExperienceTone): string {
  return `tone-${TONE_DEFINITIONS[tone].token}`;
}

/** The CSS class a universal state renders under. */
export function stateClassName(state: UniversalState): string {
  return `ux-state ux-state-${state.replace(/_/g, "-")}`;
}

export function isExperienceTone(value: unknown): value is ExperienceTone {
  return typeof value === "string" && (EXPERIENCE_TONES as readonly string[]).includes(value);
}

export function isUniversalState(value: unknown): value is UniversalState {
  return typeof value === "string" && (UNIVERSAL_STATES as readonly string[]).includes(value);
}
