import { describe, expect, it } from "vitest";

import { TASK_COMMAND_LINKED_EFFECTS, getTaskCommandCopy } from "./copy";
import { TASK_MATCH_LIMITS } from "./match-policy";
import {
  describeUnreachableCandidates,
  rankTaskCandidates,
  type TaskCandidateRow,
  type TaskMatchResult,
} from "./matching";
import {
  TASK_COMMAND_OUTCOMES,
  TASK_COMMAND_PREVIEW_DISPOSITIONS,
  type TaskCommandPreviewDisposition,
} from "./outcomes";
import {
  TaskPreviewInputError,
  buildTaskCommandPreview,
  previewOutcome,
  type TaskCommandPreview,
} from "./preview";
import { validateTaskCommand, type ValidatedTaskCommand } from "./schema";
import {
  TASK_COMMAND_ACTIONS,
  TASK_COMMAND_UNDO_WINDOW_HOURS,
  actionPolicy,
  type TaskCommandAction,
  type TaskCommandPatchField,
} from "./taxonomy";
import { locales, type Locale } from "@/lib/preferences";

/**
 * PRD §13.4 (2E-PREVIEW-001..007), §11.2, §11.3, plus 2E-DISAMBIG-003/005 and
 * 2E-I18N-002.
 *
 * Every fixture is driven through the real `validateTaskCommand` and the real
 * `rankTaskCandidates`, rather than through hand-written `ValidatedTaskCommand`
 * and `TaskMatchResult` literals. That is the convention `matching.test.ts`
 * established, and it earns two things here specifically:
 *
 *   1. a command shape the schema can no longer produce fails at the fixture
 *      rather than leaving the preview asserted against something unreachable;
 *   2. `result.candidates[n].preState` is derived from the same row the preview
 *      also receives, so no test can accidentally prove a before/after pair out
 *      of two states that never coexisted.
 *
 * The two places that *do* reach past the ranker — a candidate that went
 * ineligible after listing, and a row belonging to another owner — are exactly
 * the races the ranker filters away, so they are simulated by transforming a
 * real result, and each says so at its call site.
 */

const NOW = "2026-07-25T12:00:00.000Z";
/** Deliberately not `NOW`: `observedBefore` must be echoed, never recomputed. */
const OBSERVED = "2026-07-25T11:59:00.000Z";
const TIME_ZONE = "America/Sao_Paulo";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER_OWNER = "22222222-2222-4222-8222-222222222222";
const TASK_ID = "33333333-3333-4333-8333-333333333333";
const ABSENT_TASK_ID = "44444444-4444-4444-8444-444444444444";
const PROJECT_ID = "55555555-5555-4555-8555-555555555555";
const OTHER_PROJECT_ID = "5a5a5a5a-5555-4555-8555-555555555555";
const CONTEXT_ID = "66666666-6666-4666-8666-666666666666";
const OTHER_CONTEXT_ID = "6a6a6a6a-6666-4666-8666-666666666666";
const PERSON_ID = "77777777-7777-4777-8777-777777777777";
const OTHER_PERSON_ID = "7a7a7a7a-7777-4777-8777-777777777777";

const TITLE = "Send the report";
const TERMINAL_AT = "2026-07-20T10:00:00.000Z";
const EXISTING_DUE = "2026-08-01T15:30:00.000Z";

/**
 * The resolved entity's *stored* name, deliberately different from the reference
 * text the command carries.
 *
 * `PATCH_VALUES.projectRef` is "Acme"; SQL resolves that through
 * `normalize_entity_alias` — which folds case, accents and punctuation — and
 * projects whatever the row actually holds. So a preview rendering the user's
 * typing back instead of the stored name would confirm something the database
 * does not say, and identical strings would hide it.
 */
const PROJECT_REF_NAME = "ACME Corp.";
const CONTEXT_REF_NAME = "Deep Work Block";
const PERSON_REF_NAME = "Ana Ribeiro";

/**
 * One value per patch field, so a command fixture is assembled from the
 * taxonomy's `requiredPatchFields` rather than from a per-action literal. An
 * action that gains a required field fails loudly here instead of silently
 * previewing without it.
 */
const PATCH_VALUES: Record<TaskCommandPatchField, string> = {
  title: "Renamed report",
  note: "Checked with Ana.",
  status: "in_progress",
  priority: "high",
  dueAt: "tomorrow",
  plannedAt: "tomorrow",
  projectRef: "Acme",
  contextRef: "Deep Work",
  personRef: "Ana",
};

function patchFor(
  action: TaskCommandAction,
  overrides: Record<string, string> = {},
): Record<string, string> {
  const patch: Record<string, string> = {};
  for (const field of actionPolicy(action).requiredPatchFields) patch[field] = PATCH_VALUES[field];
  return { ...patch, ...overrides };
}

function commandFor(
  action: TaskCommandAction,
  patchOverrides: Record<string, string> = {},
): ValidatedTaskCommand {
  const result = validateTaskCommand(
    {
      action,
      targetHints: { titleWords: ["report"] },
      patch: patchFor(action, patchOverrides),
      operationKey: "aaaaaaaa-1111-4111-8111-111111111111",
    },
    { now: NOW, timeZone: TIME_ZONE },
  );
  if (result.status !== "ok") {
    throw new Error(`fixture command is not valid: ${JSON.stringify(result)}`);
  }
  return result.command;
}

/**
 * The instant the lexicon resolves `reschedule_due`'s fixture phrase to.
 *
 * Read off a real command rather than written out, so the equivalent-instant
 * case below stays an equivalence rather than a hard-coded pair that stops being
 * one the day the lexicon's day boundary moves.
 */
const RESCHEDULE_TARGET = (() => {
  const value = commandFor("reschedule_due").patch.dueAt;
  if (typeof value !== "string") {
    throw new Error("the reschedule_due fixture no longer resolves a due instant");
  }
  return value;
})();

/** The same moment as `RESCHEDULE_TARGET`, written with a different designator. */
const EQUIVALENT_TO_RESCHEDULE_TARGET = new Date(RESCHEDULE_TARGET).toISOString();

/**
 * Observation instants placed relative to the due date the fixture reschedules
 * to, for the reminder-window cases below.
 *
 * The window is expressed by moving the *observation* rather than the due date,
 * and that is forced rather than chosen: `resolveTemporalPhrase` refuses a
 * complete ISO instant outright (2E-COMMAND-016 — the instant is never
 * model-supplied), and the lexicon resolves a phrase to a calendar day at a
 * declared hour. So a fixture cannot name a due date thirty minutes out. It can
 * name the instant the preview treats as now, which is the row's own
 * `observedBefore`, and the only thing `buildLinkedEffects` asks is the sign of
 * the difference between the two.
 */
function shiftedFromTarget(deltaMs: number): string {
  return new Date(Date.parse(RESCHEDULE_TARGET) + deltaMs).toISOString();
}

/** Half an hour before the new due date: inside the hour, and still future. */
const OBSERVED_HALF_HOUR_BEFORE_TARGET = shiftedFromTarget(-30 * 60_000);
/** Exactly an hour before it, which is the boundary the old rule sat on. */
const OBSERVED_HOUR_BEFORE_TARGET = shiftedFromTarget(-60 * 60_000);
/** One second after it, so the new due date is already past by the barest margin. */
const OBSERVED_JUST_AFTER_TARGET = shiftedFromTarget(1_000);

/**
 * A row shaped like an exact-title hit, which is what makes a single row rank
 * as `matched` and therefore give the preview a candidate to work from.
 *
 * `completedAt`/`cancelledAt` follow the status by default, mirroring the
 * invariant §11.2 states: they are set when and only when the task is in that
 * status.
 */
function taskRow(overrides: Partial<TaskCandidateRow> = {}): TaskCandidateRow {
  const status = overrides.status ?? "todo";
  const base: TaskCandidateRow = {
    taskId: TASK_ID,
    ownerId: OWNER,
    title: TITLE,
    description: null,
    status,
    dueAt: null,
    plannedAt: null,
    manualPriority: null,
    completedAt: status === "completed" ? TERMINAL_AT : null,
    cancelledAt: status === "cancelled" ? TERMINAL_AT : null,
    intentionalNoDue: false,
    noDueReason: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-20T09:00:00.000Z",
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
  };
  return { ...base, ...overrides };
}

/** The first status the taxonomy declares eligible, so every action has a task. */
function eligibleStatus(action: TaskCommandAction): string {
  return actionPolicy(action).eligibleFrom[0];
}

