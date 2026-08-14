import type { SensitivityLevel } from "@/features/sensitivity/contracts";
import type { TaskSensitivity } from "@/features/sensitivity/task-derivation";

export const productStates = [
  "saved",
  "organizing",
  "needs_attention",
  "ready",
  "could_not_organize",
] as const;

export type ProductState = (typeof productStates)[number];

export const attentionReasons = [
  "review_interpretation",
  "confirm_existing_candidates",
  "answer_existing_question",
  "retry_processing",
  "resolve_consistency",
  /**
   * `BYOK-CAPTURE-002`. The entry is stored and nothing is running for it,
   * because the account has no usable AI credential.
   *
   * A reason rather than a sixth `ProductState`, because the user-facing fact is
   * the one `needs_attention` already names — something is waiting on you — and
   * the reason is what says *what*. Adding a product state would have rippled
   * through every mapper and both copy tables to express a distinction the
   * reason already carries.
   *
   * It is emphatically **not** `retry_processing`: retrying is the one action
   * that cannot help here, and offering it would send the user round a loop
   * while hiding the link that ends it.
   */
  "configure_ai_credential",
  /**
   * `2N-CONFLICT-002`. Two stored facts that cannot both be right, and the owner
   * is the only one who may decide which.
   *
   * **Emphatically not `resolve_consistency`**, which sits four lines above and
   * already means something else: *one entry the assistant could not organize*,
   * with a live producer at `lifecycle.ts:71` and copy in both locales that says
   * so. Routing a belief conflict there would make one sentence stand for two
   * unrelated problems — the defect this repository has already paid for when one
   * vocabulary served two authorities.
   *
   * It is also **not** a `TrackedAttentionReason`, and cannot become one without
   * a migration. `needs_attention_item_opened` validates `attentionReason`
   * against a five-member enum **inside the database** (`202607170024:206-212`),
   * so a row bearing this reason must not fire that event. Telemetry for it
   * belongs to 2N.7 and M2, which is the only remaining migration.
   */
  "resolve_validity_conflict",
] as const;

export type AttentionReason = (typeof attentionReasons)[number];

/**
 * The subset the **needs-attention queue** can contain, and therefore the subset
 * `needs_attention_item_opened` may report.
 *
 * Not a style choice — a coupling made visible. That analytics event validates
 * `attentionReason` against a five-member enum **inside the database**
 * (`202607170024:205`), and `list_needs_attention` is an RPC that BYOK.4 does not
 * change. So `configure_ai_credential` cannot appear in that queue and cannot be
 * reported by that event, and typing the view's `kind` narrowly is what makes
 * that a compile error rather than a runtime `22023` from a check constraint
 * nobody was thinking about.
 *
 * The awaiting state still reaches the user, through the two surfaces that read
 * `entries.status` directly: the Inbox and the entry detail.
 */
export const trackedAttentionReasons = [
  "review_interpretation",
  "confirm_existing_candidates",
  "answer_existing_question",
  "retry_processing",
  "resolve_consistency",
] as const;

export type TrackedAttentionReason = (typeof trackedAttentionReasons)[number];

export const dailyCycleActions = [
  "open_entry",
  "review_interpretation",
  "confirm_existing_candidates",
  "answer_existing_question",
  "retry_processing",
  "resolve_consistency",
  "correct_interpretation",
  "undo_correction",
  "undo_task_creation",
  "open_task",
  "complete_task",
  "wait_task",
  "resume_task",
  "reopen_task",
  /** Goes to Settings, which is where the awaiting state is resolved. */
  "configure_ai_credential",
  /** `BYOK-CAPTURE-004`/`006` — the bounded, explicit pending-entry action. */
  "interpret_pending_entries",
  /**
   * `2N-CONFLICT-003` — opens the memory whose validity window is impossible.
   *
   * It navigates. There is no in-place variant and there must not be one: the
   * write it leads to is `setMemoryLifecycle`, and offering it as one tap from a
   * list would resolve the contradiction without the owner ever seeing the two
   * dates that caused it.
   */
  "resolve_validity_conflict",
] as const;

export type DailyCycleAction = (typeof dailyCycleActions)[number];

export const dailyCycleMessageKeys = [
  "capture_saved",
  "capture_replayed",
  "correction_saved",
  "undo_applied",
  "reprocessing_queued",
  "candidates_confirmed",
  "task_creation_undone",
  "retry_scheduled",
  "question_answered",
  "validation_failed",
  "session_expired",
  "item_not_found",
  "version_conflict",
  "action_unavailable",
  "retry_not_available",
  "action_failed",
  /** `BYOK-CAPTURE-006` — reports the count, so it is a template. */
  "pending_entries_queued",
  "pending_entries_none",
  "credential_required",
] as const;

export type DailyCycleMessageKey = (typeof dailyCycleMessageKeys)[number];

