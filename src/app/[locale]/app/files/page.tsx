import { FileStack, RefreshCw, TriangleAlert } from "lucide-react";
import { notFound } from "next/navigation";
import {
  retryAttachmentJob,
  uploadAttachment,
} from "@/features/agent/actions";
import { JobRetryForm, UploadForm } from "@/features/agent/forms";
import { PaginationLinks } from "@/features/shell/pagination-links";
import { requireUser } from "@/lib/auth/require-user";
import { pageRange, paginateRows, parsePage } from "@/lib/pagination";
import { isLocale } from "@/lib/preferences";
import type { Database } from "@/lib/supabase/database.types";
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

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];
type FailedJob = Pick<
  JobRow,
  | "id"
  | "payload"
  | "attempts"
  | "max_attempts"
  | "next_attempt_at"
  | "failed_at"
> & {
  status: "failed" | "exhausted";
};

const filesCopy = {
  "pt-BR": {
    eyebrow: "ARQUIVOS PRIVADOS",
    title: "Arquivos",
    subtitle: "Originais privados, análise separada e acesso temporário.",
    failedTitle: "Processamentos que precisam de atenção",
    failedSubtitle:
      "O original continua privado e seguro. Detalhes internos do erro não são expostos.",
    recoverable: "Pode tentar novamente",
    exhausted: "Tentativas encerradas",
    attempt: "Tentativa",
    retryAt: "Nova tentativa liberada em",
    missingName: "Arquivo em análise",
    openOriginal: "Abrir original por 10 min",
    analysis: "Ver análise estruturada",
    extractedText: "Texto extraído",
    taskCandidates: "Tarefas candidatas",
    emptyTitle: "Nenhum arquivo",
    emptyBody:
      "Envie um arquivo acima. O original fica privado e a análise aparece separadamente.",
  },
  en: {
    eyebrow: "PRIVATE FILES",
    title: "Files",
    subtitle: "Private originals, separate analysis, and temporary access.",
    failedTitle: "Processing that needs attention",
    failedSubtitle:
      "The original remains private and safe. Internal error details are not exposed.",
    recoverable: "Ready to retry",
    exhausted: "Retries exhausted",
    attempt: "Attempt",
    retryAt: "Retry available at",
    missingName: "File being analyzed",
    openOriginal: "Open original for 10 min",
    analysis: "View structured analysis",
    extractedText: "Extracted text",
    taskCandidates: "Task candidates",
    emptyTitle: "No files",
    emptyBody:
      "Upload one above. The original stays private and its analysis appears separately.",
  },
} as const;

