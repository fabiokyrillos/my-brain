/**
 * The read-only effect preview (PRD §13.4, Epic 2E-C).
 *
 * Pure, like the matcher and for the same reasons: no I/O, no Supabase client,
 * no ambient clock. It is a total function of one already-observed candidate
 * set, the validated command, the caller's locale and timezone, and an injected
 * instant. That is what makes 2E-PREVIEW-001's `willMutate: false` a structural
 * fact rather than a promise — this module has nothing to mutate *with*.
 *
 * It deliberately does **not** re-read the task. `list_task_command_candidates`
 * projects the whole pre-state of every field §11.2 can change, plus the
 * patch's resolved relation references and the task's scheduled reminders, all
 * observed at one instant that travels with the rows as `observedBefore`. A
 * second read would produce a pre-state from a *later* instant than the one the
 * fingerprint claims, which is precisely the TOCTOU window `observedBefore`
 * exists to close, and 2E-UPDATE-003 will gate a write on it.
 *
 * There is no normalizer here, and there cannot be. Every lexical decision —
 * including "does the task already hold the project the user named" — was made
 * in SQL by `public.normalize_entity_alias`; the answer arrives as a resolved
 * uuid and this module compares uuids. Re-deriving it with `normalizeEntityName`
 * would reintroduce the divergence 2E-MATCH-008 characterizes, and would let a
 * preview report "will add Acme" where the Slice 2E.4 RPC computes `no_change`.
 * `normalizer-divergence.test.ts` enforces that structurally across this whole
 * directory.
 */

import { getTaskCommandCopy, type TaskCommandLinkedEffectKind } from "./copy";
import type { TaskCandidateRow, TaskMatchResult, TaskPreState } from "./matching";
import {
  TASK_COMMAND_UNDO_WINDOW_HOURS,
  actionPolicy,
  isEligibleStatus,
  type TaskChangedField,
  type TaskCommandAction,
} from "./taxonomy";
import type {
  TaskCommandOutcome,
  TaskCommandPreviewDisposition,
  TaskCommandPreviewRefusal,
} from "./outcomes";
import type { ValidatedTaskCommand } from "./schema";
import type { Locale } from "@/lib/preferences";

/** A precondition the caller violated, not a product outcome the user sees. */
export class TaskPreviewInputError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "TaskPreviewInputError";
    this.code = code;
  }
}

/**
 * The concrete change, with every reference resolved.
 *
 * This is what 2E-PREVIEW-004 hashes and what Slice 2E.4's RPC will apply, so
 * it holds ids rather than the user's words: `assign_project` becomes
 * `{ projectId }`, never `{ projectRef: "Acme" }`. Binding the id is what stops
 * a project being renamed between preview and apply from silently retargeting
 * the assignment, and it is the value `remove_added_relation` undo needs in
 * order to delete only the row the operation created (2E-UPDATE-015).
 *
 * Keys are omitted rather than set to `undefined`, so the canonical JSON has no
 * holes; instants are the ISO-8601 strings the command already resolved, never
 * `Date` objects, because the fingerprint is computed over text.
 */
export type TaskCommandCanonicalPatch = {
  readonly status?: string;
  readonly title?: string;
  readonly description?: string;
  readonly dueAt?: string | null;
  readonly plannedAt?: string;
  readonly manualPriority?: string;
  readonly intentionalNoDue?: boolean;
  readonly noDueReason?: string | null;
  readonly projectId?: string;
  readonly contextId?: string;
  readonly personId?: string;
  readonly personRole?: string;
};

/**
 * One side of a before/after pair.
 *
 * `text` is always display-ready and localized, so a component renders it
 * without knowing a domain rule — `ENGINEERING_STANDARDS` keeps that knowledge
 * out of components. `kind` travels so the component can *style* the difference
 * between "this is empty" and "this is a date" without parsing `text` back.
 *
 * `atApply` exists because `completed_at` and `cancelled_at` are set to the
 * instant of the write, which a preview cannot know. Rendering a plausible
 * timestamp for them would be the preview's first lie.
 */
export type TaskCommandDeltaValue = {
  readonly kind: "empty" | "text" | "instant" | "flag" | "atApply";
  readonly text: string;
  /** The raw ISO instant, for `kind === "instant"` only. */
  readonly instant?: string;
};