export type SerializablePrimitive = string | number | boolean | null;
export type SerializableValue = SerializablePrimitive | readonly SerializableValue[] | SerializableRecord;
export type SerializableRecord = { readonly [key: string]: SerializableValue };

function isPlainRecord(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function isDailyCycleSerializable(value: unknown): value is SerializableValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isDailyCycleSerializable);
  if (typeof value !== "object" || !isPlainRecord(value)) return false;

  return Object.values(value).every(isDailyCycleSerializable);
}

export type AvailableAction = {
  readonly id: DailyCycleAction;
  readonly href?: string;
};

export type CaptureReceipt = {
  readonly entryId: string;
  readonly persisted: true;
  readonly productState: ProductState;
  readonly messageKey: DailyCycleMessageKey;
  readonly safeHref?: string;
  readonly replayed: boolean;
};

export type InboxItemView = {
  readonly entryId: string;
  readonly title: string;
  readonly originalPreview: string;
  readonly productState: ProductState;
  readonly attentionReason?: AttentionReason;
  readonly significantAt: string;
  readonly availableActions: readonly AvailableAction[];
  readonly originalPreserved: boolean;
};

export type NeedsAttentionItemView = {
  readonly key: string;
  readonly kind: TrackedAttentionReason;
  readonly entryId: string;
  readonly title: string;
  /**
   * `2J-PRIVACY-005`. The queue renders a 240-character preview of the entry's
   * own text, so the row carries content and must carry its classification with
   * it. Threaded through the projection rather than fetched at render time:
   * a surface that has to ask a second question to know whether it may print
   * something will eventually forget to ask.
   */
  readonly sensitivity: SensitivityLevel;
  readonly explanation: string;
  readonly primaryAction: AvailableAction;
  readonly secondaryAction?: AvailableAction;
  readonly occurredAt: string;
  readonly groupKey: string;
};

/**
 * A conflict row in the same queue (`2N-CONFLICT-003`).
 *
 * A **separate shape** rather than a widened `NeedsAttentionItemView`, and the
 * reason is structural rather than stylistic. That view requires `entryId`,
 * because every row it describes comes from `list_needs_attention` and is
 * hydrated from `entries.original_content`. **A memory is not an entry** — and
 * `memories.source_entry_id` is `on delete set null`, so a memory may have no
 * entry at all. Making `entryId` optional to fit this in would have weakened the
 * field for the twenty rows that genuinely have one, and the analytics event the
 * entry row fires would then have had an `undefined` to send.
 *
 * Both shapes render in **one** queue, on the same page, inside the same list.
 * The separation is in the types, not in the surface.
 */
export type ConflictAttentionItemView = {
  readonly key: string;
  readonly reason: "resolve_validity_conflict";
  readonly memoryId: string;
  /** The memory's own words. Masked by the surface, exactly like an entry preview. */
  readonly content: string;
  readonly sensitivity: SensitivityLevel;
  /**
   * Both halves of the impossible window, raw.
   *
   * Formatted at the surface with the owner's zone and locale, never here:
   * `LDC-DAILY-001`, and the same threading `NeedsAttentionItemRow` already uses
   * for its timestamp. A projection that pre-formatted them would be a second
   * place the owner's zone is decided.
   */
  readonly validFrom: string;
  readonly validUntil: string;
  readonly action: AvailableAction;
};

export type HumanFieldView = {
  key: string;
  label: string;
  value: string | null;
  editable: boolean;
};

export type AttentionItemView = {
  key: string;
  reason: AttentionReason;
  title: string;
  explanation: string;
  availableActions: readonly AvailableAction[];
};

export type ActionableCandidateView = {
  key: string;
  title: string;
  description?: string;
  dueAt?: string;
};

export type MaterializedTaskView = {
  taskId: string;
  title: string;
  dueAt?: string;
};

export type CandidateOutcomeView = {
  key: string;
  title: string;
  outcomeLabel: string;
  resolvedAt: string;
};

export type OriginalEntryView = {
  content: string;
  occurredAt: string;
  isRetroactive: boolean;
};

export type InterpretationReviewView = {
  entryId: string;
  productState: ProductState;
  understanding: string;
  humanFields: readonly HumanFieldView[];
  attentionItems: readonly AttentionItemView[];
  actionableCandidates: readonly ActionableCandidateView[];
  materializedTasks: readonly MaterializedTaskView[];
  candidateOutcomes: readonly CandidateOutcomeView[];
  availableActions: readonly AvailableAction[];
  original: OriginalEntryView;
  hasTechnicalDetails: boolean;
};

