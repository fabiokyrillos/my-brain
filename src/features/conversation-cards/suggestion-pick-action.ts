"use server";

import { getOwnerTimeZone } from "@/features/profile/owner-timezone";
import { requireUser } from "@/lib/auth/require-user";
import { isLocale } from "@/lib/preferences";
import { formatLocalDate, isSupportedTimeZone, localDateOf } from "@/lib/time/local-day";

import { pickTodaysSuggestions } from "./model-picks";
import { loadSuggestionInputs } from "./suggestion-sources";
import { suggestionCandidates } from "./suggestions";

/**
 * Life Brain B.8 (ADR-163). Fired once by Conversar after it renders, when today
 * has no cached pick. It takes nothing from the client but the locale: the
 * owner, the day and every candidate are read again here, under RLS, so a
 * client cannot hand the model a row or a day of its choosing.
 *
 * It returns nothing on purpose. The page already shows the derived
 * suggestions, and the model's pick appears on the next visit the same day, so
 * there is no result for the client to wait for or display.
 */
export async function refreshTodaysSuggestionPicks(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  const { supabase, user } = await requireUser(locale);
  const timeZone = await getOwnerTimeZone();
  if (!isSupportedTimeZone(timeZone)) return;
  const now = new Date();
  const inputs = await loadSuggestionInputs(supabase, { now, scope: null, timeZone });
  await pickTodaysSuggestions({
    supabase,
    userId: user.id,
    locale,
    localDay: formatLocalDate(localDateOf(now, timeZone)),
    candidates: suggestionCandidates(inputs),
  });
}
