/**
 * Slice D2 — the task detail surface's click-time resolution, behaviourally.
 *
 * `work-command.test.ts` establishes four properties for the four status verbs.
 * This file establishes that the generalised seam keeps all four while adding
 * the three the remaining eleven verbs need:
 *
 *   5. **A user-entered value that fails validation is an outcome, not a
 *      throw.** `work-command.ts` throws, correctly: its patch is pinned data
 *      and reaching the failure means the surface and the taxonomy disagree.
 *      Here the value came from a person, so the same failure is an ordinary
 *      thing to be told.
 *   6. **A relation verb carries the id SQL resolved.** The canonical patch for
 *      `assign_project` must contain a `projectId`; a patch without one asks the
 *      RPC for nothing, is answered `no_change`, and tells the user their edit
 *      made no difference when it was never sent.
 *   7. **The known id is never ranked.** Selection is out of the whole result,
 *      so a title that drifted since render does not refuse a legitimate edit.
 *
 * The client is injected, so all of it is exercisable without a database.
 */

import { describe, expect, it } from "vitest";

import { applyDetailCommand, resolveDetailCommand } from "./detail-command";
import { TASK_MATCH_LIMITS } from "./match-policy";
import { eligibleStatusesFor, type TaskCandidateRow } from "./matching";
import { actionPolicy, type TaskCommandAction } from "./taxonomy";

const NOW = "2026-07-30T12:00:00.000Z";
const OBSERVED = NOW;
const TIME_ZONE = "America/Sao_Paulo";
const OWNER = "11111111-1111-4111-8111-111111111111";
const TASK_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_TASK_ID = "55555555-5555-4555-8555-555555555555";
const PROJECT_ID = "66666666-6666-4666-8666-666666666666";
const PERSON_ID = "77777777-7777-4777-8777-777777777777";
const CONTEXT_ID = "88888888-8888-4888-8888-888888888888";
const UNDO_ID = "44444444-4444-4444-8444-444444444444";
const OPERATION_KEY = "aaaaaaaa-1111-4111-8111-111111111111";
const FINGERPRINT = "3b1f0c8a".repeat(8);
const UNDO_EXPIRES_AT = "2026-07-31T12:00:00.000000+00";
const TITLE = "Enviar a proposta da Aurora";

function taskRow(overrides: Partial<TaskCandidateRow> = {}): TaskCandidateRow {
  const status = overrides.status ?? "todo";
  return {
    taskId: TASK_ID,
    ownerId: OWNER,
    title: TITLE,
    description: "Conferir os números antes.",
    status,
    dueAt: null,
    plannedAt: null,
    manualPriority: null,
    completedAt: status === "completed" ? "2026-07-28T10:00:00.000Z" : null,
    cancelledAt: status === "cancelled" ? "2026-07-28T10:00:00.000Z" : null,
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
  action: "rename_task",
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
} = {}) {
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
  } as unknown as Parameters<typeof applyDetailCommand>[0] & { calls: Call[] };
}

function input(
  overrides: Partial<Parameters<typeof applyDetailCommand>[1]> = {},
): Parameters<typeof applyDetailCommand>[1] {
  return {
    ownerId: OWNER,
    taskId: TASK_ID,
    title: TITLE,
    action: "rename_task",
    patch: { title: "Enviar a proposta revisada" },
    operationKey: OPERATION_KEY,
    now: NOW,
    timeZone: TIME_ZONE,
    ...overrides,
  };
}

function applyArgs(fake: { calls: Call[] }): Record<string, unknown> {
  const call = fake.calls.find((entry) => entry.fn === "apply_task_command");
  if (call === undefined) throw new Error("apply_task_command was never called");
  return call.args;
}

/** The eleven verbs the detail surface composes, and a value each accepts. */
const VERBS: readonly {
  readonly action: TaskCommandAction;
  readonly patch: Record<string, string>;
  readonly status?: string;
  readonly row?: Partial<TaskCandidateRow>;
}[] = [
  { action: "rename_task", patch: { title: "Outro título" } },
  { action: "append_note", patch: { note: "Falei com a Marina." } },
  { action: "reschedule_due", patch: { dueAt: "2026-08-15" } },
  { action: "clear_due", patch: {} },
  { action: "set_planned", patch: { plannedAt: "2026-08-15" } },
  { action: "set_priority", patch: { priority: "high" } },
  { action: "assign_project", patch: { projectRef: "Aurora" }, row: { projectRefId: PROJECT_ID } },
  { action: "assign_context", patch: { contextRef: "Trabalho" }, row: { contextRefId: CONTEXT_ID } },
  { action: "assign_person", patch: { personRef: "Marina" }, row: { personRefId: PERSON_ID } },
  { action: "set_waiting_on", patch: { personRef: "Marina" }, row: { personRefId: PERSON_ID } },
  { action: "cancel_task", patch: {} },
  { action: "restore_task", patch: {}, status: "cancelled" },
];

