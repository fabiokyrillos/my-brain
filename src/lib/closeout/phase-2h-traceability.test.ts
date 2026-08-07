/**
 * `2H-CLOSE-001` and `2H-CLOSE-002` — the guard over the traceability generator.
 *
 * ## Why the fixtures exist
 *
 * A fail-closed generator that has only ever been run against a repository where
 * everything is fine has demonstrated nothing. It might refuse correctly; it
 * might also be incapable of producing a finding at all, and the two are
 * indistinguishable from a green run. This repository has already published two
 * wrong verdicts behind an always-passing control, so every rule the generator
 * implements gets a fixture repository carrying **exactly one** deliberate
 * defect, and the real repository runs as the positive control.
 *
 * Each fixture is a temporary directory with the two files the generator reads —
 * a PRD and a reports directory — plus a migrations directory. One thing is
 * wrong in each. A fixture that produced *two* findings would prove less, not
 * more: it could not tell you which rule fired.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  MIGRATION_ALLOCATION,
  MIGRATION_BUDGET,
  PARTIAL,
  REPORTS_DIR,
  UNDELIVERED,
  citedIds,
  findings,
  migrationFindings,
  parseRequirements,
  phaseMigrations,
  renderMatrix,
} from "../../../scripts/generate-phase-2h-traceability.mjs";

const REPO = process.cwd();
const roots: string[] = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

type Fixture = {
  /** Requirement ids the fake PRD declares. */
  readonly declared?: readonly string[];
  /** Requirement ids the fake acceptance record cites. */
  readonly cited?: readonly string[];
  /** Migration file names, defaulting to the real allocation. */
  readonly migrations?: readonly string[];
  /** Replace the PRD body wholesale, for the broken-extraction fixtures. */
  readonly prdBody?: string;
  /** Omit the acceptance record entirely. */
  readonly noRecords?: boolean;
};

/** A repository shaped like the real one, with whatever defect is asked for. */
function fixture(spec: Fixture = {}): string {
  const root = mkdtempSync(join(tmpdir(), "phase-2h-trace-"));
  roots.push(root);

  mkdirSync(join(root, "docs/initiatives/phase-2h"), { recursive: true });
  mkdirSync(join(root, REPORTS_DIR), { recursive: true });
  mkdirSync(join(root, "supabase/migrations"), { recursive: true });

  const declared = spec.declared ?? ["2H-DEPLOY-001", "2H-RETENTION-001"];
  const body =
    spec.prdBody ??
    ["# Phase 2H PRD (fixture)", "", ...declared.map((id) => `- **${id}:** a declared requirement.`)].join(
      "\n",
    );
  writeFileSync(join(root, "docs/initiatives/phase-2h/PHASE_2H_PRD.md"), `${body}\n`, "utf8");

  if (!spec.noRecords) {
    const cited = spec.cited ?? declared;
    writeFileSync(
      join(root, REPORTS_DIR, "PHASE_2H_SLICE_01_ACCEPTANCE.md"),
      ["# fixture acceptance", "", ...cited.map((id) => `- \`${id}\` delivered.`)].join("\n"),
      "utf8",
    );
  }

  const migrations =
    spec.migrations ??
    Object.values(MIGRATION_ALLOCATION).map((entry) => `${entry.version}_${entry.slug}.sql`);
  for (const name of migrations) {
    writeFileSync(join(root, "supabase/migrations", name), "-- fixture\n", "utf8");
  }

  return root;
}

/** Every fixture's baseline: clean, so a single defect is the only difference. */
const CLEAN = () => fixture();

describe("2H-CLOSE-001: the fixtures themselves are clean", () => {
  it("a fixture with no deliberate defect produces no finding", () => {
    // Without this, every "produces a finding" assertion below could be firing
    // on the fixture's own scaffolding rather than on the defect it carries.
    expect(findings(CLEAN())).toEqual([]);
  });

  it("the fixture builder actually writes what it claims", () => {
    const root = CLEAN();
    expect(parseRequirements(root)).toEqual(["2H-DEPLOY-001", "2H-RETENTION-001"]);
    expect(citedIds(root)).toEqual(["2H-DEPLOY-001", "2H-RETENTION-001"]);
    expect(phaseMigrations(root)).toHaveLength(MIGRATION_BUDGET);
  });
});

