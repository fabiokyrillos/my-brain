import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  TASK_COMMAND_ACTIONS,
  TASK_COMMAND_POLICY_VERSION,
  TASK_PRIORITIES,
  TASK_STATUSES,
  actionPolicy,
  touchesReminders,
  type TaskCommandAction,
} from "./taxonomy";
import {
  TASK_MATCH_EVIDENCE,
  TASK_MATCH_LIMITS,
  TASK_MATCH_POLICY_VERSION,
  TASK_MATCH_SCORE_BANDS,
  TASK_MATCH_THRESHOLDS,
  TASK_MATCH_WEIGHTS,
} from "./match-policy";
import { TEMPORAL_LEXICON, TEMPORAL_LEXICON_VERSION } from "./temporal";
import { resolvePriorityTerm, resolveStatusTerm } from "./vocabulary";

/**
 * PRD §10.4 and 2E-MATCH-016: "Changing a weight, threshold, margin or prompt
 * requires bumping the corresponding version in the same commit, **enforced by
 * test**."
 *
 * Format regexes over the version constants do not enforce that — a review
 * demonstrated it by rewriting the policy table and by inverting an instruction
 * in the production prompt, both with a fully green suite. What enforces it is
 * a digest: change the policy and the digest moves, so the commit cannot land
 * until the author updates the digest, and updating the digest is the moment
 * they are asked whether the version moved too.
 *
 * When you legitimately change a policy: update the version constant, run this
 * file, and paste the reported digest in.
 */

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

describe("policy digest", () => {
  it("pins the action taxonomy to its declared version", () => {
    const canonical = TASK_COMMAND_ACTIONS.map((action) => [action, actionPolicy(action)]);
    expect({ version: TASK_COMMAND_POLICY_VERSION, digest: digest(canonical) }).toEqual({
      version: "2026-07-25.1",
      digest: "29ae7e7cdb90cdcd",
    });
  });

  it("pins the status and priority vocabularies to the same version", () => {
    const canonical = [...TASK_STATUSES, ...TASK_PRIORITIES];
    expect({ version: TASK_COMMAND_POLICY_VERSION, digest: digest(canonical) }).toEqual({
      version: "2026-07-25.1",
      digest: "e8c8bb1bd473e41f",
    });
  });

  it("pins the temporal lexicon to its version, which is the policy version", () => {
    // 2E-COMMAND-014 versions the lexicon *under* the policy version; a second
    // free-form constant beside it can drift, and did.
    expect(TEMPORAL_LEXICON_VERSION).toBe(TASK_COMMAND_POLICY_VERSION);
    const canonical = TEMPORAL_LEXICON.map((entry) => [entry.id, entry.rule, String(entry.pattern)]);
    expect({ version: TEMPORAL_LEXICON_VERSION, digest: digest(canonical) }).toEqual({
      version: "2026-07-25.1",
      digest: "a5b7f3be24a9abe1",
    });
  });

  it("pins every matching weight, threshold, limit and band to the match policy version", () => {
    // 2E-MATCH-016. The match policy carries its own version rather than
    // sharing the command contract's: §10.4 stamps `match_policy_version` on
    // every match decision, and a prompt change must not invalidate the
    // attribution of every match already recorded.
    const canonical = [
      TASK_MATCH_WEIGHTS,
      TASK_MATCH_THRESHOLDS,
      TASK_MATCH_LIMITS,
      TASK_MATCH_EVIDENCE,
      TASK_MATCH_SCORE_BANDS,
    ];
    expect({ version: TASK_MATCH_POLICY_VERSION, digest: digest(canonical) }).toEqual({
      version: "2026-07-25.2",
      digest: "2354d889a2db7e15",
    });
  });

  it("keeps the calibration that makes the ambiguity rule mean anything", () => {
    // These are not arbitrary numbers, and a future tuner deserves to be told
    // which relationships the design depends on rather than discovering them
    // by shipping a wrong match.

    // A single exact-title hit must clear the threshold on its own, or PRD
    // §12.1's headline flow becomes a disambiguation list of one.
    expect(TASK_MATCH_WEIGHTS.exactTitle).toBeGreaterThanOrEqual(TASK_MATCH_THRESHOLDS.topScore);

    // A phrase hit must clear it only *with* its token overlap, so a bare
    // fragment cannot carry a command by itself.
    expect(TASK_MATCH_WEIGHTS.titlePhrase).toBeLessThan(TASK_MATCH_THRESHOLDS.topScore);
    expect(TASK_MATCH_WEIGHTS.titlePhrase + TASK_MATCH_WEIGHTS.tokenOverlap)
      .toBeGreaterThanOrEqual(TASK_MATCH_THRESHOLDS.topScore);

    // A signal the user did not express may never resolve the canonical
    // two-identical-titles case of PRD §12.2. Recency is the only such signal,
    // and it is the one that would silently pick "whichever you last touched".
    expect(TASK_MATCH_WEIGHTS.recency).toBeLessThan(TASK_MATCH_THRESHOLDS.minMargin);

    // *No* single non-lexical signal may reach the margin. This started as
    // "only recency", with project and person calibrated at exactly 0.12 so a
    // named relation could break a tie — and a review proved that let one
    // relation hint carry a pair straight from ambiguous to a one-step apply,
    // landing on the task that already held the relation the command was about
    // to add. Identification is what the margin measures, and a hint that also
    // names the patch is not identification.
    for (const weight of [
      TASK_MATCH_WEIGHTS.recency,
      TASK_MATCH_WEIGHTS.referencedProject,
      TASK_MATCH_WEIGHTS.referencedContext,
      TASK_MATCH_WEIGHTS.referencedPerson,
      TASK_MATCH_WEIGHTS.statusMatch,
      TASK_MATCH_WEIGHTS.temporalProximity,
    ]) {
      expect(weight).toBeLessThan(TASK_MATCH_THRESHOLDS.minMargin);
    }

    // The floor must sit below every single-signal contribution, or a candidate
    // the query deliberately qualified would be dropped before it is ranked.
    expect(TASK_MATCH_THRESHOLDS.minCandidateScore)
      .toBeLessThanOrEqual(TASK_MATCH_WEIGHTS.referencedContext);
  });
});

