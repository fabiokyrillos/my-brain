/**
 * `2N-PRIVACY-001` … `2N-PRIVACY-011` — OD-2N-12 **option A** and ADR-110, as an
 * executable contract for the four contextual surfaces.
 *
 * ## What this adds that `task-derivation.ts` did not
 *
 * Work needed a derivation because `tasks` carries **no classification column**:
 * a task's level had to be chased through `source_entry_id`. The subjects here
 * are the opposite case — `entries`, `memories` and `attachments` each carry
 * their own `sensitivity` — so the obvious implementation is "read the column
 * and render it".
 *
 * That obvious implementation is the bug. A column exists on the row *the query
 * returned*; it says nothing about the row the query **could not** return. A
 * person page joins entries, memories and attachments through relationship
 * tables, and a join that comes back short does so silently: the id is on the
 * page, the classified row is not, and the fail-open reading prints whatever it
 * has. So this keeps `task-derivation.ts`'s three-arm answer even though the
 * levels are closer to hand:
 *
 *   1. a subject whose classified row was read → that row's **current** level;
 *   2. a subject whose row is **absent from the map** → the **most protective**
 *      level;
 *   3. a subject with **no classified row to look for** → *no derivable
 *      classification at all*.
 *
 * ## Removed, foreign and unreadable are one thing here, by construction
 *
 * `2N-PRIVACY-005` forbids the interface distinguishing them, and the way to
 * guarantee that is to have no branch that *could*. The caller passes the levels
 * it actually read, keyed by id, from an owner-scoped query bounded to the ids
 * on the page. A deleted row, a row belonging to someone else and a row the read
 * simply failed to return are therefore all **absent from the map** — the same
 * input, so necessarily the same output.
 *
 * That also keeps the authority story trivial (`2N-SEC-002`): this module
 * performs no I/O, holds no client, and cannot widen a scope it never sees.
 * Ownership stays RLS-and-query only, and nothing here is load-bearing for
 * isolation.
 *
 * ## The field that has no classification at all
 *
 * `people.notes` is not a subject with an unreadable row — it is free text with
 * **no `sensitivity` column anywhere to read**, on a table `2N-PRIVACY-003`
 * forbids adding one to. ADR-110 Decision 4 masks it by default, and
 * `deriveFreeTextSensitivity` is that posture. It resolves to the most
 * protective level and **not** to `undetermined`, because `undetermined` renders
 * in the clear: the two absences make different claims, and collapsing them
 * would publish the single most likely place in this product for something
 * genuinely private about a named human being.
 *
 * **Nothing here is persisted.** `people` and `projects` gain no classification
 * column (`2N-PRIVACY-003`), this module writes nothing, and the level is
 * re-derived at render time from the current row (`2N-KNOWS-007`).
 */

import { resolveContent, type RevealState, type SensitivityLevel, NO_REVEALS, toSensitivityLevel } from "./contracts";
import { isDerivedLevel, UNDETERMINED, type TaskSensitivity } from "./task-derivation";

/**
 * The classification of one contextual subject.
 *
 * Deliberately the **same type** as `TaskSensitivity` rather than a parallel
 * one. The question "what level applies, if any" has one closed answer in this
 * product, and a second three-arm union would be a second vocabulary to keep in
 * step — the failure `2N-PERSON-003` spends a whole requirement preventing one
 * domain over. The alias exists so a reader of a memory page is not asked to
 * think about tasks.
 */
export type SubjectSensitivity = TaskSensitivity;

/**
 * The level a subject with an unreadable row resolves to.
 *
 * Named rather than inlined for the reason `task-derivation.ts` gives: a future
 * edit that softened it is visible in a diff as a changed constant instead of as
 * a changed string literal several files deep.
 */
const MOST_PROTECTIVE: SensitivityLevel = "highly_sensitive";

/**
 * Derives one subject's classification from the classified rows the caller read.
 *
 * @param subjectId  The entry, memory or attachment id this content belongs to.
 *   `null`, `undefined` and `""` all mean *there is no classified row to look
 *   for* — an empty string is treated as absence rather than as a lookup,
 *   because a `""` that reached here was built from something missing and
 *   looking it up would produce the far stronger *unreadable* answer instead.
 * @param readableLevels  The `sensitivity` values the caller actually read,
 *   keyed by id, from an **owner-scoped** query bounded to the ids on the page.
 *   Absence means unreadable, in every sense at once.
 */
export function deriveSubjectSensitivity(
  subjectId: string | null | undefined,
  readableLevels: ReadonlyMap<string, string | null>,
): SubjectSensitivity {
  if (!subjectId) return UNDETERMINED;
  if (!readableLevels.has(subjectId)) return { kind: "derived", level: MOST_PROTECTIVE };
  // `toSensitivityLevel` already fails closed on `null` and on any value outside
  // the closed vocabulary, so a row whose classification cannot be read is the
  // row this does not print.
  return { kind: "derived", level: toSensitivityLevel(readableLevels.get(subjectId)) };
}

