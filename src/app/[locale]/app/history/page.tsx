import { History } from "lucide-react";
import { notFound } from "next/navigation";
import { PaginationLinks } from "@/features/shell/pagination-links";
import { requireUser } from "@/lib/auth/require-user";
import { pageRange, paginateRows, parsePage } from "@/lib/pagination";
import { isLocale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";

export default async function HistoryPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ page?: string | string[] }> }) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const pt = locale === "pt-BR";
  const page = parsePage((await searchParams).page);
  const { from, to } = pageRange(page);
  const { supabase } = await requireUser(locale);
  const result = await supabase.from("audit_logs").select("id,action_type,entity_type,actor,reason,created_at").order("created_at", { ascending: false }).range(from, to);
  const { items, hasNext } = paginateRows(requireSupabaseData(result, "load change history") ?? []);

  return <div className="content-page"><header className="list-header"><div><p className="eyebrow">{pt ? "TRANSPARÊNCIA" : "TRANSPARENCY"}</p><h1>{pt ? "Histórico de alterações" : "Change history"}</h1><p>{pt ? "Quem fez o quê, quando e por qual motivo." : "Who did what, when, and why."}</p></div></header>{items.length ? <div className="timeline-list">{items.map((item) => <article key={item.id}><span className="timeline-dot" /><div><strong>{item.action_type.replaceAll("_", " ")}</strong><p>{item.reason}</p><small>{item.actor} · {item.entity_type} · {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.created_at))}</small></div></article>)}</div> : <div className="empty-list"><History size={30} /><strong>{pt ? "Nenhuma alteração" : "No changes"}</strong><p>{pt ? "Ações do usuário e do agente aparecem aqui." : "User and agent actions appear here."}</p></div>}<PaginationLinks locale={locale} path="history" page={page} hasNext={hasNext} /></div>;
}
