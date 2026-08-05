import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * `docs/` placement guard — the companion to `reports-taxonomy-guard.test.ts`.
 *
 * `docs/` holds two different kinds of document and the distinction is the whole
 * taxonomy:
 *
 *   * **Living canon** — the contract a reader must find without knowing any
 *     phase name: `STATE.md`, `TODO.md`, `DECISIONS.md`, `CHANGELOG.md`,
 *     `ENGINEERING_STANDARDS.md`, `ARCHITECTURE.md`, `DATABASE.md`,
 *     `AI_AGENT.md`, `SECURITY.md`, plus the whole-product `PRD.md` and
 *     `IMPLEMENTATION_PLAN.md`. These stay at the `docs/` root, and the list is
 *     closed.
 *   * **Governing artifacts** — one phase's or one initiative's PRD, plan,
 *     proposal or closing report. These live in `docs/initiatives/<name>/`,
 *     mirroring `docs/reports/<name>/` where that initiative's record lives.
 *
 * The pairing is the point: `docs/initiatives/byok/` says what BYOK was supposed
 * to do, `docs/reports/byok/` says what it did. A reader who knows one path
 * knows the other.
 *
 * As with the reports guard, nothing inside an initiative directory is
 * constrained, git history is never consulted, and a new initiative simply
 * creates its directory.
 */

const REPO = process.cwd();
const DOCS = "docs";
const INITIATIVES = "docs/initiatives";

/**
 * The only markdown files allowed directly in `docs/`. Every one is
 * whole-product and phase-independent; a document that belongs to one phase
 * never qualifies, however important that phase was.
 */
export const CANONICAL_DOCS = Object.freeze([
  "README.md",
  "AI_AGENT.md",
  "ARCHITECTURE.md",
  "CHANGELOG.md",
  "DATABASE.md",
  "DECISIONS.md",
  "ENGINEERING_STANDARDS.md",
  "IMPLEMENTATION_PLAN.md",
  "PRD.md",
  "SECURITY.md",
  "STATE.md",
  "TODO.md",
]);

const PLACEMENT_HINTS: ReadonlyArray<readonly [RegExp, string]> = Object.freeze([
  [/^PHASE_(\d[A-Z])_/i, "phase"],
  [/^PHASE_(\d)_/i, "phase"],
  [/^SPRINT_(\d)_(\d)_/i, "sprint"],
  [/^BYOK_/i, "byok"],
  [/^ENTITY_GRAPH_/i, "entity-graph"],
  [/^SIGNUP_HARDENING_/i, "signup-hardening"],
  [/^MY_BRAIN_/i, "product-ux"],
]);

const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function expectedInitiativeFor(name: string): string {
  for (const [pattern, kind] of PLACEMENT_HINTS) {
    const match = pattern.exec(name);
    if (!match) continue;
    if (kind === "phase") return `docs/initiatives/phase-${match[1].toLowerCase()}/`;
    if (kind === "sprint") return `docs/initiatives/sprint-${match[1]}-${match[2]}/`;
    return `docs/initiatives/${kind}/`;
  }
  return "docs/initiatives/<owning-phase-or-initiative>/";
}

/** Markdown files at the `docs/` root that the canon list does not name. */
export function misplacedRootDocs(root: string): string[] {
  const absolute = join(root, DOCS);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
    .map((entry) => entry.name)
    .filter((name) => !CANONICAL_DOCS.includes(name))
    .sort();
}

/**
 * Markdown filed directly in `docs/initiatives/` rather than in one of its
 * initiative directories. `README.md` is permitted there as an index.
 */
export function misplacedInitiativeDocs(root: string): string[] {
  const absolute = join(root, INITIATIVES);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
    .map((entry) => entry.name)
    .filter((name) => name !== "README.md")
    .sort();
}

/** Directories under `docs/` whose name is not lowercase kebab-case. */
export function nonKebabDocDirectories(root: string, relative = DOCS): string[] {
  const absolute = join(root, relative);
  if (!existsSync(absolute)) return [];
  const offenders: string[] = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const child = `${relative}/${entry.name}`;
    if (!KEBAB_CASE.test(entry.name)) offenders.push(child);
    offenders.push(...nonKebabDocDirectories(root, child));
  }
  return offenders;
}

export function docsPlacementFailureMessage(misplaced: readonly string[]): string {
  return [
    `${misplaced.length} document(s) sit directly in docs/, which holds only the living canon `
    + `(${CANONICAL_DOCS.join(", ")}).`,
    ...misplaced.map((name) => `  docs/${name}  ->  ${expectedInitiativeFor(name)}${name}`),
    "A phase's or an initiative's PRD, plan, proposal or closing report belongs in",
    "docs/initiatives/<name>/, mirroring docs/reports/<name>/. See docs/README.md.",
  ].join("\n");
}

function entriesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) found.push(...entriesUnder(join(dir, entry.name)));
    else found.push(entry.name);
  }
  return found;
}

/* -------------------------------------------------------------------------- */
/* The guard, applied to this repository                                       */
/* -------------------------------------------------------------------------- */

