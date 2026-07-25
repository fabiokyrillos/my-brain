import { z } from "zod";

import {
  TASK_COMMAND_POLICY_VERSION,
  TASK_STATUSES,
  actionPolicy,
  isAllowedTargetValue,
  isTaskCommandAction,
  type TaskCommandAction,
  type TaskCommandPatchField,
} from "./taxonomy";
import { resolveTemporalPhrase, type TemporalContext } from "./temporal";

/**
 * The closed contract between the model's proposal and everything downstream.
 *
 * PRD §13.1. This module is the only thing standing between untrusted model
 * output and the matcher, so every rejection is a closed reason code rather
 * than free text, and nothing is ever coerced into a neighbouring action: a
 * `set_status` carrying `cancelled` is refused, not quietly re-read as a
 * cancellation, because that would route around the confirmation the
 * destructive contract exists to require.
 *
 * Pure and synchronous — no clock, no I/O, no Supabase. The caller injects the
 * instant and timezone.
 */

export const TASK_COMMAND_SCHEMA_VERSION = "2026-07-25.1";

export const MAX_TITLE_WORDS = 12;
export const MAX_HINT_LENGTH = 160;
export const MAX_TITLE_LENGTH = 240;
export const MAX_NOTE_LENGTH = 2000;

const boundedHint = z.string().trim().min(1).max(MAX_HINT_LENGTH);

/**
 * Bounded descriptors of the intended task. Deliberately incapable of naming a
 * task: there is no id field, so the model cannot select the target even if it
 * tries.
 */
const targetHintsSchema = z
  .object({
    titleWords: z.array(boundedHint).max(MAX_TITLE_WORDS).optional(),
    project: boundedHint.optional(),
    person: boundedHint.optional(),
    context: boundedHint.optional(),
    status: z.enum(TASK_STATUSES).optional(),
    temporalPhrase: boundedHint.optional(),
  })
  .strict();

const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(MAX_TITLE_LENGTH).optional(),
    note: z.string().trim().min(1).max(MAX_NOTE_LENGTH).optional(),
    // Bounded strings rather than the column enums, deliberately: the closed
    // set a *value* may take is per-action (`set_status` may not reach
    // `cancelled`), so the taxonomy decides and the reason code is always
    // `value_not_allowed_for_action` rather than a generic shape error.
    status: boundedHint.optional(),
    priority: boundedHint.optional(),
    dueAt: boundedHint.optional(),
    plannedAt: boundedHint.optional(),
    projectRef: boundedHint.optional(),
    contextRef: boundedHint.optional(),
    personRef: boundedHint.optional(),
  })
  .strict();

const proposalSchema = z
  .object({
    action: z.string(),
    targetHints: targetHintsSchema,
    patch: patchSchema,
    operationKey: z.string().uuid(),
  })
  .strict();

export type TaskCommandPatch = z.infer<typeof patchSchema>;
export type TaskCommandTargetHints = z.infer<typeof targetHintsSchema>;

export type ValidatedTaskCommand = {
  readonly action: TaskCommandAction;
  readonly targetHints: TaskCommandTargetHints;
  readonly patch: TaskCommandPatch;
  readonly operationKey: string;
  readonly schemaVersion: string;
  readonly policyVersion: string;
};

export type TaskCommandValidation =
  | { status: "ok"; command: ValidatedTaskCommand }
  | { status: "invalid"; reason: string; field?: string }
  | { status: "unsupported"; reason: string; field?: string }
  | { status: "needs_clarification"; reason: string; field: string };

/** The fields whose value is a temporal phrase rather than a literal. */
const TEMPORAL_FIELDS = ["dueAt", "plannedAt"] as const;

/**
 * Canonical key order, so two proposals that differ only in key order produce
 * byte-identical serializations. The mutation RPC's replay fingerprint is a
 * hash of this shape, and an unstable order would make an exact replay look
 * like a payload mismatch.
 */
function canonicalize<T extends Record<string, unknown>>(value: T): T {
  const ordered: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] !== undefined) ordered[key] = value[key];
  }
  return ordered as T;
}

export function validateTaskCommand(
  input: unknown,
  context: TemporalContext,
): TaskCommandValidation {
  // A payload that is not an object is a defect in the caller, not a product
  // outcome, so it is reported before the action is even looked for.
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { status: "invalid", reason: "invalid_shape" };
  }

  // The action is read before the rest of the shape, so an unknown verb is
  // reported as unsupported (a product outcome the user sees) rather than as a
  // schema violation.
  const proposedAction = (input as { action?: unknown }).action;
  if (!isTaskCommandAction(proposedAction)) {
    return { status: "unsupported", reason: "unsupported_action" };
  }
  const action: TaskCommandAction = proposedAction;

  const parsed = proposalSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = (issue?.path ?? []).filter((part): part is string => typeof part === "string");
    return {
      status: "invalid",
      reason: issue?.code ?? "invalid_shape",
      // The leaf name, not the dotted path: callers map a field to copy, and
      // `patch.title` and `title` are the same field to a reader.
      field: path.length > 0 ? path[path.length - 1] : undefined,
    };
  }

  const policy = actionPolicy(action);
  const patch: Record<string, unknown> = { ...parsed.data.patch };

  for (const field of Object.keys(patch) as TaskCommandPatchField[]) {
    if (!policy.allowedPatchFields.includes(field)) {
      return { status: "invalid", reason: "forbidden_patch_field", field };
    }
  }
  for (const field of policy.requiredPatchFields) {
    if (patch[field] === undefined) {
      return { status: "invalid", reason: "missing_patch_field", field };
    }
  }

  // A value legal for the column but not for this action is refused outright.
  // Silently re-reading it as the action that does permit it would let
  // `set_status` deliver a cancellation without the confirmation cancellation
  // requires.
  for (const field of ["status", "priority"] as const) {
    const value = patch[field];
    if (typeof value === "string" && !isAllowedTargetValue(action, value)) {
      return { status: "unsupported", reason: "value_not_allowed_for_action", field };
    }
  }

  for (const field of TEMPORAL_FIELDS) {
    const value = patch[field];
    if (typeof value !== "string") continue;
    const resolved = resolveTemporalPhrase(value, context);
    if (resolved.status !== "resolved") {
      return { status: "needs_clarification", reason: "unresolved_temporal_phrase", field };
    }
    patch[field] = resolved.instant;
  }

  return {
    status: "ok",
    command: canonicalize({
      action,
      targetHints: canonicalize(parsed.data.targetHints),
      patch: canonicalize(patch) as TaskCommandPatch,
      operationKey: parsed.data.operationKey,
      schemaVersion: TASK_COMMAND_SCHEMA_VERSION,
      policyVersion: TASK_COMMAND_POLICY_VERSION,
    }) as ValidatedTaskCommand,
  };
}
