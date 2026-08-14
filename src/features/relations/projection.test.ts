import { describe, expect, it } from "vitest";

import { OWNER_NODE_ID } from "./contracts";
import {
  drawableEdges,
  drawableNodes,
  nodesById,
  projectRelations,
  unattributableEdges,
  type RelationSource,
} from "./projection";

function source(overrides: Partial<RelationSource> = {}): RelationSource {
  return {
    relationships: [],
    personProjects: [],
    personContexts: [],
    auditedAssociationIds: new Set<string>(),
    people: [],
    projects: [],
    contexts: [],
    organizations: [],
    sourceBounded: false,
    limit: 50,
    locale: "pt-BR",
    ownerLabel: "Você",
    ...overrides,
  };
}

const MARINA = { id: "person-1", name: "Marina", organization_id: null };
const ATLAS = { id: "project-1", name: "Atlas", organization_id: null };
const WORK = { id: "context-1", name: "Trabalho" };
const ACME = { id: "org-1", name: "Acme" };

describe("E1: person -> owner is owner-authored by construction", () => {
  it("projects a live relationship into one edge to the owner node", () => {
    const projection = projectRelations(
      source({
        people: [MARINA],
        relationships: [
          {
            person_id: "person-1",
            relationship_type: "manager",
            description: "meu chefe",
            valid_from: "2026-01-01T00:00:00Z",
          },
        ],
      }),
    );

    expect(projection.edges.items).toHaveLength(1);
    const edge = projection.edges.items[0]!;
    expect(edge.kind).toBe("person_owner");
    expect(edge.from).toBe("person-1");
    expect(edge.to).toBe(OWNER_NODE_ID);
    expect(edge.origin).toEqual({ kind: "owner-authored", basis: "structural" });
    expect(edge.storedType).toBe("manager");
    expect(edge.description).toBe("meu chefe");
    expect(drawableEdges(projection)).toHaveLength(1);
  });

  it("materialises the owner node only when an edge reaches it", () => {
    const withRelationship = projectRelations(
      source({
        people: [MARINA],
        relationships: [{ person_id: "person-1", relationship_type: "friend", description: null, valid_from: null }],
      }),
    );
    expect(withRelationship.nodes.some((node) => node.type === "owner")).toBe(true);

    const withoutRelationship = projectRelations(
      source({
        people: [MARINA],
        projects: [ATLAS],
        personProjects: [{ id: "pp-1", person_id: "person-1", project_id: "project-1", role: null, valid_from: null }],
      }),
    );
    expect(withoutRelationship.nodes.some((node) => node.type === "owner")).toBe(false);
  });

  it("keeps two relationship types with the same person as two edges", () => {
    const projection = projectRelations(
      source({
        people: [MARINA],
        relationships: [
          { person_id: "person-1", relationship_type: "friend", description: null, valid_from: null },
          { person_id: "person-1", relationship_type: "colleague", description: null, valid_from: null },
        ],
      }),
    );
    expect(projection.edges.items).toHaveLength(2);
  });

  it("collapses two rows asserting the same relationship of the same type", () => {
    const projection = projectRelations(
      source({
        people: [MARINA],
        relationships: [
          { person_id: "person-1", relationship_type: "friend", description: "a", valid_from: null },
          { person_id: "person-1", relationship_type: "friend", description: "b", valid_from: null },
        ],
      }),
    );
    expect(projection.edges.items).toHaveLength(1);
  });
});

