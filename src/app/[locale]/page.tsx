import { notFound } from "next/navigation";

import { isSignupOpenIn } from "@/features/auth/signup-policy";
import { EntryPage } from "@/features/entry/entry-page";
import { isLocale } from "@/lib/preferences";

/**
 * The public entry page at `/pt-BR` and `/en` — `2O-ENTRY-001` … `-003`.
 *
 * Unauthenticated and reading no account data, so it is reachable whether or not
 * a session exists and whether or not the deployment is configured. `/` redirects
 * here after negotiating the language; this route is what makes both languages
 * real URLs that can be linked and read before any account exists.
 *
 * `2O-ENTRY-006` — the closed-door statement is read from `isSignupOpenIn`, the
 * **same predicate `signUp` enforces**, and from nothing else. It takes no
 * request input, so it cannot vary with one: the door answers identically to
 * everybody, and `SH-SIGNUP-001`'s uniform-refusal property is re-asserted here
 * rather than replaced by a second gate that could disagree with the first.
 */
export default async function LocaleEntryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();

  return <EntryPage locale={candidate} signupOpen={isSignupOpenIn(process.env)} />;
}
