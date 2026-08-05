import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * `docs/reports/` placement guard.
 *
 * The reports directory is a **per-initiative taxonomy**: every phase and every
 * named initiative owns one lowercase-kebab-case subdirectory, and its reports
 * live inside it. The failure this guard exists to prevent is the one that
 * produced the directory it now governs — 128 markdown files accumulated flat at
 * one level, where nothing was findable and two loops wrote two different
 * `AUTONOMOUS_LOOP_HANDOFF.md` files without seeing each other's.
 *
 * What it constrains, and what it deliberately does not
 * ----------------------------------------------------
 * It constrains exactly two things:
 *
 *   1. **The reports root.** Only the named cross-phase files below may sit
 *      directly in `docs/reports/`. Anything else must go into an owning
 *      directory, and the failure message names the one it should have used.
 *   2. **Directory naming.** Every directory under `docs/reports/` is lowercase
 *      kebab-case, at any depth, so placement stays predictable.
 *
 * It does **not** freeze the historical tree. A new phase adds its directory and
 * fills it freely; no file inside any initiative directory is constrained by
 * name, count or shape. That is the point: the rule has to be cheap enough that
 * a future loop follows it instead of routing around it.
 *
 * It reads the filesystem only. Git history is not available in every CI job and
 * would make "new file" mean "new since some ref" — a question this guard does
 * not need to ask, because the property is about where a file *is*, not when it
 * arrived.
 */

const REPO = process.cwd();
const REPORTS = "docs/reports";

/**
 * The only markdown files allowed directly in `docs/reports/`. Both are
 * genuinely cross-phase: the index that explains the taxonomy, and the durable
 * loop handoff that a fresh context must find without knowing any phase name.
 *
 * Adding to this list is a deliberate act. A report that belongs to one phase or
 * one initiative never qualifies, however important it is.
 */
export const CROSS_PHASE_ROOT_FILES = Object.freeze([
  "README.md",
  "AUTONOMOUS_LOOP_HANDOFF.md",
]);

/**
 * Filename prefix → owning directory. Used only to make a failure actionable;
 * an unrecognised name still fails, it just gets generic advice instead of a
 * named destination.
 */
const PLACEMENT_HINTS: ReadonlyArray<readonly [RegExp, string]> = Object.freeze([
  [/^PHASE_(\d[A-Z])_/i, "phase-$1 (lowercased)"],
  [/^PRE_2E_/i, "pre-2e"],
  [/^BYOK_/i, "byok"],
  [/^EGC_|^ENTITY_GRAPH_/i, "entity-graph"],
  [/^PRODUCT_UX_/i, "product-ux"],
  [/^SIGNUP_HARDENING_|^SIGNUP_ROLLOUT_|^SH_/i, "signup-hardening"],
]);

const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function expectedPlacementFor(name: string): string {
  for (const [pattern, directory] of PLACEMENT_HINTS) {
    const match = pattern.exec(name);
    if (!match) continue;
    return match[1] ? `docs/reports/phase-${match[1].toLowerCase()}/` : `docs/reports/${directory}/`;
  }
  return "docs/reports/<owning-phase-or-initiative>/";
}

/** Markdown files sitting directly in the reports root that no rule allows there. */
export function misplacedRootReports(root: string): string[] {
  const absolute = join(root, REPORTS);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
    .map((entry) => entry.name)
    .filter((name) => !CROSS_PHASE_ROOT_FILES.includes(name))
    .sort();
}

/** Every directory at or below the reports root whose name is not kebab-case. */
export function nonKebabDirectories(root: string, relative = REPORTS): string[] {
  const absolute = join(root, relative);
  if (!existsSync(absolute)) return [];
  const offenders: string[] = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const child = `${relative}/${entry.name}`;
    if (!KEBAB_CASE.test(entry.name)) offenders.push(child);
    offenders.push(...nonKebabDirectories(root, child));
  }
  return offenders;
}