/**
 * `2N-PRIVACY-009` — the posture of owner-typed free text, ADR-110 Decision 4.
 *
 * ## Why this takes no parameters at all
 *
 * It cannot be handed the note. That is the requirement, not an oversight:
 * ADR-110 Decision 7 forbids inferring a level from a note's text, and a rule
 * enforced by "callers promise not to look" is weaker than a signature that
 * cannot accept it. This is the same move `notificationCopy` makes in
 * `contracts.ts`, for the same reason.
 *
 * It also takes no map, because there is nothing to look up. A note's absence of
 * classification is not a failed read that better plumbing could fix — `people`
 * carries no `sensitivity` column and `2N-PRIVACY-003` forbids adding one. The
 * answer is constant because the fact is.
 *
 * Returning `derived` rather than `undetermined` is the whole point:
 * `undetermined` is the shown-in-the-clear arm, and **absence of classification
 * never resolves to `normal`**.
 */
export function deriveFreeTextSensitivity(): SubjectSensitivity {
  return { kind: "derived", level: MOST_PROTECTIVE };
}

/**
 * The four surface resolvers.
 *
 * One named function per surface, each carrying its literal inline, for the
 * reason `task-derivation.ts` records: the literals live in a derivation module
 * and nowhere else, so a guard can assert no surface answers for itself by
 * grepping for `resolveContent("<name>"`. A `surface` parameter would move the
 * literal to every call site and make that check impossible to write.
 *
 * The `undetermined` arm never consults a rule. It does not look a level up and
 * does not pass `"normal"` to anything — it produces the shown answer directly,
 * because `2N-PRIVACY-005` says the absence of a classification is never
 * *inferred* to mean `normal`. The rendered result matches `normal`'s; the
 * reasoning must not.
 */
export function resolvePersonContent(
  sensitivity: SubjectSensitivity,
  key: string,
  state: RevealState = NO_REVEALS,
): { readonly show: boolean; readonly masked: boolean; readonly revealable: boolean } {
  if (!isDerivedLevel(sensitivity)) return { show: true, masked: false, revealable: false };
  return resolveContent("person", sensitivity.level, key, state);
}

export function resolveProjectContent(
  sensitivity: SubjectSensitivity,
  key: string,
  state: RevealState = NO_REVEALS,
): { readonly show: boolean; readonly masked: boolean; readonly revealable: boolean } {
  if (!isDerivedLevel(sensitivity)) return { show: true, masked: false, revealable: false };
  return resolveContent("project", sensitivity.level, key, state);
}

export function resolveMemoryContent(
  sensitivity: SubjectSensitivity,
  key: string,
  state: RevealState = NO_REVEALS,
): { readonly show: boolean; readonly masked: boolean; readonly revealable: boolean } {
  if (!isDerivedLevel(sensitivity)) return { show: true, masked: false, revealable: false };
  return resolveContent("memory", sensitivity.level, key, state);
}

export function resolveFileContent(
  sensitivity: SubjectSensitivity,
  key: string,
  state: RevealState = NO_REVEALS,
): { readonly show: boolean; readonly masked: boolean; readonly revealable: boolean } {
  if (!isDerivedLevel(sensitivity)) return { show: true, masked: false, revealable: false };
  return resolveContent("file", sensitivity.level, key, state);
}

/**
 * `2N-RELATION-006`/`-007` — the relations surface, added in 2N.6 with its
 * consumer.
 *
 * Its one governed subject is `person_relationships.description`, which reaches
 * this through `deriveFreeTextSensitivity` rather than through
 * `deriveSubjectSensitivity`: there is no classified row to look for, so the
 * answer is constant because the fact is. Everything else that surface renders
 * is a structural identifier or a localized vocabulary term.
 */
export function resolveGraphContent(
  sensitivity: SubjectSensitivity,
  key: string,
  state: RevealState = NO_REVEALS,
): { readonly show: boolean; readonly masked: boolean; readonly revealable: boolean } {
  if (!isDerivedLevel(sensitivity)) return { show: true, masked: false, revealable: false };
  return resolveContent("graph", sensitivity.level, key, state);
}

/**
 * Builds the map the derivations consume, from rows the caller already read.
 *
 * Exists so every contextual surface builds it the same way rather than each
 * assembling a `Map` inline — `2N-PRIVACY-001` requires the surfaces to converge
 * on one contract, and the map's construction is where a surface could quietly
 * diverge by, say, defaulting a missing `sensitivity` to `"normal"` on the way
 * in. Rows whose id is absent or unusable are **skipped**, so they stay absent
 * from the map and reach the most protective arm.
 */
export function readableLevelsOf(
  rows: readonly { readonly id: string | null; readonly sensitivity?: string | null }[] | null | undefined,
): ReadonlyMap<string, string | null> {
  const levels = new Map<string, string | null>();
  for (const row of rows ?? []) {
    if (!row?.id) continue;
    levels.set(row.id, row.sensitivity ?? null);
  }
  return levels;
}
