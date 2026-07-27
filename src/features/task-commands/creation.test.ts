import { describe, expect, it } from "vitest";

import type { Locale } from "@/lib/preferences";

import { TaskCommandApplyError } from "./apply";
import {
  TASK_LIKE_CREATION_ACTIONS,
  buildTaskCommandCreationPayload,
  createTaskCommand,
  decideTaskCommandNoMatch,
  issueTaskCommandCreationConfirmation,
  mergeTaskCommandNoMatchClarification,
  previewTaskCommandCreation,
  type TaskCommandCreationClient,
  type TaskCommandCreationInput,
} from "./creation";
import type { ValidatedTaskCommand } from "./schema";
import type { TaskCommandAction, TaskCommandPatchField } from "./taxonomy";

const OPERATION_KEY = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const OBSERVED_BEFORE = "2026-07-27T15:00:00.000Z";
const TASK_ID = "71000001-1111-4111-8111-111111111111";
const UNDO_ID = "71000002-1111-4111-8111-111111111111";
const CONFIRMATION_ID = "71000003-1111-4111-8111-111111111111";
const REMINDER_ID = "71000004-1111-4111-8111-111111111111";
const FINGERPRINT = "a".repeat(64);

const PATCHES = {
  reschedule_due: { dueAt: "2026-08-03T15:00:00.000Z" },
  set_planned: { plannedAt: "2026-08-02T15:00:00.000Z" },
  set_priority: { priority: "high" },
  assign_project: { projectRef: "Acme" },
  assign_context: { contextRef: "Office" },
  assign_person: { personRef: "Maria" },
  set_waiting_on: { personRef: "Maria" },
} as const satisfies Record<
  (typeof TASK_LIKE_CREATION_ACTIONS)[number],
  Partial<Record<TaskCommandPatchField, string>>
>;

function command(
  action: TaskCommandAction = "reschedule_due",
  overrides: Partial<ValidatedTaskCommand> = {},
): ValidatedTaskCommand {
  return {
    action,
    targetHints: { titleWords: ["book", "the", "flights"] },
    patch: PATCHES[action as keyof typeof PATCHES] ?? {},
    operationKey: OPERATION_KEY,
    schemaVersion: "2026-07-25.1",
    policyVersion: "task-match-v1",
    ...overrides,
  };
}

function input(
  action: TaskCommandAction = "reschedule_due",
  locale: Locale = "en",
): TaskCommandCreationInput {
  return { command: command(action), observedBefore: OBSERVED_BEFORE, locale };
}

function clientReturning(
  data: unknown,
  error: { message: string; code?: string; details?: string } | null = null,
): { client: TaskCommandCreationClient; calls: { fn: string; args: unknown }[] } {
  const calls: { fn: string; args: unknown }[] = [];
  return {
    calls,
    client: {
      rpc(fn, args) {
        calls.push({ fn, args });
        return Promise.resolve({ data, error });
      },
    },
  };
}

