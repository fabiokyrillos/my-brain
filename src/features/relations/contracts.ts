/**
 * `2N-RELATION-002`, `-005`, `-006`, `-009`, `-010` — the closed vocabulary the
 * relations surface may express, and the one place an edge decides whether it
 * may be drawn.
 *
 * ## Why the vocabulary is closed, and closed here
 *
 * `PHASE_2N_SLICE_6_EDGE_CATALOG.md` measured every candidate the schema offers
 * and classified each one. This module is that catalogue in executable form: a
 * type that cannot express a node the catalogue refused, and an origin union
 * with no fourth arm. `phase-2n-relations-guard.test.ts` asserts both against the
 * document, so widening one without the other fails the build.
 *
 * The refusals that matter most are the ones that are absent rather than
 * present. There is **no** `person_person` edge kind, because
 * `person_relationships.related_person_id` is written `null` by the only writer
 * the table has ever had and a null there means *related to the owner* — so a
 * line between two people would have to be synthesized from a shared project, a
 * shared context or a co-mention, and each of those is a conclusion the data does
 * not carry. There is **no** `record` or `file` node type, for the reasons E5 and
 * E6 of the catalogue give.
 *
 * ## Why `confidence` has no home here
 *
 * All three relation tables carry `confidence numeric(4,3) not null default 1`.
 * No type in this module can hold it, no loader selects it, and
 * `2N-RELATION-005`/`-010` are why: a number that reaches the client is a number
 * somebody will render, and a rendered confidence is an inference wearing the
 * clothes of a measurement. The guard greps the loader's select lists for it.
 *
 * ## The origin union, and the one direction it proves in
 *
 * `person_relationships` has exactly one writer in the whole repository, so its
 * rows are owner-authored **structurally** — there is no other writer that could
 * have made one. `person_projects` and `person_contexts` have **two**: the
 * owner's Server Actions, and the `link_interpreted_entities` trigger
 * (`202607160011`), which persists a co-mention from every interpretation that
 * extracts a person beside a project or a context.
 *
 * Nothing on the row tells them apart. The owner's creation actions write an
 * `audit_logs` row and the trigger writes none, so **presence** of that row is a
 * positive proof of authorship — and **absence** proves nothing, because an
 * owner action whose best-effort audit insert failed looks identical. So absence
 * resolves to `unattributable`, never to owner-authored: the false-negative
 * direction understates what is known, and the false-positive direction would
 * fabricate an origin, which is what `2N-RELATION-008` forbids by name.
 */

import type { Locale } from "@/lib/preferences";

/** The node types the catalogue admits. There is no sixth. */
export const RELATION_NODE_TYPES = ["owner", "person", "project", "context", "organization"] as const;
export type RelationNodeType = (typeof RELATION_NODE_TYPES)[number];

/**
 * The owner's own node id.
 *
 * A literal rather than a uuid, because the owner is not a row: the relation is
 * to *you*, expressed in the schema as a null `related_person_id`. Using a
 * sentinel keeps the node id space honest — no query can ever return it, so it
 * can never collide with a real entity.
 */
export const OWNER_NODE_ID = "owner";

export type RelationNode = {
  /** Opaque outside this module: a lookup key and a React key, never rendered. */
  readonly id: string;
  readonly type: RelationNodeType;
  /** A structural identifier (ADR-110 Decision 2) or the owner's own term. */
  readonly label: string;
  /** An in-app route this product wrote, or `null` for the owner node. */
  readonly href: string | null;
};

/** The edge kinds the catalogue admits. There is no `person_person`. */
export const RELATION_EDGE_KINDS = [
  "person_owner",
  "person_project",
  "person_context",
  "person_organization",
  "project_organization",
] as const;
export type RelationEdgeKind = (typeof RELATION_EDGE_KINDS)[number];

/**
 * Whether an edge kind asserts a direction, as data rather than per edge.
 *
 * Per-edge would let two rows of one kind disagree, and the question is a
 * property of the *schema*, not of a row: `person_projects` carries no column
 * that could order its pair, while a relationship term ("Chefe", "Reporta a
 * você") reads from the person toward the owner and an `organization_id` points
 * one way by definition.
 */
export const RELATION_EDGE_DIRECTED: Record<RelationEdgeKind, boolean> = {
  person_owner: true,
  person_project: false,
  person_context: false,
  person_organization: true,
  project_organization: true,
};

