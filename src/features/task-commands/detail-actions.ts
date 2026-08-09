"use server";

/**
 * Slice D2 — the production caller for the task detail surface's field edits.
 *
 * `detail-command.ts` is the contract; this is the only thing that calls it. It
 * is deliberately the same shape as `operations/actions.ts`, which is the Work
 * surface's caller, and it holds the same four properties:
 *
 * 1. **Nothing throws out of a Server Action** (2F-SURFACE-011). Every module
 *    below signals a precondition fault by throwing, and an escaped throw would
 *    render the error boundary and take the whole detail page with it. Known
 *    faults become the honest "something went wrong, nothing changed" state;
 *    anything unknown is re-thrown, because swallowing it would hide a real
 *    defect behind a product message.
 * 2. **The timezone is the caller's own, read server-side** (2E-I18N-002). It
 *    decides what a submitted calendar date means, which is not a decision to
 *    take from an envelope.
 * 3. **The clicked task id is authoritative** (2F-SURFACE-004). The title is a
 *    query hint and the outcome reports the title resolution returned.
 * 4. **A destructive confirmation is issued by the call that renders the
 *    prompt, not by the one that consumes it** (2E-DESTRUCTIVE-003). Issuing
 *    and consuming in one call would bind the token to whatever the envelope
 *    said at Confirm time rather than to the state the user was shown, and the
 *    guarantee would be unreachable in its own flow.
 *
 * **No SQL, no RPC, no migration and no direct task write.** Resolution is
 * `list_task_command_candidates`, confirmation is
 * `issue_task_command_confirmation` and the write is `apply_task_command` — all
 * three deployed since Phase 2E.
 */

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import {
  createProductEventIdempotencyKey,
  recordProductEvent,
} from "@/features/product-analytics/server";
import { requireUser } from "@/lib/auth/require-user";
import { defaultAgentPreferences, locales, resolveLocale, type Locale } from "@/lib/preferences";

import { buildTaskCommandAppliedProperties } from "./analytics";
import { TaskCommandApplyError } from "./apply";
import { TaskCandidateQueryError } from "./candidates";
import { issueTaskCommandConfirmation } from "./confirmation";
import { getTaskCommandCopy, type TaskCommandCopy } from "./copy";
import {
  applyDetailCommand,
  resolveDetailCommand,
  type DetailCommandRefusal,
} from "./detail-command";
import {
  idleTaskDetailCommandState,
  type TaskDetailCommandState,
} from "./detail-action-state";
import { getTaskDetailControlsCopy, type TaskDetailControlsCopy } from "./detail-controls-copy";
import { buildDetailPatch, detailControlFor } from "./detail-controls";
import type { TaskCommandOutcome } from "./outcomes";
import { TASK_COMMAND_ACTIONS, type TaskCommandAction } from "./taxonomy";

/**
 * The three things this action can be asked to do.
 *
 * `apply` is every non-destructive verb. `request_cancel` and `confirm_cancel`
 * are the two halves of the one destructive verb, and they are separate intents
 * rather than a boolean so a client cannot reach the write half by omitting a
 * flag.
 */
const DETAIL_COMMAND_INTENTS = ["apply", "request_cancel", "confirm_cancel"] as const;

type DetailCommandIntent = (typeof DETAIL_COMMAND_INTENTS)[number];

/**
 * How long an issued confirmation's pinned instant stays acceptable.
 *
 * Not a security boundary — the digest binding is, and a forged instant simply
 * matches no issued row. This bounds what can be *recorded as observed*: without
 * it a caller could name any instant at all as the moment it read the task, and
 * `observedBefore` is written into the audit trail as fact.
 */
const CONFIRMATION_WINDOW_MS = 15 * 60 * 1000;

/** Tolerance for the round trip itself, not for a clock this process does not own. */
const CLOCK_SKEW_MS = 5_000;

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

const detailCommandSchema = z.object({
  intent: z.enum(DETAIL_COMMAND_INTENTS),
  taskId: z.string().uuid(),
  locale: z.enum(locales),
  action: z.enum(TASK_COMMAND_ACTIONS),
  /** The rendered title. A query hint only, and never a gate (2F-SURFACE-004). */
  title: z.string().max(4000),
  operationKey: z.string().uuid(),
  /**
   * The control's value, still untrusted. Bounded here only so a multi-megabyte
   * field is not read into memory; `buildDetailPatch` and then
   * `validateTaskCommand` are the real gates.
   */
  value: z.string().max(4000).optional(),
  /** Present only on `confirm_cancel`, carrying the issuing call's instant. */
  observedBefore: z.string().max(64).optional(),
});