/**
 * PRD §11.2 transcribed. Every column, every action — not a spot check.
 *
 * The previous suite pinned `eligibleFrom` exactly for three of fifteen
 * actions, so widening `set_status` onto `completed` — a route to reopening a
 * task without `reopen_task`'s `completed_at` clearing or its reminder
 * reconciliation — passed the whole suite. A review proved that by mutation.
 */
const NON_TERMINAL = ["inbox", "todo", "in_progress", "waiting", "blocked", "deferred"];
const NEVER_CANCELLED = [...NON_TERMINAL, "completed"];

type Row = {
  eligibleFrom: string[];
  allowedTargetValues: string[] | null;
  changedFields: string[];
  destructive: boolean;
  oneStep: boolean;
  confirm: boolean;
  undo: "restore_fields" | "remove_added_relation";
};

const PRD_TABLE: Record<TaskCommandAction, Row> = {
  complete_task: {
    eligibleFrom: NON_TERMINAL, allowedTargetValues: null,
    changedFields: ["status", "completed_at", "reminders"],
    destructive: false, oneStep: true, confirm: false, undo: "restore_fields",
  },
  reopen_task: {
    eligibleFrom: ["completed"], allowedTargetValues: null,
    changedFields: ["status", "completed_at", "reminders"],
    destructive: false, oneStep: true, confirm: false, undo: "restore_fields",
  },
  set_status: {
    eligibleFrom: NON_TERMINAL, allowedTargetValues: NON_TERMINAL,
    changedFields: ["status"],
    destructive: false, oneStep: true, confirm: false, undo: "restore_fields",
  },
  cancel_task: {
    eligibleFrom: NON_TERMINAL, allowedTargetValues: null,
    changedFields: ["status", "cancelled_at", "reminders"],
    destructive: true, oneStep: false, confirm: true, undo: "restore_fields",
  },
  restore_task: {
    eligibleFrom: ["cancelled"], allowedTargetValues: null,
    changedFields: ["status", "cancelled_at", "reminders"],
    destructive: false, oneStep: false, confirm: false, undo: "restore_fields",
  },
  rename_task: {
    eligibleFrom: NEVER_CANCELLED, allowedTargetValues: null,
    changedFields: ["title"],
    destructive: false, oneStep: true, confirm: false, undo: "restore_fields",
  },
  append_note: {
    eligibleFrom: NEVER_CANCELLED, allowedTargetValues: null,
    changedFields: ["description"],
    destructive: false, oneStep: true, confirm: false, undo: "restore_fields",
  },
  reschedule_due: {
    eligibleFrom: NON_TERMINAL, allowedTargetValues: null,
    changedFields: ["due_at", "intentional_no_due", "no_due_reason", "reminders"],
    destructive: false, oneStep: true, confirm: false, undo: "restore_fields",
  },
  clear_due: {
    eligibleFrom: NON_TERMINAL, allowedTargetValues: null,
    changedFields: ["due_at", "reminders"],
    destructive: false, oneStep: true, confirm: false, undo: "restore_fields",
  },
  set_planned: {
    eligibleFrom: NON_TERMINAL, allowedTargetValues: null,
    changedFields: ["planned_at"],
    destructive: false, oneStep: true, confirm: false, undo: "restore_fields",
  },
  set_priority: {
    eligibleFrom: NON_TERMINAL, allowedTargetValues: ["low", "medium", "high", "urgent"],
    changedFields: ["manual_priority"],
    destructive: false, oneStep: true, confirm: false, undo: "restore_fields",
  },
  assign_project: {
    eligibleFrom: NON_TERMINAL, allowedTargetValues: null,
    changedFields: ["task_projects"],
    destructive: false, oneStep: true, confirm: false, undo: "remove_added_relation",
  },
  assign_context: {
    eligibleFrom: NON_TERMINAL, allowedTargetValues: null,
    changedFields: ["task_contexts"],
    destructive: false, oneStep: true, confirm: false, undo: "remove_added_relation",
  },
  assign_person: {
    eligibleFrom: NON_TERMINAL, allowedTargetValues: null,
    changedFields: ["task_people:involved"],
    destructive: false, oneStep: true, confirm: false, undo: "remove_added_relation",
  },
  set_waiting_on: {
    eligibleFrom: NON_TERMINAL, allowedTargetValues: null,
    changedFields: ["task_people:waiting_on"],
    destructive: false, oneStep: true, confirm: false, undo: "remove_added_relation",
  },
};