describe("docs placement", () => {
  it("holds nothing at its root but the living canon", () => {
    const misplaced = misplacedRootDocs(REPO);
    expect(misplaced, docsPlacementFailureMessage(misplaced)).toEqual([]);
  });

  it("keeps every canonical document actually present", () => {
    for (const name of CANONICAL_DOCS) {
      expect(existsSync(join(REPO, DOCS, name)), `docs/${name} is canon but absent`).toBe(true);
    }
  });

  it("files every governing artifact inside an initiative directory", () => {
    expect(misplacedInitiativeDocs(REPO)).toEqual([]);
  });

  it("names every directory in lowercase kebab-case", () => {
    expect(nonKebabDocDirectories(REPO)).toEqual([]);
  });

  it("gives every initiative directory at least one document", () => {
    const empty = readdirSync(join(REPO, INITIATIVES), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => entriesUnder(join(REPO, INITIATIVES, name)).length === 0);
    expect(empty).toEqual([]);
  });

  it("pairs each initiative that produced reports with its governing directory", () => {
    // The taxonomy's promise: knowing one path tells you the other. An
    // initiative may govern without having reported yet, but one that reported
    // and has no governing directory means an artifact was filed by guesswork.
    const governing = new Set(
      readdirSync(join(REPO, INITIATIVES), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name),
    );
    // Reported-only directories with no governing PRD in this repository, each
    // for a stated reason rather than by omission.
    const reportedWithoutGoverningDocs = new Set([
      "pre-2e",        // a hardening pass answering docs/reviews/, with no PRD of its own
      "phase-2g",      // a definition study; the phase is unauthorized and has no PRD
      "shared",        // initiative-independent governance material
    ]);
    const reported = readdirSync(join(REPO, "docs/reports"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => !reportedWithoutGoverningDocs.has(name));
    expect(reported.filter((name) => !governing.has(name))).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* The guard, applied to synthetic roots                                       */
/* -------------------------------------------------------------------------- */

const roots: string[] = [];

function guardRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "docs-taxonomy-"));
  roots.push(root);
  mkdirSync(join(root, INITIATIVES), { recursive: true });
  for (const name of CANONICAL_DOCS) writeFileSync(join(root, DOCS, name), "# fixture\n");
  return root;
}

describe("the docs placement guard itself", () => {
  afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });

  it("passes on a root holding only the canon", () => {
    expect(misplacedRootDocs(guardRoot())).toEqual([]);
  });

  it("fails on a phase PRD dropped in the docs root", () => {
    const root = guardRoot();
    writeFileSync(join(root, DOCS, "PHASE_2H_PRD.md"), "# PRD\n");
    expect(misplacedRootDocs(root)).toEqual(["PHASE_2H_PRD.md"]);
    expect(docsPlacementFailureMessage(misplacedRootDocs(root)))
      .toContain("docs/initiatives/phase-2h/PHASE_2H_PRD.md");
  });

  it("still fails, with generic advice, on a name matching no known initiative", () => {
    const root = guardRoot();
    writeFileSync(join(root, DOCS, "SOME_PROPOSAL.md"), "# proposal\n");
    expect(docsPlacementFailureMessage(misplacedRootDocs(root)))
      .toContain("docs/initiatives/<owning-phase-or-initiative>/");
  });

  it("routes each known prefix to its own initiative directory", () => {
    expect(expectedInitiativeFor("BYOK_PRD.md")).toBe("docs/initiatives/byok/");
    expect(expectedInitiativeFor("SIGNUP_HARDENING_PRD.md")).toBe("docs/initiatives/signup-hardening/");
    expect(expectedInitiativeFor("ENTITY_GRAPH_COMPLETION_PRD.md")).toBe("docs/initiatives/entity-graph/");
    expect(expectedInitiativeFor("MY_BRAIN_UX_ROADMAP.md")).toBe("docs/initiatives/product-ux/");
    expect(expectedInitiativeFor("PHASE_2X_PRD.md")).toBe("docs/initiatives/phase-2x/");
    expect(expectedInitiativeFor("PHASE_2_PLAN.md")).toBe("docs/initiatives/phase-2/");
    expect(expectedInitiativeFor("SPRINT_1_5_REPORT.md")).toBe("docs/initiatives/sprint-1-5/");
  });

  it("fails on a governing artifact left in docs/initiatives/ itself", () => {
    const root = guardRoot();
    writeFileSync(join(root, INITIATIVES, "PHASE_2H_PRD.md"), "# PRD\n");
    expect(misplacedInitiativeDocs(root)).toEqual(["PHASE_2H_PRD.md"]);
  });

  it("permits an index at docs/initiatives/README.md", () => {
    const root = guardRoot();
    writeFileSync(join(root, INITIATIVES, "README.md"), "# index\n");
    expect(misplacedInitiativeDocs(root)).toEqual([]);
  });

  it("does not constrain files inside an initiative directory", () => {
    const root = guardRoot();
    mkdirSync(join(root, INITIATIVES, "phase-2h"), { recursive: true });
    for (const name of ["PHASE_2H_PRD.md", "anything.md", "notes.txt"]) {
      writeFileSync(join(root, INITIATIVES, "phase-2h", name), "x\n");
    }
    expect(misplacedRootDocs(root)).toEqual([]);
    expect(misplacedInitiativeDocs(root)).toEqual([]);
    expect(nonKebabDocDirectories(root)).toEqual([]);
  });

  it("rejects a directory name that is not kebab-case, at any depth", () => {
    const root = guardRoot();
    mkdirSync(join(root, INITIATIVES, "Phase_2H"), { recursive: true });
    expect(nonKebabDocDirectories(root)).toEqual(["docs/initiatives/Phase_2H"]);
  });

  it("reads a missing docs directory as empty rather than throwing", () => {
    const root = mkdtempSync(join(tmpdir(), "docs-taxonomy-"));
    roots.push(root);
    expect(misplacedRootDocs(root)).toEqual([]);
    expect(misplacedInitiativeDocs(root)).toEqual([]);
    expect(nonKebabDocDirectories(root)).toEqual([]);
  });
});