describe("2F-SURFACE-002 — every detail verb resolves as its own taxonomy action", () => {
  for (const verb of VERBS) {
    it(`${verb.action} queries with its own eligible statuses and applies as itself`, async () => {
      const fake = client({
        rows: [taskRow({ status: verb.status ?? "todo", ...verb.row })],
      });
      const outcome = await applyDetailCommand(
        fake,
        input({ action: verb.action, patch: verb.patch }),
      );

      expect(outcome.status).toBe("applied");
      const listCall = fake.calls.find((call) => call.fn === "list_task_command_candidates");
      expect(listCall?.args.p_eligible_statuses).toEqual([...eligibleStatusesFor(verb.action)]);
      expect(applyArgs(fake).p_action).toBe(verb.action);
    });
  }
});

describe("2F-SURFACE-003 — one honest instant, one observation", () => {
  it("sends the pre-state and the instant the same read produced", async () => {
    const fake = client();
    await applyDetailCommand(fake, input());

    const args = applyArgs(fake);
    expect(args.p_observed_before).toBe(OBSERVED);
    // The nineteen keys the deployed guard admits, projected from that one row.
    expect(Object.keys(args.p_pre_state as Record<string, unknown>)).toHaveLength(19);
    expect((args.p_pre_state as { title: string }).title).toBe(TITLE);
  });

  it("never reads the ambient clock — the injected instant is what the query sends", async () => {
    const fake = client();
    await resolveDetailCommand({ ...input(), client: fake });

    const listCall = fake.calls.find((call) => call.fn === "list_task_command_candidates");
    expect(listCall?.args.p_observed_before).toBe(NOW);
  });
});

describe("2F-SURFACE-004 — the opened task's id is authoritative", () => {
  it("selects by id even when the rendered title has drifted", async () => {
    const fake = client({ rows: [taskRow({ title: "Um título completamente diferente" })] });
    const outcome = await applyDetailCommand(fake, input({ title: "O título antigo" }));

    expect(outcome.status).toBe("applied");
    if (outcome.status !== "applied") return;
    // The title resolution returned, never the one the page was rendered with.
    expect(outcome.resolution.preState.title).toBe("Um título completamente diferente");
  });

  it("selects by id out of the whole result, not out of a ranked prefix", async () => {
    // Six rows sharing a title is exactly the case a ranker capped at five would
    // drop, and the one 2F-SURFACE-004 says must still resolve.
    const rows = [
      ...Array.from({ length: 5 }, (_, index) =>
        taskRow({ taskId: `0000000${index}-0000-4000-8000-000000000000` })),
      taskRow(),
    ];
    const outcome = await applyDetailCommand(client({ rows }), input());
    expect(outcome.status).toBe("applied");
  });

  it("refuses a task the resolution result does not contain, and writes nothing", async () => {
    const fake = client({ rows: [taskRow({ taskId: OTHER_TASK_ID })] });
    const outcome = await applyDetailCommand(fake, input());

    expect(outcome).toEqual({ status: "refused", refusal: { kind: "unresolvable" } });
    expect(fake.calls.map((call) => call.fn)).toEqual(["list_task_command_candidates"]);
  });

  it("refuses a row whose status no longer admits the action, and writes nothing", async () => {
    // `p_eligible_statuses` already filters, so this is defence in depth: a
    // hand-assembled row set must refuse rather than send a command the RPC
    // would reject with a raw SQLSTATE.
    const fake = client({ rows: [taskRow({ status: "completed" })] });
    const outcome = await applyDetailCommand(fake, input({ action: "set_priority", patch: { priority: "high" } }));

    expect(outcome).toEqual({ status: "refused", refusal: { kind: "ineligible" } });
    expect(fake.calls.map((call) => call.fn)).toEqual(["list_task_command_candidates"]);
  });
});

