import Link from "next/link";

import { getLegalDocument } from "@/features/legal/documents";
import { legalDocumentPath } from "@/features/legal/versions";
import type { Locale } from "@/lib/preferences";

import { ENTRY_CLAIM_ORDER, getEntryCopy } from "./copy";

/**
 * The public entry page — `2O-ENTRY-001`, `-002`, `-003`.
 *
 * ## What a stranger saw before this
 *
 * `src/app/page.tsx` was two lines: `redirect("/pt-BR/app")`. So a first-time
 * visitor was bounced to the app, bounced again by the proxy to
 * `/pt-BR/auth/login`, and landed on a **login form for an unnamed product, in
 * Portuguese whatever their browser asked for**. Nothing on the way said what
 * the thing was.
 *
 * ## Four claims, and no fifth
 *
 * `2O-ENTRY-002` fixes the number, and each claim is one a guard can check
 * against repository truth — `entry-page-guard.test.ts` resolves each against
 * the tree, so a claim that stops being true fails the build rather than
 * quietly misleading someone who cannot yet check it themselves.
 *
 * ## No availability claim
 *
 * `2O-ENTRY-003`, and `OD-2O-1` **A** signed it. While signup is closed this
 * page **does not invite registration** and does not imply a waiting list that
 * does not exist. It does not link to `/auth/register`, it collects no address,
 * and the notice says so in as many words. The sign-in link stays, because
 * someone who already has an account arriving here is not a registration.
 *
 * ## `lang` is declared here
 *
 * The root layout hardcodes `<html lang="pt-BR">` for every locale, because
 * `src/app/layout.tsx` sits above `[locale]` and never receives the segment.
 * This is the first element below that point which knows the locale, so it is
 * the first place the document can tell the truth about what language it is in
 * — the same reason and the same pattern as `app-shell.tsx`, recorded by
 * ADR-112 Decision 7a. On this page it matters more than most: it is the one
 * surface reached by people whose browser asked for English.
 */
export function EntryPage({ locale, signupOpen }: { locale: Locale; signupOpen: boolean }) {
  const copy = getEntryCopy(locale);

  return (
    <div className="entry-page" lang={locale}>
      <header className="entry-header">
        <p className="eyebrow">{copy.productName}</p>
        <h1>{copy.tagline}</h1>
      </header>

      <section className="entry-claims" aria-labelledby="entry-claims-heading">
        <h2 id="entry-claims-heading">{copy.claimsLabel}</h2>
        <ul>
          {ENTRY_CLAIM_ORDER.map((claim) => (
            <li key={claim}>{copy.claims[claim]}</li>
          ))}
        </ul>
      </section>

      {/*
        The document titles come from `legal/documents.ts`, the same source the
        register page reads — not from this feature's copy module. A second
        spelling of "Política de privacidade" is a second thing to keep true, and
        the one a stranger reads before trusting the product is the wrong place
        for it to drift.
      */}
      <section className="entry-documents" aria-label={copy.documentsLabel}>
        <Link href={legalDocumentPath(locale, "terms")}>
          {getLegalDocument(locale, "terms").title}
        </Link>
        <Link href={legalDocumentPath(locale, "privacy")}>
          {getLegalDocument(locale, "privacy").title}
        </Link>
      </section>

      <footer className="entry-footer">
        {/*
          `2O-ENTRY-003` and `2O-ENTRY-006`. The notice is rendered from the same
          predicate the Server Action enforces and **does not vary with any
          request input**, so the closed door answers identically to everyone and
          is not a probe surface. `SH-SIGNUP-001`'s uniform-refusal property is
          re-asserted here rather than replaced.
        */}
        {!signupOpen && <p className="entry-closed">{copy.closedNotice}</p>}
        {/*
          `2O-ENTRY-008`: a forward path. Someone who already has an account is
          not a registration, so this link stays whether the door is open or
          shut — and it is the only account-related control on the page while it
          is shut.
        */}
        <Link className="entry-sign-in" href={`/${locale}/auth/login`}>
          {copy.signIn}
        </Link>
      </footer>
    </div>
  );
}
