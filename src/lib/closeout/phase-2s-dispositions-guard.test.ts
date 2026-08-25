/**
 * Phase 2S — slice 2S.2. **Static scrutiny of the pgTAP suite this environment
 * cannot run.**
 *
 * `supabase/tests/phase_2s_slice_2_dispositions.sql` carries the three
 * assertions no component test can make, because each names a verb only the
 * database can perform: *calling* `run_user_heartbeat` after a dismissal
 * (`2S-ANSWER-004`, `-008`), and exercising the four scopes one at a time while
 * reading the other three (`2S-SILENCE-011`).
 *
 * There is no local Docker in this environment, so that file is written blind
 * and first executed by CI. This repository has already paid for what happens
 * then: a suite whose `plan()` disagrees with its assertions fails on the count
 * rather than on the product, and the failure looks like a defect in the thing
 * under test. Every check here is one that can be made from the text and would
 * otherwise be made by a red CI run.
 *
 * It is deliberately **not** a substitute for running it. Nothing below proves
 * any behaviour; it proves the suite is well-formed and still asks the
 * questions it was written to ask.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const REPO = resolve(__dirname, "../../..");
const SUITE = "supabase/tests/phase_2s_slice_2_dispositions.sql";
const suite = () => readFileSync(join(REPO, SUITE), "utf8");

const NEWLINES = /\r?\n/;

/** The suite with its `--` commentary removed, so a scan measures the SQL. */
function withoutComments(body: string): string {
  return body
    .split(NEWLINES)
    .map((line) => (line.trimStart().startsWith("--") ? "" : line))
    .join("\n");
}

/**
 * The four scope blocks, split on the markers the suite writes them with.
 *
 * Derived rather than counted: a block that stops re-reading the subject must
 * fail the assertion that names it, not slip under a threshold.
 */
function scopeBlocks(body: string): Record<string, string> {
  const markers = [...body.matchAll(/^-- (3[a-d]) --/gm)];
  const blocks: Record<string, string> = {};
  markers.forEach((marker, index) => {
    const start = marker.index ?? 0;
    const end = index + 1 < markers.length ? markers[index + 1].index : body.length;
    blocks[marker[1]] = body.slice(start, end);
  });
  return blocks;
}

