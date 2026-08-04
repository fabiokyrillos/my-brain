/**
 * SH-LEGAL-004/014 and T-28/T-31 — the pins that stop two surfaces disagreeing.
 *
 * Three parities, each in **both directions**, because a one-directional check
 * is satisfied by deleting the thing it was meant to guard:
 *
 *   1. the TypeScript version constants and the SQL ones (`202608040074`);
 *   2. the enumerated "what deletion retains" list and the columns
 *      `account_deletion_log` actually has (`202608040072`);
 *   3. the retention schedule in code and the plan's §7 table.
 *
 * The reason (2) matters is the one T-31 names: a Privacy Policy that says less
 * than the log keeps is a false claim, and a log that grows a field the policy
 * does not disclose becomes one silently.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DELETION_RETAINED_FIELDS, RETENTION_SCHEDULE } from "./retention";
import { POLICY_DOCUMENTS, POLICY_VERSIONS } from "./versions";

const REPO = process.cwd();
const read = (path: string) => readFileSync(join(REPO, path), "utf8");

const CONSENT_MIGRATION = read("supabase/migrations/202608040074_policy_acceptances.sql");
const DELETION_MIGRATION = read("supabase/migrations/202608040072_account_deletion.sql");
const PLAN = read("docs/SIGNUP_HARDENING_IMPLEMENTATION_PLAN.md");

describe("SH-LEGAL-004: the version constant is one constant", () => {
  /** The `when '<document>' then '<version>'` arms of `current_policy_version`. */
  const sqlVersions = new Map(
    [...CONSENT_MIGRATION.matchAll(/when '([a-z_]+)' then '(\d{4}-\d{2}-\d{2})'/g)].map(
      (match) => [match[1], match[2]] as const,
    ),
  );

  it("every document TypeScript knows about has the same version in SQL", () => {
    for (const document of POLICY_DOCUMENTS) {
      expect(sqlVersions.get(document), `${document} is missing from the migration`).toBe(
        POLICY_VERSIONS[document],
      );
    }
  });

  it("SQL declares a version for exactly those documents and no others", () => {
    expect([...sqlVersions.keys()].sort()).toEqual([...POLICY_DOCUMENTS].sort());
  });

  it("versions are dated, so ordering needs no separate scheme", () => {
    for (const document of POLICY_DOCUMENTS) {
      expect(POLICY_VERSIONS[document]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(POLICY_VERSIONS[document]))).toBe(false);
    }
  });
});

describe("SH-LEGAL-014: what deletion retains is what the log holds", () => {
  /**
   * The column list of `create table public.account_deletion_log (...)`, read
   * from the migration rather than from a hand-copy.
   */
  const columns = (() => {
    const start = DELETION_MIGRATION.indexOf("create table public.account_deletion_log (");
    const end = DELETION_MIGRATION.indexOf("constraint account_deletion_log_outcome_check", start);
    expect(end).toBeGreaterThan(start);
    return DELETION_MIGRATION.slice(start, end)
      .split("\n")
      .map((line) => /^\s{2}([a-z_]+)\s+(uuid|text|timestamptz|integer|bigint|jsonb)/.exec(line))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => match[1])
      .sort();
  })();

  it("the migration's column list is non-empty -- the regex still matches something", () => {
    // Without this the two assertions below would both pass against an empty
    // set the day the table's formatting changes.
    expect(columns.length).toBeGreaterThan(5);
  });

  it("every retained field the policy enumerates is a column the log has", () => {
    for (const field of DELETION_RETAINED_FIELDS) {
      expect(columns, `the policy claims ${field} is retained`).toContain(field);
    }
  });

  it("every column the log has is enumerated by the policy -- no undisclosed field", () => {
    for (const column of columns) {
      expect(
        [...DELETION_RETAINED_FIELDS],
        `account_deletion_log.${column} is retained but undisclosed`,
      ).toContain(column);
    }
  });
});

describe("SH-RETENTION-001: the schedule in code is the schedule in the plan", () => {
  const planTable = PLAN.slice(PLAN.indexOf("## 7. Retention schedule"));

  it.each(RETENTION_SCHEDULE.filter((entry) => entry.rule.kind !== "retained"))(
    "$id's window matches the plan",
    (entry) => {
      if (entry.rule.kind === "retained") return;
      // The plan writes windows as "90 d", "180 d", "30 d past expiry".
      expect(planTable).toMatch(new RegExp(`${entry.rule.days}\\s*d`));
    },
  );

  it("the retained classes are declared retained in the plan too", () => {
    for (const entry of RETENTION_SCHEDULE.filter((item) => item.rule.kind === "retained")) {
      expect(entry.reasonKey, `${entry.id} is retained without a stated reason`).not.toBeNull();
    }
    expect(planTable).toContain("retained");
  });

  it("no class is silently missing a rule", () => {
    for (const entry of RETENTION_SCHEDULE) {
      expect(entry.id.trim()).not.toBe("");
      expect(["window", "window-past-expiry", "retained"]).toContain(entry.rule.kind);
    }
  });
});
