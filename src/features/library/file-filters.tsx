import Link from "next/link";

import type { Locale } from "@/lib/preferences";
import { attachmentStatusLabel, getVocabularyCopy } from "@/features/vocabulary/copy";

import { getFileLibraryCopy } from "./copy";
import {
  FILE_KIND_FILTERS,
  FILE_STATE_FILTERS,
  PERIOD_FILTERS,
  filesHref,
  hasActiveFileFilter,
  isActiveFilter,
  type FileFilters,
  type LinkedFilter,
} from "./filters";

/**
 * `2N-FILES-010`, `2N-ACCESS` — the filter controls.
 *
 * ## Links, not a form, and the reason is not simplicity
 *
 * Every control here is an anchor that navigates. That makes the whole feature
 * keyboard-operable without a single handler, gives every filter a shareable and
 * bookmarkable URL, survives a back navigation, and — the property that actually
 * decided it — keeps the filtering **in the query**. A client-side control would
 * have had a filtered set in the browser and an unfiltered one on the server,
 * and the first of those is the page of fifty rows the measurement refused.
 *
 * `aria-current` and the active class are set from **one** predicate
 * (`isActiveFilter`), so what a screen reader announces and what a sighted user
 * sees can never disagree about which filter is on.
 *
 * ## The axis that only exists when it means something
 *
 * The linked-subject axis renders **only when the owner actually has links**.
 * `entity_attachments` has no writer, so for almost every owner the option list
 * is empty — and a filter offering no options, or offering an option that
 * matches nothing, is a control that looks like a capability and is not. Absent
 * is the honest rendering; a disabled chip promising a future would not be.
 */

export type LinkedFilterOption = LinkedFilter & { readonly label: string };

function FilterChip({
  active,
  href,
  label,
}: {
  active: boolean;
  href: string;
  label: string;
}) {
  return (
    <Link
      aria-current={active ? "true" : undefined}
      className={active ? "filter-chip filter-chip-active" : "filter-chip"}
      href={href}
    >
      {label}
    </Link>
  );
}

export function FileFilterBar({
  filters,
  linkedOptions,
  locale,
}: {
  filters: FileFilters;
  linkedOptions: readonly LinkedFilterOption[];
  locale: Locale;
}) {
  const copy = getFileLibraryCopy(locale);
  const vocabulary = getVocabularyCopy(locale);
  return (
    <section aria-labelledby="file-filters-title" className="file-filters">
      <h2 className="sr-only" id="file-filters-title">
        {copy.filtersLabel}
      </h2>

      <div className="filter-axis" role="group" aria-label={copy.filterState}>
        <span className="filter-axis-label">{copy.filterState}</span>
        <FilterChip
          active={isActiveFilter(filters, "state", null)}
          href={filesHref(locale, filters, { state: null })}
          label={copy.filterAll}
        />
        {FILE_STATE_FILTERS.map((state) => (
          <FilterChip
            active={isActiveFilter(filters, "state", state)}
            href={filesHref(locale, filters, { state })}
            key={state}
            label={attachmentStatusLabel(locale, state) ?? vocabulary.unknownState}
          />
        ))}
      </div>

      <div className="filter-axis" role="group" aria-label={copy.filterKind}>
        <span className="filter-axis-label">{copy.filterKind}</span>
        <FilterChip
          active={isActiveFilter(filters, "kind", null)}
          href={filesHref(locale, filters, { kind: null })}
          label={copy.filterAll}
        />
        {FILE_KIND_FILTERS.map((kind) => (
          <FilterChip
            active={isActiveFilter(filters, "kind", kind)}
            href={filesHref(locale, filters, { kind })}
            key={kind}
            label={copy.kinds[kind]}
          />
        ))}
      </div>

      <div className="filter-axis" role="group" aria-label={copy.filterPeriod}>
        <span className="filter-axis-label">{copy.filterPeriod}</span>
        <FilterChip
          active={isActiveFilter(filters, "period", null)}
          href={filesHref(locale, filters, { period: null })}
          label={copy.filterAll}
        />
        {PERIOD_FILTERS.map((period) => (
          <FilterChip
            active={isActiveFilter(filters, "period", period)}
            href={filesHref(locale, filters, { period })}
            key={period}
            label={copy.periods[period]}
          />
        ))}
      </div>

      {linkedOptions.length > 0 && (
        <div className="filter-axis" role="group" aria-label={copy.filterLinked}>
          <span className="filter-axis-label">{copy.filterLinked}</span>
          <FilterChip
            active={isActiveFilter(filters, "linked", null)}
            href={filesHref(locale, filters, { linked: null })}
            label={copy.filterAll}
          />
          {linkedOptions.map((option) => (
            <FilterChip
              active={isActiveFilter(filters, "linked", {
                entityType: option.entityType,
                entityId: option.entityId,
              })}
              href={filesHref(locale, filters, {
                linked: { entityType: option.entityType, entityId: option.entityId },
              })}
              key={`${option.entityType}-${option.entityId}`}
              label={option.label}
            />
          ))}
        </div>
      )}

      {hasActiveFileFilter(filters) && (
        <p className="filter-summary" data-filtered="true" role="note">
          {copy.filteredNotice}{" "}
          <Link className="filter-clear" href={filesHref(locale, filters, {
            state: null,
            kind: null,
            period: null,
            linked: null,
          })}>
            {copy.filterClear}
          </Link>
        </p>
      )}
    </section>
  );
}
