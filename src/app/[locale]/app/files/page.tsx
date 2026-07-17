import { FileStack } from "lucide-react";
import { notFound } from "next/navigation";
import { uploadAttachment } from "@/features/agent/actions";
import { UploadForm } from "@/features/agent/forms";
import { PaginationLinks } from "@/features/shell/pagination-links";
import { requireUser } from "@/lib/auth/require-user";
import { pageRange, paginateRows, parsePage } from "@/lib/pagination";
import { isLocale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";

type FileAnalysis = {
  attachment_id: string;
  description: string;
  extracted_text: string | null;
  task_candidates: Array<{ title?: string; dueAt?: string | null }>;
  extracted_people: string[];
  extracted_projects: string[];
  extracted_dates: string[];
  model: string;
  version: number;
};

export default async function FilesPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ page?: string | string[] }> }) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const pt = locale === "pt-BR";
  const page = parsePage((await searchParams).page);
  const { from, to } = pageRange(page);
  const { supabase } = await requireUser(locale);
  const fileResult = await supabase.from("attachments").select("id,storage_path,original_name,mime_type,size_bytes,status,description,processing_error,created_at").order("created_at", { ascending: false }).range(from, to);
  const paginated = paginateRows(requireSupabaseData(fileResult, "load files") ?? []);
  const ids = paginated.items.map((file) => file.id);
  const interpretationResult = ids.length
    ? await supabase.from("attachment_interpretations").select("attachment_id,description,extracted_text,task_candidates,extracted_people,extracted_projects,extracted_dates,model,version").in("attachment_id", ids).order("version", { ascending: false })
    : { data: [], error: null };
  const interpretations = requireSupabaseData(interpretationResult, "load file analyses") as FileAnalysis[] | null;
  const analyses = new Map<string, FileAnalysis>();
  interpretations?.forEach((analysis) => {
    if (!analyses.has(analysis.attachment_id)) analyses.set(analysis.attachment_id, analysis);
  });
  const signedResult = paginated.items.length
    ? await supabase.storage.from("user-files").createSignedUrls(paginated.items.map((file) => file.storage_path), 600)
    : { data: [], error: null };
  const signedUrls = requireSupabaseData(signedResult, "sign file links") ?? [];
  const urls = new Map(signedUrls.filter((item) => !item.error).map((item) => [item.path, item.signedUrl]));
  const rows = paginated.items.map((file) => ({ ...file, url: urls.get(file.storage_path), analysis: analyses.get(file.id) }));

  return <div className="content-page"><header className="list-header"><div><p className="eyebrow">{pt ? "ARQUIVOS PRIVADOS" : "PRIVATE FILES"}</p><h1>{pt ? "Arquivos" : "Files"}</h1><p>{pt ? "Originais privados, análise separada e acesso temporário." : "Private originals, separate analysis, and temporary access."}</p></div></header><UploadForm action={uploadAttachment} locale={locale} />{rows.length ? <div className="list-stack file-list">{rows.map((file) => <article className="file-card" key={file.id}><header><div><strong>{file.original_name}</strong><p>{file.analysis?.description ?? file.description ?? `${file.mime_type} · ${(Number(file.size_bytes) / 1024 / 1024).toFixed(2)} MB`}</p></div><div className="list-meta"><span className={`status-badge ${file.status}`}>{file.status}</span>{file.url && <a className="row-action" href={file.url} target="_blank" rel="noreferrer">{pt ? "Abrir original por 10 min" : "Open original for 10 min"}</a>}</div></header>{file.processing_error && <p className="form-error">{file.processing_error}</p>}{file.analysis && <details className="file-analysis"><summary>{pt ? "Ver análise estruturada" : "View structured analysis"}</summary>{file.analysis.extracted_text && <div><h3>{pt ? "Texto extraído" : "Extracted text"}</h3><p>{file.analysis.extracted_text}</p></div>}{[...file.analysis.extracted_people, ...file.analysis.extracted_projects, ...file.analysis.extracted_dates].length > 0 && <div className="tag-cloud">{[...file.analysis.extracted_people, ...file.analysis.extracted_projects, ...file.analysis.extracted_dates].map((item, index) => <span key={`${item}-${index}`}>{item}</span>)}</div>}{file.analysis.task_candidates.length > 0 && <div><h3>{pt ? "Tarefas candidatas" : "Task candidates"}</h3><div className="mini-list">{file.analysis.task_candidates.map((task, index) => <article key={`${task.title}-${index}`}><strong>{task.title}</strong>{task.dueAt && <span>{task.dueAt}</span>}</article>)}</div></div>}<small>{file.analysis.model}</small></details>}</article>)}</div> : <div className="empty-list"><FileStack size={30} /><strong>{pt ? "Nenhum arquivo" : "No files"}</strong><p>{pt ? "Envie um arquivo acima. O original fica privado e a análise aparece separadamente." : "Upload one above. The original stays private and its analysis appears separately."}</p></div>}<PaginationLinks locale={locale} path="files" page={page} hasNext={paginated.hasNext} /></div>;
}
