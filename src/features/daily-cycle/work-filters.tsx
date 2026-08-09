import Link from "next/link";

/**
 * `2L-VIEW-004`/`-005`/`-006`/`-007` — the narrowing controls, as links.
 *
 * ## Why links and not a form
 *
 * `2L-VIEW-007` says the complete description of what a user is looking at is
 * in the URL and nowhere else. A `<Link>` **is** that URL: it can be copied,
 * shared, bookmarked and gone back to, and there is no state the control could
 * hold that the address bar does not. A `<select>` with an `onChange` that
 * pushes a route would produce the same URLs and would also produce a moment
 * where the two disagree.
 *
 * It also means these controls work with JavaScript unavailable, which the Work
 * list itself gave up in Phase 2F for a stated reason (outcome rendering). No
 * such reason applies to narrowing a list.
 *
 * ## Why every link carries the whole query
 *
 * `2L-VIEW-004`/`-009` require the parts to compose: changing the ordering must
 * not drop the filter, and changing the filter must not strand the user on page
 * seven of a set that now has two pages. Each link is built from the **current**
 * query with one field replaced, and changing a filter resets the page to 1 —
 * the position it names is the only one guaranteed to exist.
 */

import type { Locale } from "@/lib/preferences";

import { getWorkFiltersCopy } from "./work-filters-copy";
import {
  WORK_DUE_FILTERS,
  WORK_GROUPINGS,
  WORK_ORDERS,
  WORK_ORIGINS,
  WORK_PRIORITIES,
  WORK_STATES,
  workHref,
  type WorkQuery,
} from "./work-query";

/**
 * One vocabulary, as a labelled group of links.
 *
 * Generic over the vocabulary rather than over a union of them, because the
 * alternative — one array holding six differently-typed groups — can only be
 * expressed by widening the element type to something that no longer checks
 * that `labelFor` and `apply` agree about which vocabulary they are handling.
 * That is precisely the mistake this surface must not make.
 */
function FilterGroup<T extends string>({
  apply,
  current,
  label,
  labelFor,
  locale,
  values,
}: {
  apply: (value: T) => WorkQuery;
  current: T;
  label: string;
  labelFor: (value: T) => string;
  locale: Locale;
  values: readonly T[];
}) {
  return (
    <fieldset className="work-filter-group">
      <legend>{label}</legend>
      {values.map((value) => (
        <Link
          // `aria-current="page"` rather than a class: which value is active is
          // information, not decoration, and a screen-reader user needs it.
          aria-current={value === current ? "page" : undefined}
          href={workHref(locale, apply(value))}
          key={value}
        >
          {labelFor(value)}
        </Link>
      ))}
    </fieldset>
  );
}

export function WorkFilters({ locale, query }: { locale: Locale; query: WorkQuery }) {
  const copy = getWorkFiltersCopy(locale);

  /**
   * Changing any narrowing resets the page.
   *
   * Page 7 of an unfiltered view is very rarely page 7 of a filtered one, and
   * landing on an empty page the user did not ask for is the "back went
   * somewhere else" failure in a different costume.
   */
  const narrow = (next: Partial<WorkQuery>): WorkQuery => ({ ...query, ...next, page: 1 });



  return (
    <div className="work-filters">
      <FilterGroup
        apply={(value) => narrow({ state: value })}
        current={query.state}
        label={copy.groups.state}
        labelFor={(value) => copy.state[value]}
        locale={locale}
        values={WORK_STATES}
      />
      <FilterGroup
        apply={(value) => narrow({ due: value })}
        current={query.due}
        label={copy.groups.due}
        labelFor={(value) => copy.due[value]}
        locale={locale}
        values={WORK_DUE_FILTERS}
      />
      <FilterGroup
        apply={(value) => narrow({ priority: value })}
        current={query.priority}
        label={copy.groups.priority}
        labelFor={(value) => copy.priority[value]}
        locale={locale}
        values={WORK_PRIORITIES}
      />
      <FilterGroup
        apply={(value) => narrow({ origin: value })}
        current={query.origin}
        label={copy.groups.origin}
        labelFor={(value) => copy.origin[value]}
        locale={locale}
        values={WORK_ORIGINS}
      />
      {/* Ordering does not change which rows are in the set, so it keeps the page. */}
      <FilterGroup
        apply={(value) => ({ ...query, order: value })}
        current={query.order}
        label={copy.groups.order}
        labelFor={(value) => copy.order[value]}
        locale={locale}
        values={WORK_ORDERS}
      />
      <FilterGroup
        apply={(value) => ({ ...query, group: value })}
        current={query.group}
        label={copy.groups.group}
        labelFor={(value) => copy.group[value]}
        locale={locale}
        values={WORK_GROUPINGS}
      />
      {query.projectId || query.contextId ? (
        // A relation filter has no vocabulary to render as chips — its values
        // are the caller's own entities. What it gets is a way out, which is
        // the part a user actually needs when they arrived by a link.
        <p className="work-filter-relation">
          {copy.relationActive}{" "}
          <Link href={workHref(locale, narrow({ projectId: null, contextId: null }))}>
            {copy.clearRelation}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
