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
  type TaskCommandErrorDetail,
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

/**
 * The migration that holds the CURRENT definition of `public.apply_task_command`
 * and `private.undo_apply_task_command_fields`.
 *
 * **It must be the latest one.** Migrations are append-only, so `202607270060`
 * re-declares both functions with `create or replace`; every earlier body is
 * superseded the moment the chain is applied. A vocabulary test pointed at an
 * older migration reports on a body the database no longer runs: it would have
 * gone red for `2E_ACTION_NOT_ENABLED`, which Slice
 * 2E.5 correctly retired but which 0058 still literally contains, and it would
 * have stayed green for the detail-free-`55P03` assertion below, whose subject
 * had moved. Whenever a later migration replaces these functions again, this
 * constant moves with it — and the assertion that every declared token is raised
 * is what makes forgetting loud.
 */
const MIGRATION = "supabase/migrations/202607270060_phase_2e_no_match_task_creation.sql";
const migration = source(MIGRATION);

/** Every token the migration actually raises, read out of its `raise ... detail` clauses. */
const RAISED_TOKENS: readonly string[] = [
  ...new Set(
    [...migration.matchAll(/detail = '(2E_[A-Z_]+)'/g)].map((match) => match[1]),
  ),
].sort();

describe("the declared vocabulary is closed and internally consistent", () => {
  it("is exactly the ten detail tokens plus the five untagged failures", () => {
    // Nine after Slice 2E.4. Slice 2E.5 retired `2E_ACTION_NOT_ENABLED` when it
    // enabled both destructive verbs, and added `2E_CONFIRMATION_REQUIRED` and
    // `2E_CREATION_UNDONE`.
    expect(TASK_COMMAND_ERROR_DETAILS).toHaveLength(10);
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

  it("pairs each detail token with one of the three SQLSTATEs the mapper branches on", () => {
    // The `2C_INVALID_*` precedent: detail tokens pair with `P0001` except the
    // invalid-value family, which pairs with `22023`.
    //
    // **`55P03` is the third pairing, and Slice 2E.5 added it deliberately.** PRD
    // 2E-DESTRUCTIVE-008 names that SQLSTATE by hand for the creation-undo
    // collision. The list here is not a style preference — it is the set of
    // codes `mapTaskCommandApplyError` looks a detail up under, so a fourth
    // pairing invented without touching the mapper would leave the token silently
    // unreachable. That is why this is asserted as an exact allow-list rather
    // than as "some SQLSTATE".
    for (const detail of TASK_COMMAND_ERROR_DETAILS) {
      expect(["P0001", "22023", "55P03"], detail).toContain(
        TASK_COMMAND_FAILURE_POLICY[detail].sqlstate,
      );
    }
  });

  it("gives 55P03 exactly the one collision token, and no other detail", () => {
    // The mapper's `55P03` branch consults the detail first and falls back to
    // `stale_pre_state`. That fallback is only safe while the detailed raise on
    // that code is the collision: a second token added here without a matching
    // raise would be dead, and a raise added there without a token here would
    // degrade to "the task changed since the preview" and invite a retry that
    // cannot succeed.
    const under55P03 = TASK_COMMAND_ERROR_DETAILS.filter(
      (detail) => TASK_COMMAND_FAILURE_POLICY[detail].sqlstate === "55P03",
    );
    expect([...under55P03]).toEqual(["2E_CREATION_UNDONE"]);
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

  it("signals staleness with a 55P03 that carries no detail", () => {
    // `src/features/agent/actions.ts` branches on `error.code === "55P03"` alone
    // before it looks at `details`, so a token attached to *this* raise would make
    // Phase 2E the one exception to a convention every staleness gate follows.
    // The raise is asserted with its trailing semicolon, which is what proves the
    // absence — `using errcode = '55P03';` cannot be carrying a DETAIL.
    expect(migration).toContain(
      `raise exception 'Task changed since the preview' using errcode = '55P03';`,
    );
    expect(TASK_COMMAND_FAILURE_POLICY.stale_pre_state.sqlstate).toBe("55P03");
    expect(isTaskCommandErrorDetail("stale_pre_state")).toBe(false);
  });

  it("attaches a detail to every OTHER 55P03 it raises", () => {
    // Slice 2E.4 asserted `not.toMatch(/errcode = '55P03',\s*detail/)` — no
    // detailed 55P03 anywhere. Slice 2E.5 has two of them, so the invariant is
    // restated as the thing that actually protects the mapper: every detailed
    // 55P03 carries a *declared* token. A detailed 55P03 with an undeclared
    // token would fall through `taskCommandErrorDetailFor` and be reported as
    // staleness, which is the degradation this pair of tests exists to stop.
    const detailedFiftyFive = [
      ...migration.matchAll(/errcode = '55P03',\s*detail = '(2E_[A-Z_]+)'/g),
    ].map((match) => match[1]);
    expect(detailedFiftyFive.length).toBeGreaterThan(0);
    for (const detail of detailedFiftyFive) {
      expect(isTaskCommandErrorDetail(detail), detail).toBe(true);
      expect(TASK_COMMAND_FAILURE_POLICY[detail as TaskCommandErrorDetail].sqlstate, detail).toBe(
        "55P03",
      );
    }
  });

  it("raises the two undo-only tokens nowhere but inside the undo handler", () => {
    // Positional, because the split between apply-path and undo-path tokens is
    // what `taskCommandUndoErrorDetailFor` and the agent action rely on: an
    // undo-only token raised by the apply RPC would be reported through the
    // shared undo router's copy for a failure that never involved an undo.
    //
    // Pinned to a literal pair rather than derived from
    // `TASK_COMMAND_UNDO_ERROR_DETAILS`, which since Slice 2E.5 also carries the
    // two *shared* collision tokens — those are raised on both sides on purpose
    // (PRD 2E-DESTRUCTIVE-009's "the same declared code" on every door), and the
    // next assertion is what covers them.
    const handlersBegin = migration.indexOf(
      "create or replace function private.undo_apply_task_command_fields(",
    );
    expect(handlersBegin).toBeGreaterThan(0);
    for (const detail of ["2E_UNDO_RESTORE_INTEGRITY", "2E_UNDO_REMINDER_INTEGRITY"] as const) {
      const clause = `detail = '${detail}'`;
      expect(migration.indexOf(clause), detail).toBeGreaterThan(handlersBegin);
    }
  });

  it("raises the shared collision token on both the apply side and the undo side", () => {
    // 2E-DESTRUCTIVE-009: "every door into that task — undo, `restore_task`, and
    // the recovery affordance — is closed by the same guard". Two of those doors
    // raise, and this is what proves they raise the *same* token rather than two
    // that happen to read alike. The third door does not raise: the candidate
    // listing reads the same private predicate and omits the row.
    const handlersBegin = migration.indexOf(
      "create or replace function private.undo_apply_task_command_fields(",
    );
    const clause = "detail = '2E_CREATION_UNDONE'";
    const first = migration.indexOf(clause);
    const last = migration.lastIndexOf(clause);
    expect(first, "2E_CREATION_UNDONE is not raised on the apply side").toBeGreaterThan(0);
    expect(first, "2E_CREATION_UNDONE is not raised before the handler").toBeLessThan(handlersBegin);
    expect(last, "2E_CREATION_UNDONE is not raised inside the handler").toBeGreaterThan(handlersBegin);
  });

  it("keeps the undo tokens a subset of the declared details", () => {
    const declared: readonly string[] = TASK_COMMAND_ERROR_DETAILS;
    for (const detail of TASK_COMMAND_UNDO_ERROR_DETAILS) {
      expect(declared).toContain(detail);
    }
    expect(TASK_COMMAND_UNDO_ERROR_DETAILS).toHaveLength(3);
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
  it("resolves every undo token under its own declared SQLSTATE", () => {
    // Read from the policy table rather than hardcoded to `P0001`, which is what
    // this asserted before Slice 2E.5 gave two of these tokens `55P03`. Hardcoding
    // it would now make the two collision tokens resolve to null here while
    // resolving correctly in production — a test that passes by asking the wrong
    // question.
    for (const detail of TASK_COMMAND_UNDO_ERROR_DETAILS) {
      const { sqlstate } = TASK_COMMAND_FAILURE_POLICY[detail];
      expect(taskCommandUndoErrorDetailFor(sqlstate as string, detail), detail).toBe(detail);
    }
  });

  it("refuses an undo token arriving under the wrong SQLSTATE", () => {
    // The pairing is the contract, and a mislabelled collision token must not be
    // narrated as a collision.
    expect(taskCommandUndoErrorDetailFor("P0001", "2E_CREATION_UNDONE")).toBeNull();
    expect(taskCommandUndoErrorDetailFor("55P03", "2E_UNDO_RESTORE_INTEGRITY")).toBeNull();
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