export default async function FilesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const copy = filesCopy[locale];
  const page = parsePage((await searchParams).page);
  const { from, to } = pageRange(page);
  const { supabase } = await requireUser(locale);

  const [fileResult, failedJobResult] = await Promise.all([
    supabase
      .from("attachments")
      .select(
        "id,storage_path,original_name,mime_type,size_bytes,status,description,processing_error,created_at",
      )
      .order("created_at", { ascending: false })
      .range(from, to),
    supabase
      .from("jobs")
      .select(
        "id,status,payload,attempts,max_attempts,next_attempt_at,failed_at",
      )
      .eq("type", "process_attachment")
      .in("status", ["failed", "exhausted"])
      .order("updated_at", { ascending: false })
      .limit(20),
  ]);

  const paginated = paginateRows(
    requireSupabaseData(fileResult, "load files") ?? [],
  );
  const failedJobs = (requireSupabaseData(
    failedJobResult,
    "load failed jobs",
  ) ?? []) as FailedJob[];
  const ids = paginated.items.map((file) => file.id);
  const attachmentIdsByJob = new Map(
    failedJobs.map((job) => {
      const payload = job.payload;
      const attachmentId =
        payload && typeof payload === "object" && !Array.isArray(payload)
          ? payload.attachment_id
          : null;
      return [job.id, typeof attachmentId === "string" ? attachmentId : null];
    }),
  );
  const failedAttachmentIds = [
    ...new Set(
      [...attachmentIdsByJob.values()].filter(
        (attachmentId): attachmentId is string => attachmentId !== null,
      ),
    ),
  ];

  const [interpretationResult, signedResult, failedAttachmentResult] =
    await Promise.all([
      ids.length
        ? supabase
            .from("attachment_interpretations")
            .select(
              "attachment_id,description,extracted_text,task_candidates,extracted_people,extracted_projects,extracted_dates,model,version",
            )
            .in("attachment_id", ids)
            .order("version", { ascending: false })
        : { data: [], error: null },
      paginated.items.length
        ? supabase.storage
            .from("user-files")
            .createSignedUrls(
              paginated.items.map((file) => file.storage_path),
              600,
            )
        : { data: [], error: null },
      failedAttachmentIds.length
        ? supabase
            .from("attachments")
            .select("id,original_name")
            .in("id", failedAttachmentIds)
        : { data: [], error: null },
    ]);

  const interpretations = requireSupabaseData(
    interpretationResult,
    "load file analyses",
  ) as FileAnalysis[] | null;
  const analyses = new Map<string, FileAnalysis>();
  interpretations?.forEach((analysis) => {
    if (!analyses.has(analysis.attachment_id))
      analyses.set(analysis.attachment_id, analysis);
  });

  const signedUrls = requireSupabaseData(signedResult, "sign file links") ?? [];
  const urls = new Map(
    signedUrls
      .filter((item) => !item.error)
      .map((item) => [item.path, item.signedUrl]),
  );
  const failedAttachments = requireSupabaseData(
    failedAttachmentResult,
    "load failed job files",
  ) ?? [];
  const attachmentNames = new Map(
    failedAttachments.map((attachment) => [
      attachment.id,
      attachment.original_name,
    ]),
  );
  const rows = paginated.items.map((file) => ({
    ...file,
    url: urls.get(file.storage_path),
    analysis: analyses.get(file.id),
  }));
  return (
    <div className="content-page">
      <header className="list-header">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p>{copy.subtitle}</p>
        </div>
      </header>

      <UploadForm action={uploadAttachment} locale={locale} />

      {failedJobs.length > 0 && (
        <section className="failed-jobs" aria-labelledby="failed-jobs-title">
          <header>
            <TriangleAlert aria-hidden="true" size={20} />
            <div>
              <h2 id="failed-jobs-title">{copy.failedTitle}</h2>
              <p>{copy.failedSubtitle}</p>
            </div>
          </header>
          <div className="failed-job-list">
            {failedJobs.map((job) => {
              const attachmentId = attachmentIdsByJob.get(job.id);
              const originalName =
                attachmentId
                  ? attachmentNames.get(attachmentId)
                  : null;
              const terminal =
                job.status === "exhausted" ||
                Number(job.attempts) >= Number(job.max_attempts);
              const retryAt = new Date(job.next_attempt_at);
              const retryAtLabel = new Intl.DateTimeFormat(locale, {
                dateStyle: "short",
                timeStyle: "short",
              }).format(retryAt);

              return (
                <article className="failed-job" key={job.id}>
                  <div className="failed-job-copy">
                    <strong>{originalName ?? copy.missingName}</strong>
                    <span className={terminal ? "terminal" : "recoverable"}>
                      {terminal ? copy.exhausted : copy.recoverable}
                    </span>
                    <small>
                      {copy.attempt} {job.attempts}/{job.max_attempts}
                    </small>
                  </div>
                  {!terminal && (
                    <div className="job-retry-controls">
                      <JobRetryForm
                        action={retryAttachmentJob}
                        jobId={job.id}
                        locale={locale}
                      />
                      <span className="job-retry-wait">
                        <RefreshCw aria-hidden="true" size={14} />
                        {copy.retryAt} {retryAtLabel}
                      </span>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {rows.length ? (
        <div className="list-stack file-list">
          {rows.map((file) => (
            <article className="file-card" key={file.id}>
              <header>
                <div>
                  <strong>{file.original_name}</strong>
                  <p>
                    {file.analysis?.description ??
                      file.description ??
                      `${file.mime_type} · ${(
                        Number(file.size_bytes) /
                        1024 /
                        1024
                      ).toFixed(2)} MB`}
                  </p>
                </div>
                <div className="list-meta">
                  <span className={`status-badge ${file.status}`}>
                    {file.status}
                  </span>
                  {file.url && (
                    <a
                      className="row-action"
                      href={file.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {copy.openOriginal}
                    </a>
                  )}
                </div>
              </header>
              {file.processing_error && (
                <p className="form-error">{file.processing_error}</p>
              )}
              {file.analysis && (
                <details className="file-analysis">
                  <summary>{copy.analysis}</summary>
                  {file.analysis.extracted_text && (
                    <div>
                      <h3>{copy.extractedText}</h3>
                      <p>{file.analysis.extracted_text}</p>
                    </div>
                  )}
                  {[
                    ...file.analysis.extracted_people,
                    ...file.analysis.extracted_projects,
                    ...file.analysis.extracted_dates,
                  ].length > 0 && (
                    <div className="tag-cloud">
                      {[
                        ...file.analysis.extracted_people,
                        ...file.analysis.extracted_projects,
                        ...file.analysis.extracted_dates,
                      ].map((item, index) => (
                        <span key={`${item}-${index}`}>{item}</span>
                      ))}
                    </div>
                  )}
                  {file.analysis.task_candidates.length > 0 && (
                    <div>
                      <h3>{copy.taskCandidates}</h3>
                      <div className="mini-list">
                        {file.analysis.task_candidates.map((task, index) => (
                          <article key={`${task.title}-${index}`}>
                            <strong>{task.title}</strong>
                            {task.dueAt && <span>{task.dueAt}</span>}
                          </article>
                        ))}
                      </div>
                    </div>
                  )}
                  <small>{file.analysis.model}</small>
                </details>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-list">
          <FileStack size={30} />
          <strong>{copy.emptyTitle}</strong>
          <p>{copy.emptyBody}</p>
        </div>
      )}

      <PaginationLinks
        locale={locale}
        path="files"
        page={page}
        hasNext={paginated.hasNext}
      />
    </div>
  );
}
