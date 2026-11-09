/**
 * `2K-SUGG-001` … `2K-SUGG-005` — contextual suggestions (OD-2K-4), extended by
 * Life Brain B.7 (T7) with the time and state categories.
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
 * The owner asked for *intelligent* suggestions on 5 November 2026 ("se tiver um
 * aniversário de alguém chegando, mostrar na sugestão"). Intelligent here means
 * **derived from real signals, deterministically** — which is also the better
 * product: instant, free per load, and reviewable, because the same state always
 * produces the same three.
 *
 * ## The module reads nothing, and that is the shape of the guard
 *
 * The guard is stricter than "do not call the model": it refuses `async`,
 * `await`, `fetch(` and any client in this file. So the derivation cannot fetch
 * — the **page** reads the rows in the `Promise.all` it already runs, buckets
 * them against the owner's own local day, and hands them over ready, exactly as
 * it has always done for `people` and `projects`. What lives here is the
 * ordering, the cap, the scope and the mask; the reading lives in
 * `suggestion-sources.ts`.
 *
 * That split is also what makes the mask testable: whoever reads the database
 * resolves a classification, and this module refuses to name what came back
 * withheld.
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
 * ## Sensitivity, stated rather than assumed — and restated for the new rows
 *
 * `people` and `projects` carry **no `sensitivity` column** — the threat model
 * records this, and the generated types confirm it. So there is no
 * classification to consult and nothing to mask: these are the user's own
 * names, on their own screen, behind RLS.
 *
 * **That reasoning does not transfer to the categories below it.** A task, a
 * reminder, a pending question and a record all derive a level from their source
 * entry, and `entries.sensitivity` exists. The Home already withholds a
 * `highly_sensitive` row behind "Conteúdo muito sensível, oculto", so a
 * suggestion printing the same title on the opening screen would be that mask,
 * walked around. Every dated row therefore arrives carrying the
 * `TaskSensitivity` its caller resolved, and `readable` below refuses to name
 * anything the conversation surface would have withheld — it drops the row
 * rather than masking it, because a suggestion whose whole purpose is to name a
 * subject says nothing once the subject is hidden, and because its mere
 * presence would still report that such a row exists (`2K-PRIVACY-002`).
 *
 * ## Zero is a legitimate answer
 *
 * OD-2K-4: *if none is honestly appropriate, show none.* A user with no people
 * and no projects gets an empty list, and the surface falls back to saying what
 * it already says. Inventing an example for them is what this slice removes.
 */

import {
  resolveConversationContent,
  type TaskSensitivity,
} from "@/features/sensitivity/task-derivation";

/**
 * The closed category vocabulary, **in precedence order**.
 *
 * This is the **only** thing telemetry may carry about a suggestion
 * (`2K-SUGG-005`). It is declared here rather than in the analytics contract so
 * that the value and its category cannot drift apart; slice 2K.8 derives the
 * event's property from this list.
 *
 * The order is the rule the owner asked for — *urgency first* (late, then
 * today, then what is coming), then the open loops, then the subjects that are
 * always available. Expressing it as the order of the vocabulary rather than as
 * a comparator means a reader does not have to find a scoring function to know
 * which category wins, and an edit that changes the priority is visible in a
 * diff as a reordered list. Nothing here scores, samples or randomises.
 *
 * The six dated categories come first and the two subject categories last,
 * which is also how the derivation consumes it: one pick from each dated
 * bucket, then the interleaved subjects fill whatever slots are left.
 */
export const SUGGESTION_CATEGORIES = [
  "overdue_task",
  "due_today",
  "reminder_soon",
  "birthday_soon",
  "open_question",
  "unreviewed_entry",
  "person",
  "project",
] as const;
export type SuggestionCategory = (typeof SUGGESTION_CATEGORIES)[number];

