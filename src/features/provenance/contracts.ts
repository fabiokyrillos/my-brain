/**
 * `2N-PROV-001` … `2N-PROV-006`, `2N-RELATION-002`/`-008` — where a claim on a
 * contextual page came from, expressed as something the data can actually
 * support.
 *
 * ## The fact this module exists to respect
 *
 * `OD-2N-8` **option A** removed the provenance migration, so the three relation
 * tables — `person_relationships`, `person_projects`, `person_contexts` — carry
 * **no `source_entry_id` and no `interpretation_id`**, verified as 0 occurrences
 * across the migrations. A relation therefore cannot answer "where did this come
 * from" with a record, and *"you told me"* is the only truth available.
 *
 * `memories` and `tasks` are different: both **do** carry `source_entry_id`, so
 * those two — and only those two — can point at a real, openable entry.
 *
 * ## The trap that decides the whole shape of this module
 *
 * Both of those columns are declared `on delete set null`
 * (`202607160003:106`, `202607160006:6`). So a `NULL` `source_entry_id` means
 * **either** "nothing recorded a source" **or** "the source entry was deleted
 * and the foreign key nulled the column" — and nothing distinguishes them
 * afterwards. There is also at least one writer that inserts a memory with no
 * source at all (`operations/actions.ts`), so both readings really do occur.
 *
 * The tempting arm is to call a null source *owner-authored* and print
 * "informed by you". **That fabricates an origin.** For a memory whose entry the
 * owner deleted, "you told me this directly" is simply false, and it is false in
 * the direction that matters: it dresses an absence up as a positive claim about
 * where knowledge came from. So `null` resolves to **`unsourced`**, the same arm
 * as a source that will not resolve.
 *
 * *"Informed by you"* is reserved for the relation tables, where it is true **by
 * construction** rather than by inference — there is no column that could have
 * meant anything else, and the only writers are the owner's own actions.
 * `ownerAuthored` takes a closed union of exactly those three tables, so
 * `ownerAuthored("memories")` is a type error rather than a judgement call.
 *
 * ## Removed, foreign and unreadable are one arm, by construction
 *
 * The same rule `subject-derivation.ts` follows, for the same reason: the
 * interface must not distinguish them, and the way to guarantee that is to have
 * no branch that *could*. The caller passes the entry ids it actually resolved,
 * from an owner-scoped query bounded to the ids on the page. A deleted entry, an
 * entry belonging to someone else and an entry the read failed to return are all
 * **absent from that set** — the same input, so necessarily the same output.
 *
 * A null id and an unresolvable id also share the arm, which means the rendered
 * page cannot be used to test whether a particular entry id exists.
 *
 * ## What this module does not do
 *
 * No I/O, no client, no `user_id` parameter, and nothing persisted — provenance
 * is re-derived at render from rows the caller already read (`2N-PROV-005`: it
 * is read from stored data, and no provider call explains anything). It also
 * never reads content: no text, date or proximity heuristic infers a source, and
 * there is no signature here that could accept the content to guess from.
 */

/** Where one rendered claim came from. Closed: there is no fifth answer. */
export type Provenance =
  /** True by construction — the table carries no provenance column at all. */
  | { readonly kind: "owner-authored"; readonly table: OwnerAuthoredTable }
  /** A real entry, resolved and openable. */
  | { readonly kind: "sourced"; readonly entryId: string }
  /** No source recorded, or one that will not resolve. Deliberately one arm. */
  | { readonly kind: "unsourced" };

/**
 * The tables whose rows are owner-authored **by construction**.
 *
 * Closed on purpose. Adding a table here is a claim that it carries no
 * provenance column and no non-owner writer, which is exactly the kind of claim
 * that should be hard to make by accident — and `sql-provenance-guard` asserts
 * the first half of it against the migrations.
 */
export const OWNER_AUTHORED_TABLES = [
  "person_relationships",
  "person_projects",
  "person_contexts",
] as const;

export type OwnerAuthoredTable = (typeof OWNER_AUTHORED_TABLES)[number];

/**
 * The origin of a row on a table that has no way to record one.
 *
 * Takes the table rather than nothing, so the claim is stated at the call site
 * and checked by the compiler: `ownerAuthored("memories")` does not compile, and
 * `memories` is precisely the table where this answer would be a fabrication.
 */
export function ownerAuthored(table: OwnerAuthoredTable): Provenance {
  return { kind: "owner-authored", table };
}

/**
 * The origin of a claim that may carry a `source_entry_id`.
 *
 * @param sourceEntryId  The column's value. `null`, `undefined` and `""` are all
 *   **`unsourced`**, never owner-authored — see this file's header on
 *   `on delete set null`.
 * @param resolvableEntryIds  The entry ids the caller actually resolved, from an
 *   **owner-scoped** query bounded to the ids on the page. Absence means
 *   unresolvable, in every sense at once.
 */
export function deriveClaimProvenance(
  sourceEntryId: string | null | undefined,
  resolvableEntryIds: ReadonlySet<string>,
): Provenance {
  if (!sourceEntryId) return { kind: "unsourced" };
  if (!resolvableEntryIds.has(sourceEntryId)) return { kind: "unsourced" };
  return { kind: "sourced", entryId: sourceEntryId };
}

/** Whether a claim can offer a link to its source. */
export function isOpenable(provenance: Provenance): provenance is { kind: "sourced"; entryId: string } {
  return provenance.kind === "sourced";
}

/**
 * Builds the resolvable-id set from rows the caller already read.
 *
 * Exists so every surface builds it the same way — the place a surface could
 * quietly diverge is by including ids it merely *asked* for rather than ids it
 * actually got back, which would turn an unreadable entry into a link that
 * 404s and, worse, into evidence that the id exists.
 */
export function resolvableEntryIdsOf(
  rows: readonly { readonly id: string | null }[] | null | undefined,
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const row of rows ?? []) if (row?.id) ids.add(row.id);
  return ids;
}

/**
 * `2N-PERSON-004` — whether a section is something the owner maintains or
 * something the page computed.
 *
 * A separate axis from `Provenance`, deliberately. "Who said this" and "can I
 * edit it here" are different questions, and collapsing them would make an
 * owner-authored relation and a derived task list look like the same kind of
 * thing because both trace back to the owner eventually.
 */
export type SectionOrigin = "persisted" | "derived";
