import { z } from "zod";

import {
  TASK_COMMAND_POLICY_VERSION,
  actionPolicy,
  isAllowedTargetValue,
  isTaskCommandAction,
  type TaskCommandAction,
  type TaskCommandPatchField,
  type TaskCommandUnsupportedReason,
} from "./taxonomy";
import { resolveTemporalPhrase, type TemporalContext } from "./temporal";
import { resolvePriorityTerm, resolveStatusTerm } from "./vocabulary";

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

/**
 * The cap on all hints together, over and above each field's own cap
 * (2E-COMMAND-005).
 *
 * Per-field caps alone are not a bound: twelve title words plus five other
 * hints at 160 characters each is over 2.7 KB of attacker-chosen text flowing
 * into the matcher's normalization and into every candidate comparison. The
 * total is what the downstream cost actually scales with, so the total is what
 * is capped. Measured on the canonical JSON, so reordering keys cannot change
 * whether a payload fits.
 */
export const MAX_TARGET_HINTS_SERIALIZED = 800;

/**
 * The closed reason vocabulary of a rejected command.
 *
 * Declared as a list, not inferred from the code, because 2E-I18N-003 requires
 * the localization exhaustiveness test to run against *the declared code list*
 * rather than a hand-written key list. Passing Zod's own `issue.code` through
 * would make the vocabulary library-owned and version-dependent — a zod upgrade
 * would silently introduce a code with no copy behind it — so every schema
 * failure is mapped onto one of these instead.
 */
export const TASK_COMMAND_VALIDATION_REASONS = [
  /** Not an object, or the action is missing entirely. */
  "invalid_shape",
  /** A key the closed schema does not define. */
  "unknown_field",
  "value_too_long",
  "value_too_short",
  /** Wrong type, or a value outside a closed set the schema itself owns. */
  "invalid_value",
  /** The hints together exceed the total cap, even though each fits its own. */
  "target_hints_too_large",
  /** A patch field this action does not change. */
  "forbidden_patch_field",
  /** A patch field this action requires and the command omitted. */
  "missing_patch_field",
  /** A word that names no status or priority we have. */
  "unrecognized_value",
] as const;

export type TaskCommandValidationReason = (typeof TASK_COMMAND_VALIDATION_REASONS)[number];

/**
 * Zod's issue codes reduced to the declared vocabulary above. Anything
 * unmapped becomes `invalid_shape`, which is always true of a payload that
 * failed the closed schema.
 */
function toValidationReason(code: string | undefined): TaskCommandValidationReason {
  switch (code) {
    case "unrecognized_keys":
      return "unknown_field";
    case "too_big":
      return "value_too_long";
    case "too_small":
      return "value_too_short";
    case "invalid_type":
    case "invalid_value":
    case "invalid_format":
    case "invalid_enum_value":
      return "invalid_value";
    default:
      return "invalid_shape";
  }
}

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
    // Free text, not `z.enum(TASK_STATUSES)`. The model is told to copy the
    // user's own words, and this product's first language is Portuguese: a
    // hint of "bloqueada" is an ordinary sentence, and destroying an otherwise
    // well-formed command over an *optional* hint would be a caller-defect
    // report for a user-language problem. It is normalized below instead.
    status: boundedHint.optional(),
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
  | { status: "invalid"; reason: TaskCommandValidationReason; field?: string }
  | { status: "unsupported"; reason: TaskCommandUnsupportedReason; field?: string }
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
      reason: toValidationReason(issue?.code),
      // The leaf name, not the dotted path: callers map a field to copy, and
      // `patch.title` and `title` are the same field to a reader.
      field: path.length > 0 ? path[path.length - 1] : undefined,
    };
  }

  const targetHints: Record<string, unknown> = canonicalize(parsed.data.targetHints);
  if (JSON.stringify(targetHints).length > MAX_TARGET_HINTS_SERIALIZED) {
    return { status: "invalid", reason: "target_hints_too_large", field: "targetHints" };
  }

  // A status *hint* only steers ranking, so it is canonicalized here rather
  // than checked against the action's allowed targets — an action's allowed
  // values bound what it may write, not what the user may describe.
  if (typeof targetHints.status === "string") {
    const canonical = resolveStatusTerm(targetHints.status);
    if (canonical === null) {
      return { status: "invalid", reason: "unrecognized_value", field: "status" };
    }
    targetHints.status = canonical;
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

  // The enumerable-target check, driven by the taxonomy rather than by a
  // hardcoded field list: an action that declares allowed values for some other
  // field would otherwise have them silently ignored.
  const targetField = policy.targetValueField;
  if (targetField !== null) {
    const raw = patch[targetField];
    if (typeof raw === "string") {
      // Canonicalize the user's own word first. "alta" is a priority this
      // product has; refusing it as "not allowed for this action" would be
      // untrue, and telling a Portuguese-first user to write English is not a
      // product we are shipping.
      const canonical = targetField === "status" ? resolveStatusTerm(raw) : resolvePriorityTerm(raw);
      if (canonical === null) {
        // Names no value we have at all — a different failure from naming one
        // this action may not reach (2E-COMMAND-017).
        return { status: "invalid", reason: "unrecognized_value", field: targetField };
      }
      // A value legal for the column but not for this action is refused
      // outright. Silently re-reading it as the action that does permit it
      // would let `set_status` deliver a cancellation without the confirmation
      // cancellation requires.
      if (!isAllowedTargetValue(action, canonical)) {
        return { status: "unsupported", reason: "value_not_allowed_for_action", field: targetField };
      }
      patch[targetField] = canonical;
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
      targetHints,
      patch: canonicalize(patch) as TaskCommandPatch,
      operationKey: parsed.data.operationKey,
      schemaVersion: TASK_COMMAND_SCHEMA_VERSION,
      policyVersion: TASK_COMMAND_POLICY_VERSION,
    }) as ValidatedTaskCommand,
  };
}