/** Top-level assertions, which is what `plan()` has to agree with. */
function assertionCount(body: string): number {
  return [...body.matchAll(/^select (?:is|ok|isnt|throws_ok|lives_ok)\(/gm)].length;
}

describe("the plan matches the assertions, because CI is the first thing to run this", () => {
  it("counts assertions at all", () => {
    // Non-vacuity: a regex that matched nothing would make the next test pass
    // against `plan(0)` and prove the opposite of what it claims.
    expect(assertionCount(suite())).toBeGreaterThan(20);
  });

  it("declares exactly that many", () => {
    const declared = /select plan\((\d+)\);/.exec(suite())?.[1];
    expect(declared, "the suite declares no plan").toBeDefined();
    expect(Number(declared)).toBe(assertionCount(suite()));
  });

  it("opens a transaction and rolls it back, so it leaves no residue", () => {
    const body = suite();
    /*
     * `begin;` opens the FIRST statement, not the first line: every suite in
     * this directory leads with a prose header explaining why it exists, which
     * is the half of a pgTAP file a reviewer actually reads.
     */
    const firstStatement = body
      .split(/\r?\n/)
      .find((line) => line.trim() && !line.trimStart().startsWith("--"));
    expect(firstStatement?.trim()).toBe("begin;");
    expect(body.trimEnd().endsWith("rollback;")).toBe(true);
    expect(body).toContain("select * from finish();");
    // The plan is declared before the first fixture, or it counts nothing.
    expect(body.indexOf("select plan(")).toBeLessThan(body.indexOf("insert into auth.users"));
  });

  it("is pure ASCII, like every suite before it", () => {
    // eslint-disable-next-line no-control-regex
    const offenders = [...suite()].filter((character) => character.charCodeAt(0) > 127);
    expect(offenders).toEqual([]);
  });
});

describe("the suite still asks the questions it was written for", () => {
  it("CALLS the heartbeat rather than reading its source", () => {
    const body = suite();
    expect(body, "the requirement's own verb is `calling`").toContain(
      "perform public.run_user_heartbeat(",
    );
    /*
     * The trap slice 2R.1 fell into, refused by name: an assertion over
     * `pg_proc.prosrc` proves the text and never the behaviour.
     */
    expect(body).not.toContain("prosrc");
    expect(body).not.toContain("pg_get_functiondef");
  });

  it("exercises all four scopes, each named in an ASSERTION rather than in a comment", () => {
    /*
     * A CHECK CAN PASS BY CONTAINING ITS OWN SUBJECT, and the first version of
     * this one did. It scanned the whole file, so the section header comment
     * `-- 3d -- *Silenciar este assunto*` satisfied it — and a mutation that
     * renamed the assertion's own message left the guard green. The scan now
     * runs over the file with its comments removed.
     */
    const body = withoutComments(suite());
    for (const scope of ["*lida*", "*descartar*", "*silenciar por um tempo*", "*silenciar este assunto*"]) {
      expect(body.toLowerCase(), `no ASSERTION names the ${scope} scope`).toContain(scope);
    }
  });

  it("reads the task in every scope block, so `unchanged` is asserted rather than assumed", () => {
    /*
     * DERIVED FROM THE SECTIONS, not counted. A first version asserted
     * "at least five readings" and a mutation that deleted one still left five
     * — a threshold with slack is a threshold that passes the defect it exists
     * to catch.
     */
    const blocks = scopeBlocks(suite());
    expect(Object.keys(blocks), "the four scope blocks were not found").toEqual(["3a", "3b", "3c", "3d"]);
    for (const [name, block] of Object.entries(blocks)) {
      expect(block, `scope ${name} was exercised without re-reading the subject`)
        .toContain("pg_temp.task_unchanged()");
    }
  });

  it("takes every denial after `reset role`, so a zero is not a zero RLS produced", () => {
    const body = suite();
    expect(body).toContain("reset role;");
    // The suppression counts are the denials that matter, and the helper that
    // reads them is only ever called at top level — never between a role switch
    // and its reset.
    for (const block of body.split("set local role authenticated;").slice(1)) {
      const untilReset = block.split("reset role;")[0];
      expect(untilReset, "a suppression count was read while RLS was filtering")
        .not.toContain("pg_temp.suppressions()");
    }
  });

  it("plants the row every `unchanged` reading depends on", () => {
    /*
     * The control this repository keeps having to re-learn: an absence asserted
     * over an empty table is not a control. Every scope section re-arranges two
     * notices first, and the arrangement is the argument of an assertion whose
     * expected value is its own size.
     */
    const arrangements = [...suite().matchAll(/pg_temp\.arrange_two\(\)/g)].length;
    // Four call sites — the declaration, and one per scope block that needs it.
    expect(arrangements).toBeGreaterThanOrEqual(5);
  });
});

describe("this slice adds no migration", () => {
  it("leaves the chain where slice 2S.1 left it", () => {
    /*
     * `phase-2s-declarations.test.ts` owns the budget assertion — exactly one
     * Phase 2S migration, by name. This is the narrower fact that belongs to
     * THIS slice: its pgTAP suite asserts against a schema that already exists,
     * so nothing in `supabase/migrations` may carry its number.
     */
    const migrations = readdirSync(join(REPO, "supabase/migrations")).filter((name) =>
      name.endsWith(".sql"),
    );
    expect(migrations.length, "the migration directory is empty").toBeGreaterThan(0);
    const mine = migrations.filter((name) => /slice[_-]?2\b|slice_2_/i.test(name) && /2s/i.test(name));
    expect(mine, "slice 2S.2 created a migration, which is a stop condition").toEqual([]);
  });
});