/**
 * The resolved reference the action's own relation needs, keyed off
 * `changedFields` rather than off the action's name — the same derivation
 * `preview.ts` uses, so a new relation action is covered the day it is declared.
 *
 * The stored *name* travels with the id, because SQL never returns one without
 * the other: `project_ref_name` is a scalar subquery keyed on `project_ref_id`,
 * so it is null exactly when the id is. A fixture supplying only the id would let
 * a preview be asserted against a row no execution of the RPC can emit — and,
 * worse, would exercise `relationAfter`'s "the id resolved but its name did not"
 * fallback instead of the path the product actually takes.
 */
function relationDefaults(action: TaskCommandAction): Partial<TaskCandidateRow> {
  const changed = actionPolicy(action).changedFields;
  if (changed.includes("task_projects")) {
    return { projectRefId: PROJECT_ID, projectRefName: PROJECT_REF_NAME };
  }
  if (changed.includes("task_contexts")) {
    return { contextRefId: CONTEXT_ID, contextRefName: CONTEXT_REF_NAME };
  }
  if (changed.includes("task_people:involved") || changed.includes("task_people:waiting_on")) {
    return { personRefId: PERSON_ID, personRefName: PERSON_REF_NAME };
  }
  return {};
}

/**
 * A row on which every reference resolved to nothing.
 *
 * Both halves of each pair are nulled, because SQL never returns one without the
 * other and `relationDefaults` above supplies both. Nulling only the id would
 * leave a name behind and trip the fixture guard below — which is the point of
 * having the guard.
 */
const UNRESOLVED_REFERENCES: Partial<TaskCandidateRow> = {
  projectRefId: null,
  contextRefId: null,
  personRefId: null,
  projectRefName: null,
  contextRefName: null,
  personRefName: null,
};

/**
 * Why these rows could not have come from the RPC, or null when they could have.
 *
 * `describeUnreachableCandidates` covers the derived counts and the query-scalar
 * agreement rules; this covers the one pairing it deliberately does not, because
 * it is a *within-row* invariant rather than a set-level one: a stored name
 * exists exactly when its id does. A fixture carrying a name without an id would
 * assert a rendering against a row SQL cannot produce, and one carrying an id
 * without its name would silently test the fallback path instead of the real one.
 */
function describeInconsistentReferences(rows: readonly TaskCandidateRow[]): string | null {
  const pairs: ReadonlyArray<readonly [string, string | null, string | null]> = rows.flatMap(
    (row) => [
      ["project", row.projectRefId, row.projectRefName] as const,
      ["context", row.contextRefId, row.contextRefName] as const,
      ["person", row.personRefId, row.personRefName] as const,
    ],
  );
  for (const [label, id, name] of pairs) {
    if ((id === null) !== (name === null)) {
      return `the ${label} reference carries ${id === null ? "a name with no id" : "an id with no name"}`;
    }
  }
  return null;
}

/**
 * A pre-state the action provably moves, so the generic sweep below never lands
 * on `no_change` and mistakes an unrendered delta for an unchanged one.
 */
function changeMakingRow(action: TaskCommandAction): Partial<TaskCandidateRow> {
  return actionPolicy(action).changedFields.includes("due_at") ? { dueAt: EXISTING_DUE } : {};
}

type PreviewCase = {
  readonly action: TaskCommandAction;
  readonly patch?: Record<string, string>;
  readonly row?: Partial<TaskCandidateRow>;
  readonly locale?: Locale;
  readonly timeZone?: string;
  readonly expected?: { readonly taskId: string; readonly updatedAt: string } | null;
  readonly selectedTaskId?: string;
  /** Rewrites the rows the preview sees, leaving the match they came from intact. */
  readonly rowsForPreview?: (rows: readonly TaskCandidateRow[]) => readonly TaskCandidateRow[];
  readonly resultForPreview?: (result: TaskMatchResult) => TaskMatchResult;
};

type Scenario = {
  readonly command: ValidatedTaskCommand;
  readonly rows: readonly TaskCandidateRow[];
  readonly result: TaskMatchResult;
  readonly preview: TaskCommandPreview;
};

function scenario(input: PreviewCase): Scenario {
  const command = commandFor(input.action, input.patch);
  const rows: readonly TaskCandidateRow[] = [
    taskRow({
      status: eligibleStatus(input.action),
      ...relationDefaults(input.action),
      ...changeMakingRow(input.action),
      ...input.row,
    }),
  ];
  // The same fixture guard `matching.test.ts` applies: a row SQL has no
  // execution that produces would let a preview be asserted against an input
  // that cannot occur.
  const unreachable = describeUnreachableCandidates(rows);
  if (unreachable !== null) {
    throw new Error(`fixture rows are not reachable from SQL: ${unreachable}`);
  }
  const inconsistent = describeInconsistentReferences(rows);
  if (inconsistent !== null) {
    throw new Error(`fixture rows are not reachable from SQL: ${inconsistent}`);
  }

  const ranked = rankTaskCandidates({ command, rows, ownerId: OWNER, now: NOW, timeZone: TIME_ZONE });
  const result = input.resultForPreview ? input.resultForPreview(ranked) : ranked;
  const previewRows = input.rowsForPreview ? input.rowsForPreview(rows) : rows;

  return {
    command,
    rows,
    result,
    preview: buildTaskCommandPreview({
      command,
      result,
      rows: previewRows,
      selectedTaskId: input.selectedTaskId ?? TASK_ID,
      expected: input.expected ?? null,
      locale: input.locale ?? "pt-BR",
      timeZone: input.timeZone ?? TIME_ZONE,
    }),
  };
}

function build(input: PreviewCase): TaskCommandPreview {
  return scenario(input).preview;
}

function deltaFor(preview: TaskCommandPreview, field: string) {
  const delta = preview.deltas.find((entry) => entry.field === field);
  if (delta === undefined) throw new Error(`the preview carries no ${field} delta`);
  return delta;
}

function effectKinds(preview: TaskCommandPreview): readonly string[] {
  return preview.effects.map((effect) => effect.kind);
}

/**
 * One reachable fixture per declared disposition.
 *
 * Keyed by a `Record` over the union, so a disposition added to
 * `TASK_COMMAND_PREVIEW_DISPOSITIONS` without a way to reach it is a compile
 * error rather than an untested member.
 */
const SHAPES: Record<TaskCommandPreviewDisposition, () => TaskCommandPreview> = {
  previewed: () => build({ action: "complete_task" }),
  matched_requires_confirmation: () => build({ action: "cancel_task" }),
  no_change: () => build({ action: "rename_task", patch: { title: TITLE } }),
  rejected_stale: () =>
    build({
      action: "complete_task",
      expected: { taskId: TASK_ID, updatedAt: "2026-07-24T00:00:00.000Z" },
    }),
  refused: () => build({ action: "assign_project", row: UNRESOLVED_REFERENCES }),
};

describe("2E-PREVIEW-001 — a preview is read-only", () => {
  it.each(TASK_COMMAND_PREVIEW_DISPOSITIONS)(
    "%s exposes willMutate: false",
    (disposition) => {
      const preview = SHAPES[disposition]();

      // Reaching the disposition is half the assertion: a shape nothing can
      // produce would make `willMutate` true of nothing at all.
      expect(preview.disposition).toBe(disposition);
      expect(preview.willMutate).toBe(false);
    },
  );

  it.each(TASK_COMMAND_PREVIEW_DISPOSITIONS)(
    "%s is deterministic — the same input twice is deeply equal",
    (disposition) => {
      const first = SHAPES[disposition]();
      const second = SHAPES[disposition]();

      expect(first).toEqual(second);
      expect(first).not.toBe(second);
    },
  );

  it("never advertises a single Apply control for a disposition that is not ready", () => {
    for (const disposition of TASK_COMMAND_PREVIEW_DISPOSITIONS) {
      const preview = SHAPES[disposition]();
      if (disposition === "previewed") continue;
      expect(preview.oneStep).toBe(false);
    }
  });

  it("keeps oneStep for a ready preview of a one-step-eligible action", () => {
    // The other half of the rule above: `oneStep` is withdrawn by this module,
    // never granted by it, so it has to survive when the match said so.
    const { result, preview } = scenario({ action: "complete_task" });

    expect(result.oneStep).toBe(true);
    expect(preview.disposition).toBe("previewed");
    expect(preview.oneStep).toBe(true);
  });
});

