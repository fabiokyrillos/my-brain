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
import { TASK_COMMAND_CREATION_QUALIFIERS, type TaskCommandAction } from "./taxonomy";

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

/**
 * The explicit bare-creation action: a title, and nothing else.
 *
 * **Deliberately not a `TaskCommandAction`.** The seven above are members of the
 * apply taxonomy that the creation family reuses to mean "create the task and
 * apply this one qualifier"; this one has no mutation meaning at all, and adding
 * it to `TASK_COMMAND_ACTIONS` would widen the apply and Work-surface
 * vocabularies with a verb neither can execute.
 *
 * **Named `create_title_only` because `create_task` was already taken, three
 * times over.** It is the *confirmation kind* in `task_command_confirmations`
 * (`202607270060:20`, mirrored at `confirmationSchema` below as
 * `z.literal("create_task")`), a member of the pending-question consequence
 * vocabulary, and a prefix of the `create_task_command` undo `action_type`.
 * Reusing it would put two different `action` fields carrying the same literal
 * with different meanings inside one function. PRD Revision 4.1 §6.5a records
 * the analysis.
 */
export const TASK_CREATION_BARE_ACTION = "create_title_only" as const;

export type TaskCreationBareAction = typeof TASK_CREATION_BARE_ACTION;

/** Everything `public.create_task_command` accepts as `p_action`. */
export const TASK_CREATION_ACTIONS = [
  TASK_CREATION_BARE_ACTION,
  ...TASK_LIKE_CREATION_ACTIONS,
] as const;

export type TaskCreationAction = (typeof TASK_CREATION_ACTIONS)[number];

/** The closed domain of `tasks.created_by` (`202607160003:117`). */
export const TASK_CREATION_ORIGINS = ["user", "agent"] as const;

export type TaskCreationOrigin = (typeof TASK_CREATION_ORIGINS)[number];

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

type TaskCommandCreationOffered<ClarificationUsed extends boolean> = {
  readonly outcome: "creation_offered";
  readonly title: string;
  readonly operationKey: string;
  readonly policyVersion: string;
  readonly clarificationUsed: ClarificationUsed;
  readonly terminal: false;
};

const taskCommandNoMatchContinuationCommand: unique symbol = Symbol(
  "TaskCommandNoMatchContinuation.command",
);

export type TaskCommandNoMatchContinuation = {
  readonly [taskCommandNoMatchContinuationCommand]: ValidatedTaskCommand;
};

export type TaskCommandNoMatchInitialDecision =
  | TaskCommandCreationOffered<false>
  | {
      readonly outcome: "clarification_requested";
      readonly operationKey: string;
      readonly policyVersion: string;
      readonly clarificationUsed: true;
      readonly terminal: false;
      readonly continuation: TaskCommandNoMatchContinuation;
    };

export type TaskCommandNoMatchContinuationDecision =
  | TaskCommandCreationOffered<true>
  | {
      readonly outcome: "still_unmatched";
      readonly operationKey: string;
      readonly policyVersion: string;
      readonly clarificationUsed: true;
      readonly terminal: true;
    };

function mergeTaskCommandNoMatchClarification(
  command: ValidatedTaskCommand,
  clarification: TaskCommandTargetHints,
): ValidatedTaskCommand {
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
  return { ...command, targetHints };
}

function creationOffered<ClarificationUsed extends boolean>(
  command: ValidatedTaskCommand,
  clarificationUsed: ClarificationUsed,
): TaskCommandCreationOffered<ClarificationUsed> | null {
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
  return null;
}

export function decideInitialTaskCommandNoMatch(
  command: ValidatedTaskCommand,
): TaskCommandNoMatchInitialDecision {
  const offered = creationOffered(command, false);
  if (offered) return offered;

  return {
    outcome: "clarification_requested",
    operationKey: command.operationKey,
    policyVersion: command.policyVersion,
    clarificationUsed: true,
    terminal: false,
    continuation: {
      [taskCommandNoMatchContinuationCommand]: command,
    },
  };
}