export type TaskCommandFieldDelta = {
  readonly field: TaskChangedField;
  readonly label: string;
  readonly before: TaskCommandDeltaValue;
  readonly after: TaskCommandDeltaValue;
  readonly changed: boolean;
};

export type TaskCommandLinkedEffect = {
  readonly kind: TaskCommandLinkedEffectKind;
  readonly text: string;
};

export type TaskCommandPreviewTask = {
  readonly taskId: string;
  /**
   * Null on a stale or refused preview.
   *
   * Those shapes are produced before ownership has been established, so they
   * carry no task content at all rather than content no check has cleared.
   */
  readonly title: string | null;
  readonly status: string | null;
};

export type TaskCommandPreview = {
  /**
   * The literal `false`, as a type. Mirrors
   * `QuestionEffectPreview.willMutate` — a boolean would let a future edit set
   * it true and still compile, which is the entire value of the literal.
   */
  readonly willMutate: false;
  readonly disposition: TaskCommandPreviewDisposition;
  /** Present only when `disposition === "refused"`. */
  readonly refusal: TaskCommandPreviewRefusal | null;
  readonly action: TaskCommandAction;
  readonly task: TaskCommandPreviewTask;
  /** Every field the action changes, changed or not (2E-PREVIEW-002). */
  readonly deltas: readonly TaskCommandFieldDelta[];
  readonly effects: readonly TaskCommandLinkedEffect[];
  readonly canonicalPatch: TaskCommandCanonicalPatch;
  readonly reversible: boolean;
  readonly undoWindowHours: number;
  readonly destructive: boolean;
  readonly requiresConfirmation: boolean;
  /** A single Apply control is permitted. False for every non-`previewed` disposition. */
  readonly oneStep: boolean;
  /**
   * The instant the pre-state was observed at; the fingerprint's TOCTOU anchor.
   *
   * Null only on a shell whose match carried no candidates, where there is no
   * observation to report. It was an empty string, which is a fabricated
   * instant — the one value this field must never hold, since Slice 2E.4 hashes
   * it.
   */
  readonly observedBefore: string | null;
  readonly policyVersion: string;
  /** Carried for provenance, deliberately *not* hashed — see `fingerprint.ts`. */
  readonly matchPolicyVersion: string;
  readonly copy: {
    readonly title: string;
    readonly description: string;
    readonly notice: string;
    readonly reversibility: string;
    readonly undoWindow: string | null;
    readonly gravity: string | null;
  };
};

export type TaskCommandPreviewInput = {
  readonly command: ValidatedTaskCommand;
  readonly result: TaskMatchResult;
  /**
   * The rows the match was computed from.
   *
   * Taken alongside `result` rather than through it: `RankedTaskCandidate`
   * carries only `preState`, and the reminder and relation-reference columns are
   * preview data rather than match signal. Threading them through the ranked
   * shape would put them in the fingerprint's pre-state, where the heartbeat
   * flipping a reminder `scheduled → sent` on its hourly tick would manufacture
   * a stale-preview refusal no user caused.
   */
  readonly rows: readonly TaskCandidateRow[];
  readonly selectedTaskId: string;
  /**
   * What the client believes it is previewing, echoed back from an earlier
   * render. `null` on the first preview.
   *
   * 2E-PREVIEW-006: a preview that no longer reflects current state is reported
   * as stale rather than silently recomputed. `updatedAt` is the witness —
   * `202607250056` projects it for exactly this, and it is not the recency
   * signal, which reads `audit_logs` instead.
   */
  readonly expected?: { readonly taskId: string; readonly updatedAt: string } | null;
  readonly locale: Locale;
  readonly timeZone: string;
};

function instantMs(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Two instants are equal when they name the same moment, not when they are the
 * same string.
 *
 * `2026-07-31T12:00:00Z` and `2026-07-31T09:00:00-03:00` are one instant, and a
 * string comparison would call rescheduling a task to the time it already has a
 * change — producing an audit row, an undo row and a reminder churn for a
 * user-visible no-op, which is exactly what 2E-PREVIEW-005 forbids.
 */
function sameInstant(left: string | null, right: string | null): boolean {
  const a = instantMs(left);
  const b = instantMs(right);
  if (a === null || b === null) return left === right;
  return a === b;
}

function renderInstant(iso: string, locale: Locale, timeZone: string, fallback: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "short",
      timeStyle: "short",
      timeZone,
    }).format(new Date(iso));
  } catch {
    // An unknown IANA zone or an unparseable instant must not take the whole
    // preview down. `formatInstantForDateTimeLocal` throws in this case, which
    // is why this does not reuse it.
    return fallback;
  }
}

