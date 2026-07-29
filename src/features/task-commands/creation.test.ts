import { describe, expect, expectTypeOf, it } from "vitest";

import type { Locale } from "@/lib/preferences";

import { TaskCommandApplyError } from "./apply";
import {
  TASK_LIKE_CREATION_ACTIONS,
  buildTaskCommandCreationPayload,
  continueTaskCommandNoMatch,
  createTaskCommand,
  decideInitialTaskCommandNoMatch,
  issueTaskCommandCreationConfirmation,
  previewTaskCommandCreation,
  type TaskCommandCreationClient,
  type TaskCommandCreationInput,
  type TaskCommandNoMatchContinuation,
} from "./creation";
import type { ValidatedTaskCommand } from "./schema";
import { TASK_COMMAND_POLICY_VERSION, type TaskCommandAction, type TaskCommandPatchField } from "./taxonomy";

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
  return {
    intent: { kind: "no_match", command: command(action) },
    observedBefore: OBSERVED_BEFORE,
    locale,
  };
}

/** The manual form's intent: a title, an operation key, and nothing inferred. */
function manualInput(title: string, locale: Locale = "en"): TaskCommandCreationInput {
  return {
    intent: {
      kind: "manual",
      title,
      operationKey: OPERATION_KEY,
      policyVersion: TASK_COMMAND_POLICY_VERSION,
    },
    observedBefore: OBSERVED_BEFORE,
    locale,
  };
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
      const decision = decideInitialTaskCommandNoMatch(
        command(action, { targetHints: { titleWords: ["  book", "the  ", " flights "] } }),
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
      decideInitialTaskCommandNoMatch(command(action, { targetHints: mutableTargetHints })),
    ).toMatchObject({
      outcome: "clarification_requested",
      operationKey: OPERATION_KEY,
      policyVersion: "task-match-v1",
      clarificationUsed: true,
      terminal: false,
    });
  });

  it("makes the continuation no-match terminal without exposing a second clarification branch", () => {
    const initial = decideInitialTaskCommandNoMatch(command("rename_task"));
    if (initial.outcome !== "clarification_requested") {
      throw new Error(`expected clarification_requested, received ${initial.outcome}`);
    }

    const decision = continueTaskCommandNoMatch(initial.continuation, {
      titleWords: ["renamed report"],
    });

    expect(decision).toEqual({
      outcome: "still_unmatched",
      operationKey: OPERATION_KEY,
      policyVersion: "task-match-v1",
      clarificationUsed: true,
      terminal: true,
    });
    expectTypeOf(decision.outcome).toEqualTypeOf<"creation_offered" | "still_unmatched">();
  });

  it("preserves that clarification was used when the opaque continuation becomes task-like", () => {
    const initial = decideInitialTaskCommandNoMatch(
      command("set_priority", { targetHints: { project: "Acme" } }),
    );
    if (initial.outcome !== "clarification_requested") {
      throw new Error(`expected clarification_requested, received ${initial.outcome}`);
    }

    expect(
      continueTaskCommandNoMatch(initial.continuation, {
        titleWords: ["book", "flights"],
        context: "Office",
      }),
    ).toMatchObject({
      outcome: "creation_offered",
      title: "book flights",
      operationKey: OPERATION_KEY,
      policyVersion: "task-match-v1",
      clarificationUsed: true,
      terminal: false,
    });
  });

  it("requires the initial decision's opaque continuation instead of a caller-controlled boolean", () => {
    expectTypeOf<Parameters<typeof continueTaskCommandNoMatch>[0]>()
      .toEqualTypeOf<TaskCommandNoMatchContinuation>();

    if (false) {
      // @ts-expect-error A validated command cannot forge the opaque continuation state.
      continueTaskCommandNoMatch(command("set_priority"), { titleWords: ["book flights"] });
    }
  });
});