function settled(
  partial: Partial<TaskDetailCommandState> &
    Pick<TaskDetailCommandState, "status" | "heading" | "detail">,
): TaskDetailCommandState {
  return {
    ...idleTaskDetailCommandState,
    ...partial,
    // The heading, the detail and the reason together are what a screen-reader
    // user needs: the outcome, and why.
    announcement:
      partial.announcement
      ?? [partial.heading, partial.detail, partial.reason].filter(Boolean).join(". "),
  };
}

function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value === "") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

/** One rendered sentence per refusal kind, from the two copy modules that own them. */
function presentRefusal(
  refusal: DetailCommandRefusal,
  action: TaskCommandAction,
  copy: TaskDetailControlsCopy,
  commandCopy: TaskCommandCopy,
): TaskDetailCommandState {
  if (refusal.kind === "unresolvable" || refusal.kind === "ineligible") {
    const row = copy.rowRefusals[refusal.kind];
    return settled({
      status: "refused",
      action,
      heading: row.title,
      detail: row.description,
      refreshable: true,
      retryable: true,
    });
  }
  if (refusal.kind === "relation_unresolved") {
    // The one refusal whose sentence already exists: `copy.refusals` has held it
    // since Slice 2E.4, because the preview path can produce the same outcome
    // from the same SQL resolution.
    const refused = commandCopy.refusals.relation_reference_unresolved;
    return settled({
      status: "refused",
      action,
      heading: refused.title,
      detail: refused.description,
      refreshable: true,
      retryable: true,
    });
  }
  if (refusal.kind === "unsupported") {
    return settled({
      status: "refused",
      action,
      heading: commandCopy.outcomes.unsupported.title,
      detail: commandCopy.outcomes.unsupported.description,
      reason: commandCopy.unsupportedReasons[refusal.reason],
    });
  }
  return settled({
    status: "refused",
    action,
    heading: commandCopy.outcomes.refused.title,
    detail: commandCopy.outcomes.refused.description,
    // `needs_clarification` can only come from `dueAt` or `plannedAt` — they are
    // the taxonomy's only temporal fields — and `buildDetailPatch` has already
    // excluded the wrong shape and the out-of-window date, so what is left is a
    // date the lexicon declines for a reason the picker cannot anticipate.
    reason:
      refusal.kind === "needs_clarification"
        ? copy.valueRefusals.date_invalid
        : commandCopy.validation[refusal.reason],
    retryable: true,
  });
}

function presentFailure(
  failed: { readonly outcome: TaskCommandOutcome; readonly failure: string; readonly retryable: boolean },
  action: TaskCommandAction,
  copy: TaskDetailControlsCopy,
  commandCopy: TaskCommandCopy,
): TaskDetailCommandState {
  const outcome = commandCopy.outcomes[failed.outcome] ?? commandCopy.outcomes.refused;
  return settled({
    status: "failed",
    action,
    heading: outcome.title,
    detail: outcome.description,
    reason:
      commandCopy.failures[failed.failure as keyof typeof commandCopy.failures]
      ?? copy.unexpected,
    // A staleness refusal is one the user acts on by reloading, so it carries the
    // same affordance the resolution refusals do.
    refreshable: failed.failure === "stale_pre_state" || failed.failure === "task_not_found",
    // Straight from the declared policy, never inferred from the outcome.
    retryable: failed.retryable,
  });
}

/**
 * Applies one task-detail edit, or issues the confirmation a cancellation needs.
 */
