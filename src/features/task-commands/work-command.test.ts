/**
 * Phase 2F Slice 2F.2 — the Work surface's click-time resolution, behaviourally.
 *
 * What is under test is not "does it call the RPC". It is the four properties
 * the slice exists to establish, each of which the deleted `persistTaskStatus`
 * violated:
 *
 *   1. **One honest instant** (2F-SURFACE-003). The nineteen keys and
 *      `p_observed_before` come from one row of one read, and the pre-state that
 *      travels is exactly the nineteen names the deployed RPC's guard admits —
 *      read out of the migration text rather than transcribed (ADR-052).
 *   2. **The clicked id is authoritative** (2F-SURFACE-004). Selection is by id
 *      out of the whole resolution result, so title drift alone never refuses,
 *      and the outcome carries the *current* title.
 *   3. **Absence refuses, and refuses before writing** (2F-SURFACE-005). An
 *      unresolvable or ineligible click must not reach `apply_task_command` at
 *      all — a refusal that still wrote would be the blind overwrite this slice
 *      retires, wearing a refusal's copy.
 *   4. **The mapping is the taxonomy's** (2F-SURFACE-002). Each Work verb sends
 *      the taxonomy action's own eligible statuses and canonical patch.
 *
 * The client is injected, so all of it is exercisable without a database — the
 * same discipline `candidates.ts` and `apply.ts` were written for.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { TaskCandidateQueryError } from "./candidates";
import { TASK_MATCH_LIMITS } from "./match-policy";
import { eligibleStatusesFor, type TaskCandidateRow } from "./matching";
import { WORK_ACTION_MAPPING, WORK_SURFACE_ACTIONS } from "./taxonomy";
import {
  WorkCommandInputError,
  applyWorkCommand,
  resolveWorkCommand,
  titleWordsFor,
} from "./work-command";

const APPLY_MIGRATION = "supabase/migrations/202607260059_phase_2e_destructive_confirmation.sql";

const NOW = "2026-07-29T12:00:00.000Z";
const OBSERVED = "2026-07-29T11:59:58.000Z";
const TIME_ZONE = "America/Sao_Paulo";
const OWNER = "11111111-1111-4111-8111-111111111111";
const STRANGER = "22222222-2222-4222-8222-222222222222";
const TASK_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_TASK_ID = "55555555-5555-4555-8555-555555555555";
const UNDO_ID = "44444444-4444-4444-8444-444444444444";
const OPERATION_KEY = "aaaaaaaa-1111-4111-8111-111111111111";
const FINGERPRINT = "3b1f0c8a".repeat(8);
const UNDO_EXPIRES_AT = "2026-07-30T12:00:00.000000+00";
const TITLE = "Send the quarterly report";

/**
 * The pre-state key names the deployed RPC accepts, read out of its own guard.
 *
 * Identical to `work-surface-reuse.test.ts`'s reader and deliberately so: the
 * gate proved the Work *projection* cannot satisfy this contract, and this file
 * proves the resolution path does. Both must be measuring the same nineteen.
 */
function preStateKeysFromMigration(): readonly string[] {
  const sql = readFileSync(APPLY_MIGRATION, "utf8");
  const guard = /jsonb_object_keys\(p_pre_state\)\)\s*<>\s*(\d+)[\s\S]{0,400}?any\(array\[([\s\S]*?)\]\)/.exec(sql);
  if (guard === null) throw new Error(`could not read the pre-state guard from ${APPLY_MIGRATION}`);
  const keys = [...guard[2].matchAll(/'([A-Za-z]+)'/g)].map((match) => match[1]);
  if (keys.length !== Number(guard[1])) throw new Error("the guard's count and key list disagree");
  return keys;
}