export function buildTaskCommandPreview(input: TaskCommandPreviewInput): TaskCommandPreview {
  const { command, result, rows, selectedTaskId, locale, timeZone } = input;
  const copy = getTaskCommandCopy(locale);
  const policy = actionPolicy(command.action);

  // The selected candidate has to come from the match this preview is *for*.
  // Accepting a task id the match did not rank would let a caller preview any
  // task it could name, which is a different authorization question from the
  // one `list_task_command_candidates` already answered.
  const candidate = result.candidates.find((entry) => entry.taskId === selectedTaskId);
  const row = rows.find((entry) => entry.taskId === selectedTaskId);

  // 2E-DISAMBIG-005: a candidate that became ineligible between listing and
  // selection is stale, not an error. `unmatched` is the same shape of answer —
  // the thing the user picked is no longer there to act on.
  if (candidate === undefined || row === undefined) {
    // The selected candidate is not in this match result.
    return staleShell(input, copy);
  }
  if (row.ownerId !== result.ownerId) {
    // Not a product outcome. `loadTaskCandidates` already raises on a
    // cross-owner row; reaching here means a caller assembled rows by hand.
    throw new TaskPreviewInputError(
      "the selected candidate is owned by another user",
      "cross_owner_candidate",
    );
  }
  if (!isEligibleStatus(command.action, candidate.preState.status)) {
    // The candidate became ineligible for this action between listing and
    // selection — 2E-DISAMBIG-005 makes that stale, not an error.
    return staleShell(input, copy);
  }
  if (result.observedBefore === null) {
    throw new TaskPreviewInputError(
      "a match with candidates must carry an observation instant",
      "missing_observation",
    );
  }
  if (input.expected != null && input.expected.taskId === selectedTaskId
    && input.expected.updatedAt !== candidate.preState.updatedAt) {
    // The task changed since the preview the client is holding.
    return staleShell(input, copy);
  }

  const pre = candidate.preState;
  const resolution = resolveRelationReference(command.action, row);
  if (resolution.status === "unresolved") {
    return refusedShell(input, copy, "relation_reference_unresolved");
  }
  // `none` and `resolved` are both legal here and mean different things: the
  // action writes no relation at all, versus it writes one that resolved. Only
  // the second carries an id, so the union is narrowed rather than indexed.
  const resolvedId = resolution.status === "resolved" ? resolution.entityId : null;

  const patch = buildCanonicalPatch({ command, pre, resolvedId });
  const deltas = buildDeltas({ action: command.action, pre, patch, row, copy, locale, timeZone });
  const changed = deltas.some((delta) => delta.changed)
    || relationChanges(command.action, row, resolvedId);

  const disposition: TaskCommandPreviewDisposition = !changed
    ? "no_change"
    : policy.requiresConfirmation
      ? "matched_requires_confirmation"
      : "previewed";

  const effects = changed
    ? buildLinkedEffects({
        action: command.action,
        pre,
        patch,
        row,
        observedBefore: result.observedBefore,
        copy,
        locale,
        timeZone,
      })
    : [];

  return {
    willMutate: false,
    disposition,
    refusal: null,
    action: command.action,
    task: { taskId: candidate.taskId, title: pre.title, status: pre.status },
    deltas,
    effects,
    canonicalPatch: patch,
    // 2E-UNDO-002: an action that cannot be truthfully reversed is not
    // advertised as reversible, and a `no_change` preview reverses nothing, so
    // it claims nothing.
    reversible: changed && policy.reversible,
    undoWindowHours: TASK_COMMAND_UNDO_WINDOW_HOURS,
    destructive: policy.destructive,
    requiresConfirmation: policy.requiresConfirmation,
    // Gravity and confidence are independent axes (2E-MATCH-012): the match
    // decided `oneStep`, and this only withdraws it when there is nothing to
    // apply. It never grants it.
    oneStep: disposition === "previewed" && result.oneStep,
    observedBefore: result.observedBefore,
    policyVersion: command.policyVersion,
    matchPolicyVersion: result.matchPolicyVersion,
    copy: {
      title: copy.dispositions[disposition].title,
      description: copy.dispositions[disposition].description,
      notice: copy.preview.readOnlyNotice,
      reversibility:
        changed && policy.reversible ? copy.preview.reversible : copy.preview.notReversible,
      undoWindow: changed && policy.reversible ? copy.preview.undoWindow : null,
      gravity: policy.destructive
        ? copy.preview.destructive
        : policy.requiresConfirmation
          ? copy.preview.confirmationRequired
          : null,
    },
  };
}

