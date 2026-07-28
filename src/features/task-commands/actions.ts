"use server";

/**
 * The production caller for Phase 2E (Epic 2E-G, Slice 2E.7).
 *
 * Slices 2E.1–2E.6 built the contract — the schema, the matcher, the preview,
 * the mutation RPC, the confirmation ledger and the creation RPC — and left
 * every one of them without a caller. This module is that caller, and it is the
 * only place the pieces are wired together.
 *
 * Four properties are load-bearing and easy to lose, so each is stated where it
 * is implemented:
 *
 * 1. **The clock is pinned once per command.** `runCommandRound` re-derives
 *    everything from `session.issuedAt`, never from `new Date()`. See
 *    `session.ts` for what breaks otherwise.
 * 2. **A destructive confirmation is issued by the action that renders the
 *    preview**, not by the one that consumes it. Issuing and consuming in the
 *    same action would bind the token to whatever the envelope said at Confirm
 *    time rather than to the preview the user actually saw, which makes
 *    2E-DESTRUCTIVE-003 unenforceable in its own flow.
 * 3. **The staleness witness travels.** Every render records what it observed
 *    (`withStalenessWitness`), and every write passes it back as
 *    `buildTaskCommandPreview`'s `expected`. Without it 2E-PREVIEW-006 is
 *    structurally unreachable and the apply silently recompute-and-applies,
 *    which PRD §12.6 forbids by name.
 * 4. **Nothing throws out of a Server Action.** `creation.ts`,
 *    `confirmation.ts`, `apply.ts` and `candidates.ts` all signal precondition
 *    faults by throwing; an uncaught one drops the user's pending command,
 *    which 2E-UX-002 forbids. `guard` maps every one of them onto a rendered
 *    state.
 *
 * The timezone comes from `profiles.timezone` server-side and never from the
 * envelope (2E-I18N-002). A client-supplied zone would decide what "next
 * Friday" resolves to, which is a decision the model is already forbidden from
 * making.
 */

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { getAIProvider } from "@/lib/ai";
import {
  TASK_COMMAND_PROMPT_VERSION,
  TASK_COMMAND_STRATEGY_VERSION,
  TaskCommandProviderError,
  normalizeTaskCommandProposal,
  type TaskCommandProviderErrorCode,
} from "@/lib/ai/task-command-schema";
import { recordAIUsage } from "@/lib/ai/usage";
import { requireUser } from "@/lib/auth/require-user";
import { defaultAgentPreferences, locales, type Locale } from "@/lib/preferences";
import {
  createProductEventIdempotencyKey,
  recordProductEvent,
} from "@/features/product-analytics/server";
import type { ProductEventName } from "@/features/product-analytics/contracts";

import {
  TASK_COMMAND_ORIGINS,
  buildTaskCommandAppliedProperties,
  buildTaskCommandDisambiguatedProperties,
  buildTaskCommandPreviewedProperties,
  buildTaskCommandUndoneProperties,
  type TaskCommandOrigin,
  type TaskCommandPreviewedOutcome,
  type TaskCommandUndoResult,
} from "./analytics";
import { TaskCommandApplyError, applyTaskCommand } from "./apply";
import { TaskCandidateQueryError, loadTaskCandidates } from "./candidates";
import { issueTaskCommandConfirmation } from "./confirmation";
import { getTaskCommandCopy, type TaskCommandCopy } from "./copy";
import {
  continueTaskCommandNoMatch,
  createTaskCommand,
  decideInitialTaskCommandNoMatch,
  issueTaskCommandCreationConfirmation,
  previewTaskCommandCreation,
} from "./creation";
import { buildTaskDisambiguation } from "./disambiguation";
import type { TaskMatchEvidence } from "./match-policy";
import { TaskMatchInputError, rankTaskCandidates } from "./matching";
import type { TaskCommandOutcome } from "./outcomes";
import { TaskPreviewInputError, buildTaskCommandPreview, type TaskCommandPreview } from "./preview";
import { MAX_HINT_LENGTH, MAX_TITLE_WORDS } from "./schema";
import {
  createTaskCommandSession,
  deriveBaseTaskCommand,
  deriveTaskCommand,
  parseTaskCommandSession,
  requireApplicableSession,
  serializeTaskCommandSession,
  withClarification,
  withSelectedTask,
  withStalenessWitness,
  type TaskCommandSession,
} from "./session";
import {
  TASK_COMMAND_INTENTS,
  idleTaskCommandState,
  type TaskCommandConsoleState,
  type TaskCommandControl,
} from "./console-state";
import { loadTaskCommandUndoOperation } from "./undo-listing";

/**
 * Emits the parse-match-preview measurement.
 *
 * Takes the resolved outcome as an argument rather than deriving it from the
 * match verdict, because the two are not the same thing: a `matched` verdict
 * comes to rest at whatever the *preview* decided (`previewed`, `no_change`,
 * `rejected_stale`, `refused`), and an `unmatched` verdict comes to rest at
 * `creation_offered`, `clarification_requested` or `still_unmatched`. Deriving
 * it here would report the verdict and call it the outcome.
 */
