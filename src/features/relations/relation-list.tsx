/**
 * `2N-RELATION-007`, `2N-ACCESS-004` — the **canonical** presentation.
 *
 * ## Why this is first, in the DOM and on the page
 *
 * `2N-RELATION-007` requires the text equivalent to carry the same information as
 * the drawing and not be a degraded version of it. The most reliable way to make
 * that true is not to check it: it is to build the list first, render it first,
 * and give the drawing a **strict subset** of what the list holds. A reader who
 * never sees the figure — on a phone, with a screen reader, with images off, or
 * simply because lists are easier — loses nothing.
 *
 * So the list carries **more**: every edge the projection produced, including the
 * ones the drawing may not show, each with the origin the product can actually
 * substantiate. `2N-RELATION-006` forbids the *drawing* from carrying an
 * unconfirmed inferred relation; nothing forbids the list from carrying it, and
 * hiding it would be the surface deciding the owner should not know about their
 * own data.
 *
 * ## Every row is a real link, and no information lives in an attribute
 *
 * Nodes are `<a>` elements with visible labels. There is no `title`, no tooltip
 * and no hover state that reveals anything — `2N-MOBILE-002` and `2N-ACCESS-004`
 * both refuse a gesture as the only path, and a native tooltip is unreachable by
 * keyboard and invisible to touch.
 *
 * `data-*` attributes carry the **kind** and the **origin arm**, which are
 * closed vocabularies, never content. The one governed string on this surface —
 * a relationship's own sentence — goes through `ProtectedContent` and never
 * into an `aria-label`, for the reason `provenance-note.tsx` records: an
 * accessible name carrying withheld text hands it straight to assistive
 * technology.
 */

import Link from "next/link";

import { BoundedNotice } from "@/features/bounds/bounded-notice";
import { describeRelationshipType } from "@/features/entities/relationship-vocabulary";
import { ProtectedContent } from "@/features/operations/protected-content";
import { getProvenanceCopy } from "@/features/provenance/copy";
import { SectionOriginNote } from "@/features/provenance/provenance-note";
import { deriveFreeTextSensitivity } from "@/features/sensitivity/subject-derivation";
import type { Locale } from "@/lib/preferences";
import { formatInstant } from "@/lib/time/instant-format";

import { getRelationsCopy } from "./copy";
import type { RelationEdge, RelationNode } from "./contracts";
import {
  drawableEdges,
  nodesById,
  unattributableEdges,
  type RelationProjection,
} from "./projection";

/**
 * The three relation tables, keyed by edge kind and **typed** by
 * `OwnerAuthoredTable`.
 *
 * It exists to keep the compiler in the loop: adding an entry here for a kind
 * whose table is not owner-authored by construction does not compile. It is
 * deliberately **partial** — `person_organization` and `project_organization`
 * come from a column on `people`/`projects`, and those tables have a non-owner
 * writer (the interpretation RPC creates the rows), so naming them here would be
 * a false claim at the table level even though the column itself has none.
 */
const RELATION_TABLE_OF = {
  person_owner: "person_relationships",
  person_project: "person_projects",
  person_context: "person_contexts",
} as const satisfies Partial<Record<RelationEdge["kind"], "person_relationships" | "person_projects" | "person_contexts">>;

export type RelationListProps = {
  readonly locale: Locale;
  readonly projection: RelationProjection;
  readonly timeZone: string;
};