/**
 * Which relation the action writes, and whether its reference resolved.
 *
 * The three ref columns are query-scalar, so the row carries whichever one the
 * command asked SQL to resolve; an action that writes no relation asks for none
 * and this returns `none`.
 */
function resolveRelationReference(
  action: TaskCommandAction,
  row: TaskCandidateRow,
): { status: "none" } | { status: "resolved"; entityId: string } | { status: "unresolved" } {
  const changed = actionPolicy(action).changedFields;
  const id = changed.includes("task_projects")
    ? row.projectRefId
    : changed.includes("task_contexts")
      ? row.contextRefId
      : changed.includes("task_people:involved") || changed.includes("task_people:waiting_on")
        ? row.personRefId
        : undefined;
  if (id === undefined) return { status: "none" };
  return id === null ? { status: "unresolved" } : { status: "resolved", entityId: id };
}

/** The role `task_people` row this action writes, or null when it writes none. */
function personRoleFor(action: TaskCommandAction): string | null {
  const changed = actionPolicy(action).changedFields;
  if (changed.includes("task_people:waiting_on")) return "waiting_on";
  if (changed.includes("task_people:involved")) return "involved";
  return null;
}

/**
 * Whether the relation this action writes is one the task does not already
 * hold (2E-PREVIEW-005).
 *
 * Compared by id, never by name. For people the comparison is on the
 * `(personId, role)` pair, because `task_people` is keyed on
 * `(task_id, person_id, role)`: a person already linked as `involved` does not
 * make `set_waiting_on` a no-op, and treating it as one would silently drop a
 * `waiting_on` link the user asked for.
 */
function relationChanges(
  action: TaskCommandAction,
  row: TaskCandidateRow,
  resolvedId: string | null,
): boolean {
  if (resolvedId === null) return false;
  const changed = actionPolicy(action).changedFields;
  if (changed.includes("task_projects")) return !row.projectIds.includes(resolvedId);
  if (changed.includes("task_contexts")) return !row.contextIds.includes(resolvedId);
  const role = personRoleFor(action);
  if (role === null) return false;
  return !row.personIds.some(
    (personId, index) => personId === resolvedId && row.personRoles[index] === role,
  );
}

