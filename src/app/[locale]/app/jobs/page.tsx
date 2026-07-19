import { Workflow } from "lucide-react";
import { notFound } from "next/navigation";
import { PaginationLinks } from "@/features/shell/pagination-links";
import { requireUser } from "@/lib/auth/require-user";
import { pageRange, paginateRows, parsePage } from "@/lib/pagination";
import { isLocale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";

export default async function JobsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ page?: string | string[] }> }) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const pt = locale === "pt-BR";
  const page = parsePage((await searchParams).page);
  const { from, to } = pageRange(page);
  const { supabase } = await requireUser(locale);
  const result = await supabase.from("jobs").select("id,type,status,attempts,max_attempts,error,created_at").order("created_at", { ascending: false }).range(from, to);
  const { items, hasNext } = paginateRows(requireSupabaseData(result, "load jobs") ?? []);

  return <div className="content-page"><header className="list-header"><div><p className="eyebrow">{pt ? "PROCESSAMENTO" : "PROCESSING"}</p><h1>Jobs</h1><p>{pt ? "Fila técnica privada para processamentos assíncronos e tentativas." : "Private technical queue for asynchronous processing and retries."}</p></div></header>{items.length ? <div className="list-stack">{items.map((job) => <article className="list-row" key={job.id}><div className="list-row-main"><strong>{job.type}</strong><p>{job.error ?? `${pt ? "Tentativas" : "Attempts"}: ${job.attempts}/${job.max_attempts}`}</p></div><div className="list-meta"><span className={`status-badge ${job.status}`}>{job.status}</span></div></article>)}</div> : <div className="empty-list"><Workflow size={30} /><strong>{pt ? "Fila vazia" : "Queue empty"}</strong><p>{pt ? "Jobs de arquivos, resumos e integrações aparecerão aqui." : "File, summary, and integration jobs appear here."}</p></div>}<PaginationLinks locale={locale} path="jobs" page={page} hasNext={hasNext} /></div>;
}
