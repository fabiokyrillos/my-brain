import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { TASK_MATCH_LIMITS, TASK_MATCH_PREFILTER_TIERS } from "./match-policy";
import { TASK_STATUSES } from "./taxonomy";

/**
 * The cross-language contracts `list_task_command_candidates` and the matcher
 * share, held to each other.
 *
 * Three of them exist, none enforced by a compiler, and each fails *silently*:
 *
 *   - the eight status literals, which the migration restates as a validity
 *     whitelist. A ninth status added to `tasks_status_check` and to
 *     `TASK_STATUSES` would simply be dropped from candidacy, with no error and
 *     no red test — the fail-closed CTE would quietly stop ranking a whole
 *     class of task;
 *   - the prefilter tier vocabulary, carried between SQL and TypeScript as bare
 *     integers. Inserting a tier in the SQL `case` re-scores every match;
 *   - the candidate limit, which 2E-MATCH-016 says has one home and which the
 *     function also carries as a default.
 *
 * This is the same defect class as the normalizer divergence of 2E-MATCH-008,
 * in places the PRD did not anticipate, and the repository already owns the
 * remedy: `extraction-parity.test.ts` and `normalizer-divergence.test.ts` both
 * read a non-TypeScript file and fail on disagreement.
 */

function source(relativePath: string): string {
  return readFileSync(path.resolve(process.cwd(), relativePath), "utf8").replace(/\r\n/g, "\n");
}

const MIGRATION = "supabase/migrations/202607250056_phase_2e_task_command_matching.sql";
const PGTAP = "supabase/tests/phase_2e_task_command_matching.sql";

describe("SQL and TypeScript agree on the vocabularies they share", () => {
  const migration = source(MIGRATION);

  it("whitelists exactly the eight statuses the taxonomy declares", () => {
    const block = migration.match(/where s in \(([\s\S]*?)\)\n/);
    expect(block, "the fail-closed status filter is no longer where this test looks").not.toBeNull();

    const literals = [...(block?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
    expect([...literals].sort()).toEqual([...TASK_STATUSES].sort());
  });

  it("assigns the prefilter tiers the scorer decodes", () => {
    // Read from the `case` arms in order: the first is tier 0, and so on. A
    // tier inserted in the middle shifts every one below it, which is exactly
    // the silent re-scoring this pins.
    const caseBlock = migration.slice(migration.indexOf("      case\n"), migration.indexOf("      end as tier"));
    const tiers = [...caseBlock.matchAll(/then (\d)\n/g)].map((match) => Number(match[1]));
    const elseTier = caseBlock.match(/else (\d)\n/);

    expect([...tiers, Number(elseTier?.[1])]).toEqual([
      TASK_MATCH_PREFILTER_TIERS.exactTitle,
      TASK_MATCH_PREFILTER_TIERS.titlePhrase,
      TASK_MATCH_PREFILTER_TIERS.connected,
      TASK_MATCH_PREFILTER_TIERS.unconnected,
    ]);
  });

  it("defaults the candidate limit to the one the policy module owns", () => {
    // The application always passes `p_limit`, so this default only serves
    // direct SQL and pgTAP — which is precisely why it can drift unnoticed.
    expect(migration).toContain(`p_limit integer default ${TASK_MATCH_LIMITS.candidates}`);
    expect(migration).toContain(`coalesce(p_limit, ${TASK_MATCH_LIMITS.candidates})`);
  });
});

describe("the pgTAP suite is byte-clean", () => {
  it("contains no NUL byte, which Postgres refuses in a string literal", () => {
    // Not hypothetical. A scripted edit turned `\\00F3` into a literal NUL on
    // two lines, and Postgres rejects `0x00` in a string literal with 22021 —
    // so the *entire* file aborted, silently taking with it every proof of the
    // SQL-side claims: owner scoping, ordering before truncation, eligibility,
    // overflow detectability and the whole 2E-MATCH-008 corpus. The TypeScript
    // side stayed green throughout, which is what made it invisible.
    expect(source(PGTAP)).not.toMatch(/\0/);
  });

  it("writes every non-ASCII value as a unicode escape rather than a raw character", () => {
    // The file's own doctrine: escapes exist so that an editor re-encoding NFC
    // as NFD cannot change what is being asserted.
    const offending = source(PGTAP)
      .split("\n")
      .map((line, index) => ({ line, number: index + 1 }))
      .filter(({ line }) => /[^\x00-\x7F]/.test(line) && !line.trimStart().startsWith("--"));

    expect(offending.map((entry) => entry.number)).toEqual([]);
  });
});
