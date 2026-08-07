import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ERROR_OPERATIONS, ERROR_REASONS, ERROR_SURFACES } from "./error-sink";

/**
 * 2H-SINK-002, and ADR-084's discipline applied before it can cost anything.
 *
 * SH.6 shipped a producer that emitted `failureKind: 'quota'` into a validator
 * that did not accept it. Every quota refusal recorded **nothing** for weeks
 * while the code read as though it recorded everything, the call site swallowed
 * the rejection, and the lost events do not backfill. The lesson recorded then
 * was: a value that must satisfy two validators is pinned against **both**, in
 * both directions, or it is not pinned.
 *
 * So this reads the migration's CHECK constraints out of the SQL and compares
 * them to the TypeScript constants as SETS. A value in one and not the other
 * fails here, at build time, rather than in production as silence.
 */

const MIGRATION = join(
  process.cwd(),
  "supabase/migrations/202608070080_phase_2h_error_sink_and_deadman.sql",
);

/** The `in (...)` list of one named CHECK constraint, as it exists in the SQL. */
function vocabularyFromCheck(constraintName: string): string[] {
  const sql = readFileSync(MIGRATION, "utf8");
  const anchor = sql.indexOf(`constraint ${constraintName}`);
  expect(anchor, `${constraintName} is not in the migration`).toBeGreaterThan(-1);

  const opening = sql.indexOf("in (", anchor);
  expect(opening, `${constraintName} does not use an in (...) list`).toBeGreaterThan(-1);

  // Walk to the matching close paren, so a nested one cannot truncate the list.
  let depth = 0;
  let end = -1;
  for (let index = opening + "in ".length; index < sql.length; index += 1) {
    if (sql[index] === "(") depth += 1;
    if (sql[index] === ")") {
      depth -= 1;
      if (depth === 0) {
        end = index;
        break;
      }
    }
  }
  expect(end, `${constraintName}'s list is unterminated`).toBeGreaterThan(-1);

  return [...sql.slice(opening, end).matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
}

describe("2H-SINK-002: the sink's vocabularies are pinned in both directions", () => {
  const cases = [
    { name: "error_events_surface_check", typescript: ERROR_SURFACES },
    { name: "error_events_operation_check", typescript: ERROR_OPERATIONS },
    { name: "error_events_reason_check", typescript: ERROR_REASONS },
  ] as const;

  for (const { name, typescript } of cases) {
    it(`${name} and its TypeScript constant are the same set`, () => {
      const sql = vocabularyFromCheck(name);

      // Non-vacuous first: an extractor that silently returned nothing would
      // make every comparison below pass against an empty set.
      expect(sql.length, `${name} yielded no values — the extractor is broken`).toBeGreaterThan(3);

      expect(
        [...sql].sort(),
        `${name} has values TypeScript does not: a database refusal nothing can emit`,
      ).toEqual([...typescript].sort());
    });
  }

  it("every reason the classifier can return is a member of the database vocabulary", async () => {
    // The direction ADR-084's defect actually travelled: the producer emitted a
    // value the validator rejected. Enumerating the classifier's own outputs
    // rather than the constant it is typed against means a hard-coded literal
    // that drifts from the list is caught too.
    const { classifyError } = await import("./error-sink");
    const sqlReasons = new Set(vocabularyFromCheck("error_events_reason_check"));

    const shapes: unknown[] = [
      null,
      undefined,
      "a string",
      {},
      { code: "42501" },
      { code: "22023" },
      { code: "23514" },
      { code: "23502" },
      { code: "23505" },
      { code: "40001" },
      { code: "55P03" },
      { code: "PGRST116" },
      { code: "57014" },
      { code: "XX000" },
      { name: "AbortError" },
      { name: "TimeoutError" },
      { detail: "QUOTA_ENTRIES_EXCEEDED" },
      { detail: "AUTH_EVENT_THROTTLED" },
      { detail: "ACCOUNT_LIFECYCLE_NOT_ACTIVE" },
      { status: 401 },
      { status: 403 },
      { status: 404 },
      { status: 408 },
      { status: 409 },
      { status: 429 },
      { status: 500 },
      { status: 502 },
      { status: 504 },
      { status: 400 },
      new Error("boom"),
    ];

    for (const shape of shapes) {
      const reason = classifyError(shape);
      expect(sqlReasons.has(reason), `classifyError produced "${reason}", which the database refuses`)
        .toBe(true);
    }
  });
});