function taskRow(overrides: Partial<TaskCandidateRow> = {}): TaskCandidateRow {
  const status = overrides.status ?? "todo";
  return {
    taskId: TASK_ID,
    ownerId: OWNER,
    title: TITLE,
    description: "Numbers from finance.",
    status,
    dueAt: null,
    plannedAt: null,
    manualPriority: null,
    completedAt: status === "completed" ? "2026-07-28T10:00:00.000Z" : null,
    cancelledAt: null,
    intentionalNoDue: false,
    noDueReason: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-28T09:00:00.000Z",
    projectIds: [],
    projectNames: [],
    contextIds: [],
    contextNames: [],
    personIds: [],
    personNames: [],
    personRoles: [],
    projectHintMatched: false,
    contextHintMatched: false,
    personHintMatched: false,
    lastAuditedAt: null,
    observedBefore: OBSERVED,
    prefilterTier: 0,
    tokenOverlap: 1,
    queryTokenCount: 1,
    effectiveLimit: TASK_MATCH_LIMITS.candidates,
    projectRefId: null,
    contextRefId: null,
    personRefId: null,
    projectRefName: null,
    contextRefName: null,
    personRefName: null,
    scheduledReminderCount: 0,
    nextReminderAt: null,
    ...overrides,
  };
}

/** The snake_case row shape the RPC really returns; the reader camel-cases it. */
function wireRow(row: TaskCandidateRow): Record<string, unknown> {
  return {
    task_id: row.taskId,
    owner_id: row.ownerId,
    title: row.title,
    description: row.description,
    status: row.status,
    due_at: row.dueAt,
    planned_at: row.plannedAt,
    manual_priority: row.manualPriority,
    completed_at: row.completedAt,
    cancelled_at: row.cancelledAt,
    intentional_no_due: row.intentionalNoDue,
    no_due_reason: row.noDueReason,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    project_ids: row.projectIds,
    project_names: row.projectNames,
    context_ids: row.contextIds,
    context_names: row.contextNames,
    person_ids: row.personIds,
    person_names: row.personNames,
    person_roles: row.personRoles,
    project_hint_matched: row.projectHintMatched,
    context_hint_matched: row.contextHintMatched,
    person_hint_matched: row.personHintMatched,
    last_audited_at: row.lastAuditedAt,
    observed_before: row.observedBefore,
    prefilter_tier: row.prefilterTier,
    token_overlap: row.tokenOverlap,
    query_token_count: row.queryTokenCount,
    effective_limit: row.effectiveLimit,
    project_ref_id: row.projectRefId,
    context_ref_id: row.contextRefId,
    person_ref_id: row.personRefId,
    project_ref_name: row.projectRefName,
    context_ref_name: row.contextRefName,
    person_ref_name: row.personRefName,
    scheduled_reminder_count: row.scheduledReminderCount,
    next_reminder_at: row.nextReminderAt,
  };
}

type Call = { readonly fn: string; readonly args: Record<string, unknown> };

const appliedResult = {
  outcome: "applied",
  task_id: TASK_ID,
  action: "complete_task",
  undo_id: UNDO_ID,
  idempotent: false,
  request_fingerprint: FINGERPRINT,
  reminders_cancelled: 0,
  reminder_created_id: null,
  undo_expires_at: UNDO_EXPIRES_AT,
};

function client(options: {
  readonly rows?: readonly TaskCandidateRow[];
  readonly apply?: Record<string, unknown>;
  readonly applyError?: { message: string; code?: string; details?: string };
}) {
  const calls: Call[] = [];
  const rows = options.rows ?? [taskRow()];
  return {
    calls,
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      if (fn === "list_task_command_candidates") {
        return Promise.resolve({ data: rows.map(wireRow), error: null });
      }
      if (options.applyError) return Promise.resolve({ data: null, error: options.applyError });
      return Promise.resolve({
        data: { ...appliedResult, action: args.p_action, ...(options.apply ?? {}) },
        error: null,
      });
    },
  } as unknown as Parameters<typeof applyWorkCommand>[0] & { calls: Call[] };
}

function input(overrides: Partial<Parameters<typeof applyWorkCommand>[1]> = {}) {
  return {
    ownerId: OWNER,
    taskId: TASK_ID,
    title: TITLE,
    action: "complete_task" as const,
    operationKey: OPERATION_KEY,
    now: NOW,
    timeZone: TIME_ZONE,
    ...overrides,
  };
}

