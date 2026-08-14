/**
 * `2N-FILES-003`, `2N-FILES-005`, `2N-FILES-009`, `2N-PERSON-008` — turning the
 * rows `attachment-links.ts` read into something a page may render.
 *
 * ## Why this is a separate, pure module
 *
 * The loader does I/O and cannot be exercised without a client. The rule that
 * decides *what the user sees* is the interesting half — a link whose subject
 * did not come back must not be rendered, and the three reasons it might not
 * come back must be indistinguishable — so it lives here, takes only data, and
 * is testable exhaustively without a database.
 *
 * ## Removed, foreign and unreadable are one thing, by construction
 *
 * The same rule `subject-derivation.ts` and `provenance/contracts.ts` follow,
 * for the same reason: the interface must not distinguish them, and the way to
 * guarantee that is to have no branch that *could*. The caller passes the rows
 * it actually resolved, from an owner-scoped query bounded to the ids on the
 * page. A deleted person, a person belonging to someone else and a person the
 * read simply failed to return are all **absent from that map** — the same
 * input, so necessarily the same output.
 *
 * That output is **omission**. `2N-FILES-005` says a file whose subject is gone
 * is not rendered as a live association, and a placeholder row would be exactly
 * that: an assertion that something is attached, with nothing attached to it.
 * Worse, it would confirm the id exists. So the link is dropped, and the page
 * cannot be used to test whether a particular entity id is real.
 *
 * ## What this module refuses to do
 *
 * It performs no I/O, holds no client, takes no `user_id`, and **infers
 * nothing**. There is no signature here that could accept a file's extracted
 * text, a model's `extracted_people`, an embedding or a similarity score: a link
 * exists because a row in `entity_attachments` says so, or it does not exist.
 * `2N-FILES-003` forbids a relation being inferred into existence by this
 * family, and a rule enforced by "callers promise not to guess" is weaker than a
 * module that cannot be handed the thing to guess from.
 */

import type { SubjectSensitivity } from "@/features/sensitivity/subject-derivation";
import { UNDETERMINED } from "@/features/sensitivity/task-derivation";

import type { AttachmentLink, LinkedEntityType } from "./link-contracts";

/** The key a caller builds its resolved-subject map under. */
export function subjectKey(entityType: LinkedEntityType, entityId: string): string {
  return `${entityType}:${entityId}`;
}

/** A subject the caller actually read, ready to be keyed. */
export type ResolvedSubjectRow = {
  readonly label: string;
  /**
   * The classification to render the label under.
   *
   * `people` and `projects` carry **no `sensitivity` column** and
   * `2N-PRIVACY-003` forbids adding one, so their rows pass `UNDETERMINED` —
   * the arm that renders in the clear because there is genuinely no
   * classification to look for, not because one was inferred to be `normal`.
   * ADR-110 Decision 2 is the same reading: a structural identifier the owner
   * needs in order to recognise the subject stays visible.
   *
   * `entries` and `attachments` do carry one, so their rows pass the derived
   * level and the surface masks accordingly.
   */
  readonly sensitivity: SubjectSensitivity;
};

/** One link, resolved and renderable. */
export type LinkedSubject = {
  readonly entityType: LinkedEntityType;
  readonly entityId: string;
  readonly label: string;
  readonly sensitivity: SubjectSensitivity;
};

/**
 * Resolves links to subjects, dropping every link whose subject did not resolve.
 *
 * Duplicates are collapsed: `entity_attachments` is unique on
 * `(attachment_id, entity_type, entity_id)`, so a repeat here would mean the
 * same subject reached through two different files' rows being merged by a
 * caller — rendering it twice would state the relationship twice.
 */
export function resolveLinkedSubjects(
  links: readonly AttachmentLink[],
  resolved: ReadonlyMap<string, ResolvedSubjectRow>,
): LinkedSubject[] {
  const seen = new Set<string>();
  const subjects: LinkedSubject[] = [];
  for (const link of links) {
    const key = subjectKey(link.entityType, link.entityId);
    if (seen.has(key)) continue;
    const row = resolved.get(key);
    if (!row) continue;
    seen.add(key);
    subjects.push({
      entityType: link.entityType,
      entityId: link.entityId,
      label: row.label,
      sensitivity: row.sensitivity,
    });
  }
  return subjects;
}

/**
 * A file reached from a person or project — `2N-FILES-009`'s reverse direction.
 *
 * Separate from `LinkedSubject` because the two are not the same shape: a file
 * has a processing state the subject side has no analogue for, and collapsing
 * them would mean a person page rendering a status badge for a project.
 */
export type LinkedFile = {
  readonly attachmentId: string;
  readonly name: string;
  readonly status: string;
  readonly sensitivity: SubjectSensitivity;
};

/** A file row the caller actually read. */
export type ResolvedFileRow = {
  readonly name: string;
  readonly status: string;
  readonly sensitivity: SubjectSensitivity;
};

/**
 * Resolves links to files, dropping every link whose file did not resolve.
 *
 * The mirror of `resolveLinkedSubjects` and deliberately the same shape: an
 * attachment that was deleted, belongs to someone else, or simply did not come
 * back is absent from the map and therefore absent from the page.
 */
export function resolveLinkedFiles(
  links: readonly AttachmentLink[],
  resolved: ReadonlyMap<string, ResolvedFileRow>,
): LinkedFile[] {
  const seen = new Set<string>();
  const files: LinkedFile[] = [];
  for (const link of links) {
    if (seen.has(link.attachmentId)) continue;
    const row = resolved.get(link.attachmentId);
    if (!row) continue;
    seen.add(link.attachmentId);
    files.push({
      attachmentId: link.attachmentId,
      name: row.name,
      status: row.status,
      sensitivity: row.sensitivity,
    });
  }
  return files;
}

/**
 * The subject ids to resolve, grouped by type.
 *
 * Exists so a caller issues **one query per type** rather than one per link:
 * `2N-FILES-010`'s measurement forbids a round trip per item, and the shape that
 * prevents it is the caller never seeing a list it could iterate over with a
 * query inside.
 */
export function subjectIdsByType(
  links: readonly AttachmentLink[],
): Readonly<Record<LinkedEntityType, readonly string[]>> {
  const grouped: Record<LinkedEntityType, string[]> = { entry: [], person: [], project: [] };
  const seen = new Set<string>();
  for (const link of links) {
    const key = subjectKey(link.entityType, link.entityId);
    if (seen.has(key)) continue;
    seen.add(key);
    grouped[link.entityType].push(link.entityId);
  }
  return grouped;
}

/** The classification a subject with no `sensitivity` column renders under. */
export const NO_CLASSIFICATION: SubjectSensitivity = UNDETERMINED;
