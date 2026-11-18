"use client";

/**
 * `2I-SEARCH-002` / `2I-SEARCH-003` / `2I-SEARCH-005` … `2I-SEARCH-011` — the
 * search surface.
 *
 * ## What this component is careful about
 *
 * **Nothing is held back.** Since Life Brain E.8 (ADR-178) a search covers
 * every sensitivity level, so the "include highly sensitive content" toggle,
 * its hint and its banner are gone.
 *
 * **A failed domain is named** (`2I-SEARCH-007`), and the rest still render. A
 * dropped domain is a wrong answer that looks complete.
 *
 * ## Editorial calmo (ADR-180)
 *
 * The field is the page: one line to write in, with its verb at the end of it.
 * The page's name is still its `<h1>`, and is not drawn — the field says it. The
 * two filters are one closed line that states what it holds when it holds
 * something. Results are rows under the kind they belong to, the row is the
 * link, and the words that matched are marked. Before a search there is nothing
 * but the field and one caption saying what it covers.
 */

import { useId, useState, useTransition } from "react";

import { PageHeader } from "@/components/ui";
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
import { groupResults, rowSnippet, splitMatches } from "./presentation";

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
  // What the closed filter line holds, in words — so a filter that is narrowing
  // the next search is never invisible.
  const activeFilters = [domain ? text.domains[domain] : null, period ? text.periods[period] : null].filter(
    (value): value is string => value !== null,
  );
  const matched = response?.query ?? "";

  return (
    <section className="search-surface">
      <PageHeader className="search-header" size="compact" title={text.title} />

      <form className="search-form" onSubmit={submit} role="search">
        <label className="sr-only" htmlFor={inputId}>
          {text.inputLabel}
        </label>
        <div className="search-field">
          <input
            id={inputId}
            className="search-input"
            type="search"
            value={query}
            placeholder={text.placeholder}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
          />
          <button type="submit" className="search-submit">
            {text.submit}
          </button>
        </div>

        <details className="search-filters-disclosure">
          <summary className="search-filters-summary">
            <span>{text.filters}</span>
            {activeFilters.length > 0 ? (
              <span className="search-filters-active">{activeFilters.join(" · ")}</span>
            ) : null}
          </summary>
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
          </div>
        </details>
      </form>

      {pending ? <UniversalSkeleton rows={5} label={text.searching} /> : null}

      {/* Before a search: the field, and one caption saying what it covers. */}
      {!pending && response === null ? <p className="search-hint">{text.idleHint}</p> : null}

      {!pending && response !== null ? (
        <>
          <p
            className={response.results.length === 0 ? "sr-only" : "search-count"}
            role="status"
            aria-live="polite"
          >
            {text.resultCount(response.results.length)}
          </p>

          {failed.length > 0 ? (
            <p className="search-partial tone-attention" role="status">
              {text.partial(failed.map((outcome) => text.domains[outcome.domain]).join(", "))}
            </p>
          ) : null}

          {response.results.length === 0 ? (
            <UniversalStateView
              className="ux-state-quiet"
              state="empty"
              locale={locale}
              title={text.noResults}
              description={text.noResultsHint}
            />
          ) : (
            <>
              {groupResults(response.results).map((group) => (
                <section
                  aria-labelledby={`${inputId}-${group.domain}`}
                  className="search-group"
                  key={group.domain}
                >
                  <h2 className="search-group-title" id={`${inputId}-${group.domain}`}>
                    <span>{text.domainGroups[group.domain]}</span>
                    <small>{group.results.length}</small>
                  </h2>
                  <ul className="search-results">
                    {group.results.map((result) => {
                      const snippet = rowSnippet(result);
                      const date = result.occurredAt ? formatDate(result.occurredAt, locale, timeZone) : "";
                      return (
                        <li className="search-result" key={`${result.domain}:${result.id}`}>
                          {/* A real anchor, so a result survives a middle-click,
                              the back button and a screen reader's link list. */}
                          <a className="search-row" href={result.href}>
                            <span className="search-row-title">
                              <Marked query={matched} text={result.title} />
                            </span>
                            {snippet || date ? (
                              <span className="search-row-caption">
                                {date ? <span className="search-row-date">{date}</span> : null}
                                {snippet ? (
                                  <span className="search-row-snippet">
                                    <Marked query={matched} text={snippet} />
                                  </span>
                                ) : null}
                              </span>
                            ) : null}
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
              {response.totalBounded ? <p className="search-bounded">{text.bounded}</p> : null}
            </>
          )}
        </>
      ) : null}
    </section>
  );
}

/** A title or a snippet with the matched words marked. Text nodes only. */
function Marked({ text, query }: { text: string; query: string }) {
  return (
    <>
      {splitMatches(text, query).map((segment, index) =>
        segment.match ? <mark key={index}>{segment.text}</mark> : <span key={index}>{segment.text}</span>,
      )}
    </>
  );
}

function formatDate(iso: string, locale: Locale, timeZone: string): string {
  return formatInstant(iso, "day", locale, timeZone) ?? "";
}
