"use client";

import { useEffect } from "react";

import type { Locale } from "@/lib/preferences";

import { refreshTodaysSuggestionPicks } from "./suggestion-pick-action";

/**
 * Life Brain B.8 (ADR-163). Asks the server, once per mount, to let the model
 * pick today's suggestions. It renders nothing and reports nothing: the page has
 * already drawn the derived suggestions, and a failure here must look exactly
 * like success, which is the owner seeing those.
 *
 * Mounted only when today has no cached pick, so a page that already has one
 * never fires it.
 */
export function SuggestionPickTrigger({ locale }: { readonly locale: Locale }) {
  useEffect(() => {
    refreshTodaysSuggestionPicks(locale).catch(() => undefined);
  }, [locale]);
  return null;
}
