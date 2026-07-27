import { z } from "zod";

import type { Locale } from "@/lib/preferences";
import type { Database } from "@/lib/supabase/database.types";

import {
  TaskCommandApplyError,
  mapTaskCommandApplyError,
  normalizeTaskCommandOperationKey,
  type TaskCommandApplyFailed,
} from "./apply";
import { getTaskCommandCopy } from "./copy";
import type { TaskCommandTargetHints, ValidatedTaskCommand } from "./schema";
import type { TaskCommandAction } from "./taxonomy";

export const TASK_LIKE_CREATION_ACTIONS = [
  "reschedule_due",
  "set_planned",
  "set_priority",
  "assign_project",
  "assign_context",
  "assign_person",
  "set_waiting_on",
] as const satisfies readonly TaskCommandAction[];

export type TaskLikeCreationAction = (typeof TASK_LIKE_CREATION_ACTIONS)[number];

const taskLikeActions: readonly string[] = TASK_LIKE_CREATION_ACTIONS;

function isTaskLikeCreationAction(action: TaskCommandAction): action is TaskLikeCreationAction {
  return taskLikeActions.includes(action);
}

function normalizedTitleWords(command: ValidatedTaskCommand): readonly string[] {
  return (command.targetHints?.titleWords ?? [])
    .map((word) => word.trim())
    .filter((word) => word !== "");
}

function titleOf(command: ValidatedTaskCommand): string | null {
  const title = normalizedTitleWords(command).join(" ");
  const length = [...title].length;
  return length >= 1 && length <= 240 ? title : null;
}

export type TaskCommandNoMatchDecision =
  | {
      readonly outcome: "creation_offered";
      readonly title: string;
      readonly operationKey: string;
      readonly policyVersion: string;
      readonly clarificationUsed: boolean;
      readonly terminal: false;
    }
  | {
      readonly outcome: "clarification_requested";
      readonly operationKey: string;
      readonly policyVersion: string;
      readonly clarificationUsed: true;
      readonly terminal: false;
    }
  | {
      readonly outcome: "still_unmatched";
      readonly operationKey: string;
      readonly policyVersion: string;
      readonly clarificationUsed: true;
      readonly terminal: true;
    };

export type TaskCommandNoMatchContinuation = {
  readonly command: ValidatedTaskCommand;
  readonly clarificationUsed: true;
};

/**
 * Builds the one allowed re-match input without letting a clarification alter
 * the validated action, patch, policy version or operation key.
 */
export function mergeTaskCommandNoMatchClarification(
  command: ValidatedTaskCommand,
  clarification: TaskCommandTargetHints,
): TaskCommandNoMatchContinuation {
  const targetHints: TaskCommandTargetHints = {
    ...command.targetHints,
    ...(clarification.titleWords === undefined
      ? {}
      : { titleWords: [...clarification.titleWords] }),
    ...(clarification.project === undefined ? {} : { project: clarification.project }),
    ...(clarification.person === undefined ? {} : { person: clarification.person }),
    ...(clarification.context === undefined ? {} : { context: clarification.context }),
    ...(clarification.status === undefined ? {} : { status: clarification.status }),
    ...(clarification.temporalPhrase === undefined
      ? {}
      : { temporalPhrase: clarification.temporalPhrase }),
  };
  return {
    command: { ...command, targetHints },
    clarificationUsed: true,
  };
}

export function decideTaskCommandNoMatch(
  command: ValidatedTaskCommand,
  clarificationUsed: boolean,
): TaskCommandNoMatchDecision {
  const title = titleOf(command);
  if (isTaskLikeCreationAction(command.action) && title !== null) {
    return {
      outcome: "creation_offered",
      title,
      operationKey: command.operationKey,
      policyVersion: command.policyVersion,
      clarificationUsed,
      terminal: false,
    };
  }
  if (!clarificationUsed) {
    return {
      outcome: "clarification_requested",
      operationKey: command.operationKey,
      policyVersion: command.policyVersion,
      clarificationUsed: true,
      terminal: false,
    };
  }
  return {
    outcome: "still_unmatched",
    operationKey: command.operationKey,
    policyVersion: command.policyVersion,
    clarificationUsed: true,
    terminal: true,
  };
}

type PreviewArgs =
  Database["public"]["Functions"]["preview_task_command_creation"]["Args"];