describe("E2/E3: an association is drawn only where the owner's audit row proves it", () => {
  it("draws an audited association and states the audited basis", () => {
    const projection = projectRelations(
      source({
        people: [MARINA],
        projects: [ATLAS],
        personProjects: [
          { id: "pp-1", person_id: "person-1", project_id: "project-1", role: "designer", valid_from: null },
        ],
        auditedAssociationIds: new Set(["pp-1"]),
      }),
    );
    expect(drawableEdges(projection)).toHaveLength(1);
    expect(projection.edges.items[0]?.origin).toEqual({ kind: "owner-authored", basis: "audited" });
    expect(projection.edges.items[0]?.role).toBe("designer");
  });

  it("refuses to draw an association with no audit row, and still lists it", () => {
    const projection = projectRelations(
      source({
        people: [MARINA],
        projects: [ATLAS],
        personProjects: [{ id: "pp-1", person_id: "person-1", project_id: "project-1", role: null, valid_from: null }],
      }),
    );
    expect(drawableEdges(projection)).toHaveLength(0);
    expect(unattributableEdges(projection)).toHaveLength(1);
    // The list keeps it, so nothing is hidden — only undrawn.
    expect(projection.edges.items).toHaveLength(1);
  });

  it("never calls an unaudited association owner-authored", () => {
    const projection = projectRelations(
      source({
        people: [MARINA],
        contexts: [WORK],
        personContexts: [{ id: "pc-1", person_id: "person-1", context_id: "context-1", valid_from: null }],
      }),
    );
    expect(projection.edges.items[0]?.origin).toEqual({ kind: "unattributable" });
  });

  it("keeps a node out of the drawing when only an unattributable link reaches it", () => {
    const projection = projectRelations(
      source({
        people: [MARINA],
        projects: [ATLAS],
        personProjects: [{ id: "pp-1", person_id: "person-1", project_id: "project-1", role: null, valid_from: null }],
      }),
    );
    expect(drawableNodes(projection)).toHaveLength(0);
    // …and the list still knows both of them.
    expect(projection.nodes.map((node) => node.id).sort()).toEqual(["person-1", "project-1"]);
  });
});

describe("E4: organization membership is owner-authored, because extraction never writes it", () => {
  it("projects both person and project membership", () => {
    const projection = projectRelations(
      source({
        people: [{ ...MARINA, organization_id: "org-1" }],
        projects: [{ ...ATLAS, organization_id: "org-1" }],
        organizations: [ACME],
        relationships: [{ person_id: "person-1", relationship_type: "colleague", description: null, valid_from: null }],
      }),
    );
    const kinds = projection.edges.items.map((edge) => edge.kind).sort();
    expect(kinds).toEqual(["person_organization", "person_owner", "project_organization"]);
    expect(drawableEdges(projection)).toHaveLength(3);
  });

  it("drops the membership edge when the organization does not resolve, without claiming more exist", () => {
    const projection = projectRelations(
      source({
        people: [{ ...MARINA, organization_id: "org-gone" }],
        relationships: [{ person_id: "person-1", relationship_type: "friend", description: null, valid_from: null }],
      }),
    );
    expect(projection.edges.items.map((edge) => edge.kind)).toEqual(["person_owner"]);
    // A column that did not resolve is not a link the owner has and cannot see:
    // the person is on the page either way.
    expect(projection.edges.bounded).toBe(false);
  });
});

describe("2N-PRIVACY-005: removed, foreign and unreadable produce one identical result", () => {
  const cases = [
    ["a person removed since the link was read", { people: [] }],
    ["a person belonging to somebody else", { people: [] }],
    ["a person the read failed to return", { people: [] }],
  ] as const;

  for (const [name, overrides] of cases) {
    it(`drops the edge for ${name}`, () => {
      const projection = projectRelations(
        source({
          ...overrides,
          projects: [ATLAS],
          personProjects: [{ id: "pp-1", person_id: "person-1", project_id: "project-1", role: null, valid_from: null }],
          auditedAssociationIds: new Set(["pp-1"]),
        }),
      );
      expect(projection.edges.items).toHaveLength(0);
      expect(projection.nodes).toHaveLength(0);
    });
  }

  it("treats a row whose name did not come back as absent, not as a blank node", () => {
    const projection = projectRelations(
      source({
        people: [{ id: "person-1", name: null, organization_id: null }],
        relationships: [{ person_id: "person-1", relationship_type: "friend", description: null, valid_from: null }],
      }),
    );
    expect(projection.edges.items).toHaveLength(0);
    expect(projection.nodes).toHaveLength(0);
  });

  it("reports the bound when a link's endpoint did not resolve, in words that say nothing about why", () => {
    const projection = projectRelations(
      source({
        people: [MARINA],
        projects: [],
        personProjects: [{ id: "pp-1", person_id: "person-1", project_id: "project-1", role: null, valid_from: null }],
      }),
    );
    expect(projection.edges.items).toHaveLength(0);
    expect(projection.edges.bounded).toBe(true);
  });
});

