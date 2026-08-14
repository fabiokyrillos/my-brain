import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { Locale } from "@/lib/preferences";

import { projectRelations, type RelationSource } from "./projection";
import { RelationList } from "./relation-list";

const ZONE = "America/Sao_Paulo";

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

function list(overrides: Partial<RelationSource> = {}, locale: Locale = "pt-BR") {
  const projection = projectRelations(source({ ...overrides, locale, ownerLabel: locale === "pt-BR" ? "Você" : "You" }));
  return render(<RelationList locale={locale} projection={projection} timeZone={ZONE} />);
}

const MARINA = { id: "person-1", name: "Marina", organization_id: null };
const ATLAS = { id: "project-1", name: "Atlas", organization_id: null };

const RELATIONSHIP = {
  person_id: "person-1",
  relationship_type: "manager",
  description: null as string | null,
  valid_from: "2019-03-15T12:00:00Z",
};

describe("2N-RELATION-002/-009: every row says what it asserts and where it came from", () => {
  it("names both ends, the relation, and the origin", () => {
    list({ people: [MARINA], relationships: [RELATIONSHIP] });

    const row = screen.getByRole("listitem");
    expect(within(row).getByRole("link", { name: "Abrir pessoa: Marina" })).toHaveAttribute(
      "href",
      "/pt-BR/app/people/person-1",
    );
    expect(within(row).getByText("Chefe")).toBeVisible();
    expect(within(row).getByText("Você")).toBeVisible();
    expect(within(row).getByText("Informado por você")).toBeVisible();
  });

  it("says it cannot attribute a link, rather than claiming the owner made it", () => {
    list({
      people: [MARINA],
      projects: [ATLAS],
      personProjects: [{ id: "pp-1", person_id: "person-1", project_id: "project-1", role: null, valid_from: null }],
    });

    expect(screen.getByText(/Não é possível dizer se você registrou este vínculo/)).toBeVisible();
    expect(screen.queryByText("Informado por você")).toBeNull();
  });

  it("keeps the two groups apart, and explains why one is not drawn", () => {
    list({
      people: [MARINA],
      projects: [ATLAS],
      relationships: [RELATIONSHIP],
      personProjects: [{ id: "pp-1", person_id: "person-1", project_id: "project-1", role: null, valid_from: null }],
    });

    const drawn = document.querySelector('[data-relation-group="drawn"]')!;
    const undrawn = document.querySelector('[data-relation-group="undrawn"]')!;
    expect(within(drawn as HTMLElement).getAllByRole("listitem")).toHaveLength(1);
    expect(within(undrawn as HTMLElement).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Vínculos sem origem confirmada" })).toBeVisible();
    expect(screen.getByText(/não entram no desenho/)).toBeVisible();
  });

  it("preserves the role the owner typed", () => {
    list({
      people: [MARINA],
      projects: [ATLAS],
      personProjects: [
        { id: "pp-1", person_id: "person-1", project_id: "project-1", role: "designer", valid_from: null },
      ],
      auditedAssociationIds: new Set(["pp-1"]),
    });
    expect(screen.getByText("Papel: designer")).toBeVisible();
  });

  it("stamps the start date in the owner's zone, not the host's", () => {
    list({ people: [MARINA], relationships: [RELATIONSHIP] });
    // 2019-03-15T12:00Z is the 15th in São Paulo; a host-zone read would be
    // free to say otherwise.
    expect(screen.getByText(/Desde 15 de mar/)).toBeVisible();
  });

  it("renders an unrecognised relationship type raw, with a neutral label beside it", () => {
    list({
      people: [MARINA],
      relationships: [{ ...RELATIONSHIP, relationship_type: "godparent" }],
    });
    expect(screen.getByText("godparent")).toBeVisible();
    expect(screen.getByText("Relação não reconhecida")).toBeVisible();
  });
});

describe("2N-PRIVACY-001: the owner's own sentence is withheld by default", () => {
  const withNote = {
    people: [MARINA],
    relationships: [{ ...RELATIONSHIP, description: "casamos em Recife" }],
  };

  it("does not print it until it is asked for", async () => {
    list(withNote);
    expect(screen.queryByText("casamos em Recife")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /mostrar/i }));
    expect(screen.getByText("casamos em Recife")).toBeVisible();
  });

  it("keeps it out of every attribute, not only out of the text", () => {
    const { container } = list(withNote);
    for (const element of Array.from(container.querySelectorAll("*"))) {
      for (const attribute of Array.from(element.attributes)) {
        expect(attribute.value).not.toContain("casamos em Recife");
      }
    }
  });

  it("carries no `title` anywhere, because a tooltip is not an affordance", () => {
    const { container } = list(withNote);
    expect(container.querySelectorAll("[title]")).toHaveLength(0);
  });
});

describe("2N-PERSON-003: the list states its bound rather than looking complete", () => {
  it("renders the notice when the source hit its limit", () => {
    list({ sourceBounded: true, people: [MARINA], relationships: [RELATIONSHIP] });
    expect(screen.getByRole("note", { name: "Lista parcial" })).toBeVisible();
  });

  it("renders nothing when it did not", () => {
    list({ people: [MARINA], relationships: [RELATIONSHIP] });
    expect(screen.queryByRole("note", { name: "Lista parcial" })).toBeNull();
  });
});

describe("the empty state explains rather than blaming", () => {
  it("says what would make a link appear", () => {
    list();
    expect(screen.getByText(/Nenhum vínculo ainda/)).toBeVisible();
    expect(screen.getByText(/Quando você registrar uma relação/)).toBeVisible();
  });
});

describe("2N-ACCESS-005: both locales, through the typed module", () => {
  it("renders the English copy for an English reader", () => {
    list(
      {
        people: [MARINA],
        projects: [ATLAS],
        relationships: [RELATIONSHIP],
        personProjects: [{ id: "pp-1", person_id: "person-1", project_id: "project-1", role: null, valid_from: null }],
      },
      "en",
    );

    expect(screen.getByRole("heading", { name: "All links" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Links with no confirmed origin" })).toBeVisible();
    expect(screen.getByText("Informed by you")).toBeVisible();
    expect(screen.getByText(/The Brain cannot tell whether you recorded this link/)).toBeVisible();
    // One link per row, and Marina is in both groups — two controls with the
    // same name that go to the same place, which is correct rather than the
    // duplicate-name defect `provenance-note.tsx` guards against.
    for (const link of screen.getAllByRole("link", { name: "Open person: Marina" })) {
      expect(link).toHaveAttribute("href", "/en/app/people/person-1");
    }
  });
});
