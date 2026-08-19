/**
 * Slice 2P.6 — the structural half of `2P-RELATION-001` … `-004`.
 *
 * Every assertion carries a **mutation control**, matching the convention
 * `phase-2n-relations-guard.test.ts` set: a detector that only ever passes is a
 * detector nobody has proved.
 *
 * `code()` strips comments before every scan, for the reason the 2N guard
 * records: these modules explain at length what they must not do, so a raw-text
 * scan would find its own prose and pass.
 *
 * ## What this file is for
 *
 * The drawing becoming the default view is the moment two things could quietly
 * stop being true, and neither would look broken:
 *
 *  1. **the text stops being the complete record.** Before this slice the list
 *     and the drawing were siblings on one page, so nobody could reach the
 *     picture without passing the text. Now they are two views, and the property
 *     has to be asserted rather than assumed;
 *  2. **the surface starts writing.** A focus control and a compact list are
 *     both places somebody could reach for persistence to "make the drawing
 *     better" — which is a named stop condition in the plan, and `2N-RELATION-
 *     TRIGGER`'s boundary besides.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { RELATION_VIEWS } from "@/features/relations/view";

const REPO = join(__dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(REPO, relative), "utf8");
const code = (relative: string) =>
  read(relative).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const FEATURE = "src/features/relations";
const PAGE = "src/app/[locale]/app/relations/page.tsx";
const VIEW = `${FEATURE}/view.ts`;
const CONTROLS = `${FEATURE}/relation-view-controls.tsx`;
const COMPACT = `${FEATURE}/relation-compact-list.tsx`;
const STYLESHEET = "src/app/relations.css";

describe("2P-RELATION-001: the drawing opens, and the text is a tab rather than a scroll", () => {
  it("declares exactly two views, with the drawing first", () => {
    expect([...RELATION_VIEWS]).toEqual(["diagram", "links"]);
  });

  it("takes the default from that order rather than from a second literal", () => {
    // Two places naming the default is two places for it to drift, and the drift
    // would be invisible: both values are plausible.
    expect(code(VIEW)).toContain("return RELATION_VIEWS[0]");
  });

  it("mutation control: a hardcoded default is a different string", () => {
    expect('return "links"'.includes("RELATION_VIEWS[0]")).toBe(false);
  });
});

describe("2P-RELATION-002: the text is reachable without a gesture and without JavaScript", () => {
  it("renders the tabs as links carrying an address per view", () => {
    const controls = code(CONTROLS);
    expect(controls).toContain("relationViewHref");
    expect(controls).toMatch(/<Link/);
    expect(controls).toContain('aria-current={candidate === view ? "page" : undefined}');
  });

  it("adds no click handler anywhere in the view controls", () => {
    // `2N-ACCESS-004` refuses a gesture as the only path. A handler here would
    // also make the text tab unreachable with JavaScript off.
    expect(code(CONTROLS)).not.toMatch(/onClick|onKeyDown|useState/);
  });

  it("mutation control: the handler detector fires on a click-only tab", () => {
    expect(/onClick|onKeyDown|useState/.test('<button onClick={() => setView("links")}>')).toBe(true);
  });

  it("says on both tabs that the text carries everything", () => {
    // A reader standing in front of a figure has no way to know the list is the
    // complete record unless the surface says so.
    expect(code(CONTROLS)).toContain("copy.listAlwaysComplete");
  });
});

describe("2P-RELATION-003: focusing explains, and persists nothing", () => {
  it("filters the projection it was given rather than issuing a second read", () => {
    const view = code(VIEW);
    expect(view).toContain("projection.edges.items.filter");
    // A query here would be a second, quieter set of rules about what a reader
    // may see — and the first place an owner-scope predicate could go missing.
    expect(view).not.toMatch(/supabase|\.from\(/);
    expect(code(CONTROLS)).not.toMatch(/supabase|\.from\(/);
    expect(code(COMPACT)).not.toMatch(/supabase|\.from\(/);
  });

  it("writes nothing, anywhere on the surface", () => {
    // The plan's stop conditions name persisting a relation to improve a drawing.
    // Nothing here may insert, update, or reach a Server Action.
    for (const file of [VIEW, CONTROLS, COMPACT, PAGE]) {
      expect(code(file), file).not.toMatch(/"use server"|\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
    }
  });

  it("mutation control: the write detector fires on an insert and on a server module", () => {
    expect(/\.insert\(/.test('supabase.from("person_relationships").insert({})')).toBe(true);
    expect(/"use server"/.test('"use server";')).toBe(true);
  });

  it("validates the focused id against the reader's own projection", () => {
    // The property is that a foreign id, a non-person and nonsense take the same
    // arm, so the parameter cannot be used to test whether an id exists.
    expect(code(VIEW)).toContain("focusableNodes(projection).some((node) => node.id === value)");
  });

  it("builds every anchor from position, never from the edge key", () => {
    /*
     * `relationEdgeKey` embeds the stored relationship type — the owner's own
     * word about another person. An anchor built from it would put that word in
     * the DOM and, through a link, in the address bar and browser history.
     */
    expect(code(VIEW)).toContain("return `relation-${index + 1}`");
    for (const file of [COMPACT, `${FEATURE}/relation-list.tsx`]) {
      expect(code(file), file).not.toMatch(/id=\{`relation-\$\{edge\.key/);
      expect(code(file), file).not.toMatch(/#\$\{edge\.key/);
    }
  });

  it("mutation control: the anchor detector fires on a key-derived id", () => {
    expect(/id=\{`relation-\$\{edge\.key/.test("id={`relation-${edge.key}`}")).toBe(true);
  });
});