export function RelationList({ locale, projection, timeZone }: RelationListProps) {
  const copy = getRelationsCopy(locale);
  const byId = nodesById(projection);
  const drawn = drawableEdges(projection);
  const undrawn = unattributableEdges(projection);

  if (projection.edges.items.length === 0) {
    return (
      <section aria-labelledby="relations-list-heading" className="relations-section">
        <h2 id="relations-list-heading">{copy.listHeading}</h2>
        <p className="quiet-state" data-relations-empty="true">
          <strong>{copy.emptyHeading}</strong> {copy.emptyBody}
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="relations-list-heading" className="relations-section">
      <h2 id="relations-list-heading">{copy.listHeading}</h2>
      <p className="relations-intro">{copy.listIntro}</p>
      {/*
        `2N-PERSON-004`: persisted. Every row here is a row in a table the owner
        can correct or end from the person or project page — nothing on this
        surface is computed from content.
      */}
      <SectionOriginNote locale={locale} origin="persisted" />
      <BoundedNotice list={projection.edges} locale={locale} />

      {drawn.length ? (
        <ul className="relations-rows" data-relation-group="drawn">
          {drawn.map((edge) => (
            <RelationRow
              byId={byId}
              edge={edge}
              key={edge.key}
              locale={locale}
              timeZone={timeZone}
            />
          ))}
        </ul>
      ) : null}

      {undrawn.length ? (
        <section aria-labelledby="relations-undrawn-heading" className="relations-subsection">
          <h3 id="relations-undrawn-heading">{copy.notDrawnHeading}</h3>
          <p className="relations-intro" data-relations-undrawn-explainer="true">
            {copy.notDrawnExplainer}
          </p>
          <ul className="relations-rows" data-relation-group="undrawn">
            {undrawn.map((edge) => (
              <RelationRow
                byId={byId}
                edge={edge}
                key={edge.key}
                locale={locale}
                timeZone={timeZone}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}

/** A node as a link, or as plain text where the node is not a row. */
function NodeLabel({ copy, node }: { copy: ReturnType<typeof getRelationsCopy>; node: RelationNode }) {
  if (!node.href) {
    return (
      <span className="relations-node-label" data-node-type={node.type}>
        {node.label}
      </span>
    );
  }
  return (
    <Link
      aria-label={copy.openNode(node.label, copy.nodeType(node.type))}
      className="relations-node-label relations-node-link"
      data-node-type={node.type}
      href={node.href}
    >
      {node.label}
    </Link>
  );
}

export function RelationRow({
  byId,
  edge,
  locale,
  timeZone,
}: {
  readonly byId: ReadonlyMap<string, RelationNode>;
  readonly edge: RelationEdge;
  readonly locale: Locale;
  readonly timeZone: string;
}) {
  const copy = getRelationsCopy(locale);
  const from = byId.get(edge.from);
  const to = byId.get(edge.to);
  // A row missing an endpoint cannot be rendered truthfully, and rendering it
  // half-way would put a dangling relation on the page. It cannot happen for a
  // projection's own edges; it is handled rather than asserted, because a throw
  // here is a blank page for every other row.
  if (!from || !to) return null;

  const known = edge.kind === "person_owner" ? describeRelationshipType(locale, edge.storedType) : null;
  const relationLabel =
    edge.kind === "person_owner" ? (known ?? edge.storedType ?? copy.unknownRelationship) : copy.edgeKind(edge.kind);
  const since = formatInstant(edge.since, "day", locale, timeZone);

  return (
    <li className="relations-row" data-edge-kind={edge.kind} data-origin={edge.origin.kind}>
      <p className="relations-row-main">
        <NodeLabel copy={copy} node={from} />
        <span className="relations-row-relation">{relationLabel}</span>
        <NodeLabel copy={copy} node={to} />
      </p>

      <p className="relations-row-meta">
        {/*
          The owner node gets no type chip: its label already *is* the word, and
          two "Você" in one row is a duplicate that reads as an error and gives a
          screen reader the same string twice for one thing.
        */}
        {from.type === "owner" ? null : (
          <span className="relations-chip" data-node-type={from.type}>
            {copy.nodeType(from.type)}
          </span>
        )}
        {to.type === "owner" ? null : (
          <span className="relations-chip" data-node-type={to.type}>
            {copy.nodeType(to.type)}
          </span>
        )}
        {edge.kind === "person_owner" && known === null && edge.storedType ? (
          <span className="relations-chip relations-chip-neutral" data-unknown-relationship="true">
            {copy.unknownRelationship}
          </span>
        ) : null}
        {edge.role ? (
          <span className="relations-chip" data-relation-role="true">
            {copy.roleLabel}: {edge.role}
          </span>
        ) : null}
        {since ? (
          <span className="relations-chip" data-relation-since="true">
            {copy.sinceLabel} {since}
          </span>
        ) : null}
      </p>

      <RelationOriginNote edge={edge} locale={locale} />

      {edge.description ? (
        <p className="relations-row-note">
          <span className="relations-note-label">{copy.descriptionLabel}</span>
          {/*
            The one governed string on this surface. Free text about a human
            being with no classification and no classifiable source — ADR-110
            Decision 4's predicate — so it takes Decision 4's posture, resolved
            for `graph` and revealed only by an explicit, local act.
          */}
          <ProtectedContent
            locale={locale}
            revealKey={`relation-note-${edge.key}`}
            sensitivity={deriveFreeTextSensitivity()}
            surface="graph"
          >
            {edge.description}
          </ProtectedContent>
        </p>
      ) : null}
    </li>
  );
}

/**
 * `2N-RELATION-002`/`-008`/`-009` — where one edge came from.
 *
 * The owner-authored sentence is taken from `provenance/copy.ts` rather than
 * restated, so this surface and the person page cannot drift into two different
 * words for one claim. `RELATION_TABLE_OF` keeps the compiler in the loop for
 * the three tables where owner-authorship is a table-level fact; the two
 * organization kinds are owner-authored at the **column** level and say so
 * without naming a table they could not honestly claim.
 */
export function RelationOriginNote({ edge, locale }: { readonly edge: RelationEdge; readonly locale: Locale }) {
  const copy = getRelationsCopy(locale);
  const provenance = getProvenanceCopy(locale);
  const attributed = edge.origin.kind === "owner-authored";
  const table = RELATION_TABLE_OF[edge.kind as keyof typeof RELATION_TABLE_OF] ?? null;

  return (
    <p
      className="provenance-note relations-origin"
      data-provenance={attributed ? "owner-authored" : "unattributable"}
      data-relation-table={table ?? undefined}
    >
      <span className="provenance-label">{copy.originLabel}</span>
      <span>{attributed ? provenance.ownerAuthored : copy.unattributableOrigin}</span>
    </p>
  );
}