describe("deterministic no-match classification (2E-NOMATCH-001..003, 008)", () => {
  it("declares exactly the seven actions that add positive standalone-task data", () => {
    expect(TASK_LIKE_CREATION_ACTIONS).toEqual([
      "reschedule_due",
      "set_planned",
      "set_priority",
      "assign_project",
      "assign_context",
      "assign_person",
      "set_waiting_on",
    ]);
  });

  it.each(TASK_LIKE_CREATION_ACTIONS)(
    "offers creation for %s and derives the title by trimming words and joining one space",
    (action) => {
      const decision = decideTaskCommandNoMatch(
        command(action, { targetHints: { titleWords: ["  book", "the  ", " flights "] } }),
        false,
      );

      expect(decision).toEqual({
        outcome: "creation_offered",
        title: "book the flights",
        operationKey: OPERATION_KEY,
        policyVersion: "task-match-v1",
        clarificationUsed: false,
        terminal: false,
      });
    },
  );

  it.each([
    ["complete_task", { titleWords: ["report"] }],
    ["reschedule_due", undefined],
    ["reschedule_due", { titleWords: [] }],
    ["reschedule_due", { titleWords: ["   "] }],
    ["reschedule_due", { titleWords: ["x".repeat(241)] }],
  ] as const)("asks once instead of inventing work for %s with hints %j", (action, targetHints) => {
    const mutableTargetHints =
      targetHints === undefined ? undefined : { titleWords: [...targetHints.titleWords] };
    expect(
      decideTaskCommandNoMatch(
        command(action, { targetHints: mutableTargetHints }),
        false,
      ),
    ).toEqual({
      outcome: "clarification_requested",
      operationKey: OPERATION_KEY,
      policyVersion: "task-match-v1",
      clarificationUsed: true,
      terminal: false,
    });
  });

  it("makes the second no-match terminal under the same operation key and policy version", () => {
    expect(decideTaskCommandNoMatch(command("rename_task"), true)).toEqual({
      outcome: "still_unmatched",
      operationKey: OPERATION_KEY,
      policyVersion: "task-match-v1",
      clarificationUsed: true,
      terminal: true,
    });
  });

  it("preserves that clarification was used when the merged command becomes task-like", () => {
    expect(decideTaskCommandNoMatch(command("set_priority"), true)).toMatchObject({
      outcome: "creation_offered",
      operationKey: OPERATION_KEY,
      policyVersion: "task-match-v1",
      clarificationUsed: true,
      terminal: false,
    });
  });

  it("merges only validated target hints while preserving the original command identity", () => {
    const original = command("reschedule_due", {
      targetHints: { project: "Acme" },
    });

    const continuation = mergeTaskCommandNoMatchClarification(original, {
      titleWords: ["book", "flights"],
      context: "Office",
    });

    expect(continuation).toEqual({
      command: {
        ...original,
        targetHints: {
          project: "Acme",
          titleWords: ["book", "flights"],
          context: "Office",
        },
      },
      clarificationUsed: true,
    });
    expect(original.targetHints).toEqual({ project: "Acme" });
  });
});