describe("a user-entered value is refused, never thrown", () => {
  it("refuses a date beyond the lexicon's window as needs_clarification", async () => {
    const fake = client();
    const outcome = await applyDetailCommand(
      fake,
      input({ action: "reschedule_due", patch: { dueAt: "2035-01-01" } }),
    );

    expect(outcome).toEqual({
      status: "refused",
      refusal: { kind: "needs_clarification", field: "dueAt" },
    });
    // Refused before the read, so nothing was even looked up.
    expect(fake.calls).toHaveLength(0);
  });

  it("refuses a complete ISO instant, which the lexicon deliberately will not resolve", async () => {
    const outcome = await applyDetailCommand(
      client(),
      input({ action: "reschedule_due", patch: { dueAt: "2026-08-15T17:00:00.000Z" } }),
    );
    expect(outcome).toMatchObject({ status: "refused", refusal: { kind: "needs_clarification" } });
  });

  it("refuses a title longer than the contract admits, with the schema's own reason", async () => {
    const outcome = await applyDetailCommand(
      client(),
      input({ patch: { title: "x".repeat(400) } }),
    );
    expect(outcome).toEqual({
      status: "refused",
      refusal: { kind: "invalid", reason: "value_too_long", field: "title" },
    });
  });

  it("refuses a priority the taxonomy does not have, distinctly from one it forbids", async () => {
    const outcome = await applyDetailCommand(
      client(),
      input({ action: "set_priority", patch: { priority: "catastrófica" } }),
    );
    expect(outcome).toEqual({
      status: "refused",
      refusal: { kind: "invalid", reason: "unrecognized_value", field: "priority" },
    });
  });

  it("refuses a status value the action may not reach as unsupported, not as invalid", async () => {
    // 2E-COMMAND-017. `set_status` reaching `cancelled` would be an unconfirmed
    // route to the transition `cancel_task` exists to guard, and the reason code
    // has to say so rather than reporting a shape error.
    const outcome = await applyDetailCommand(
      client(),
      input({ action: "set_status", patch: { status: "cancelled" } }),
    );
    expect(outcome).toEqual({
      status: "refused",
      refusal: { kind: "unsupported", reason: "value_not_allowed_for_action", field: "status" },
    });
  });

  it("refuses a patch field the action does not change", async () => {
    const outcome = await applyDetailCommand(
      client(),
      input({ action: "rename_task", patch: { priority: "high" } }),
    );
    expect(outcome).toMatchObject({
      status: "refused",
      refusal: { kind: "invalid", reason: "forbidden_patch_field", field: "priority" },
    });
  });
});

describe("the relation verbs carry the id SQL resolved", () => {
  it("puts the resolved project id in the canonical patch", async () => {
    const fake = client({ rows: [taskRow({ projectRefId: PROJECT_ID, projectRefName: "Aurora" })] });
    await applyDetailCommand(
      fake,
      input({ action: "assign_project", patch: { projectRef: "Aurora" } }),
    );
    expect(applyArgs(fake).p_patch).toEqual({ projectId: PROJECT_ID });
  });

  it("puts the resolved context id in the canonical patch", async () => {
    const fake = client({ rows: [taskRow({ contextRefId: CONTEXT_ID })] });
    await applyDetailCommand(
      fake,
      input({ action: "assign_context", patch: { contextRef: "Trabalho" } }),
    );
    expect(applyArgs(fake).p_patch).toEqual({ contextId: CONTEXT_ID });
  });

  it("distinguishes the two person roles, which are otherwise identical policies", async () => {
    const involved = client({ rows: [taskRow({ personRefId: PERSON_ID })] });
    await applyDetailCommand(
      involved,
      input({ action: "assign_person", patch: { personRef: "Marina" } }),
    );
    expect(applyArgs(involved).p_patch).toEqual({ personId: PERSON_ID, personRole: "involved" });

    const waiting = client({ rows: [taskRow({ personRefId: PERSON_ID })] });
    await applyDetailCommand(
      waiting,
      input({ action: "set_waiting_on", patch: { personRef: "Marina" } }),
    );
    expect(applyArgs(waiting).p_patch).toEqual({ personId: PERSON_ID, personRole: "waiting_on" });
  });

  it("refuses when the reference names no single owned entity, and writes nothing", async () => {
    // `resolve_owned_entity_exact` returns null both when nothing matches and
    // when more than one does. Applying anyway would send a patch asking for
    // nothing and report `no_change` — telling the user their edit made no
    // difference when it was never sent.
    const fake = client({ rows: [taskRow({ projectRefId: null })] });
    const outcome = await applyDetailCommand(
      fake,
      input({ action: "assign_project", patch: { projectRef: "Aurora" } }),
    );

    expect(outcome).toEqual({ status: "refused", refusal: { kind: "relation_unresolved" } });
    expect(fake.calls.map((call) => call.fn)).toEqual(["list_task_command_candidates"]);
  });

  it("sends the reference to SQL for resolution rather than resolving it here", async () => {
    const fake = client({ rows: [taskRow({ projectRefId: PROJECT_ID })] });
    await applyDetailCommand(
      fake,
      input({ action: "assign_project", patch: { projectRef: "Aurora" } }),
    );
    const listCall = fake.calls.find((call) => call.fn === "list_task_command_candidates");
    expect(listCall?.args.p_project_ref).toBe("Aurora");
  });
});