function buildCanonicalPatch(input: {
  command: ValidatedTaskCommand;
  pre: TaskPreState;
  resolvedId: string | null;
}): TaskCommandCanonicalPatch {
  const { command, pre, resolvedId } = input;
  const policy = actionPolicy(command.action);
  const draft: Record<string, unknown> = {};

  // The destination status comes from the taxonomy for the four actions that
  // decide it, and from the patch for `set_status`, which is the only action
  // whose `targetValueField` is `status`.
  if (policy.targetStatus !== null) draft.status = policy.targetStatus;
  else if (command.patch.status !== undefined) draft.status = command.patch.status;

  if (command.patch.title !== undefined) draft.title = command.patch.title;
  if (command.patch.note !== undefined) {
    // `append_note` writes `description`, not a note column. The proposed value
    // is the concatenation, so the preview shows what the field will actually
    // hold rather than only the fragment being added.
    draft.description =
      pre.description !== null && pre.description !== ""
        ? `${pre.description}\n\n${command.patch.note}`
        : command.patch.note;
  }
  if (command.patch.priority !== undefined) draft.manualPriority = command.patch.priority;
  if (command.patch.plannedAt !== undefined) draft.plannedAt = command.patch.plannedAt;

  if (command.action === "clear_due") {
    draft.dueAt = null;
  } else if (command.patch.dueAt !== undefined) {
    draft.dueAt = command.patch.dueAt;
    // 2E-UPDATE-012: `tasks_no_due_consistency_check` forbids a due date on an
    // intentionally-undated task, so the two flags move with it atomically and
    // the preview shows that they did — rather than the write raising a raw
    // 23514 the user cannot act on.
    if (pre.intentionalNoDue) {
      draft.intentionalNoDue = false;
      draft.noDueReason = null;
    }
  }

  if (resolvedId !== null) {
    const changed = policy.changedFields;
    if (changed.includes("task_projects")) draft.projectId = resolvedId;
    else if (changed.includes("task_contexts")) draft.contextId = resolvedId;
    else {
      const role = personRoleFor(command.action);
      if (role !== null) {
        draft.personId = resolvedId;
        draft.personRole = role;
      }
    }
  }

  // Sorted, and holes dropped. The fingerprint is a hash of this object's JSON,
  // and 2E-IDEMPOTENCY-003 requires it stable under key reordering. jsonb
  // re-sorts on the SQL side too, so this is belt and braces — but it also
  // makes the object equal-by-value in tests, which the SQL cannot do for us.
  const canonical: Record<string, unknown> = {};
  for (const key of Object.keys(draft).sort()) {
    if (draft[key] !== undefined) canonical[key] = draft[key];
  }
  return canonical as TaskCommandCanonicalPatch;
}

function emptyValue(copy: ReturnType<typeof getTaskCommandCopy>): TaskCommandDeltaValue {
  return { kind: "empty", text: copy.values.empty };
}

function textValue(text: string): TaskCommandDeltaValue {
  return { kind: "text", text };
}

function instantValue(
  iso: string,
  copy: ReturnType<typeof getTaskCommandCopy>,
  locale: Locale,
  timeZone: string,
): TaskCommandDeltaValue {
  return {
    kind: "instant",
    text: renderInstant(iso, locale, timeZone, copy.values.unrenderableInstant),
    instant: iso,
  };
}