describe("creation transport payload", () => {
  it("sends the same six server-bound values to all three RPCs", () => {
    expect(buildTaskCommandCreationPayload(input("assign_project"))).toEqual({
      p_action: "assign_project",
      p_title_words: ["book", "the", "flights"],
      p_patch: { projectRef: "Acme" },
      p_observed_before: OBSERVED_BEFORE,
      p_policy_version: "task-match-v1",
      p_operation_key: OPERATION_KEY,
    });
  });

  it("refuses a command the deterministic classifier did not offer", () => {
    let thrown: unknown;
    try {
      buildTaskCommandCreationPayload(input("complete_task"));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(TaskCommandApplyError);
    expect(thrown).toMatchObject({ code: "creation_not_offered" });
  });
});

describe("read-only creation preview", () => {
  it("parses the canonical standalone preview and localizes its copy", async () => {
    const canonicalPayload = {
      title: "book the flights",
      status: "inbox",
      dueAt: "2026-08-03T15:00:00.000Z",
      plannedAt: null,
      manualPriority: null,
      relationType: null,
      relationId: null,
      relationName: null,
      personRole: null,
    };
    const { client, calls } = clientReturning({
      outcome: "creation_offered",
      will_mutate: false,
      action: "reschedule_due",
      title: "book the flights",
      status: "inbox",
      canonical_payload: canonicalPayload,
      request_fingerprint: FINGERPRINT,
      requires_confirmation: true,
      reversible: true,
      undo_window_hours: 24,
      reminder: {
        will_create: true,
        remind_at: "2026-08-03T14:00:00.000000+00",
        timing: "one_hour_before_due",
      },
    });

    const result = await previewTaskCommandCreation(client, input("reschedule_due", "pt-BR"));

    expect(calls).toHaveLength(1);
    expect(calls[0]?.fn).toBe("preview_task_command_creation");
    expect(result).toMatchObject({
      outcome: "creation_offered",
      willMutate: false,
      action: "reschedule_due",
      title: "book the flights",
      status: "inbox",
      canonicalPayload,
      requestFingerprint: FINGERPRINT,
      requiresConfirmation: true,
      reversible: true,
      undoWindowHours: 24,
      reminder: {
        willCreate: true,
        remindAt: "2026-08-03T14:00:00.000000+00",
        timing: "one_hour_before_due",
      },
    });
    if (result.outcome !== "creation_offered") {
      throw new Error(`expected creation_offered, received ${result.outcome}`);
    }
    expect(result.copy.title).toBe("Posso registrar isto");
    expect(result.copy.notice).toContain("previsão");
    expect(result.copy.confirmation).toContain("confirmação");
    expect(result.copy.reminder).toContain("lembrete");
  });

  it("maps relation refusal through the shared closed error vocabulary", async () => {
    const { client } = clientReturning(null, {
      code: "22023",
      details: "2E_INVALID_RELATION",
      message: "Relation reference did not resolve",
    });

    await expect(previewTaskCommandCreation(client, input("assign_project"))).resolves.toMatchObject({
      outcome: "refused",
      failure: "2E_INVALID_RELATION",
      retryable: false,
      sqlstate: "22023",
    });
  });
});

describe("creation confirmation", () => {
  it("issues server confirmation with the shared payload and parses replay state", async () => {
    const { client, calls } = clientReturning({
      confirmation_id: CONFIRMATION_ID,
      action: "create_task",
      command_action: "set_priority",
      request_fingerprint: FINGERPRINT,
      status: "consumed",
      replayed: true,
    });

    const result = await issueTaskCommandCreationConfirmation(client, input("set_priority"));

    expect(calls[0]?.fn).toBe("issue_task_command_creation_confirmation");
    expect(calls[0]?.args).toEqual(buildTaskCommandCreationPayload(input("set_priority")));
    expect(result).toEqual({
      outcome: "issued",
      confirmationId: CONFIRMATION_ID,
      action: "create_task",
      commandAction: "set_priority",
      requestFingerprint: FINGERPRINT,
      consumed: true,
      replayed: true,
    });
  });
});

describe("standalone creation result parsing", () => {
  it("returns the created task, undo, reminder and active-state semantics", async () => {
    const { client, calls } = clientReturning({
      outcome: "applied",
      task_id: TASK_ID,
      action: "reschedule_due",
      undo_id: UNDO_ID,
      idempotent: false,
      request_fingerprint: FINGERPRINT,
      reminder_created_id: REMINDER_ID,
      undo_expires_at: "2026-07-28T15:00:00.000000+00",
      creation_undone: false,
    });

    const result = await createTaskCommand(client, input("reschedule_due"));

    expect(calls[0]?.fn).toBe("create_task_command");
    expect(result).toEqual({
      outcome: "applied",
      taskId: TASK_ID,
      action: "reschedule_due",
      undoId: UNDO_ID,
      replayed: false,
      requestFingerprint: FINGERPRINT,
      reminderCreatedId: REMINDER_ID,
      undoExpiresAt: "2026-07-28T15:00:00.000000+00",
      creationUndone: false,
    });
  });

  it("preserves original identifiers and marks an exact replay after undo as inactive", async () => {
    const { client } = clientReturning({
      outcome: "applied",
      task_id: TASK_ID,
      action: "set_planned",
      undo_id: UNDO_ID,
      idempotent: true,
      request_fingerprint: FINGERPRINT,
      reminder_created_id: null,
      undo_expires_at: "2026-07-28T15:00:00.000000+00",
      creation_undone: true,
    });

    await expect(createTaskCommand(client, input("set_planned"))).resolves.toEqual({
      outcome: "applied",
      taskId: TASK_ID,
      action: "set_planned",
      undoId: UNDO_ID,
      replayed: true,
      requestFingerprint: FINGERPRINT,
      reminderCreatedId: null,
      undoExpiresAt: "2026-07-28T15:00:00.000000+00",
      creationUndone: true,
    });
  });

  it("throws on a malformed committed result instead of inventing task or undo identifiers", async () => {
    const { client } = clientReturning({
      outcome: "applied",
      task_id: TASK_ID,
      action: "set_priority",
      undo_id: null,
      idempotent: false,
      request_fingerprint: FINGERPRINT,
      reminder_created_id: null,
      undo_expires_at: "2026-07-28T15:00:00.000000+00",
      creation_undone: false,
    });

    await expect(createTaskCommand(client, input("set_priority"))).rejects.toMatchObject({
      code: "invalid_result_shape",
    });
  });
});