/**
 * Consumes the one server-side continuation state. Its result type deliberately
 * has no clarification_requested member, so callers cannot spend the bounded
 * clarification slot more than once by supplying a fresh boolean.
 */
export function continueTaskCommandNoMatch(
  continuation: TaskCommandNoMatchContinuation,
  clarification: TaskCommandTargetHints,
): TaskCommandNoMatchContinuationDecision {
  const command = mergeTaskCommandNoMatchClarification(
    continuation[taskCommandNoMatchContinuationCommand],
    clarification,
  );
  const offered = creationOffered(command, true);
  if (offered) return offered;

  return {
    outcome: "still_unmatched",
    operationKey: command.operationKey,
    policyVersion: command.policyVersion,
    clarificationUsed: true,
    terminal: true,
  };
}

/**
 * Maps a normalized create-intent payload (2G.1's `kind: "create"`) onto the
 * shape a creation session carries (2G-ROUTE-001).
 *
 * A **qualified** creation synthesizes a mutation-shaped proposal whose action
 * is the mapped qualifier, so `deriveTaskCommand` re-applies every bound, the
 * temporal lexicon and the vocabulary to it — one validator, not two. A
 * **bare** creation carries only its title words. When more than one qualifier
 * survives 2G.1's normalization, the first in
 * `TASK_COMMAND_CREATION_QUALIFIERS` declaration order wins (dueAt →
 * plannedAt → priority → projectRef → contextRef → personRef): the deployed
 * family accepts exactly one qualifier action, and the preview then shows
 * exactly what will be created before anything exists, which is the
 * visibility 2G-CREATE-002 requires.
 */
export type TaskCommandCreateIntentMapping =
  | { readonly outcome: "qualified"; readonly proposal: Record<string, unknown> }
  | { readonly outcome: "bare"; readonly title: string };

export function mapCreateIntentToCreationProposal(payload: {
  readonly titleWords: readonly string[];
  readonly patch: Record<string, unknown>;
  readonly operationKey: string;
}): TaskCommandCreateIntentMapping {
  for (const [field, action] of Object.entries(TASK_COMMAND_CREATION_QUALIFIERS)) {
    const value = payload.patch[field];
    if (typeof value !== "string" || value.trim() === "") continue;
    return {
      outcome: "qualified",
      proposal: {
        action,
        targetHints: { titleWords: [...payload.titleWords] },
        patch: { [field]: value },
        operationKey: payload.operationKey,
      },
    };
  }
  return { outcome: "bare", title: payload.titleWords.join(" ") };
}

type PreviewArgs =
  Database["public"]["Functions"]["preview_task_command_creation"]["Args"];

export type TaskCommandCreationInput = {
  readonly intent: TaskCommandCreationIntent;
  readonly observedBefore: string;
  readonly locale: Locale;
};

/**
 * `create_task_command`'s own argument type.
 *
 * Split from `PreviewArgs` in Slice 2F.3: the three creation RPCs shared one
 * shape until `create_task_command` gained its trailing origin, and preview and
 * confirmation deliberately did **not** — neither of them writes, so neither has
 * an origin to record.
 */
type CreateArgs = Database["public"]["Functions"]["create_task_command"]["Args"];

export type TaskCommandCreationClient = {
  rpc(
    fn: "preview_task_command_creation" | "issue_task_command_creation_confirmation",
    args: PreviewArgs,
  ): PromiseLike<{
    data: unknown;
    error: { message: string; code?: string; details?: string } | null;
  }>;
  rpc(
    fn: "create_task_command",
    args: CreateArgs,
  ): PromiseLike<{
    data: unknown;
    error: { message: string; code?: string; details?: string } | null;
  }>;
};