function buildDeltas(input: {
  action: TaskCommandAction;
  pre: TaskPreState;
  patch: TaskCommandCanonicalPatch;
  row: TaskCandidateRow;
  copy: ReturnType<typeof getTaskCommandCopy>;
  locale: Locale;
  timeZone: string;
}): readonly TaskCommandFieldDelta[] {
  const { action, pre, patch, row, copy, locale, timeZone } = input;
  const deltas: TaskCommandFieldDelta[] = [];

  const push = (
    field: TaskChangedField,
    before: TaskCommandDeltaValue,
    after: TaskCommandDeltaValue,
    changed: boolean,
  ): void => {
    deltas.push({ field, label: copy.fields[field], before, after, changed });
  };

  const nullableInstant = (value: string | null): TaskCommandDeltaValue =>
    value === null ? emptyValue(copy) : instantValue(value, copy, locale, timeZone);
  const nullableText = (value: string | null): TaskCommandDeltaValue =>
    value === null || value === "" ? emptyValue(copy) : textValue(value);

  // Driven by the taxonomy's `changedFields`, in its declared order, so no
  // action can quietly acquire a field the preview does not render. `reminders`
  // is the one member that is a linked effect rather than a column, and it is
  // disclosed by `buildLinkedEffects` instead.
  for (const field of actionPolicy(action).changedFields) {
    switch (field) {
      case "status": {
        const after = patch.status ?? pre.status;
        push("status", textValue(pre.status), textValue(after), after !== pre.status);
        break;
      }
      // Set on entering the terminal status, cleared on leaving it — mirroring
      // `persistTaskStatus`, so the two write paths cannot disagree.
      //
      // Entering is *always* a change, whatever the column held. An earlier
      // version asked whether the value was null, which reported
      // `changed: false` for a non-terminal task carrying a stale
      // `completed_at` — a state that is reachable today, because PRD §3.2
      // records no CHECK relating `status` to these columns and the live write
      // path is a plain client UPDATE. The row then rendered an instant on the
      // left, "when you apply" on the right, and `changed: false` between them,
      // contradicting itself.
      case "completed_at": {
        const entering = patch.status === "completed";
        push(
          "completed_at",
          nullableInstant(pre.completedAt),
          entering ? { kind: "atApply", text: copy.values.atApply } : emptyValue(copy),
          entering || pre.completedAt !== null,
        );
        break;
      }
      case "cancelled_at": {
        const entering = patch.status === "cancelled";
        push(
          "cancelled_at",
          nullableInstant(pre.cancelledAt),
          entering ? { kind: "atApply", text: copy.values.atApply } : emptyValue(copy),
          entering || pre.cancelledAt !== null,
        );
        break;
      }
      case "title": {
        const after = patch.title ?? pre.title;
        push("title", textValue(pre.title), textValue(after), after !== pre.title);
        break;
      }
      case "description": {
        const after = patch.description ?? pre.description;
        push(
          "description",
          nullableText(pre.description),
          nullableText(after ?? null),
          after !== pre.description,
        );
        break;
      }
      case "due_at": {
        const after = patch.dueAt !== undefined ? patch.dueAt : pre.dueAt;
        push("due_at", nullableInstant(pre.dueAt), nullableInstant(after), !sameInstant(pre.dueAt, after));
        break;
      }
      case "planned_at": {
        const after = patch.plannedAt ?? pre.plannedAt;
        push(
          "planned_at",
          nullableInstant(pre.plannedAt),
          nullableInstant(after ?? null),
          !sameInstant(pre.plannedAt, after ?? null),
        );
        break;
      }
      case "manual_priority": {
        const after = patch.manualPriority ?? pre.manualPriority;
        push(
          "manual_priority",
          nullableText(pre.manualPriority),
          nullableText(after ?? null),
          after !== pre.manualPriority,
        );
        break;
      }
      case "intentional_no_due": {
        const after = patch.intentionalNoDue ?? pre.intentionalNoDue;
        push(
          "intentional_no_due",
          { kind: "flag", text: String(pre.intentionalNoDue) },
          { kind: "flag", text: String(after) },
          after !== pre.intentionalNoDue,
        );
        break;
      }
      case "no_due_reason": {
        const after = patch.noDueReason !== undefined ? patch.noDueReason : pre.noDueReason;
        push(
          "no_due_reason",
          nullableText(pre.noDueReason),
          nullableText(after),
          after !== pre.noDueReason,
        );
        break;
      }
      case "task_projects":
      case "task_contexts":
      case "task_people:involved":
      case "task_people:waiting_on": {
        push(
          field,
          relationBefore(field, row, copy),
          relationAfter(field, row, action, patch, copy),
          relationChanges(action, row, resolvedIdOf(patch)),
        );
        break;
      }
      case "reminders":
        break;
    }
  }

  return deltas;
}

function resolvedIdOf(patch: TaskCommandCanonicalPatch): string | null {
  return patch.projectId ?? patch.contextId ?? patch.personId ?? null;
}

function relationBefore(
  field: TaskChangedField,
  row: TaskCandidateRow,
  copy: ReturnType<typeof getTaskCommandCopy>,
): TaskCommandDeltaValue {
  const names =
    field === "task_projects"
      ? [...row.projectNames]
      : field === "task_contexts"
        ? [...row.contextNames]
        : row.personNames.filter(
            (_name, index) =>
              row.personRoles[index] === (field === "task_people:waiting_on" ? "waiting_on" : "involved"),
          );
  return names.length === 0 ? emptyValue(copy) : textValue(names.join(", "));
}

function relationAfter(
  field: TaskChangedField,
  row: TaskCandidateRow,
  action: TaskCommandAction,
  patch: TaskCommandCanonicalPatch,
  copy: ReturnType<typeof getTaskCommandCopy>,
): TaskCommandDeltaValue {
  const before = relationBefore(field, row, copy);
  const resolved = resolvedIdOf(patch);
  if (resolved === null) return before;

  // The resolved entity's *stored* name, projected by SQL alongside its id.
  //
  // An earlier version looked the id up in the row's own relation arrays — the
  // relations the task already holds — which meant the name resolved only when
  // the task already had it, and the actual addition rendered "+1". A review
  // proved it: `assign_project` onto a task with no project produced
  // `after: "+1"`, and onto a task that already held the project produced
  // "Acme, Acme" beside copy saying nothing would change.
  const resolvedName =
    field === "task_projects"
      ? row.projectRefName
      : field === "task_contexts"
        ? row.contextRefName
        : row.personRefName;

  // Already held under the role this action writes, so `after` *is* `before`.
  // Appending here is what produced the duplicated name, and it contradicted
  // the `no_change` verdict computed from the same facts.
  if (!relationChanges(action, row, resolved)) return before;

  if (resolvedName === null) {
    // The id resolved but its name did not, which SQL only produces if the
    // entity was deleted between the resolver and the name lookup inside one
    // `stable` snapshot — not reachable today. Falling back to `before` states
    // less than we know rather than inventing a label.
    return before;
  }
  return before.kind === "empty"
    ? textValue(resolvedName)
    : textValue(`${before.text}, ${resolvedName}`);
}

