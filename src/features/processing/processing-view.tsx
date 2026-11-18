import Link from "next/link";

import { getVocabularyCopy, jobStatusLabel, jobTypeLabel } from "@/features/vocabulary/copy";
import type { Locale } from "@/lib/preferences";

import { getProcessingCopy, type ProcessingCopy } from "./copy";
import { groupJobs, processingState } from "./summary";

export type ProcessingJob = {
  readonly id: string;
  readonly type: string;
  readonly status: string;
  readonly attempts: number;
  readonly max_attempts: number;
  readonly error: string | null;
  readonly created_at: string;
};

/**
 * Processamento, below the strip and the title (Editorial calmo, ADR-180).
 *
 * The page answers *está tudo andando?*, so it opens with that answer as one
 * sentence in the reading face. Then the rows, in the order they matter: what
 * failed, what is in flight, and — folded behind a count — what finished.
 *
 * A row is the kind of work, one caption (when, which attempt) and its state as
 * a word in tone. The worker's own error text and the job's identifier are the
 * technical detail this advanced view exists for, and they sit one press away
 * rather than in the row's place of honour.
 *
 * The page has no write path. A failed file analysis points at Arquivos, which
 * is where the one retry the product offers lives.
 */
export function ProcessingView({
  jobs,
  locale,
  page,
  hasNext,
  formatWhen,
}: {
  jobs: readonly ProcessingJob[];
  locale: Locale;
  page: number;
  hasNext: boolean;
  formatWhen: (iso: string) => string | null;
}) {
  const copy = getProcessingCopy(locale);
  const groups = groupJobs(jobs);
  const state = processingState(groups);
  if (state.kind === "empty") return null;

  const rows = (items: readonly ProcessingJob[]) => (
    <ul className="jobs-rows">
      {items.map((job) => (
        <JobRow copy={copy} formatWhen={formatWhen} job={job} key={job.id} locale={locale} />
      ))}
    </ul>
  );

  return (
    <>
      <div className="jobs-lead">
        {/* A later page is older rows; only the first one is "now". */}
        <p className="jobs-lead-sentence" role="status">
          {page > 1
            ? copy.olderPage(page)
            : state.kind === "settled"
              ? copy.settled
              : copy.lead(state.active, state.failed)}
        </p>
        {page === 1 && hasNext ? <p className="jobs-lead-caption">{copy.recentOnly(jobs.length)}</p> : null}
      </div>

      {groups.failed.length ? (
        <section aria-labelledby="jobs-failed" className="jobs-section">
          <h2 className="jobs-section-title" id="jobs-failed">
            <span>{copy.groups.failed}</span>
            <small>{groups.failed.length}</small>
          </h2>
          {rows(groups.failed)}
        </section>
      ) : null}

      {groups.active.length ? (
        <section aria-labelledby="jobs-active" className="jobs-section">
          <h2 className="jobs-section-title" id="jobs-active">
            <span>{copy.groups.active}</span>
            <small>{groups.active.length}</small>
          </h2>
          {rows(groups.active)}
        </section>
      ) : null}

      {groups.finished.length ? (
        <details className="jobs-fold">
          <summary className="jobs-fold-summary">
            <span>{copy.groups.finished}</span>
            <small>{groups.finished.length}</small>
          </summary>
          {rows(groups.finished)}
        </details>
      ) : null}
    </>
  );
}

function JobRow({
  job,
  copy,
  locale,
  formatWhen,
}: {
  job: ProcessingJob;
  copy: ProcessingCopy;
  locale: Locale;
  formatWhen: (iso: string) => string | null;
}) {
  const when = formatWhen(job.created_at);
  const retryInFiles = job.status === "failed" && job.type === "process_attachment";

  return (
    <li className="jobs-row" data-status={job.status}>
      <span className="jobs-row-main">
        <span className="jobs-row-title">{jobTypeLabel(locale, job.type)}</span>
        {when ? (
          <time className="jobs-row-caption" dateTime={job.created_at}>
            {when}
          </time>
        ) : null}
      </span>
      {/* The state is a word; its colour only repeats what the word says. */}
      <span className="jobs-row-state">
        <span className="jobs-row-status">
          {jobStatusLabel(locale, job.status) ?? getVocabularyCopy(locale).unknownState}
        </span>
        {job.attempts > 0 ? (
          <span className="jobs-row-caption">{copy.attempt(job.attempts, job.max_attempts)}</span>
        ) : null}
      </span>
      {job.error || retryInFiles ? (
        <span className="jobs-row-more">
          {job.error ? (
            <details className="jobs-row-detail">
              <summary className="jobs-row-detail-summary">{copy.detail}</summary>
              <p className="jobs-row-error">{job.error}</p>
              <p className="jobs-row-id">
                {copy.jobId}: {job.id}
              </p>
            </details>
          ) : null}
          {retryInFiles ? (
            <Link className="jobs-row-verb" href={`/${locale}/app/files`}>
              {copy.openFiles}
            </Link>
          ) : null}
        </span>
      ) : null}
    </li>
  );
}
