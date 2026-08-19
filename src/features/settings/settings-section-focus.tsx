"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { SETTINGS_PANEL_ID, settingsSectionFromPath } from "./sections";

/**
 * Focus follows the section, and only when the section actually changed.
 *
 * ## What this is for
 *
 * Changing section replaces the whole panel. Without this, a keyboard or screen
 * reader user activates a nav link and focus stays on that link while the
 * content behind them is now something else — so the change is silent, and
 * reaching the new content means tabbing back through the nav.
 *
 * ## Why it must not fire on arrival
 *
 * Focusing the panel on first load would steal focus from the skip link, which
 * `app-shell.tsx` puts first in DOM order precisely so it is the first thing a
 * keyboard reaches. So the first render only **records** the section; a change
 * from a recorded section to a different one is what moves focus.
 *
 * ## Why it lives in the layout
 *
 * The ref is the whole mechanism, and a ref only survives if the component
 * does. A focuser inside a section page would unmount on every navigation and
 * remount with an empty ref, so it could never tell "arrived here" from "moved
 * here" — it would either always fire or never fire. `settings/layout.tsx`
 * spans all eight sections, so the ref persists across exactly the transitions
 * this exists to notice.
 *
 * It reads the pathname because a layout above a dynamic segment does not
 * receive that segment's params.
 */
export function SettingsSectionFocus() {
  const pathname = usePathname() ?? "";
  const section = settingsSectionFromPath(pathname);
  const seen = useRef<string | null>(null);

  useEffect(() => {
    if (section === null) return;
    const previous = seen.current;
    seen.current = section;
    if (previous === null || previous === section) return;
    /*
      The panel, not the heading. The panel carries `tabIndex={-1}` and an
      accessible name equal to the section's own name, so focusing it announces
      "«Assistente», region" — which is the fact the reader needs — without the
      product having to demote thirteen components' headings to make room for a
      per-section one.
    */
    document.getElementById(SETTINGS_PANEL_ID)?.focus();
  }, [section]);

  return null;
}
