import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/lib/preferences";

/**
 * `2J-HOJE-001`/`2J-HOJE-002` — `/app/today` now resolves to Hoje.
 *
 * ## The defect this fixes
 *
 * The product had **two things called "today"**. `messages.ts` labels the
 * `home` destination *Hoje* / *Today* and points it at `/app`, where
 * `HomeDashboard` composes capture, attention, the day's work, waiting, the
 * open question and recent activity. Meanwhile this route — the one whose URL
 * literally says `today` — redirected to `/app/work?view=today`, a filtered
 * task list with none of that.
 *
 * A user following the word landed on the weaker surface. Phase 2J's audit
 * found this before any code was written, and it is the highest-value item in
 * the phase precisely because it costs no schema: the cockpit already existed.
 *
 * ## Why a redirect and not a rename
 *
 * `2J-HOJE-002` requires every existing entry point and deep link to keep
 * working. `/app/today` has been a real URL since Phase 2X and is reachable
 * from bookmarks, from `throttle-policy`'s fixtures and from anything a user
 * saved. Deleting it would 404 them; leaving it pointed at Work would keep the
 * collision. Redirecting resolves the word to one surface while keeping the URL
 * alive, which is the only option that satisfies both requirements.
 *
 * The `page` parameter is deliberately **not** forwarded. Hoje is a composed
 * cockpit with no pagination of its own — carrying `?page=3` here would either
 * be ignored (misleading) or have to invent a meaning it does not have. The
 * paginated task list still exists and is still reachable: it is `/app/work`,
 * which is where a user who wanted page 3 of their tasks actually wants to be.
 */
export default async function TodayPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  redirect(`/${candidate}/app`);
}