describe("PRD §11.2, row for row", () => {
  it("covers every action exactly once", () => {
    expect(Object.keys(PRD_TABLE).sort()).toEqual([...TASK_COMMAND_ACTIONS].sort());
  });

  for (const action of TASK_COMMAND_ACTIONS) {
    it(`implements the ${action} row`, () => {
      const policy = actionPolicy(action);
      const row = PRD_TABLE[action];
      expect([...policy.eligibleFrom].sort(), "eligible source status").toEqual([...row.eligibleFrom].sort());
      expect(
        policy.allowedTargetValues === null ? null : [...policy.allowedTargetValues].sort(),
        "allowed target values",
      ).toEqual(row.allowedTargetValues === null ? null : [...row.allowedTargetValues].sort());
      expect([...policy.changedFields].sort(), "changes").toEqual([...row.changedFields].sort());
      expect(policy.destructive, "destructive").toBe(row.destructive);
      expect(policy.oneStepEligible, "one-step eligible").toBe(row.oneStep);
      expect(policy.requiresConfirmation, "confirmation").toBe(row.confirm);
      expect(policy.undoStrategy, "undo").toBe(row.undo);
    });
  }

  it("derives reminder impact from the changes column rather than declaring it twice", () => {
    for (const action of TASK_COMMAND_ACTIONS) {
      expect(touchesReminders(action), action).toBe(PRD_TABLE[action].changedFields.includes("reminders"));
    }
  });
});

describe("invariants that keep the fail-open default safe", () => {
  it("declares a target field exactly when it declares allowed values", () => {
    // `isAllowedTargetValue` returns true for a null allowed-value set. That is
    // only safe while no action can patch an enumerable field without declaring
    // its bounds.
    for (const action of TASK_COMMAND_ACTIONS) {
      const policy = actionPolicy(action);
      expect(policy.targetValueField === null, action).toBe(policy.allowedTargetValues === null);
    }
  });

  it("lets no action but set_status patch a status", () => {
    // The only structural thing standing between a non-`set_status` action and
    // `patch.status = "cancelled"` is that no other action allows the field.
    for (const action of TASK_COMMAND_ACTIONS) {
      if (action === "set_status") continue;
      expect(actionPolicy(action).allowedPatchFields, action).not.toContain("status");
    }
  });

  it("lets no action but set_priority patch a priority", () => {
    for (const action of TASK_COMMAND_ACTIONS) {
      if (action === "set_priority") continue;
      expect(actionPolicy(action).allowedPatchFields, action).not.toContain("priority");
    }
  });

  it("keeps completed and cancelled out of every action's allowed target values", () => {
    for (const action of TASK_COMMAND_ACTIONS) {
      const allowed = actionPolicy(action).allowedTargetValues ?? [];
      expect(allowed, action).not.toContain("completed");
      expect(allowed, action).not.toContain("cancelled");
    }
  });

  it("gives every action with an empty allowed-patch set no required fields either", () => {
    for (const action of TASK_COMMAND_ACTIONS) {
      const policy = actionPolicy(action);
      if (policy.allowedPatchFields.length === 0) {
        expect(policy.requiredPatchFields, action).toEqual([]);
      }
    }
  });
});

describe("vocabulary covers the database literals", () => {
  it("maps every status literal to itself", () => {
    for (const status of TASK_STATUSES) expect(resolveStatusTerm(status), status).toBe(status);
  });

  it("maps every priority literal to itself", () => {
    for (const priority of TASK_PRIORITIES) expect(resolvePriorityTerm(priority), priority).toBe(priority);
  });

  it("names no value the database CHECK would refuse", () => {
    // Every canonical output must be one of the eight/four literals; a typo in
    // the table would otherwise produce a value that fails at write time.
    for (const term of ["bloqueada", "done", "concluida", "urgente", "critical"]) {
      const status = resolveStatusTerm(term);
      const priority = resolvePriorityTerm(term);
      if (status !== null) expect(TASK_STATUSES, term).toContain(status);
      if (priority !== null) expect(TASK_PRIORITIES, term).toContain(priority);
    }
  });
});
