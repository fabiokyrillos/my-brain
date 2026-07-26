import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  TASK_COMMAND_APPLY_FAILURES,
  TASK_COMMAND_APPLY_FAILURE_OUTCOMES,
  TASK_COMMAND_ERROR_DETAILS,
  TASK_COMMAND_FAILURE_POLICY,
  TASK_COMMAND_UNDO_ERROR_DETAILS,
  TASK_COMMAND_UNTAGGED_FAILURES,
  isTaskCommandErrorDetail,
  taskCommandErrorDetailFor,
  taskCommandUndoErrorDetailFor,
} from "./errors";
import { TASK_COMMAND_OUTCOMES } from "./outcomes";

/**
 * PRD 2E-UPDATE-017: "The RPC's failure vocabulary is a declared closed list of
 * `2E_*` detail codes, never message text. A database test provokes each declared
 * code and fails if the RPC raises an undeclared one; a TypeScript test fails if
 * the mapper lacks a case for any declared code."
 *
 * That requirement has two halves and they need different tests. The mapper half
 * is `apply.test.ts`. This file is the half nothing else can do: proving the
 * declared list describes the RPC that was actually written.
 *
 * A vocabulary module is unusually easy to write untruthfully — every assertion
 * about it is satisfied by the module agreeing with itself. So the assertions here
 * are deliberately all against the migration text: each declared token is read
 * back out of `202607260058`, and the migration's own tokens are read back into
 * this list, in **both** directions. One direction alone would let a declared code
 * with no raise survive (a mapper case for a failure that cannot happen), or a
 * raise with no declaration survive (2E-UPDATE-017's "raises an undeclared one",
 * which pgTAP catches from the database side and this catches from the source).
 */

/** LF-normalized, so the anchored patterns behave the same on Windows and in CI. */
function source(relativePath: string): string {
  return readFileSync(path.resolve(process.cwd(), relativePath), "utf8").replace(/\r\n/g, "\n");
}

const MIGRATION = "supabase/migrations/202607260058_phase_2e_task_command_apply.sql";
const migration = source(MIGRATION);

/** Every token the migration actually raises, read out of its `raise ... detail` clauses. */
const RAISED_TOKENS: readonly string[] = [
  ...new Set(
    [...migration.matchAll(/detail = '(2E_[A-Z_]+)'/g)].map((match) => match[1]),
  ),
].sort();

