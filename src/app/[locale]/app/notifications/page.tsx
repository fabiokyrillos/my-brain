import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { AccountDataStrip } from "@/features/account-centre/account-data-strip";
import { UniversalStateView } from "@/features/experience/universal-state";
import { getNotificationSettingsCopy } from "@/features/notifications/copy";
import { applyNotificationBulk, undoNotificationBulk } from "@/features/notifications/bulk-actions";
import { NotificationBulkBar, NotificationBulkOutcome, NotificationBulkVerb } from "@/features/notifications/notification-bulk-bar";
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
 * How many read notices stay in view beside unanswered ones. Up to this many,
 * a disclosure would hide less than its own line costs.
 */
const READ_ROWS_SHOWN_BESIDE_UNREAD = 3;

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
 * preferences. There is exactly one, the page's last line, and it resolves through
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

  /*
    Editorial calmo (ADR-180): what the page asks comes first. The notices not
    yet answered open it, under the sentence that counts them; the ones already
    read follow, quieter, and fold behind a disclosure once there are more than
    a few of them beside something still unanswered. Nothing is reordered within
    a group — each keeps the query's newest-first order.
  */
  const unreadRows = projected.filter((row) => row.notification.status === "unread");
  const readRows = projected.filter((row) => row.notification.status !== "unread");
  const readFolded = unreadRows.length > 0 && readRows.length > READ_ROWS_SHOWN_BESIDE_UNREAD;
  const renderRow = (row: (typeof projected)[number]) => <NotificationHistoryRow createdAtLabel={formatCreatedAt(row.notification.created_at)} handlers={NOTIFICATION_VERB_HANDLERS} key={row.notification.id} locale={locale} row={row} timeZone={timezone} />;

  return <div className="content-page notification-page">{/*
    `2O-PREF-002`. Ajustes reaches this page by name, so this page says where it
    came from. It is first, above everything, because a reader who arrived from a
    deep link or from the bell needs the orientation before the content, not
    after it.
  */}<AccountDataStrip locale={locale} route="notifications" />{/*
    The page's ONE heading (Life Brain A.5: the shared compact header, no
    eyebrow). The sentence that used to sit under it described the product's
    restraint, not this page, and was already hidden on a phone; it is gone.
  */}<PageHeader size="compact" title={copy.pageTitle} />{/*
    The feed, as a named section. `2M-NOTIFY-008` is why it stays here at all —
    this is the surface where notification CONTENT lives, behind the login — and
    the section keeps its pagination, its `?page` deep link and its empty state.
    Its name is for the outline; the line under it is what a reader sees first.

    `NotificationBulkBar` draws nothing: it is the one action state the two bulk
    verbs and their undo share (Life Brain D.2), so each verb can sit beside
    what it acts on. Their offer is decided by the totals, not by this page.
  */}<NotificationBulkBar applyAction={applyNotificationBulk} locale={locale} readCount={readTotal} undoAction={undoNotificationBulk} unreadCount={unreadTotal}><section aria-labelledby="notification-history-heading" className="notification-history"><h2 className="sr-only" id="notification-history-heading">{copy.historyHeading}</h2>{/*
    The unread count, announced — and now the page's opening line.

    `role="status"` rather than a bare paragraph because the number changes when
    a row is marked read, and that change is the confirmation the action gives
    (`2P-SETTINGS-008`: the state is a word, never only a tint).
  */}<div className="notification-group-head"><p className="notification-unread-summary" role="status">{unread > 0 ? copy.unreadSummary(unread) : copy.allReadSummary}</p><NotificationBulkVerb scope="mark_all_read" /></div><NotificationBulkOutcome />{/*
    Each notice is a `NotificationHistoryRow`: its subject, one caption, the
    row as the link, and the projected verbs through `NotificationVerbs`.
    `projectNotificationRows` returns one row per notice, in order.
  */}{unreadRows.length ? <ul className="notification-list">{unreadRows.map(renderRow)}</ul> : null}{readRows.length ? <details className="notification-read" open={!readFolded}><summary className="notification-read-summary"><span>{copy.readHeading}</span><span className="notification-read-count">{readRows.length}</span></summary><ul className="notification-list">{readRows.map(renderRow)}</ul><NotificationBulkVerb scope="clear_read" /></details> : null}{projected.length ? null : <UniversalStateView className="ux-state-quiet" description={copy.emptyBody(agentName)} locale={locale} state="empty" title={copy.emptyTitle} />}<PaginationLinks locale={locale} path="notifications" page={page} hasNext={hasNext} />{/*
    `2P-SETTINGS-008` allows at most one discreet contextual entry to the
    preferences. It is the page's last line: the controls it points at live in
    Ajustes, and nobody arrives here to change them.
  */}<p className="notification-page-foot"><Link className="notification-preferences-link" href={settingsSectionHref(locale, "day")}>{copy.preferencesLink}</Link></p></section></NotificationBulkBar></div>;
}
