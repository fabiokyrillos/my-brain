import { notFound } from "next/navigation";

import { getReminderCopy } from "@/features/reminders/copy";
import {
  ReminderFeedbackBanner,
  ReminderFeedbackProvider,
} from "@/features/reminders/feedback";
import { reminderFormatters } from "@/features/reminders/formatters";
import { loadReminder } from "@/features/reminders/projection";
import { ReminderDetail } from "@/features/reminders/reminder-detail";
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
 * ## The reminder is the page (ADR-180)
 *
 * This page used to render a list of one: the list's card under a heading that
 * said "Lembrete". The list is rows now, and a row keeps one verb, so this is
 * where a reminder is read whole and changed — `ReminderDetail`: its text as
 * the subject, its state, and its facts as one list, each edited in place. The
 * view model is still the list's (`loadReminder` narrows the list's query
 * instead of writing its own), so what a reminder may do is decided once.
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
      {/*
        The same two providers the list mounts. The page's controls are the
        list's commands — snooze, reschedule, edit, cancel, restore, and the
        rule's own — and they report through these contexts, so a page that
        rendered them without the providers would offer buttons that could not
        say what they did.
      */}
      <ReminderFeedbackProvider>
        <ReminderSeriesProvider>
          <ReminderFeedbackBanner label={copy.detail.heading} working={copy.working} />
          <ReminderSeriesBanner locale={locale} />
          <ReminderDetail
            anchorTimeValue={formatLocalTime(reminder.remindAt)}
            locale={locale}
            remindAtLocalValue={formatLocalInput(reminder.remindAt)}
            reminder={reminder}
            whenValue={formatInstant(
              reminder.status === "sent" && reminder.sentAt !== null
                ? reminder.sentAt
                : reminder.remindAt,
            )}
          />
        </ReminderSeriesProvider>
      </ReminderFeedbackProvider>
    </div>
  );
}