export function placementFailureMessage(misplaced: readonly string[]): string {
  return [
    `${misplaced.length} report(s) sit directly in docs/reports/, which holds only cross-phase files `
    + `(${CROSS_PHASE_ROOT_FILES.join(", ")}).`,
    ...misplaced.map((name) => `  docs/reports/${name}  ->  ${expectedPlacementFor(name)}${name}`),
    "Every phase and initiative owns one lowercase-kebab-case directory; create it before the first",
    "report is committed. See docs/reports/README.md.",
  ].join("\n");
}

/* -------------------------------------------------------------------------- */
/* The guard, applied to this repository                                       */
/* -------------------------------------------------------------------------- */

describe("docs/reports placement", () => {
  it("holds nothing at its root but the named cross-phase files", () => {
    const misplaced = misplacedRootReports(REPO);
    expect(misplaced, placementFailureMessage(misplaced)).toEqual([]);
  });

  it("keeps every cross-phase root file actually present", () => {
    // A stale allowlist is a silently weakened guard: an entry naming a file
    // that no longer exists would keep permitting that name forever.
    for (const name of CROSS_PHASE_ROOT_FILES) {
      expect(existsSync(join(REPO, REPORTS, name)), `${REPORTS}/${name} is allowlisted but absent`).toBe(true);
    }
  });

  it("names every directory in lowercase kebab-case", () => {
    expect(nonKebabDirectories(REPO)).toEqual([]);
  });

  it("gives every initiative directory at least one report", () => {
    // An empty directory is documentation for its own sake; the rule is that a
    // directory is created *for* a report, not in advance of one.
    const empty = readdirSync(join(REPO, REPORTS), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => filesUnder(join(REPO, REPORTS, name)).length === 0);
    expect(empty).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* The guard, applied to synthetic roots                                       */
/* -------------------------------------------------------------------------- */

const roots: string[] = [];

function guardRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "reports-taxonomy-"));
  roots.push(root);
  mkdirSync(join(root, REPORTS), { recursive: true });
  for (const name of CROSS_PHASE_ROOT_FILES) writeFileSync(join(root, REPORTS, name), "# fixture\n");
  return root;
}

describe("the placement guard itself", () => {
  afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });

  it("passes on a root holding only the cross-phase files", () => {
    expect(misplacedRootReports(guardRoot())).toEqual([]);
  });

  it("fails on a new markdown file dropped in the reports root", () => {
    const root = guardRoot();
    writeFileSync(join(root, REPORTS, "PHASE_2H_SLICE_01_REPORT.md"), "# report\n");
    expect(misplacedRootReports(root)).toEqual(["PHASE_2H_SLICE_01_REPORT.md"]);
  });

  it("names the destination the misplaced file should have used", () => {
    const message = placementFailureMessage(["PHASE_2H_SLICE_01_REPORT.md"]);
    expect(message).toContain("docs/reports/phase-2h/PHASE_2H_SLICE_01_REPORT.md");
  });

  it("still fails, with generic advice, on a name matching no known initiative", () => {
    const root = guardRoot();
    writeFileSync(join(root, REPORTS, "SOME_UNTAGGED_FINDING.md"), "# finding\n");
    expect(misplacedRootReports(root)).toEqual(["SOME_UNTAGGED_FINDING.md"]);
    expect(placementFailureMessage(misplacedRootReports(root)))
      .toContain("docs/reports/<owning-phase-or-initiative>/");
  });

  it("routes each known initiative prefix to its own directory", () => {
    expect(expectedPlacementFor("BYOK_SLICE_06_ACCEPTANCE.md")).toBe("docs/reports/byok/");
    expect(expectedPlacementFor("SIGNUP_HARDENING_SLICE_08_ACCEPTANCE.md")).toBe("docs/reports/signup-hardening/");
    expect(expectedPlacementFor("SH_DELETE_016_MANIFEST.md")).toBe("docs/reports/signup-hardening/");
    expect(expectedPlacementFor("EGC_SLICE_03_ACCEPTANCE.md")).toBe("docs/reports/entity-graph/");
    expect(expectedPlacementFor("ENTITY_GRAPH_FINDINGS.md")).toBe("docs/reports/entity-graph/");
    expect(expectedPlacementFor("PRODUCT_UX_FOLLOWUP.md")).toBe("docs/reports/product-ux/");
    expect(expectedPlacementFor("PRE_2E_ANYTHING.md")).toBe("docs/reports/pre-2e/");
    expect(expectedPlacementFor("PHASE_2G_SLICE_01_REPORT.md")).toBe("docs/reports/phase-2g/");
  });

  it("does not constrain files inside an initiative directory", () => {
    // The historical tree must not be frozen: a phase directory takes whatever
    // its phase produced, under whatever names that phase used.
    const root = guardRoot();
    mkdirSync(join(root, REPORTS, "phase-2h"), { recursive: true });
    for (const name of ["anything.md", "PHASE_2H_SLICE_01_REPORT.md", "notes.txt"]) {
      writeFileSync(join(root, REPORTS, "phase-2h", name), "x\n");
    }
    expect(misplacedRootReports(root)).toEqual([]);
    expect(nonKebabDirectories(root)).toEqual([]);
  });

  it("rejects a directory name that is not kebab-case, at any depth", () => {
    const root = guardRoot();
    mkdirSync(join(root, REPORTS, "Phase_2H", "Sub Dir"), { recursive: true });
    expect(nonKebabDirectories(root)).toEqual([
      "docs/reports/Phase_2H",
      "docs/reports/Phase_2H/Sub Dir",
    ]);
  });

  it("reads a missing reports directory as empty rather than throwing", () => {
    const root = mkdtempSync(join(tmpdir(), "reports-taxonomy-"));
    roots.push(root);
    expect(misplacedRootReports(root)).toEqual([]);
    expect(nonKebabDirectories(root)).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Repository-local markdown links resolve                                     */
/* -------------------------------------------------------------------------- */

const LINK_SKIP = new Set(["node_modules", ".git", ".next", "build", "coverage", "test-results", "playwright-report"]);
const MARKDOWN_LINK = /\[[^\]]*\]\(([^)\s]+)\)/g;

function filesUnder(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (LINK_SKIP.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) filesUnder(path, out);
    else out.push(path);
  }
  return out;
}

