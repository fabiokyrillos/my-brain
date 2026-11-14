import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { AccountDataStrip } from "@/features/account-centre/account-data-strip";
import { UniversalStateView } from "@/features/experience/universal-state";
import { getNotificationSettingsCopy } from "@/features/notifications/copy";
import { applyNotificationBulk, undoNotificationBulk } from "@/features/notifications/bulk-actions";
import { NotificationBulkBar } from "@/features/notifications/notification-bulk-bar";
import { NotificationHistoryRow } from "@/features/notifications/notification-history-row";
import { NOTIFICATION_VERB_HANDLERS } from "@/features/notifications/verb-handlers";
import { projectNotificationRows } from "@/features/notifications/row-projection";
import { settingsSectionHref } from "@/features/settings/sections";
import { requireProfileTimeZone } from "@/features/calendar/calendar-projection";
import { PaginationLinks } from "@/features/shell/pagination-links";
import { requireUser } from "@/lib/auth/require-user";
import { pageRange, paginateRows, parsePage } from "@/lib/pagination";
import { isLocale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";
import { instantFormatter } from "@/lib/time/instant-format";
import { getAgentName } from "@/features/profile/agent-identity";

/**
 * `2P-SETTINGS-008` — the page is the history, and only the history.
 *
 * ## What left, and what deliberately did not
 *
 * `NotificationSettings` — consent, the five states, the three facts, the
 * bounds, the type/frequency/quiet-hours/cap controls and the whole of
 * `PushControls` — now lives in Settings → Notificações. Nothing about those
 * preferences changed: the same component takes the same props from the same
 * reader, and `begin_push_delivery` still reads every one of them before
 * sending. **A control that moves must not change meaning**, which is the half
 * of this requirement that is easy to break and hard to notice.
 *
 * What stayed is everything that makes this a route rather than a tab: the URL,
 * the `?page` deep link, the pagination, the owner-scoped read and
 * `AccountDataStrip`'s way back. No redirect was added and no route ended.
 *
 * ## What the page gained
 *
 * Read and unread were a CSS class and nothing else — a tint, invisible to a
 * screen reader and to anyone who cannot tell the two apart. Each row now
 * carries the word, the list is preceded by a live count, and each row's
 * controls are named after the row they belong to rather than repeating "Lida"
 * twenty times with nothing to distinguish them.
 *
 * Loading and error states are **inherited** rather than added:
 * `src/app/[locale]/app/loading.tsx` and `error.tsx` already wrap every
 * authenticated route, this one included. A second pair here would be a second
 * vocabulary for the same two states.
 *
 * ## The one link back
 *
 * `2P-SETTINGS-008` allows *at most one discreet contextual entry* to the
 * preferences. There is exactly one, in the header, and it resolves through
 * `settingsSectionHref` so it cannot drift from where the section actually
 * lives.
 *
 * ## `2M-TIME-005` and `2M-TIME-006`, and the defect they found here
 *
 * This page used to format `created_at` with no `timeZone`, so it rendered in
 * the host's zone — UTC on the server — while four other surfaces had been
 * passing the owner's zone since slice 2M.1. It now reads `profiles.timezone`
 * like its neighbours and formats through the one contract.
 */
export default async function NotificationsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ page?: string | string[] }> }) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const page = parsePage((await searchParams).page);
  const { from, to } = pageRange(page);
  const { supabase, user } = await requireUser(locale);
  const timezone = await requireProfileTimeZone(supabase, user.id);
  const formatCreatedAt = instantFormatter("dayAndTime", locale, timezone);

  const agentName = await getAgentName();
  /*
    `dedupe_key` joins the select in slice 2S.2.

    It is not decoration: `notifications` has no column naming the subject a
    notice is about, and `2S-ACT-001` needs one to derive the primary action
    from the subject's own state. The key carries it — `overdue:{task}:{date}` —
    and `run_user_heartbeat` already recovers it the same way. Reading it here
    is what makes the row's verbs answerable without a second migration.
  */
  const result = await supabase.from("notifications").select("id,type,title,body,action_url,priority,status,created_at,dedupe_key").neq("status", "dismissed").order("created_at", { ascending: false }).range(from, to);
  const { items, hasNext } = paginateRows(requireSupabaseData(result, "load notifications") ?? []);
  const copy = getNotificationSettingsCopy(locale);
  const unread = items.filter((item) => item.status === "unread").length;
  /*
    Life Brain D.2: the bulk verbs act on every notice, not on this page, so
    their offer is decided by the totals. A count that cannot be read is zero:
    the verb is not offered rather than offered blind.
  */
  const [unreadTotal, readTotal] = await Promise.all(
    (["unread", "read"] as const).map(async (status) => {
      const counted = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", status);
      return counted.error ? 0 : counted.count ?? 0;
    }),
  );
  /*
    ONE resolution for the whole page, not one per row.

    `projectNotificationRows` reads every subject this page names in a single
    query per kind, owner-scoped, and returns each row already carrying its
    verbs. Rendering `<NotificationVerbs>` therefore costs no query at all.
  */
  const projected = await projectNotificationRows(supabase, { rows: items, userId: user.id, locale });

  return <div className="content-page">{/*
    `2O-PREF-002`. Ajustes reaches this page by name, so this page says where it
    came from. It is first, above everything, because a reader who arrived from a
    deep link or from the bell needs the orientation before the content, not
    after it.

    Nothing about the route changes: the pagination, the `?page` deep link and
    the owner-scoped read are untouched, which is the half of the Dados e IA
    pattern that matters — no route is redirected and no route ends.
  */}<AccountDataStrip locale={locale} route="notifications" />{/*
    The page's ONE heading, and the polish pass between slices 2O.6 and 2O.7
    moved it here.

    It used to sit below `NotificationSettings`, whose own `<h2>Notificações no
    aparelho</h2>` therefore opened the document at level two — and then the
    `<h1>Notificações</h1>` arrived in the middle of the page, so the word
    appeared twice and the second one read as the start of a different page.
    Slice 2P.5 moved that component to Settings entirely, so the page now opens
    at level one with nothing above it to compete.
  */}{/*
    Life Brain A.5: the shared compact header — no eyebrow, the line under the
    title hides on a phone. Its action is the one discreet contextual entry
    `2P-SETTINGS-008` allows, deliberately a link rather than a panel: the
    controls it points at live in Ajustes.
  */}<PageHeader actions={<Link className="notification-preferences-link" href={settingsSectionHref(locale, "notifications")}>{copy.preferencesLink}</Link>} description={copy.pageDescription} size="compact" title={copy.pageTitle} />{/*
    The feed, as a named section of this page rather than as an unlabelled tail
    of it. `2M-NOTIFY-008` is why it stays here at all — this is the surface
    where notification CONTENT lives, behind the login — and the section keeps
    its pagination, its `?page` deep link and its empty state exactly as they
    were.
  */}<section aria-labelledby="notification-history-heading" className="notification-history"><h2 id="notification-history-heading">{copy.historyHeading}</h2>{/*
    The unread count, announced.

    Before this the only signal was a tint on the row, so a screen-reader user
    had no way to know an alert was unread and a reader who cannot distinguish
    the two tints had none either. `role="status"` rather than a bare paragraph
    because the number changes when a row is marked read, and that change is the
    confirmation the action gives.
  */}<p className="notification-unread-summary" role="status">{unread > 0 ? copy.unreadSummary(unread) : copy.allReadSummary}</p><NotificationBulkBar applyAction={applyNotificationBulk} locale={locale} readCount={readTotal} undoAction={undoNotificationBulk} unreadCount={unreadTotal} />{/*
    Life Brain A.5: each notice is a `NotificationHistoryRow` — two lines and one
    visible control, the verbs behind a "⋯" (still the projected set, through
    `NotificationVerbs`), the destination behind the owner-scoped whitelist.
    `projectNotificationRows` returns one row per notice, in order.
  */}{projected.length ? <ul className="notification-list">{projected.map((row) => <NotificationHistoryRow createdAtLabel={formatCreatedAt(row.notification.created_at)} handlers={NOTIFICATION_VERB_HANDLERS} key={row.notification.id} locale={locale} row={row} timeZone={timezone} />)}</ul> : <UniversalStateView className="ux-state-quiet" description={copy.emptyBody(agentName)} locale={locale} state="empty" title={copy.emptyTitle} />}<PaginationLinks locale={locale} path="notifications" page={page} hasNext={hasNext} /></section></div>;
}