describe.each(TASK_COMMAND_ACTIONS)("2E-PREVIEW-002 — %s before/after completeness", (action) => {
  const policy = actionPolicy(action);
  // Driven from the taxonomy, never from a hand-written list: that is the whole
  // point of the requirement. `reminders` is the one changed field that is a
  // linked effect rather than a column, disclosed by `effects` instead.
  const expectedFields = policy.changedFields.filter((field) => field !== "reminders");

  it("renders one delta for every field it changes, and no other", () => {
    const preview = build({ action });

    expect(preview.deltas.map((delta) => delta.field)).toEqual([...expectedFields]);
    expect(preview.deltas.map((delta) => delta.field)).not.toContain("reminders");
  });

  it("actually proposes a change, so no field is reported unchanged by accident", () => {
    const preview = build({ action });

    expect(["previewed", "matched_requires_confirmation"]).toContain(preview.disposition);
    expect(preview.deltas.some((delta) => delta.changed)).toBe(true);
  });

  it("states reversibility, the undo window and whether confirmation is required", () => {
    const preview = build({ action });

    expect(preview.reversible).toBe(policy.reversible);
    expect(preview.undoWindowHours).toBe(TASK_COMMAND_UNDO_WINDOW_HOURS);
    expect(preview.requiresConfirmation).toBe(policy.requiresConfirmation);
    expect(preview.destructive).toBe(policy.destructive);
    expect(preview.copy.undoWindow).not.toBeNull();
  });

  it("carries the selected task and no other", () => {
    const preview = build({ action });

    expect(preview.task.taskId).toBe(TASK_ID);
    expect(preview.task.title).toBe(TITLE);
    expect(preview.task.status).toBe(eligibleStatus(action));
    expect(preview.action).toBe(action);
  });
});

describe.each(locales)("2E-PREVIEW-002 — every delta is labelled in %s", (locale) => {
  const copy = getTaskCommandCopy(locale);

  it.each(TASK_COMMAND_ACTIONS)("%s", (action) => {
    const preview = build({ action, locale });

    expect(preview.deltas.length).toBeGreaterThan(0);
    for (const delta of preview.deltas) {
      expect(delta.label).toBe(copy.fields[delta.field]);
      expect(delta.label.trim()).not.toBe("");
      expect(delta.before.text.trim()).not.toBe("");
      expect(delta.after.text.trim()).not.toBe("");
    }
  });
});

describe("2E-PREVIEW-002 — the destination status", () => {
  it.each([
    ["complete_task", "completed"],
    ["reopen_task", "todo"],
    ["cancel_task", "cancelled"],
    ["restore_task", "todo"],
  ] as const)("%s renders the status the taxonomy decides (%s)", (action, expected) => {
    // Asserted against the policy as well as against the literal: the literal
    // proves §11.2's arrow, the policy proves the preview reads it rather than
    // carrying a fourth copy of the same conditional.
    const preview = build({ action });
    const status = deltaFor(preview, "status");

    expect(actionPolicy(action).targetStatus).toBe(expected);
    expect(status.after.text).toBe(expected);
    expect(status.after.text).toBe(actionPolicy(action).targetStatus);
    expect(status.before.text).toBe(eligibleStatus(action));
    expect(status.changed).toBe(true);
    expect(preview.canonicalPatch.status).toBe(expected);
  });

  it("set_status takes the destination from the patch, not from the taxonomy", () => {
    const preview = build({ action: "set_status", patch: { status: "blocked" } });
    const status = deltaFor(preview, "status");

    expect(actionPolicy("set_status").targetStatus).toBeNull();
    expect(status.before.text).toBe("inbox");
    expect(status.after.text).toBe("blocked");
    expect(preview.canonicalPatch.status).toBe("blocked");
  });
});

describe("2E-PREVIEW-002 — completed_at and cancelled_at", () => {
  it("renders completed_at as chosen at apply time when entering completed", () => {
    // The preview cannot know the write instant, and rendering a plausible one
    // would be its first lie.
    const preview = build({ action: "complete_task" });
    const delta = deltaFor(preview, "completed_at");

    expect(delta.after.kind).toBe("atApply");
    expect(delta.after.instant).toBeUndefined();
    expect(delta.before.kind).toBe("empty");
    expect(delta.changed).toBe(true);
  });

  it("renders cancelled_at as chosen at apply time when entering cancelled", () => {
    const preview = build({ action: "cancel_task" });
    const delta = deltaFor(preview, "cancelled_at");

    expect(delta.after.kind).toBe("atApply");
    expect(delta.before.kind).toBe("empty");
    expect(delta.changed).toBe(true);
  });

  it("clears completed_at when leaving completed", () => {
    const preview = build({ action: "reopen_task" });
    const delta = deltaFor(preview, "completed_at");

    expect(delta.before.kind).toBe("instant");
    expect(delta.before.instant).toBe(TERMINAL_AT);
    expect(delta.after.kind).toBe("empty");
    expect(delta.changed).toBe(true);
  });

  it("clears cancelled_at when leaving cancelled", () => {
    const preview = build({ action: "restore_task" });
    const delta = deltaFor(preview, "cancelled_at");

    expect(delta.before.kind).toBe("instant");
    expect(delta.before.instant).toBe(TERMINAL_AT);
    expect(delta.after.kind).toBe("empty");
    expect(delta.changed).toBe(true);
  });

  it.each([
    ["complete_task", "completed_at", { completedAt: TERMINAL_AT }],
    ["cancel_task", "cancelled_at", { cancelledAt: TERMINAL_AT }],
  ] as const)(
    "%s reports %s as changed even when a stale instant is already there",
    (action, field, row) => {
      // Entering the terminal status is *always* a change, whatever the column
      // held. An earlier version asked whether the value was null, which reported
      // `changed: false` for a non-terminal task carrying a stale instant — a
      // state that is reachable today, because PRD §3.2 records no CHECK relating
      // `status` to these columns and the live write path is a plain client
      // UPDATE. The row then rendered an instant on the left, "when you apply" on
      // the right, and `changed: false` between them, contradicting itself.
      const preview = build({ action, row });
      const delta = deltaFor(preview, field);

      expect(delta.before.kind).toBe("instant");
      expect(delta.before.instant).toBe(TERMINAL_AT);
      expect(delta.after.kind).toBe("atApply");
      expect(delta.changed).toBe(true);
    },
  );

  it.each([
    ["reopen_task", "completed_at", { completedAt: null }],
    ["restore_task", "cancelled_at", { cancelledAt: null }],
  ] as const)(
    "%s reports %s as unchanged when there was nothing there to clear",
    (action, field, row) => {
      // The control for the pair above: `entering || pre.<col> !== null` is a
      // disjunction rather than a constant, and this is the one combination that
      // makes it false. Also reachable, and for the same reason — the eligible
      // status is the terminal one while the column is empty.
      const preview = build({ action, row });
      const delta = deltaFor(preview, field);

      expect(delta.before.kind).toBe("empty");
      expect(delta.after.kind).toBe("empty");
      expect(delta.changed).toBe(false);
    },
  );
});