export type TaskCommandCreationInput = {
  readonly command: ValidatedTaskCommand;
  readonly observedBefore: string;
  readonly locale: Locale;
};

export type TaskCommandCreationClient = {
  rpc(
    fn:
      | "preview_task_command_creation"
      | "issue_task_command_creation_confirmation"
      | "create_task_command",
    args: PreviewArgs,
  ): PromiseLike<{
    data: unknown;
    error: { message: string; code?: string; details?: string } | null;
  }>;
};

export function buildTaskCommandCreationPayload(
  input: TaskCommandCreationInput,
): PreviewArgs {
  const decision = decideTaskCommandNoMatch(input.command, false);
  if (decision.outcome !== "creation_offered") {
    throw new TaskCommandApplyError(
      `${input.command.action} does not carry the bounded positive payload required for standalone creation`,
      "creation_not_offered",
    );
  }
  return {
    p_action: input.command.action,
    p_title_words: [...normalizedTitleWords(input.command)],
    p_patch: input.command.patch as PreviewArgs["p_patch"],
    p_observed_before: input.observedBefore,
    p_policy_version: input.command.policyVersion,
    p_operation_key: normalizeTaskCommandOperationKey(input.command.operationKey),
  };
}

const creationActionSchema = z.enum(TASK_LIKE_CREATION_ACTIONS);
const uuidSchema = z.string().uuid();
const fingerprintSchema = z.string().regex(/^[0-9a-f]{64}$/);
const instantSchema = z.string().min(1);

const canonicalPayloadSchema = z
  .object({
    title: z.string().min(1).max(240),
    status: z.literal("inbox"),
    dueAt: instantSchema.nullable(),
    plannedAt: instantSchema.nullable(),
    manualPriority: z.enum(["low", "medium", "high", "urgent"]).nullable(),
    relationType: z.enum(["project", "context", "person"]).nullable(),
    relationId: uuidSchema.nullable(),
    relationName: z.string().min(1).nullable(),
    personRole: z.enum(["involved", "waiting_on"]).nullable(),
  })
  .strict();

const reminderSchema = z
  .object({
    will_create: z.boolean(),
    remind_at: instantSchema.nullable(),
    timing: z.enum(["at_creation", "one_hour_before_due", "none"]),
  })
  .strict();

const previewSchema = z
  .object({
    outcome: z.literal("creation_offered"),
    will_mutate: z.literal(false),
    action: creationActionSchema,
    title: z.string().min(1).max(240),
    status: z.literal("inbox"),
    canonical_payload: canonicalPayloadSchema,
    request_fingerprint: fingerprintSchema,
    requires_confirmation: z.literal(true),
    reversible: z.literal(true),
    undo_window_hours: z.literal(24),
    reminder: reminderSchema,
  })
  .strict();

export type TaskCommandCreationPreview = {
  readonly outcome: "creation_offered";
  readonly willMutate: false;
  readonly action: TaskLikeCreationAction;
  readonly title: string;
  readonly status: "inbox";
  readonly canonicalPayload: z.infer<typeof canonicalPayloadSchema>;
  readonly requestFingerprint: string;
  readonly requiresConfirmation: true;
  readonly reversible: true;
  readonly undoWindowHours: 24;
  readonly reminder: {
    readonly willCreate: boolean;
    readonly remindAt: string | null;
    readonly timing: "at_creation" | "one_hour_before_due" | "none";
  };
  readonly copy: {
    readonly title: string;
    readonly description: string;
    readonly notice: string;
    readonly confirmation: string;
    readonly reversibility: string;
    readonly reminder: string;
  };
};

function invalidResult(functionName: string, parsed: z.ZodSafeParseError<unknown>): never {
  const issue = parsed.error.issues[0];
  const issuePath = (issue?.path ?? []).join(".");
  throw new TaskCommandApplyError(
    `${functionName} returned an unexpected result shape at ${issuePath || "<root>"}`,
    "invalid_result_shape",
  );
}

