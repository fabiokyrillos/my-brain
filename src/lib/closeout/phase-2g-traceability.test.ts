import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  MATRIX_OUTPUT_PATH,
  MIGRATION_BUDGET,
  PRD_PATH,
  REPORTS_DIR,
  REPOSITORY_ROOT,
  UNDELIVERED,
  findings,
  parseRequirements,
  renderMatrix,
} from "../../../scripts/generate-phase-2g-traceability.mjs";

/**
 * 2G-CLOSE-001, proven in both directions.
 *
 * A traceability generator that only ever passes is a document asserting that
 * somebody once typed it correctly. So each case below builds a fixture
 * repository carrying exactly one deliberate defect and asserts the generator
 * finds it — paired with the real repository as the positive control, because
 * a guard proven only in the failing direction may be refusing everything.
 */

const REPO = REPOSITORY_ROOT;

function fixture(mutate: (root: string) => void = () => {}): string {
  const root = mkdtempSync(join(tmpdir(), "2g-trace-"));
  mkdirSync(join(root, "docs/initiatives/phase-2g"), { recursive: true });
  mkdirSync(join(root, REPORTS_DIR), { recursive: true });
  mkdirSync(join(root, "supabase/migrations"), { recursive: true });
  cpSync(join(REPO, PRD_PATH), join(root, PRD_PATH));
  // One acceptance record citing every declared id, so the clean fixture is
  // genuinely clean and each case below introduces exactly one defect.
  const ids = parseRequirements(REPO).filter((id) => !(id in UNDELIVERED));
  writeFileSync(
    join(root, REPORTS_DIR, "PHASE_2G_SLICE_00_ACCEPTANCE.md"),
    `# fixture\n\n${ids.join("\n")}\n`,
  );
  writeFileSync(
    join(root, "supabase/migrations/202608060078_phase_2g_composer_capture_source.sql"),
    "-- fixture\n",
  );
  mutate(root);
  return root;
}

function withFixture(mutate: (root: string) => void, assertion: (root: string) => void) {
  const root = fixture(mutate);
  try {
    assertion(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("the generator is clean against a correct repository", () => {
  it("finds nothing wrong with the real one", () => {
    // The positive control. Without it every case below is satisfied by a
    // generator that refuses everything.
    expect(findings(REPO)).toEqual([]);
  });

  it("finds nothing wrong with a clean fixture either", () => {
    withFixture(() => {}, (root) => expect(findings(root)).toEqual([]));
  });
});

describe("each deliberate defect is caught", () => {
  it("catches a requirement no acceptance record cites", () => {
    withFixture(
      (root) => {
        const path = join(root, REPORTS_DIR, "PHASE_2G_SLICE_00_ACCEPTANCE.md");
        const text = readFileSync(path, "utf8");
        writeFileSync(path, text.replace("2G-CREATE-001", "(removed)"));
      },
      (root) => {
        expect(findings(root).some((f) => f.includes("2G-CREATE-001"))).toBe(true);
      },
    );
  });

  it("catches a stale undelivered declaration the PRD no longer declares", () => {
    withFixture(
      (root) => {
        const path = join(root, PRD_PATH);
        const text = readFileSync(path, "utf8");
        // Drop one of the two declared-undelivered ids from the PRD entirely.
        writeFileSync(path, text.replace(/^- \*\*2G-CLOSE-003:\*\*/m, "- **retired:**"));
      },
      (root) => {
        expect(findings(root).some((f) => f.includes("2G-CLOSE-003"))).toBe(true);
      },
    );
  });

  it("catches a migration budget the phase exceeded", () => {
    withFixture(
      (root) =>
        writeFileSync(
          join(root, "supabase/migrations/202609010079_phase_2g_second_one.sql"),
          "-- x\n",
        ),
      (root) => {
        expect(findings(root).some((f) => f.includes("budget"))).toBe(true);
      },
    );
  });

  it("catches an inventory that silently stopped parsing", () => {
    // The failure mode every parser-backed guard has: the anchor changes, the
    // list comes back empty, and the report describes nothing while looking
    // complete.
    withFixture(
      (root) => writeFileSync(join(root, PRD_PATH), "# empty\n"),
      (root) => {
        expect(findings(root).some((f) => f.includes("declaration anchor"))).toBe(true);
      },
    );
  });

  it("catches a phase with no acceptance record at all", () => {
    withFixture(
      (root) => rmSync(join(root, REPORTS_DIR, "PHASE_2G_SLICE_00_ACCEPTANCE.md")),
      (root) => {
        expect(findings(root).length).toBeGreaterThan(0);
      },
    );
  });

  it("does not accept a blocker report as delivery evidence", () => {
    // The generator's own first design counted any markdown file here, so a
    // document saying "this did not happen" satisfied the requirement it was
    // describing. The evidence set is acceptance and deployment records only.
    withFixture(
      (root) => {
        const path = join(root, REPORTS_DIR, "PHASE_2G_SLICE_00_ACCEPTANCE.md");
        const text = readFileSync(path, "utf8");
        writeFileSync(path, text.replace("2G-CREATE-002", "(moved)"));
        writeFileSync(
          join(root, REPORTS_DIR, "PHASE_2G_SOME_BLOCKER.md"),
          "# blocker\n\n2G-CREATE-002 could not be done.\n",
        );
      },
      (root) => {
        expect(findings(root).some((f) => f.includes("2G-CREATE-002"))).toBe(true);
      },
    );
  });
});

describe("the committed matrix", () => {
  it("regenerates byte-for-byte from the real repository", () => {
    // CRLF-normalized on read, the same way `phase-2f-traceability.test.ts`
    // does it: `.gitattributes` pins `*.sql` to LF and not `*.md`, so a
    // Windows checkout hands back CRLF for a file the generator wrote with LF.
    // The comparison is still byte-for-byte over content — what it deliberately
    // does not assert is the checkout's line-ending policy.
    const committed = readFileSync(join(REPO, MATRIX_OUTPUT_PATH), "utf8").replace(/\r\n/g, "\n");
    expect(
      committed,
      `${MATRIX_OUTPUT_PATH} is stale or hand-edited — run \`npm run docs:phase-2g:traceability\``,
    ).toBe(`${renderMatrix(REPO)}\n`);
  });

  it("accounts for every declared requirement exactly once", () => {
    const ids = parseRequirements(REPO);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size, "a requirement is declared twice").toBe(ids.length);
    const matrix = readFileSync(join(REPO, MATRIX_OUTPUT_PATH), "utf8");
    for (const id of ids) expect(matrix, `${id} is missing from the matrix`).toContain(id);
  });

  it("keeps the migration budget at the one ADR-083 approved", () => {
    expect(MIGRATION_BUDGET).toBe(1);
  });

  it("gives every undelivered requirement a reason and a destination", () => {
    // A deferral without a destination is an open item wearing a different
    // word, and this is the only place the phase is allowed to say "no".
    for (const [id, entry] of Object.entries(UNDELIVERED)) {
      expect(entry.reason, `${id} has no reason`).toBeTruthy();
      expect(entry.destination, `${id} has no destination`).toBeTruthy();
    }
  });
});
