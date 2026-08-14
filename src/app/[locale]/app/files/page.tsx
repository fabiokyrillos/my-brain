import { FileStack, RefreshCw, Search, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  retryAttachmentJob,
  uploadAttachment,
} from "@/features/agent/actions";
import { JobRetryForm, UploadForm } from "@/features/agent/forms";
import { BoundedNotice } from "@/features/bounds/bounded-notice";
import {
  boundedList,
  FAILED_JOB_LIMIT,
  RELATION_LIMIT,
  withProbe,
} from "@/features/bounds/contracts";
import {
  loadAttachmentIdsForSubject,
  loadLinkFilterOptions,
  loadLinksForAttachments,
} from "@/features/library/attachment-links";
import {
  ATTACHMENT_LINK_LIMIT,
  linksByAttachment,
  type AttachmentLink,
} from "@/features/library/link-contracts";
import { getFileLibraryCopy } from "@/features/library/copy";
import { FileFilterBar, type LinkedFilterOption } from "@/features/library/file-filters";
import {
  CLASSIFIED_MIME_TYPES,
  fileFiltersRecord,
  hasActiveFileFilter,
  mimeTypesForKind,
  parseFileFilters,
  periodSince,
} from "@/features/library/filters";
import { LinkedSubjectsSection } from "@/features/library/linked-subjects-section";
import {
  NO_CLASSIFICATION,
  resolveLinkedSubjects,
  subjectIdsByType,
  subjectKey,
  type ResolvedSubjectRow,
} from "@/features/library/linked-subjects";
import { ProtectedContent } from "@/features/operations/protected-content";
import { deriveSubjectSensitivity, readableLevelsOf } from "@/features/sensitivity/subject-derivation";
import { PaginationLinks } from "@/features/shell/pagination-links";
import { attachmentStatusLabel, getVocabularyCopy } from "@/features/vocabulary/copy";
import { requireUser } from "@/lib/auth/require-user";
import { getOwnerTimeZone } from "@/features/profile/owner-timezone";
import { formatInstant } from "@/lib/time/instant-format";
import { pageRange, paginateRows, parsePage } from "@/lib/pagination";
import { ATTACHMENT_LIMITS } from "@/lib/quotas";
import { isLocale } from "@/lib/preferences";
import type { Database } from "@/lib/supabase/database.types";
import { requireSupabaseData, SupabaseQueryError } from "@/lib/supabase/result";

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
    emptyFilteredTitle: "Nenhum arquivo com esses filtros",
    emptyFilteredBody:
      "Os filtros ativos não encontraram nada. Seus outros arquivos continuam aqui.",
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
    emptyFilteredTitle: "No files match these filters",
    emptyFilteredBody:
      "The active filters found nothing. Your other files are still here.",
  },
} as const;