function emitPreviewed(
  context: CommandContext,
  operationKey: string,
  outcome: TaskCommandPreviewedOutcome,
  match: {
    readonly candidateCount: number;
    readonly topScore: number;
    readonly margin: number;
    readonly evidence: readonly (readonly TaskMatchEvidence[])[];
    readonly oneStep: boolean;
    readonly requiresConfirmation: boolean;
  },
): void {
  emit(
    context,
    "task_command_previewed",
    `${operationKey}:${outcome}`,
    buildTaskCommandPreviewedProperties({
      origin: context.origin,
      outcome,
      ...match,
    }) as unknown as Record<string, unknown>,
  );
}

function resolved(
  partial: Partial<TaskCommandConsoleState> & { heading: string; detail: string },
): TaskCommandConsoleState {
  return {
    ...idleTaskCommandState,
    ...partial,
    status: "resolved",
    // The announcement defaults to the heading and the detail together, which
    // is what a screen reader user needs to hear: the outcome and why. A caller
    // overrides it only when the visual text alone would be ambiguous read
    // aloud.
    announcement: partial.announcement ?? `${partial.heading}. ${partial.detail}`,
  };
}

const localeSchema = z.enum(locales);
const originSchema = z.enum(TASK_COMMAND_ORIGINS);

/**
 * The command text is bounded here as well as inside the provider.
 *
 * Not a second opinion: the provider refuses an oversized input before it is
 * billed, and this refuses it before a Supabase round trip. The ceiling is
 * deliberately generous — `MAX_COMMAND_TEXT_LENGTH` is the real bound and this
 * only stops a multi-megabyte form field from being read into memory.
 */
const commandTextSchema = z.string().max(4000);

function copyFor(locale: Locale): TaskCommandCopy {
  return getTaskCommandCopy(locale);
}

function parseLocale(formData: FormData): Locale {
  const parsed = localeSchema.safeParse(formData.get("locale"));
  return parsed.success ? parsed.data : "pt-BR";
}

