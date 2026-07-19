import { Bell } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { markNotification } from "@/features/agent/actions";
import { PaginationLinks } from "@/features/shell/pagination-links";
import { requireUser } from "@/lib/auth/require-user";
import { pageRange, paginateRows, parsePage } from "@/lib/pagination";
import { isLocale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";

export default async function NotificationsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ page?: string | string[] }> }) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const pt = locale === "pt-BR";
  const page = parsePage((await searchParams).page);
  const { from, to } = pageRange(page);
  const { supabase } = await requireUser(locale);
  const result = await supabase.from("notifications").select("id,type,title,body,action_url,priority,status,created_at").neq("status", "dismissed").order("created_at", { ascending: false }).range(from, to);
  const { items, hasNext } = paginateRows(requireSupabaseData(result, "load notifications") ?? []);

  return <div className="content-page"><header className="list-header"><div><p className="eyebrow">{pt ? "BRAIN PROATIVO" : "PROACTIVE BRAIN"}</p><h1>{pt ? "Notificações" : "Notifications"}</h1><p>{pt ? "Somente sinais relevantes, com deduplicação e respeito ao silêncio." : "Only relevant signals, deduplicated and respectful of quiet hours."}</p></div></header>{items.length ? <div className="list-stack">{items.map((item) => <article className={`list-row notification-row ${item.status}`} key={item.id}><div className="list-row-main"><strong>{item.title}</strong><p>{item.body}</p></div><div className="list-meta"><span>{new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(item.created_at))}</span>{item.action_url && <Link className="row-action" href={item.action_url}>{pt ? "Abrir" : "Open"}</Link>}<form action={markNotification}><input type="hidden" name="locale" value={locale} /><input type="hidden" name="notificationId" value={item.id} /><input type="hidden" name="status" value="read" /><button className="row-action" type="submit">{pt ? "Lida" : "Read"}</button></form></div></article>)}</div> : <div className="empty-list"><Bell size={30} /><strong>{pt ? "Tudo tranquilo" : "All quiet"}</strong><p>{pt ? "O Brain permanece em silêncio quando não há nada realmente útil." : "Brain stays quiet when there is nothing genuinely useful."}</p></div>}<PaginationLinks locale={locale} path="notifications" page={page} hasNext={hasNext} /></div>;
}
