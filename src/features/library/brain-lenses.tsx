import Link from "next/link";

import { getNavigationHref } from "@/features/shell/capabilities";
import { getMessages } from "@/i18n/messages";
import type { Locale } from "@/lib/preferences";

import { getLibraryCopy } from "./copy";
import { BRAIN_LENSES, type BrainLensKey } from "./lenses";

/**
 * The lens strip Brain wears on every one of its surfaces.
 *
 * ## `aria-current="page"`, never `role="tablist"`
 *
 * These navigate to separate documents. Announcing them as tabs would promise a
 * panel that swaps in place, which is exactly what does not happen — the same
 * call `work-modes.tsx` made for Lista · Calendário · Planejar, and for the same
 * reason `03-componentes.md` gives: tabs are anchored in the URL.
 *
 * ## Why `active` is passed rather than read from the pathname
 *
 * Reading `usePathname()` would make this a client component on nine
 * server-rendered surfaces to answer a question each of them already knows the
 * answer to. The risk it trades for — a page passing the wrong key — is closed
 * by the *"passes each surface its own lens key"* case in
 * `src/lib/closeout/phase-2i-library-guard.test.ts`, which re-derives the
 * expected key from each route file's own directory and fails on a mismatch. A
 * guard that reads the filesystem cannot drift the way a mount site can.
 */
export function BrainLensTabs({ active, locale }: { active: BrainLensKey; locale: Locale }) {
  const copy = getLibraryCopy(locale);
  const messages = getMessages(locale);
  // `NavigationKey` is wider than the label record — `jobs` is context-only and
  // carries no nav label by design. Every lens below is a `group: "context"`
  // member or the overview, all of which have one; widening the record to
  // satisfy the compiler would invent a label for a destination that
  // deliberately has none.
  const navLabels = messages.nav as Record<string, string>;

  return (
    <nav aria-label={copy.lensesLabel} className="brain-lenses">
      {BRAIN_LENSES.map((lens) => {
        const href = lens === "overview" ? getNavigationHref(locale, "library") : getNavigationHref(locale, lens);
        const label = lens === "overview" ? copy.overviewLens : navLabels[lens];
        return (
          <Link
            aria-current={lens === active ? "page" : undefined}
            className="brain-lens"
            href={href}
            key={lens}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
