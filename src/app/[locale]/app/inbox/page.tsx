import Link from "next/link";
import { Inbox } from "lucide-react";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/preferences";
import { requireUser } from "@/lib/auth/require-user";

export default async function InboxPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale = rawLocale;
  const pt = locale === "pt-BR";
  const { supabase } = await requireUser(locale);
  const { data: entries } = await supabase.from("entries").select("id,original_content,status,occurred_at,created_at").order("created_at", { ascending: false }).limit(100);
  const ids = entries?.map((entry) => entry.id) ?? [];
  const { data: interpretations } = ids.length
    ? await supabase.from("entry_interpretations").select("entry_id,summary,version").in("entry_id", ids).order("version", { ascending: false })
    : { data: [] };
  const summaries = new Map<string, string>();
  interpretations?.forEach((item) => { if (!summaries.has(item.entry_id)) summaries.set(item.entry_id, item.summary); });

  return (
    <div className="content-page">
      <header className="list-header"><div><p className="eyebrow">{pt ? "REGISTROS" : "RECORDS"}</p><h1>{pt ? "Caixa de entrada" : "Inbox"}</h1><p>{pt ? "Tudo que você confiou ao Brain, com o original sempre preservado." : "Everything you entrusted to Brain, with the original always preserved."}</p></div></header>
      {entries?.length ? <div className="list-stack">{entries.map((entry) => (
        <Link href={`/${locale}/app/inbox/${entry.id}`} className="list-row" key={entry.id}>
          <div className="list-row-main"><strong>{summaries.get(entry.id) ?? (entry.status === "failed" ? (pt ? "Entrada pendente de interpretação" : "Entry awaiting interpretation") : entry.original_content)}</strong><p>{entry.original_content}</p></div>
          <div className="list-meta"><span>{new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(entry.occurred_at))}</span><span className={`status-badge ${entry.status}`}>{entry.status}</span></div>
        </Link>
      ))}</div> : <div className="empty-list"><Inbox size={30}/><strong>{pt ? "Nenhum registro ainda" : "No entries yet"}</strong><p>{pt ? "Use a captura rápida para registrar algo sem interromper seu fluxo." : "Use quick capture to save something without breaking your flow."}</p></div>}
    </div>
  );
}