/**
 * 2E-PREVIEW-003, rendered from observed state rather than from §11.3's
 * assumptions.
 *
 * §11.3 says `reopen_task` "re-creates the reminder the INSERT-only trigger
 * cannot", which presumes the task has none. That presumption does not hold for
 * rows written before Phase 2E: nothing in this repository has ever cancelled a
 * reminder on completion or cancellation — the only writers are the `after
 * insert` trigger and the heartbeat's two mark-sent updates — and
 * `authenticated` can insert and delete reminders directly. So a completed task
 * may still carry a live `scheduled` row, and the preview says what is there.
 */
function buildLinkedEffects(input: {
  action: TaskCommandAction;
  pre: TaskPreState;
  patch: TaskCommandCanonicalPatch;
  row: TaskCandidateRow;
  /**
   * The one instant this preview treats as now.
   *
   * Taken from the match result rather than from `row.observedBefore`, so the
   * reminder decision and the fingerprint's TOCTOU anchor are the same moment.
   * `rankTaskCandidates` reports the *earliest* observation across the set for a
   * stated reason — of two disagreeing instants the earlier is the weaker claim,
   * and a gate should rest on the weaker one — and a review pointed out that
   * reading the selected row's own value here silently opted out of that.
   */
  observedBefore: string;
  copy: ReturnType<typeof getTaskCommandCopy>;
  locale: Locale;
  timeZone: string;
}): readonly TaskCommandLinkedEffect[] {
  const { action, patch, row, copy } = input;
  const policy = actionPolicy(action);
  const effects: TaskCommandLinkedEffect[] = [];

  if (policy.destructive) {
    effects.push({ kind: "leaves_active_lists", text: copy.effects.leaves_active_lists });
  }
  if (!policy.changedFields.includes("reminders")) return effects;

  const hasScheduled = row.scheduledReminderCount > 0;
  const entersTerminal = patch.status === "completed" || patch.status === "cancelled";
  const dueAfter = patch.dueAt !== undefined ? patch.dueAt : input.pre.dueAt;
  const dueMs = instantMs(dueAfter);

  // "where a future due date remains" (§11.3), which means the due date is in
  // the future — nothing more.
  //
  // An earlier version required a full hour of lead, on the mistaken reading
  // that `greatest(now(), due_at - interval '1 hour')` implies one. It does
  // not: the `greatest` exists precisely so a due date less than an hour out
  // still gets a reminder, at `now()`. A review proved the consequence —
  // "move it to 5pm" typed at 4:30pm disclosed "no reminders are affected"
  // while the mechanism would have created one. `create_due_task_reminder`
  // itself has no future condition at all; the future test here is §11.3's,
  // and it is what stops a preview promising a reminder for a date already
  // past.
  const nowMs = instantMs(input.observedBefore);
  const dueIsFuture = dueMs !== null && nowMs !== null && dueMs > nowMs;

  if (entersTerminal) {
    effects.push(
      hasScheduled
        ? { kind: "reminders_cancelled", text: copy.effects.reminders_cancelled }
        : { kind: "reminders_none", text: copy.effects.reminders_none },
    );
    return effects;
  }

  // Leaving a terminal status, or moving a due date. §11.3's mechanism is the
  // same for both and is not optional — "closing a row and inserting a new one,
  // never by updating in place" — because a reminder id that has already
  // notified can never notify again.
  //
  // So an existing scheduled reminder is *closed*, including under
  // `reopen_task` and `restore_task`. §11.3 describes those two as "re-creating
  // the reminder the INSERT-only trigger cannot", which presumes there is none
  // to close; that presumption is false for rows written before Phase 2E, since
  // nothing in this repository has ever cancelled a reminder on completion or
  // cancellation. Disclosing "one already exists" and "a new one will be
  // created" together — as an earlier version did — commits the phase to
  // leaving two live reminders, which is the outcome the close-and-insert
  // mechanism exists to prevent.
  if (hasScheduled) {
    effects.push({ kind: "reminders_cancelled", text: copy.effects.reminders_cancelled });
  }
  if (dueIsFuture) {
    effects.push({ kind: "reminder_created", text: copy.effects.reminder_created });
  }
  if (!hasScheduled && !dueIsFuture) {
    effects.push({ kind: "reminders_none", text: copy.effects.reminders_none });
  }
  return effects;
}