/*
 * EVERY category is reportable, and it took a migration to say so.
 *
 * This is where `REPORTABLE_SUGGESTION_CATEGORIES` used to be. B.7 shipped
 * without a migration, so `conversation_suggestion_shown.category` was
 * validated against `array['person', 'project']` and the six dated categories
 * were rendered and **not reported**; that list existed to make the gap a
 * visible declaration rather than six events a fail-open writer silently
 * swallowed. The owner authorized the migration on 6 November 2026 (ADR-161),
 * `202611060108` widened both database gates, and the list came out in the same
 * pull request, **after** it.
 *
 * The ordering is the whole discipline and not a detail: a producer that names
 * a category the deployed chain refuses is rejected `22023` at the last real
 * write path, inside a `.catch(() => {})`, so the code reads as instrumented
 * and the ledger stays empty. That is `202608080087` and `202608090089`, twice.
 * `phase-2m-telemetry-guard.test.ts` now holds `SUGGESTION_CATEGORIES` itself to
 * the migration chain, so a ninth category added here without SQL fails in CI
 * rather than in production silence.
 */

/**
 * A suggestion, as a value.
 *
 * Deliberately **not** a string. A rendered sentence could be logged whole; a
 * `{category, name}` pair makes "log the category, never the name" a property
 * of the shape rather than of a caller's care.
 *
 * Note what it does **not** carry: no instant and no classification. The level
 * was consulted during derivation and has no business travelling to a surface —
 * a renderer holding one would be a renderer that could decide for itself,
 * which is what `2L-PRIVACY-007`'s convergence exists to prevent.
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

/** A person or a project: a name with no classification to consult. */
export type SuggestionSubject = {
  readonly id: string;
  readonly name: string;
};

/**
 * One dated row the caller already read under RLS.
 *
 * `at` is the instant that orders the row inside its own bucket — a due date, a
 * reminder's time, the next birthday, the moment a question was asked. It is
 * **not** rendered and never leaves this module, so no surface can print a date
 * this derivation chose.
 *
 * `sensitivity` is required rather than optional, and that is the point: a new
 * bucket cannot be added without the author answering what happens to a
 * `highly_sensitive` row, because the type will not compile until they do.
 */
export type SuggestionItem = {
  readonly id: string;
  readonly name: string;
  readonly at: string;
  readonly sensitivity: TaskSensitivity;
};

/** The subject a scoped conversation is about (`2P-CHAT-005`'s handle). */
export type SuggestionScope = {
  readonly type: "person" | "project" | "organization" | "context";
  readonly id: string;
};

export type SuggestionInputs = {
  /** People the caller already read under RLS, most recently touched first. */
  readonly people: readonly SuggestionSubject[];
  /** Projects the caller already read under RLS, most recently touched first. */
  readonly projects: readonly SuggestionSubject[];
  /** Open tasks whose due date is already past, in the owner's own day. */
  readonly overdueTasks?: readonly SuggestionItem[];
  /** Open tasks due today, in the owner's own day. */
  readonly tasksDueToday?: readonly SuggestionItem[];
  /** Reminders scheduled inside the next two days. */
  readonly remindersSoon?: readonly SuggestionItem[];
  /** Birthdays inside the next two weeks, with the next occurrence as `at`. */
  readonly birthdaysSoon?: readonly SuggestionItem[];
  /** Questions the agent asked and the owner has not answered. */
  readonly openQuestions?: readonly SuggestionItem[];
  /** Records that are organized but still waiting on the owner. */
  readonly unreviewedEntries?: readonly SuggestionItem[];
  /**
   * Life Brain B.7 defect 3. The subject this conversation is already about.
   *
   * The owner found "Perguntando sobre Família" offering "Quando fui ao médico
   * pela última vez?" — a chip with nothing to do with the scope the banner
   * above it announces. When a scope is present the only honest suggestion is
   * one about that subject, so everything else is dropped and zero is the
   * frequent answer.
   */
  readonly scope?: SuggestionScope | null;
};

