/**
 * Phase 2F pre-code Gate 3, static half — can a Work-surface click reach the
 * Phase 2E mutation contract without changing that contract?
 *
 * The adversarial review (F4) refuted the proposal's stated mechanism by showing
 * that `apply_task_command` demands a nineteen-key pre-state the Work projection
 * cannot supply. Revision 2 replaced the mechanism: read the pre-state from
 * `public.list_task_command_candidates` at click time instead of synthesizing it
 * from the rendered row. This file proves the *static* half of that claim — the
 * half that needs no database — and it proves it against the migration text
 * rather than against a restated copy of it, per ADR-052: a validation that
 * restates a contract it could read is a second source of truth waiting to drift.
 *
 * The behavioural half (does an exact-title query actually return the clicked
 * task within `p_limit`, with duplicates, normalization variants, more than
 * twenty-five owner rows and a second owner in play?) needs a real database and
 * lives in `scripts/phase-2f-gate3-exact-title-reuse.mjs`. Neither half is the
 * gate on its own.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { eligibleStatusesFor } from "./matching";
import { TASK_COMMAND_ACTIONS, type TaskCommandAction } from "./taxonomy";

/**
 * The four Work-surface buttons, and the taxonomy action each must become.
 *
 * `wait_task` and `resume_task` are **not** taxonomy actions — they are the Work
 * surface's own vocabulary (`src/features/operations/actions.ts:129`), and
 * Revision 1 of the proposal never said what they map to. This table is the
 * mapping proposed for 2F.2 and the reason F6 lists it as a missing acceptance
 * criterion; encoding it here makes it reviewable now instead of discovered
 * during implementation.
 *
 * `resume_task` and `reopen_task` both currently land a task on `todo`
 * (`statusByWorkItemAction`, `actions.ts:133-138`) but they are *different*
 * taxonomy actions, because they start from different places: resume is an
 * active-status change, reopen is the declared way back from `completed`. A
 * single mapping for both would make one of them refuse for every row it is
 * offered on.
 */
const WORK_ACTION_MAPPING = {
  complete_task: { taxonomy: "complete_task", patch: null },
  wait_task: { taxonomy: "set_status", patch: { status: "waiting" } },
  resume_task: { taxonomy: "set_status", patch: { status: "todo" } },
  reopen_task: { taxonomy: "reopen_task", patch: null },
} as const satisfies Record<string, { taxonomy: TaskCommandAction; patch: Record<string, string> | null }>;

const APPLY_MIGRATION = "supabase/migrations/202607260059_phase_2e_destructive_confirmation.sql";

/**
 * The pre-state key names the deployed RPC will accept, read out of its own
 * guard rather than transcribed.
 *
 * The guard is a `<> 19` count paired with an `any(array[...])` membership test
 * (`202607260059:876-886`). Both halves matter and both are asserted below: the
 * count means a *missing* key is refused just as hard as an unknown one, which
 * is exactly why "synthesize what the projection has" cannot work.
 */
function preStateContractFromMigration(): { count: number; keys: readonly string[] } {
  const sql = readFileSync(APPLY_MIGRATION, "utf8");
  const guard = /jsonb_object_keys\(p_pre_state\)\)\s*<>\s*(\d+)[\s\S]{0,400}?any\(array\[([\s\S]*?)\]\)/.exec(sql);
  if (!guard) throw new Error(`could not read the pre-state guard from ${APPLY_MIGRATION}`);
  const keys = [...guard[2].matchAll(/'([A-Za-z]+)'/g)].map((match) => match[1]);
  return { count: Number(guard[1]), keys };
}

/**
 * The columns the Work projection actually selects, read out of the query.
 *
 * Read rather than restated for the same reason as above — and because the whole
 * finding is that a reader who *believed* the projection was sufficient was
 * wrong about which columns it has.
 */