export async function previewTaskCommandCreation(
  client: TaskCommandCreationClient,
  input: TaskCommandCreationInput,
): Promise<TaskCommandCreationPreview | TaskCommandApplyFailed> {
  const result = await client.rpc(
    "preview_task_command_creation",
    buildTaskCommandCreationPayload(input),
  );
  if (result.error) return mapTaskCommandApplyError(result.error);

  const parsed = previewSchema.safeParse(result.data);
  if (!parsed.success) return invalidResult("preview_task_command_creation", parsed);

  const copy = getTaskCommandCopy(input.locale);
  const reminderCopy =
    parsed.data.reminder.timing === "at_creation"
      ? copy.creation.reminderAtCreation
      : parsed.data.reminder.will_create
        ? copy.creation.reminderScheduled
        : copy.creation.noReminder;
  return {
    outcome: "creation_offered",
    willMutate: false,
    action: parsed.data.action,
    title: parsed.data.title,
    status: "inbox",
    canonicalPayload: parsed.data.canonical_payload,
    requestFingerprint: parsed.data.request_fingerprint,
    requiresConfirmation: true,
    reversible: true,
    undoWindowHours: 24,
    reminder: {
      willCreate: parsed.data.reminder.will_create,
      remindAt: parsed.data.reminder.remind_at,
      timing: parsed.data.reminder.timing,
    },
    copy: {
      title: copy.outcomes.creation_offered.title,
      description: copy.outcomes.creation_offered.description,
      notice: copy.creation.readOnlyNotice,
      confirmation: copy.creation.confirmationRequired,
      reversibility: copy.creation.reversible,
      reminder: reminderCopy,
    },
  };
}

const confirmationSchema = z
  .object({
    confirmation_id: uuidSchema,
    action: z.literal("create_task"),
    command_action: creationActionSchema,
    request_fingerprint: fingerprintSchema,
    status: z.enum(["issued", "consumed"]),
    replayed: z.boolean(),
  })
  .strict();

export type TaskCommandCreationConfirmationIssued = {
  readonly outcome: "issued";
  readonly confirmationId: string;
  readonly action: "create_task";
  readonly commandAction: TaskLikeCreationAction;
  readonly requestFingerprint: string;
  readonly consumed: boolean;
  readonly replayed: boolean;
};

export async function issueTaskCommandCreationConfirmation(
  client: TaskCommandCreationClient,
  input: TaskCommandCreationInput,
): Promise<TaskCommandCreationConfirmationIssued | TaskCommandApplyFailed> {
  const result = await client.rpc(
    "issue_task_command_creation_confirmation",
    buildTaskCommandCreationPayload(input),
  );
  if (result.error) return mapTaskCommandApplyError(result.error);

  const parsed = confirmationSchema.safeParse(result.data);
  if (!parsed.success) {
    return invalidResult("issue_task_command_creation_confirmation", parsed);
  }
  return {
    outcome: "issued",
    confirmationId: parsed.data.confirmation_id,
    action: "create_task",
    commandAction: parsed.data.command_action,
    requestFingerprint: parsed.data.request_fingerprint,
    consumed: parsed.data.status === "consumed",
    replayed: parsed.data.replayed,
  };
}

const creationResultSchema = z
  .object({
    outcome: z.literal("applied"),
    task_id: uuidSchema,
    action: creationActionSchema,
    undo_id: uuidSchema,
    idempotent: z.boolean(),
    request_fingerprint: fingerprintSchema,
    reminder_created_id: uuidSchema.nullable(),
    undo_expires_at: instantSchema,
    creation_undone: z.boolean(),
  })
  .strict();

export type TaskCommandCreated = {
  readonly outcome: "applied";
  readonly taskId: string;
  readonly action: TaskLikeCreationAction;
  readonly undoId: string;
  readonly replayed: boolean;
  readonly requestFingerprint: string;
  readonly reminderCreatedId: string | null;
  readonly undoExpiresAt: string;
  readonly creationUndone: boolean;
};

export async function createTaskCommand(
  client: TaskCommandCreationClient,
  input: TaskCommandCreationInput,
): Promise<TaskCommandCreated | TaskCommandApplyFailed> {
  const result = await client.rpc(
    "create_task_command",
    buildTaskCommandCreationPayload(input),
  );
  if (result.error) return mapTaskCommandApplyError(result.error);

  const parsed = creationResultSchema.safeParse(result.data);
  if (!parsed.success) return invalidResult("create_task_command", parsed);
  return {
    outcome: "applied",
    taskId: parsed.data.task_id,
    action: parsed.data.action,
    undoId: parsed.data.undo_id,
    replayed: parsed.data.idempotent,
    requestFingerprint: parsed.data.request_fingerprint,
    reminderCreatedId: parsed.data.reminder_created_id,
    undoExpiresAt: parsed.data.undo_expires_at,
    creationUndone: parsed.data.creation_undone,
  };
}