function shell(
  input: TaskCommandPreviewInput,
  copy: ReturnType<typeof getTaskCommandCopy>,
  disposition: TaskCommandPreviewDisposition,
  refusal: TaskCommandPreviewRefusal | null,
): TaskCommandPreview {
  const { command, result, selectedTaskId } = input;
  const policy = actionPolicy(command.action);
  return {
    willMutate: false,
    disposition,
    refusal,
    action: command.action,
    // Deliberately no title and no status.
    //
    // A shell is reached before ownership has been established — the stale path
    // fires when the selected id is absent from `rows`, which is exactly when
    // the cross-owner `throw` cannot run. Reading the candidate's `preState`
    // here was the one path in the module that returned task content the owner
    // check had not cleared, and a review demonstrated a hand-assembled result
    // leaking another owner's title through it. Not reachable through
    // `loadTaskCandidates`, which raises on a foreign row — but the module had
    // already decided cross-owner is a throw, and this bypassed that decision.
    //
    // Nothing is lost: a stale or refused preview sends the caller back for a
    // fresh match, and its copy is the declared localized text, not the title.
    task: { taskId: selectedTaskId, title: null, status: null },
    deltas: [],
    effects: [],
    canonicalPatch: {},
    reversible: false,
    undoWindowHours: TASK_COMMAND_UNDO_WINDOW_HOURS,
    destructive: policy.destructive,
    requiresConfirmation: policy.requiresConfirmation,
    oneStep: false,
    observedBefore: result.observedBefore,
    policyVersion: command.policyVersion,
    matchPolicyVersion: result.matchPolicyVersion,
    copy: {
      title: refusal === null ? copy.dispositions[disposition].title : copy.refusals[refusal].title,
      description:
        refusal === null
          ? copy.dispositions[disposition].description
          : copy.refusals[refusal].description,
      notice: copy.preview.readOnlyNotice,
      reversibility: copy.preview.notReversible,
      undoWindow: null,
      gravity: null,
    },
  };
}

/**
 * A stale preview carries no deltas and no patch.
 *
 * Deliberate: 2E-PREVIEW-006 says a stale preview is *reported* as stale rather
 * than silently recomputed, and rendering the effects of a pre-state known to
 * be wrong is a quieter form of the same mistake. The caller re-runs the match.
 *
 * There is no `reason` parameter. One was written and removed: nothing logs it,
 * and `ENGINEERING_STANDARDS` allows an extension point only for a real current
 * consumer. The three call sites say why in a comment instead, which costs a
 * reader nothing and cannot go stale in a signature.
 */
function staleShell(
  input: TaskCommandPreviewInput,
  copy: ReturnType<typeof getTaskCommandCopy>,
): TaskCommandPreview {
  return shell(input, copy, "rejected_stale", null);
}

function refusedShell(
  input: TaskCommandPreviewInput,
  copy: ReturnType<typeof getTaskCommandCopy>,
  refusal: TaskCommandPreviewRefusal,
): TaskCommandPreview {
  return shell(input, copy, "refused", refusal);
}

/**
 * The outcome this preview reports to the command lifecycle (2E-UX-001).
 *
 * `previewed` is a lifecycle state rather than an outcome (PRD §11.1), so a
 * ready preview has no outcome yet and this returns null. Everything else maps
 * onto a declared member of the twelve.
 */
export function previewOutcome(preview: TaskCommandPreview): TaskCommandOutcome | null {
  return preview.disposition === "previewed" ? null : preview.disposition;
}