describe("the declared vocabulary is closed and internally consistent", () => {
  it("is exactly the nine detail tokens plus the five untagged failures", () => {
    expect(TASK_COMMAND_ERROR_DETAILS).toHaveLength(9);
    expect(TASK_COMMAND_UNTAGGED_FAILURES).toHaveLength(5);
    expect([...TASK_COMMAND_APPLY_FAILURES]).toEqual([
      ...TASK_COMMAND_ERROR_DETAILS,
      ...TASK_COMMAND_UNTAGGED_FAILURES,
    ]);
  });

  it("declares every member once", () => {
    // A duplicate would satisfy the length assertion above while silently giving
    // one failure two policy rows, of which only the last would be readable.
    expect(new Set(TASK_COMMAND_APPLY_FAILURES).size).toBe(TASK_COMMAND_APPLY_FAILURES.length);
  });

  it("namespaces every detail token to this phase", () => {
    // `2C_*` and `2D_*` are live vocabularies raised by RPCs this one shares a
    // database with, and `error.details` carries no other discriminator — a token
    // reusing one of their names would have this mapper answering for their
    // failures.
    for (const detail of TASK_COMMAND_ERROR_DETAILS) {
      expect(detail.startsWith("2E_"), detail).toBe(true);
    }
  });

  it("gives every declared failure exactly one policy row", () => {
    expect(Object.keys(TASK_COMMAND_FAILURE_POLICY).sort()).toEqual(
      [...TASK_COMMAND_APPLY_FAILURES].sort(),
    );
  });

  it("resolves every policy outcome to a declared 2E-UX-001 outcome", () => {
    // The `satisfies` on the outcome list is the compile-time half; this is the
    // runtime half, and it covers the policy rows rather than the list, so an
    // outcome widened to `string` anywhere on the way in still fails here.
    const declared: readonly string[] = TASK_COMMAND_OUTCOMES;
    for (const failure of TASK_COMMAND_APPLY_FAILURES) {
      expect(declared, failure).toContain(TASK_COMMAND_FAILURE_POLICY[failure].outcome);
    }
    for (const outcome of TASK_COMMAND_APPLY_FAILURE_OUTCOMES) {
      expect(declared).toContain(outcome);
    }
  });

  it("marks exactly the three failures a retry can resolve", () => {
    // Pinned to a literal because this column is the one a reader is most likely
    // to flip by intuition. The two integrity codes mean a concurrent writer got
    // between this command's evidence and its write, and the whole transaction
    // rolled back, so re-observing can legitimately succeed. `undeclared_failure`
    // is retryable for the same reason. Everything else is a property of the
    // request, and resending it unchanged fails identically.
    const retryable = TASK_COMMAND_APPLY_FAILURES.filter(
      (failure) => TASK_COMMAND_FAILURE_POLICY[failure].retryable,
    );
    expect(retryable).toEqual([
      "2E_TRANSITION_INTEGRITY",
      "2E_REMINDER_INTEGRITY",
      "undeclared_failure",
    ]);
  });

  it("pairs each detail token with one SQLSTATE, and only P0001 or 22023", () => {
    // The `2C_INVALID_*` precedent: detail tokens pair with `P0001` except the
    // invalid-value family, which pairs with `22023`. Inventing a third pairing
    // would make the mapper's two branches insufficient without failing anything.
    for (const detail of TASK_COMMAND_ERROR_DETAILS) {
      expect(["P0001", "22023"], detail).toContain(TASK_COMMAND_FAILURE_POLICY[detail].sqlstate);
    }
  });

  it("leaves the SQLSTATE null for the one failure no database raises", () => {
    expect(TASK_COMMAND_FAILURE_POLICY.undeclared_failure.sqlstate).toBeNull();
    expect(TASK_COMMAND_FAILURE_POLICY.undeclared_failure.message).toBeNull();
    // And for no other member, or the mapper would have a branch it cannot key.
    const nullSqlstate = TASK_COMMAND_APPLY_FAILURES.filter(
      (failure) => TASK_COMMAND_FAILURE_POLICY[failure].sqlstate === null,
    );
    expect(nullSqlstate).toEqual(["undeclared_failure"]);
  });
});

describe("the declared vocabulary describes the migration that was written", () => {
  it("raises every declared detail token", () => {
    for (const detail of TASK_COMMAND_ERROR_DETAILS) {
      // Matched as the whole `detail = '...'` clause, not as a substring: the
      // migration's header prose names several of these tokens while explaining
      // them, and a `toContain` on the bare token would be satisfied by the
      // explanation of a raise that was later deleted.
      expect(migration, `${detail} is declared but never raised`).toContain(`detail = '${detail}'`);
    }
  });

  it("raises no token this list does not declare (2E-UPDATE-017)", () => {
    expect(RAISED_TOKENS).toEqual([...TASK_COMMAND_ERROR_DETAILS].sort());
  });

  it("carries the message each policy row records", () => {
    // Never matched against at runtime — 2E-UPDATE-017 forbids keying on message
    // text — but proven to exist, so the table cannot drift into describing raises
    // the migration does not contain.
    for (const failure of TASK_COMMAND_APPLY_FAILURES) {
      const { message } = TASK_COMMAND_FAILURE_POLICY[failure];
      if (message === null) continue;
      expect(migration, `${failure}: no raise carries "${message}"`).toContain(
        `raise exception '${message}'`,
      );
    }
  });

  it("signals staleness with 55P03 and attaches no detail to it", () => {
    // `src/features/agent/actions.ts` branches on `error.code === "55P03"` alone
    // before it looks at `details`, so a token attached to this raise would make
    // Phase 2E the one exception to a convention every staleness gate follows.
    expect(migration).toContain(`raise exception 'Task changed since the preview' using errcode = '55P03';`);
    expect(migration).not.toMatch(/errcode = '55P03',\s*detail/);
    expect(TASK_COMMAND_FAILURE_POLICY.stale_pre_state.sqlstate).toBe("55P03");
    expect(isTaskCommandErrorDetail("stale_pre_state")).toBe(false);
  });

  it("raises the two undo tokens only inside the undo handlers", () => {
    // Positional, because the split between apply-path and undo-path tokens is
    // what `taskCommandUndoErrorDetailFor` and the agent action rely on: an undo
    // token raised by the apply RPC would be reported through the shared undo
    // router's copy for a failure that never involved an undo.
    const handlersBegin = migration.indexOf(
      "create or replace function private.undo_apply_task_command_fields(",
    );
    expect(handlersBegin).toBeGreaterThan(0);
    for (const detail of TASK_COMMAND_UNDO_ERROR_DETAILS) {
      const clause = `detail = '${detail}'`;
      expect(migration.indexOf(clause), detail).toBeGreaterThan(handlersBegin);
    }
  });

  it("keeps the undo tokens a subset of the declared details", () => {
    const declared: readonly string[] = TASK_COMMAND_ERROR_DETAILS;
    for (const detail of TASK_COMMAND_UNDO_ERROR_DETAILS) {
      expect(declared).toContain(detail);
    }
    expect(TASK_COMMAND_UNDO_ERROR_DETAILS).toHaveLength(2);
  });
});

