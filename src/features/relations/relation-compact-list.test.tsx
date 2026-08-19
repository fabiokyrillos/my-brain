import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { relationEdgeKey, type RelationEdge, type RelationNode } from "./contracts";
import type { RelationProjection } from "./projection";
import { RelationCompactList } from "./relation-compact-list";
import { RelationList } from "./relation-list";
import { COMPACT_RELATION_LIMIT, relationAnchorId } from "./view";

/**
 * `2P-RELATION-003`, `2P-RELATION-004` — the drawing's own text.
 *
 * The two properties worth proving are the ones a reader cannot check for
 * themselves: that this list is a **strict subset of the drawing** — so it can
 * neither add an unattributable link the picture refuses nor hide one it shows —
 * and that each row's link resolves to **that same edge's row** in the text tab,
 * where its origin note lives.
 *
 * The second one is not obvious: the text tab renders drawn rows first and
 * undrawable ones after, so an index taken over either group would point at a
 * different relation. The case below plants exactly that shape.
 */

const OWNER: RelationNode = { id: "owner", type: "owner", label: "Você", href: null };
const MARINA: RelationNode = { id: "p1", type: "person", label: "Marina", href: "/pt-BR/app/people/p1" };
const CAMILA: RelationNode = { id: "p2", type: "person", label: "Camila", href: "/pt-BR/app/people/p2" };
const ATLAS: RelationNode = { id: "j1", type: "project", label: "Atlas", href: "/pt-BR/app/projects/j1" };

function edge(
  kind: RelationEdge["kind"],
  from: string,
  to: string,
  origin: RelationEdge["origin"],
  qualifier = "",
): RelationEdge {
  return {
    key: relationEdgeKey(kind, from, to, qualifier),
    kind,
    from,
    to,
    origin,
    role: null,
    storedType: qualifier === "" ? null : qualifier,
    description: null,
    since: "2026-08-01T00:00:00.000Z",
  };
}

const OWNED: RelationEdge["origin"] = { kind: "owner-authored", basis: "structural" };
const UNATTRIBUTABLE: RelationEdge["origin"] = { kind: "unattributable" };

function projection(edges: readonly RelationEdge[]): RelationProjection {
  return { nodes: [OWNER, MARINA, CAMILA, ATLAS], edges: { items: edges, bounded: false, limit: 50 } };
}

describe("RelationCompactList", () => {
  it("renders only the drawable edges, never the ones the drawing refuses", () => {
    // `2N-RELATION-006` keeps unattributable links out of the picture. This list
    // is the picture's text, so it takes the same subset — the full text tab is
    // where the other rows live, and it says why.
    render(
      <RelationCompactList
        focusId={null}
        locale="pt-BR"
        projection={projection([
          edge("person_project", "p1", "j1", OWNED),
          edge("person_project", "p2", "j1", UNATTRIBUTABLE),
        ])}
      />,
    );

    expect(screen.getByText("Marina")).toBeInTheDocument();
    expect(screen.queryByText("Camila")).toBeNull();
  });

  it("renders nothing at all when there is nothing drawn", () => {
    const { container } = render(
      <RelationCompactList
        focusId={null}
        locale="pt-BR"
        projection={projection([edge("person_project", "p2", "j1", UNATTRIBUTABLE)])}
      />,
    );
    // An empty "the drawn links, in text" heading over no rows would say the
    // drawing has links it does not.
    expect(container).toBeEmptyDOMElement();
  });

  it("links each row to that edge's own row in the text tab", () => {
    /*
     * The shape this exists to catch: an unattributable edge sits FIRST in the
     * projection, so the drawn edge is at position 2 in the full list even
     * though it is the first drawn one. Indexing the drawn subset would produce
     * `#relation-1` and open the explanation of a different relation.
     */
    const undrawn = edge("person_project", "p2", "j1", UNATTRIBUTABLE);
    const drawn = edge("person_project", "p1", "j1", OWNED);
    render(<RelationCompactList focusId={null} locale="pt-BR" projection={projection([undrawn, drawn])} />);

    const link = screen.getByRole("link", { name: /Ver a explicação do vínculo/ });
    expect(link).toHaveAttribute("href", "/pt-BR/app/relations?view=links#relation-2");
  });

  it("keeps the focus in the link, so the destination shows the same rows", () => {
    render(
      <RelationCompactList
        focusId="p1"
        locale="pt-BR"
        projection={projection([edge("person_project", "p1", "j1", OWNED)])}
      />,
    );
    expect(screen.getByRole("link", { name: /Ver a explicação/ })).toHaveAttribute(
      "href",
      "/pt-BR/app/relations?view=links&focus=p1#relation-1",
    );
  });

  it("puts no governed text in an accessible name", () => {
    // The one governed string on this surface is a relationship's own sentence,
    // and it stays in the text tab behind `ProtectedContent`. An `aria-label`
    // carrying it would hand the masked text straight to assistive technology.
    render(
      <RelationCompactList
        focusId={null}
        locale="pt-BR"
        projection={projection([edge("person_owner", "p1", "owner", OWNED, "Chefe")])}
      />,
    );
    const link = screen.getByRole("link", { name: /Ver a explicação/ });
    expect(link.getAttribute("aria-label")).toContain("Marina");
    expect(link.getAttribute("href")).not.toContain("Chefe");
  });

  it("states what it left out rather than stopping silently", () => {
    const many = Array.from({ length: COMPACT_RELATION_LIMIT + 3 }, (_, index) =>
      edge("person_project", "p1", `j${index}`, OWNED));
    // Every endpoint is a real node: a row whose other end is missing renders
    // nothing at all rather than half a relation, so a fixture without them
    // would measure the wrong thing.
    const nodes: RelationNode[] = [
      OWNER,
      MARINA,
      ...many.map((item, index) => ({
        id: item.to,
        type: "project" as const,
        label: `Projeto ${index}`,
        href: `/pt-BR/app/projects/${item.to}`,
      })),
    ];
    render(
      <RelationCompactList
        focusId={null}
        locale="pt-BR"
        projection={{ nodes, edges: { items: many, bounded: false, limit: 50 } }}
      />,
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(COMPACT_RELATION_LIMIT);
    expect(screen.getByText(new RegExp(`Mostrando ${COMPACT_RELATION_LIMIT}`))).toBeInTheDocument();
  });
});

describe("the text tab's anchors", () => {
  it("gives each row the id the compact list links to, across both groups", () => {
    const undrawn = edge("person_project", "p2", "j1", UNATTRIBUTABLE);
    const drawn = edge("person_project", "p1", "j1", OWNED);
    const { container } = render(
      <RelationList locale="pt-BR" projection={projection([undrawn, drawn])} timeZone="America/Sao_Paulo" />,
    );

    // Position 1 is the undrawn row and position 2 is the drawn one, in the
    // projection's own order — which is what the compact list's link assumed.
    expect(container.querySelector(`#${relationAnchorId(0)}`)).not.toBeNull();
    expect(container.querySelector(`#${relationAnchorId(1)}`)).not.toBeNull();
    // And no two rows share one anchor, which is what indexing per group would
    // have produced.
    const ids = [...container.querySelectorAll("li[id]")].map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
