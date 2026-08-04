/**
 * A policy document, rendered — SH-LEGAL-001/012/013.
 *
 * A Server Component: the documents are static text with no interaction, so
 * nothing here needs to reach the browser as JavaScript.
 *
 * Accessibility and locale, the repository's standing gates: exactly one `h1`
 * (the document title), sections under `h2`, and every string from
 * `documents.ts`/`copy.ts` rather than an inline ternary. The review banner is
 * rendered first and is part of the document rather than chrome around it — its
 * removal is a named owner action (SH-LEGAL-013), which is only meaningful if
 * a reader actually sees it.
 */

import Link from "next/link";
import type { Locale } from "@/lib/preferences";
import { getLegalCopy } from "./copy";
import { getLegalDocument } from "./documents";
import { legalDocumentPath, type PolicyDocument } from "./versions";

export function LegalDocumentView({
  locale,
  document,
}: {
  locale: Locale;
  document: PolicyDocument;
}) {
  const content = getLegalDocument(locale, document);
  const copy = getLegalCopy(locale);
  const other: PolicyDocument = document === "terms" ? "privacy" : "terms";

  return (
    <article>
      <h1>{content.title}</h1>
      <p className="form-alert" role="note">
        {content.reviewBanner}
      </p>
      <p>{content.versionLabel}</p>

      {content.sections.map((section) => (
        <section key={section.heading}>
          <h2>{section.heading}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>
      ))}

      <p>
        <Link href={legalDocumentPath(locale, other)}>{copy.otherDocument[other]}</Link>
      </p>
      <p>
        <Link href={`/${locale}/auth/login`}>{copy.backToLogin}</Link>
      </p>
    </article>
  );
}