function parseOrigin(formData: FormData): TaskCommandOrigin {
  const parsed = originSchema.safeParse(formData.get("origin"));
  return parsed.success ? parsed.data : "chat";
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

type CommandContext = {
  readonly supabase: Awaited<ReturnType<typeof requireUser>>["supabase"];
  readonly userId: string;
  readonly locale: Locale;
  readonly timeZone: string;
  readonly origin: TaskCommandOrigin;
  readonly copy: TaskCommandCopy;
};

/**
 * Authenticates and reads the caller's own timezone (2E-I18N-002).
 *
 * The same read `work-projection.ts:110-116` performs, with the same fallback.
 * It is a separate round trip rather than a join because the command path may
 * not touch `profiles` again, and a zone this process guessed would silently
 * change what every relative date in the command means.
 */
async function loadCommandContext(formData: FormData): Promise<CommandContext> {
  const locale = parseLocale(formData);
  const { supabase, user } = await requireUser(locale);
  const profile = await supabase
    .from("profiles")
    .select("timezone")
    .eq("user_id", user.id)
    .maybeSingle();
  const candidate = profile.data?.timezone;
  return {
    supabase,
    userId: user.id,
    locale,
    timeZone: isValidTimeZone(candidate) ? candidate : defaultAgentPreferences.timezone,
    origin: parseOrigin(formData),
    copy: copyFor(locale),
  };
}

/**
 * Records a product event without ever failing the user's action
 * (2E-ANALYTICS-004).
 *
 * Inside `after()` so it never adds latency to the response, and swallowing its
 * own rejection so a telemetry outage cannot turn an applied change into an
 * error message. The idempotency key is derived from the operation key plus the
 * event name, so a double-submit records one event rather than two.
 */
function emit(
  context: Pick<CommandContext, "locale">,
  name: ProductEventName,
  scope: string,
  properties: Record<string, unknown>,
): void {
  after(() => {
    recordProductEvent({
      name,
      surface: "task_command",
      locale: context.locale,
      viewportClass: "unknown",
      appVersion: "server",
      idempotencyKey: createProductEventIdempotencyKey(name, scope),
      properties,
    }).catch(() => {});
  });
}

/**
 * Maps a thrown precondition fault onto a rendered state (2E-UX-002).
 *
 * Every module this file calls signals a caller defect by throwing —
 * `creation.ts:192`, `confirmation.ts:112`, `apply.ts:132,181`,
 * `candidates.ts:222,229`, `matching.ts` and `preview.ts` all do. Left
 * uncaught, one of them escapes the Server Action, React renders the error
 * boundary, and the user's pending command is gone with no way back. None of
 * these is a product outcome, so all of them resolve to the same honest
 * sentence — but the command is *rendered as failed and retryable* rather than
 * dropped.
 *
 * The thrown value is deliberately not echoed. `TaskCandidateQueryError`
 * carries a column path and `TaskCommandApplyError` a bound; neither is
 * something to put in front of a user, and both are already the message of a
 * server-side throw that logging will capture.
 */
function guard(
  error: unknown,
  copy: TaskCommandCopy,
  session: TaskCommandSession | null,
): TaskCommandConsoleState {
  const known =
    error instanceof TaskCommandApplyError
    || error instanceof TaskCandidateQueryError
    || error instanceof TaskMatchInputError
    || error instanceof TaskPreviewInputError;
  if (!known) throw error;
  return resolved({
    heading: copy.outcomes.refused.title,
    detail: copy.outcomes.refused.description,
    reason: copy.console.unexpected,
    session: session === null ? null : serializeTaskCommandSession(session),
    retryable: true,
  });
}

/** The presentation of a preview, keyed on its disposition rather than an outcome. */
function presentPreview(
  context: CommandContext,
  session: TaskCommandSession,
  preview: TaskCommandPreview,
): TaskCommandConsoleState {
  const { copy } = context;
  // `previewed` is a `TASK_COMMAND_PREVIEW_DISPOSITIONS` member that
  // `TASK_COMMAND_OUTCOMES` deliberately excludes (`outcomes.ts:53-67`): a
  // preview waiting for the user has not come to rest. It therefore has no
  // `copy.outcomes` row and must be titled from `copy.dispositions`, which is
  // exactly what `preview.copy` already carries.
  const control: TaskCommandControl =
    preview.disposition === "previewed"
      ? "apply"
      : preview.disposition === "matched_requires_confirmation"
        ? "confirm"
        : "none";
  return resolved({
    heading: preview.copy.title,
    detail: preview.copy.description,
    reason: preview.refusal === null ? null : copy.refusals[preview.refusal].description,
    session: serializeTaskCommandSession(session),
    preview,
    control,
    // A stale preview is retryable by construction: the state moved, and the
    // fresh preview rendered alongside this message is what to act on.
    retryable: preview.disposition === "rejected_stale",
    terminal: preview.disposition === "no_change" || preview.disposition === "refused",
  });
}

type MatchRound = {
  readonly session: TaskCommandSession;
  readonly state: TaskCommandConsoleState;
};

/**
 * Parse-free: derive, list, rank, and present. Shared by every entry point.
 *
 * `selectedTaskId` is honoured when the caller has one (an explicit
 * disambiguation choice); otherwise the top-ranked candidate is previewed,
 * which is only reached for a `matched`/`matched_requires_confirmation`
 * outcome where the matcher has already decided there is no competition.
 */
async function runCommandRound(
  context: CommandContext,
  session: TaskCommandSession,
  options: { readonly selectedTaskId?: string } = {},
): Promise<MatchRound> {
  const { copy, timeZone, locale } = context;
  const derived = deriveTaskCommand(session, timeZone);
  if (derived.status === "unsupported") {
    return {
      session,
      state: resolved({
        heading: copy.outcomes.unsupported.title,
        detail: copy.outcomes.unsupported.description,
        reason:
          copy.unsupportedReasons[derived.reason as keyof typeof copy.unsupportedReasons]
          ?? copy.outcomes.unsupported.description,
        terminal: true,
      }),
    };
  }
  if (derived.status !== "ok") {
    // `invalid` and `needs_clarification` both mean the proposal cannot be
    // acted on as it stands. The second is not routed to the bounded
    // clarification flow, which belongs to a *no-match*: this is a temporal
    // phrase outside the lexicon (2E-COMMAND-016), and the honest answer is to
    // ask the user to say the date differently.
    const reason =
      derived.status === "invalid"
        ? copy.validation[derived.reason as keyof typeof copy.validation]
        : copy.validation.unrecognized_value;
    return {
      session,
      state: resolved({
        heading: copy.outcomes.refused.title,
        detail: copy.outcomes.refused.description,
        reason: reason ?? copy.console.unexpected,
        retryable: true,
        terminal: false,
      }),
    };
  }

  const command = derived.command;
  const rows = await loadTaskCandidates({
    client: context.supabase,
    command,
    ownerId: context.userId,
    // The pinned instant. Every step of one operation key sends the same value,
    // so the RPC echoes back the same `observed_before` and the fingerprint is
    // stable across the whole round trip.
    now: session.issuedAt,
  });
  const result = rankTaskCandidates({
    command,
    rows,
    ownerId: context.userId,
    now: session.issuedAt,
    timeZone,
  });

  const report = (outcome: TaskCommandPreviewedOutcome) =>
    emitPreviewed(context, command.operationKey, outcome, {
      candidateCount: result.candidates.length,
      topScore: result.topScore,
      margin: result.margin,
      evidence: result.candidates.map((candidate) => candidate.evidence),
      oneStep: result.oneStep,
      requiresConfirmation: result.requiresConfirmation,
    });

  if (result.outcome === "ambiguous" || result.outcome === "ambiguous_overflow") {
    report(result.outcome);
    const view = buildTaskDisambiguation({ result, locale, timeZone });
    return {
      session,
      state: resolved({
        heading: view.copy.title,
        detail: view.copy.description,
        session: serializeTaskCommandSession(session),
        disambiguation: view,
        // `confirm_one` must never render as a radiogroup of one
        // (2E-MATCH-012); the component branches on `view.kind`, and both kinds
        // resolve to the same control because both end in an explicit choice.
        control: "choose",
      }),
    };
  }

  if (result.outcome === "unmatched") {
    // Reported by `noMatchRound`, which is where the outcome is actually
    // decided. Emitting "unmatched" here and the real outcome there would be
    // two events for one round, and 2E-UX-001 has no `unmatched` member —
    // a no-match comes to rest at `creation_offered`, `clarification_requested`
    // or `still_unmatched`.
    return noMatchRound(context, session, report);
  }

  const selectedTaskId = options.selectedTaskId ?? result.candidates[0]?.taskId;
  if (selectedTaskId === undefined) {
    // A `matched` outcome with no candidate is not reachable through
    // `rankTaskCandidates`; reporting it rather than indexing into an empty
    // array keeps it visible if it ever becomes reachable.
    return {
      session,
      state: resolved({
        heading: copy.outcomes.refused.title,
        detail: copy.outcomes.refused.description,
        reason: copy.console.unexpected,
        retryable: true,
      }),
    };
  }

  const preview = buildTaskCommandPreview({
    command,
    result,
    rows,
    selectedTaskId,
    expected: session.expected,
    locale,
    timeZone,
  });
  // The preview's own disposition, which is the truthful category: a
  // one-step-eligible match rests at `previewed`, and reporting it as
  // `matched_requires_confirmation` would make "how often did a command match
  // in one step" — PRD §18's first question — unanswerable from this event.
  report(preview.disposition);

  // The witness the *rendered* preview observed. Recorded before anything can
  // be applied, so the write path has something to compare against.
  const observed = result.candidates.find((candidate) => candidate.taskId === selectedTaskId);
  const next =
    observed === undefined
      ? session
      : withStalenessWitness(session, {
          taskId: selectedTaskId,
          updatedAt: observed.preState.updatedAt,
        });

  // 2E-DESTRUCTIVE-002/003, and the reason this is here rather than in
  // `confirmTaskCommandAction`: the token has to be bound to the fingerprint of
  // the preview the user is looking at. Minting it at Confirm time would bind
  // it to whatever the envelope said then, so an edited proposal would arrive
  // with a token that matches it — and the guarantee that a changed proposal
  // invalidates prior confirmation would be unreachable in its own flow.
  if (preview.disposition === "matched_requires_confirmation" && observed !== undefined) {
    const issued = await issueTaskCommandConfirmation(context.supabase, {
      preview,
      preState: observed.preState,
      operationKey: command.operationKey,
    });
    if (issued.outcome !== "issued") {
      return { session: next, state: presentFailure(context, next, issued) };
    }
  }

  return { session: next, state: presentPreview(context, next, preview) };
}

function presentFailure(
  context: CommandContext,
  session: TaskCommandSession | null,
  failed: { readonly outcome: TaskCommandOutcome; readonly failure: string; readonly retryable: boolean },
): TaskCommandConsoleState {
  const { copy } = context;
  const outcome = copy.outcomes[failed.outcome] ?? copy.outcomes.refused;
  return resolved({
    heading: outcome.title,
    detail: outcome.description,
    reason: copy.failures[failed.failure as keyof typeof copy.failures] ?? copy.console.unexpected,
    session: session === null ? null : serializeTaskCommandSession(session),
    // Straight from the declared policy, never inferred from the outcome.
    retryable: failed.retryable,
    terminal: !failed.retryable,
  });
}

/** The no-match branch: offer to create, or ask the one bounded question. */
async function noMatchRound(
  context: CommandContext,
  session: TaskCommandSession,
  report: (outcome: TaskCommandPreviewedOutcome) => void,
): Promise<MatchRound> {
  const { copy, timeZone } = context;
  const base = deriveBaseTaskCommand(session, timeZone);
  if (base.status !== "ok") {
    return {
      session,
      state: resolved({
        heading: copy.outcomes.refused.title,
        detail: copy.outcomes.refused.description,
        reason: copy.console.unexpected,
        retryable: true,
      }),
    };
  }

  const initial = decideInitialTaskCommandNoMatch(base.command);

  // Whether the one clarification was spent is derived from the envelope
  // carrying an answer, never from a boolean the client could set.
  if (session.clarification !== null) {
    if (initial.outcome !== "clarification_requested") {
      // An answer arrived for a command that never asked a question. Nothing to
      // continue, and re-running the initial decision would let the slot be
      // spent twice.
      report("still_unmatched");
      return {
        session,
        state: resolved({
          heading: copy.outcomes.still_unmatched.title,
          detail: copy.outcomes.still_unmatched.description,
          terminal: true,
        }),
      };
    }
    const decision = continueTaskCommandNoMatch(initial.continuation, session.clarification);
    if (decision.outcome === "still_unmatched") {
      report("still_unmatched");
      return {
        session,
        state: resolved({
          heading: copy.outcomes.still_unmatched.title,
          detail: copy.outcomes.still_unmatched.description,
          terminal: true,
        }),
      };
    }
    return creationRound(context, session, report);
  }

  if (initial.outcome === "creation_offered") return creationRound(context, session, report);

  report("clarification_requested");
  return {
    session,
    state: resolved({
      heading: copy.outcomes.clarification_requested.title,
      detail: copy.outcomes.clarification_requested.description,
      session: serializeTaskCommandSession(session),
      control: "clarify",
    }),
  };
}

/**
 * Renders the creation preview and issues its confirmation.
 *
 * Same placement rule as the destructive confirmation, for the same reason: the
 * creation confirmation is minted against the fingerprint of the payload being
 * *shown*, so the Create control can only spend a confirmation for the task the
 * user read.
 */
async function creationRound(
  context: CommandContext,
  session: TaskCommandSession,
  report: (outcome: TaskCommandPreviewedOutcome) => void,
): Promise<MatchRound> {
  const derived = deriveTaskCommand(session, context.timeZone);
  if (derived.status !== "ok") {
    return {
      session,
      state: resolved({
        heading: context.copy.outcomes.refused.title,
        detail: context.copy.outcomes.refused.description,
        reason: context.copy.console.unexpected,
        retryable: true,
      }),
    };
  }
  const input = {
    command: derived.command,
    observedBefore: session.issuedAt,
    locale: context.locale,
  };
  const preview = await previewTaskCommandCreation(context.supabase, input);
  if (preview.outcome !== "creation_offered") {
    return { session, state: presentFailure(context, session, preview) };
  }
  const issued = await issueTaskCommandCreationConfirmation(context.supabase, input);
  if (issued.outcome !== "issued") {
    return { session, state: presentFailure(context, session, issued) };
  }
  report("creation_offered");
  return {
    session,
    state: resolved({
      heading: preview.copy.title,
      detail: preview.copy.description,
      session: serializeTaskCommandSession(session),
      creation: preview,
      control: "create",
    }),
  };
}

/* -------------------------------------------------------------------------- */
/* The seven Server Actions                                                    */
/* -------------------------------------------------------------------------- */

/** Step one: read a sentence, and show what it would do. */
export async function startTaskCommand(
  _previous: TaskCommandConsoleState,
  formData: FormData,
): Promise<TaskCommandConsoleState> {
  const context = await loadCommandContext(formData);
  const { copy } = context;

  const text = commandTextSchema.safeParse(formData.get("commandText"));
  if (!text.success) {
    return resolved({
      heading: copy.outcomes.unsupported.title,
      detail: copy.outcomes.unsupported.description,
      reason: copy.provider.command_text_too_long,
      retryable: true,
    });
  }

  const preferences = await context.supabase
    .from("agent_preferences")
    .select("chat_model")
    .eq("user_id", context.userId)
    .maybeSingle();
  // `chat_model` is the route (`AIRoutes` has no command model, and no PRD
  // requirement asks for one). Resolved at the call site, which is what
  // `model-routing.ts` records as the convention after `resolveAIRoutes` was
  // removed for having no production caller.
  const provider = getAIProvider({ model: preferences.data?.chat_model ?? "gpt-5.6-terra" });

  // Minted here, once, and never again for this command. The key is the
  // idempotency identity the RPC namespaces, and the instant is what every
  // later step re-derives from.
  const operationKey = crypto.randomUUID();
  const issuedAt = new Date().toISOString();

  let parsed;
  try {
    parsed = await provider.parseTaskCommand({
      commandText: text.data,
      locale: context.locale,
    });
  } catch (error) {
    if (!(error instanceof TaskCommandProviderError)) throw error;
    // 2E-PROVENANCE-002 applies to a failed call too: "rejecting invalid output
    // must not skip the cost already incurred". A truncated or unparseable
    // response was still billed, and the ledger is written before this returns.
    if (error.billed) {
      await recordAIUsage(context.supabase, {
        operation: "task_command",
        model: error.billed.model,
        userId: context.userId,
        usage: error.billed.usage as never,
      });
    }
    return resolved({
      heading: copy.outcomes.refused.title,
      detail: copy.outcomes.refused.description,
      reason: copy.provider[error.code as TaskCommandProviderErrorCode] ?? copy.console.unexpected,
      retryable: error.code !== "empty_command_text" && error.code !== "command_text_too_long",
    });
  }

  // Before any dependent domain write, without exception (2E-PROVENANCE-002).
  await recordAIUsage(context.supabase, {
    operation: "task_command",
    model: parsed.model,
    userId: context.userId,
    usage: parsed,
  });

  const normalized = normalizeTaskCommandProposal(parsed.proposal, operationKey);
  if (normalized.kind === "invalid") {
    return resolved({
      heading: copy.outcomes.refused.title,
      detail: copy.outcomes.refused.description,
      reason: copy.provider.invalid_model_output,
      retryable: true,
    });
  }
  if (normalized.kind === "unsupported") {
    return resolved({
      heading: copy.outcomes.unsupported.title,
      detail: copy.outcomes.unsupported.description,
      reason: copy.unsupportedReasons[normalized.reason],
      terminal: true,
    });
  }

  const session = createTaskCommandSession({
    proposal: normalized.payload,
    issuedAt,
    model: parsed.model,
    // 2E-COMMAND-012: `ai_usage_events` has no column for either, so both
    // travel on the session and reach the operation the proposal produces.
    promptVersion: parsed.promptVersion || TASK_COMMAND_PROMPT_VERSION,
    strategyVersion: parsed.strategyVersion || TASK_COMMAND_STRATEGY_VERSION,
  });

  try {
    return (await runCommandRound(context, session)).state;
  } catch (error) {
    return guard(error, copy, session);
  }
}

/** The user chose which task they meant (2E-DISAMBIG-002/003). */
export async function selectTaskCommandCandidate(
  _previous: TaskCommandConsoleState,
  formData: FormData,
): Promise<TaskCommandConsoleState> {
  const context = await loadCommandContext(formData);
  const parsedSession = parseTaskCommandSession(formData.get("session"));
  if (parsedSession.status !== "ok") return expiredSession(context);

  const taskId = z.string().uuid().safeParse(formData.get("taskId"));
  if (!taskId.success) return expiredSession(context);

  const rank = z.coerce.number().int().min(0).max(100).safeParse(formData.get("rank"));
  const candidateCount = z.coerce.number().int().min(0).max(100)
    .safeParse(formData.get("candidateCount"));

  const session = withSelectedTask(parsedSession.session, taskId.data);
  try {
    const round = await runCommandRound(context, session, { selectedTaskId: taskId.data });
    emit(
      context,
      "task_command_disambiguated",
      `${session.proposal.operationKey as string}:select`,
      buildTaskCommandDisambiguatedProperties({
        origin: context.origin,
        candidateCount: candidateCount.success ? candidateCount.data : 0,
        // A rank the form did not carry is reported as 0, which the vocabulary
        // defines as "not in the ranked list" — the truthful reading when this
        // process cannot say where the pick sat.
        selectedRank: rank.success ? rank.data : 0,
      }) as unknown as Record<string, unknown>,
    );
    return round.state;
  } catch (error) {
    return guard(error, context.copy, session);
  }
}

/** Applies a preview that needs no separate confirmation step. */
export async function applyTaskCommandAction(
  _previous: TaskCommandConsoleState,
  formData: FormData,
): Promise<TaskCommandConsoleState> {
  return writeRound(formData, "previewed", "direct");
}

/**
 * Applies a destructive preview whose confirmation was minted at render time.
 *
 * There is no token to present and that is deliberate: `apply_task_command`
 * resolves the confirmation itself by `(auth.uid(), operation key)` and
 * requires the digest it derives, so a caller that skipped the issuing render
 * is refused by the database with `2E_CONFIRMATION_REQUIRED` rather than by
 * anything here (ADR-047).
 */
export async function confirmTaskCommandAction(
  _previous: TaskCommandConsoleState,
  formData: FormData,
): Promise<TaskCommandConsoleState> {
  return writeRound(formData, "matched_requires_confirmation", "confirmed");
}

async function writeRound(
  formData: FormData,
  required: "previewed" | "matched_requires_confirmation",
  route: "direct" | "confirmed",
): Promise<TaskCommandConsoleState> {
  const context = await loadCommandContext(formData);
  const parsedSession = parseTaskCommandSession(formData.get("session"));
  if (parsedSession.status !== "ok") return expiredSession(context);

  // The witness is required, not optional. An envelope that reached a write
  // without one is an envelope no server render produced.
  const applicable = requireApplicableSession(parsedSession.session);
  if (applicable === null) return expiredSession(context);

  const session: TaskCommandSession = applicable;
  try {
    const derived = deriveTaskCommand(session, context.timeZone);
    if (derived.status !== "ok") return expiredSession(context);
    const command = derived.command;

    const rows = await loadTaskCandidates({
      client: context.supabase,
      command,
      ownerId: context.userId,
      now: session.issuedAt,
    });
    const result = rankTaskCandidates({
      command,
      rows,
      ownerId: context.userId,
      now: session.issuedAt,
      timeZone: context.timeZone,
    });
    const preview = buildTaskCommandPreview({
      command,
      result,
      rows,
      selectedTaskId: session.selectedTaskId as string,
      // 2E-PREVIEW-006. Carrying it is what turns "the row moved" into a
      // rendered stale outcome instead of a silent recompute-and-apply.
      expected: session.expected,
      locale: context.locale,
      timeZone: context.timeZone,
    });

    if (preview.disposition !== required) {
      // Includes every stale, no-change and refused disposition, and the case
      // where a destructive action arrived on the non-destructive route. The
      // presentation is the preview's own, so the user sees the current truth
      // rather than an error about the one they were holding.
      return presentPreview(context, session, preview);
    }

    const observed = result.candidates.find(
      (candidate) => candidate.taskId === session.selectedTaskId,
    );
    if (observed === undefined) return presentPreview(context, session, preview);

    const applied = await applyTaskCommand(context.supabase, {
      preview,
      preState: observed.preState,
      operationKey: command.operationKey,
    });

    // Already one of 2E-UX-001's twelve on every branch of the union.
    const outcome: TaskCommandOutcome = applied.outcome;
    emit(
      context,
      "task_command_applied",
      `${command.operationKey}:${route}`,
      buildTaskCommandAppliedProperties({
        origin: context.origin,
        outcome,
        route,
        replayed: applied.outcome === "applied" ? applied.replayed : false,
      }) as unknown as Record<string, unknown>,
    );

    if (applied.outcome === "applied") {
      refreshCommandSurfaces(context.locale);
      return resolved({
        heading: context.copy.outcomes.applied.title,
        detail: context.copy.outcomes.applied.description,
        undo: { undoId: applied.undoId, label: context.copy.console.undo },
        terminal: true,
      });
    }
    if (applied.outcome === "no_change") {
      return resolved({
        heading: context.copy.outcomes.no_change.title,
        detail: context.copy.outcomes.no_change.description,
        terminal: true,
      });
    }
    return presentFailure(context, session, applied);
  } catch (error) {
    return guard(error, context.copy, session);
  }
}

/** The one bounded clarification (2E-NOMATCH-008). */
export async function clarifyTaskCommand(
  _previous: TaskCommandConsoleState,
  formData: FormData,
): Promise<TaskCommandConsoleState> {
  const context = await loadCommandContext(formData);
  const parsedSession = parseTaskCommandSession(formData.get("session"));
  if (parsedSession.status !== "ok") return expiredSession(context);
  if (parsedSession.session.clarification !== null) {
    // The slot is already spent. Refusing here rather than merging again is
    // what makes "re-matched exactly once" a property of the envelope.
    return resolved({
      heading: context.copy.outcomes.still_unmatched.title,
      detail: context.copy.outcomes.still_unmatched.description,
      terminal: true,
    });
  }

  const answer = commandTextSchema.safeParse(formData.get("clarification"));
  if (!answer.success) return expiredSession(context);

  // Free text becomes bounded title hints, deterministically and without a
  // model: split on whitespace, drop empties, cap each word and the count at
  // the schema's own limits. A second model call to "understand" the answer
  // would be a second chance for the model to change the command.
  const titleWords = answer.data
    .split(/\s+/u)
    .map((word) => word.trim().slice(0, MAX_HINT_LENGTH))
    .filter((word) => word !== "")
    .slice(0, MAX_TITLE_WORDS);
  if (titleWords.length === 0) {
    return resolved({
      heading: context.copy.outcomes.clarification_requested.title,
      detail: context.copy.outcomes.clarification_requested.description,
      session: serializeTaskCommandSession(parsedSession.session),
      control: "clarify",
    });
  }

  const session = withClarification(parsedSession.session, { titleWords });
  try {
    return (await runCommandRound(context, session)).state;
  } catch (error) {
    return guard(error, context.copy, session);
  }
}

/** Creates the standalone task the no-match branch offered (2E-NOMATCH-004/005). */
export async function createTaskFromCommand(
  _previous: TaskCommandConsoleState,
  formData: FormData,
): Promise<TaskCommandConsoleState> {
  const context = await loadCommandContext(formData);
  const parsedSession = parseTaskCommandSession(formData.get("session"));
  if (parsedSession.status !== "ok") return expiredSession(context);
  const session = parsedSession.session;

  try {
    const derived = deriveTaskCommand(session, context.timeZone);
    if (derived.status !== "ok") return expiredSession(context);

    const created = await createTaskCommand(context.supabase, {
      command: derived.command,
      observedBefore: session.issuedAt,
      locale: context.locale,
    });
    if (created.outcome !== "applied") return presentFailure(context, session, created);
    refreshCommandSurfaces(context.locale);

    emit(
      context,
      "task_command_applied",
      `${derived.command.operationKey}:created`,
      buildTaskCommandAppliedProperties({
        origin: context.origin,
        outcome: "applied",
        route: "created",
        replayed: created.replayed,
      }) as unknown as Record<string, unknown>,
    );

    return resolved({
      heading: context.copy.outcomes.applied.title,
      detail: context.copy.outcomes.applied.description,
      undo: { undoId: created.undoId, label: context.copy.console.undo },
      terminal: true,
    });
  } catch (error) {
    return guard(error, context.copy, session);
  }
}

/**
 * Undo, with the operation re-read before the router is called
 * (2E-UNDO-005/006/007).
 *
 * The re-read is what makes "expired" and "no longer available" distinct
 * localized outcomes without widening the SQL error vocabulary: the router
 * reports both as `P0001` with message text and no detail token, and this
 * repository's mapper keys on the token and never on the message.
 */
export async function undoTaskCommand(
  _previous: TaskCommandConsoleState,
  formData: FormData,
): Promise<TaskCommandConsoleState> {
  const context = await loadCommandContext(formData);
  const undoId = z.string().uuid().safeParse(formData.get("undoId"));
  if (!undoId.success) return expiredSession(context);

  const now = new Date().toISOString();
  const operation = await loadTaskCommandUndoOperation(context.supabase, {
    undoId: undoId.data,
    now,
  });
  // Null covers "not yours", "does not exist" and "not a Phase 2E operation" —
  // one answer, because 2E-OWNERSHIP-002 requires the first two to be
  // indistinguishable.
  if (operation === null) {
    return undoResult(context, undoId.data, "unavailable", context.copy.undoStates.unavailable);
  }
  if (operation.state !== "available") {
    return undoResult(
      context,
      undoId.data,
      operation.state,
      context.copy.undoStates[operation.state],
    );
  }

  const { error } = await context.supabase.rpc("undo_operation", { p_undo_id: undoId.data });
  if (error) {
    const failure = context.copy.failures;
    return undoResult(
      context,
      undoId.data,
      "refused",
      {
        title: context.copy.outcomes.refused.title,
        description: context.copy.outcomes.refused.description,
      },
      failure[error.code === "55P03" ? "2E_CREATION_UNDONE" : "undeclared_failure"],
    );
  }

  refreshCommandSurfaces(context.locale);
  return undoResult(context, undoId.data, "undone", {
    title: context.copy.console.undone,
    description: context.copy.undoStates.available.description,
  });
}

function undoResult(
  context: CommandContext,
  undoId: string,
  result: TaskCommandUndoResult,
  copy: { readonly title: string; readonly description: string },
  reason?: string,
): TaskCommandConsoleState {
  emit(
    context,
    "task_command_undone",
    // Keyed on the operation and its result rather than on a clock bucket: the
    // undo of one operation is one event, and a user who clicks twice should
    // not produce two.
    `${undoId}:${result}`,
    buildTaskCommandUndoneProperties({ origin: context.origin, result }) as unknown as Record<string, unknown>,
  );
  return resolved({
    heading: copy.title,
    detail: copy.description,
    reason: reason ?? null,
    terminal: true,
  });
}

/**
 * Refreshes the surfaces a command's write invalidates.
 *
 * Without this the user applies a change, sees "Done", and the task list beside
 * the console still shows the old state until they navigate — which reads as
 * the command having silently failed. Both mounts are revalidated regardless of
 * which one the command came from: a command driven from Chat still changes
 * what the Work page must render, and a `revalidatePath` for a route nobody is
 * looking at costs nothing.
 */
function refreshCommandSurfaces(locale: Locale): void {
  for (const path of ["work", "work/cancelled", "chat", "today", "tasks", "waiting", "inbox"]) {
    revalidatePath(`/${locale}/app/${path}`);
  }
}

function expiredSession(context: CommandContext): TaskCommandConsoleState {
  return resolved({
    heading: context.copy.outcomes.refused.title,
    detail: context.copy.outcomes.refused.description,
    reason: context.copy.console.sessionExpired,
    retryable: true,
  });
}

/**
 * Restores a task from the recovery surface (2E-DESTRUCTIVE-006).
 *
 * **No model call, and the session says so.** The user clicked a specific row,
 * so there is nothing to infer: the command is built deterministically from the
 * title that row rendered, and the session's model, prompt and strategy
 * versions are null because none was involved.
 *
 * It still goes through the whole pipeline rather than calling the RPC
 * directly. The listing already proved the task is the caller's, cancelled and
 * not creation-undone — but the preview is what discloses the linked effects
 * (2E-PREVIEW-003), and `restore_task` re-creates a reminder. Skipping it would
 * make the recovery surface the one door that writes without showing the user
 * what it does, which is the guarantee the whole phase is built on.
 *
 * `restore_task` is not one-step eligible, so the round returns a preview with
 * an Apply control rather than performing the write — restoring a task the user
 * deliberately cancelled deserves the deliberateness cancelling it had.
 */
export async function restoreCancelledTask(
  _previous: TaskCommandConsoleState,
  formData: FormData,
): Promise<TaskCommandConsoleState> {
  const context = await loadCommandContext(formData);
  const taskId = z.string().uuid().safeParse(formData.get("taskId"));
  const title = z.string().min(1).max(240).safeParse(formData.get("taskTitle"));
  if (!taskId.success || !title.success) return expiredSession(context);

  const titleWords = title.data
    .split(/\s+/u)
    .map((word) => word.trim().slice(0, MAX_HINT_LENGTH))
    .filter((word) => word !== "")
    .slice(0, MAX_TITLE_WORDS);

  const session = withSelectedTask(
    createTaskCommandSession({
      proposal: {
        action: "restore_task",
        targetHints: titleWords.length === 0 ? {} : { titleWords },
        patch: {},
        operationKey: crypto.randomUUID(),
      },
      issuedAt: new Date().toISOString(),
    }),
    taskId.data,
  );

  try {
    return (await runCommandRound(context, session, { selectedTaskId: taskId.data })).state;
  } catch (error) {
    return guard(error, context.copy, session);
  }
}

/**
 * The console's single entry point, routing on a declared intent.
 *
 * `useActionState` binds exactly one action to one piece of state, and this
 * flow is one conversation with several steps — so a component with seven
 * `useActionState` hooks would hold seven independent states and the outcome of
 * a Confirm would not replace the preview that produced it.
 *
 * A thin router, deliberately: every branch is one of the seven exported
 * actions, unchanged and independently testable. The intent is validated
 * against a closed list, so an unknown value is refused rather than falling
 * through to whichever branch happened to be last.
 */

export async function runTaskCommand(
  previous: TaskCommandConsoleState,
  formData: FormData,
): Promise<TaskCommandConsoleState> {
  const intent = z.enum(TASK_COMMAND_INTENTS).safeParse(formData.get("intent"));
  if (!intent.success) {
    const locale = parseLocale(formData);
    const copy = copyFor(locale);
    return resolved({
      heading: copy.outcomes.refused.title,
      detail: copy.outcomes.refused.description,
      reason: copy.console.unexpected,
      retryable: true,
    });
  }
  switch (intent.data) {
    case "start":
      return startTaskCommand(previous, formData);
    case "select":
      return selectTaskCommandCandidate(previous, formData);
    case "apply":
      return applyTaskCommandAction(previous, formData);
    case "confirm":
      return confirmTaskCommandAction(previous, formData);
    case "clarify":
      return clarifyTaskCommand(previous, formData);
    case "create":
      return createTaskFromCommand(previous, formData);
    case "undo":
      return undoTaskCommand(previous, formData);
    case "restore":
      return restoreCancelledTask(previous, formData);
  }
}
