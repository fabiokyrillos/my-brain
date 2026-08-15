import "server-only";
import { loadCalendarProjection, requireProfileTimeZone } from "@/features/calendar/calendar-projection";
import type { CalendarCommitment, CalendarLane } from "@/features/calendar/calendar-query";
import type { TaskSensitivity } from "@/features/sensitivity/task-derivation";
import { localDateOf } from "@/lib/time/local-day";
import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Hoje's "Adiante" panel — the day's remaining anchors and what is committed
 * next (`02-arquitetura-e-rotas.md`, Hoje: *captura → precisa de você →
 * hoje/atrasado → adiante → fechar o dia*).
 *
 * It owns **no** time rule of its own. Every date, every lane, every
 * classification and the owner's zone come from `loadCalendarProjection`, which
 * is the single authority on what the calendar contains; this module only
 * flattens a forward window into the short, ordered list a cockpit panel can
 * hold. A second reader of `tasks.due_at` here is exactly the divergence
 * `LDC-DAILY-001` and `2M-TIME-003` exist to prevent.
 */
export type HomeAgendaItem = {
  readonly key: string;
  readonly lane: CalendarLane;
  readonly commitment: CalendarCommitment;
  readonly at: string;
  /** The local date it belongs to, already decided by the calendar projection. */
  readonly date: string;
  readonly isToday: boolean;
  readonly title: string | null;
  readonly sensitivity: TaskSensitivity;
  readonly href: string | null;
};

export type HomeAgendaProjection = {
  readonly items: readonly HomeAgendaItem[];
  /** True when the window held more than the panel shows, so the link can say so. */
  readonly hasMore: boolean;
  readonly timezone: string;
};

export const EMPTY_HOME_AGENDA: HomeAgendaProjection = {
  items: [],
  hasMore: false,
  timezone: "UTC",
};

/** What a cockpit panel can hold before it stops being a glance. */
export const HOME_AGENDA_LIMIT = 5;

/**
 * The task behind an agenda item, or `null` when the item is not a task.
 *
 * Read off the calendar's own `lane:rowId` id rather than off `reschedule`,
 * which is deliberately `null` for a task whose status admits no scheduling
 * verb. Keying the de-duplication on `reschedule` would therefore have failed
 * silently for exactly the tasks that cannot be moved — they would appear twice
 * on Hoje, and only those.
 */
function taskIdOf(lane: CalendarLane, id: string): string | null {
  if (lane !== "deadline" && lane !== "intention") return null;
  const separator = id.indexOf(":");
  return separator === -1 ? null : id.slice(separator + 1);
}

/**
 * @param excludeTaskIds task ids Hoje is already rendering in "hoje e atrasado".
 *
 * The same task in two lists on one screen is the repetition `2J-HOJE-004`
 * removed from this page once already, and the second copy always carries less
 * than the first. Passing the ids in — rather than filtering by date here —
 * keeps the decision with the surface that knows what it drew.
 */
export async function loadHomeAgendaProjection(
  supabase: SupabaseClient,
  input: {
    readonly userId: string;
    readonly locale: string;
    readonly now: Date;
    readonly excludeTaskIds?: ReadonlySet<string>;
    readonly limit?: number;
    /** Test seam only. Production resolves the zone from `profiles`. */
    readonly timezone?: string;
  },
): Promise<HomeAgendaProjection> {
  const { userId, locale, now } = input;
  const limit = input.limit ?? HOME_AGENDA_LIMIT;
  const exclude = input.excludeTaskIds ?? new Set<string>();

  /*
    The owner's zone is resolved **before** the anchor, because the anchor is a
    local date and which date that is depends on the zone. This is the same
    ordering the calendar route uses, and for the same reason.

    An earlier draft anchored on `localDateOf(now, input.timezone ?? "UTC")` and
    reasoned that a one-day drift could only *include* yesterday. That is true
    for positive offsets and false for negative ones — which is every zone this
    product defaults to. In America/Sao_Paulo at 22:30 local, the UTC date is
    already tomorrow, so the window started at tonight's local midnight and
    **excluded the rest of today**: a task due 23:00 was never read, and no day
    in the range was `isToday`. It happened every evening, for as many hours as
    the zone is behind UTC.
  */
  const timezone = input.timezone ?? await requireProfileTimeZone(supabase, userId);

  /*
    `agenda` is the calendar's own forward-looking orientation (a fortnight from
    the anchor), so "what is next" is answered by the module that already
    defines it rather than by a window invented here.
  */
  const projection = await loadCalendarProjection(supabase, {
    userId,
    locale,
    now,
    timezone,
    query: {
      orientation: "agenda",
      anchor: localDateOf(now, timezone),
      lanes: ["deadline", "intention", "reminder"],
    },
  });

  const nowIso = now.toISOString();
  const flattened = projection.days.flatMap((day) =>
    day.items
      /* Past instants belong to "hoje e atrasado", which says they are late.
         Repeating them here as "coming up" would contradict that section. */
      .filter((item) => item.at >= nowIso)
      .filter((item) => !exclude.has(taskIdOf(item.lane, item.id) ?? ""))
      .map((item): HomeAgendaItem => ({
        key: item.id,
        lane: item.lane,
        commitment: item.commitment,
        at: item.at,
        date: item.date,
        isToday: day.isToday,
        title: item.title,
        sensitivity: item.sensitivity,
        href: item.href,
      })),
  );

  flattened.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

  return {
    items: flattened.slice(0, limit),
    hasMore: flattened.length > limit,
    timezone: projection.timezone,
  };
}