describe("2P-RELATION-004: the bounded readable representation really appears", () => {
  it("is hidden by default and shown at the narrow breakpoint", () => {
    const stylesheet = read(STYLESHEET);
    const base = stylesheet.indexOf(".relations-compact {");
    const narrow = stylesheet.indexOf("@media (max-width: 899px)");
    expect(base).toBeGreaterThan(-1);
    expect(narrow).toBeGreaterThan(-1);
    /*
     * The ordering IS the assertion. A media query written before the rule it
     * overrides adds no specificity, so the later base declaration wins and the
     * alternative is silently dead on every phone — a failure this repository
     * has already paid for once, and one only a rendered page catches.
     */
    expect(base).toBeLessThan(narrow);
    expect(stylesheet.slice(narrow)).toMatch(/\.relations-compact \{\s*display: block;/);
  });

  it("mutation control: the ordering assertion fails when the query comes first", () => {
    // The dead layout, written out: the override is declared before the rule it
    // overrides, so `display: none` wins and the compact list never appears.
    const mutated = "@media (max-width: 899px) { .relations-compact-inner { display: block; } }\n.relations-compact { display: none; }";
    const base = mutated.indexOf(".relations-compact {");
    const narrow = mutated.indexOf("@media (max-width: 899px)");
    expect(base).toBeGreaterThan(-1);
    expect(narrow).toBeGreaterThan(-1);
    // The assertion the real file passes is `base < narrow`. Here it does not.
    expect(base < narrow).toBe(false);
  });

  it("keeps the drawing itself, rather than replacing it on a phone", () => {
    // `2P-RELATION-004` asks for a bounded readable representation WHEN the graph
    // cannot fit, not for the picture to be taken away from phones.
    const stylesheet = read(STYLESHEET);
    const narrow = stylesheet.slice(stylesheet.indexOf("@media (max-width: 899px)"));
    expect(narrow).not.toMatch(/\.relations-canvas[^{]*\{[^}]*display:\s*none/);
    expect(narrow).not.toMatch(/\.relations-figure[^{]*\{[^}]*display:\s*none/);
  });

  it("takes its rows from the drawn subset, so it can neither add nor hide a link", () => {
    const compact = code(COMPACT);
    expect(compact).toContain("drawableEdges(projection)");
    // No second filter that could readmit what the drawing refuses.
    expect(compact).not.toContain("unattributableEdges");
  });

  it("mutation control: the subset detector fires when the compact list reads every edge", () => {
    expect("projection.edges.items".includes("drawableEdges(projection)")).toBe(false);
  });

  it("is not vacuous: `code()` really strips the comments these modules are full of", () => {
    // Each module above documents at length what it must not do. Without the
    // strip, every "must not write" assertion would find its own prose.
    expect(read(VIEW)).toContain("never a second query");
    expect(code(VIEW)).not.toContain("never a second query");
  });
});