describe("2F-SURFACE-002 — every Work verb resolves as its taxonomy action", () => {
  for (const action of WORK_SURFACE_ACTIONS) {
    const mapping = WORK_ACTION_MAPPING[action];
    const status = action === "reopen_task" ? "completed" : "todo";

    it(`${action} queries with ${mapping.taxonomy}'s own eligible statuses`, async () => {
      const fake = client({ rows: [taskRow({ status })] });
      const resolution = await resolveWorkCommand({ ...input({ action }), client: fake });

      expect(resolution.status).toBe("resolved");
      const listCall = fake.calls.find((call) => call.fn === "list_task_command_candidates");
      expect(listCall?.args.p_eligible_statuses).toEqual([...eligibleStatusesFor(mapping.taxonomy)]);
      expect(listCall?.args.p_title_query).toBe(TITLE);
    });

    it(`${action} sends ${mapping.taxonomy} and the taxonomy's canonical patch`, async () => {
      const fake = client({ rows: [taskRow({ status })] });
      const outcome = await applyWorkCommand(fake, input({ action }));

      const applyCall = fake.calls.find((call) => call.fn === "apply_task_command");
      expect(applyCall?.args.p_action).toBe(mapping.taxonomy);
      expect(outcome.status).toBe("applied");
      // Every Work verb lands on a status, and none of them lands on `cancelled`.
      const patch = applyCall?.args.p_patch as Record<string, unknown>;
      expect(Object.keys(patch)).toEqual(["status"]);
      expect(patch.status).not.toBe("cancelled");
    });
  }

  it("wait and resume send the mapped destination; complete and reopen the taxonomy's", async () => {
    const destinations: Record<string, string> = {};
    for (const action of WORK_SURFACE_ACTIONS) {
      const fake = client({ rows: [taskRow({ status: action === "reopen_task" ? "completed" : "todo" })] });
      await applyWorkCommand(fake, input({ action }));
      const applyCall = fake.calls.find((call) => call.fn === "apply_task_command");
      destinations[action] = (applyCall?.args.p_patch as { status: string }).status;
    }
    expect(destinations).toEqual({
      complete_task: "completed",
      wait_task: "waiting",
      resume_task: "todo",
      reopen_task: "todo",
    });
  });
});

describe("2F-SURFACE-003 — one row, one read, one instant", () => {
  it("sends exactly the nineteen keys the deployed guard admits", async () => {
    const fake = client({});
    await applyWorkCommand(fake, input());

    const applyCall = fake.calls.find((call) => call.fn === "apply_task_command");
    const preState = applyCall?.args.p_pre_state as Record<string, unknown>;
    const required = preStateKeysFromMigration();

    // The guard is a `<> 19` count *and* a membership test, so both halves are
    // asserted: a missing key is refused exactly as hard as an unknown one.
    expect(Object.keys(preState)).toHaveLength(19);
    expect(Object.keys(preState).sort()).toEqual([...required].sort());
  });

  it("declares the database's instant, never the injected clock", async () => {
    const fake = client({});
    await applyWorkCommand(fake, input());

    const applyCall = fake.calls.find((call) => call.fn === "apply_task_command");
    expect(applyCall?.args.p_observed_before).toBe(OBSERVED);
    expect(applyCall?.args.p_observed_before).not.toBe(NOW);
  });

  it("reads the pre-state once — there is no second read of any kind", async () => {
    const fake = client({});
    await applyWorkCommand(fake, input());

    expect(fake.calls.map((call) => call.fn)).toEqual([
      "list_task_command_candidates",
      "apply_task_command",
    ]);
  });

  it("carries the resolved row's values, not the caller's", async () => {
    const fake = client({ rows: [taskRow({ description: "Moved on.", updatedAt: "2026-07-29T11:00:00.000Z" })] });
    const outcome = await applyWorkCommand(fake, input());

    const applyCall = fake.calls.find((call) => call.fn === "apply_task_command");
    const preState = applyCall?.args.p_pre_state as Record<string, unknown>;
    expect(preState.description).toBe("Moved on.");
    expect(preState.updatedAt).toBe("2026-07-29T11:00:00.000Z");
    expect(outcome.status).toBe("applied");
  });
});

