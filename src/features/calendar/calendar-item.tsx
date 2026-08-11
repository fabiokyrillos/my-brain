"use client";

/**
 * One item on the calendar — the only place calendar content reaches the DOM.
 *
 * ## Why this is a component and not a `<li>` in the view
 *
 * `2M-PRIVACY-001` requires every rendered task title to go through
 * `ProtectedContent`, and `2M-PRIVACY-005` requires the same of reminder titles.
 * A rule spread across a day cell, a week cell and an agenda row is a rule that
 * ends the first time somebody adds a fourth. There is exactly one component
 * that renders an item's words, all three orientations mount it, and
 * `sensitivity-convergence.test.ts` fails the build if the calendar renders
 * content without it.
 *
 * ## Why the lane is carried by more than colour
 *
 * `2M-ACCESS-005` forbids colour as the only carrier of the
 * committed-versus-suggested distinction, of a conflict, or of a lane. So each
 * item states its lane and its commitment **in text** — visible text, not only
 * an `aria-label`, because a sighted user with a colour-vision difference reads
 * the same screen as everyone else and an invisible label helps only a screen
 * reader. The colour is decoration on top of a distinction that already exists
 * without it.
 */

import { ProtectedContent } from "@/features/operations/protected-content";
import type { Locale } from "@/lib/preferences";

import type { CalendarItemView } from "./calendar-contracts";
import { getCalendarCopy } from "./copy";

/**
 * The item's instant, in the **user's** zone (`2M-TIME-003`).
 *
 * `timeZone` is passed explicitly and never omitted: `Intl` defaults to the
 * host's zone, which on a server is UTC and in a browser is wherever the device
 * happens to be — and `2M-TIME-003` makes `profiles.timezone` the only answer.
 */
function formatTime(instant: string, locale: Locale, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(new Date(instant));
}

export function CalendarItem({
  item,
  locale,
  timezone,
}: {
  item: CalendarItemView;
  locale: Locale;
  timezone: string;
}) {
  const copy = getCalendarCopy(locale);
  const laneName = copy.lanes.names[item.lane];
  const commitment = copy.commitment[item.commitment];
  const time = formatTime(item.at, locale, timezone);

  return (
    <li
      className="calendar-item"
      data-lane={item.lane}
      data-commitment={item.commitment}
      data-elapsed={item.elapsed ? "true" : "false"}
    >
      <span className="calendar-item-meta">
        {/* Text, not only colour: 2M-ACCESS-005. */}
        <span className="calendar-item-lane">{laneName}</span>
        <span className="calendar-item-commitment">{commitment}</span>
        <time className="calendar-item-time" dateTime={item.at}>{time}</time>
        {item.elapsed ? <span className="calendar-item-elapsed">{copy.item.elapsed}</span> : null}
      </span>
      <span className="calendar-item-body">
        {item.title === null ? (
          /*
           * The two lanes with no user text. `null` means *there is nothing to
           * render* and never *there is something and we are hiding it* — the
           * second is what a masked title says, and conflating them would make
           * the mask meaningless. So this renders the lane's own description
           * and links out; it does not mount `ProtectedContent`, because there
           * is nothing to protect.
           */
          item.href ? (
            <a className="calendar-item-link" href={item.href}>
              {copy.lanes.descriptions[item.lane]}
            </a>
          ) : (
            <span>{copy.lanes.descriptions[item.lane]}</span>
          )
        ) : (
          <ProtectedContent
            href={item.href ?? undefined}
            locale={locale}
            revealKey={item.id}
            sensitivity={item.sensitivity}
            surface="calendar"
          >
            {item.href ? (
              <a className="calendar-item-link" href={item.href}>{item.title}</a>
            ) : (
              <span>{item.title}</span>
            )}
          </ProtectedContent>
        )}
      </span>
    </li>
  );
}
