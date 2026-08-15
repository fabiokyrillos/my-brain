/**
 * The entity workspace — one template, two surfaces.
 *
 * `03-componentes.md` calls Pessoa and Projeto **the same** EntityWorkspace:
 * *cabeçalho → resumo → duas colunas (trabalho em aberto / o que o Brain sabe)
 * → onde aparece*. Two pages implementing one template by two authors making the
 * same choices twice is the divergence this repository has now paid for on Hoje
 * (`2L-PRIVACY-007`) and on the file sections (`2N-FILES-009`).
 *
 * So the shape is asserted from the source of both pages together. Every check
 * below fails on **one** page diverging, not only on both regressing.
 *
 * ## What is deliberately not asserted here
 *
 * The generated summary. It is not built — see the person page's header — and a
 * guard that asserted its absence would have to be deleted the day it ships,
 * which is a guard that teaches nothing. What is asserted is the thing that
 * would actually be wrong: that neither page renders a placeholder implying the
 * capability exists.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { getEntityCopy } from "../../features/entities/copy";

const REPO = process.cwd();
const PERSON = "src/app/[locale]/app/people/[personId]/page.tsx";
const PROJECT = "src/app/[locale]/app/projects/[projectId]/page.tsx";
const CSS = "src/app/entities.css";

const read = (relative: string) => readFileSync(join(REPO, relative), "utf8");
/** Comments state intent; only rendered code is evidence. */
const code = (relative: string) =>
  read(relative).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const WORKSPACES = [
  [PERSON, "the person workspace"],
  [PROJECT, "the project workspace"],
] as const;

describe("both workspaces are the same template", () => {
  it.each(WORKSPACES)("%s uses the workspace shell rather than the detail one", (file, name) => {
    const source = code(file);
    expect(source, `${name} is still a plain detail page`).toContain('className="content-page entity-workspace"');
    expect(source, `${name} does not use .entity-detail's stacked layout`).not.toContain("entity-detail");
  });

  it.each(WORKSPACES)("%s names its two columns", (file, name) => {
    const source = code(file);
    expect(source, `${name} has no column grid`).toContain('className="entity-workspace-columns"');
    // Two columns, and exactly two: a third would be a layout the template does
    // not describe, and the CSS declares two tracks.
    expect(source.match(/className="entity-workspace-column"/g) ?? [], `${name}`).toHaveLength(2);
    expect(source, `${name} does not name its open-work column`).toContain("{copy.openWork}");
    expect(source, `${name} does not name its knowledge column`).toContain("{copy.whatBrainKnows}");
  });

  it.each(WORKSPACES)("%s labels each column with its own heading", (file, name) => {
    const source = code(file);
    // `aria-labelledby` pointing at the heading rather than a duplicated
    // `aria-label`, so the accessible name cannot drift from the visible one.
    expect(source, `${name} does not label its open column`).toContain(
      '<section className="entity-workspace-column" aria-labelledby="workspace-open">',
    );
    expect(source, `${name} does not label its knowledge column`).toContain(
      '<section className="entity-workspace-column" aria-labelledby="workspace-knows">',
    );
    expect(source).toContain('<h2 id="workspace-open">');
    expect(source).toContain('<h2 id="workspace-knows">');
  });

  it.each(WORKSPACES)("%s puts the edit form behind a disclosure", (file, name) => {
    const source = code(file);
    expect(source, `${name} renders the edit form open in the header's position`).toContain(
      '<details className="entity-edit-disclosure">',
    );
    expect(source).toContain("{copy.editSummary}");
    expect(source).toContain("<EntityEditForm");
  });

  it.each(WORKSPACES)("%s ends with 'onde aparece' under the shared heading", (file, name) => {
    const source = code(file);
    expect(source, `${name} does not use the template's fourth band`).toContain("{copy.whereItAppears}");
    // The band is outside the columns, so it keeps a page-level `<h2>`.
    expect(source).toMatch(/<section className="entity-timeline"[^>]*>\s*<h2>\{copy\.whereItAppears\}<\/h2>/);
  });

  it.each(WORKSPACES)("%s carries the changes band, from the audit trail", (file, name) => {
    const source = code(file);
    expect(source, `${name} has no changes band`).toContain('<section className="entity-changes" id="changes">');
    expect(source, `${name} narrates changes with a describer of its own`).toContain("<HistoryList");
    expect(source).toContain("{copy.recentChanges}");
    // Bounded, like every other list on these pages — a band that silently
    // stopped at twenty would be `2N-PERSON-003`'s truncation again.
    expect(source).toContain("<BoundedNotice list={boundedChanges}");
  });

  /**
   * The one thing a placeholder would get wrong.
   *
   * `04-estados.md` offers *"Ainda não há material suficiente para um resumo"*
   * for a summary that exists and is waiting for material. No summary exists,
   * so that sentence would say the product has a capability it does not have —
   * which ADR-114 Decision 7 forbids in the same words it forbids a clickable
   * affordance that does nothing.
   */
  it.each(WORKSPACES)("%s renders no summary placeholder", (file, name) => {
    /*
     * Comments stripped, and that is load-bearing rather than tidy. The person
     * page's own header **quotes** the sentence while explaining why it is not
     * used, so a scan of the raw file fails on the file that documents the
     * decision correctly — a check passing or failing by containing its own
     * subject. Only rendered code is evidence.
     */
    const source = code(file).toLowerCase();
    expect(source.length, `${name} produced no code to scan`).toBeGreaterThan(2000);
    for (const token of ["material suficiente", "enough material", "gerar resumo", "generate summary"]) {
      expect(source.includes(token), `${name} implies a summary the product cannot make`).toBe(false);
    }
  });
});

