import Link from "next/link";
import { Suspense } from "react";

import { accountCopy } from "@/features/shell/account-copy";
import { LocaleSwitchLink } from "@/features/shell/navigation-links";
import type { Locale } from "@/lib/preferences";

/**
 * The top of every signed-out page: the product's mark and name, and the other
 * language (Editorial calmo, ADR-180).
 *
 * The same composition as the phone top bar inside the product — the mark and
 * the name in the reading face where the page's text starts, one quiet control
 * where it ends — so the first screen anyone sees is recognisably the product
 * they are about to enter. It is the shell's own mark (`.brand-mark`,
 * `.brand-name`), not a second drawing of it.
 *
 * ## The language, which these pages never offered
 *
 * `/` negotiates a language from the browser, and until now that was the only
 * say a signed-out reader had: the switch lived in the account menu, behind the
 * sign-in they had not done yet. It is `LocaleSwitchLink`, the one
 * implementation, so the path and the query survive the switch as
 * `docs/ENGINEERING_STANDARDS.md` requires. It reads `useSearchParams()`, hence
 * the boundary; the fallback is the same words, inert, so nothing moves when
 * the link resolves.
 *
 * It is written in the language it switches *to* and marked with that `lang`,
 * as the account menu's row is, and for the same reason.
 *
 * The brand goes to `/`, as the sign-in page's brand always did.
 */
export function SignedOutHeader({ locale }: { locale: Locale }) {
  const copy = accountCopy[locale];
  const other = <span lang={locale === "pt-BR" ? "en" : "pt-BR"}>{copy.otherLanguage}</span>;

  return (
    <header className="auth-top">
      <Link href="/" className="auth-brand" aria-label="My Brain">
        <span className="brand-mark">B</span>
        <span className="brand-name">My Brain</span>
      </Link>
      <Suspense fallback={<span aria-hidden="true" className="auth-language">{other}</span>}>
        <LocaleSwitchLink
          className="auth-language"
          label={`${copy.switchLanguageTo} ${copy.otherLanguage}`}
          locale={locale}
        >
          {other}
        </LocaleSwitchLink>
      </Suspense>
    </header>
  );
}
