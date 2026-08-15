import { isLocale, type Locale } from "@/lib/preferences";

import { negotiateEntryLocale } from "./locale-negotiation";

/**
 * Where a visitor to `/` goes — `2O-ENTRY-001` and `2O-ENTRY-004`.
 *
 * Pure, and separate from the page that reads the session and the header, for
 * the reason `signup-policy.ts` gives about its own split: **the decision is
 * pure and testable, and the environment read is a thin server-bound wrapper.**
 * Every branch below is a sentence from a requirement, and each is asserted
 * directly rather than through a rendered page.
 */

export type EntryVisitor =
  | {
    /** `2O-ENTRY-004`. A signed-in visitor arrives in the application. */
    readonly authenticated: true;
    /** `profiles.locale`, whatever it holds — validated here, not by the caller. */
    readonly storedLocale: string | null | undefined;
  }
  | {
    readonly authenticated: false;
    readonly acceptLanguage: string | null | undefined;
  };

export function entryDestination(visitor: EntryVisitor): string {
  if (visitor.authenticated) {
    /*
     * Their **own stored** locale, and `pt-BR` only when nothing is stored.
     *
     * The value is validated rather than trusted: `profiles.locale` is a `text`
     * column, so a row written outside the settings form could hold anything,
     * and it is about to become a path segment. `isLocale` is the same predicate
     * every other route uses.
     *
     * "With no extra navigation step" is why this returns `/{locale}/app`
     * directly instead of the entry page — a signed-in owner does not need to be
     * told what the product is.
     */
    const locale: Locale = isLocale(visitor.storedLocale) ? visitor.storedLocale : "pt-BR";
    return `/${locale}/app`;
  }

  // `2O-ENTRY-001`. The public page, in the visitor's language, with `pt-BR` as
  // the fallback rather than as the answer.
  return `/${negotiateEntryLocale(visitor.acceptLanguage)}`;
}
