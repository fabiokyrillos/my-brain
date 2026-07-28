import { describe, expect, it } from "vitest";

import { TASK_COMMAND_ACTIONS, actionPolicy } from "./taxonomy";

/**
 * The aggregate remote smoke reads this taxonomy instead of restating it, and
 * these cases are what make that a read rather than a copy.
 *
 * The defect they exist to prevent already happened once, and only a real
 * deployment found it: `scripts/remote-phase-2e-smoke.mjs` sent
 * `p_patch: {}` for `complete_task`, whose canonical patch must carry
 * `status: "completed"`. Every other side of the contract agreed — the RPC
 * (`202607260059`: `required_patch_keys := array['status']`), the pgTAP suite
 * (`jsonb_build_object('status', 'completed')`) and the production path
 * (`preview.ts`'s `buildCanonicalPatch`). The smoke was the only caller that
 * wrote the patch by hand, and it was wrong from the day it was written to the
 * day the chain was deployed, because until then it had never run past its own
 * preflight.
 *
 * These run in the `app` CI job, so a taxonomy change that the reader cannot
 * parse fails there rather than in a manual remote run nobody is watching.
 */
describe("the remote smoke's taxonomy reader", () => {
  it("reads every action the taxonomy declares, in the same order", async () => {
    const { readTaskCommandTaxonomy } = await import("../../../scripts/task-command-taxonomy.mjs");
    const read = readTaskCommandTaxonomy(process.cwd());
    expect(read.actions).toEqual([...TASK_COMMAND_ACTIONS]);
  });

  it("reads every action's targetStatus exactly as the taxonomy declares it", async () => {
    const { readTaskCommandTaxonomy } = await import("../../../scripts/task-command-taxonomy.mjs");
    const read = readTaskCommandTaxonomy(process.cwd());

    const expected = Object.fromEntries(
      TASK_COMMAND_ACTIONS.map((action) => [action, actionPolicy(action).targetStatus]),
    );
    expect(read.targetStatuses).toEqual(expected);
  });

  it("derives the canonical status patch for the actions the smoke applies", async () => {
    const { readTaskCommandTaxonomy, canonicalStatusPatch } = await import(
      "../../../scripts/task-command-taxonomy.mjs"
    );
    const { targetStatuses } = readTaskCommandTaxonomy(process.cwd());

    // The two the aggregate smoke actually sends. Pinned by value rather than
    // by re-deriving them, so a taxonomy edit that moves either destination has
    // to come to this line and say so.
    expect(canonicalStatusPatch("complete_task", targetStatuses)).toEqual({ status: "completed" });
    expect(canonicalStatusPatch("cancel_task", targetStatuses)).toEqual({ status: "cancelled" });
  });

  it("refuses to guess for an action that declares no destination status", async () => {
    const { readTaskCommandTaxonomy, canonicalStatusPatch } = await import(
      "../../../scripts/task-command-taxonomy.mjs"
    );
    const { targetStatuses } = readTaskCommandTaxonomy(process.cwd());

    // `set_status` takes its destination from the patch, not the taxonomy.
    // Returning `{}` here would reintroduce the original defect in a new place.
    expect(actionPolicy("set_status").targetStatus).toBeNull();
    expect(() => canonicalStatusPatch("set_status", targetStatuses)).toThrow(/declares no targetStatus/);
    expect(() => canonicalStatusPatch("not_an_action", targetStatuses)).toThrow(/Unknown task command action/);
  });
});
