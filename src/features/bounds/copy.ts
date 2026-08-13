/**
 * The bounds vocabulary's user-facing half, as a typed copy module.
 *
 * `EGC-SURFACE-002` (the locale-ternary ceiling) and `2N-ACCESS-005` both point
 * the same way: new copy goes through a typed module keyed by locale, not
 * through `pt ? "…" : "…"` at the call site. The canonical shape is
 * `src/features/daily-cycle/copy.ts`, and this follows it.
 */

import type { Locale } from "@/lib/preferences";

export type BoundsCopy = {
  /** The notice itself. Takes the applied bound so the number is never restated. */
  readonly bounded: (shown: number) => string;
  /**
   * The accessible name for the notice's region.
   *
   * `2N-ACCESS-003` requires this announced rather than merely styled: a
   * truncation the user cannot perceive is the same defect as a truncation that
   * says nothing.
   */
  readonly boundedLabel: string;
};

const copy: Record<Locale, BoundsCopy> = {
  "pt-BR": {
    bounded: (shown) => `Mostrando ${shown}. Existem mais itens do que cabem nesta lista.`,
    boundedLabel: "Lista parcial",
  },
  en: {
    bounded: (shown) => `Showing ${shown}. More items exist than fit in this list.`,
    boundedLabel: "Partial list",
  },
};

export function getBoundsCopy(locale: Locale): BoundsCopy {
  return copy[locale];
}
