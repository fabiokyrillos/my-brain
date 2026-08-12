"use client";

/**
 * `2I-SEARCH-002` / `2I-SEARCH-003` / `2I-SEARCH-005` … `2I-SEARCH-011` — the
 * search surface.
 *
 * ## What this component is careful about
 *
 * **The sensitive scope is visible while it is on** (OD-1). A filter that
 * silently widens what you are looking at is worse than no filter, because the
 * user attributes the extra results to the query.
 *
 * **The empty state never hints at what was excluded.** "Nothing found" reads
 * identically whether or not `highly_sensitive` matches exist. Suggesting
 * "try enabling sensitive search" would be an existence oracle with a helpful
 * tone — OD-1 forbids exactly that.
 *
 * **A failed domain is named** (`2I-SEARCH-007`), and the rest still render. A
 * dropped domain is a wrong answer that looks complete.
 */

import { useId, useState, useTransition } from "react";

import { SourceCard } from "@/features/experience/trust-components";
import { UniversalStateView, UniversalSkeleton } from "@/features/experience/universal-state";
import type { Locale } from "@/lib/preferences";

import {
  PERIOD_FILTERS,
  SEARCH_DOMAINS,
  type PeriodFilter,
  type SearchDomain,
  type SearchResponse,
} from "./contracts";
import { formatInstant } from "@/lib/time/instant-format";
import { getSearchCopy } from "./copy";

export type SearchSurfaceProps = {
  readonly locale: Locale;
  /**
   * The owner's zone (`LDC-SEARCH-001`). A prop rather than a read, because this
   * is a client component: the browser's zone is not the authority, and a result
   * dated differently here than on the contextual page it links to is the
   * divergence this initiative exists to remove.
   */
  readonly timeZone: string;
  /** Injected so the component performs no I/O of its own. */
  readonly runSearch: (input: {
    query: string;
    locale: Locale;
    domains?: readonly SearchDomain[];
    period?: PeriodFilter | null;
    sensitiveScope?: boolean;
  }) => Promise<SearchResponse>;
  /** Content-free telemetry. See `2I-METRIC-004`. */
  readonly onSearched?: (event: {
    resultBucket: string;
    typeFilterUsed: boolean;
    periodFilterUsed: boolean;
    sensitiveScope: boolean;
    partial: boolean;
  }) => void;
};

/** Buckets, never counts — a raw count of a rare term is close to identifying. */
function bucket(count: number): string {
  if (count === 0) return "0";
  if (count <= 3) return "1-3";
  if (count <= 10) return "4-10";
  if (count <= 25) return "11-25";
  return "26+";
}

export function SearchSurface({ locale, runSearch, onSearched, timeZone }: SearchSurfaceProps) {
  const text = getSearchCopy(locale);
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState<SearchDomain | "">("");
  const [period, setPeriod] = useState<PeriodFilter | "">("");
  const [sensitiveScope, setSensitiveScope] = useState(false);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [pending, startTransition] = useTransition();

  const typeId = useId();
  const periodId = useId();
  const inputId = useId();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResponse(null);
      return;
    }
    startTransition(async () => {
      const result = await runSearch({
        query: trimmed,
        locale,
        domains: domain ? [domain] : undefined,
        period: period || null,
        sensitiveScope,
      });
      setResponse(result);
      onSearched?.({
        resultBucket: bucket(result.results.length),
        typeFilterUsed: domain !== "",
        periodFilterUsed: period !== "",
        sensitiveScope: result.sensitiveScope,
        partial: result.partial,
      });
    });
  }

  const failed = (response?.outcomes ?? []).filter((outcome) => outcome.status === "failed");

  return (
    <section className="search-surface">
      <h1 className="search-title">{text.title}</h1>

      <form className="search-form" onSubmit={submit} role="search">
        <label className="sr-only" htmlFor={inputId}>
          {text.inputLabel}
        </label>
        <input
          id={inputId}
          className="search-input"
          type="search"
          value={query}
          placeholder={text.placeholder}
          onChange={(event) => setQuery(event.target.value)}
          autoComplete="off"
        />
        <button type="submit" className="ux-action ux-action-primary">
          {text.submit}
        </button>

        <div className="search-filters">
          <label htmlFor={typeId}>
            <span>{text.filterType}</span>
            <select
              id={typeId}
              value={domain}
              onChange={(event) => setDomain(event.target.value as SearchDomain | "")}
            >
              <option value="">{text.allTypes}</option>
              {SEARCH_DOMAINS.map((key) => (
                <option key={key} value={key}>
                  {text.domains[key]}
                </option>
              ))}
            </select>
          </label>

          <label htmlFor={periodId}>
            <span>{text.filterPeriod}</span>
            <select
              id={periodId}
              value={period}
              onChange={(event) => setPeriod(event.target.value as PeriodFilter | "")}
            >
              <option value="">{text.periodAny}</option>
              {PERIOD_FILTERS.map((key) => (
                <option key={key} value={key}>
                  {text.periods[key]}
                </option>
              ))}
            </select>
          </label>

          {/* OD-1. Off by default, never persisted, and announced while on. */}
          <label className="search-sensitive">
            <input
              type="checkbox"
              checked={sensitiveScope}
              onChange={(event) => setSensitiveScope(event.target.checked)}
            />
            <span>{text.sensitiveToggle}</span>
          </label>
        </div>
        <p className="search-hint">{text.sensitiveHint}</p>
      </form>

      {/* Visibly active while results are shown, so the user attributes the
          extra results to the scope rather than to the query. */}
      {sensitiveScope ? (
        <p className="search-scope-banner tone-attention" role="status">
          {text.sensitiveActive}
        </p>
      ) : null}

      {pending ? <UniversalSkeleton rows={5} label={text.searching} /> : null}

      {!pending && response === null ? (
        <UniversalStateView
          state="empty"
          locale={locale}
          title={text.idle}
          description={text.idleHint}
        />
      ) : null}

      {!pending && response !== null ? (
        <>
          <p className="sr-only" role="status" aria-live="polite">
            {text.resultCount(response.results.length)}
          </p>

          {failed.length > 0 ? (
            <p className="search-partial tone-attention" role="status">
              {text.partial(failed.map((outcome) => text.domains[outcome.domain]).join(", "))}
            </p>
          ) : null}

          {response.results.length === 0 ? (
            <UniversalStateView
              state="empty"
              locale={locale}
              title={text.noResults}
              description={text.noResultsHint}
            />
          ) : (
            <>
              <ul className="search-results">
                {response.results.map((result) => (
                  <li key={`${result.domain}:${result.id}`}>
                    <SourceCard
                      kind={result.domain === "entries" ? "entry" : sourceKindFor(result.domain)}
                      typeLabel={text.domains[result.domain]}
                      title={result.title}
                      snippet={result.snippet ?? undefined}
                      href={result.href}
                      meta={result.occurredAt ? formatDate(result.occurredAt, locale, timeZone) : undefined}
                    />
                  </li>
                ))}
              </ul>
              {response.totalBounded ? <p className="search-bounded">{text.bounded}</p> : null}
            </>
          )}
        </>
      ) : null}
    </section>
  );
}

function sourceKindFor(domain: SearchDomain) {
  switch (domain) {
    case "tasks":
      return "task" as const;
    case "memories":
      return "memory" as const;
    case "people":
      return "person" as const;
    case "projects":
      return "project" as const;
    case "organizations":
      return "organization" as const;
    case "files":
      return "file" as const;
    default:
      return "entry" as const;
  }
}

function formatDate(iso: string, locale: Locale, timeZone: string): string {
  return formatInstant(iso, "day", locale, timeZone) ?? "";
}