/**
 * What exists *because of* an entry (UX-04).
 *
 * The audit found the entry page could not answer "what was created?": confirmed
 * tasks appeared only as a transient success message on the candidate form, and
 * the people, projects and contexts the interpretation detected sat behind a
 * disclosure named "technical details" — which is where model ids and trust
 * scores belong, not where the owner's own relationships do.
 *
 * These are **read-only** shapes over rows that already exist. Every family is a
 * plain foreign key back to the entry (`tasks.source_entry_id`,
 * `reminders.entry_id`, `memories.source_entry_id`, `entry_entities.entry_id`),
 * so no write contract, projection rewrite or migration is involved in reading
 * them back.
 */
export const entryOutcomeFamilies = ["task", "reminder", "memory", "entity"] as const;

export type EntryOutcomeFamily = (typeof entryOutcomeFamilies)[number];

export type EntryOutcomeItem = {
  readonly key: string;
  readonly family: EntryOutcomeFamily;
  /** The row's own words — a task title, a memory's text, a person's name. */
  readonly title: string;
  /** One localized line of context: a due date, a state, a relationship kind. */
  readonly detail: string | null;
  /**
   * Where the owner can go to inspect it, or `null` when no route exists for
   * this object. A `null` here renders as plain text, never as a dead link —
   * the UX-20 rule that what looks actionable must be actionable.
   */
  readonly href: string | null;
};

export type EntryOutcomeGroup = {
  readonly family: EntryOutcomeFamily;
  readonly heading: string;
  readonly items: readonly EntryOutcomeItem[];
};

export type EntryOutcomeView = {
  readonly entryId: string;
  readonly groups: readonly EntryOutcomeGroup[];
  /** True when nothing was created, so the section can say so rather than vanish. */
  readonly isEmpty: boolean;
};

export type InterpretationTechnicalDetailsView = {
  entryId: string;
  versions: readonly { id: string; version: number; createdAt: string }[];
  source: SerializableRecord;
  model: string | null;
  scores: SerializableRecord;
  policies: SerializableRecord;
  signals: SerializableRecord;
  evidence: SerializableRecord;
  overrides: SerializableRecord;
  comparisons: SerializableRecord;
  provenance: SerializableRecord;
};

/**
 * The states a task can be *shown* in, in the user's own terms.
 *
 * `cancelled` was missing until Slice D2, and its absence was not a filter —
 * every list projection excludes cancelled tasks **in SQL** (`work-projection.ts`
 * filters it on all three branches). What the gap actually did was make
 * `toWorkItemView` return null for a cancelled row, so `loadTaskDetailProjection`
 * returned null and `/[locale]/app/work/[taskId]` answered **404 for every
 * cancelled task**. That made `restore_task` — the one verb the taxonomy admits
 * on a cancelled task — unreachable from the surface that offers it, and left a
 * user who had just cancelled a task from the detail page on a page that 404s on
 * its next load.
 *
 * Adding the member cannot surface a cancelled task in any list, because the
 * mapper's null was never the mechanism keeping them out.
 */
export const workItemHumanStates = [
  "not_started",
  "in_progress",
  "waiting_on_someone",
  "blocked",
  "deferred",
  "completed",
  "cancelled",
] as const;

export type WorkItemHumanState = (typeof workItemHumanStates)[number];

export const workItemOrigins = ["you", "brain"] as const;
export type WorkItemOrigin = (typeof workItemOrigins)[number];

export const workItemPriorities = ["low", "medium", "high", "urgent"] as const;
export type WorkItemPriority = (typeof workItemPriorities)[number];

export type RelationSummary = {
  readonly id: string;
  readonly label: string;
};

export type WorkItemView = {
  readonly taskId: string;
  readonly title: string;
  readonly description?: string;
  readonly dueAt?: string;
  readonly plannedAt?: string;
  readonly priority?: WorkItemPriority;
  readonly intentionalNoDue: boolean;
  readonly noDueReason?: string;
  readonly humanState: WorkItemHumanState;
  readonly origin: WorkItemOrigin;
  readonly availableActions: readonly AvailableAction[];
  readonly projects: readonly RelationSummary[];
  readonly contexts: readonly RelationSummary[];
  readonly people: readonly RelationSummary[];
  readonly waitingOnPeople: readonly RelationSummary[];
  readonly parent?: RelationSummary;
  readonly dependsOn?: readonly RelationSummary[];
  /**
   * `2L-PRIVACY-001` — what classification, if any, applies to this task.
   *
   * Carried on the view next to the title and the description it governs, for
   * the reason `NeedsAttentionItemView.sensitivity` is: a surface that had to
   * fetch it separately at render time is a surface that can forget to.
   *
   * **Required, and not optional.** An optional field would let a projection
   * omit it and a component read `undefined`, and the fail-closed narrowing in
   * `toWorkItemView` would never run. It is also a `TaskSensitivity` rather
   * than a `SensitivityLevel`, because a manual task has no derivable level at
   * all and there must be nothing here to misread as `normal` (OD-2L-1 B).
   */
  readonly sensitivity: TaskSensitivity;
};