describe("the template's copy is shared, typed and translated", () => {
  it("names every part of the workspace in both locales", () => {
    for (const locale of ["pt-BR", "en"] as const) {
      const copy = getEntityCopy(locale);
      for (const key of ["editSummary", "openWork", "whatBrainKnows", "whereItAppears"] as const) {
        expect(copy[key], `${locale} has no ${key}`).toBeTruthy();
      }
    }
  });

  it("really translates them rather than reusing one locale's words", () => {
    const pt = getEntityCopy("pt-BR");
    const en = getEntityCopy("en");
    for (const key of ["editSummary", "openWork", "whatBrainKnows", "whereItAppears"] as const) {
      expect(pt[key], `${key} carries the same word in both locales`).not.toBe(en[key]);
    }
  });

  it("keeps the changes explainer per subject, because the trail's scope differs", () => {
    const pt = getEntityCopy("pt-BR");
    // One heading, two explainers and two empty sentences: a shared "neste
    // projeto" would have appeared under a person's name.
    expect(pt.personChangesExplainer).not.toBe(pt.recentChangesExplainer);
    expect(pt.personChangesEmpty).not.toBe(pt.recentChangesEmpty);
  });
});

describe("the panels sit a level below the column that contains them", () => {
  /*
   * The outline defect `/app/reviews` shipped: the heading count was right and
   * the order said the wrong thing about what belongs to what. Both workspaces
   * now name their columns as `<h2>`, so a panel left at level two would be the
   * sibling of the region containing it.
   */
  it.each([
    ["src/features/entities/relationship-panel.tsx", "the relationship panel"],
    ["src/features/entities/association-panel.tsx", "an association panel"],
    ["src/features/library/linked-subjects-section.tsx", "the linked-files section"],
  ])("%s heads at level three", (file, name) => {
    const source = code(file);
    expect(source, `${name} is still an <h2>`).not.toMatch(/<h2[\s>]/);
    expect(source, `${name} has no heading at all`).toMatch(/<h3[\s>]/);
  });

  it("leaves no h2 inside a workspace column", () => {
    for (const [file, name] of WORKSPACES) {
      const source = code(file);
      // Every `<h2>` on these pages is accounted for: the two column names, the
      // changes band and "onde aparece". A fifth would be a section that
      // escaped the outline.
      const headings = source.match(/<h2[\s>]/g) ?? [];
      expect(headings.length, `${name} has ${headings.length} level-two headings`).toBe(4);
    }
  });
});

describe("the workspace layout is a grid, and never `order`", () => {
  it("places the columns by grid template rather than by reordering", () => {
    const css = read(CSS);
    expect(css).toMatch(/\.entity-workspace-columns\s*\{[^}]*grid-template-columns/);
    /*
     * Focus order has to equal visual order in both layouts — the rule Hoje and
     * the task detail were built to. `order` would let the two disagree at
     * exactly one viewport, which is the failure nobody sees until a keyboard
     * user reaches it.
     */
    const block = css.slice(css.indexOf(".entity-workspace-columns"));
    const workspaceRules = block.slice(0, block.indexOf("@media"));
    expect(workspaceRules).not.toMatch(/^\s*order\s*:/m);
  });

  it("collapses to one column below the shell's single breakpoint", () => {
    const css = read(CSS);
    const narrow = css.slice(css.lastIndexOf("@media (max-width: 899px)"));
    expect(narrow).toMatch(/\.entity-workspace-columns\s*\{\s*grid-template-columns:\s*1fr/);
  });

  /**
   * **One** rule, which is what the title promises and what the previous version
   * of this test did not check.
   *
   * It asserted only that each selector appeared somewhere, so a second,
   * divergent card rule for the same block — the exact drift the title names —
   * would have passed. An independent review of the branch caught it.
   *
   * The check is now: every one of the seven blocks appears in the **same**
   * declaration, and no block carries a second rule declaring `border-radius` or
   * `padding` of its own.
   */
  it("gives every workspace block one card rule, so two cannot drift apart", () => {
    const css = read(CSS);
    const BLOCKS = [
      ".entity-workspace .entity-tasks",
      ".entity-workspace .relation-panel",
      ".entity-workspace .entity-memory",
      ".entity-workspace .entity-files",
      ".entity-workspace .entity-decisions",
      ".entity-workspace .entity-timeline",
      ".entity-workspace .entity-changes",
    ];

    // The one rule: a selector list containing all seven, followed by a body
    // that declares the chrome.
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    const cardRules = rules.filter(([, selectors, body]) =>
      BLOCKS.every((block) => selectors.includes(block)) && /border-radius/.test(body));
    expect(cardRules, "the seven blocks are no longer styled by one rule").toHaveLength(1);

    /*
     * …and no block has a second rule of its own giving it different chrome.
     * `border-radius` is the probe: a divergent card would have to redeclare it,
     * and a rule that only adjusted layout (`display`, `gap`) is legitimate and
     * is not what this is looking for.
     */
    for (const block of BLOCKS) {
      const divergent = rules.filter(
        ([, selectors, body]) =>
          selectors.includes(block)
          && /border-radius/.test(body)
          && !BLOCKS.every((other) => selectors.includes(other)),
      );
      expect(divergent, `${block} carries a second, divergent card rule`).toHaveLength(0);
    }
  });
});
