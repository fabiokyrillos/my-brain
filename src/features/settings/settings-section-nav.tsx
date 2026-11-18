"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { Locale } from "@/lib/preferences";
import { getSettingsCopy } from "./copy";
import { SETTINGS_SECTIONS, settingsGroupHref, settingsSectionFromPath, settingsSectionHref, type SettingsSection } from "./sections";
import type { SettingsSummaries } from "./summary";

/**
 * The groups, as one list with two presentations (Life Brain E.1, ADR-169).
 *
 * On a desktop it is the rail beside the open group. On a phone it is the
 * screen you land on at `/app/settings` — each row an icon, the group's name
 * and what it is set to now, opening the group's own page — and it is hidden
 * once a group is open (`settings-extended.css`, `.settings-layout:has(...)`).
 * One DOM for both, so a keyboard or screen-reader user meets the same list in
 * the same order on either.
 *
 * Privacy is set apart by a divider: it is where you go to take your data or
 * leave, not a preference. The A.6 "Avançado" links (Histórico, Custos de IA,
 * Em andamento) are no longer here — they are the "Dados e IA" doors inside
 * Privacidade e conta, which is where the approved mockup puts them, and one
 * door per destination is enough.
 *
 * Editorial calmo (ADR-180): a row is the group's name over what it is set to
 * now, between hairlines. The six coloured icon tiles are gone — they said
 * nothing the name does not, and colour is kept for attention and risk.
 */

export function SettingsSectionNav({ locale, summaries }: { locale: Locale; summaries: SettingsSummaries }) {
  const pathname = usePathname() ?? settingsSectionHref(locale, "general");
  const active = settingsSectionFromPath(pathname);
  const copy = getSettingsCopy(locale);

  const item = (section: SettingsSection) => {
    const current = section === active;
    return (
      <li key={section}>
        <Link
          aria-current={current ? "page" : undefined}
          className={`settings-nav-link${current ? " active" : ""}`}
          data-section={section}
          href={settingsGroupHref(locale, section)}
        >
          <span className="settings-nav-copy">
            <span className="settings-nav-name">{copy.sections[section].name}</span>
            <span className="settings-nav-summary">{summaries[section]}</span>
          </span>
          <ChevronRight aria-hidden="true" className="settings-nav-chevron" size={16} />
        </Link>
      </li>
    );
  };

  return (
    <nav aria-label={copy.navLabel} className="settings-nav">
      <ul className="settings-nav-list">{SETTINGS_SECTIONS.filter((section) => section !== "privacy").map(item)}</ul>
      <ul className="settings-nav-list settings-nav-list-apart">{item("privacy")}</ul>
    </nav>
  );
}