describe("2F-SURFACE-004 — the clicked id is authoritative", () => {
  it("applies against a row whose title drifted, and reports the current title", async () => {
    const drifted = taskRow({ title: "Completely different wording now" });
    const fake = client({ rows: [drifted] });

    const outcome = await applyWorkCommand(fake, input({ title: TITLE }));

    expect(outcome.status).toBe("applied");
    if (outcome.status !== "applied") throw new Error("unreachable");
    // The stale rendered title was the query hint; the outcome renders what
    // resolution returned.
    expect(outcome.resolution.preState.title).toBe("Completely different wording now");
    const applyCall = fake.calls.find((call) => call.fn === "apply_task_command");
    expect((applyCall?.args.p_pre_state as { title: string }).title).toBe(
      "Completely different wording now",
    );
  });

  it("selects by id out of the whole result, not out of a ranked subset", async () => {
    // Six rows sharing a title would exhaust `TASK_MATCH_LIMITS.ranked`, and the
    // clicked row is deliberately last. Routing this through `rankTaskCandidates`
    // would drop it and refuse a legitimate click.
    const others = Array.from({ length: 6 }, (_, index) =>
      taskRow({ taskId: `9999999${index}-9999-4999-8999-999999999999`.slice(0, 36) }),
    );
    const rows = [...others, taskRow({ taskId: TASK_ID })];
    expect(rows.length).toBeGreaterThan(TASK_MATCH_LIMITS.ranked);

    const fake = client({ rows });
    const outcome = await applyWorkCommand(fake, input());

    expect(outcome.status).toBe("applied");
    const applyCall = fake.calls.find((call) => call.fn === "apply_task_command");
    expect(applyCall?.args.p_task_id).toBe(TASK_ID);
  });

  it("resolves a title too long to be a valid hint by truncating the query, not the click", async () => {
    const longTitle = Array.from({ length: 40 }, (_, index) => `word${index}`).join(" ");
    const fake = client({ rows: [taskRow({ title: longTitle })] });

    const outcome = await applyWorkCommand(fake, input({ title: longTitle }));

    expect(outcome.status).toBe("applied");
    const listCall = fake.calls.find((call) => call.fn === "list_task_command_candidates");
    expect(String(listCall?.args.p_title_query).split(" ")).toHaveLength(12);
  });

  it("truncates to twelve words and clamps each word, matching the hint schema", () => {
    expect(titleWordsFor("a b c d e f g h i j k l m n")).toHaveLength(12);
    expect(titleWordsFor("  spaced   out  ")).toEqual(["spaced", "out"]);
    expect(titleWordsFor("x".repeat(400))[0]).toHaveLength(160);
    expect(titleWordsFor("   ")).toEqual([]);
  });
});

describe("2F-SURFACE-005 — an unresolvable click refuses, and writes nothing", () => {
  it("refuses when the clicked id is absent from the resolution result", async () => {
    const fake = client({ rows: [taskRow({ taskId: OTHER_TASK_ID })] });

    const outcome = await applyWorkCommand(fake, input());

    expect(outcome).toEqual({ status: "refused", refusal: "unresolvable" });
    // The property that matters: no write was attempted. A refusal that still
    // called the RPC would be the blind overwrite wearing a refusal's copy.
    expect(fake.calls.map((call) => call.fn)).toEqual(["list_task_command_candidates"]);
  });

  it("refuses when the result is empty", async () => {
    const fake = client({ rows: [] });

    const outcome = await applyWorkCommand(fake, input());

    expect(outcome).toEqual({ status: "refused", refusal: "unresolvable" });
    expect(fake.calls).toHaveLength(1);
  });

  it("refuses an ineligible row rather than sending a command the RPC would reject", async () => {
    // Unreachable through the real RPC — `p_eligible_statuses` filters — which is
    // exactly why it is asserted here: the branch exists so a widened query, or a
    // hand-assembled row set, refuses instead of raising a bare SQLSTATE.
    const fake = client({ rows: [taskRow({ status: "completed" })] });

    const outcome = await applyWorkCommand(fake, input({ action: "complete_task" }));

    expect(outcome).toEqual({ status: "refused", refusal: "ineligible" });
    expect(fake.calls).toHaveLength(1);
  });

  it("never reads public.tasks — the only table this path touches is via the two RPCs", async () => {
    const fake = client({});
    await applyWorkCommand(fake, input());
    expect(fake.calls.every((call) => call.fn.endsWith("_command") || call.fn.endsWith("_candidates"))).toBe(true);
  });
});