describe("2F-CREATE-002 — the bare manual creation intent", () => {
  it("builds a title-only payload with an empty patch and invents nothing", () => {
    expect(buildTaskCommandCreationPayload(manualInput("Ligar para o cliente"))).toEqual({
      p_action: "create_title_only",
      p_title_words: ["Ligar", "para", "o", "cliente"],
      p_patch: {},
      p_observed_before: OBSERVED_BEFORE,
      p_policy_version: TASK_COMMAND_POLICY_VERSION,
      p_operation_key: OPERATION_KEY,
    });
  });

  it("never consults the no-match decision function", () => {
    // The manual form is an explicit creation request, not an inference. The
    // proof is that a bare intent builds a payload at all: every action the
    // no-match decider offers is one of the seven, and `create_title_only` is
    // not among them — so a build that went through it could only have thrown.
    expect(TASK_LIKE_CREATION_ACTIONS as readonly string[]).not.toContain("create_title_only");
    expect(() => buildTaskCommandCreationPayload(manualInput("A title"))).not.toThrow();
  });

  it("is the only creation action whose patch is empty", () => {
    for (const action of TASK_LIKE_CREATION_ACTIONS) {
      const payload = buildTaskCommandCreationPayload(input(action));
      expect(Object.keys(payload.p_patch as object).length).toBeGreaterThan(0);
    }
  });

  it("groups a long title into twelve words rather than truncating it", () => {
    const words = Array.from({ length: 30 }, (_, index) => `w${index}`);
    const payload = buildTaskCommandCreationPayload(manualInput(words.join(" ")));

    // At most twelve elements, which is the contract's ceiling — not exactly
    // twelve, because the words are distributed evenly and 30 over 12 gives ten
    // groups of three.
    expect(payload.p_title_words.length).toBeLessThanOrEqual(12);
    expect(payload.p_title_words.length).toBeGreaterThan(1);
    // Every word survives, in order: the canonical title the RPC rebuilds with
    // `string_agg(..., ' ')` is the user's own sentence.
    expect(payload.p_title_words.join(" ")).toBe(words.join(" "));
  });

  it("normalizes runs of whitespace, which is the one title change it makes", () => {
    const payload = buildTaskCommandCreationPayload(manualInput("  spaced   out  "));
    expect(payload.p_title_words).toEqual(["spaced", "out"]);
  });

  it.each([
    ["", "an empty title"],
    ["   ", "a whitespace-only title"],
    ["x".repeat(241), "a title past the 240-character ceiling"],
    ["x".repeat(161), "a single token past the 160-character word ceiling"],
  ])("refuses %j — %s", (title) => {
    let thrown: unknown;
    try {
      buildTaskCommandCreationPayload(manualInput(title));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(TaskCommandApplyError);
    expect((thrown as TaskCommandApplyError).code).toBe("creation_title_unrepresentable");
  });

  it("omits the origin entirely when it is agent, so the default resolves", async () => {
    const { client, calls } = clientReturning({
      outcome: "applied",
      task_id: TASK_ID,
      action: "create_title_only",
      undo_id: UNDO_ID,
      idempotent: false,
      request_fingerprint: FINGERPRINT,
      reminder_created_id: null,
      undo_expires_at: "2026-07-28T15:00:00.000000+00",
      creation_undone: false,
    });

    await createTaskCommand(client, manualInput("A title"));

    expect(calls[0]?.args).not.toHaveProperty("p_created_by");
  });

  it("sends the origin only when it is user", async () => {
    const { client, calls } = clientReturning({
      outcome: "applied",
      task_id: TASK_ID,
      action: "create_title_only",
      undo_id: UNDO_ID,
      idempotent: false,
      request_fingerprint: FINGERPRINT,
      reminder_created_id: null,
      undo_expires_at: "2026-07-28T15:00:00.000000+00",
      creation_undone: false,
    });

    const created = await createTaskCommand(client, manualInput("A title"), "user");

    expect((calls[0]?.args as { p_created_by?: string }).p_created_by).toBe("user");
    expect(created.outcome).toBe("applied");
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
