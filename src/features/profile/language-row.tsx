"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { getSettingsCopy } from "@/features/settings/copy";
import { getLocaleSwitchHref } from "@/features/shell/capabilities";
import type { Locale } from "@/lib/preferences";

/**
 * Life Brain E.1 (ADR-169): the language, as a row in "Você e o assistente".
 *
 * Not a new preference and not a form field. The locale is the URL's first
 * segment and the top bar's "EN"/"PT" link already switches it, keeping the
 * route and query (`getLocaleSwitchHref`); this row is the same two links where
 * a reader looking for "idioma" expects them. No column, no save, no undo —
 * following a link is its own undo.
 */
const LOCALES: readonly { locale: Locale; name: string }[] = [
  { locale: "pt-BR", name: "Português" },
  { locale: "en", name: "English" },
];

export function LanguageRow({ locale }: { locale: Locale }) {
  const pathname = usePathname() ?? `/${locale}/app/settings`;
  const searchParams = useSearchParams();
  const copy = getSettingsCopy(locale).language;

  return (
    <div className="settings-row">
      <span className="settings-row-copy">
        <span className="settings-row-label" id="settings-language-label">{copy.label}</span>
        <small id="settings-language-hint">{copy.hint}</small>
      </span>
      <span className="settings-row-control">
        <span aria-describedby="settings-language-hint" aria-labelledby="settings-language-label" className="settings-segmented" role="group">
          {LOCALES.map((entry) => {
            const current = entry.locale === locale;
            return (
              <Link
                aria-current={current ? "true" : undefined}
                className={`settings-segment${current ? " active" : ""}`}
                href={getLocaleSwitchHref(pathname, searchParams?.toString() ?? "", entry.locale)}
                hrefLang={entry.locale}
                key={entry.locale}
                lang={entry.locale}
              >
                {entry.name}
              </Link>
            );
          })}
        </span>
      </span>
    </div>
  );
}
