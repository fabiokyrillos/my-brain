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
import type {
  TaskDetailCommandHandler,
  TaskDetailDateBounds,
} from "@/features/task-commands/task-detail-controls";
import type { Locale } from "@/lib/preferences";
import { formatInstant } from "@/lib/time/instant-format";

import type { CalendarItemView } from "./calendar-contracts";
import { CalendarReschedule } from "./calendar-reschedule";
import { getCalendarCopy } from "./copy";

/**
 * The item's instant, in the **user's** zone (`2M-TIME-003`).
 *
 * `timeZone` is passed explicitly and never omitted: `Intl` defaults to the
 * host's zone, which on a server is UTC and in a browser is wherever the device
 * happens to be — and `2M-TIME-003` makes `profiles.timezone` the only answer.
 */
function formatTime(instant: string, locale: Locale, timeZone: string): string {
  // `2M-TIME-006`, slice 2M.3: delegated to the one instant contract rather than
  // kept as a second option bag. The `time` presentation is byte-for-byte what
  // this function used to build, and it is now the same code the day review's
  // capture times and every other clock on a dated surface run through.
  return formatInstant(instant, "time", locale, timeZone) ?? "";
}

export function CalendarItem({
  dateBounds,
  item,
  locale,
  rescheduleAction,
  timezone,
}: {
  /**
   * `2M-CAL-009`. The reschedule wiring, **injected** rather than imported.
   *
   * Absent means this render carries no command path — the item still renders,
   * still links out and still masks. A component that imported the Server Action
   * itself would make every mount of it a mutation surface, including the ones a
   * test constructs to check masking.
   */
  dateBounds?: TaskDetailDateBounds;
  item: CalendarItemView;
  locale: Locale;
  rescheduleAction?: TaskDetailCommandHandler;
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
        {/*
          `2R-SURFACE-003`, slice 2R.3 — that it repeats, and how.

          Text rather than an icon, for the reason the line above this one gives:
          a mark carrying meaning only in its shape is a mark half the readers do
          not get. The sentence arrives already built by the reminders feature's
          one formatter, so this surface and the reminders list cannot phrase the
          same rule differently.
        */}
        {item.repeats === null ? null : (
          <span className="calendar-item-repeats">{item.repeats}</span>
        )}
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
      {/*
        `2M-CAL-009`/`-010`. Rendered **beside** the title rather than inside
        `ProtectedContent`: masking withholds the words, not the ability to move
        the date. A user who can see that something is due on Thursday and cannot
        read what it is may still push it to Friday, and the controls disclose
        nothing — they carry a task id the caller already owns and a date the
        caller is choosing. Hiding them behind the reveal would make the mask a
        capability gate, which is not what `2M-PRIVACY-001` asks for.
      */}
      {item.reschedule && rescheduleAction && dateBounds ? (
        <CalendarReschedule
          action={rescheduleAction}
          dateBounds={dateBounds}
          locale={locale}
          target={item.reschedule}
          title={item.title ?? ""}
        />
      ) : null}
    </li>
  );
}
