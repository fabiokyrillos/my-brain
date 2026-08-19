/**
 * The two tabs and the focus control (`2P-RELATION-001`, `-002`, `-003`).
 *
 * ## Links, not `role="tab"`
 *
 * The ARIA tabs pattern owes its users arrow-key navigation, `aria-controls`,
 * roving tabindex and a JavaScript keyboard handler. It buys nothing here: each
 * view is a **different server render at a different address**, which is what
 * `2P-RELATION-002` wants when it asks the text to be independently usable, and
 * what `2N-ACCESS-004` wants when it refuses a gesture as the only path.
 *
 * Two links in a labelled navigation give the same job to the browser: Tab
 * reaches them, Enter follows them, back and forward work, each is bookmarkable,
 * and — the part a client-side tab cannot claim — the text tab still resolves
 * with JavaScript off. `aria-current="page"` announces which one the reader is
 * standing in.
 *
 * ## Focus is a GET form
 *
 * Same reasoning: a `<select>` plus a submit button produces a URL, so a focused
 * view can be linked to, returned to and left with the back button. `view`
 * travels as a hidden field, so focusing does not silently move a reader from
 * the drawing to the list or back.
 *
 * Neither control writes anything.
 */

import Link from "next/link";

import type { Locale } from "@/lib/preferences";

import type { RelationNode } from "./contracts";
import { getRelationsCopy } from "./copy";
import { relationViewHref, RELATION_VIEWS, type RelationView } from "./view";

export function RelationViewTabs({
  focusId,
  locale,
  view,
}: {
  readonly focusId: string | null;
  readonly locale: Locale;
  readonly view: RelationView;
}) {
  const copy = getRelationsCopy(locale);
  const label = { diagram: copy.diagramTab, links: copy.linksTab } as const;

  return (
    <nav aria-label={copy.tabsLabel} className="relations-tabs">
      <ul>
        {RELATION_VIEWS.map((candidate) => (
          <li key={candidate}>
            <Link
              aria-current={candidate === view ? "page" : undefined}
              data-relation-view={candidate}
              data-relation-view-current={candidate === view ? "true" : undefined}
              href={relationViewHref(locale, candidate, focusId)}
            >
              {label[candidate]}
            </Link>
          </li>
        ))}
      </ul>
      {/*
        Said on both tabs, and it is the sentence that stops the drawing reading
        as the record. `2N-RELATION-007` already makes the list carry everything
        the picture does and more; a reader standing in front of a figure has no
        way to know that unless somebody says it.
      */}
      <p className="relations-tabs-note">{copy.listAlwaysComplete}</p>
    </nav>
  );
}

export function RelationFocusControl({
  focusId,
  locale,
  options,
  view,
}: {
  readonly focusId: string | null;
  readonly locale: Locale;
  /** People the projection already contains — never a fresh read of `people`. */
  readonly options: readonly RelationNode[];
  readonly view: RelationView;
}) {
  const copy = getRelationsCopy(locale);
  const focused = options.find((node) => node.id === focusId) ?? null;

  if (options.length === 0) {
    // A selector with nothing to choose is the dead end `EG-04` named. The
    // sentence says which of the two facts this is.
    return <p className="relations-focus-empty">{copy.focusEmpty}</p>;
  }

  return (
    <form action={`/${locale}/app/relations`} className="relations-focus" method="get">
      <input name="view" type="hidden" value={view} />
      <label htmlFor="relations-focus">
        {copy.focusLabel}
        {/* Keyed on its own default for the reason every select in this
            repository records: React applies `defaultValue` to a select only on
            mount, so a value arriving from the URL needs a remount to show as
            selected. */}
        <select
          defaultValue={focusId ?? ""}
          id="relations-focus"
          key={`focus-${focusId ?? ""}`}
          name="focus"
        >
          <option value="">{copy.focusAll}</option>
          {options.map((node) => (
            /* The name is a structural identifier the reader needs to recognise
               the person (ADR-110 Decision 2), which is why it renders here and
               why nothing else about them does. */
            <option key={node.id} value={node.id}>{node.label}</option>
          ))}
        </select>
      </label>
      <button type="submit">{copy.focusApply}</button>
      {focused ? (
        <p className="relations-focus-state" data-relation-focused="true">
          {copy.focusedOn(focused.label)}{" "}
          <Link href={relationViewHref(locale, view, null)}>{copy.focusClear}</Link>
        </p>
      ) : null}
    </form>
  );
}
