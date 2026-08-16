import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Locale } from "@/lib/preferences";

import { projectRelations, type RelationSource } from "./projection";
import { RelationDiagram } from "./relation-diagram";

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

function diagram(overrides: Partial<RelationSource> = {}, locale: Locale = "pt-BR") {
  const projection = projectRelations(
    source({ ...overrides, locale, ownerLabel: locale === "pt-BR" ? "Você" : "You" }),
  );
  return render(<RelationDiagram locale={locale} projection={projection} />);
}

const MARINA = { id: "person-1", name: "Marina", organization_id: null };
const ATLAS = { id: "project-1", name: "Atlas", organization_id: null };
const RELATIONSHIP = {
  person_id: "person-1",
  relationship_type: "manager",
  description: null as string | null,
  valid_from: null as string | null,
};

describe("2N-ACCESS-004: the drawing is HTML anchors over a hidden geometry layer", () => {
  it("renders each node as a real link with its own name, not as SVG text", () => {
    diagram({ people: [MARINA], relationships: [RELATIONSHIP] });

    expect(screen.getByRole("link", { name: "Abrir pessoa: Marina" })).toHaveAttribute(
      "href",
      "/pt-BR/app/people/person-1",
    );
  });

  it("hides the SVG from assistive technology and puts no text inside it", () => {
    const { container } = diagram({ people: [MARINA], relationships: [RELATIONSHIP] });

    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("focusable")).toBe("false");
    expect(svg.querySelectorAll("text, title, desc, foreignObject")).toHaveLength(0);
    expect(svg.querySelectorAll("a, button, [tabindex]")).toHaveLength(0);
    expect(svg.textContent).toBe("");
  });

  it("puts no content into any attribute of the geometry layer", () => {
    const { container } = diagram({ people: [MARINA], relationships: [RELATIONSHIP] });
    const svg = container.querySelector("svg")!;
    for (const element of [svg, ...Array.from(svg.querySelectorAll("*"))]) {
      for (const attribute of Array.from(element.attributes)) {
        expect(attribute.value).not.toContain("Marina");
        expect(attribute.value).not.toContain("person-1");
      }
    }
  });

  it("carries no `title`, so nothing depends on hover", () => {
    const { container } = diagram({ people: [MARINA], relationships: [RELATIONSHIP] });
    expect(container.querySelectorAll("[title]")).toHaveLength(0);
  });

  it("names the figure and describes it in words", () => {
    diagram({ people: [MARINA], relationships: [RELATIONSHIP] });
    const figure = screen.getByRole("group", { name: "Desenho das relações" });
    expect(figure).toBeVisible();
    expect(screen.getByText(/em colunas por tipo/)).toBeVisible();
  });
});

describe("2N-RELATION-010: the refusal is rendered, not commented", () => {
  it("says that position, distance and line count mean nothing", () => {
    diagram({ people: [MARINA], relationships: [RELATIONSHIP] });
    const note = screen.getByRole("note");
    expect(note).toHaveAttribute("data-layout-means-nothing", "true");
    expect(note.textContent).toMatch(/não significam nada/);
    expect(note.textContent).toMatch(/não é mais importante/);
  });

  it("says it in English too", () => {
    diagram({ people: [MARINA], relationships: [RELATIONSHIP] }, "en");
    expect(screen.getByRole("note").textContent).toMatch(/mean nothing/);
  });

  it("never renders a confidence number, and says why", () => {
    const { container } = diagram({ people: [MARINA], relationships: [RELATIONSHIP] });
    expect(screen.getByText(/não o mostra/)).toBeVisible();
    expect(container.textContent).not.toMatch(/\b\d{1,3}%/);
  });
});

describe("2N-RELATION-006: only what can be explained is drawn", () => {
  it("leaves an unattributable link out of the picture entirely", () => {
    diagram({
      people: [MARINA],
      projects: [ATLAS],
      personProjects: [{ id: "pp-1", person_id: "person-1", project_id: "project-1", role: null, valid_from: null }],
    });

    expect(screen.queryByRole("link", { name: "Abrir pessoa: Marina" })).toBeNull();
    expect(screen.getByText(/Nada para desenhar/)).toBeVisible();
    expect(screen.getByText(/Nenhum deles tem origem confirmada/)).toBeVisible();
  });

  it("draws the attributable one beside it and no line for the other", () => {
    const { container } = diagram({
      people: [MARINA],
      projects: [ATLAS],
      relationships: [RELATIONSHIP],
      personProjects: [{ id: "pp-1", person_id: "person-1", project_id: "project-1", role: null, valid_from: null }],
    });

    // Marina and the owner are drawn; Atlas reaches the picture only through the
    // unattributable link, so it is absent from it — and present in the list.
    expect(screen.getByRole("link", { name: "Abrir pessoa: Marina" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Abrir projeto: Atlas" })).toBeNull();
    expect(container.querySelectorAll("svg line")).toHaveLength(1);
  });
});

describe("colour is never the only signal", () => {
  it("prints each node's type as a word inside the box", () => {
    diagram({
      people: [{ ...MARINA, organization_id: "org-1" }],
      organizations: [{ id: "org-1", name: "Acme" }],
      relationships: [RELATIONSHIP],
    });

    const box = screen.getByRole("link", { name: "Abrir pessoa: Marina" });
    expect(box.textContent).toContain("Pessoa");
    expect(box.textContent).toContain("Marina");
    expect(screen.getByRole("link", { name: "Abrir organização: Acme" }).textContent).toContain("Organização");
  });

  it("names every type in the legend, in words", () => {
    diagram({ people: [MARINA], relationships: [RELATIONSHIP] });
    for (const term of ["Você", "Pessoa", "Projeto", "Contexto", "Organização"]) {
      expect(screen.getAllByText(term).length).toBeGreaterThan(0);
    }
  });
});

describe("the owner node is drawn without a link, because the owner is not a row", () => {
  it("renders it as text", () => {
    const { container } = diagram({ people: [MARINA], relationships: [RELATIONSHIP] });
    const owner = container.querySelector('.relations-node[data-node-type="owner"]')!;
    expect(owner.tagName.toLowerCase()).toBe("span");
    expect(owner.textContent).toContain("Você");
  });
});

describe("an empty projection draws nothing rather than an empty frame", () => {
  it("renders no figure at all", () => {
    const { container } = diagram();
    /*
     * The assertion used to be `querySelector("svg")` — every SVG in the
     * subtree. `2O-RECOVER-002` routed the empty state through
     * `UniversalStateLine`, whose tone icon is an SVG, and the check started
     * failing against a component that is behaving correctly.
     *
     * The property was never "no SVG element exists"; it is **no diagram is
     * drawn**, and the diagram is the `<figure>` and its `<svg>`. Stated that
     * way it is both true and stronger — the old form would also have been
     * satisfied by a diagram rendered with `<canvas>`.
     */
    expect(container.querySelector("figure")).toBeNull();
    expect(container.querySelector("figure svg")).toBeNull();
    expect(container.querySelector(".relations-node")).toBeNull();
    // The fixture marker `2O-RECOVER-007` requires: three assertions above
    // report an absence, and all three pass against a component that rendered
    // nothing at all. This one proves it rendered.
    expect(container.querySelector("[data-diagram-empty]")).not.toBeNull();
    expect(screen.getByText(/Nada para desenhar/)).toBeVisible();
  });
});
