import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { readPushConsent } from "@/features/notifications/consent-reader";
import {
  NOTIFICATION_INVITE_COOKIE,
  isInviteDismissedValue,
  shouldOfferInvitation,
} from "@/features/notifications/invitation";
import { NotificationInvitation } from "@/features/notifications/notification-invitation";
import { deriveThreeFacts, mayInviteAtMomentOfValue } from "@/features/notifications/three-facts";

import { getAgentName } from "@/features/profile/agent-identity";
import { createReminder } from "@/features/reminders/actions";
import { ReminderComposer } from "@/features/reminders/reminder-composer";
import { loadReminderTaskOptions } from "@/features/reminders/task-options";
import { getReminderCopy } from "@/features/reminders/copy";
import {
  ReminderFeedbackBanner,
  ReminderFeedbackProvider,
} from "@/features/reminders/feedback";
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

  /**
   * The same instants as `datetime-local` values, in the owner's zone.
   *
   * Built from `Intl` parts rather than through
   * `formatInstantForDateTimeLocal`: that helper's parser once accepted only
   * instants whose seconds were literally `:00` with no fractional part, while
   * every reminder this surface reads carries whatever `now()` had, so calling
   * it threw inside the client render and took the page to its error boundary.
   * The parser now accepts the full stored grammar; this stays server-side
   * because a throwing parser has no business in client render. `en-CA` gives
   * ISO-ordered date parts, so the pieces assemble without a locale assumption.
   */
  const localInputFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const formatLocalInput = (iso: string) => {
    const parts = localInputFormatter.formatToParts(new Date(iso));
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((candidate) => candidate.type === type)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
  };

  const taskOptions = await loadReminderTaskOptions(
    supabase,
    user.id,
    copy.creation.linkWithheld,
  );

  const { reminders, hasNext } = await loadReminderPage(supabase, {
    userId: user.id,
    locale,
    page,
    view,
    now: new Date(),
  });

  /*
   * `2O-NOTIFY-002`. Three independent conditions, all required:
   *
   * - the account has a reminder still waiting to fire — the moment of value,
   *   read from the page's own data rather than counted separately;
   * - the three facts say an invitation could lead somewhere (a browser that
   *   already refused is not sent to a page whose only offer is a control that
   *   cannot work);
   * - it has not been dismissed on this browser.
   *
   * The consent read is the same owner-scoped one the notifications page makes.
   */
  const inviteConsent = await readPushConsent(supabase, user.id);
  const inviteJar = await cookies();
  const inviteNotifications = shouldOfferInvitation({
    // "Still waiting to fire" is `scheduled` or `snoozed`. There is no
    // `pending` status on a reminder — `sent` has already happened and
    // `cancelled` never will, and neither is a reason to offer an alert.
    hasDemonstratedValue: reminders.some(
      (reminder) => reminder.status === "scheduled" || reminder.status === "snoozed",
    ),
    mayInvite: mayInviteAtMomentOfValue(deriveThreeFacts(inviteConsent.state)),
    dismissed: isInviteDismissedValue(inviteJar.get(NOTIFICATION_INVITE_COOKIE)?.value),
  });

  return (
    <div className="content-page">
      <header className="list-header">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>{copy.heading}</h1>
          <p>{copy.intro}</p>
        </div>
        {/*
          `2P-REMINDER-001`. A single action, not a form.

          The header used to carry `ReminderForm` — three controls and a submit
          button, permanently open above the list. The options are resolved on
          the server because the picker renders task titles, which are governed
          content; see `task-options.ts` for why that resolution cannot happen
          inside an `<option>`.
        */}
        <ReminderComposer action={createReminder} locale={locale} taskOptions={taskOptions} />
      </header>

      <ReminderViewNav current={view} labels={copy.viewLabel} locale={locale} />

      {/*
        `2O-NOTIFY-002`. The invitation appears here and only here, and only
        when there is a reminder still waiting to fire — which IS the
        demonstrated value rather than a proxy for it, and which is why a
        brand-new account can never see it. It links to `/app/notifications`;
        it raises no prompt, and the permission call stays in the one file
        allowed to make it.
      */}
      {inviteNotifications ? <NotificationInvitation locale={locale} /> : null}

      {/*
        The provider wraps the list so a completed transition survives the row
        that produced it: cancel and restore move a reminder out of the current
        view, and the row's own result would unmount with it. Server-rendered
        children pass through a client provider unchanged.
      */}
      <ReminderFeedbackProvider>
        <ReminderFeedbackBanner label={copy.heading} working={copy.working} />
        {reminders.length ? (
          <ReminderList
            formatInstant={formatInstant}
            formatLocalInput={formatLocalInput}
            locale={locale}
            reminders={reminders}
          />
        ) : (
          <ReminderEmptyState agentName={agentName} locale={locale} view={view} />
        )}
      </ReminderFeedbackProvider>

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
