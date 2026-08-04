/**
 * `/[locale]/legal/terms` and `/[locale]/legal/privacy` — SH-LEGAL-001.
 *
 * One dynamic segment rather than two near-identical files: the two documents
 * differ in content, not in rendering, and `isPolicyDocument` is the same closed
 * set the database, the acceptance gate and the version constants all use — so
 * a third value cannot appear here without appearing there first. Anything else
 * is a 404 rather than an empty page.
 */

import { notFound } from "next/navigation";
import { LegalDocumentView } from "@/features/legal/legal-document-view";
import { isPolicyDocument, POLICY_DOCUMENTS } from "@/features/legal/versions";
import { isLocale, locales } from "@/lib/preferences";

export function generateStaticParams() {
  return locales.flatMap((locale) =>
    POLICY_DOCUMENTS.map((document) => ({ locale, document })),
  );
}

export default async function LegalDocumentPage({
  params,
}: {
  params: Promise<{ locale: string; document: string }>;
}) {
  const { locale, document } = await params;
  if (!isLocale(locale) || !isPolicyDocument(document)) notFound();

  return <LegalDocumentView document={document} locale={locale} />;
}
