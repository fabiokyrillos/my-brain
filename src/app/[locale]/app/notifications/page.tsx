import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountDataStrip } from "@/features/account-centre/account-data-strip";
import { markNotification } from "@/features/agent/actions";
import { UniversalStateView } from "@/features/experience/universal-state";
import { readPushConsent, readVapidPublicKey } from "@/features/notifications/consent-reader";
import { getNotificationSettingsCopy } from "@/features/notifications/copy";
import { NotificationSettings } from "@/features/notifications/notification-settings";
import { requireProfileTimeZone } from "@/features/calendar/calendar-projection";
import { PaginationLinks } from "@/features/shell/pagination-links";
import { requireUser } from "@/lib/auth/require-user";
import { pageRange, paginateRows, parsePage } from "@/lib/pagination";
import { isLocale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";
import { instantFormatter } from "@/lib/time/instant-format";
import { getAgentName } from "@/features/profile/agent-identity";

/**
 * `2M-TIME-005` and `2M-TIME-006`, and the defect they found here.
 *
 * This page used to format `created_at` with
 * `new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" })`
 * and **no `timeZone`**, so it rendered in the host's zone — UTC on the server —
 * while the calendar, the planner, the reminders page and the task detail had
 * all been passing the owner's zone since slice 2M.1. A user who changed their
 * timezone in settings saw four surfaces move and this one stay put, and the same
 * instant read differently depending on which page it was on.
 *
 * It now reads `profiles.timezone` like its neighbours and formats through the
 * one contract, so a change to the preference reaches every dated surface and
 * two surfaces cannot disagree about an instant.
 */
export default async function NotificationsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ page?: string | string[] }> }) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const pt = locale === "pt-BR";
  const page = parsePage((await searchParams).page);
  const { from, to } = pageRange(page);
  const { supabase, user } = await requireUser(locale);
  const timezone = await requireProfileTimeZone(supabase, user.id);
  const formatCreatedAt = instantFormatter("dayAndTime", locale, timezone);

  const agentName = await getAgentName();
  const result = await supabase.from("notifications").select("id,type,title,body,action_url,priority,status,created_at").neq("status", "dismissed").order("created_at", { ascending: false }).range(from, to);
  const { items, hasNext } = paginateRows(requireSupabaseData(result, "load notifications") ?? []);

  const consent = await readPushConsent(supabase, user.id);
  const notifyCopy = getNotificationSettingsCopy(locale);

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
    appeared twice and the second one read as the start of a different page. The
    heading order is now h1 → h2, which is both what a screen reader announces
    as an outline and what a sighted reader takes as "one page, two sections".
  */}<header className="list-header"><div><p className="eyebrow">{pt ? "BRAIN PROATIVO" : "PROACTIVE BRAIN"}</p><h1>{pt ? "Notificações" : "Notifications"}</h1><p>{pt ? "Somente sinais relevantes, com deduplicação e respeito ao silêncio." : "Only relevant signals, deduplicated and respectful of quiet hours."}</p></div></header>{/*
    `2M-NOTIFY-003`/`-008`. The governance section sits above the list it makes
    a promise about, so the promise and the thing it is a promise about are read
    together.

    Slice 2M.4b replaces slice 2M.4a's hardcoded `NO_CONSENT.state` with the
    real owner-scoped read. The resolution is still fail-closed: a missing or
    unreadable record resolves to `unsupported`, never to a default-on.
  */}<NotificationSettings
    locale={locale}
    state={consent.state}
    pushPublicKey={readVapidPublicKey()}
    enabledTypes={consent.enabledTypes}
    frequency={consent.frequency}
    quietStart={consent.quietStart ?? "22:30"}
    quietEnd={consent.quietEnd ?? "07:00"}
    dailyCap={consent.dailyCap}
  />{/*
    The feed, as a named section of this page rather than as an unlabelled tail
    of it. `2M-NOTIFY-008` is why it stays here at all — this is the surface
    where notification CONTENT lives, behind the login — and the section keeps
    its pagination, its `?page` deep link and its empty state exactly as they
    were. Only the name above it is new.
  */}<section aria-labelledby="notification-history-heading" className="notification-history"><h2 id="notification-history-heading">{notifyCopy.historyHeading}</h2>{items.length ? <div className="list-stack">{items.map((item) => <article className={`list-row notification-row ${item.status}`} key={item.id}><div className="list-row-main"><strong>{item.title}</strong><p>{item.body}</p></div><div className="list-meta"><span>{formatCreatedAt(item.created_at)}</span>{item.action_url && <Link className="row-action" href={item.action_url}>{pt ? "Abrir" : "Open"}</Link>}<form action={markNotification}><input type="hidden" name="locale" value={locale} /><input type="hidden" name="notificationId" value={item.id} /><input type="hidden" name="status" value="read" /><button className="row-action" type="submit">{pt ? "Lida" : "Read"}</button></form></div></article>)}</div> : <UniversalStateView description={pt ? `O ${agentName} permanece em silêncio quando não há nada realmente útil.` : `${agentName} stays quiet when there is nothing genuinely useful.`} locale={locale} state="empty" title={pt ? "Tudo tranquilo" : "All quiet"} />}<PaginationLinks locale={locale} path="notifications" page={page} hasNext={hasNext} /></section></div>;
}