/**
 * What is being created, and on whose say-so.
 *
 * **This union is the boundary the slice exists to draw.** `no_match` is an
 * *inference*: the user typed a command, nothing matched, and the system offered
 * to create the task carrying the qualifier the command already had — so it must
 * pass through `decideInitialTaskCommandNoMatch`, which is the function that
 * decides whether offering is even honest. `manual` is not an inference at all:
 * the user opened a form, typed a title, and pressed a button that says
 * "add". There is nothing to decide and nothing to offer.
 *
 * Routing the manual form through the no-match decision would mean asserting
 * `creation_offered` about a command nobody typed, which is why the two arrive
 * here as different shapes rather than as one shape with a flag.
 */
export type TaskCommandCreationIntent =
  | { readonly kind: "no_match"; readonly command: ValidatedTaskCommand }
  | {
      readonly kind: "manual";
      readonly title: string;
      readonly operationKey: string;
      readonly policyVersion: string;
    }
  /**
   * The Phase 2G create verb (2G-ROUTE-001) — a third thing, deliberately.
   *
   * Not an inference: the user explicitly asked to create, so there is no
   * `decideInitialTaskCommandNoMatch` gate to pass and no `creation_offered`
   * claim about a failed match to assert. Not a form either: the sentence may
   * carry one qualifier, which a form never does. `create` carries the
   * validated command whose action is the mapped qualifier (so every temporal,
   * vocabulary and bound rule was re-applied by `validateTaskCommand`);
   * `create_bare` carries only a title, exactly like `manual`, and shares its
   * payload branch — the two differ in what the caller may honestly claim
   * about how the request arrived, not in what is written.
   */
  | { readonly kind: "create"; readonly command: ValidatedTaskCommand }
  | {
      readonly kind: "create_bare";
      readonly title: string;
      readonly operationKey: string;
      readonly policyVersion: string;
    };

/**
 * The manual title, reduced to the bounded word list the contract accepts.
 *
 * The RPC requires 1..12 elements, each ≤160 characters after trimming, joining
 * to a canonical title of 1..240. A title of more than twelve words is therefore
 * **grouped** rather than truncated — every word survives, and the canonical
 * title `string_agg(..., ' ')` reproduces is the user's own words in order.
 * Truncating instead would silently save a different task than the one asked for.
 *
 * Returns null when the contract cannot represent the title at all: an empty
 * title, one longer than 240 characters, or one containing a single unbroken
 * token longer than 160. The caller renders a declared, localized refusal — it
 * does not guess.
 */
export function bareCreationTitleWords(title: string): readonly string[] | null {
  const words = title.split(/\s+/).filter((word) => word !== "");
  if (words.length === 0) return null;
  if ([...words.join(" ")].length > 240) return null;
  if (words.some((word) => [...word].length > 160)) return null;
  if (words.length <= 12) return words;

  // More than twelve words: distribute them over exactly twelve groups, in
  // order. Joining the groups with a single space rebuilds the same sentence.
  const groups: string[] = [];
  const perGroup = Math.ceil(words.length / 12);
  for (let index = 0; index < words.length; index += perGroup) {
    groups.push(words.slice(index, index + perGroup).join(" "));
  }
  if (groups.some((group) => [...group].length > 160)) return null;
  return groups;
}

/**
 * The one creation payload builder, for both intents.
 *
 * Kept single deliberately: the payload is hashed into the request fingerprint
 * by `private.task_command_creation_fingerprint`, and a second builder that
 * agreed today and drifted tomorrow would surface as `2E_IDEMPOTENCY_MISMATCH`
 * on a replay of an identical request.
 */
