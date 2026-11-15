/**
 * Life Brain E.2 (ADR-170) — a person's links to the owner's other people, as
 * seen from that person's page. Pure: no client, no I/O.
 *
 * A stored row reads "`person_id` is `relationship_type` of
 * `related_person_id`". On the page of X:
 *
 * - a row whose `related_person_id` is X names `person_id` as `type` of X;
 * - a row whose `person_id` is X names `related_person_id` as the *inverse*
 *   of `type` of X (X is parent of Laura → Laura is child of X).
 *
 * So one row reads correctly on both pages, and nothing is stored twice.
 * Rows to the owner (`related_person_id` null) never reach this module, and a
 * type outside `PERSON_LINK_TYPES` (a future extraction value) is dropped
 * rather than guessed at.
 */

import { asPersonLinkType, inversePersonLinkType, type PersonLinkType } from "./relationship-vocabulary";

export type PersonLinkSourceRow = Readonly<{
  id: string;
  person_id: string;
  related_person_id: string | null;
  relationship_type: string;
}>;

export type PersonLink = Readonly<{
  id: string;
  otherId: string;
  otherName: string;
  /** What the other person is to the person whose page this is. */
  type: PersonLinkType;
}>;

export function projectPersonLinks(
  personId: string,
  rows: readonly PersonLinkSourceRow[],
  names: ReadonlyMap<string, string>,
): PersonLink[] {
  const links: PersonLink[] = [];
  for (const row of rows) {
    if (row.related_person_id === null) continue;
    const stored = asPersonLinkType(row.relationship_type);
    if (stored === null) continue;
    let otherId: string;
    let type: PersonLinkType;
    if (row.related_person_id === personId && row.person_id !== personId) {
      otherId = row.person_id;
      type = stored;
    } else if (row.person_id === personId && row.related_person_id !== personId) {
      otherId = row.related_person_id;
      type = inversePersonLinkType(stored);
    } else {
      continue;
    }
    // An endpoint the owner-scoped read did not return (deleted, foreign or
    // unreadable) is not a link — the same rule the Relações projection keeps.
    const otherName = names.get(otherId);
    if (otherName === undefined) continue;
    links.push({ id: row.id, otherId, otherName, type });
  }
  return links.sort((a, b) => a.otherName.localeCompare(b.otherName));
}

/**
 * Whether a new link "`otherId` is `type` of `personId`" repeats a live one,
 * in either direction it could have been written.
 */
export function repeatsLiveLink(
  personId: string,
  otherId: string,
  type: PersonLinkType,
  live: readonly PersonLinkSourceRow[],
): boolean {
  return live.some(
    (row) =>
      (row.person_id === otherId && row.related_person_id === personId && row.relationship_type === type) ||
      (row.person_id === personId && row.related_person_id === otherId && row.relationship_type === inversePersonLinkType(type)),
  );
}
