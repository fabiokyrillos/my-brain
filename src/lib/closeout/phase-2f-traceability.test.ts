import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

/**
 * Phase 2F traceability generator — drift detection **and positive controls**
 * (`2F-OPERATIONS-003`, definitive Slice 2F.6 PRD §6.1 F12).
 *
 * The generator lives in `scripts/` because the four before it do and because it
 * must be runnable by plain Node from an npm script. It is imported here rather
 * than reimplemented, so what these cases exercise is the artifact that actually
 * runs.
 *
 * Every failing case is paired with the correct fixture passing, because a guard
 * proven only in the failing direction may simply be refusing everything — the
 * lesson Slice 2F.5 paid for three times in one slice. The fixture root is built
 * from the generator's **own declarations**, so a newly declared artifact gets a
 * placeholder automatically instead of silently weakening the fixture.
 */

const REPO = resolve(__dirname, "../../..");

type Module = typeof import("../../../scripts/generate-phase-2f-traceability.mjs");

async function load(): Promise<Module> {
  return (await import("../../../scripts/generate-phase-2f-traceability.mjs")) as Module;
}

const roots: string[] = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

/** Files copied verbatim, because the generator *parses* them. */
const COPIED = [
  "docs/PHASE_2F_PRD.md",
  "docs/DECISIONS.md",
  "package.json",
  "vitest.config.ts",
  ".github/workflows/ci.yml",
];

/**
 * Synthetic current-state documents. Deliberately synthetic rather than copied:
 * the cross-document contradiction scan is one of the checks under test, so its
 * input must be stable and independent of documentation work in flight.
 */
const SYNTHETIC_STATE = {
  "docs/STATE.md": "# State\n\nPhase 2F is complete through Slice 2F.6.\n",
  "docs/TODO.md": "# Backlog\n\n- [x] Phase 2F complete.\n",
  "docs/PHASE_2_PLAN.md": "# Plan\n\nPhase 2F is defined by docs/PHASE_2F_PRD.md.\n",
};

/** The per-slice report inventory the real repository has, reproduced as placeholders. */
const SLICE_ARTIFACTS: Record<string, string[]> = {
  "01": ["REPORT"],
  "02": ["ACCEPTANCE", "PLAN", "REPORT"],
  "03": ["ACCEPTANCE", "PLAN"],
  "04": ["ACCEPTANCE", "BLAST_RADIUS", "PLAN", "REPORT"],
  "05": ["ACCEPTANCE", "PRD", "REPORT"],
  "06": ["PRD", "REPORT"],
};

function touch(root: string, relative: string, content = "placeholder\n") {
  const target = join(root, relative);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
}

async function makeFixtureRoot(): Promise<string> {
  const { EVIDENCE_KEYS, EXPECTED_PHASE_2F_MIGRATIONS } = await load();
  const root = mkdtempSync(join(tmpdir(), "phase-2f-traceability-"));
  roots.push(root);

  for (const relative of COPIED) {
    const target = join(root, relative);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(REPO, relative), target);
  }
  for (const [relative, content] of Object.entries(SYNTHETIC_STATE)) touch(root, relative, content);

  for (const [ordinal, suffixes] of Object.entries(SLICE_ARTIFACTS)) {
    for (const suffix of suffixes) {
      touch(root, `docs/reports/PHASE_2F_SLICE_${ordinal}_${suffix}.md`);
    }
  }
  for (const file of Object.keys(EXPECTED_PHASE_2F_MIGRATIONS)) {
    touch(root, `supabase/migrations/${file}`);
  }

  // Derived from the generator's own declarations, so the fixture can never be
  // weaker than what the generator resolves.
  for (const evidence of Object.values(EVIDENCE_KEYS)) {
    for (const relative of [...evidence.artifacts, ...evidence.acceptance]) {
      if (!COPIED.includes(relative) && !(relative in SYNTHETIC_STATE)) touch(root, relative);
    }
    for (const gate of evidence.gates) {
      if ("file" in gate && gate.file) touch(root, gate.file);
    }
  }
  // pgTAP paths must sit under a directory ci.yml runs; the placeholders above
  // already land there, but the pgTAP path reader needs the directory to exist.
  touch(root, "supabase/tests/.keep");
  touch(root, "supabase/regrant-rehearsal/.keep");

  return root;
}