describe("2E-PREVIEW-005 — a relation-aware no_change", () => {
  it("reports setting the status the task already holds as no_change", () => {
    const preview = build({ action: "set_status", patch: { status: "inbox" }, row: { status: "inbox" } });

    expect(preview.disposition).toBe("no_change");
    expect(deltaFor(preview, "status").changed).toBe(false);
  });

  it("reports renaming to the current title as no_change", () => {
    const preview = build({ action: "rename_task", patch: { title: TITLE }, row: { title: TITLE } });

    expect(preview.disposition).toBe("no_change");
    expect(deltaFor(preview, "title").changed).toBe(false);
  });

  it("reports rescheduling to the same instant written differently as no_change", () => {
    // The headline case. A string comparison would call this a change and
    // produce an audit row, an undo row and a reminder churn for a user-visible
    // no-op — which is precisely what 2E-PREVIEW-005 forbids.
    expect(EQUIVALENT_TO_RESCHEDULE_TARGET).not.toBe(RESCHEDULE_TARGET);
    expect(Date.parse(EQUIVALENT_TO_RESCHEDULE_TARGET)).toBe(Date.parse(RESCHEDULE_TARGET));

    const preview = build({
      action: "reschedule_due",
      row: { dueAt: EQUIVALENT_TO_RESCHEDULE_TARGET },
    });

    expect(preview.disposition).toBe("no_change");
    expect(deltaFor(preview, "due_at").changed).toBe(false);
  });

  it("still reports a genuinely different instant as a change", () => {
    // The control for the case above: the equality is on the instant, not a
    // blanket "due dates never differ".
    const preview = build({ action: "reschedule_due", row: { dueAt: EXISTING_DUE } });

    expect(preview.disposition).toBe("previewed");
    expect(deltaFor(preview, "due_at").changed).toBe(true);
  });

  it("reports clearing a due date that is already absent as no_change", () => {
    const preview = build({ action: "clear_due", row: { dueAt: null } });

    expect(preview.disposition).toBe("no_change");
    expect(deltaFor(preview, "due_at").changed).toBe(false);
  });

  it("reports setting the priority the task already carries as no_change", () => {
    const preview = build({ action: "set_priority", row: { manualPriority: "high" } });

    expect(preview.disposition).toBe("no_change");
    expect(deltaFor(preview, "manual_priority").changed).toBe(false);
  });

  it("reports assigning a project the task already holds as no_change", () => {
    const preview = build({
      action: "assign_project",
      row: {
        projectIds: [PROJECT_ID],
        projectNames: [PROJECT_REF_NAME],
        projectRefId: PROJECT_ID,
      },
    });
    const delta = deltaFor(preview, "task_projects");

    expect(preview.disposition).toBe("no_change");
    expect(delta.changed).toBe(false);
    // `after` *is* `before`, with no duplication. An earlier version appended the
    // resolved name unconditionally and rendered "Acme, Acme" beside copy saying
    // nothing would change — a preview contradicting its own verdict from the
    // same facts.
    expect(delta.after.text).toBe(delta.before.text);
    expect(delta.after.text).toBe(PROJECT_REF_NAME);
    expect(delta.after).toEqual(delta.before);
  });

  it("reports assigning a project the task does not hold as a real change", () => {
    const preview = build({
      action: "assign_project",
      row: {
        projectIds: [OTHER_PROJECT_ID],
        projectNames: ["Other"],
        projectRefId: PROJECT_ID,
      },
    });

    expect(preview.disposition).toBe("previewed");
    expect(deltaFor(preview, "task_projects").changed).toBe(true);
    expect(preview.canonicalPatch.projectId).toBe(PROJECT_ID);
  });

  it("reports assigning a context the task already holds as no_change", () => {
    const preview = build({
      action: "assign_context",
      row: {
        contextIds: [CONTEXT_ID],
        contextNames: ["Deep Work"],
        contextRefId: CONTEXT_ID,
      },
    });

    expect(preview.disposition).toBe("no_change");
    expect(deltaFor(preview, "task_contexts").changed).toBe(false);
  });

  it("reports assigning a context the task does not hold as a real change", () => {
    const preview = build({
      action: "assign_context",
      row: {
        contextIds: [OTHER_CONTEXT_ID],
        contextNames: ["Errands"],
        contextRefId: CONTEXT_ID,
      },
    });

    expect(preview.disposition).toBe("previewed");
    expect(deltaFor(preview, "task_contexts").changed).toBe(true);
    expect(preview.canonicalPatch.contextId).toBe(CONTEXT_ID);
  });

  it("compares a relation by id, never by the name the user typed", () => {
    // The task holds a project *named* the same thing the command names, but it
    // is a different row. Re-deriving the answer from the two names — the
    // divergence 2E-MATCH-008 characterizes — would report no_change and
    // silently drop the assignment the user asked for.
    const preview = build({
      action: "assign_project",
      row: {
        projectIds: [OTHER_PROJECT_ID],
        projectNames: ["Acme"],
        projectRefId: PROJECT_ID,
      },
    });

    expect(preview.disposition).toBe("previewed");
    expect(deltaFor(preview, "task_projects").changed).toBe(true);
  });
});

describe("2E-PREVIEW-002 — the proposed relation is named, not counted", () => {
  /**
   * The regression this block exists for.
   *
   * `relationAfter` used to look the resolved id up in the row's own relation
   * arrays — the relations the task *already holds* — so the name resolved only
   * in the `no_change` case, which is the one case where it is not needed. The
   * real addition rendered a bare "+1", and 2E-PREVIEW-002 asks for the proposed
   * *value*. Nothing in this file caught it: the two assertions below did not
   * exist, and the localization sweep only requires `after.text` to be non-empty.
   */
  it("names the project it would add to a task that holds none", () => {
    const preview = build({
      action: "assign_project",
      row: { projectIds: [], projectNames: [] },
    });
    const delta = deltaFor(preview, "task_projects");

    expect(delta.before.kind).toBe("empty");
    expect(delta.after.text).toBe(PROJECT_REF_NAME);
    expect(delta.after.kind).toBe("text");
    expect(delta.changed).toBe(true);
  });

  it("appends the project it would add to the one the task already holds", () => {
    const preview = build({
      action: "assign_project",
      row: { projectIds: [OTHER_PROJECT_ID], projectNames: ["Orcamento Anual"] },
    });
    const delta = deltaFor(preview, "task_projects");

    expect(delta.before.text).toBe("Orcamento Anual");
    expect(delta.after.text).toBe(`Orcamento Anual, ${PROJECT_REF_NAME}`);
    expect(delta.changed).toBe(true);
  });

  it("renders the STORED name rather than the words the command carried", () => {
    // The reference the command holds is "Acme"; the row's stored name is
    // "ACME Corp.", because `normalize_entity_alias` folded the difference away
    // in SQL. Echoing the typing back would confirm something the user's data
    // does not say — and the two strings differing is what makes that testable.
    const { command, preview } = scenario({
      action: "assign_project",
      row: { projectIds: [], projectNames: [] },
    });
    const delta = deltaFor(preview, "task_projects");

    expect(command.patch.projectRef).toBe("Acme");
    expect(delta.after.text).toBe(PROJECT_REF_NAME);
    expect(delta.after.text).not.toBe(command.patch.projectRef);
  });

  it("names the context it would add", () => {
    const preview = build({
      action: "assign_context",
      row: { contextIds: [], contextNames: [] },
    });

    expect(deltaFor(preview, "task_contexts").after.text).toBe(CONTEXT_REF_NAME);
  });

  it.each([
    ["assign_person", "task_people:involved"],
    ["set_waiting_on", "task_people:waiting_on"],
  ] as const)("names the person %s would add", (action, field) => {
    const preview = build({ action, row: { personIds: [], personNames: [], personRoles: [] } });

    expect(deltaFor(preview, field).after.text).toBe(PERSON_REF_NAME);
  });

  it("appends under the role it writes, not beside a person holding another role", () => {
    // `relationBefore` filters by role, so `set_waiting_on` on a task whose only
    // person is `involved` starts from empty — and the proposed value is the name
    // alone rather than a list including someone the field does not describe.
    const preview = build({
      action: "set_waiting_on",
      row: {
        personIds: [OTHER_PERSON_ID],
        personNames: ["Bruno Silva"],
        personRoles: ["involved"],
      },
    });
    const delta = deltaFor(preview, "task_people:waiting_on");

    expect(delta.before.kind).toBe("empty");
    expect(delta.after.text).toBe(PERSON_REF_NAME);
  });
});