/** The dated categories, each paired with the bucket it reads. */
const DATED_BUCKETS = {
  overdue_task: (inputs: SuggestionInputs) => inputs.overdueTasks ?? [],
  due_today: (inputs: SuggestionInputs) => inputs.tasksDueToday ?? [],
  reminder_soon: (inputs: SuggestionInputs) => inputs.remindersSoon ?? [],
  birthday_soon: (inputs: SuggestionInputs) => inputs.birthdaysSoon ?? [],
  open_question: (inputs: SuggestionInputs) => inputs.openQuestions ?? [],
  unreviewed_entry: (inputs: SuggestionInputs) => inputs.unreviewedEntries ?? [],
} as const satisfies Partial<Record<SuggestionCategory, (inputs: SuggestionInputs) => readonly SuggestionItem[]>>;

type DatedSuggestionCategory = keyof typeof DATED_BUCKETS;

function isDated(category: SuggestionCategory): category is DatedSuggestionCategory {
  return Object.hasOwn(DATED_BUCKETS, category);
}

/**
 * Whether this row may be **named** on the conversation surface.
 *
 * Two refusals, and they are different refusals. A blank name names nothing, so
 * a suggestion built from it would read as a sentence with a hole in it. A
 * withheld classification means the Home would have masked this row, and naming
 * it here would be the way around that mask.
 */
function readable(item: SuggestionItem): boolean {
  if (item.name.trim() === "") return false;
  const presentation = resolveConversationContent(item.sensitivity, item.id);
  return presentation.show && !presentation.masked;
}

/**
 * Earliest first, then by id.
 *
 * The id tiebreak is not decoration: two reminders can share an instant to the
 * second, and without it the pick would depend on the order the database
 * happened to return — which is the one thing a reviewable derivation may not
 * depend on.
 */
function byInstantThenId(left: SuggestionItem, right: SuggestionItem): number {
  if (left.at !== right.at) return left.at < right.at ? -1 : 1;
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}

function subjectSuggestions(
  category: "person" | "project",
  subjects: readonly SuggestionSubject[],
): ConversationSuggestion[] {
  return subjects.map((subject) => ({ category, id: subject.id, name: subject.name }));
}

/**
 * Derives at most three suggestions, deterministically.
 *
 * ## The ordering is fixed, and that is the determinism
 *
 * `SUGGESTION_CATEGORIES` is the precedence, read top to bottom. Each dated
 * bucket contributes **at most one** row — its earliest readable one — and the
 * people and projects then fill whatever slots are left, interleaved. Nothing
 * here samples, shuffles, scores or randomises, so the same state always
 * produces the same three, which is what makes the result reviewable and what a
 * model call could never promise.
 *
 * ## One per dated bucket, rather than the three latest tasks
 *
 * Three slots and eight categories. Letting one bucket fill the cap would show
 * an owner with three late tasks three variations of the same question, and
 * would hide the birthday that was the owner's own example of a useful
 * suggestion. One each spends the cap on *kinds*, which is the same reasoning
 * the people/projects interleave below already follows.
 *
 * ## Interleaved rather than "all the people first"
 *
 * Taking people first would let a user with three people never see a project
 * suggestion at all, which makes the feature look like it only knows one kind
 * of thing. Alternating spends the cap on variety, and keeps going cleanly when
 * one source is empty.
 *
 * ## A withheld row costs the owner nothing
 *
 * `readable` filters **before** the pick, not after, so a masked late task does
 * not consume the slot its category was offered: the next readable row in the
 * same bucket takes it, and if there is none the next category does.
 */
export function deriveConversationSuggestions(
  inputs: SuggestionInputs,
): readonly ConversationSuggestion[] {
  const candidates = inputs.scope
    ? scopedSuggestions(inputs, inputs.scope)
    : openSuggestions(inputs);

  // A name that is blank or whitespace names nothing, and a suggestion that
  // reads "Ask me about  " is worse than no suggestion. Dropped rather than
  // rendered, which is OD-2K-4's "omit in doubt" applied to the smallest case.
  return candidates.filter((suggestion) => suggestion.name.trim() !== "").slice(0, MAX_SUGGESTIONS);
}

