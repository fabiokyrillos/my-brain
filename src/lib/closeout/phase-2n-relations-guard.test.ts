/**
 * Phase 2N slice 2N.6 — the structural half of `2N-RELATION-002`…`-011` and
 * `2N-ACCESS-004`.
 *
 * Every assertion here has a **mutation control**: a second expectation showing
 * the detector refuses the thing it exists to refuse. A guard that only ever
 * passes is a guard nobody has proved, and this repository has already shipped
 * two of those.
 *
 * `code()` strips comments before every scan, for the reason the deletion guard
 * recorded: this slice's own modules explain at length what they must not do, so
 * a raw-text scan would find its own prose and pass. The control at the bottom
 * proves that stripping is real.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  OWNER_ASSOCIATION_ACTIONS,
  RELATION_EDGE_DIRECTED,
  RELATION_EDGE_KINDS,
  RELATION_NODE_TYPES,
} from "@/features/relations/contracts";
import { GOVERNED_SURFACES } from "@/features/sensitivity/contracts";

const REPO = join(__dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(REPO, relative), "utf8");
const code = (relative: string) =>
  read(relative).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const FEATURE = "src/features/relations";
const CATALOGUE = "docs/reports/phase-2n/PHASE_2N_SLICE_6_EDGE_CATALOG.md";
const PAGE = "src/app/[locale]/app/relations/page.tsx";
const LIST = `${FEATURE}/relation-list.tsx`;
const DIAGRAM = `${FEATURE}/relation-diagram.tsx`;
const DATA = `${FEATURE}/data.ts`;
const STYLESHEET = "src/app/relations.css";

function walk(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(join(REPO, dir))) {
    const full = join(dir, entry);
    if (statSync(join(REPO, full)).isDirectory()) walk(full, found);
    else found.push(full.replace(/\\/g, "/"));
  }
  return found;
}

const FEATURE_FILES = walk(FEATURE).filter((file) => !/\.test\.tsx?$/.test(file));

describe("2N-RELATION-006: the edge catalogue is closed, and the code is the catalogue", () => {
  it("admits five node types and five edge kinds, and no more", () => {
    expect(RELATION_NODE_TYPES).toHaveLength(5);
    expect(RELATION_EDGE_KINDS).toHaveLength(5);
    expect(Object.keys(RELATION_EDGE_DIRECTED).sort()).toEqual([...RELATION_EDGE_KINDS].sort());
  });

  it("refuses the three candidates the catalogue refused, by absence", () => {
    // A person-to-person edge would have to be synthesized; a record or file
    // node's label is governed content the drawing cannot carry.
    expect(RELATION_EDGE_KINDS as readonly string[]).not.toContain("person_person");
    for (const refused of ["record", "entry", "file", "attachment", "task", "memory"]) {
      expect(RELATION_NODE_TYPES as readonly string[]).not.toContain(refused);
    }
  });

  it("keeps the catalogue document, its verdict and the finding it rests on", () => {
    const document = read(CATALOGUE);
    expect(document).toContain("2N.6 AUTORIZÁVEL DENTRO DO CONTRATO EXISTENTE");
    // The load-bearing measurement. A later reader who deletes this sentence
    // deletes the reason the graph draws a subset.
    expect(document).toContain("link_interpreted_entities");
    expect(document).toContain("2N-RELATION-TRIGGER");
    expect(document).toContain("2N-FILES-WRITER");
  });

  it("mutation control: the catalogue assertions fail on a document without them", () => {
    const mutated = read(CATALOGUE).replaceAll("link_interpreted_entities", "something_else");
    expect(mutated).not.toContain("link_interpreted_entities");
  });
});

describe("2N-RELATION-003: this slice persists nothing and infers nothing", () => {
  it("creates no migration for itself", () => {
    const migrations = readdirSync(join(REPO, "supabase/migrations")).filter((file) => file.endsWith(".sql"));
    /*
     * Phase-qualified, and narrowed rather than weakened.
     *
     * A bare `graph` token matched `202607220044_phase_2c_slice_5_task_graph`
     * and its follow-up — Phase 2C's history, which this guard has no business
     * flagging. The lesson has been paid for three times in this phase already:
     * a scan for a generic word finds every phase that used it.
     */
    expect(migrations.filter((file) => /phase_2n_slice_6/i.test(file))).toEqual([]);
    // The phase's ceiling, restated where a slice could break it.
    expect(migrations).toHaveLength(96);
  });

  it("mutation control: the narrowed migration scan still refuses this slice's own", () => {
    expect(/phase_2n_slice_6/i.test("202608150095_phase_2n_slice_6_relations.sql")).toBe(true);
    // …and still allows the two files the bare token wrongly flagged.
    expect(/phase_2n_slice_6/i.test("202607220044_phase_2c_slice_5_task_graph.sql")).toBe(false);
    expect(/phase_2n_slice_6/i.test("202607220045_fix_task_graph_undo_affected_count.sql")).toBe(false);
  });

  it("holds no writer, no RPC and no server action anywhere in the feature", () => {
    for (const file of FEATURE_FILES) {
      const body = code(file);
      for (const forbidden of [".insert(", ".update(", ".delete(", ".upsert(", ".rpc(", '"use server"']) {
        expect(body, `${file} contains ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it("is reachable from no worker and no job", () => {
    for (const file of walk("supabase/functions")) {
      expect(read(file), `${file} reaches the relations feature`).not.toContain("features/relations");
    }
  });

  it("mutation control: the writer scan fails on a file that writes", () => {
    const planted = 'const x = supabase.from("person_projects").insert({});';
    expect(planted).toContain(".insert(");
  });

  it("mutation control: a comment does not satisfy the writer scan", () => {
    // The failure the deletion guard hit twice: a header explaining what the
    // module must not do contains the very token the scan looks for.
    const commented = "/* this module never calls .insert( on anything */\nconst x = 1;";
    expect(code === code).toBe(true);
    expect(commented.replace(/\/\*[\s\S]*?\*\//g, "")).not.toContain(".insert(");
    expect(commented).toContain(".insert(");
  });
});

describe("2N-RELATION-005/-010: no confidence reaches this surface", () => {
  it("selects no confidence column in the loader", () => {
    for (const selection of code(DATA).match(/\.select\("[^"]*"\)/g) ?? []) {
      expect(selection, "a select list names confidence").not.toContain("confidence");
    }
  });

  it("mutation control: the select scan catches one that does", () => {
    const planted = '.select("id,person_id,confidence")';
    expect(planted.match(/\.select\("[^"]*"\)/g)?.[0]).toContain("confidence");
  });

  it("the scan is narrow enough not to refuse the copy that explains the omission", () => {
    // `copy.ts` legitimately contains the word, in the sentence saying the
    // number is stored and not shown. Scanning whole files for it would flag a
    // correct file — the narrowing lesson, with its two-sided control.
    expect(code(`${FEATURE}/copy.ts`)).toContain("confidence");
    expect((code(`${FEATURE}/copy.ts`).match(/\.select\("[^"]*"\)/g) ?? [])).toEqual([]);
  });
});

describe("2N-RELATION-006/-007: `graph` joins the contract WITH its consumer", () => {
  it("admits the surface", () => {
    expect(GOVERNED_SURFACES).toContain("graph");
  });

  it("names exactly one module allowed to answer for it", () => {
    const callers = walk("src")
      .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
      .filter((file) => /resolveContent\(\s*\n?\s*["']graph["']/.test(code(file)));
    expect(callers).toEqual(["src/features/sensitivity/subject-derivation.ts"]);
  });

  it("ships a real consumer, so the rule is not a producer with no reader", () => {
    expect(code(LIST)).toContain('surface="graph"');
    expect(code(LIST)).toContain("<ProtectedContent");
    expect(code(LIST)).toContain("deriveFreeTextSensitivity");
  });

  it("makes the person page converge on the same posture for the same field", () => {
    const panel = code("src/features/entities/relationship-panel.tsx");
    expect(panel).toContain("<ProtectedContent");
    expect(panel).toContain('surface="person"');
    expect(panel).toContain("deriveFreeTextSensitivity");
  });

  it("mutation control: the consumer scan fails when the component stops asking", () => {
    const mutated = code(LIST).replace('surface="graph"', 'surface="work"');
    expect(mutated).not.toContain('surface="graph"');
  });
});

describe("2N-RELATION-007: one projection, two presentations, one bound", () => {
  it("gives both presentations the same value and no query of their own", () => {
    for (const file of [LIST, DIAGRAM]) {
      const body = code(file);
      expect(body, `${file} imports the loader`).not.toContain("./data");
      expect(body, `${file} holds a client`).not.toContain("supabase");
      expect(body).toContain('from "./projection"');
    }
  });

  it("reports the bound from the projection, once, and never from the drawing", () => {
    expect(code(LIST)).toContain("<BoundedNotice list={projection.edges}");
    // The drawing takes no second ceiling: a subset with its own limit would be
    // two numbers for one fact.
    expect(code(DIAGRAM)).not.toContain("BoundedNotice");
    expect(code(DIAGRAM)).not.toMatch(/\.slice\(/);
    expect(code(DIAGRAM)).not.toMatch(/LIMIT/);
  });

  it("holds no information the list does not: the drawing renders no free text", () => {
    for (const field of ["edge.description", "edge.role", "edge.since", "storedType"]) {
      expect(code(DIAGRAM), `the drawing renders ${field}`).not.toContain(field);
    }
  });

  it("renders the text alternative BEFORE the drawing, in the page's own order", () => {
    const page = code(PAGE);
    expect(page.indexOf("<RelationList")).toBeGreaterThan(-1);
    expect(page.indexOf("<RelationList")).toBeLessThan(page.indexOf("<RelationDiagram"));
  });

  it("mutation control: the order assertion fails when the drawing comes first", () => {
    const mutated = "<RelationDiagram /> <RelationList />";
    expect(mutated.indexOf("<RelationList")).toBeGreaterThan(mutated.indexOf("<RelationDiagram"));
  });
});

describe("2N-RELATION-006: bounded reads, and never one per node", () => {
  it("issues a fixed number of queries", () => {
    const body = code(DATA);
    expect(body.match(/supabase\s*\n?\s*\.from\(|supabase\.from\(/g) ?? []).toHaveLength(8);
  });

  it("issues none of them from inside an iteration", () => {
    const body = code(DATA);
    for (const iterator of [".map(", ".forEach(", ".flatMap("]) {
      for (const index of allIndexesOf(body, iterator)) {
        // Nothing that iterates may reach a client. The window is generous on
        // purpose: a query three lines into a callback is still a query per row.
        expect(body.slice(index, index + 400), `${iterator} reaches supabase`).not.toContain("supabase");
      }
    }
  });

  it("narrows the origin proof to the two creation actions, and no others", () => {
    expect([...OWNER_ASSOCIATION_ACTIONS]).toEqual([
      "associate_person_project",
      "associate_person_context",
    ]);
    // An edit or an end is an owner act on a link, not evidence they made it.
    for (const inferred of ["update_person_project_role", "end_person_project", "end_person_context"]) {
      expect(OWNER_ASSOCIATION_ACTIONS as readonly string[]).not.toContain(inferred);
    }
  });

  it("mutation control: the iteration scan catches a query inside a map", () => {
    const planted = "ids.map((id) => supabase.from('people').select('id').eq('id', id))";
    expect(planted.slice(planted.indexOf(".map("))).toContain("supabase");
  });
});

describe("2N-MOBILE-002 / 2N-ACCESS-001: nothing depends on hover, and focus reaches everything", () => {
  const stylesheet = read(STYLESHEET);

  it("pairs every hover rule with a focus-visible twin", () => {
    for (const selector of stylesheet.match(/^[^{}\n]*:hover[^{}\n]*\{/gm) ?? []) {
      const block = stylesheet.slice(stylesheet.indexOf(selector));
      expect(selector + block.slice(0, block.indexOf("}")), `${selector.trim()} has no focus twin`).toMatch(
        /:focus-visible/,
      );
    }
  });

  it("reveals nothing through hover — no generated content anywhere in the sheet", () => {
    /*
     * Narrowed, with the same lesson attached.
     *
     * A bare `content\s*:` matched `align-content: start` — a correct
     * declaration on a correct file. The property must be preceded by a
     * delimiter, which `align-content` is not.
     */
    expect(stylesheet).not.toMatch(/[;{\s]content\s*:/);
  });

  it("mutation control: the narrowed content scan still refuses generated text", () => {
    expect(/[;{\s]content\s*:/.test('.x:hover::after { content: "secret"; }')).toBe(true);
    expect(/[;{\s]content\s*:/.test(".x { align-content: start; }")).toBe(false);
  });

  it("scrolls the figure rather than the document", () => {
    expect(stylesheet).toContain(".relations-canvas-scroll");
    expect(stylesheet).toMatch(/\.relations-canvas-scroll\s*\{[^}]*overflow-x:\s*auto/);
  });

  it("keeps both presentations' targets at the touch minimum", () => {
    expect(stylesheet).toMatch(/\.relations-node-label\s*\{[^}]*min-height:\s*44px/);
    // The drawn node's height comes from the layout constant, asserted there.
    expect(stylesheet).toContain(".relations-node");
  });

  it("gates its only transition on a reduced-motion preference", () => {
    const transitions = stylesheet.match(/transition\s*:/g) ?? [];
    expect(transitions.length).toBeGreaterThan(0);
    const gated = stylesheet.slice(stylesheet.indexOf("@media (prefers-reduced-motion: no-preference)"));
    expect((gated.match(/transition\s*:/g) ?? []).length).toBe(transitions.length);
    expect(stylesheet).not.toMatch(/animation\s*:/);
  });

  it("mutation control: the hover pairing fails on a hover-only rule", () => {
    const planted = ".x:hover { color: red; }";
    const block = planted.slice(planted.indexOf(".x:hover"));
    expect(block.slice(0, block.indexOf("}"))).not.toMatch(/:focus-visible/);
  });
});

describe("no heavy visualization library was added", () => {
  it("adds no dependency at all for this surface", () => {
    const manifest = JSON.parse(read("package.json")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const names = [...Object.keys(manifest.dependencies), ...Object.keys(manifest.devDependencies)];
    for (const name of names) {
      expect(name, `${name} looks like a graph library`).not.toMatch(
        /^(d3|cytoscape|vis-network|reactflow|react-flow|sigma|graphology|force-graph|dagre|elkjs)/,
      );
    }
    expect(Object.keys(manifest.dependencies)).toHaveLength(12);
  });

  it("mutation control: the scan names a library it would refuse", () => {
    expect("cytoscape").toMatch(/^(d3|cytoscape|vis-network|reactflow|react-flow|sigma|graphology|force-graph|dagre|elkjs)/);
  });
});

describe("2N-RELATION-006: the surface stays out of primary navigation", () => {
  it("registers as a secondary destination", () => {
    const capabilities = code("src/features/shell/capabilities.ts");
    expect(capabilities).toMatch(
      /key:\s*"relations",\s*route:\s*"relations",\s*group:\s*"context",\s*visibility:\s*"more"/,
    );
  });

  it("mutation control: the scan fails if it is promoted", () => {
    const planted = 'key: "relations", route: "relations", group: "primary", visibility: "primary"';
    expect(planted).not.toMatch(
      /key:\s*"relations",\s*route:\s*"relations",\s*group:\s*"context",\s*visibility:\s*"more"/,
    );
  });
});

function allIndexesOf(haystack: string, needle: string): number[] {
  const found: number[] = [];
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    found.push(index);
    index = haystack.indexOf(needle, index + 1);
  }
  return found;
}