describe("2E-PREVIEW-005 — task_people is keyed on (task, person, role)", () => {
  /** One person, already linked to the task in the `involved` role only. */
  const alreadyInvolved: Partial<TaskCandidateRow> = {
    personIds: [PERSON_ID],
    personNames: ["Ana"],
    personRoles: ["involved"],
    personRefId: PERSON_ID,
  };

  it("set_waiting_on for a person already linked as involved is a REAL CHANGE", () => {
    // The highest-value pair in this file. `task_people` is keyed
    // `(task_id, person_id, role)`, so an `involved` row is not a `waiting_on`
    // row. Comparing on the person alone would report no_change and silently
    // drop the `waiting_on` link — the difference between "Ana is on this" and
    // "this is blocked on Ana".
    const preview = build({ action: "set_waiting_on", row: alreadyInvolved });

    expect(preview.disposition).toBe("previewed");
    expect(deltaFor(preview, "task_people:waiting_on").changed).toBe(true);
    expect(preview.canonicalPatch.personId).toBe(PERSON_ID);
    expect(preview.canonicalPatch.personRole).toBe("waiting_on");
  });

  it("assign_person for a person already linked as involved IS no_change", () => {
    // The other half. The same row, the same person, the same resolved id — and
    // the opposite answer, because the role the action writes is the one the
    // task already has.
    const preview = build({ action: "assign_person", row: alreadyInvolved });

    expect(preview.disposition).toBe("no_change");
    expect(deltaFor(preview, "task_people:involved").changed).toBe(false);
  });

  it("assign_person for a person linked only as waiting_on is a real change", () => {
    // The mirror image, so the rule is symmetric rather than a special case for
    // one role.
    const preview = build({
      action: "assign_person",
      row: {
        personIds: [PERSON_ID],
        personNames: ["Ana"],
        personRoles: ["waiting_on"],
        personRefId: PERSON_ID,
      },
    });

    expect(preview.disposition).toBe("previewed");
    expect(deltaFor(preview, "task_people:involved").changed).toBe(true);
    expect(preview.canonicalPatch.personRole).toBe("involved");
  });

  it("set_waiting_on for a different person is a real change even when one waits already", () => {
    const preview = build({
      action: "set_waiting_on",
      row: {
        personIds: [OTHER_PERSON_ID],
        personNames: ["Bruno"],
        personRoles: ["waiting_on"],
        personRefId: PERSON_ID,
      },
    });

    expect(preview.disposition).toBe("previewed");
    expect(deltaFor(preview, "task_people:waiting_on").changed).toBe(true);
  });

  it("set_waiting_on for the person already waiting is no_change", () => {
    const preview = build({
      action: "set_waiting_on",
      row: {
        personIds: [PERSON_ID],
        personNames: ["Ana"],
        personRoles: ["waiting_on"],
        personRefId: PERSON_ID,
      },
    });

    expect(preview.disposition).toBe("no_change");
  });
});

describe("2E-PREVIEW-005 — append_note is never a no-op", () => {
  it("proposes the concatenation and preserves the existing description", () => {
    const preview = build({
      action: "append_note",
      patch: { note: "Checked with Ana." },
      row: { description: "Original body." },
    });
    const delta = deltaFor(preview, "description");

    expect(preview.canonicalPatch.description).toBe("Original body.\n\nChecked with Ana.");
    expect(preview.canonicalPatch.description).toContain("Original body.");
    expect(delta.before.text).toBe("Original body.");
    expect(delta.after.text).toBe("Original body.\n\nChecked with Ana.");
    expect(delta.changed).toBe(true);
    expect(preview.disposition).toBe("previewed");
  });

  it("proposes the note alone when the task has no description", () => {
    const preview = build({
      action: "append_note",
      patch: { note: "Checked with Ana." },
      row: { description: null },
    });

    expect(preview.canonicalPatch.description).toBe("Checked with Ana.");
    expect(deltaFor(preview, "description").before.kind).toBe("empty");
  });

  it("treats an empty-string description as empty rather than as a body to keep", () => {
    const preview = build({
      action: "append_note",
      patch: { note: "Checked with Ana." },
      row: { description: "" },
    });

    expect(preview.canonicalPatch.description).toBe("Checked with Ana.");
  });

  it("is still a change when the note repeats the description word for word", () => {
    // The adversarial case: the schema forbids an empty note, so appending can
    // never leave the field as it was — even here, where a naive equality check
    // on the fragment would say otherwise.
    const preview = build({
      action: "append_note",
      patch: { note: "Original body." },
      row: { description: "Original body." },
    });

    expect(preview.disposition).toBe("previewed");
    expect(preview.canonicalPatch.description).toBe("Original body.\n\nOriginal body.");
  });
});

describe("2E-PREVIEW-005 — what a no_change preview promises", () => {
  const noChange = () => build({ action: "rename_task", patch: { title: TITLE }, row: { title: TITLE } });

  it("claims no reversibility, offers no Apply control and discloses no linked effect", () => {
    const preview = noChange();

    expect(preview.disposition).toBe("no_change");
    expect(preview.reversible).toBe(false);
    expect(preview.oneStep).toBe(false);
    expect(preview.effects).toEqual([]);
    expect(preview.copy.undoWindow).toBeNull();
  });

  it("still renders the deltas, so the user can see why nothing would change", () => {
    const preview = noChange();

    expect(preview.deltas).toHaveLength(1);
    expect(preview.deltas.every((delta) => delta.changed)).toBe(false);
  });

  it("discloses no reminder effect even for an action that touches reminders", () => {
    // A `no_change` clear_due must not promise to cancel a reminder: nothing is
    // being applied, so nothing is being cancelled.
    const preview = build({
      action: "clear_due",
      row: { dueAt: null, scheduledReminderCount: 2 },
    });

    expect(preview.disposition).toBe("no_change");
    expect(preview.effects).toEqual([]);
  });

  it.each(locales)("says so in %s, with the disposition's own copy", (locale) => {
    const copy = getTaskCommandCopy(locale);
    const preview = build({
      action: "rename_task",
      patch: { title: TITLE },
      row: { title: TITLE },
      locale,
    });

    expect(preview.copy.title).toBe(copy.dispositions.no_change.title);
    expect(preview.copy.description).toBe(copy.dispositions.no_change.description);
    expect(preview.copy.reversibility).toBe(copy.preview.notReversible);
  });
});

