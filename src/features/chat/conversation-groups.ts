import type { Locale } from "@/lib/preferences";
import {
  addLocalDays,
  compareLocalDates,
  isSupportedTimeZone,
  localDateOf,
  type LocalDate,
} from "@/lib/time/local-day";

import type { ChatSurfaceCopy } from "./surface-copy";

export type ConversationRow = Readonly<{ id: string; title: string; updated_at: string }>;
export type ConversationLink = Readonly<{ id: string; title: string }>;
export type ConversationGroup = Readonly<{ key: string; label: string; items: readonly ConversationLink[] }>;

/** How many conversations the menu holds. Older ones are reached by the menu's server search (ADR-177). */
export const CONVERSATION_MENU_LIMIT = 100;

/** How many older conversations one search past the menu returns (ADR-177). */
export const CONVERSATION_SEARCH_LIMIT = 30;

/**
 * Life Brain E.6 (ADR-176) — the conversations menu, grouped by when each was
 * last active, in the owner's own zone: Today, Yesterday, the previous 7 days,
 * the previous 30 days, then one group per month ("Outubro", or "Outubro de
 * 2025" for another year).
 *
 * Pure. The rows arrive newest first (the page orders by `updated_at`), and
 * the groups keep that order, so a group's position never depends on a sort
 * here. A row whose time cannot be read lands in the oldest group rather than
 * disappearing.
 */
export function groupConversations(
  rows: readonly ConversationRow[],
  now: Date,
  timeZone: string,
  locale: Locale,
  labels: ChatSurfaceCopy["groups"],
): readonly ConversationGroup[] {
  const zone = isSupportedTimeZone(timeZone) ? timeZone : "UTC";
  const today = localDateOf(now, zone);
  const yesterday = addLocalDays(today, -1);
  const weekStart = addLocalDays(today, -7);
  const monthStart = addLocalDays(today, -30);
  const monthName = new Intl.DateTimeFormat(locale, { month: "long", timeZone: zone });
  const monthAndYear = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: zone });

  const groups: { key: string; label: string; items: ConversationLink[] }[] = [];
  const place = (key: string, label: string, row: ConversationRow) => {
    const existing = groups.find((group) => group.key === key);
    if (existing) existing.items.push({ id: row.id, title: row.title });
    else groups.push({ key, label, items: [{ id: row.id, title: row.title }] });
  };

  for (const row of rows) {
    const instant = new Date(row.updated_at);
    if (!Number.isFinite(instant.getTime())) {
      place("unknown", labels.month, row);
      continue;
    }
    const day: LocalDate = localDateOf(instant, zone);
    if (compareLocalDates(day, today) >= 0) place("today", labels.today, row);
    else if (compareLocalDates(day, yesterday) === 0) place("yesterday", labels.yesterday, row);
    else if (compareLocalDates(day, weekStart) >= 0) place("week", labels.week, row);
    else if (compareLocalDates(day, monthStart) >= 0) place("month", labels.month, row);
    else {
      const formatter = day.year === today.year ? monthName : monthAndYear;
      const label = formatter.format(instant);
      place(`${day.year}-${day.month}`, label.charAt(0).toLocaleUpperCase(locale) + label.slice(1), row);
    }
  }
  return groups;
}

/**
 * The menu's search: case- and accent-insensitive, on the title only — the
 * titles are already on the client, so nothing new is read.
 */
export function normalizeForSearch(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase();
}

export function filterGroups(groups: readonly ConversationGroup[], query: string): readonly ConversationGroup[] {
  const needle = normalizeForSearch(query.trim());
  if (needle === "") return groups;
  return groups
    .map((group) => ({ ...group, items: group.items.filter((item) => normalizeForSearch(item.title).includes(needle)) }))
    .filter((group) => group.items.length > 0);
}
