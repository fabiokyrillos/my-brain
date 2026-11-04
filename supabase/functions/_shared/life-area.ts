// Life Brain C.1 (ADR-148, LIFE_DATA_MODEL.md §2) — when the worker links an
// entry to its life area.
//
// `link_entry_life_area` refuses below the same threshold, so this is the
// first of two checks, not the only one: it spares a round trip for a reading
// that could not link, and `other` — "none of these" — never creates an area.

import type { LifeAreaValue } from "./extraction-validation.ts";

export const LIFE_AREA_LINK_THRESHOLD = 0.6;

export function lifeAreaToLink(lifeArea: LifeAreaValue | null): LifeAreaValue | null {
  if (lifeArea === null || lifeArea.kind === "other") return null;
  if (lifeArea.confidence < LIFE_AREA_LINK_THRESHOLD) return null;
  return lifeArea;
}