describe("2E-PREVIEW-003 — linked effects", () => {
  it("promises to cancel reminders only when the task actually has some", () => {
    const withReminders = build({ action: "complete_task", row: { scheduledReminderCount: 2 } });

    expect(effectKinds(withReminders)).toContain("reminders_cancelled");
    expect(effectKinds(withReminders)).not.toContain("reminders_none");
  });

  it("says there are none rather than promising to cancel something that does not exist", () => {
    const withoutReminders = build({ action: "complete_task", row: { scheduledReminderCount: 0 } });

    expect(effectKinds(withoutReminders)).toEqual(["reminders_none"]);
    expect(effectKinds(withoutReminders)).not.toContain("reminders_cancelled");
  });

  it("discloses that cancelling removes the task from the active lists, always", () => {
    const withReminders = build({ action: "cancel_task", row: { scheduledReminderCount: 1 } });
    const withoutReminders = build({ action: "cancel_task", row: { scheduledReminderCount: 0 } });

    expect(effectKinds(withReminders)).toEqual(["leaves_active_lists", "reminders_cancelled"]);
    expect(effectKinds(withoutReminders)).toEqual(["leaves_active_lists", "reminders_none"]);
  });

  it("does not claim a completion removes the task from the active lists", () => {
    // Only cancellation carries that disclosure in §11.2's destructive column;
    // saying it of a completion would be untrue of the Today and Work views.
    const preview = build({ action: "complete_task" });

    expect(effectKinds(preview)).not.toContain("leaves_active_lists");
  });

  it("closes the current reminder and opens a fresh one for a future reschedule", () => {
    const preview = build({
      action: "reschedule_due",
      row: { dueAt: EXISTING_DUE, scheduledReminderCount: 1 },
    });

    expect(effectKinds(preview)).toEqual(["reminders_cancelled", "reminder_created"]);
  });

  it("creates no reminder when the new due date is already in the past", () => {
    // A due date already past would produce a reminder that fires immediately,
    // which §11.3 does not ask for and a user would not expect.
    const preview = build({
      action: "reschedule_due",
      patch: { dueAt: "2026-07-01" },
      row: { dueAt: EXISTING_DUE, scheduledReminderCount: 1 },
    });

    expect(effectKinds(preview)).toEqual(["reminders_cancelled"]);
    expect(effectKinds(preview)).not.toContain("reminder_created");
  });

  it.each([
    ["half an hour out", OBSERVED_HALF_HOUR_BEFORE_TARGET],
    ["exactly an hour out", OBSERVED_HOUR_BEFORE_TARGET],
  ])("schedules a reminder for a due date %s", (_label, observedBefore) => {
    // The C2 regression. `dueIsFuture` required a full hour of lead, on the
    // mistaken reading that `greatest(now(), due_at - interval '1 hour')` implies
    // one. It does not: the `greatest` exists precisely so a due date less than an
    // hour out still gets a reminder, at `now()`. Both of these previously
    // disclosed "no reminders are affected" while the mechanism would have created
    // one — "move it to 5pm" typed at 4:30pm.
    //
    // The hour boundary is included deliberately: the old predicate was a strict
    // `>` on the shifted instant, so a due date exactly an hour out was denied
    // too, and a fixture that only tested the half hour would have left the
    // boundary itself unpinned.
    const preview = build({
      action: "reschedule_due",
      row: { dueAt: EXISTING_DUE, scheduledReminderCount: 0, observedBefore },
    });

    expect(preview.disposition).toBe("previewed");
    expect(effectKinds(preview)).toEqual(["reminder_created"]);
  });

  it("schedules no reminder for a due date one second past", () => {
    // The other side of the same boundary, at the tightest margin the comparison
    // can express — so the rule is "the due date is in the future", not "the due
    // date is roughly now".
    const preview = build({
      action: "reschedule_due",
      row: {
        dueAt: EXISTING_DUE,
        scheduledReminderCount: 1,
        observedBefore: OBSERVED_JUST_AFTER_TARGET,
      },
    });

    expect(effectKinds(preview)).toEqual(["reminders_cancelled"]);
  });

  it("says nothing is affected when a past reschedule meets a task with no reminder", () => {
    const preview = build({
      action: "reschedule_due",
      patch: { dueAt: "2026-07-01" },
      row: { dueAt: EXISTING_DUE, scheduledReminderCount: 0 },
    });

    expect(effectKinds(preview)).toEqual(["reminders_none"]);
  });

  it("creates a reminder for a clear-eyed future reschedule of an unreminded task", () => {
    const preview = build({
      action: "reschedule_due",
      row: { dueAt: EXISTING_DUE, scheduledReminderCount: 0 },
    });

    expect(effectKinds(preview)).toEqual(["reminder_created"]);
  });

  it.each(["reopen_task", "restore_task"] as const)(
    "%s closes the scheduled reminder §11.3 assumes cannot exist and opens a fresh one",
    (action) => {
      // §11.3 says these actions "re-create the reminder the INSERT-only trigger
      // cannot", presuming the task has none. That presumption does not hold for
      // rows written before Phase 2E: nothing here has ever cancelled a reminder
      // on completion or cancellation, and `authenticated` may insert them
      // directly. So one may be there — and §11.3's mechanism for it is not
      // optional: "closing a row and inserting a new one, never by updating in
      // place", because a reminder id that has already notified can never notify
      // again.
      //
      // An earlier version disclosed "one already exists" and left it at that,
      // which commits the phase to leaving two live reminders — the outcome
      // close-and-insert exists to prevent. There is no `reminders_already_
      // scheduled` effect any more, and `copy.test.ts` proves the vocabulary no
      // longer declares one.
      const preview = build({
        action,
        row: { dueAt: EXISTING_DUE, scheduledReminderCount: 1 },
      });

      expect(effectKinds(preview)).toEqual(["reminders_cancelled", "reminder_created"]);
    },
  );

  it.each(["reopen_task", "restore_task"] as const)(
    "%s closes the reminder and promises no replacement when no due date survives",
    (action) => {
      // The half that separates the two disclosures: the close is driven by what
      // the task has, the creation by whether a future due date remains. With no
      // due date at all there is nothing to schedule, and saying otherwise would
      // promise a reminder the mechanism cannot produce.
      const preview = build({ action, row: { dueAt: null, scheduledReminderCount: 1 } });

      expect(effectKinds(preview)).toEqual(["reminders_cancelled"]);
    },
  );

  it.each(["reopen_task", "restore_task"] as const)(
    "%s on a task with a future due date and no reminder schedules one",
    (action) => {
      const preview = build({ action, row: { dueAt: EXISTING_DUE, scheduledReminderCount: 0 } });

      expect(effectKinds(preview)).toEqual(["reminder_created"]);
    },
  );

  it("discloses no reminder effect at all for an action that does not touch them", () => {
    const preview = build({ action: "rename_task", row: { scheduledReminderCount: 3 } });

    expect(preview.effects).toEqual([]);
  });

  it.each(locales)("localizes every disclosed effect in %s", (locale) => {
    const copy = getTaskCommandCopy(locale);
    const previews = [
      build({ action: "cancel_task", row: { scheduledReminderCount: 1 }, locale }),
      build({ action: "cancel_task", row: { scheduledReminderCount: 0 }, locale }),
      build({ action: "reschedule_due", row: { dueAt: EXISTING_DUE, scheduledReminderCount: 1 }, locale }),
      build({ action: "reopen_task", row: { scheduledReminderCount: 1 }, locale }),
    ];

    const seen = new Set<string>();
    for (const preview of previews) {
      for (const effect of preview.effects) {
        seen.add(effect.kind);
        expect(effect.text).toBe(copy.effects[effect.kind]);
        expect(effect.text.trim()).not.toBe("");
        expect(Object.keys(effect).sort()).toEqual(["kind", "text"]);
      }
    }
    // Every declared linked effect is reached by the four fixtures above, so no
    // member of the vocabulary is localized-but-unreachable. Asserted against the
    // declared code list as well as against the literal: the literal says which
    // four, and the vocabulary comparison is what turns "a member was removed"
    // and "a member was added with nothing producing it" into failures here
    // rather than into a quietly shorter list.
    expect([...seen].sort()).toEqual([...TASK_COMMAND_LINKED_EFFECTS].sort());
    expect([...seen].sort()).toEqual([
      "leaves_active_lists",
      "reminder_created",
      "reminders_cancelled",
      "reminders_none",
    ]);
  });

  it("renders the same effect in different words per locale", () => {
    const ptBR = build({ action: "cancel_task", row: { scheduledReminderCount: 1 }, locale: "pt-BR" });
    const en = build({ action: "cancel_task", row: { scheduledReminderCount: 1 }, locale: "en" });

    expect(effectKinds(ptBR)).toEqual(effectKinds(en));
    expect(ptBR.effects[0].text).not.toBe(en.effects[0].text);
  });
});

describe("2E-PREVIEW-006 / 2E-DISAMBIG-003 / 2E-DISAMBIG-005 — staleness", () => {
  it("echoes the match's observation instant rather than recomputing one", () => {
    // 2E-PREVIEW-004's TOCTOU anchor. A second read would produce a pre-state
    // from a later instant than the one the fingerprint claims, which is the
    // window `observedBefore` exists to close.
    const { result, preview } = scenario({ action: "complete_task" });

    expect(preview.observedBefore).toBe(OBSERVED);
    expect(preview.observedBefore).toBe(result.observedBefore);
    expect(preview.observedBefore).not.toBe(NOW);
  });

  it("carries the match policy version for provenance alongside the command policy version", () => {
    const { command, result, preview } = scenario({ action: "complete_task" });

    expect(preview.policyVersion).toBe(command.policyVersion);
    expect(preview.matchPolicyVersion).toBe(result.matchPolicyVersion);
    expect(preview.policyVersion).not.toBe(preview.matchPolicyVersion);
  });

  it("reports a preview the client is holding against a moved task as stale", () => {
    const preview = build({
      action: "complete_task",
      expected: { taskId: TASK_ID, updatedAt: "2026-07-24T00:00:00.000Z" },
    });

    expect(preview.disposition).toBe("rejected_stale");
    expect(preview.deltas).toEqual([]);
    expect(preview.canonicalPatch).toEqual({});
    expect(preview.effects).toEqual([]);
    expect(preview.reversible).toBe(false);
  });

  it("accepts an expectation that still matches the observed pre-state", () => {
    const { rows } = scenario({ action: "complete_task" });
    const preview = build({
      action: "complete_task",
      expected: { taskId: TASK_ID, updatedAt: rows[0].updatedAt },
    });

    expect(preview.disposition).toBe("previewed");
  });

  it("reports a selection the match never ranked as stale, not as an error", () => {
    // 2E-DISAMBIG-005. The thing the user picked is no longer there to act on,
    // which is a product outcome and not a caller defect.
    const preview = build({ action: "complete_task", selectedTaskId: ABSENT_TASK_ID });

    expect(preview.disposition).toBe("rejected_stale");
    expect(preview.task.taskId).toBe(ABSENT_TASK_ID);
    // No title and no status, rather than an empty string standing in for one.
    //
    // This path fires when the selected id is absent from `rows`, which is exactly
    // when the cross-owner `throw` cannot run — so it is reached before ownership
    // has been established. Reading the candidate's `preState` here was the one
    // place in the module that returned task content no check had cleared, and a
    // review demonstrated a hand-assembled result leaking another owner's title
    // through it.
    expect(preview.task.title).toBeNull();
    expect(preview.task.status).toBeNull();
    expect(preview.deltas).toEqual([]);
  });

  it.each(["rejected_stale", "refused"] as const)(
    "a %s shape carries the selected id and no task content at all",
    (disposition) => {
      const preview = SHAPES[disposition]();

      expect(preview.disposition).toBe(disposition);
      expect(preview.task.taskId).not.toBe("");
      expect(preview.task.title).toBeNull();
      expect(preview.task.status).toBeNull();
    },
  );

  it("reports no observation instant on a shell whose match observed nothing", () => {
    // The nullability of `observedBefore` is load-bearing, not defensive: a match
    // that ranked no candidates has no observation to report, and the field held a
    // fabricated empty string — the one value it must never hold, since Slice
    // 2E.4 hashes it. `fingerprint.ts` now throws `missing_observation` rather
    // than sending a null, so nothing downstream can turn this into a digest over
    // an instant that was never observed.
    //
    // Simulated by transforming a real result, like the other two races in this
    // block: the ranker cannot be made to produce candidates *and* no observation.
    const preview = build({
      action: "complete_task",
      selectedTaskId: ABSENT_TASK_ID,
      resultForPreview: (result) => ({ ...result, candidates: [], observedBefore: null }),
    });

    expect(preview.disposition).toBe("rejected_stale");
    expect(preview.observedBefore).toBeNull();
    expect(preview.observedBefore).not.toBe("");
  });

  it("reports a candidate that went ineligible between listing and selection as stale", () => {
    // Simulated by transforming a real result, because the ranker filters an
    // ineligible row away before it can become a candidate — which is exactly
    // why the race has to be reproduced rather than ranked.
    const preview = build({
      action: "complete_task",
      resultForPreview: (result) => ({
        ...result,
        candidates: result.candidates.map((candidate) => ({
          ...candidate,
          preState: { ...candidate.preState, status: "completed" },
        })),
      }),
      rowsForPreview: (rows) => rows.map((row) => ({ ...row, status: "completed" })),
    });

    expect(preview.disposition).toBe("rejected_stale");
    expect(preview.canonicalPatch).toEqual({});
  });

  it.each(locales)("gives a stale preview the stale copy in %s", (locale) => {
    const copy = getTaskCommandCopy(locale);
    const preview = build({
      action: "complete_task",
      locale,
      expected: { taskId: TASK_ID, updatedAt: "2026-07-24T00:00:00.000Z" },
    });

    expect(preview.copy.title).toBe(copy.dispositions.rejected_stale.title);
    expect(preview.copy.description).toBe(copy.dispositions.rejected_stale.description);
  });
});