export default async function FilesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const copy = filesCopy[locale];
  const libraryCopy = getFileLibraryCopy(locale);
  const resolvedSearchParams = await searchParams;
  const page = parsePage(resolvedSearchParams.page);
  const { from, to } = pageRange(page);
  // `2N-FILES-010`. Read from the URL rather than from client state, because the
  // predicate has to reach the query — see `features/library/filters.ts` on why
  // filtering a page in memory is the one shape this slice refused.
  const filters = parseFileFilters(resolvedSearchParams);
  const { supabase } = await requireUser(locale);
  // `LDC-CONTEXT-001`. One accessor, cached per request: this page and every
  // other contextual surface stamp instants from the same source.
  const timeZone = await getOwnerTimeZone();

  /*
   * The linked-subject filter is the one axis that cannot be a predicate on
   * `attachments`, because the relationship lives on another table. So it costs
   * exactly **one** extra read, sequential, and **only when the filter is
   * active** — the cost the slice's measurement recorded rather than discovered
   * later.
   *
   * `requireSupabaseData` rather than a fallback to `[]`: a failed read here
   * would otherwise produce an empty id list, which would filter the page down
   * to nothing and render as "no files match" — a failure wearing the shape of
   * an answer.
   */
  const filteredSubject = filters.linked
    ? await loadAttachmentIdsForSubject(
        supabase,
        filters.linked.entityType,
        filters.linked.entityId,
      )
    : null;
  if (filteredSubject?.status === "failed") {
    // A failed read here would otherwise produce an empty id list, filter the
    // page down to nothing, and render as "no files match" — a failure wearing
    // the shape of an answer. The error boundary is the honest destination.
    throw new SupabaseQueryError("load linked file ids", { message: "link read failed" });
  }
  const filteredAttachmentIds =
    filteredSubject?.status === "ok"
      ? filteredSubject.list.items.map((link) => link.attachmentId)
      : null;

  let fileQuery = supabase
    .from("attachments")
    .select(
      // `sensitivity` joins this projection because `2N-PRIVACY-002` names file
      // names as content the contract governs, and `attachments` has carried
      // the column all along — the page simply never read it.
      "id,storage_path,original_name,mime_type,size_bytes,status,description,processing_error,sensitivity,created_at",
    );
  // Every filter is applied HERE, before `.range()`. That ordering is the whole
  // honesty property: the page that comes back is a page of the filtered set,
  // and the pagination beneath it describes that same set.
  if (filters.state) fileQuery = fileQuery.eq("status", filters.state);
  if (filters.kind) {
    const mimeTypes = mimeTypesForKind(filters.kind);
    fileQuery = mimeTypes
      ? fileQuery.in("mime_type", mimeTypes as string[])
      : // `other` is the complement of everything the named kinds cover, so a
        // MIME type added to the allowlist tomorrow still has a home today. The
        // values are quoted because a MIME type is punctuation-heavy and
        // PostgREST reads an unquoted list positionally.
        fileQuery.not(
          "mime_type",
          "in",
          `(${CLASSIFIED_MIME_TYPES.map((value) => `"${value}"`).join(",")})`,
        );
  }
  if (filters.period) {
    const since = periodSince(filters.period, new Date());
    if (since) fileQuery = fileQuery.gte("created_at", since);
  }
  if (filteredAttachmentIds) fileQuery = fileQuery.in("id", filteredAttachmentIds);

  const [fileResult, failedJobResult, linkOptionOutcome] = await Promise.all([
    fileQuery.order("created_at", { ascending: false }).range(from, to),
    supabase
      .from("jobs")
      .select(
        "id,status,payload,attempts,max_attempts,next_attempt_at,failed_at",
      )
      .eq("type", "process_attachment")
      .in("status", ["failed", "exhausted"])
      .order("updated_at", { ascending: false })
      // This list was bounded at a bare 20 and said nothing. An owner with 30
      // failed uploads saw 20 and was told the rest did not exist — on the one
      // section of this page whose entire purpose is "these need your attention".
      .limit(withProbe(FAILED_JOB_LIMIT)),
    // The filter axis's options, read across everything the owner owns rather
    // than from the current page — a chip list that changed as you paged would
    // be describing the page instead of the filter.
    loadLinkFilterOptions(supabase),
  ]);

  const paginated = paginateRows(
    requireSupabaseData(fileResult, "load files") ?? [],
  );
  const boundedFailedJobs = boundedList(
    (requireSupabaseData(failedJobResult, "load failed jobs") ?? []) as FailedJob[],
    FAILED_JOB_LIMIT,
  );
  const failedJobs = boundedFailedJobs.items;
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

  /*
   * `2N-FILES-003`/`-009` — `entity_attachments` gains its first reader.
   *
   * The outcome is kept rather than flattened, because a failed read and an
   * empty table are different claims and the sections below render them
   * differently. Nothing here can write a link: the loader module exports no
   * writer, and `authenticated` holds no `INSERT` on the table.
   */
  const linkOutcome = await loadLinksForAttachments(supabase, ids);
  const pageLinks: readonly AttachmentLink[] =
    linkOutcome.status === "ok" ? linkOutcome.list.items : [];
  /*
   * The filter axis degrades to *absent* when its read fails, rather than taking
   * the page down — the posture `loadAliasesForEntity` records for an
   * enrichment. It is safe here for a reason that does NOT hold for the sections
   * below: an axis that is not rendered makes **no claim at all**, whereas a
   * linked-files section that rendered empty would be asserting there are none.
   */
  const boundedFilterLinks =
    linkOptionOutcome.status === "ok"
      ? linkOptionOutcome.list
      : boundedList<AttachmentLink>([], RELATION_LIMIT);

  // One query per type, never one per link — `2N-FILES-010`'s measurement
  // forbids a round trip per item, and the union of both purposes is resolved in
  // the same read so the filter chips cost no queries of their own.
  const subjectIds = subjectIdsByType([...pageLinks, ...boundedFilterLinks.items]);

  const [interpretationResult, signedResult, failedAttachmentResult, entrySubjectResult, personSubjectResult, projectSubjectResult] =
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
            // SH-STORAGE-004: the duration is a named constant with one home,
            // so this call site and the worker's cannot drift apart.
            .createSignedUrls(
              paginated.items.map((file) => file.storage_path),
              ATTACHMENT_LIMITS.signedUrlSeconds,
            )
        : { data: [], error: null },
      failedAttachmentIds.length
        ? supabase
            .from("attachments")
            .select("id,original_name,sensitivity")
            .in("id", failedAttachmentIds)
        : { data: [], error: null },
      subjectIds.entry.length
        ? supabase.from("entries").select("id,original_content,sensitivity").in("id", subjectIds.entry as string[])
        : { data: [], error: null },
      subjectIds.person.length
        ? supabase.from("people").select("id,name").in("id", subjectIds.person as string[])
        : { data: [], error: null },
      subjectIds.project.length
        ? supabase.from("projects").select("id,name").in("id", subjectIds.project as string[])
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

  /*
   * Signed URLs, kept **per path with their own failure**.
   *
   * The previous shape filtered failures out, so a storage error and a file with
   * no link were the same thing: the control simply vanished, and the user was
   * told nothing. Storage returns a per-item error inside a successful response,
   * so this is the one read on the page where a failure cannot reach the error
   * boundary — which is exactly why it has to be rendered rather than dropped.
   */
  const signedUrls = requireSupabaseData(signedResult, "sign file links") ?? [];
  const urls = new Map(
    signedUrls
      .filter((item) => !item.error)
      .map((item) => [item.path, item.signedUrl]),
  );
  const failedSignedPaths = new Set(
    signedUrls.filter((item) => item.error).map((item) => item.path),
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
  // `2N-PRIVACY-001`/`-002`. Two maps rather than one, because they are read from
  // two different queries with two different bounds — a failed job's attachment
  // is often not on the current page, and merging them would make "absent" mean
  // "not on this page" instead of "unreadable".
  const fileLevels = readableLevelsOf(paginated.items);
  const failedFileLevels = readableLevelsOf(failedAttachments);

  /*
   * The resolved subjects, keyed by `type:id`.
   *
   * Built from rows that actually came back, never from the ids that were asked
   * for. An id the query requested and did not return is removed, foreign or
   * unreadable — and all three land in the same place: absent from this map, and
   * therefore absent from the page.
   */
  const entrySubjects = (entrySubjectResult.data ?? []) as { id: string; original_content: string; sensitivity: string | null }[];
  const entrySubjectLevels = readableLevelsOf(entrySubjects);
  const resolvedSubjects = new Map<string, ResolvedSubjectRow>();
  for (const entry of entrySubjects) {
    resolvedSubjects.set(subjectKey("entry", entry.id), {
      label: entry.original_content,
      sensitivity: deriveSubjectSensitivity(entry.id, entrySubjectLevels),
    });
  }
  for (const person of (personSubjectResult.data ?? []) as { id: string; name: string }[]) {
    // `people` carries no `sensitivity` column and `2N-PRIVACY-003` forbids
    // adding one, so this is the arm that renders in the clear because there is
    // genuinely nothing to look up — never because `normal` was inferred.
    resolvedSubjects.set(subjectKey("person", person.id), {
      label: person.name,
      sensitivity: NO_CLASSIFICATION,
    });
  }
  for (const project of (projectSubjectResult.data ?? []) as { id: string; name: string }[]) {
    resolvedSubjects.set(subjectKey("project", project.id), {
      label: project.name,
      sensitivity: NO_CLASSIFICATION,
    });
  }

  const linksByFile = linksByAttachment(pageLinks);
  /*
   * The filter's options — only the subjects that both have a link and resolved.
   *
   * When this is empty the axis is not rendered at all. With no writer for
   * `entity_attachments` that is the normal case, and a chip list with nothing
   * in it, or a disabled control promising a future one, would be a capability
   * the product does not have wearing the shape of one it does.
   */
  const linkedOptions: LinkedFilterOption[] = [];
  const seenOptions = new Set<string>();
  for (const link of boundedFilterLinks.items) {
    if (link.entityType === "entry") continue;
    const key = subjectKey(link.entityType, link.entityId);
    if (seenOptions.has(key)) continue;
    const subject = resolvedSubjects.get(key);
    if (!subject) continue;
    seenOptions.add(key);
    linkedOptions.push({
      entityType: link.entityType,
      entityId: link.entityId,
      label: subject.label,
    });
  }

  const rows = paginated.items.map((file) => ({
    ...file,
    url: urls.get(file.storage_path),
    signingFailed: failedSignedPaths.has(file.storage_path),
    analysis: analyses.get(file.id),
    links: boundedList(
      resolveLinkedSubjects(linksByFile.get(file.id) ?? [], resolvedSubjects),
      ATTACHMENT_LINK_LIMIT,
      // The page-level read carries its own bound, and every card inherits it —
      // see `PAGE_LINK_LIMIT` on why guessing which card was truncated would be
      // the surface inventing an answer it does not have.
      linkOutcome.status === "ok" && linkOutcome.list.bounded,
    ),
  }));
  return (
    <div className="content-page">
      <header className="list-header">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p>{copy.subtitle}</p>
        </div>
        {/*
          `2N-FILES-011`. Where the answer is a search, the library **links** to
          search rather than growing one of its own: no second index, no second
          snippet builder, no second copy of the seven-domain contract. The
          existing search already reads `original_name`, `description` and
          `extracted_text` under OD-1's sensitivity predicate, and duplicating
          any of that here is precisely what "the library does not become a
          second storage system" forbids.
        */}
        <Link className="row-action" href={`/${locale}/app/search`}>
          <Search aria-hidden="true" size={14} />
          {libraryCopy.searchInFiles}
        </Link>
      </header>
      <p className="quiet-state">{libraryCopy.searchInFilesHint}</p>

      <UploadForm action={uploadAttachment} locale={locale} />

      <FileFilterBar filters={filters} linkedOptions={linkedOptions} locale={locale} />
      <BoundedNotice list={boundedFilterLinks} locale={locale} />

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
              const retryAtLabel = formatInstant(job.next_attempt_at, "dayAndTime", locale, timeZone);

              return (
                <article className="failed-job" key={job.id}>
                  <div className="failed-job-copy">
                    {/*
                      A failed job names the file it failed on, so this row
                      carries a file name too and obeys the same contract. When
                      the attachment could not be read at all the copy already
                      falls back to a generic label, which is `undetermined`'s
                      rendering by another route — there is no name to withhold.
                    */}
                    <ProtectedContent
                      locale={locale}
                      revealKey={`failed-job-${job.id}`}
                      sensitivity={deriveSubjectSensitivity(attachmentId ?? null, failedFileLevels)}
                      surface="file"
                    >
                      <strong>{originalName ?? copy.missingName}</strong>
                    </ProtectedContent>
                    <span className={terminal ? "terminal" : "recoverable"}>
                      {terminal ? copy.exhausted : copy.recoverable}
                    </span>
                    <small>
                      {copy.attempt} {job.attempts}/{job.max_attempts}
                    </small>
                  </div>
                  {/*
                    `2N-FILES-007`. The retry control appears only where a retry
                    is a real action: an exhausted job has no path left, and
                    offering the button anyway would be a recovery affordance for
                    a recovery that cannot happen.
                  */}
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
          <BoundedNotice list={boundedFailedJobs} locale={locale} />
        </section>
      )}

      {rows.length ? (
        <div className="list-stack file-list">
          {rows.map((file) => (
            <article className="file-card" id={`file-${file.id}`} key={file.id}>
              <header>
                <div>
                  {/*
                    The name and the description are withheld together, under one
                    control. They are the same fact about the same file — the
                    name the owner uploaded and the model's summary of what is
                    inside it — so two separate reveals would ask the user to
                    make one decision twice. The size and MIME fallback is not
                    file content and is not withheld.
                  */}
                  <ProtectedContent
                    locale={locale}
                    revealKey={`file-${file.id}`}
                    sensitivity={deriveSubjectSensitivity(file.id, fileLevels)}
                    surface="file"
                  >
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
                  </ProtectedContent>
                </div>
                <div className="list-meta">
                  <span className={`status-badge ${file.status}`}>
                    {attachmentStatusLabel(locale, file.status) ??
                      getVocabularyCopy(locale).unknownState}
                  </span>
                  {file.url ? (
                    <a
                      className="row-action"
                      href={file.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {copy.openOriginal}
                    </a>
                  ) : file.signingFailed ? (
                    // Signing failed for THIS file. Saying so is the difference
                    // between "the link is temporarily unavailable" and the user
                    // concluding their original is gone.
                    <span className="quiet-state" role="note">
                      {libraryCopy.originalUnavailable}
                    </span>
                  ) : null}
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
                      {/*
                        Text lifted out of the document itself — the most
                        content-bearing thing on this page. Withheld under its
                        own control rather than the header's, because opening the
                        disclosure and revealing the text are two separate acts
                        and the second is the one that exposes the document.
                      */}
                      <ProtectedContent
                        locale={locale}
                        revealKey={`file-text-${file.id}`}
                        sensitivity={deriveSubjectSensitivity(file.id, fileLevels)}
                        surface="file"
                      >
                        <p>{file.analysis.extracted_text}</p>
                      </ProtectedContent>
                    </div>
                  )}
                  {/*
                    `2N-FILES-006`, and the defect this slice's census found.

                    These two blocks rendered **outside** any classification: on a
                    `highly_sensitive` file the name, the description and the
                    extracted text were withheld, and directly beneath them the
                    page printed the names of people found inside the document
                    and candidate task titles that are frequently a sentence
                    lifted verbatim from it. Extracted text was reaching a surface
                    the classification masks, through the two fields derived from
                    it rather than through the field named after it.

                    They are withheld together and under a control of their own,
                    for the same reason the extracted text is: opening the
                    disclosure and revealing what the model read out of the
                    document are two separate acts.
                  */}
                  {(() => {
                    const found = [
                      ...file.analysis.extracted_people,
                      ...file.analysis.extracted_projects,
                      ...file.analysis.extracted_dates,
                    ];
                    const candidates = file.analysis.task_candidates;
                    if (found.length === 0 && candidates.length === 0) return null;
                    return (
                      <div>
                        <h3>{libraryCopy.analysisEntities}</h3>
                        <ProtectedContent
                          locale={locale}
                          revealKey={`file-derived-${file.id}`}
                          sensitivity={deriveSubjectSensitivity(file.id, fileLevels)}
                          surface="file"
                        >
                          {found.length > 0 && (
                            <span className="tag-cloud">
                              {found.map((item, index) => (
                                <span key={`${item}-${index}`}>{item}</span>
                              ))}
                            </span>
                          )}
                          {candidates.length > 0 && (
                            <span className="mini-list">
                              <span className="mini-list-title">{copy.taskCandidates}</span>
                              {candidates.map((task, index) => (
                                <span key={`${task.title}-${index}`}>
                                  <strong>{task.title}</strong>
                                  {task.dueAt && <span>{task.dueAt}</span>}
                                </span>
                              ))}
                            </span>
                          )}
                        </ProtectedContent>
                      </div>
                    );
                  })()}
                  <small>{file.analysis.model}</small>
                </details>
              )}
              {/*
                `2N-FILES-003`/`-009`, `2N-FILES-005`. The links this file
                actually has — read from `entity_attachments`, never inferred
                from the analysis above it. The anchor is what brings the reader
                back to this card rather than to the top of the list.
              */}
              <LinkedSubjectsSection
                back={`/${locale}/app/files#file-${file.id}`}
                locale={locale}
                outcome={linkOutcome}
                subjects={file.links}
              />
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-list">
          <FileStack size={30} />
          {/*
            An empty filtered set is not an empty library, and saying so is what
            stops a user concluding their files are gone because they clicked a
            chip.
          */}
          <strong>{hasActiveFileFilter(filters) ? copy.emptyFilteredTitle : copy.emptyTitle}</strong>
          <p>{hasActiveFileFilter(filters) ? copy.emptyFilteredBody : copy.emptyBody}</p>
        </div>
      )}

      {/*
        The filters travel with the page number. Page two of a filtered list is
        page two **of that list**; without this the Next link dropped every
        predicate and the filter ended one click after it was applied.
      */}
      <PaginationLinks
        locale={locale}
        path="files"
        page={page}
        hasNext={paginated.hasNext}
        query={fileFiltersRecord(filters)}
      />
    </div>
  );
}