export async function applyTaskDetailCommand(
  _previous: TaskDetailCommandState,
  formData: FormData,
): Promise<TaskDetailCommandState> {
  const locale = resolveLocale(formData.get("locale"));
  const copy = getTaskDetailControlsCopy(locale);
  const commandCopy = getTaskCommandCopy(locale);

  const parsed = detailCommandSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return settled({
      status: "failed",
      heading: commandCopy.outcomes.refused.title,
      detail: copy.unexpected,
      retryable: true,
    });
  }
  const request = parsed.data;
  const { action, intent } = request;

  // The control is derived from the taxonomy, so an action with no single-field
  // control — a future composite verb — is refused here rather than submitted as
  // a half-filled patch.
  const control = detailControlFor(action);
  if (control === null) {
    return settled({
      status: "refused",
      action,
      heading: commandCopy.outcomes.unsupported.title,
      detail: commandCopy.outcomes.unsupported.description,
      reason: commandCopy.unsupportedReasons.unsupported_action,
    });
  }

  // The two halves of the intent/destructiveness pairing, checked in both
  // directions. A destructive action on the direct route would be an
  // unconfirmed cancellation; a non-destructive action on the confirmation
  // route would strand a row no apply can consume, which is a caller defect
  // `issueTaskCommandConfirmation` raises rather than renders.
  const destructiveIntent = intent === "request_cancel" || intent === "confirm_cancel";
  if (control.destructive !== destructiveIntent) {
    return settled({
      status: "refused",
      action,
      heading: commandCopy.outcomes.refused.title,
      detail: commandCopy.outcomes.refused.description,
      reason: copy.unexpected,
    });
  }

  const { supabase, user } = await requireUser(locale);
  // The caller's own zone, read the way `work-projection.ts`,
  // `task-commands/actions.ts` and `operations/actions.ts` read it. It decides
  // what `2026-08-15` means, so a zone this process guessed would silently move
  // the user's due date.
  const profile = await supabase.from("profiles").select("timezone").eq("user_id", user.id).maybeSingle();
  const timeZone = isValidTimeZone(profile.data?.timezone)
    ? profile.data.timezone
    : defaultAgentPreferences.timezone;

  const nowMs = Date.now();
  // The submitted value becomes a patch against the caller's *own* today, so a
  // picker bounded in one timezone is judged in the same one.
  const today = new Date(new Date(nowMs).toLocaleString("en-US", { timeZone }));
  const patch = buildDetailPatch(control, request.value, today);
  if (patch.status === "refused") {
    return settled({
      status: "refused",
      action,
      heading: commandCopy.outcomes.refused.title,
      detail: commandCopy.outcomes.refused.description,
      reason: copy.valueRefusals[patch.reason],
      retryable: true,
    });
  }

  const pinned = pinInstant(intent, request.observedBefore, nowMs);
  if (pinned === null) {
    // The envelope's instant is outside the window this surface will record as
    // observed. Nothing was issued for it that is still usable, so the honest
    // answer is to start the cancellation again.
    return settled({
      status: "refused",
      action,
      heading: copy.rowRefusals.unresolvable.title,
      detail: copy.rowRefusals.unresolvable.description,
      refreshable: true,
      retryable: true,
    });
  }

  const input = {
    ownerId: user.id,
    taskId: request.taskId,
    title: request.title,
    action,
    patch: patch.patch,
    operationKey: request.operationKey,
    now: pinned,
    timeZone,
  };

  try {
    if (intent === "request_cancel") {
      const resolution = await resolveDetailCommand({ ...input, client: supabase });
      if (resolution.status === "refused") {
        return presentRefusal(resolution.refusal, action, copy, commandCopy);
      }
      const issued = await issueTaskCommandConfirmation(supabase, {
        source: {
          task: { taskId: resolution.row.taskId },
          action: resolution.command.action,
          canonicalPatch: resolution.canonicalPatch,
          observedBefore: resolution.observedBefore,
          policyVersion: resolution.command.policyVersion,
        },
        preState: resolution.preState,
        operationKey: request.operationKey,
      });
      if (issued.outcome !== "issued") {
        return presentFailure(issued, action, copy, commandCopy);
      }
      return settled({
        status: "awaiting_confirmation",
        action,
        heading: copy.confirm.pendingHeading,
        detail: copy.confirm.pendingDetail,
        pending: {
          action,
          operationKey: request.operationKey,
          // The instant the digest was derived from, so the Confirm call
          // reproduces it exactly.
          observedBefore: resolution.observedBefore,
          // 2F-SURFACE-004: the title resolution returned, never the rendered one.
          title: resolution.preState.title,
        },
      });
    }

    const outcome = await applyDetailCommand(supabase, input);
    if (outcome.status === "refused") {
      return presentRefusal(outcome.refusal, action, copy, commandCopy);
    }

    const { result, resolution } = outcome;
    if (result.outcome === "applied" || result.outcome === "no_change") {
      emitApplied(
        locale,
        request.operationKey,
        result.outcome,
        intent === "confirm_cancel" ? "confirmed" : "direct",
        result.outcome === "applied" && result.replayed,
      );
      if (result.outcome === "applied") {
        emitStatusChanged(
          locale,
          request.taskId,
          request.operationKey,
          resolution.preState.status,
          // Already the taxonomy's own destination: `buildCanonicalPatch` writes
          // `policy.targetStatus` into the patch for the actions that decide it
          // (PRD §11.2's `status→cancelled` arrow), so reading it here is reading
          // the value the fingerprint bound rather than a second derivation.
          resolution.canonicalPatch.status,
        );
        refreshTaskSurfaces(locale, request.taskId);
      }
      const outcomeCopy = commandCopy.outcomes[result.outcome];
      return settled({
        status: result.outcome,
        action,
        heading: outcomeCopy.title,
        detail: outcomeCopy.description,
        // `2L-EDIT-008`/`-009`. The RPC's own answer, unmodified: an `undoId`
        // on `applied` and `null` on `no_change`. Note that a cancellation
        // reaches this branch too -- it is reversible inside the window, and
        // the recovery route exists for afterwards. The two are different
        // promises and the copy keeps them apart.
        undo: result.outcome === "applied"
          ? { undoId: result.undoId, expiresAt: result.undoExpiresAt }
          : null,
      });
    }

    emitApplied(
      locale,
      request.operationKey,
      result.outcome,
      intent === "confirm_cancel" ? "confirmed" : "direct",
      false,
    );
    return presentFailure(result, action, copy, commandCopy);
  } catch (error) {
    const known =
      error instanceof TaskCommandApplyError || error instanceof TaskCandidateQueryError;
    if (!known) throw error;
    return settled({
      status: "failed",
      action,
      heading: commandCopy.outcomes.refused.title,
      detail: copy.unexpected,
      retryable: true,
    });
  }
}