describe("2F-OWNERSHIP-001 — cross-owner denial, proven non-vacuously", () => {
  it("resolves the owner's own row first, so the denial below is not vacuous", async () => {
    const fake = client({ rows: [taskRow()] });
    const resolution = await resolveWorkCommand({ ...input(), client: fake });

    // The Gate 3 lesson as a permanent fixture: a zero-row result must never let
    // an isolation check pass by finding nothing.
    expect(resolution.status).toBe("resolved");
  });

  it("raises rather than filtering when a row owned by someone else comes back", async () => {
    const fake = client({ rows: [taskRow({ ownerId: STRANGER })] });

    await expect(resolveWorkCommand({ ...input(), client: fake })).rejects.toBeInstanceOf(
      TaskCandidateQueryError,
    );
    expect(fake.calls).toHaveLength(1);
  });

  it("refuses a stranger's task id, because it cannot be in an auth.uid()-scoped result", async () => {
    const fake = client({ rows: [taskRow()] });

    const outcome = await applyWorkCommand(fake, input({ taskId: OTHER_TASK_ID }));

    expect(outcome).toEqual({ status: "refused", refusal: "unresolvable" });
  });
});

describe("2F-SURFACE-006/007 — replay, and what the apply reports back", () => {
  it("reports a replay of one minted key as replayed rather than as a second write", async () => {
    const fake = client({ apply: { idempotent: true } });

    const outcome = await applyWorkCommand(fake, input());

    expect(outcome.status).toBe("applied");
    if (outcome.status !== "applied") throw new Error("unreachable");
    expect(outcome.result.outcome).toBe("applied");
    if (outcome.result.outcome !== "applied") throw new Error("unreachable");
    expect(outcome.result.replayed).toBe(true);
    expect(outcome.result.undoId).toBe(UNDO_ID);
  });

  it("sends the same operation key on both submits, which is what makes replay detectable", async () => {
    const first = client({});
    const second = client({ apply: { idempotent: true } });
    await applyWorkCommand(first, input());
    await applyWorkCommand(second, input());

    const key = (calls: readonly Call[]) =>
      calls.find((call) => call.fn === "apply_task_command")?.args.p_operation_key;
    expect(key(first.calls)).toBe(OPERATION_KEY);
    expect(key(second.calls)).toBe(key(first.calls));
  });

  it("reports the reminder count the RPC reconciled, and invents none", async () => {
    const fake = client({ apply: { reminders_cancelled: 2 } });

    const outcome = await applyWorkCommand(fake, input());

    expect(outcome.status).toBe("applied");
    if (outcome.status !== "applied" || outcome.result.outcome !== "applied") {
      throw new Error("unreachable");
    }
    expect(outcome.result.remindersCancelled).toBe(2);
  });

  it("resolves a declared failure as an outcome instead of throwing", async () => {
    const fake = client({
      applyError: { message: "stale", code: "55P03", details: "" },
    });

    const outcome = await applyWorkCommand(fake, input());

    expect(outcome.status).toBe("applied");
    if (outcome.status !== "applied") throw new Error("unreachable");
    expect(outcome.result.outcome).toBe("rejected_stale");
    if (outcome.result.outcome !== "rejected_stale") throw new Error("unreachable");
    expect(outcome.result.failure).toBe("stale_pre_state");
  });
});

describe("preconditions the surface must not be able to violate", () => {
  it("raises on an operation key that is not a uuid, rather than sending it", async () => {
    const fake = client({});

    await expect(
      applyWorkCommand(fake, input({ operationKey: "not-a-uuid" })),
    ).rejects.toBeInstanceOf(WorkCommandInputError);
    expect(fake.calls).toHaveLength(0);
  });
});
