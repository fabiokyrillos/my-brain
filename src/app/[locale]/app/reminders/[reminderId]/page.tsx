import Link from "next/link";
import { notFound } from "next/navigation";

import { getReminderCopy } from "@/features/reminders/copy";
import {
  ReminderFeedbackBanner,
  ReminderFeedbackProvider,
} from "@/features/reminders/feedback";
import { reminderFormatters } from "@/features/reminders/formatters";
import { loadReminder } from "@/features/reminders/projection";
import { ReminderList } from "@/features/reminders/reminder-list";
import {
  ReminderSeriesBanner,
  ReminderSeriesProvider,
} from "@/features/reminders/series-feedback";
import { requireUser } from "@/lib/auth/require-user";
import { defaultAgentPreferences, isLocale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";

/**
 * One reminder — `NOTIFY-TAP-LANDS-ON-THE-LIST`.
 *
 * A notification names one reminder and used to open the LIST, at its default
 * `pending` view. `pending` admits only `scheduled` and `snoozed`, so a
 * reminder that had just been delivered was absent from the very screen its
 * own notification opened. The owner reported it exactly that way: tapping
 * "não dá impressão de ser um clique com sucesso".
 *
 * ## Why this page renders a list of one
 *
 * `ReminderList` already decides how a reminder reads — its status sentence,
 * the label that changes with state, the linked subject, which controls are
 * offered. A detail layout of its own would be a second presentation of the
 * same row and the two would drift, so this page supplies the surroundings and
 * hands the row to the component that already owns it. The same reason
 * `loadReminder` narrows the list's query instead of writing its own.
 *
 * ## Why a bad id is `notFound` and not an error
 *
 * The id comes out of a URL, so it is untrusted: it is shape-checked here
 * before it ever reaches a query. A well-formed id that belongs to somebody
 * else does not come back either — RLS is the boundary and the `user_id`
 * predicate is the belt — and both cases render the same 404. That identical
 * answer is deliberate: a distinguishable one would tell a stranger which
 * reminder ids exist.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ReminderDetailPage({
  params,
}: {
  params: Promise<{ locale: string; reminderId: string }>;
}) {
  const { locale: candidate, reminderId } = await params;
  if (!isLocale(candidate)) notFound();
  if (!UUID.test(reminderId)) notFound();
  const locale = candidate;
  const copy = getReminderCopy(locale);

  const { supabase, user } = await requireUser(locale);

  const profile = requireSupabaseData(
    await supabase.from("profiles").select("timezone").eq("user_id", user.id).maybeSingle(),
    "load reminder timezone",
  );
  const timezone =
    typeof profile?.timezone === "string" && profile.timezone !== ""
      ? profile.timezone
      : defaultAgentPreferences.timezone;

  const { formatInstant, formatLocalInput, formatLocalTime } = reminderFormatters(
    locale,
    timezone,
  );

  const reminder = await loadReminder(supabase, {
    userId: user.id,
    locale,
    reminderId,
    now: new Date(),
  });
  if (reminder === null) notFound();

  return (
    <div className="content-page">
      <header className="list-header">
        <div>
          <p className="eyebrow">{copy.detail.eyebrow}</p>
          <h1>{copy.detail.heading}</h1>
          <p>{copy.detail.intro}</p>
        </div>
      </header>

      {/*
        The same two providers the list mounts. The row's controls are the
        list's controls — snooze, reschedule, cancel, restore — and they report
        through these contexts, so a page that rendered the row without them
        would offer buttons that could not say what they did.
      */}
      <ReminderFeedbackProvider>
        <ReminderSeriesProvider>
          <ReminderFeedbackBanner label={copy.detail.heading} working={copy.working} />
          <ReminderSeriesBanner locale={locale} />
          <ReminderList
            formatInstant={formatInstant}
            formatLocalInput={formatLocalInput}
            formatLocalTime={formatLocalTime}
            locale={locale}
            reminders={[reminder]}
          />
        </ReminderSeriesProvider>
      </ReminderFeedbackProvider>

      {/*
        The way out, and it matters more here than on most pages: someone who
        arrived by tapping a notification has no history to go back through.
      */}
      <Link href={`/${locale}/app/reminders`}>{copy.detail.backToList}</Link>
    </div>
  );
}