describe("2E-PREVIEW-007 — a preview holds nothing the caller could not already read", () => {
  /** Every key the DTO declares, across the whole object graph. */
  const DECLARED_KEYS = [
    "willMutate",
    "disposition",
    "refusal",
    "action",
    "task",
    "deltas",
    "effects",
    "canonicalPatch",
    "reversible",
    "undoWindowHours",
    "destructive",
    "requiresConfirmation",
    "oneStep",
    "observedBefore",
    "policyVersion",
    "matchPolicyVersion",
    "copy",
    // task
    "taskId",
    "title",
    "status",
    // delta and delta value
    "field",
    "label",
    "before",
    "after",
    "changed",
    "kind",
    "text",
    "instant",
    // effect: `kind` and `text`, already listed
    // canonical patch
    "description",
    "dueAt",
    "plannedAt",
    "manualPriority",
    "intentionalNoDue",
    "noDueReason",
    "projectId",
    "contextId",
    "personId",
    "personRole",
    // copy
    "notice",
    "reversibility",
    "undoWindow",
    "gravity",
  ];

  const TOP_LEVEL_KEYS = [
    "action",
    "canonicalPatch",
    "copy",
    "deltas",
    "destructive",
    "disposition",
    "effects",
    "matchPolicyVersion",
    "observedBefore",
    "oneStep",
    "policyVersion",
    "refusal",
    "requiresConfirmation",
    "reversible",
    "task",
    "undoWindowHours",
    "willMutate",
  ];

  /**
   * Row-only columns, quoted the way `JSON.stringify` emits a key.
   *
   * Quoted rather than bare because `canonicalPatch.projectId` is a declared
   * field and a bare `projectId` check would forbid it along with `projectIds`.
   */
  const FORBIDDEN_KEYS = [
    "ownerId",
    "owner_id",
    "user_id",
    "userId",
    "projectIds",
    "contextIds",
    "personIds",
    "projectNames",
    "contextNames",
    "personNames",
    "personRoles",
    "projectRefId",
    "contextRefId",
    "personRefId",
    // The resolved names reach the DTO only as `delta.after.text`, which is
    // display copy. The columns themselves must not travel: a component reading
    // `projectRefName` would be re-deriving the rendering the preview already
    // decided, which is the domain logic `ENGINEERING_STANDARDS` keeps out of
    // components.
    "projectRefName",
    "contextRefName",
    "personRefName",
    "prefilterTier",
    "tokenOverlap",
    "queryTokenCount",
    "effectiveLimit",
    "lastAuditedAt",
    "scheduledReminderCount",
    "nextReminderAt",
    "createdAt",
    "updatedAt",
    "completedAt",
    "cancelledAt",
    "projectHintMatched",
    "contextHintMatched",
    "personHintMatched",
  ];

  function collectKeys(value: unknown, into: Set<string>): void {
    if (Array.isArray(value)) {
      for (const entry of value) collectKeys(entry, into);
      return;
    }
    if (typeof value === "object" && value !== null) {
      for (const [key, child] of Object.entries(value)) {
        into.add(key);
        collectKeys(child, into);
      }
    }
  }

  it("exposes exactly the declared top-level keys", () => {
    const preview = build({ action: "complete_task" });

    expect(Object.keys(preview).sort()).toEqual(TOP_LEVEL_KEYS);
  });

  it.each(TASK_COMMAND_ACTIONS)("%s exposes no key outside the declared DTO", (action) => {
    const keys = new Set<string>();
    collectKeys(build({ action }), keys);

    expect([...keys].filter((key) => !DECLARED_KEYS.includes(key))).toEqual([]);
  });

  it.each(TASK_COMMAND_ACTIONS)("%s carries no owner identity, in any spelling", (action) => {
    const json = JSON.stringify(build({ action }));

    // The values, which is what would actually leak, and the key names, which is
    // what a future widening of the projection would add.
    expect(json).not.toContain(OWNER);
    expect(json).not.toContain(OTHER_OWNER);
    for (const key of FORBIDDEN_KEYS) {
      expect(json).not.toContain(`"${key}"`);
    }
  });

  it("carries no owner identity on a stale or refused shape either", () => {
    for (const disposition of TASK_COMMAND_PREVIEW_DISPOSITIONS) {
      const json = JSON.stringify(SHAPES[disposition]());
      expect(json).not.toContain(OWNER);
      expect(json).not.toContain("ownerId");
    }
  });

  it("throws rather than previewing a row belonging to another owner", () => {
    // Not a product outcome: `loadTaskCandidates` already raises on a
    // cross-owner row, so reaching here means a caller assembled rows by hand.
    expect(() =>
      build({
        action: "complete_task",
        rowsForPreview: (rows) => rows.map((row) => ({ ...row, ownerId: OTHER_OWNER })),
      }),
    ).toThrow(TaskPreviewInputError);

    try {
      build({
        action: "complete_task",
        rowsForPreview: (rows) => rows.map((row) => ({ ...row, ownerId: OTHER_OWNER })),
      });
      throw new Error("a cross-owner row was previewed");
    } catch (error) {
      expect(error).toBeInstanceOf(TaskPreviewInputError);
      expect((error as TaskPreviewInputError).code).toBe("cross_owner_candidate");
    }
  });
});