/**
 * Every repository-local markdown link, resolved. A link is accepted if it
 * resolves relative to its own file **or** relative to the repository root —
 * both forms are in use here, and the VS Code convention in `CLAUDE.md` is the
 * root-relative one.
 */
export function brokenLocalLinks(root: string): string[] {
  const broken: string[] = [];
  for (const file of filesUnder(root).filter((path) => path.endsWith(".md"))) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(MARKDOWN_LINK)) {
      const raw = match[1].trim();
      if (/^(https?:|mailto:|#|<|`)/i.test(raw) || raw.includes("${")) continue;
      const target = raw.split("#")[0].split("?")[0].trim();
      if (!target) continue;
      if (existsSync(resolve(dirname(file), target)) || existsSync(resolve(root, target))) continue;
      broken.push(`${file.slice(root.length + 1).split(sep).join("/")} -> ${raw}`);
    }
  }
  return broken;
}

describe("repository-local markdown links", () => {
  it("all resolve", () => {
    const broken = brokenLocalLinks(REPO);
    expect(broken, `broken markdown links:\n${broken.join("\n")}`).toEqual([]);
  });

  it("detects a link that does not resolve", () => {
    const root = guardRoot();
    writeFileSync(join(root, REPORTS, "README.md"), "See [gone](./phase-2h/GONE.md).\n");
    expect(brokenLocalLinks(root)).toEqual(["docs/reports/README.md -> ./phase-2h/GONE.md"]);
  });
});
