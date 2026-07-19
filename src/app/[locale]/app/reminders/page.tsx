import { BellRing } from "lucide-react";
import { notFound } from "next/navigation";
import { createReminder } from "@/features/agent/actions";
import { ReminderForm } from "@/features/agent/forms";
import { PaginationLinks } from "@/features/shell/pagination-links";
import { requireUser } from "@/lib/auth/require-user";
import { pageRange, paginateRows, parsePage } from "@/lib/pagination";
import { isLocale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";

export default async function RemindersPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ page?: string | string[] }> }) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const pt = locale === "pt-BR";
  const page = parsePage((await searchParams).page);
  const { from, to } = pageRange(page);
  const { supabase } = await requireUser(locale);
  const result = await supabase.from("reminders").select("id,title,remind_at,important,status").neq("status", "cancelled").order("remind_at").range(from, to);
  const { items, hasNext } = paginateRows(requireSupabaseData(result, "load reminders") ?? []);

  return <div className="content-page"><header className="list-header"><div><p className="eyebrow">{pt ? "NÃO ESQUECER" : "DON'T FORGET"}</p><h1>{pt ? "Lembretes" : "Reminders"}</h1><p>{pt ? "Alertas internos respeitando seu fuso e período silencioso." : "Internal alerts that respect your timezone and quiet hours."}</p></div><ReminderForm action={createReminder} locale={locale} /></header>{items.length ? <div className="list-stack">{items.map((item) => <article className="list-row" key={item.id}><div className="list-row-main"><strong>{item.title}</strong><p>{new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short" }).format(new Date(item.remind_at))}</p></div><div className="list-meta">{item.important && <span className="status-badge">{pt ? "importante" : "important"}</span>}<span className={`status-badge ${item.status}`}>{item.status}</span></div></article>)}</div> : <div className="empty-list"><BellRing size={30} /><strong>{pt ? "Nenhum lembrete" : "No reminders"}</strong><p>{pt ? "Crie um lembrete acima ou peça ao Brain durante uma captura." : "Create one above or ask Brain during capture."}</p></div>}<PaginationLinks locale={locale} path="reminders" page={page} hasNext={hasNext} /></div>;
}
