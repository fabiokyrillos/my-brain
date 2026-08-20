/**
 * Dia · Semana · Mês — the owner's signed navigation, as a contract.
 *
 * ## The mapping is not one-to-one, and that is the load-bearing fact
 *
 * `summaries_period_type_check` admits **four** values and the owner asked for
 * **three** tabs:
 *
 * | tab | `period_type` |
 * |---|---|
 * | `day` | `daily` |
 * | `week` | `weekly_review` **and** `weekly_plan` |
 * | `month` | `monthly` |
 *
 * A week carries two kinds of review — looking back at the week that happened
 * and planning the one that is starting — and both are weekly. Splitting them
 * into separate tabs would give four tabs for a decision that named three;
 * putting the plan under the month would file it against a period it does not
 * describe.
 *
 * This mapping is also what dissolves the row of four generate buttons the owner
 * called a "faixa gigantesca": each button moves to the tab whose period it
 * writes, so Dia offers one control, Semana offers two and Mês offers one. No
 * capability is lost; the undifferentiated row stops existing.
 *
 * ## Why the tab is a URL parameter and never component state
 *
 * "Recarregar, voltar e avançar no navegador deve preservar a opção
 * selecionada" is a property of the address bar, not of a `useState`. The tab is
 * read from `searchParams`, the three controls are links, and there is no
 * client-side selection to fall out of step with the URL.
 */

import type { CalendarOrientation } from "@/features/calendar/calendar-query";

export const REVIEW_TABS = ["day", "week", "month"] as const;
export type ReviewTab = (typeof REVIEW_TABS)[number];

/** The four values `summaries.period_type` admits, as the deployed CHECK defines them. */
export const REVIEW_PERIOD_TYPES = ["daily", "weekly_review", "weekly_plan", "monthly"] as const;
export type ReviewPeriodType = (typeof REVIEW_PERIOD_TYPES)[number];

const TAB_PERIOD_TYPES: Record<ReviewTab, readonly ReviewPeriodType[]> = {
  day: ["daily"],
  week: ["weekly_review", "weekly_plan"],
  month: ["monthly"],
};

/**
 * The tab's `period_type` values, for the history filter and the generate
 * controls alike.
 *
 * One declaration feeds both, so a tab cannot list a kind of review it offers no
 * way to create, or offer a button whose output lands under a different tab.
 */
export function periodTypesFor(tab: ReviewTab): readonly ReviewPeriodType[] {
  return TAB_PERIOD_TYPES[tab];
}

/** Which tab a stored review belongs to — the inverse, derived from the same table. */
export function tabForPeriodType(periodType: string): ReviewTab | null {
  const found = REVIEW_TABS.find((tab) => (TAB_PERIOD_TYPES[tab] as readonly string[]).includes(periodType));
  return found ?? null;
}

/**
 * The tab named by a query parameter.
 *
 * **Fails closed to `day`**, which is the posture `scope` already has on this
 * route and the reason it has it: a repeated parameter arrives as an array, and
 * two values is a malformed request rather than a choice between them. Guessing
 * would mean the page sometimes shows a period the URL does not name.
 */
export function parseReviewTab(value: unknown): ReviewTab {
  if (typeof value !== "string") return "day";
  return (REVIEW_TABS as readonly string[]).includes(value) ? (value as ReviewTab) : "day";
}

/**
 * The calendar orientation that shows the same span.
 *
 * `CALENDAR_ORIENTATIONS` already carries `day`, `week` and `month`, so a link
 * from a review to its period in the calendar is built from the calendar's own
 * vocabulary through `calendarHref` — never from a hand-written URL. This is the
 * one place the two surfaces are tied together, so they cannot drift into
 * describing different spans with the same word.
 */
export function calendarOrientationFor(tab: ReviewTab): CalendarOrientation {
  return tab;
}
