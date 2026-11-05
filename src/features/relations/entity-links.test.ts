import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { getRelationsCopy } from "./copy";
import { relationViewHref } from "./view";

/**
 * Backlog item 2 (`INFORMATION_ARCHITECTURE.md` §1): Relações is reached from
 * the entity it is about. The person page opens the map focused on that person;
 * the project page opens the map (the focus is a person's, `2P-RELATION-003`).
 */
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("the relations map, from a person's and a project's page", () => {
  it("the person page links to the map focused on that person, only when they have a link", () => {
    const page = read("src/app/[locale]/app/people/[personId]/page.tsx");
    expect(page).toContain('relationViewHref(locale, "diagram", person.id)');
    expect(page).toMatch(/relationships\.length \|\| projectLinks\.length \|\| contextLinks\.length \?/);
  });

  it("the project page links to the map when the project has people", () => {
    const page = read("src/app/[locale]/app/projects/[projectId]/page.tsx");
    expect(page).toContain('relationViewHref(locale, "diagram", null)');
    expect(page).toMatch(/people\.length \?/);
  });

  it("builds the focused address the map resolves, and names the link in both locales", () => {
    expect(relationViewHref("pt-BR", "diagram", "p1")).toBe("/pt-BR/app/relations?view=diagram&focus=p1");
    expect(getRelationsCopy("pt-BR").openForPerson).not.toBe(getRelationsCopy("en").openForPerson);
  });
});
