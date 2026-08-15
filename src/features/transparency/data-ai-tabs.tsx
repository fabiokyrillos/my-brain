import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { getNavigationHref } from "@/features/shell/capabilities";
import type { Locale } from "@/lib/preferences";

import { TRANSPARENCY_LENSES, type TransparencyLens } from "./contracts";
import { getTransparencyCopy } from "./copy";

/**
 * The Dados e IA strip, worn by the three transparency surfaces.
 *
 * ## `aria-current="page"`, never `role="tablist"`
 *
 * These navigate to separate documents. Announcing them as tabs would promise a
 * panel that swaps in place, which is not what happens — the same call
 * `work-modes.tsx` and `brain-lenses.tsx` make, and the reason
 * `03-componentes.md` gives: tabs are anchored in the URL.
 *
 * ## The link back to Ajustes is part of the consolidation
 *
 * The handoff makes these three tabs *of Settings*. They are not, and cannot be
 * without ending three routes — so the strip carries the thing a tab would have
 * given for free: the way back up. Without it, a reader who arrived on
 * `/app/history` from a deep link would have no sign that it belongs to
 * anything.
 */
export function DataAiTabs({ active, locale }: { active: TransparencyLens; locale: Locale }) {
  const copy = getTransparencyCopy(locale);

  return (
    <nav aria-label={copy.lensesLabel} className="data-ai-tabs">
      <Link className="data-ai-up" href={getNavigationHref(locale, "settings")}>
        <ArrowLeft aria-hidden="true" size={14} />
        {copy.backToSettings}
      </Link>
      <div className="data-ai-lenses">
        {TRANSPARENCY_LENSES.map((lens) => (
          <Link
            aria-current={lens === active ? "page" : undefined}
            className="data-ai-lens"
            href={getNavigationHref(locale, lens)}
            key={lens}
          >
            {copy.lenses[lens]}
          </Link>
        ))}
      </div>
    </nav>
  );
}