describe("the value verbs build the patch the taxonomy declares", () => {
  it("renames to the submitted title", async () => {
    const fake = client();
    await applyDetailCommand(fake, input({ patch: { title: "Enviar a proposta revisada" } }));
    expect(applyArgs(fake).p_patch).toEqual({ title: "Enviar a proposta revisada" });
  });

  it("appends a note onto the description rather than replacing it", async () => {
    const fake = client({ rows: [taskRow({ description: "Conferir os números." })] });
    await applyDetailCommand(
      fake,
      input({ action: "append_note", patch: { note: "Falei com a Marina." } }),
    );
    expect(applyArgs(fake).p_patch).toEqual({
      description: "Conferir os números.\n\nFalei com a Marina.",
    });
  });

  it("resolves a calendar date in the caller's own zone, never as a client instant", async () => {
    const fake = client();
    await applyDetailCommand(
      fake,
      input({ action: "reschedule_due", patch: { dueAt: "2026-08-15" } }),
    );
    const patch = applyArgs(fake).p_patch as { dueAt: string };
    // The lexicon owns the instant; what must hold is that it lands on the day
    // the user picked *in their zone*, not in the server's.
    const local = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date(patch.dueAt));
    expect(local).toBe("2026-08-15");
  });

  it("moves the two no-due flags with a due date, so the check constraint cannot raise", async () => {
    // 2E-UPDATE-012: `tasks_no_due_consistency_check` forbids a due date on an
    // intentionally-undated task, so the flags travel atomically with it.
    const fake = client({ rows: [taskRow({ intentionalNoDue: true, noDueReason: "sem prazo" })] });
    await applyDetailCommand(
      fake,
      input({ action: "reschedule_due", patch: { dueAt: "2026-08-15" } }),
    );
    expect(applyArgs(fake).p_patch).toMatchObject({ intentionalNoDue: false, noDueReason: null });
  });

  it("clears a due date to null with no value at all", async () => {
    const fake = client({ rows: [taskRow({ dueAt: "2026-08-01T12:00:00.000Z" })] });
    await applyDetailCommand(fake, input({ action: "clear_due", patch: {} }));
    expect(applyArgs(fake).p_patch).toEqual({ dueAt: null });
  });

  it("takes the destructive destination from the taxonomy, not from a patch", async () => {
    const fake = client();
    await applyDetailCommand(fake, input({ action: "cancel_task", patch: {} }));
    expect(applyArgs(fake).p_patch).toEqual({ status: "cancelled" });
    expect(actionPolicy("cancel_task").destructive).toBe(true);
  });
});

describe("2E-IDEMPOTENCY — the operation key is the identity that travels", () => {
  it("sends the caller's key unchanged to both RPCs of one round", async () => {
    const fake = client();
    await applyDetailCommand(fake, input());
    expect(applyArgs(fake).p_operation_key).toBe(OPERATION_KEY);
  });

  it("reports a replayed apply as replayed rather than as a second write", async () => {
    const fake = client({ apply: { idempotent: true } });
    const outcome = await applyDetailCommand(fake, input());

    expect(outcome.status).toBe("applied");
    if (outcome.status !== "applied") return;
    expect(outcome.result.outcome).toBe("applied");
    if (outcome.result.outcome !== "applied") return;
    expect(outcome.result.replayed).toBe(true);
    expect(outcome.result.undoId).toBe(UNDO_ID);
  });

  it("maps a stale pre-state onto the declared failure rather than throwing", async () => {
    const fake = client({ applyError: { message: "pre-state moved", code: "55P03" } });
    const outcome = await applyDetailCommand(fake, input());

    expect(outcome.status).toBe("applied");
    if (outcome.status !== "applied") return;
    expect(outcome.result.outcome).toBe("rejected_stale");
    if (outcome.result.outcome === "applied" || outcome.result.outcome === "no_change") return;
    expect(outcome.result.failure).toBe("stale_pre_state");
  });
});