/**
 * The instant this round resolves against.
 *
 * A fresh server instant for the two calls that start something, and the issuing
 * call's own instant for the one that finishes a cancellation — because
 * `task_command_fingerprint` hashes `observedBefore` alongside the pre-state,
 * and a second instant would derive a digest matching no issued confirmation.
 * Returns null for an envelope whose instant is malformed, in the future, or
 * older than the window.
 */
function pinInstant(
  intent: DetailCommandIntent,
  carried: string | undefined,
  nowMs: number,
): string | null {
  if (intent !== "confirm_cancel") return new Date(nowMs).toISOString();
  if (carried === undefined || !ISO_INSTANT.test(carried)) return null;
  const carriedMs = Date.parse(carried);
  if (!Number.isFinite(carriedMs)) return null;
  if (carriedMs > nowMs + CLOCK_SKEW_MS) return null;
  if (nowMs - carriedMs > CONFIRMATION_WINDOW_MS) return null;
  return carried;
}

/**
 * 2F-ANALYTICS-002 — the surface reports through the **existing**
 * `task_command_applied` event with `commandOrigin: 'work'`.
 *
 * `202607280061:434` constrains that property to `array['chat','work']`, and the
 * detail page is the Work surface's own route (`/app/work/[taskId]`), so no
 * allowlist is widened, no event is invented and no migration exists on this
 * path. `applyRoute` is `confirmed` for the one verb that spends a confirmation
 * and `direct` for the rest, which is the same distinction the console draws.
 */
function emitApplied(
  locale: Locale,
  operationKey: string,
  outcome: TaskCommandOutcome,
  route: "direct" | "confirmed",
  replayed: boolean,
): void {
  after(() => {
    recordProductEvent({
      name: "task_command_applied",
      surface: "task_command",
      locale,
      viewportClass: "unknown",
      appVersion: "server",
      idempotencyKey: createProductEventIdempotencyKey(
        "task_command_applied",
        `${operationKey}:${route}`,
      ),
      properties: buildTaskCommandAppliedProperties({
        origin: "work",
        outcome,
        route,
        replayed,
      }) as unknown as Record<string, unknown>,
    }).catch(() => {});
  });
}

/**
 * 2F-ANALYTICS-001 — `task_status_changed` in its current allowlisted shape.
 *
 * Emitted only on `applied`, and only when the status actually moved: most
 * detail edits change a title, a note, a date or a relation and move no status
 * at all, and reporting those as transitions would make the funnel unreadable.
 */
function emitStatusChanged(
  locale: Locale,
  taskId: string,
  operationKey: string,
  fromStatus: string,
  toStatus: string | undefined,
): void {
  if (toStatus === undefined || fromStatus === toStatus) return;
  after(() => {
    recordProductEvent({
      name: "task_status_changed",
      surface: "work",
      locale,
      viewportClass: "unknown",
      appVersion: "server",
      idempotencyKey: createProductEventIdempotencyKey("task_status_changed", operationKey),
      subject: { type: "task", id: taskId },
      properties: { fromStatus, toStatus },
    }).catch(() => {});
  });
}

/**
 * The surfaces one detail edit invalidates.
 *
 * The detail route itself first — without it the user applies a change, is told
 * "Done", and the fields above still show the old values, which reads as the
 * edit having silently failed. Both locales of the canonical Work route follow,
 * for the reason `operations/actions.ts` records: a change made in one language
 * still changes what the other must render.
 */
function refreshTaskSurfaces(locale: Locale, taskId: string): void {
  for (const candidate of locales) {
    revalidatePath(`/${candidate}/app/work/${taskId}`);
    revalidatePath(`/${candidate}/app/work`);
  }
  for (const route of ["", "/today", "/tasks", "/waiting"]) {
    revalidatePath(`/${locale}/app${route}`);
  }
}