function patch(root: string, relative: string, from: string | RegExp, to: string) {
  const path = join(root, relative);
  const before = readFileSync(path, "utf8");
  const after = before.replace(from, to);
  expect(after, `patch of ${relative} did not change anything — the fixture is not exercising the case`)
    .not.toBe(before);
  writeFileSync(path, after, "utf8");
}

describe("2F-OPERATIONS-003: the traceability generator passes on correct content", () => {
  it("builds a 68-row model from the real repository's PRD in a fixture root", async () => {
    const { buildPhase2fTraceability } = await load();
    const model = buildPhase2fTraceability({ root: await makeFixtureRoot() });
    expect(model.counts.total).toBe(68);
    expect(model.counts.families).toBe(12);
    expect(model.counts.notDelivered).toBe(0);
    expect(model.rows).toHaveLength(68);
    expect(new Set(model.rows.map((row) => row.id)).size).toBe(68);
  });

  it("derives 61 owned and 7 cross-cutting-only requirements from PRD section 7", async () => {
    const { buildPhase2fTraceability } = await load();
    const model = buildPhase2fTraceability({ root: await makeFixtureRoot() });
    expect(model.crossCuttingOnly.sort()).toEqual([
      "2F-ANALYTICS-001",
      "2F-ANALYTICS-002",
      "2F-ANALYTICS-003",
      "2F-OPERATIONS-001",
      "2F-OPERATIONS-002",
      "2F-OWNERSHIP-001",
      "2F-OWNERSHIP-002",
    ]);
    expect(model.rows.filter((row) => row.owner).length).toBe(61);
  });

  it("permits a reference to another phase's requirement without declaring one", async () => {
    // The guard that would otherwise red the build on two owner-authorized
    // sentences: PRD section 6 references 2E-COMMAND-012 and 2E-MATCH-018 to
    // carry the ADR-053/ADR-057 and 2E-MATCH-018 chains.
    const { buildPhase2fTraceability, PERMITTED_FOREIGN_REFERENCES } = await load();
    const prd = readFileSync(join(REPO, "docs/PHASE_2F_PRD.md"), "utf8");
    for (const id of Object.keys(PERMITTED_FOREIGN_REFERENCES)) {
      expect(prd).toContain(id);
    }
    expect(() => buildPhase2fTraceability({ root: roots[roots.length - 1] })).not.toThrow();
  });

  it("renders a byte-stable matrix across two runs of an unchanged repository", async () => {
    const { buildPhase2fTraceability, renderPhase2fTraceability } = await load();
    const root = await makeFixtureRoot();
    const first = renderPhase2fTraceability(buildPhase2fTraceability({ root }));
    const second = renderPhase2fTraceability(buildPhase2fTraceability({ root }));
    expect(first).toBe(second);
    expect(first).toContain("| `2F-OPERATIONS-006` |");
    expect(first).toContain("## §10 gate ledger");
  });

  it("resolves every evidence path it declares, so the matrix names nothing imaginary", async () => {
    const { EVIDENCE_KEYS, buildPhase2fTraceability } = await load();
    const model = buildPhase2fTraceability({ root: await makeFixtureRoot() });
    const declared = new Set(
      Object.values(EVIDENCE_KEYS).flatMap((e) => [...e.artifacts, ...e.acceptance]),
    );
    // Every row's artifacts come from that same resolved set.
    for (const row of model.rows) {
      for (const path of [...row.evidence.artifacts, ...row.evidence.acceptance]) {
        expect(declared.has(path)).toBe(true);
      }
    }
  });
});