function workProjectionColumns(): readonly string[] {
  const source = readFileSync("src/features/daily-cycle/work-projection.ts", "utf8");
  // The *task* select specifically. An earlier `.select("timezone")` in the same
  // file made a first version of this helper read the wrong query and overstate
  // the shortfall by five keys — the failure mode this whole file exists to
  // prevent, caught by the assertion below rather than by review.
  const select = [...source.matchAll(/\.select\("([^"]+)"\)/g)]
    .map((match) => match[1])
    .find((list) => list.includes("status") && list.includes("title"));
  if (!select) throw new Error("could not read the Work projection task select list");
  return select.split(",").map((column) => column.trim());
}

/** `snake_case` column → the `camelCase` pre-state key it would supply. */
function camel(column: string): string {
  return column.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

describe("Gate 3 — pre-state contract", () => {
  it("the deployed RPC requires exactly nineteen named keys", () => {
    const contract = preStateContractFromMigration();
    expect(contract.count).toBe(19);
    expect(contract.keys).toHaveLength(19);
    expect(new Set(contract.keys).size).toBe(19);
  });

  it("the Work projection cannot supply the pre-state, and the shortfall is ten keys", () => {
    const required = preStateContractFromMigration().keys;
    const available = new Set(workProjectionColumns().map(camel));
    const missing = required.filter((key) => !available.has(key));

    // The precise refutation of Revision 1's "expected pre-state from the
    // rendered row". Asserted as an exact list rather than a count so that a
    // future projection change that closes part of the gap has to come here and
    // say so.
    expect(missing).toEqual([
      "completedAt",
      "cancelledAt",
      "createdAt",
      "projectIds",
      "projectNames",
      "contextIds",
      "contextNames",
      "personIds",
      "personNames",
      "personRoles",
    ]);
  });

  it("the task select embeds no relation, so seven of the ten gaps are not column-shaped", () => {
    // Supabase embeds a related table as `table(cols)` inside the select list.
    // The task query has no embed, so the relation arrays cannot be closed by
    // lengthening it.
    expect(workProjectionColumns().join(",")).not.toMatch(/\w+\s*\(/);
  });

  it("relation data exists in the projection, but arrives in separate queries at separate instants", () => {
    const source = readFileSync("src/features/daily-cycle/work-projection.ts", "utf8");
    // **The correction that matters.** The projection is not relation-blind: it
    // fetches `task_projects` / `task_contexts` / `task_people` and then resolves
    // names, so "the projection performs no relation joins" — asserted in the
    // adversarial review and repeated in proposal Revision 2 — is false, and the
    // ten-key shortfall is a property of the *task select*, not of the pipeline.
    for (const relation of ["task_projects", "task_contexts", "task_people"]) {
      expect(source).toContain(relation);
    }

    // And this is why the correction does not rescue Revision 1's mechanism.
    // Those are independent round trips, each observing the database at its own
    // instant, and `apply_task_command` hashes a *single* `p_observed_before`
    // into the request fingerprint alongside the pre-state it is supposed to
    // describe. A witness assembled from five separate reads has no honest
    // single instant to declare, whatever its column count — so the shortfall
    // was never the load-bearing objection.
    const roundTrips = [...source.matchAll(/supabase\s*\n?\s*\.?from\(/g)].length;
    expect(roundTrips).toBeGreaterThan(1);
  });

  it("personRoles has no carrier in the Work DTO at all", () => {
    // `RelationSummary` is `{ id, label }` (`contracts.ts:202-205`), and `people`
    // is typed as `RelationSummary[]`. The role a person holds on a task — which
    // the pre-state requires as `personRoles`, length-matched to `personIds`
    // (`202607260059:922-927`) — is dropped before the DTO is built.
    const contracts = readFileSync("src/features/daily-cycle/contracts.ts", "utf8");
    const summary = /export type RelationSummary = \{([\s\S]*?)\}/.exec(contracts);
    expect(summary).not.toBeNull();
    expect(summary![1]).not.toMatch(/\brole\b/);
  });
});

describe("Gate 3 — Work action mapping", () => {
  it("every Work-surface action maps to a real taxonomy action", () => {
    for (const [workAction, mapping] of Object.entries(WORK_ACTION_MAPPING)) {
      expect(TASK_COMMAND_ACTIONS, `${workAction} maps outside the taxonomy`).toContain(mapping.taxonomy);
    }
  });

  it("resume and reopen map to different actions despite both landing on todo", () => {
    expect(WORK_ACTION_MAPPING.resume_task.taxonomy).not.toBe(WORK_ACTION_MAPPING.reopen_task.taxonomy);
  });

  it("each mapped action carries a non-empty eligible-status set to query with", () => {
    for (const [workAction, mapping] of Object.entries(WORK_ACTION_MAPPING)) {
      const statuses = eligibleStatusesFor(mapping.taxonomy);
      expect(statuses.length, `${workAction} has no eligible statuses`).toBeGreaterThan(0);
    }
  });

  it("reopen is eligible only from completed, and the active actions never are", () => {
    // The behavioural consequence 2F.2 must render: the four buttons are not
    // interchangeable, and a surface that offers `reopen` on an active row is
    // offering a refusal.
    expect(eligibleStatusesFor("reopen_task")).toEqual(["completed"]);
    for (const action of ["complete_task", "set_status"] as const) {
      expect(eligibleStatusesFor(action)).not.toContain("completed");
    }
  });

  it("the Work surface's current status vocabulary is not a superset the taxonomy can absorb", () => {
    // `updateTaskStatus` accepts eight statuses including `cancelled`
    // (`operations/actions.ts:122`), but `cancel_task` is destructive and
    // requires a server-issued confirmation. F13's disposition question stated
    // as an executable fact rather than a paragraph.
    const source = readFileSync("src/features/operations/actions.ts", "utf8");
    const statusEnum = /status: z\.enum\(\[([^\]]+)\]\)/.exec(source);
    expect(statusEnum, "could not read the surface status enum").not.toBeNull();
    const surfaceStatuses = [...statusEnum![1].matchAll(/"(\w+)"/g)].map((m) => m[1]);
    expect(surfaceStatuses).toContain("cancelled");
    expect(eligibleStatusesFor("set_status")).not.toContain("cancelled");
  });
});