describe("2H-CLOSE-001: a requirement that nothing evidences is a finding", () => {
  it("fails on a PRD requirement cited nowhere", () => {
    const root = fixture({
      declared: ["2H-DEPLOY-001", "2H-RETENTION-001"],
      cited: ["2H-DEPLOY-001"],
    });
    const problems = findings(root);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(
      /2H-RETENTION-001 is neither cited by an acceptance record nor declared undelivered/,
    );
  });

  it("fails on an acceptance record citing a requirement the PRD does not declare", () => {
    // The other direction, and the one a matrix built only from the PRD cannot
    // see: a record claiming something nobody declared.
    const root = fixture({
      declared: ["2H-DEPLOY-001"],
      cited: ["2H-DEPLOY-001", "2H-GHOST-001"],
    });
    const problems = findings(root);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/2H-GHOST-001 is cited .* but the PRD does not declare it/);
  });
});

describe("2H-CLOSE-001: declared exceptions are cross-checked", () => {
  it("fails when an id is declared undelivered AND an acceptance record claims it", () => {
    // The conflict the contract names explicitly. Silently preferring either
    // side would make the matrix assert something nobody checked.
    const root = CLEAN();
    const problems = findings(root, {
      undelivered: {
        "2H-DEPLOY-001": { reason: "blocked on a thing", destination: "somewhere.md" },
      },
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(
      /2H-DEPLOY-001 is declared undelivered but .* claims it — the declaration and the evidence disagree/,
    );
  });

  it("fails on an UNDELIVERED entry with no destination", () => {
    const root = fixture({ declared: ["2H-DEPLOY-001", "2H-RETENTION-001"], cited: ["2H-DEPLOY-001"] });
    const problems = findings(root, {
      undelivered: { "2H-RETENTION-001": { reason: "blocked on a thing" } },
    });
    expect(problems).toContain("2H-RETENTION-001 is declared undelivered with no destination");
  });

  it("fails on an UNDELIVERED entry with no reason", () => {
    const root = fixture({ declared: ["2H-DEPLOY-001", "2H-RETENTION-001"], cited: ["2H-DEPLOY-001"] });
    const problems = findings(root, {
      undelivered: { "2H-RETENTION-001": { destination: "somewhere.md" } },
    });
    expect(problems).toContain("2H-RETENTION-001 is declared undelivered with no reason");
  });

  it("fails on a PARTIAL that no acceptance record cites", () => {
    // A partial still owes evidence. Otherwise the category becomes a way to
    // assert half a delivery with nothing on disk behind it.
    const root = fixture({
      declared: ["2H-DEPLOY-001", "2H-RETENTION-001"],
      cited: ["2H-DEPLOY-001"],
    });
    const problems = findings(root, {
      partial: {
        "2H-RETENTION-001": {
          delivered: "half of it",
          remaining: "the other half",
          destination: "somewhere.md",
        },
      },
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(
      /2H-RETENTION-001 is declared partially delivered but no acceptance record cites it/,
    );
  });

  it("fails on a stale exception for an id the PRD does not declare", () => {
    // A stale exception is how an inventory quietly shrinks: the id leaves the
    // PRD, the exception stays, and the matrix stops counting it.
    const root = CLEAN();
    const problems = findings(root, {
      undelivered: { "2H-GONE-001": { reason: "r", destination: "d" } },
    });
    expect(problems).toContain("2H-GONE-001 is declared undelivered but the PRD does not declare it");
  });
});

describe("2H-CLOSE-002: the migration budget is reconciled per slice", () => {
  const allocated = Object.values(MIGRATION_ALLOCATION).map(
    (entry) => `${entry.version}_${entry.slug}.sql`,
  );

  it("fails on a sixth phase_2h migration", () => {
    const root = fixture({
      migrations: [...allocated, "202608070084_phase_2h_one_too_many.sql"],
    });
    const problems = findings(root);
    expect(problems.some((problem) => /spent 6 migrations against a budget of 5/.test(problem))).toBe(
      true,
    );
    expect(
      problems.some((problem) =>
        /202608070084_phase_2h_one_too_many\.sql is in the chain but is allocated to no slice/.test(
          problem,
        ),
      ),
    ).toBe(true);
  });

  it("fails on a migration attributed to the wrong slice", () => {
    // The failure a count cannot see. Five migrations, budget spent exactly,
    // and 2H.5's number carrying 2H.3's subject.
    const wrong = allocated.map((name) =>
      name.startsWith("202608070083") ? "202608070083_phase_2h_rate_limiting.sql" : name,
    );
    const root = fixture({ migrations: wrong });
    const problems = migrationFindings(root);
    expect(
      problems.some((problem) =>
        /slice 2H.5 was allocated 202608070083 as `phase_2h_retention` but the chain holds `202608070083_phase_2h_rate_limiting.sql`/.test(
          problem,
        ),
      ),
    ).toBe(true);
  });

  it("fails on a missing migration", () => {
    const root = fixture({
      migrations: allocated.filter((name) => !name.startsWith("202608070081")),
    });
    const problems = migrationFindings(root);
    expect(
      problems.some((problem) =>
        /slice 2H.3's allocated migration 202608070081 is absent from the chain/.test(problem),
      ),
    ).toBe(true);
  });

  it("fails when the chain holds none at all", () => {
    const root = fixture({ migrations: [] });
    const problems = migrationFindings(root);
    expect(problems.some((problem) => /shows 0 of 5 allocated migrations/.test(problem))).toBe(true);
  });
});

describe("2H-CLOSE-001: broken extraction fails closed", () => {
  it("fails when the PRD yields no declared requirements", () => {
    // The failure mode every parser-backed guard has: the anchor drifts, the
    // list comes back empty, and the report describes nothing while looking
    // complete. It must be a finding, not an empty matrix.
    const root = fixture({ prdBody: "# Phase 2H PRD\n\nSome prose that declares nothing.\n" });
    const problems = findings(root);
    expect(problems).toEqual([
      "the PRD yielded no declared requirements — the declaration anchor has drifted",
    ]);
  });

  it("fails when the declaration shape is subtly wrong", () => {
    // Not bold, so not a declaration. A generator that accepted this would
    // count requirements the A13 detector does not, and the two must agree.
    const root = fixture({ prdBody: "# PRD\n\n- 2H-DEPLOY-001: a requirement without the bold shape.\n" });
    expect(findings(root)[0]).toMatch(/yielded no declared requirements/);
  });

  it("fails when no acceptance record exists at all", () => {
    const root = fixture({ noRecords: true });
    const problems = findings(root);
    expect(problems).toContain(`no acceptance record exists under ${REPORTS_DIR}`);
    expect(
      problems.some((problem) => /no acceptance record .* cites any 2H requirement/.test(problem)),
    ).toBe(true);
  });

  it("fails when records exist but cite nothing", () => {
    const root = fixture({ declared: ["2H-DEPLOY-001"], cited: [] });
    const problems = findings(root);
    expect(
      problems.some((problem) => /no acceptance record .* cites any 2H requirement/.test(problem)),
    ).toBe(true);
  });
});

describe("2H-CLOSE-001/002: the real repository is the positive control", () => {
  // A guard proven only in the failing direction may be refusing everything.
  it("produces no finding against the repository as it stands", () => {
    const problems = findings(REPO);
    expect(problems, `Phase 2H traceability is unresolved:\n${problems.join("\n")}`).toEqual([]);
  });

  it("declares 44 requirements across nine families", () => {
    const ids = parseRequirements(REPO);
    expect(ids).toHaveLength(44);
    const families = new Set(ids.map((id) => id.split("-")[1]));
    expect([...families].sort()).toEqual([
      "BACKUP",
      "CLOSE",
      "DEADMAN",
      "DEPLOY",
      "OPS",
      "RATE",
      "RECOVER",
      "RETENTION",
      "SINK",
    ]);
  });

  it("spends exactly five migrations, each by the slice it was allocated to", () => {
    expect(phaseMigrations(REPO)).toHaveLength(MIGRATION_BUDGET);
    expect(migrationFindings(REPO)).toEqual([]);
  });

  it("declares nothing undelivered and nothing partial", () => {
    // Stated as an assertion rather than left implicit: at Phase 2H's close,
    // every declared requirement is delivered and cited. If a later edit adds
    // an exception, this line is where the claim changes.
    expect(Object.keys(UNDELIVERED)).toEqual([]);
    expect(Object.keys(PARTIAL)).toEqual([]);
  });

  it("renders a matrix carrying every requirement and the budget table", () => {
    const matrix = renderMatrix(REPO);
    for (const id of parseRequirements(REPO)) {
      expect(matrix, `${id} is missing from the matrix`).toContain(`\`${id}\``);
    }
    for (const [slice, entry] of Object.entries(MIGRATION_ALLOCATION)) {
      expect(matrix).toContain(`| ${slice} | 1 — \`${entry.version}\``);
    }
    expect(matrix).toContain("**44** requirements declared");
    expect(matrix).toContain("**44** delivered");
  });
});