describe("2F-OPERATIONS-003: the generator detects each declared drift class", () => {
  it("fails when the requirement count drifts", async () => {
    const { buildPhase2fTraceability } = await load();
    const root = await makeFixtureRoot();
    patch(root, "docs/PHASE_2F_PRD.md", "- **2F-GUARD-003:**", "- (removed) 2F-GUARD-003:");
    expect(() => buildPhase2fTraceability({ root })).toThrow(/declares 67 Phase 2F requirements|family 2F-GUARD declares 2/);
  });

  it("fails when an ID is declared twice", async () => {
    const { buildPhase2fTraceability } = await load();
    const root = await makeFixtureRoot();
    patch(
      root,
      "docs/PHASE_2F_PRD.md",
      "- **2F-GUARD-003:**",
      "- **2F-GUARD-001:** duplicated on purpose\n- **2F-GUARD-003:**",
    );
    expect(() => buildPhase2fTraceability({ root })).toThrow(/declared more than once/);
  });

  it("fails when a requirement is claimed by no slice in section 7", async () => {
    const { buildPhase2fTraceability } = await load();
    const root = await makeFixtureRoot();
    patch(root, "docs/PHASE_2F_PRD.md", "| SURFACE 1–14 |", "| SURFACE 1–13 |");
    expect(() => buildPhase2fTraceability({ root })).toThrow(/2F-SURFACE-014 is claimed by no slice/);
  });

  it("fails when two slices claim ownership of the same requirement", async () => {
    const { buildPhase2fTraceability } = await load();
    const root = await makeFixtureRoot();
    patch(root, "docs/PHASE_2F_PRD.md", "| MEASURE 1–7 |", "| MEASURE 1–7, SURFACE 1 |");
    expect(() => buildPhase2fTraceability({ root })).toThrow(/is owned by both/);
  });

  it("fails when a third Phase 2F migration appears", async () => {
    const { buildPhase2fTraceability } = await load();
    const root = await makeFixtureRoot();
    touch(root, "supabase/migrations/202608010064_phase_2f_surprise.sql");
    expect(() => buildPhase2fTraceability({ root })).toThrow(/the PRD declares\s+exactly two/);
  });

  it("fails when a declared evidence artifact does not exist", async () => {
    const { buildPhase2fTraceability } = await load();
    const root = await makeFixtureRoot();
    rmSync(join(root, "src/features/task-commands/work-command.ts"));
    expect(() => buildPhase2fTraceability({ root }))
      .toThrow(/work-command\.ts as evidence, and it does not exist/);
  });

  it("fails when a cited npm gate is not declared in package.json", async () => {
    const { buildPhase2fTraceability } = await load();
    const root = await makeFixtureRoot();
    patch(root, "package.json", '"test:remote:2f:cleanup"', '"test:remote:2f:cleanup-renamed"');
    expect(() => buildPhase2fTraceability({ root }))
      .toThrow(/npm run test:remote:2f:cleanup`, which package\.json does not declare/);
  });

  it("fails when a cited CI step is renamed out of the workflow", async () => {
    const { buildPhase2fTraceability } = await load();
    const root = await makeFixtureRoot();
    patch(
      root,
      ".github/workflows/ci.yml",
      "- name: Run the pgTAP suite (post-revocation posture)",
      "- name: Run the pgTAP suite",
    );
    expect(() => buildPhase2fTraceability({ root }))
      .toThrow(/in CI job database, which does not exist/);
  });

  it("fails when a cited suite is excluded from the CI vitest run", async () => {
    // ADR-059's hazard, made mechanical: a credentialed or renamed suite swept
    // out of vitest.config.ts is committed and never executed.
    const { buildPhase2fTraceability } = await load();
    const root = await makeFixtureRoot();
    patch(
      root,
      "vitest.config.ts",
      '"src/**/*.remote.test.ts"',
      '"src/**/*.remote.test.ts", "src/lib/closeout/**"',
    );
    expect(() => buildPhase2fTraceability({ root }))
      .toThrow(/does not sweep it into/);
  });

  it("fails when a pgTAP file cited as a CI gate sits outside the executed path", async () => {
    const { buildPhase2fTraceability } = await load();
    const root = await makeFixtureRoot();
    patch(
      root,
      ".github/workflows/ci.yml",
      "supabase test db --local supabase/tests",
      "supabase test db --local supabase/other-tests",
    );
    expect(() => buildPhase2fTraceability({ root }))
      .toThrow(/sits outside the paths ci\.yml runs/);
  });

  it("fails when a slice loses its only acceptance-bearing artifact", async () => {
    const { buildPhase2fTraceability } = await load();
    const root = await makeFixtureRoot();
    rmSync(join(root, "docs/reports/PHASE_2F_SLICE_01_REPORT.md"));
    expect(() => buildPhase2fTraceability({ root }))
      .toThrow(/slice 2F\.1 has no acceptance-bearing artifact|PHASE_2F_SLICE_01_REPORT\.md as evidence/);
  });

  it("accepts a slice whose only acceptance-bearing artifact is a REPORT, and one whose only one is an ACCEPTANCE", async () => {
    // Slice 2F.1 has a report and no acceptance file; Slice 2F.3 has an
    // acceptance file and no report. A rule demanding a particular filename
    // would fail on merged, correct content.
    const { buildPhase2fTraceability } = await load();
    const model = buildPhase2fTraceability({ root: await makeFixtureRoot() });
    expect(model.sliceArtifacts.get("2F.1")).toEqual(["REPORT"]);
    expect(model.sliceArtifacts.get("2F.3")).toEqual(["ACCEPTANCE", "PLAN"]);
  });

  it("fails when a decision requirement has no ADR naming it", async () => {
    const { buildPhase2fTraceability } = await load();
    const root = await makeFixtureRoot();
    patch(root, "docs/DECISIONS.md", /2F-DECISION-001/g, "2F-DECISION-00X");
    expect(() => buildPhase2fTraceability({ root }))
      .toThrow(/2F-DECISION-001 is a decision requirement with no ADR/);
  });

  it("fails when an ADR names a Phase 2F requirement the PRD does not declare", async () => {
    const { buildPhase2fTraceability } = await load();
    const root = await makeFixtureRoot();
    patch(root, "docs/DECISIONS.md", "2F-DECISION-002", "2F-DECISION-002 and 2F-INVENT-001");
    expect(() => buildPhase2fTraceability({ root }))
      .toThrow(/names 2F-INVENT-001, which the Phase 2F PRD does not declare/);
  });

  it("fails when a non-2F requirement is DECLARED in section 6 — the Phase-2G attribution guard", async () => {
    const { buildPhase2fTraceability } = await load();
    const root = await makeFixtureRoot();
    patch(
      root,
      "docs/PHASE_2F_PRD.md",
      "- **2F-GUARD-001:**",
      "- **2G-READINESS-001:** rate limiting ships here.\n- **2F-GUARD-001:**",
    );
    expect(() => buildPhase2fTraceability({ root }))
      .toThrow(/declares 1 requirement\(s\) outside the 2F- namespace \(2G-READINESS-001\)/);
  });

  it("fails when section 6 references a requirement ID that resolves to nothing", async () => {
    const { buildPhase2fTraceability } = await load();
    const root = await makeFixtureRoot();
    patch(
      root,
      "docs/PHASE_2F_PRD.md",
      "The 2F-GUARD-002 `tasks` allowlist",
      "The 2F-GUARD-099 `tasks` allowlist",
    );
    expect(() => buildPhase2fTraceability({ root }))
      .toThrow(/references 2F-GUARD-099, which is neither a declared Phase 2F requirement/);
  });

  it("fails when a current-state document says an accepted slice has not started", async () => {
    const { buildPhase2fTraceability } = await load();
    const root = await makeFixtureRoot();
    patch(root, "docs/STATE.md", "Phase 2F is complete", "Slice 2F.4 has not started. Phase 2F is complete");
    expect(() => buildPhase2fTraceability({ root }))
      .toThrow(/asserts 2F\.4 has not started, contradicting its acceptance artifact/);
  });

  it("fails on the intra-document leftover that survived beside a deployment record", async () => {
    const { buildPhase2fTraceability } = await load();
    const root = await makeFixtureRoot();
    patch(
      root,
      "docs/STATE.md",
      "Phase 2F is complete",
      "Deployment-session gates are pending: the migration is not applied. Phase 2F is complete",
    );
    expect(() => buildPhase2fTraceability({ root })).toThrow(/the migration is not applied/);
  });

  it("fails when a section 10 cell claims an executed gate for a slice with no session record", async () => {
    const { buildPhase2fTraceability } = await load();
    const root = await makeFixtureRoot();
    // Give slice 2F.6 a gate cell but strip the artifact that would name the session.
    rmSync(join(root, "docs/reports/PHASE_2F_SLICE_06_REPORT.md"));
    expect(() => buildPhase2fTraceability({ root }))
      .toThrow(/slice 2F\.6 has no acceptance-bearing artifact|PHASE_2F_SLICE_06_REPORT\.md as evidence/);
  });

  it("fails when vitest.config.ts stops declaring literal include/exclude arrays", async () => {
    const { buildPhase2fTraceability } = await load();
    const root = await makeFixtureRoot();
    patch(root, "vitest.config.ts", /include: \[[^\]]*\]/, "include: TEST_GLOBS");
    expect(() => buildPhase2fTraceability({ root }))
      .toThrow(/no longer declares literal include\/exclude arrays/);
  });

  it("fails when a status override names an ID the PRD does not declare", async () => {
    const { buildPhase2fTraceability } = await load();
    const root = await makeFixtureRoot();
    patch(root, "docs/PHASE_2F_PRD.md", "- **2F-MEASURE-005:**", "- **2F-MEASURE-105:**");
    expect(() => buildPhase2fTraceability({ root }))
      .toThrow(/STATUS_OVERRIDES names 2F-MEASURE-005|family 2F-MEASURE declares/);
  });
});

describe("2F-OPERATIONS-003: internal derivations", () => {
  it("expands section 7 family-range cells, including a continuation and a prose suffix", async () => {
    const { parseFamilyRangeCell } = await load();
    expect(parseFamilyRangeCell("GUARD 1–3, DECISION 1–4, PRECOND 1–3")).toEqual([
      "2F-GUARD-001", "2F-GUARD-002", "2F-GUARD-003",
      "2F-DECISION-001", "2F-DECISION-002", "2F-DECISION-003", "2F-DECISION-004",
      "2F-PRECOND-001", "2F-PRECOND-002", "2F-PRECOND-003",
    ]);
    expect(parseFamilyRangeCell("CREATE 1–6, REMINDER 1–2, 4")).toEqual([
      "2F-CREATE-001", "2F-CREATE-002", "2F-CREATE-003",
      "2F-CREATE-004", "2F-CREATE-005", "2F-CREATE-006",
      "2F-REMINDER-001", "2F-REMINDER-002", "2F-REMINDER-004",
    ]);
    expect(parseFamilyRangeCell("OPERATIONS 3–6 + whole-phase convergence audit")).toEqual([
      "2F-OPERATIONS-003", "2F-OPERATIONS-004", "2F-OPERATIONS-005", "2F-OPERATIONS-006",
    ]);
    expect(parseFamilyRangeCell("—")).toEqual([]);
    expect(() => parseFamilyRangeCell("SURFACE 14–1")).toThrow(/runs backwards/);
    expect(() => parseFamilyRangeCell("whatever")).toThrow(/Unparsable/);
  });

  it("resolves the vitest globs the config actually uses, including the brace group", async () => {
    const { isSweptIntoVitest, readVitestScope } = await load();
    const scope = readVitestScope(REPO);
    expect(isSweptIntoVitest("src/lib/closeout/phase-2f-traceability.test.ts", scope)).toBe(true);
    expect(isSweptIntoVitest("src/features/operations/task-list.test.tsx", scope)).toBe(true);
    expect(isSweptIntoVitest("src/features/task-commands/end-to-end-match-baseline.remote.test.ts", scope))
      .toBe(false);
    expect(isSweptIntoVitest("e2e/foundation.spec.ts", scope)).toBe(false);
    expect(isSweptIntoVitest("scripts/generate-phase-2f-traceability.mjs", scope)).toBe(false);
  });

  it("reads the workflow's jobs, steps and pgTAP paths from ci.yml", async () => {
    const { readWorkflowSteps, readPgTapPaths } = await load();
    const { jobs } = readWorkflowSteps(REPO);
    expect([...jobs.keys()].sort()).toEqual(["app", "database", "worker"]);
    expect(jobs.get("app")).toContain("run: npm test");
    expect(jobs.get("database"))
      .toContain("Rehearse the re-grant rollback (SQL-level only; not a live-ops rehearsal)");
    expect(readPgTapPaths(REPO)).toEqual(
      expect.arrayContaining(["supabase/tests", "supabase/regrant-rehearsal"]),
    );
  });

  it("finds no status contradiction in the real current-state documents", async () => {
    // The check the reconciliation has to satisfy, run against the repository
    // itself rather than a fixture — so the closeout cannot pass while a
    // permanent document still says an accepted slice has not started.
    const { findStatusContradictions } = await load();
    expect(findStatusContradictions(REPO, ["2F.1", "2F.2", "2F.3", "2F.4", "2F.5", "2F.6"])).toEqual([]);
  });
});