export function buildTaskCommandCreationPayload(
  input: TaskCommandCreationInput,
): PreviewArgs {
  const { intent } = input;
  if (intent.kind === "manual" || intent.kind === "create_bare") {
    const words = bareCreationTitleWords(intent.title);
    if (words === null) {
      throw new TaskCommandApplyError(
        "the supplied title cannot be represented by the creation contract",
        "creation_title_unrepresentable",
      );
    }
    return {
      p_action: TASK_CREATION_BARE_ACTION,
      p_title_words: [...words],
      // The empty object, and nothing else. `create_title_only` is the only
      // action whose expected patch-key set is empty; every other action still
      // refuses `{}`.
      p_patch: {} as PreviewArgs["p_patch"],
      p_observed_before: input.observedBefore,
      p_policy_version: intent.policyVersion,
      p_operation_key: normalizeTaskCommandOperationKey(intent.operationKey),
    };
  }

  if (intent.kind === "create") {
    // The same honesty condition the no-match offer enforces — a task-like
    // qualifier action and a representable title — checked directly rather
    // than through `decideInitialTaskCommandNoMatch`, because that function's
    // other outcome (`clarification_requested`) belongs to the bounded
    // no-match flow and asserting it here would spend a slot the create verb
    // does not have.
    if (!isTaskLikeCreationAction(intent.command.action) || titleOf(intent.command) === null) {
      throw new TaskCommandApplyError(
        `${intent.command.action} does not carry the bounded positive payload required for standalone creation`,
        "creation_not_offered",
      );
    }
    return {
      p_action: intent.command.action,
      p_title_words: [...normalizedTitleWords(intent.command)],
      p_patch: intent.command.patch as PreviewArgs["p_patch"],
      p_observed_before: input.observedBefore,
      p_policy_version: intent.command.policyVersion,
      p_operation_key: normalizeTaskCommandOperationKey(intent.command.operationKey),
    };
  }

  const decision = decideInitialTaskCommandNoMatch(intent.command);
  if (decision.outcome !== "creation_offered") {
    throw new TaskCommandApplyError(
      `${intent.command.action} does not carry the bounded positive payload required for standalone creation`,
      "creation_not_offered",
    );
  }
  return {
    p_action: intent.command.action,
    p_title_words: [...normalizedTitleWords(intent.command)],
    p_patch: intent.command.patch as PreviewArgs["p_patch"],
    p_observed_before: input.observedBefore,
    p_policy_version: intent.command.policyVersion,
    p_operation_key: normalizeTaskCommandOperationKey(intent.command.operationKey),
  };
}

/**
 * Every action the creation family accepts, bare included.
 *
 * Widened from the seven in Slice 2F.3. The preview, the confirmation issuer and
 * the apply all echo the action back, and all three now see `create_title_only`
 * — leaving this at the seven made a legitimate manual creation parse as a
 * malformed result and report itself as a failure.
 */
const creationActionSchema = z.enum(TASK_CREATION_ACTIONS);
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
  readonly action: TaskCreationAction;
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
  readonly commandAction: TaskCreationAction;
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

/** The apply result may carry any accepted action, bare included. */

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
  readonly action: TaskCreationAction;
  readonly undoId: string;
  readonly replayed: boolean;
  readonly requestFingerprint: string;
  readonly reminderCreatedId: string | null;
  readonly undoExpiresAt: string;
  readonly creationUndone: boolean;
};

/**
 * Creates the task.
 *
 * `createdBy` is **omitted from the payload when it is `'agent'`**, not sent
 * explicitly. That is what keeps every pre-existing caller byte-identical
 * against the recreated function: the argument is absent from the wire, the
 * function's own `default 'agent'` applies, and the resolved call is exactly the
 * one that resolved before this slice.
 */
export async function createTaskCommand(
  client: TaskCommandCreationClient,
  input: TaskCommandCreationInput,
  createdBy: TaskCreationOrigin = "agent",
): Promise<TaskCommandCreated | TaskCommandApplyFailed> {
  const payload = buildTaskCommandCreationPayload(input);
  const result = await client.rpc(
    "create_task_command",
    (createdBy === "agent" ? payload : { ...payload, p_created_by: createdBy }) as CreateArgs,
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