describe("taskCommandErrorDetailFor requires the pairing, not just the token", () => {
  it("resolves a token arriving under its declared SQLSTATE", () => {
    expect(taskCommandErrorDetailFor("P0001", "2E_TRANSITION_INTEGRITY")).toBe(
      "2E_TRANSITION_INTEGRITY",
    );
    expect(taskCommandErrorDetailFor("22023", "2E_INVALID_RELATION")).toBe("2E_INVALID_RELATION");
  });

  it("refuses a token arriving under the wrong SQLSTATE", () => {
    // A `22023` carrying `2E_TRANSITION_INTEGRITY` is not that failure — it is a
    // payload the database refused while something upstream mislabelled it, and
    // reading it as a retryable conflict would invite an endless retry.
    expect(taskCommandErrorDetailFor("22023", "2E_TRANSITION_INTEGRITY")).toBeNull();
    expect(taskCommandErrorDetailFor("P0001", "2E_INVALID_RELATION")).toBeNull();
  });

  it("refuses an undeclared token, an empty detail and an absent one", () => {
    expect(taskCommandErrorDetailFor("P0001", "2D_IDEMPOTENCY_MISMATCH")).toBeNull();
    expect(taskCommandErrorDetailFor("P0001", "2E_SOMETHING_ELSE")).toBeNull();
    expect(taskCommandErrorDetailFor("P0001", "")).toBeNull();
    expect(taskCommandErrorDetailFor("P0001", undefined)).toBeNull();
  });

  it("resolves every declared detail under its own SQLSTATE", () => {
    // Iterated over the declared list rather than spot-checked, so a tenth token
    // is covered on the day it is added.
    for (const detail of TASK_COMMAND_ERROR_DETAILS) {
      const { sqlstate } = TASK_COMMAND_FAILURE_POLICY[detail];
      expect(sqlstate).not.toBeNull();
      expect(taskCommandErrorDetailFor(sqlstate as string, detail), detail).toBe(detail);
    }
  });
});

describe("taskCommandUndoErrorDetailFor answers only for the undo path", () => {
  it("resolves both undo tokens", () => {
    for (const detail of TASK_COMMAND_UNDO_ERROR_DETAILS) {
      expect(taskCommandUndoErrorDetailFor("P0001", detail), detail).toBe(detail);
    }
  });

  it("returns null for an apply-path token", () => {
    // The shared undo router can only ever surface the two undo tokens; anything
    // else arriving there is not something an undo affordance may narrate.
    expect(taskCommandUndoErrorDetailFor("P0001", "2E_TRANSITION_INTEGRITY")).toBeNull();
    expect(taskCommandUndoErrorDetailFor("22023", "2E_INVALID_RELATION")).toBeNull();
  });

  it("returns null when the code or the detail is absent", () => {
    // The router's three errcode-less raises — `'Unsupported undo operation'`,
    // `'Undo operation is no longer available'`, `'Undo operation expired'` — reach
    // a caller as a bare `P0001` with no detail, and must keep the generic message.
    expect(taskCommandUndoErrorDetailFor(undefined, "2E_UNDO_RESTORE_INTEGRITY")).toBeNull();
    expect(taskCommandUndoErrorDetailFor("P0001", undefined)).toBeNull();
    expect(taskCommandUndoErrorDetailFor("P0002", undefined)).toBeNull();
  });
});
