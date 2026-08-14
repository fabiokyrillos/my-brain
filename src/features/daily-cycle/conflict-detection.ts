/**
 * The conflict detector (`2N-CONFLICT-001`/`002`).
 *
 * ## What it is allowed to be
 *
 * Pure, deterministic, read-time. No clock, no I/O, no Supabase, no provider, no
 * embedding, no persistence. `OD-2N-7` **A** signs derivation *from existing
 * data* with **no conflict table and no persisted conflict lifecycle**, so there
 * is nothing here that writes and nothing here that remembers. A conflict exists
 * exactly as long as the data satisfies the predicate, and stops existing the
 * instant it does not — there is no resolved flag, because there is no row.
 *
 * ## Why exactly one member
 *
 * The enumeration `2N-CONFLICT-001` demands ran first
 * (`docs/reports/phase-2n/PHASE_2N_SLICE_4_CONFLICT_ENUMERATION.md`) and
 * examined eight candidates. Seven are excluded **by name**: two are detectable
 * but complementary rather than contradictory, one needs semantics, one would be
 * an existence oracle across tenants, one would use `confidence` as precedence —
 * the exact thing `OD-2N-7` A forbids — one is already refused by a database
 * CHECK and so can never have a member, and one has no owner-facing action and is
 * refused by `2N-CONFLICT-005`.
 *
 * A wider detector was available and is deliberately not here. A family of one
 * that is true beats a family of six that is mostly guessing.
 *
 * ## The measured asymmetry this exists for
 *
 * `public.entity_aliases` carries
 * `CHECK ((valid_to IS NULL) OR (valid_from IS NULL) OR (valid_to >= valid_from))`.
 * `public.memories` carries **no such check** — verified against every one of the
 * 94 migrations and read live from `pg_constraint`. So one table in this schema
 * cannot hold an inverted window and its sibling can.
 *
 * And when it does, `memoryLifecycleState` resolves the row to `archived`,
 * because *archived wins over scheduled*. That is right for the code and wrong
 * about the world: the memory is not "no longer true", it is a pair of dates that
 * cannot both be right. This module is what lets the product say so.
 */

import { toSensitivityLevel, type SensitivityLevel } from "@/features/sensitivity/contracts";

import type { MemoryValidity } from "@/features/memories/lifecycle";

/**
 * The closed set of conflicts this product can detect. One member, and adding a
 * second is a documentation change before it is a code change — the enumeration
 * is the authorization, and `conflict-enumeration.test.ts` fails if this drifts
 * from it.
 */
export const CONFLICT_KINDS = ["memory_validity_window"] as const;

export type ConflictKind = (typeof CONFLICT_KINDS)[number];

/** The one action a detected conflict may offer. Closed, for the same reason. */
export const CONFLICT_ACTION_ID = "resolve_validity_conflict" as const;

export type MemoryConflictSource = {
  readonly memoryId: string;
  readonly content: string;
  /** Raw `memories.sensitivity`. Narrowed here, fail-closed. */
  readonly sensitivity: string | null;
  readonly validFrom: string | null;
  readonly validUntil: string | null;
};

export type MemoryValidityConflict = {
  readonly key: string;
  readonly kind: ConflictKind;
  readonly memoryId: string;
  readonly content: string;
  readonly sensitivity: SensitivityLevel;
  /** Both halves, always. `2N-CONFLICT-002` — neither is the winner. */
  readonly validFrom: string;
  readonly validUntil: string;
  readonly action: { readonly id: typeof CONFLICT_ACTION_ID; readonly href: string };
};

/**
 * Parse a timestamp the database produced, or `null`.
 *
 * The same fail-closed reading `memories/lifecycle.ts` applies to these two
 * columns, and for a stronger reason here: an unparseable value is a data fault,
 * and turning a fault into "your dates contradict each other" would accuse the
 * owner of something the value cannot support.
 */
function instant(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * The whole rule, and it is one comparison.
 *
 * **Strict.** `valid_from === valid_until` is *not* inverted: `entity_aliases`
 * permits exactly that (`valid_to >= valid_from`), and a memory true for a single
 * instant is unusual rather than impossible. A non-strict comparison would put an
 * item in the queue whose only honest action is "nothing is wrong", which
 * `2N-CONFLICT-005` refuses.
 *
 * **No clock.** The function takes one argument and there is nowhere for `now()`
 * to enter. An empty window is empty at every instant, so a rule that consulted
 * the time would make the same row a conflict today and not tomorrow.
 */
export function isInvertedValidityWindow(validity: MemoryValidity): boolean {
  const from = instant(validity.valid_from);
  const until = instant(validity.valid_until);
  if (from === null || until === null) return false;
  return from > until;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Derive every conflict in a page of the owner's own memories.
 *
 * The caller supplies rows it already read under RLS, so **owner scope is the
 * read's**, not a predicate this function could get wrong. A memory belonging to
 * someone else never arrives here, and one that does not exist never arrives
 * here — which is what makes absent, foreign and unreadable a single
 * indistinguishable case rather than three code paths with three behaviours.
 *
 * Deduplicated by memory id: a row cannot conflict with itself twice, and a
 * caller that passed the same row twice gets one item rather than a queue that
 * says the same thing again.
 */
export function detectMemoryValidityConflicts(
  rows: readonly MemoryConflictSource[],
): readonly MemoryValidityConflict[] {
  const conflicts: MemoryValidityConflict[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (!isNonEmptyString(row.memoryId) || !isNonEmptyString(row.content)) continue;
    if (seen.has(row.memoryId)) continue;
    if (!isInvertedValidityWindow({ valid_from: row.validFrom, valid_until: row.validUntil })) continue;
    // Narrowed above, and re-read here so the types carry what the guard proved.
    if (row.validFrom === null || row.validUntil === null) continue;

    seen.add(row.memoryId);
    conflicts.push(Object.freeze({
      key: `${row.memoryId}:memory_validity_window`,
      kind: "memory_validity_window" as const,
      memoryId: row.memoryId,
      content: row.content,
      // `2J-PRIVACY-003`'s posture, on a row that carries the owner's own words:
      // a classification we cannot read is treated as the most protective level,
      // never the least.
      sensitivity: toSensitivityLevel(row.sensitivity),
      validFrom: row.validFrom,
      validUntil: row.validUntil,
      // Locale-less on purpose. This module knows nothing about routing prefixes
      // and must stay pure; the projection prefixes the locale, exactly as it
      // does for every other attention item.
      action: { id: CONFLICT_ACTION_ID, href: `/app/memories/${row.memoryId}` },
    }));
  }

  return Object.freeze(conflicts);
}
