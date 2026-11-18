import type { Locale } from "@/lib/preferences";
import { formatInstant } from "@/lib/time/instant-format";
import {
  addLocalDays,
  compareLocalDates,
  isSupportedTimeZone,
  localDateOf,
  type LocalDate,
} from "@/lib/time/local-day";

import type { ChatSurfaceCopy } from "./surface-copy";

export type ConversationRow = Readonly<{ id: string; title: string; updated_at: string }>;
/**
 * `when` is the row's one caption (Editorial calmo): the hour for a
 * conversation of today, the day for any other, in the owner's zone. Absent
 * for a row found by the search past the menu, which reads titles only.
 */
export type ConversationLink = Readonly<{ id: string; title: string; when?: Readonly<{ at: string; label: string }> }>;
export type ConversationGroup = Readonly<{ key: string; label: string; items: readonly ConversationLink[] }>;

/** How many conversations the menu holds. Older ones are reached by the menu's server search (ADR-177). */
export const CONVERSATION_MENU_LIMIT = 100;

/** How many older conversations one search past the menu returns (ADR-177). */
export const CONVERSATION_SEARCH_LIMIT = 30;

/**
 * How many of the owner's most recent conversations one search past the menu
 * reads before matching titles in Node (ADR-179). The match has to happen in
 * Node to ignore accents without the `unaccent` extension, so the read is a
 * plain `id,title` list; this ceiling keeps it bounded (~1,000 short rows) and
 * equals the project's PostgREST `max_rows`, which would cut a longer read
 * anyway. A conversation older than the 1,000 most recent is not found.
 */
export const CONVERSATION_SEARCH_SCAN_LIMIT = 1000;

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
    // `null` for a time that cannot be read: the row is kept and says nothing about when.
    const stamp = formatInstant(row.updated_at, key === "today" ? "time" : "day", locale, zone);
    const item: ConversationLink = stamp === null
      ? { id: row.id, title: row.title }
      : { id: row.id, title: row.title, when: { at: row.updated_at, label: stamp } };
    const existing = groups.find((group) => group.key === key);
    if (existing) existing.items.push(item);
    else groups.push({ key, label, items: [item] });
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

/**
 * The one title-matching rule, shared by the menu's local filter and the
 * server search past the menu (ADR-179), so the same text finds the same
 * conversations inside and outside the 100 the menu holds.
 */
export function matchesConversationSearch(title: string, query: string): boolean {
  return normalizeForSearch(title).includes(normalizeForSearch(query.trim()));
}

export function filterGroups(groups: readonly ConversationGroup[], query: string): readonly ConversationGroup[] {
  if (normalizeForSearch(query.trim()) === "") return groups;
  return groups
    .map((group) => ({ ...group, items: group.items.filter((item) => matchesConversationSearch(item.title, query)) }))
    .filter((group) => group.items.length > 0);
}
