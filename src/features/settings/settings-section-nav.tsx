"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { Locale } from "@/lib/preferences";
import { getSettingsCopy } from "./copy";
import { SETTINGS_SECTIONS, settingsSectionFromPath, settingsSectionHref } from "./sections";

/**
 * The eight sections, as links to eight documents.
 *
 * ## Not a tablist, and the repository already decided this
 *
 * `work-modes.tsx` records the reason in as many words: *"`aria-current="page"`
 * rather than `role="tablist"`: these navigate to separate documents.
 * Announcing them as tabs would promise a panel that swaps in place, which is
 * exactly what does not happen."* Every argument there applies here — each
 * section is its own route with its own loader, so a bookmark works, the back
 * button means what it means, and a refresh lands where the reader was.
 *
 * ## `2P-SETTINGS-003`, without a second markup tree
 *
 * *"Mobile renders the sections as a list or compact selector rather than an
 * overflowing tab row."* This is one `<nav>` of eight links; the stylesheet
 * lays it out as a vertical list on a phone and as a rail beside the panel from
 * the medium breakpoint up. No JavaScript decides the layout, no branch renders
 * different markup on different viewports, and there is no horizontal scroll to
 * overflow.
 *
 * ## Why it reads the pathname rather than taking the section as a prop
 *
 * It is mounted in the layout, so it renders once and survives the navigation
 * between sections — which is what keeps the nav from remounting, losing focus
 * and re-announcing itself on every change. A layout above a dynamic segment
 * does not receive that segment's params, so the pathname is the only honest
 * source. `settingsSectionFromPath` is the same resolver the routes use.
 */
export function SettingsSectionNav({ locale }: { locale: Locale }) {
  const pathname = usePathname() ?? settingsSectionHref(locale, "general");
  const active = settingsSectionFromPath(pathname);
  const copy = getSettingsCopy(locale);

  return (
    <nav aria-label={copy.navLabel} className="settings-nav">
      <ul className="settings-nav-list">
        {SETTINGS_SECTIONS.map((section) => (
          <li key={section}>
            <Link
              aria-current={section === active ? "page" : undefined}
              className={`settings-nav-link${section === active ? " active" : ""}`}
              href={settingsSectionHref(locale, section)}
            >
              {copy.sections[section].name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
