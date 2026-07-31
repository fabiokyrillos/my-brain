import Link from "next/link";
import type { Locale } from "@/lib/preferences";
import type { HistoryCopy } from "./copy";
import { hasActiveFilters, type HistoryFilters } from "./filters";
import {
  HISTORY_ACTORS,
  HISTORY_CATEGORIES,
  HISTORY_ENTITY_TYPES,
} from "./vocabulary";

/**
 * The filter controls, as a plain GET form (UX-13).
 *
 * ## Why a GET form and not client state
 *
 * Submitting navigates to the same route with the filters in the query string,
 * which is exactly the state the server component already reads. That buys
 * several things at once and costs no JavaScript: the filtered view is
 * bookmarkable and reloadable, the browser's back button steps through filter
 * changes, pagination and filters cannot disagree because both come from the
 * URL, and the whole thing keeps working before hydration.
 *
 * `page` is deliberately not a field. Applying a filter returns to page 1,
 * because carrying page 4 into a newly narrowed list is how a reader lands on
 * an empty page and concludes they have no history.
 *
 * ## Mobile
 *
 * The controls sit inside `<details>`, which is a disclosure with keyboard and
 * screen-reader behaviour already correct and no script. CSS opens it and drops
 * the marker from the tablet breakpoint up, so a wide viewport sees the row of
 * controls directly and a narrow one sees a "Filtros" button — rather than five
 * controls squeezed into a horizontal toolbar. The active-filter summary lives
 * *outside* the disclosure, so it stays visible while the controls are folded.
 */
export function HistoryFilterControls({
  locale,
  copy,
  filters,
}: {
  locale: Locale;
  copy: HistoryCopy;
  filters: HistoryFilters;
}) {
  const active = hasActiveFilters(filters);

  return (
    <section className="history-filters" aria-label={copy.filters.legend}>
      <details className="history-filters-disclosure" open={active}>
        <summary className="history-filters-summary">{copy.filters.toggle}</summary>

        <form className="history-filters-form" method="get" action={`/${locale}/app/history`}>
          {/*
            Carried through untouched: filtering by one specific object is set by
            arriving from that object, not by a control here, and a submit that
            silently widened the view back to everything would be a surprise.
          */}
          {filters.subjectId !== null ? (
            <input type="hidden" name="subject" value={filters.subjectId} />
          ) : null}

          <div className="history-filter-field">
            <label htmlFor="history-from">{copy.filters.from}</label>
            <input id="history-from" name="from" type="date" defaultValue={filters.from ?? ""} />
          </div>

          <div className="history-filter-field">
            <label htmlFor="history-to">{copy.filters.to}</label>
            <input id="history-to" name="to" type="date" defaultValue={filters.to ?? ""} />
          </div>

          <div className="history-filter-field">
            <label htmlFor="history-actor">{copy.filters.actor}</label>
            <select id="history-actor" name="actor" defaultValue={filters.actor ?? ""}>
              <option value="">{copy.filters.anyActor}</option>
              {HISTORY_ACTORS.map((actor) => (
                <option key={actor} value={actor}>
                  {copy.actors[actor]}
                </option>
              ))}
            </select>
          </div>

          <div className="history-filter-field">
            <label htmlFor="history-entity">{copy.filters.entityType}</label>
            <select id="history-entity" name="entity" defaultValue={filters.entityType ?? ""}>
              <option value="">{copy.filters.anyEntityType}</option>
              {HISTORY_ENTITY_TYPES.map((entityType) => (
                <option key={entityType} value={entityType}>
                  {copy.entityTypes[entityType]}
                </option>
              ))}
            </select>
          </div>

          <div className="history-filter-field">
            <label htmlFor="history-category">{copy.filters.category}</label>
            <select id="history-category" name="category" defaultValue={filters.category ?? ""}>
              <option value="">{copy.filters.anyCategory}</option>
              {HISTORY_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {copy.categories[category]}
                </option>
              ))}
            </select>
          </div>

          <div className="history-filter-actions">
            <button className="button-primary" type="submit">
              {copy.filters.apply}
            </button>
            {active ? (
              <Link className="button-secondary" href={`/${locale}/app/history`}>
                {copy.filters.clear}
              </Link>
            ) : null}
          </div>
        </form>
      </details>

      {active ? <ActiveFilterSummary copy={copy} filters={filters} /> : null}

      {filters.ignoredKeys.length ? (
        <p className="history-filters-note" role="status">
          {copy.filters.ignored}
        </p>
      ) : null}
    </section>
  );
}

/**
 * What is currently narrowing the list, in words.
 *
 * Outside the disclosure on purpose: on a phone the controls are folded away,
 * and a filtered list that does not say it is filtered is indistinguishable
 * from a list that is simply short.
 */
function ActiveFilterSummary({
  copy,
  filters,
}: {
  copy: HistoryCopy;
  filters: HistoryFilters;
}) {
  const chips: string[] = [];
  if (filters.from !== null) chips.push(`${copy.filters.from}: ${filters.from}`);
  if (filters.to !== null) chips.push(`${copy.filters.to}: ${filters.to}`);
  if (filters.actor !== null) chips.push(`${copy.filters.actor}: ${copy.actors[filters.actor]}`);
  if (filters.entityType !== null) {
    chips.push(`${copy.filters.entityType}: ${copy.entityTypes[filters.entityType]}`);
  }
  if (filters.category !== null) {
    chips.push(`${copy.filters.category}: ${copy.categories[filters.category]}`);
  }
  // The id itself is not shown: it is a uuid, it means nothing to a reader, and
  // the list beneath already names the object on every row.
  if (filters.subjectId !== null) chips.push(copy.filters.subjectFilter);

  return (
    <ul className="history-active-filters" aria-label={copy.filters.activeLegend}>
      {chips.map((chip) => (
        <li key={chip}>{chip}</li>
      ))}
    </ul>
  );
}
