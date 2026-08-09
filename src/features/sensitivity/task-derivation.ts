/**
 * `2L-AUDIT-005` — OD-2L-1 **option B**, as an executable contract.
 *
 * ## What the owner signed, and what this module is
 *
 * Work was the last content surface outside `GOVERNED_SURFACES`, and `tasks`
 * carries **no classification column** — so there was nothing to read and the
 * posture was a decision rather than a task. The owner signed **option B**:
 * a task's sensitivity is **derived from its source entry**, consulted at
 * presentation time and **never durably copied onto the task**. Option C —
 * classifying tasks — stays out of this phase entirely, and option A (declare an
 * evidenced negative and mask nothing) was the recommendation the owner
 * overrode in favour of coverage.
 *
 * This module is the derivation half and nothing more. It answers *what level
 * applies to this task*; it does not decide what a surface renders. That is
 * `presentationFor`/`resolveContent` in `contracts.ts`, and `work` joins
 * `GOVERNED_SURFACES` in the slice that ships a consumer for it — because a
 * governed surface with no consumer is a producer nobody reads, which this
 * repository has already paid for twice.
 *
 * ## Why the answer is a three-arm value and not a level
 *
 * The contract has **three** outcomes and only two of them are levels:
 *
 *   1. a task with a readable source → the source's **current** level;
 *   2. a task with a source that cannot be read → the **most protective** level;
 *   3. a task with **no** source → *no derivable classification at all*.
 *
 * Case 3 is the one the type exists for. The owner's contract says manual tasks
 * are **never artificially classified** and that the absence of a source is
 * **never inferred to mean `normal`** — and a boolean flag beside a
 * `SensitivityLevel` would be one careless destructure away from doing exactly
 * that. `undetermined` has **no `level` field to misread**, so "this was never
 * classified" cannot decay into "this is normal" by accident. It is the same
 * move `2K-SRC` made when it refused to let `citations.length === 0` stand for
 * two different facts.
 *
 * Cases 2 and 3 are deliberately **not** merged, even though both are absences.
 * "I have no source" is a fact about the task; "I have a source I cannot read"
 * is a fact about the read. Collapsing them would render content the owner
 * asked to be protected.
 *
 * ## Why unreadability is expressed as absence from a map
 *
 * The caller passes the levels it actually read, keyed by entry id, from a query
 * scoped to the caller's own rows and bounded to the ids on the page — the shape
 * `attention-projection.ts` already uses. A **removed** entry, a **foreign**
 * entry and an entry the read simply could not return are therefore all one
 * thing here: *absent from the map*. There is no branch that could distinguish
 * them, so there is no branch that could leak which one it was
 * (`2L-PRIVACY-005`).
 *
 * That also keeps the authority story trivial (`2L-PRIVACY-006`): this module
 * performs no I/O, holds no client, and cannot widen a scope it never sees.
 */

import { toSensitivityLevel, type SensitivityLevel } from "./contracts";

/**
 * What classification, if any, applies to one task.
 *
 * `undetermined` carries no level **by construction**. See the module comment:
 * that absence is the requirement, not an omission.
 */
export type TaskSensitivity =
  | { readonly kind: "derived"; readonly level: SensitivityLevel }
  | { readonly kind: "undetermined" };

/** The single `undetermined` value, so call sites compare rather than rebuild. */
export const UNDETERMINED: TaskSensitivity = { kind: "undetermined" };

/**
 * The level a task with an unreadable source resolves to.
 *
 * Named rather than inlined so the choice is greppable and so a future edit that
 * softened it would be visible in a diff as a changed constant instead of as a
 * changed string literal three files deep.
 */
const MOST_PROTECTIVE: SensitivityLevel = "highly_sensitive";

/**
 * Whether this value carries a level a surface may act on.
 *
 * A type guard rather than a boolean helper, so a caller that narrows gets the
 * `level` field and a caller that does not, cannot reach it.
 */
export function isDerivedLevel(
  value: TaskSensitivity,
): value is { readonly kind: "derived"; readonly level: SensitivityLevel } {
  return value.kind === "derived";
}

/**
 * Derives one task's classification from its source entry.
 *
 * @param sourceEntryId  The task's `source_entry_id`. `null`, `undefined` or an
 *   empty string all mean *this task was not derived from an entry* — an empty
 *   string is treated as no source rather than as a lookup, because a `""` that
 *   reached here was built from something absent, and looking it up would find
 *   nothing and produce the far stronger *unreadable* answer instead.
 * @param readableSourceLevels  The `sensitivity` values the caller actually read,
 *   keyed by entry id, from an **owner-scoped** query bounded to the ids on the
 *   page. Absence means unreadable, in every sense at once.
 */
export function deriveTaskSensitivity(
  sourceEntryId: string | null | undefined,
  readableSourceLevels: ReadonlyMap<string, string | null>,
): TaskSensitivity {
  if (!sourceEntryId) return UNDETERMINED;
  if (!readableSourceLevels.has(sourceEntryId)) {
    return { kind: "derived", level: MOST_PROTECTIVE };
  }
  // `toSensitivityLevel` already fails closed on `null` and on any value outside
  // the closed vocabulary, so a row whose classification cannot be read is the
  // row this does not print.
  return { kind: "derived", level: toSensitivityLevel(readableSourceLevels.get(sourceEntryId)) };
}