/** Where one edge came from. Closed: there is no fourth answer. */
export type RelationOrigin =
  /** True by construction — the table has exactly one writer, the owner's. */
  | { readonly kind: "owner-authored"; readonly basis: "structural" }
  /** Proved by the owner's own creation audit row. */
  | { readonly kind: "owner-authored"; readonly basis: "audited" }
  /**
   * Cannot be attributed. Either the interpretation trigger wrote it, or an
   * owner action did and its audit insert failed. Deliberately one arm.
   */
  | { readonly kind: "unattributable" };

export type RelationEdge = {
  /** Deterministic and semantic — see `relationEdgeKey`. */
  readonly key: string;
  readonly kind: RelationEdgeKind;
  /** A `RelationNode.id`. */
  readonly from: string;
  /** A `RelationNode.id`. */
  readonly to: string;
  readonly origin: RelationOrigin;
  /** `person_project` only — the owner's own word, never localized. */
  readonly role: string | null;
  /** `person_owner` only — the stored value, for the vocabulary's raw fallback. */
  readonly storedType: string | null;
  /**
   * `person_owner` only — the owner's own sentence about the relationship.
   *
   * Free text about a human being on a table with no classification: ADR-110
   * Decision 4's predicate, so it is rendered **protected** and never in an
   * attribute, a `title`, a tooltip or the drawing.
   */
  readonly description: string | null;
  /** The instant the relation began, when the table records one. */
  readonly since: string | null;
};

/**
 * The deterministic key for one edge.
 *
 * **Semantic rather than the row id, on purpose.** `person_relationships`
 * carries no unique index at all (`relationships.ts` records why), so two live
 * rows can assert the same relationship of the same type for the same person.
 * Keyed by row id they would be two edges and the drawing would show a doubled
 * line; keyed semantically they are one relation asserted twice, which is what
 * they are. `2N-RELATION-009` asks an edge not to duplicate the same relation.
 *
 * The qualifier is what distinguishes two genuinely different edges between the
 * same pair — the relationship type. It is empty where the pair itself is the
 * relation.
 */
export function relationEdgeKey(
  kind: RelationEdgeKind,
  from: string,
  to: string,
  qualifier = "",
): string {
  return `${kind}|${from}|${to}|${qualifier}`;
}

/**
 * The two audit `action_type` values that prove the owner **created** an
 * association.
 *
 * Here rather than in the loader so a guard can read it without pulling in
 * `server-only`, and because it belongs to the origin contract rather than to a
 * query's details.
 *
 * Narrow on purpose. `update_person_project_role`, `end_person_project` and
 * `end_person_context` write rows carrying the same `entity_type` and
 * `entity_id`, and reading any of them as proof of *authorship* would be
 * inference: correcting a role on a link the trigger created is not the same as
 * having created it.
 */
export const OWNER_ASSOCIATION_ACTIONS = [
  "associate_person_project",
  "associate_person_context",
] as const;

/**
 * Whether an edge may be **drawn**.
 *
 * `2N-RELATION-006`: the graph draws only authorized persisted relations, and no
 * unconfirmed inferred relation may appear in it. An `unattributable` edge is
 * exactly the thing that clause names, so it is listed and not drawn — and the
 * list says so rather than the surface hiding it.
 */
export function isDrawable(origin: RelationOrigin): boolean {
  return origin.kind === "owner-authored";
}

/**
 * Collapses edges that assert the same relation.
 *
 * First writer wins, so the result is stable under input order for equal keys —
 * and the inputs are themselves ordered, so two renders of one database produce
 * one picture.
 */
export function dedupeEdges(edges: readonly RelationEdge[]): readonly RelationEdge[] {
  const byKey = new Map<string, RelationEdge>();
  for (const edge of edges) if (!byKey.has(edge.key)) byKey.set(edge.key, edge);
  return [...byKey.values()];
}

/** The route a node opens at, or `null` where the node is not a row. */
export function relationNodeHref(locale: Locale, type: RelationNodeType, id: string): string | null {
  switch (type) {
    case "owner":
      return null;
    case "person":
      return `/${locale}/app/people/${id}`;
    case "project":
      return `/${locale}/app/projects/${id}`;
    case "context":
      return `/${locale}/app/contexts/${id}`;
    case "organization":
      return `/${locale}/app/organizations/${id}`;
  }
}