/**
 * Life Brain B.8 (ADR-163) — one choice the model made: a category and the id of
 * a row this derivation offered. It carries no text, so nothing a model writes
 * can reach the surface: the sentence is still `copy.byCategory` applied to the
 * row's own current name.
 */
export type SuggestionPick = {
  readonly category: SuggestionCategory;
  readonly id: string;
};

/**
 * Every suggestion the model may choose from — the same rows, under the same
 * `readable` rule, that the derivation itself chooses from.
 *
 * Unlike `deriveConversationSuggestions`, a dated bucket offers **all** its
 * readable rows rather than its earliest one, because choosing between them is
 * the model's whole job. A scoped conversation offers its one subject and
 * nothing else, so a scope leaves the model nothing to choose.
 */
export function suggestionCandidates(inputs: SuggestionInputs): readonly ConversationSuggestion[] {
  if (inputs.scope) return scopedSuggestions(inputs, inputs.scope);

  const dated: ConversationSuggestion[] = [];
  for (const category of SUGGESTION_CATEGORIES) {
    if (!isDated(category)) continue;
    for (const item of [...DATED_BUCKETS[category](inputs)].filter(readable).sort(byInstantThenId)) {
      dated.push({ category, id: item.id, name: item.name });
    }
  }
  const subjects = [
    ...subjectSuggestions("person", inputs.people),
    ...subjectSuggestions("project", inputs.projects),
  ];
  return [...dated, ...subjects].filter((suggestion) => suggestion.name.trim() !== "");
}

/**
 * The model's picks, resolved against today's candidates.
 *
 * A pick that names a row no longer offered — completed since the model chose
 * it, now withheld, or never offered at all — is dropped, as is a repeat. The
 * cap holds here too. An empty result means the caller shows the derivation.
 */
export function suggestionsFromPicks(
  picks: readonly SuggestionPick[],
  candidates: readonly ConversationSuggestion[],
): readonly ConversationSuggestion[] {
  const chosen: ConversationSuggestion[] = [];
  const seen = new Set<string>();
  for (const pick of picks) {
    const key = `${pick.category}:${pick.id}`;
    if (seen.has(key)) continue;
    const match = candidates.find((candidate) => candidate.category === pick.category && candidate.id === pick.id);
    if (match === undefined) continue;
    seen.add(key);
    chosen.push(match);
    if (chosen.length === MAX_SUGGESTIONS) break;
  }
  return chosen;
}

/**
 * The scoped answer: this subject, or nothing.
 *
 * An organization and an area have no suggestion sentence of their own, so they
 * resolve to zero rather than to a generic question — and a scope naming
 * something the reader does not own resolves to zero by the same path, which
 * means the surface draws identically whether the subject is absent or
 * someone else's.
 */
function scopedSuggestions(
  inputs: SuggestionInputs,
  scope: SuggestionScope,
): ConversationSuggestion[] {
  if (scope.type === "person" || scope.type === "project") {
    const subjects = scope.type === "person" ? inputs.people : inputs.projects;
    const match = subjects.find((subject) => subject.id === scope.id);
    return match === undefined ? [] : subjectSuggestions(scope.type, [match]);
  }
  return [];
}

/** The unscoped answer: urgency first, then the subjects. */
function openSuggestions(inputs: SuggestionInputs): ConversationSuggestion[] {
  const dated: ConversationSuggestion[] = [];
  for (const category of SUGGESTION_CATEGORIES) {
    if (!isDated(category)) continue;
    const [earliest] = [...DATED_BUCKETS[category](inputs)].filter(readable).sort(byInstantThenId);
    if (earliest !== undefined) {
      dated.push({ category, id: earliest.id, name: earliest.name });
    }
  }

  const people = subjectSuggestions("person", inputs.people);
  const projects = subjectSuggestions("project", inputs.projects);
  const interleaved: ConversationSuggestion[] = [];
  for (let index = 0; index < Math.max(people.length, projects.length); index += 1) {
    const person = people[index];
    const project = projects[index];
    if (person !== undefined) interleaved.push(person);
    if (project !== undefined) interleaved.push(project);
  }

  return [...dated, ...interleaved];
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
