import Link from "next/link";

import { BoundedNotice } from "@/features/bounds/bounded-notice";
import type { Bounded } from "@/features/bounds/contracts";
import { ProtectedContent } from "@/features/operations/protected-content";
import type { Locale } from "@/lib/preferences";

import type { LinkOutcome } from "./link-contracts";
import { getFileLibraryCopy } from "./copy";
import type { LinkedFile, LinkedSubject } from "./linked-subjects";

/**
 * `2N-FILES-003`, `2N-FILES-009`, `2N-PERSON-008` — the two directions of a
 * file link, rendered.
 *
 * ## One module, two components, and why they are not one component
 *
 * The directions are not symmetric. A file names the person, project or entry it
 * is attached to; a person names files, which carry a processing state a person
 * does not have. A single component parameterised over both would need a branch
 * per field, which is how two surfaces of one product end up disagreeing. They
 * share the **contract** instead: the same `LinkOutcome`, the same
 * `ProtectedContent`, the same `BoundedNotice`, the same three states.
 *
 * ## The three states, and why "empty" is not one thing with "failed"
 *
 * - **failed** — the read did not happen. Says so, and says explicitly that it
 *   is not a claim about there being none.
 * - **empty** — the read happened and found nothing. Says *that*, and then says
 *   the second true thing: the product has no way to create a link. There is
 *   deliberately **no button, no disabled control and no call to action** here.
 *   `entity_attachments` has no writer, and a control that promised one would be
 *   a lie the user only discovers by pressing it.
 * - **rows** — rendered, each under the classification of its own subject, each
 *   openable, each dropping silently if its subject did not resolve (that
 *   dropping happens upstream in `linked-subjects.ts`, so this component cannot
 *   distinguish a removed subject from a foreign or unreadable one either).
 */

function subjectHref(locale: Locale, subject: LinkedSubject, back: string): string {
  const route =
    subject.entityType === "entry"
      ? "inbox"
      : subject.entityType === "person"
        ? "people"
        : "projects";
  return `/${locale}/app/${route}/${subject.entityId}?back=${encodeURIComponent(back)}`;
}

export function LinkedSubjectsSection({
  back,
  locale,
  outcome,
  subjects,
}: {
  /** Where the reader returns to, anchor included — `2N-PERSON-006`. */
  back: string;
  locale: Locale;
  outcome: LinkOutcome<unknown>;
  /** Resolved and bounded. Empty is a real answer, not a missing one. */
  subjects: Bounded<LinkedSubject>;
}) {
  const copy = getFileLibraryCopy(locale);
  return (
    <section className="file-links" data-link-direction="file-to-subject">
      <h3>{copy.linkedHeading}</h3>
      {outcome.status === "failed" ? (
        <p className="quiet-state" data-link-state="failed" role="note">
          {copy.linkedFailed}
        </p>
      ) : subjects.items.length === 0 ? (
        <div data-link-state="empty">
          <p className="quiet-state">{copy.linkedEmpty}</p>
          {/*
            The remainder, said to the user rather than only to the acceptance
            record. `2N-FILES-009` ships as a real read path whose emptiness is
            explained; it does not ship as a control that does nothing.
          */}
          <p className="quiet-state file-links-unavailable">{copy.linkedNoWriter}</p>
        </div>
      ) : (
        <ul className="file-link-list" data-link-state="rows">
          {subjects.items.map((subject) => (
            <li key={`${subject.entityType}-${subject.entityId}`}>
              {/*
                A person's and a project's name pass `UNDETERMINED` and therefore
                render in the clear — they carry no classification and ADR-110
                Decision 2 keeps a structural identifier visible. An entry's
                content passes its derived level and is masked when the
                classification says so. Both go through the same component, so
                the two cannot drift apart.
              */}
              <ProtectedContent
                href={subjectHref(locale, subject, back)}
                locale={locale}
                revealKey={`file-link-${subject.entityType}-${subject.entityId}`}
                sensitivity={subject.sensitivity}
                surface="file"
              >
                <Link href={subjectHref(locale, subject, back)}>{subject.label}</Link>
              </ProtectedContent>
            </li>
          ))}
        </ul>
      )}
      {outcome.status === "ok" && <BoundedNotice list={subjects} locale={locale} />}
    </section>
  );
}

export function LinkedFilesSection({
  files,
  locale,
  outcome,
  statusLabel,
}: {
  files: Bounded<LinkedFile>;
  locale: Locale;
  outcome: LinkOutcome<unknown>;
  /** The vocabulary lookup, passed in so this module owns no second copy of it. */
  statusLabel: (value: string) => string;
}) {
  const copy = getFileLibraryCopy(locale);
  return (
    <section className="entity-files" data-link-direction="subject-to-file">
      {/* `<h3>`, matching the sibling panels: this section renders only inside a
          workspace column, whose own heading is the `<h2>`. */}
      <h3>{copy.linkedFilesHeading}</h3>
      {outcome.status === "failed" ? (
        <p className="quiet-state" data-link-state="failed" role="note">
          {copy.linkedFilesFailed}
        </p>
      ) : files.items.length === 0 ? (
        <div data-link-state="empty">
          <p className="quiet-state">{copy.linkedFilesEmpty}</p>
          <p className="quiet-state file-links-unavailable">{copy.linkedNoWriter}</p>
        </div>
      ) : (
        <ul className="file-link-list" data-link-state="rows">
          {files.items.map((file) => (
            <li key={file.attachmentId}>
              {/*
                `2N-PRIVACY-002` names file names as content the contract
                governs, so the name is withheld exactly as it is on the library
                itself — a file masked at `/app/files` is masked here too. No
                `describedAs`: the name IS the protected content, and passing it
                would defeat the mask through the accessible name.
              */}
              <ProtectedContent
                href={`/${locale}/app/files`}
                locale={locale}
                revealKey={`entity-file-${file.attachmentId}`}
                sensitivity={file.sensitivity}
                surface="file"
              >
                <Link href={`/${locale}/app/files`}>{file.name}</Link>
              </ProtectedContent>
              {/* The state is not content: it says nothing about what is inside. */}
              <span className={`status-badge ${file.status}`}>{statusLabel(file.status)}</span>
            </li>
          ))}
        </ul>
      )}
      {outcome.status === "ok" && <BoundedNotice list={files} locale={locale} />}
    </section>
  );
}
