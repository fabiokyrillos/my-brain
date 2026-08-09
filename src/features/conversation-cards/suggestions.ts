/**
 * `2K-SUGG-001` … `2K-SUGG-005` — contextual suggestions (OD-2K-4).
 *
 * ## What this replaces
 *
 * One hard-coded sentence. The chat empty state rendered
 * `pt ? "Experimente: «O que combinei com Marina?»" : "Try: …"` — a fixed
 * example, in an inline locale ternary, naming a person the user may not have.
 * A new user learned exactly one question shape; a returning user with a full
 * Brain saw the same string forever.
 *
 * ## Deterministic, and why that is a security property rather than a style
 *
 * T-2K-10: "contextual suggestions derived from current state" invites a model
 * call per page load — which spends the user's **own BYOK credential** on
 * something they did not ask for, on every render of the primary surface.
 * Caching would reduce the cost without making an unrequested billed call
 * legitimate.
 *
 * So this is a pure function over state the page already holds. No provider, no
 * `recordAIUsage`, no rate-limit slot, no confidence contract, no fail-closed
 * path — none of those exist here, and `phase-2k-suggestion-guard.test.ts`
 * fails the build if any appears. It is the same reasoning ADR-094 applied when
 * it refused to rank priorities with a model call.
 *
 * ## Why the value carries a category and a name, and never a sentence
 *
 * OD-2K-4 permits a suggestion to **name** a person or project the user can
 * currently read — a suggestion that cannot say "Marina" is not contextual —
 * and forbids that name from ever entering telemetry, which may carry a
 * **closed category** only.
 *
 * Keeping the two apart in the *type* is what makes that enforceable: the
 * category is an enum, the name is a separate field, and a telemetry payload
 * built from a suggestion can take the first without being able to reach the
 * second. Copy renders the sentence; this module never produces one.
 *
 * ## Sensitivity, stated rather than assumed
 *
 * `people` and `projects` carry **no `sensitivity` column** — the threat model
 * records this, and the generated types confirm it. So there is no
 * classification to consult and nothing to mask: these are the user's own
 * names, on their own screen, behind RLS. The masking analysis that applies to
 * entries and memories does **not** transfer here, which is exactly why
 * OD-2K-B keeps people and projects out of mutation and why this module only
 * ever reads what the caller already fetched under RLS.
 *
 * ## Zero is a legitimate answer
 *
 * OD-2K-4: *if none is honestly appropriate, show none.* A user with no people
 * and no projects gets an empty list, and the surface falls back to saying what
 * it already says. Inventing an example for them is what this slice removes.
 */

/**
 * The closed category vocabulary.
 *
 * This is the **only** thing telemetry may carry about a suggestion
 * (`2K-SUGG-005`). It is declared here rather than in the analytics contract so
 * that the value and its category cannot drift apart; slice 2K.8 derives the
 * event's property from this list.
 */
export const SUGGESTION_CATEGORIES = ["person", "project"] as const;
export type SuggestionCategory = (typeof SUGGESTION_CATEGORIES)[number];

/**
 * A suggestion, as a value.
 *
 * Deliberately **not** a string. A rendered sentence could be logged whole; a
 * `{category, name}` pair makes "log the category, never the name" a property
 * of the shape rather than of a caller's care.
 */
export type ConversationSuggestion = {
  readonly category: SuggestionCategory;
  /** The object's id, so the surface can link without re-deriving it. */
  readonly id: string;
  /** The user's own name for their own thing. Never enters telemetry. */
  readonly name: string;
};

/** OD-2K-4's hard cap. */
export const MAX_SUGGESTIONS = 3;

export type SuggestionInputs = {
  /** People the caller already read under RLS, most recently touched first. */
  readonly people: readonly { readonly id: string; readonly name: string }[];
  /** Projects the caller already read under RLS, most recently touched first. */
  readonly projects: readonly { readonly id: string; readonly name: string }[];
};

/**
 * Derives at most three suggestions, deterministically.
 *
 * ## The ordering is fixed, and that is the determinism
 *
 * People first, then projects, each in the order the caller supplied — which is
 * "most recently touched" and is already a deterministic ordering from the
 * database. Nothing here samples, shuffles, scores or randomises, so the same
 * state always produces the same three, which is what makes the result
 * reviewable and what a model call could never promise.
 *
 * ## Interleaved rather than "all the people first"
 *
 * Three slots and two sources: taking people first would let a user with three
 * people never see a project suggestion at all, which makes the feature look
 * like it only knows one kind of thing. Alternating spends the cap on variety,
 * and falls back cleanly when one source is empty.
 */
export function deriveConversationSuggestions(
  inputs: SuggestionInputs,
): readonly ConversationSuggestion[] {
  const people = inputs.people.map((person): ConversationSuggestion => ({
    category: "person",
    id: person.id,
    name: person.name,
  }));
  const projects = inputs.projects.map((project): ConversationSuggestion => ({
    category: "project",
    id: project.id,
    name: project.name,
  }));

  const interleaved: ConversationSuggestion[] = [];
  for (let index = 0; index < Math.max(people.length, projects.length); index += 1) {
    const person = people[index];
    const project = projects[index];
    if (person !== undefined) interleaved.push(person);
    if (project !== undefined) interleaved.push(project);
  }

  // A name that is blank or whitespace names nothing, and a suggestion that
  // reads "Ask me about  " is worse than no suggestion. Dropped rather than
  // rendered, which is OD-2K-4's "omit in doubt" applied to the smallest case.
  return interleaved.filter((suggestion) => suggestion.name.trim() !== "").slice(0, MAX_SUGGESTIONS);
}

/**
 * `2K-SUGG-005` — everything a telemetry event may know about a suggestion.
 *
 * Takes the whole suggestion and returns **only** the category. It exists so
 * the narrowing happens once, in a function whose return type has no field a
 * name could occupy, rather than at each call site by convention.
 *
 * The event itself is slice 2K.8's, which owns the telemetry vocabulary and its
 * migration. This is the shape that event may use, declared where the value
 * lives so the two cannot drift.
 */
export function suggestionTelemetryCategory(
  suggestion: ConversationSuggestion,
): { readonly category: SuggestionCategory } {
  return { category: suggestion.category };
}
