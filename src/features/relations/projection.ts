/**
 * `2N-RELATION-002`, `-006`, `-007`, `-008`, `-010` — the **one** derivation both
 * presentations read.
 *
 * ## Why there is one projection and not two queries
 *
 * `2N-RELATION-007` requires the text equivalent to carry the same information
 * as the drawing and not be a degraded version of it. A convergence maintained by
 * two components each assembling their own view of the same tables is a
 * convergence one refactor away from ending, and the failure would be silent: the
 * drawing and the list would simply start disagreeing, and only a reader looking
 * at both would ever know.
 *
 * So both presentations receive one `RelationProjection` value. The list renders
 * all of it; the drawing renders the subset `isDrawable` admits. **Neither can
 * report a different bound**, because there is one `Bounded<RelationEdge>` and
 * they both read it — a type-level property rather than a convention.
 *
 * ## No I/O, and therefore no scope this could widen
 *
 * Pure, like `subject-derivation.ts` and `provenance/contracts.ts`. It holds no
 * client, takes no `user_id`, and cannot reach the database. Ownership comes
 * exclusively from the owner-scoped queries in `data.ts` under forced RLS, and
 * nothing here is load-bearing for isolation.
 *
 * ## Removed, foreign and unreadable are one arm, by construction
 *
 * The caller passes the entity rows it **actually read**, from owner-scoped
 * queries bounded to the ids the link tables produced. An endpoint that was
 * deleted, an endpoint belonging to somebody else and an endpoint the read failed
 * to return are all **absent from those maps** — the same input, so necessarily
 * the same output: the edge does not exist. There is no branch that could tell
 * them apart, which is how `2N-PRIVACY-005` is satisfied rather than promised.
 *
 * A dropped endpoint still moves the **bound**, through `boundedList`'s
 * `upstreamBounded` argument, so a surface that lost six of a hundred and one
 * links says *there are more* instead of looking complete. That sentence is
 * identical whichever of the three reasons applied, so it is not an oracle.
 */

import { boundedList, type Bounded } from "@/features/bounds/contracts";
import type { Locale } from "@/lib/preferences";

import {
  dedupeEdges,
  isDrawable,
  relationEdgeKey,
  relationNodeHref,
  OWNER_NODE_ID,
  type RelationEdge,
  type RelationNode,
  type RelationOrigin,
} from "./contracts";

/** `person_relationships`, as the loader selects it. Never `confidence`. */
export type RelationshipSourceRow = {
  readonly person_id: string | null;
  readonly relationship_type: string | null;
  readonly description: string | null;
  readonly valid_from: string | null;
};

/** `person_projects`, as the loader selects it. Never `confidence`. */
export type PersonProjectSourceRow = {
  readonly id: string | null;
  readonly person_id: string | null;
  readonly project_id: string | null;
  readonly role: string | null;
  readonly valid_from: string | null;
};

/** `person_contexts`, as the loader selects it. Never `confidence`. */
export type PersonContextSourceRow = {
  readonly id: string | null;
  readonly person_id: string | null;
  readonly context_id: string | null;
  readonly valid_from: string | null;
};

export type PersonSourceRow = {
  readonly id: string | null;
  readonly name: string | null;
  readonly organization_id: string | null;
};

export type ProjectSourceRow = {
  readonly id: string | null;
  readonly name: string | null;
  readonly organization_id: string | null;
};

export type NamedSourceRow = { readonly id: string | null; readonly name: string | null };

export type RelationSource = {
  readonly relationships: readonly RelationshipSourceRow[];
  readonly personProjects: readonly PersonProjectSourceRow[];
  readonly personContexts: readonly PersonContextSourceRow[];
  /**
   * The association row ids the owner's **creation** actions audited.
   *
   * Narrow on purpose: `update_person_project_role` and `end_person_*` write
   * rows with the same `entity_type` and `entity_id`, and treating either as
   * proof of *authorship* would be inference — editing a role on a link the
   * trigger created is not the same as having created it.
   */
  readonly auditedAssociationIds: ReadonlySet<string>;
  readonly people: readonly PersonSourceRow[];
  readonly projects: readonly ProjectSourceRow[];
  readonly contexts: readonly NamedSourceRow[];
  readonly organizations: readonly NamedSourceRow[];
  /** True when any source list hit its own limit. */
  readonly sourceBounded: boolean;
  readonly limit: number;
  readonly locale: Locale;
  /** What the owner's own node is called. From the copy module, never a name. */
  readonly ownerLabel: string;
};

