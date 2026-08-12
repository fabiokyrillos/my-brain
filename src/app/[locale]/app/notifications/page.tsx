import { Bell } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { markNotification } from "@/features/agent/actions";
import { NO_CONSENT } from "@/features/notifications/consent-contract";
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

  return <div className="content-page">{/*
    `2M-NOTIFY-003`/`-008`, slice 2M.4a. The governance section sits above the
    list it makes a promise about, so the promise and the thing it is a promise
    about are read together. The state is `NO_CONSENT.state` — `unsupported` —
    because migration 2 has not created the record yet and the honest answer to
    "what is my consent state" is that there is no record, never a default-on.
  */}<NotificationSettings locale={locale} state={NO_CONSENT.state} /><header className="list-header"><div><p className="eyebrow">{pt ? "BRAIN PROATIVO" : "PROACTIVE BRAIN"}</p><h1>{pt ? "Notificações" : "Notifications"}</h1><p>{pt ? "Somente sinais relevantes, com deduplicação e respeito ao silêncio." : "Only relevant signals, deduplicated and respectful of quiet hours."}</p></div></header>{items.length ? <div className="list-stack">{items.map((item) => <article className={`list-row notification-row ${item.status}`} key={item.id}><div className="list-row-main"><strong>{item.title}</strong><p>{item.body}</p></div><div className="list-meta"><span>{formatCreatedAt(item.created_at)}</span>{item.action_url && <Link className="row-action" href={item.action_url}>{pt ? "Abrir" : "Open"}</Link>}<form action={markNotification}><input type="hidden" name="locale" value={locale} /><input type="hidden" name="notificationId" value={item.id} /><input type="hidden" name="status" value="read" /><button className="row-action" type="submit">{pt ? "Lida" : "Read"}</button></form></div></article>)}</div> : <div className="empty-list"><Bell size={30} /><strong>{pt ? "Tudo tranquilo" : "All quiet"}</strong><p>{pt ? `O ${agentName} permanece em silêncio quando não há nada realmente útil.` : `${agentName} stays quiet when there is nothing genuinely useful.`}</p></div>}<PaginationLinks locale={locale} path="notifications" page={page} hasNext={hasNext} /></div>;
}
