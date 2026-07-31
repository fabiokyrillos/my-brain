import { notFound } from "next/navigation";

import { createReminder } from "@/features/agent/actions";
import { ReminderForm } from "@/features/agent/forms";
import { getAgentName } from "@/features/profile/agent-identity";
import { getReminderCopy } from "@/features/reminders/copy";
import { asReminderView, loadReminderPage } from "@/features/reminders/projection";
import {
  ReminderEmptyState,
  ReminderList,
  ReminderViewNav,
} from "@/features/reminders/reminder-list";
import { PaginationLinks } from "@/features/shell/pagination-links";
import { requireUser } from "@/lib/auth/require-user";
import { parsePage } from "@/lib/pagination";
import { defaultAgentPreferences, isLocale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";

/**
 * The reminders surface (UX-12, UX-21, UX-22).
 *
 * The route stays thin, the way Slice G4's History page does: it resolves the
 * locale, the reader, their timezone and the requested view, and hands the work
 * to the feature module. Nothing here decides what a reminder means, which
 * actions it accepts, or how a status reads in Portuguese — those are
 * `lifecycle.ts`, `projection.ts` and `copy.ts` respectively, and each is
 * testable without rendering a page.
 *
 * What it used to be: one 1,400-character JSX expression carrying twelve inline
 * locale ternaries, a status filter that hid the only rows `restore` applies to,
 * and the raw `status` column printed as a badge. None of those survive.
 *
 * (`copy.test.ts` greps this file for a locale ternary, so the sentence above
 * describes the shape rather than quoting it — a docstring that spells the
 * forbidden pattern fails the grep that forbids it.)
 */
export default async function RemindersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string | string[]; view?: string | string[] }>;
}) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const copy = getReminderCopy(locale);

  const query = await searchParams;
  const page = parsePage(query.page);
  const view = asReminderView(Array.isArray(query.view) ? query.view[0] : query.view);

  const { supabase, user } = await requireUser(locale);
  const agentName = await getAgentName();

  const profile = requireSupabaseData(
    await supabase.from("profiles").select("timezone").eq("user_id", user.id).maybeSingle(),
    "load reminder timezone",
  );
  const timezone =
    typeof profile?.timezone === "string" && profile.timezone !== ""
      ? profile.timezone
      : defaultAgentPreferences.timezone;

  /**
   * One formatter for the whole page, bound to the owner's zone.
   *
   * Passed down rather than constructed per row: twenty rows building their own
   * `Intl.DateTimeFormat` is twenty chances for one of them to be built without
   * the `timeZone` option and quietly render in the server's zone instead.
   */
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: timezone,
  });
  const formatInstant = (iso: string) => formatter.format(new Date(iso));

  const { reminders, hasNext } = await loadReminderPage(supabase, {
    userId: user.id,
    locale,
    page,
    view,
    now: new Date(),
  });

  return (
    <div className="content-page">
      <header className="list-header">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>{copy.heading}</h1>
          <p>{copy.intro}</p>
        </div>
        <ReminderForm action={createReminder} locale={locale} />
      </header>

      <ReminderViewNav current={view} labels={copy.viewLabel} locale={locale} />

      {reminders.length ? (
        <ReminderList
          formatInstant={formatInstant}
          locale={locale}
          reminders={reminders}
          timezone={timezone}
        />
      ) : (
        <ReminderEmptyState agentName={agentName} locale={locale} view={view} />
      )}

      {/* The view travels through `query`, not concatenated into `path` —
          `PaginationLinks` builds its own `?page=…`, so a query string baked
          into the path would produce two `?` in one href. */}
      <PaginationLinks
        hasNext={hasNext}
        locale={locale}
        page={page}
        path="reminders"
        query={{ view }}
      />
    </div>
  );
}