export type RelationProjection = {
  /** Every node at least one edge touches, drawn or not. */
  readonly nodes: readonly RelationNode[];
  /** The one bound both presentations report. */
  readonly edges: Bounded<RelationEdge>;
};

const STRUCTURAL: RelationOrigin = { kind: "owner-authored", basis: "structural" };
const AUDITED: RelationOrigin = { kind: "owner-authored", basis: "audited" };
const UNATTRIBUTABLE: RelationOrigin = { kind: "unattributable" };

/** A usable id, or `null`. An empty string is absence, never a lookup. */
function id(value: string | null | undefined): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function labelledRows(rows: readonly NamedSourceRow[]): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    const key = id(row.id);
    // A row whose name did not come back is absent, and therefore takes the same
    // arm as a row that was removed: there is nothing to render it as.
    if (key && id(row.name)) map.set(key, row.name as string);
  }
  return map;
}

export function projectRelations(source: RelationSource): RelationProjection {
  const people = labelledRows(source.people);
  const projects = labelledRows(source.projects);
  const contexts = labelledRows(source.contexts);
  const organizations = labelledRows(source.organizations);

  const edges: RelationEdge[] = [];
  /** Links whose endpoints did not both resolve, which still move the bound. */
  let dropped = 0;

  // ---- E1: person -> the owner. One writer, so owner-authored structurally.
  for (const row of source.relationships) {
    const personId = id(row.person_id);
    const type = id(row.relationship_type);
    if (!personId || !type || !people.has(personId)) {
      dropped += 1;
      continue;
    }
    edges.push({
      key: relationEdgeKey("person_owner", personId, OWNER_NODE_ID, type),
      kind: "person_owner",
      from: personId,
      to: OWNER_NODE_ID,
      origin: STRUCTURAL,
      role: null,
      storedType: type,
      description: id(row.description),
      since: id(row.valid_from),
    });
  }

  // ---- E2: person <-> project. Two writers, so the origin must be proved.
  for (const row of source.personProjects) {
    const personId = id(row.person_id);
    const projectId = id(row.project_id);
    const rowId = id(row.id);
    if (!personId || !projectId || !people.has(personId) || !projects.has(projectId)) {
      dropped += 1;
      continue;
    }
    edges.push({
      key: relationEdgeKey("person_project", personId, projectId),
      kind: "person_project",
      from: personId,
      to: projectId,
      origin: rowId && source.auditedAssociationIds.has(rowId) ? AUDITED : UNATTRIBUTABLE,
      role: id(row.role),
      storedType: null,
      description: null,
      since: id(row.valid_from),
    });
  }

  // ---- E3: person <-> context. Same two writers, same proof.
  for (const row of source.personContexts) {
    const personId = id(row.person_id);
    const contextId = id(row.context_id);
    const rowId = id(row.id);
    if (!personId || !contextId || !people.has(personId) || !contexts.has(contextId)) {
      dropped += 1;
      continue;
    }
    edges.push({
      key: relationEdgeKey("person_context", personId, contextId),
      kind: "person_context",
      from: personId,
      to: contextId,
      origin: rowId && source.auditedAssociationIds.has(rowId) ? AUDITED : UNATTRIBUTABLE,
      role: null,
      storedType: null,
      description: null,
      since: id(row.valid_from),
    });
  }

  /*
   * ---- E4: person -> organization, project -> organization.
   *
   * A column rather than a link table, and owner-authored by construction: the
   * interpretation RPC inserts `people (user_id, name)` and
   * `projects (user_id, name)` and never sets `organization_id`. Its only three
   * writers in the tree are owner actions in `entities/actions.ts`.
   *
   * A person or project whose organization did not resolve does **not** count as
   * dropped: the entity is on the page either way and only the edge is absent —
   * unlike a link row, which is a link the owner has that the surface is not
   * showing.
   */
  for (const row of source.people) {
    const personId = id(row.id);
    const orgId = id(row.organization_id);
    if (!personId || !orgId || !people.has(personId) || !organizations.has(orgId)) continue;
    edges.push({
      key: relationEdgeKey("person_organization", personId, orgId),
      kind: "person_organization",
      from: personId,
      to: orgId,
      origin: STRUCTURAL,
      role: null,
      storedType: null,
      description: null,
      since: null,
    });
  }
  for (const row of source.projects) {
    const projectId = id(row.id);
    const orgId = id(row.organization_id);
    if (!projectId || !orgId || !projects.has(projectId) || !organizations.has(orgId)) continue;
    edges.push({
      key: relationEdgeKey("project_organization", projectId, orgId),
      kind: "project_organization",
      from: projectId,
      to: orgId,
      origin: STRUCTURAL,
      role: null,
      storedType: null,
      description: null,
      since: null,
    });
  }

  const unique = dedupeEdges(edges);

  /*
   * The bound, measured once for both presentations.
   *
   * `boundedList` is given the whole edge list against a limit it cannot exceed,
   * so it never trims here — the trimming already happened per source table, and
   * re-trimming the union would cut edges the owner has for a reason nobody could
   * state. What it is for is the `upstreamBounded` argument: the shortfall from
   * unresolved endpoints joins the source bound in one disjunction, exactly as
   * `bounds/contracts.ts` describes for the contextual pages' two-hop reads.
   */
  const bounded = boundedList(unique, Number.MAX_SAFE_INTEGER, source.sourceBounded || dropped > 0);

  const referenced = new Set<string>();
  for (const edge of unique) {
    referenced.add(edge.from);
    referenced.add(edge.to);
  }

  const nodes: RelationNode[] = [];
  if (referenced.has(OWNER_NODE_ID)) {
    nodes.push({ id: OWNER_NODE_ID, type: "owner", label: source.ownerLabel, href: null });
  }
  for (const [type, source_] of [
    ["person", people],
    ["project", projects],
    ["context", contexts],
    ["organization", organizations],
  ] as const) {
    for (const [nodeId, label] of source_) {
      if (!referenced.has(nodeId)) continue;
      nodes.push({ id: nodeId, type, label, href: relationNodeHref(source.locale, type, nodeId) });
    }
  }

  return {
    nodes,
    // `limit` is the per-source bound, which is the only bound applied. Stated
    // from the source rather than from `boundedList`'s sentinel above.
    edges: { items: bounded.items, bounded: bounded.bounded, limit: source.limit },
  };
}

/** The subset the drawing may render (`2N-RELATION-006`). */
export function drawableEdges(projection: RelationProjection): readonly RelationEdge[] {
  return projection.edges.items.filter((edge) => isDrawable(edge.origin));
}

/** The rest — listed, explained, and deliberately not drawn. */
export function unattributableEdges(projection: RelationProjection): readonly RelationEdge[] {
  return projection.edges.items.filter((edge) => !isDrawable(edge.origin));
}

/**
 * The nodes the drawing may render.
 *
 * Only those a drawable edge touches. A node reachable **only** through an
 * unattributable link is absent from the picture and present in the list, which
 * is the honest direction: the drawing shows what it can explain, and nothing is
 * hidden, because the list carries it.
 */
export function drawableNodes(projection: RelationProjection): readonly RelationNode[] {
  const referenced = new Set<string>();
  for (const edge of drawableEdges(projection)) {
    referenced.add(edge.from);
    referenced.add(edge.to);
  }
  return projection.nodes.filter((node) => referenced.has(node.id));
}

/** Node lookup for the presentations, built once rather than per row. */
export function nodesById(projection: RelationProjection): ReadonlyMap<string, RelationNode> {
  return new Map(projection.nodes.map((node) => [node.id, node]));
}