describe("2E-PREVIEW-004 — refusal", () => {
  it("refuses an assignment whose reference resolved to nothing", () => {
    // `resolve_owned_entity_exact` collapses "no entity of that name" and "more
    // than one" deliberately, and the preview does not pretend to tell them
    // apart.
    const preview = build({ action: "assign_project", row: UNRESOLVED_REFERENCES });

    expect(preview.disposition).toBe("refused");
    expect(preview.refusal).toBe("relation_reference_unresolved");
    expect(preview.canonicalPatch).toEqual({});
    expect(preview.deltas).toEqual([]);
    expect(preview.effects).toEqual([]);
    expect(preview.oneStep).toBe(false);
    expect(preview.reversible).toBe(false);
  });

  it.each(["assign_context", "assign_person", "set_waiting_on"] as const)(
    "refuses %s on an unresolved reference too",
    (action) => {
      const preview = build({ action, row: UNRESOLVED_REFERENCES });

      expect(preview.disposition).toBe("refused");
      expect(preview.refusal).toBe("relation_reference_unresolved");
    },
  );

  it.each(locales)("gives a refusal its own copy in %s, not the disposition's", (locale) => {
    const copy = getTaskCommandCopy(locale);
    const preview = build({ action: "assign_project", row: UNRESOLVED_REFERENCES, locale });

    expect(preview.copy.title).toBe(copy.refusals.relation_reference_unresolved.title);
    expect(preview.copy.description).toBe(copy.refusals.relation_reference_unresolved.description);
    expect(preview.copy.title).not.toBe(copy.dispositions.refused.title);
  });

  it("carries a null refusal for every disposition that is not a refusal", () => {
    for (const disposition of TASK_COMMAND_PREVIEW_DISPOSITIONS) {
      const preview = SHAPES[disposition]();
      if (disposition === "refused") {
        expect(preview.refusal).not.toBeNull();
        continue;
      }
      expect(preview.refusal).toBeNull();
    }
  });
});

describe("the preview disposition vocabulary is contained by the outcome vocabulary", () => {
  it("declares every disposition except previewed as an outcome", () => {
    // PRD §11.1 makes `previewed` a lifecycle state rather than one of
    // 2E-UX-001's twelve outcomes: a preview waiting for the user has not come
    // to rest.
    for (const disposition of TASK_COMMAND_PREVIEW_DISPOSITIONS) {
      if (disposition === "previewed") {
        expect(TASK_COMMAND_OUTCOMES).not.toContain(disposition);
        continue;
      }
      expect(TASK_COMMAND_OUTCOMES).toContain(disposition);
    }
  });

  it.each(TASK_COMMAND_PREVIEW_DISPOSITIONS)("previewOutcome maps %s", (disposition) => {
    const outcome = previewOutcome(SHAPES[disposition]());

    if (disposition === "previewed") {
      expect(outcome).toBeNull();
      return;
    }
    expect(outcome).toBe(disposition);
    expect(TASK_COMMAND_OUTCOMES).toContain(outcome);
  });

  it("returns null for exactly one of the five dispositions", () => {
    const nulls = TASK_COMMAND_PREVIEW_DISPOSITIONS.filter(
      (disposition) => previewOutcome(SHAPES[disposition]()) === null,
    );

    expect(nulls).toEqual(["previewed"]);
  });
});

describe("2E-I18N-002 — instants render in the caller's zone", () => {
  it("renders the same instant differently in two zones, with one instant behind both", () => {
    const utc = build({ action: "clear_due", row: { dueAt: EXISTING_DUE }, timeZone: "UTC" });
    const saoPaulo = build({
      action: "clear_due",
      row: { dueAt: EXISTING_DUE },
      timeZone: "America/Sao_Paulo",
    });

    const utcDue = deltaFor(utc, "due_at").before;
    const saoPauloDue = deltaFor(saoPaulo, "due_at").before;

    expect(utcDue.kind).toBe("instant");
    expect(utcDue.text).not.toBe(saoPauloDue.text);
    expect(utcDue.instant).toBe(EXISTING_DUE);
    expect(saoPauloDue.instant).toBe(EXISTING_DUE);
  });

  it("renders the same instant differently in two locales", () => {
    const ptBR = deltaFor(
      build({ action: "clear_due", row: { dueAt: EXISTING_DUE }, locale: "pt-BR" }),
      "due_at",
    ).before;
    const en = deltaFor(
      build({ action: "clear_due", row: { dueAt: EXISTING_DUE }, locale: "en" }),
      "due_at",
    ).before;

    expect(ptBR.instant).toBe(en.instant);
    expect(ptBR.text).not.toBe(en.text);
  });

  it.each(locales)("falls back to localized copy for an unknown zone in %s, never throwing", (locale) => {
    // A preview the surface cannot render a date for is still a preview.
    // `formatInstantForDateTimeLocal` throws in this case, which is why
    // `renderInstant` does not reuse it.
    const copy = getTaskCommandCopy(locale);
    const preview = build({
      action: "clear_due",
      row: { dueAt: EXISTING_DUE },
      locale,
      timeZone: "Not/AZone",
    });
    const delta = deltaFor(preview, "due_at");

    expect(delta.before.text).toBe(copy.values.unrenderableInstant);
    expect(delta.before.instant).toBe(EXISTING_DUE);
    expect(delta.before.kind).toBe("instant");
  });

  it("falls back for an instant it cannot parse, rather than inventing one", () => {
    const preview = build({ action: "clear_due", row: { dueAt: "not-an-instant" } });
    const copy = getTaskCommandCopy("pt-BR");

    expect(deltaFor(preview, "due_at").before.text).toBe(copy.values.unrenderableInstant);
  });

  it.each(locales)("localizes the empty and at-apply markers in %s", (locale) => {
    const copy = getTaskCommandCopy(locale);
    const preview = build({ action: "complete_task", locale });

    expect(deltaFor(preview, "completed_at").before.text).toBe(copy.values.empty);
    expect(deltaFor(preview, "completed_at").after.text).toBe(copy.values.atApply);
    expect(preview.copy.notice).toBe(copy.preview.readOnlyNotice);
  });
});

describe("2E-UPDATE-012 — a due date on an intentionally undated task", () => {
  it("moves the two consistency flags with the due date, and shows that it did", () => {
    // `tasks_no_due_consistency_check` forbids a due date on an intentionally
    // undated task, so the flags travel atomically — rather than the write
    // raising a raw 23514 the user cannot act on.
    const preview = build({
      action: "reschedule_due",
      row: { dueAt: null, intentionalNoDue: true, noDueReason: "Waiting on scope" },
    });

    expect(preview.canonicalPatch.intentionalNoDue).toBe(false);
    expect(preview.canonicalPatch.noDueReason).toBeNull();
    expect(deltaFor(preview, "intentional_no_due").before.text).toBe("true");
    expect(deltaFor(preview, "intentional_no_due").after.text).toBe("false");
    expect(deltaFor(preview, "intentional_no_due").changed).toBe(true);
    expect(deltaFor(preview, "no_due_reason").changed).toBe(true);
  });

  it("leaves the flags alone when the task was not intentionally undated", () => {
    const preview = build({ action: "reschedule_due", row: { dueAt: EXISTING_DUE } });

    expect(preview.canonicalPatch.intentionalNoDue).toBeUndefined();
    expect(preview.canonicalPatch.noDueReason).toBeUndefined();
    expect(deltaFor(preview, "intentional_no_due").changed).toBe(false);
    expect(deltaFor(preview, "no_due_reason").changed).toBe(false);
  });
});

describe("the canonical patch binds ids and keeps a stable shape", () => {
  it("holds sorted keys with no undefined holes", () => {
    const preview = build({
      action: "reschedule_due",
      row: { dueAt: null, intentionalNoDue: true, noDueReason: "Waiting on scope" },
    });
    const keys = Object.keys(preview.canonicalPatch);

    expect(keys).toEqual([...keys].sort());
    expect(keys).toEqual(["dueAt", "intentionalNoDue", "noDueReason"]);
    for (const value of Object.values(preview.canonicalPatch)) {
      expect(value).not.toBeUndefined();
    }
  });

  it("binds the resolved relation id rather than the words the user typed", () => {
    // Binding the id is what stops a project renamed between preview and apply
    // from silently retargeting the assignment (2E-UPDATE-015).
    const { command, preview } = scenario({
      action: "assign_project",
      row: { projectIds: [], projectNames: [], projectRefId: PROJECT_ID },
    });

    expect(command.patch.projectRef).toBe("Acme");
    expect(preview.canonicalPatch.projectId).toBe(PROJECT_ID);
    expect(JSON.stringify(preview.canonicalPatch)).not.toContain("Acme");
  });

  it("carries a resolved instant, never a phrase", () => {
    const preview = build({ action: "reschedule_due", row: { dueAt: EXISTING_DUE } });

    expect(preview.canonicalPatch.dueAt).toBe(RESCHEDULE_TARGET);
    expect(preview.canonicalPatch.dueAt).not.toBe("tomorrow");
  });

  it("writes an explicit null for clear_due rather than omitting the key", () => {
    const preview = build({ action: "clear_due", row: { dueAt: EXISTING_DUE } });

    expect(preview.canonicalPatch).toEqual({ dueAt: null });
    expect("dueAt" in preview.canonicalPatch).toBe(true);
  });
});