describe("2N-RELATION-007: one projection means the two presentations cannot disagree", () => {
  it("reports one bound, which both presentations read from the same value", () => {
    const projection = projectRelations(
      source({
        sourceBounded: true,
        people: [MARINA],
        relationships: [{ person_id: "person-1", relationship_type: "friend", description: null, valid_from: null }],
      }),
    );
    expect(projection.edges.bounded).toBe(true);
    expect(projection.edges.limit).toBe(50);
  });

  it("holds every drawn edge inside the listed set, so the drawing has no exclusive information", () => {
    const projection = projectRelations(
      source({
        people: [MARINA],
        projects: [ATLAS],
        contexts: [WORK],
        relationships: [{ person_id: "person-1", relationship_type: "friend", description: null, valid_from: null }],
        personProjects: [
          { id: "pp-1", person_id: "person-1", project_id: "project-1", role: null, valid_from: null },
        ],
        personContexts: [{ id: "pc-1", person_id: "person-1", context_id: "context-1", valid_from: null }],
        auditedAssociationIds: new Set(["pp-1"]),
      }),
    );
    const listed = new Set(projection.edges.items.map((edge) => edge.key));
    for (const edge of drawableEdges(projection)) expect(listed.has(edge.key)).toBe(true);
    expect(drawableEdges(projection)).toHaveLength(2);
    expect(unattributableEdges(projection)).toHaveLength(1);
  });

  it("gives every node a route except the owner", () => {
    const projection = projectRelations(
      source({
        people: [MARINA],
        relationships: [{ person_id: "person-1", relationship_type: "friend", description: null, valid_from: null }],
      }),
    );
    const byId = nodesById(projection);
    expect(byId.get("person-1")?.href).toBe("/pt-BR/app/people/person-1");
    expect(byId.get(OWNER_NODE_ID)?.href).toBeNull();
    expect(byId.get(OWNER_NODE_ID)?.label).toBe("Você");
  });
});

describe("an empty account produces an empty projection rather than a shape", () => {
  it("returns no nodes, no edges and no bound", () => {
    const projection = projectRelations(source());
    expect(projection.nodes).toEqual([]);
    expect(projection.edges.items).toEqual([]);
    expect(projection.edges.bounded).toBe(false);
    expect(drawableNodes(projection)).toEqual([]);
  });
});

describe("a dense account stays bounded and produces no duplicate", () => {
  it("projects fifty relationships and fifty associations without a per-node read", () => {
    const people = Array.from({ length: 50 }, (_, index) => ({
      id: `person-${index}`,
      name: `Pessoa ${index}`,
      organization_id: null,
    }));
    const projection = projectRelations(
      source({
        sourceBounded: true,
        people,
        projects: [ATLAS],
        relationships: people.map((person) => ({
          person_id: person.id,
          relationship_type: "colleague",
          description: null,
          valid_from: null,
        })),
        personProjects: people.map((person, index) => ({
          id: `pp-${index}`,
          person_id: person.id,
          project_id: "project-1",
          role: null,
          valid_from: null,
        })),
        auditedAssociationIds: new Set(people.map((_, index) => `pp-${index}`)),
      }),
    );
    expect(projection.edges.items).toHaveLength(100);
    expect(new Set(projection.edges.items.map((edge) => edge.key)).size).toBe(100);
    expect(projection.edges.bounded).toBe(true);
    expect(projection.nodes).toHaveLength(52);
  });
});
