/**
 * The command session envelope (Epic 2E-G, Slice 2E.7).
 *
 * Phase 2E's conversational flow is multi-step — parse, maybe disambiguate,
 * preview, maybe confirm, apply — and every step after the first needs the same
 * command the first step produced. This module is how that survives the round
 * trip without any of the three unsafe ways of doing it.
 *
 * **Not by re-parsing.** Calling the model again on each step is a second
 * billed call that may legitimately return a *different* command than the one
 * the user was shown, so the user would apply something they never previewed.
 *
 * **Not by carrying the computed preview.** PRD §11.1: "No state is stored in
 * the client as the source of truth. A preview is recomputed server-side and
 * re-fingerprinted on every render."
 *
 * **By re-derivation from a pinned clock.** The envelope carries the model's
 * normalized proposal and the instant the session was issued at; every step
 * re-runs `validateTaskCommand`, `loadTaskCandidates` and `rankTaskCandidates`
 * against that same instant, so all of them recompute the identical command,
 * the identical `observedBefore`, and therefore the identical fingerprint.
 *
 * **`issuedAt` is pinned, and that is the whole point of this module.**
 * `loadTaskCandidates` derives `p_observed_before` from the instant it is given
 * (`candidates.ts:231`) and the RPC echoes it back into every row, from where
 * `buildTaskCommandPreview` carries it into `preview.observedBefore` and
 * `buildApplyPayload` hashes it. Minting a fresh instant per step would change
 * the fingerprint on every step of one operation key, which breaks three things
 * at once: 2E-IDEMPOTENCY-004's replay returns `2E_IDEMPOTENCY_MISMATCH`
 * instead of the original outcome, a double-submit is refused rather than
 * replayed, and a destructive retry can never succeed because the surviving
 * confirmation row is bound to the first attempt's digest.
 *
 * The envelope travels through the browser, so it is untrusted input and is
 * parsed by a schema like any other boundary. Tampering with the proposal buys
 * nothing: the tampered command is re-validated, re-previewed and re-rendered,
 * so the user still sees exactly what they are about to apply, and every
 * ownership and authorization decision is made by the database against
 * `auth.uid()` regardless of what the envelope claims. What tampering must not
 * be able to do is *skip* a check, which is why `expected` is required on the
 * writing paths — see `requireApplicableSession`.
 *
 * Pure and client-free by design: no `server-only`, no Supabase, no clock read.
 * Every branch is exercisable by Vitest, in the shape `apply.ts:5-12` records.
 */

import { z } from "zod";

import { ISO_INSTANT } from "./matching";
import {
  validateTaskCommand,
  type TaskCommandTargetHints,
  type ValidatedTaskCommand,
} from "./schema";
import type { TaskCommandPatchField } from "./taxonomy";

/**
 * Bumped when the envelope's shape changes.
 *
 * An envelope minted by an older deployment is refused rather than
 * best-effort-read: a field this version expects and an older one never wrote
 * would otherwise arrive as `undefined` and be silently defaulted, which is how
 * a missing staleness witness turns into a preview that cannot go stale.
 */
export const TASK_COMMAND_SESSION_VERSION = "2026-08-05.1";

/**
 * What the client believes it is looking at (2E-PREVIEW-006).
 *
 * `updatedAt` is the witness `202607250056` projects for exactly this purpose.
 * It is deliberately *not* the recency signal — that reads `audit_logs`
 * (2E-MATCH-006) — and deliberately not part of the match input.
 */
export type TaskCommandStalenessWitness = {
  readonly taskId: string;
  readonly updatedAt: string;
};

export type TaskCommandSession = {
  readonly version: string;
  /**
   * The model proposal, normalized by `normalizeTaskCommandProposal` and
   * therefore already carrying the server-minted `operationKey`.
   *
   * The key lives here and nowhere else. An envelope with its own copy beside
   * the payload's would be two declarations of one identity, and the two could
   * disagree — at which point the fingerprint the preview hashed and the key
   * the RPC reserved describe different requests.
   */
  readonly proposal: Record<string, unknown>;
  /**
   * True exactly when this session carries a Phase 2G creation intent
   * (2G-ROUTE-001) rather than a mutation proposal.
   *
   * A discriminator, not a payload: for a *qualified* creation the proposal is
   * the synthesized mutation-shaped payload (`action` = the mapped qualifier
   * from `TASK_COMMAND_CREATION_QUALIFIERS`), so `deriveTaskCommand` re-applies
   * every bound, the temporal lexicon and the vocabulary exactly as it does for
   * a mutation; for a *bare* creation the proposal carries only `titleWords`
   * and the operation key. What the flag decides is the route — the creation
   * family, never the matcher — and tampering with it buys nothing: a mutation
   * proposal flagged as a creation must still validate as a task-like
   * creation, and a creation flagged as a mutation re-enters the matcher and
   * simply matches or refuses on its own merits.
   */
  readonly create: boolean;
  /** The pinned clock. ISO-8601 with a timezone designator, always. */
  readonly issuedAt: string;
  /**
   * Provenance for 2E-COMMAND-012 / 2E-PROVENANCE-001. Never a decision input.
   *
   * **Null when no model was involved**, which is a real case rather than a
   * placeholder: the cancelled-task recovery surface builds a `restore_task`
   * command deterministically from a row the user clicked, with no parse and no
   * billed call. 2E-PROVENANCE-001 asks for the model "where a model was
   * involved", and stamping a fabricated id on a command no model produced
   * would make the provenance record a lie in exactly the place it is meant to
   * be trustworthy.
   */
  readonly model: string | null;
  readonly promptVersion: string | null;
  readonly strategyVersion: string | null;
  /** Null until the user has made an explicit selection (2E-DISAMBIG-002). */
  readonly selectedTaskId: string | null;
  /** Null before the first preview render; required by every writing path. */
  readonly expected: TaskCommandStalenessWitness | null;
  /**
   * The one bounded clarification the user supplied, or null.
   *
   * A single optional field rather than a list, so the bound of 2E-NOMATCH-008
   * ("re-matched exactly once") is a property of the shape rather than of a
   * counter a caller could reset. `clarificationUsed` is recomputed from this
   * field's presence server-side and is never carried, because a boolean beside
   * the data it describes is a second source of truth for the same fact.
   */
  readonly clarification: TaskCommandTargetHints | null;
};

const isoInstantSchema = z.string().regex(ISO_INSTANT, "expected ISO-8601 with a zone designator");

/**
 * The clarification is re-validated through the *same* bounded hint rules the
 * command schema applies, not accepted as free text.
 *
 * It arrives from a form field, so without this a clarification could carry a
 * 100 KB string into `targetHints` and past `MAX_TARGET_HINTS_SERIALIZED` — a
 * bound `validateTaskCommand` enforces only over what it is handed.
 */
const clarificationSchema = z
  .object({
    titleWords: z.array(z.string().trim().min(1).max(160)).max(12).optional(),
    project: z.string().trim().min(1).max(160).optional(),
    person: z.string().trim().min(1).max(160).optional(),
    context: z.string().trim().min(1).max(160).optional(),
    status: z.string().trim().min(1).max(160).optional(),
    temporalPhrase: z.string().trim().min(1).max(160).optional(),
  })
  .strict();

export const taskCommandSessionSchema = z
  .object({
    version: z.literal(TASK_COMMAND_SESSION_VERSION),
    // Validated as a record here and as a *command* by `deriveTaskCommand`.
    // Two layers rather than one: the envelope can be well-formed while the
    // command inside it is not, and those are different failures with different
    // copy — `invalid_session` is a defect, `unsupported` is a product outcome.
    proposal: z.record(z.string(), z.unknown()),
    create: z.boolean(),
    issuedAt: isoInstantSchema,
    model: z.string().min(1).max(120).nullable(),
    promptVersion: z.string().min(1).max(60).nullable(),
    strategyVersion: z.string().min(1).max(60).nullable(),
    selectedTaskId: z.string().uuid().nullable(),
    expected: z
      .object({ taskId: z.string().uuid(), updatedAt: z.string().min(1).max(64) })
      .strict()
      .nullable(),
    clarification: clarificationSchema.nullable(),
  })
  .strict();

export type TaskCommandSessionParse =
  | { readonly status: "ok"; readonly session: TaskCommandSession }
  | { readonly status: "invalid"; readonly field: string };

/**
 * Parses an envelope that arrived from a form field.
 *
 * Returns rather than throws: an unreadable envelope is a state the surface has
 * to render (2E-UX-002 forbids silently dropping a pending command), and the
 * only honest thing to say is "start again", which needs a result value rather
 * than an exception escaping a Server Action.
 */
export function parseTaskCommandSession(value: unknown): TaskCommandSessionParse {
  let candidate: unknown = value;
  if (typeof value === "string") {
    try {
      candidate = JSON.parse(value);
    } catch {
      return { status: "invalid", field: "<root>" };
    }
  }
  const parsed = taskCommandSessionSchema.safeParse(candidate);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = (issue?.path ?? []).join(".");
    return { status: "invalid", field: path || "<root>" };
  }
  return { status: "ok", session: parsed.data as TaskCommandSession };
}

/** Serializes for a hidden form field. The inverse of `parseTaskCommandSession`. */
export function serializeTaskCommandSession(session: TaskCommandSession): string {
  return JSON.stringify(session);
}

export type CreateTaskCommandSessionInput = {
  readonly proposal: Record<string, unknown>;
  readonly issuedAt: string;
  /** Omitted entirely when no model produced this command. */
  readonly model?: string | null;
  readonly promptVersion?: string | null;
  readonly strategyVersion?: string | null;
  /** Omitted for mutation sessions; true marks a creation session (2G.2). */
  readonly create?: boolean;
};

export class TaskCommandSessionError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "TaskCommandSessionError";
    this.code = code;
  }
}

export function createTaskCommandSession(
  input: CreateTaskCommandSessionInput,
): TaskCommandSession {
  if (!ISO_INSTANT.test(input.issuedAt)) {
    // A throw rather than a result: this instant is minted by the server one
    // line earlier, so a malformed one is a defect in this process, not an
    // outcome a user can be shown. Letting it through would pin the whole
    // session to a host-dependent instant — the precise hazard
    // `candidates.ts:221-226` refuses one layer down.
    throw new TaskCommandSessionError(
      "a session must be pinned to an ISO-8601 instant with a timezone designator",
      "invalid_clock",
    );
  }
  return {
    version: TASK_COMMAND_SESSION_VERSION,
    proposal: input.proposal,
    create: input.create ?? false,
    issuedAt: input.issuedAt,
    model: input.model ?? null,
    promptVersion: input.promptVersion ?? null,
    strategyVersion: input.strategyVersion ?? null,
    selectedTaskId: null,
    expected: null,
    clarification: null,
  };
}

/** Records an explicit user selection (2E-DISAMBIG-002/003). */
export function withSelectedTask(
  session: TaskCommandSession,
  taskId: string,
): TaskCommandSession {
  // The witness is dropped, not carried over. It describes the task that was
  // previewed, and selecting a *different* task makes it a witness for
  // something this session is no longer about — which would let a stale check
  // pass against a row nobody looked at.
  return {
    ...session,
    selectedTaskId: taskId,
    expected: session.expected?.taskId === taskId ? session.expected : null,
  };
}

/** Records what the render the user is looking at actually observed. */
export function withStalenessWitness(
  session: TaskCommandSession,
  witness: TaskCommandStalenessWitness,
): TaskCommandSession {
  return { ...session, selectedTaskId: witness.taskId, expected: witness };
}

/**
 * `2K-ACT-003` / `2K-ACT-004` — writes one edited parameter into the proposal.
 *
 * ## What this is, and what it deliberately is not
 *
 * It is the same move `withClarification` makes: put one validated value into
 * the envelope and hand the envelope back to `deriveTaskCommand`, which
 * re-runs `validateTaskCommand` over the whole proposal. So an edit adds **no
 * authority** — every bound, the temporal lexicon, the per-action patch
 * vocabulary and the closed target values all apply to an edited value exactly
 * as they apply to a value the model proposed.
 *
 * It is **not** a patch merge. The caller supplies one field and one string;
 * there is no shape here that could accept an object, a nested path or a set of
 * fields, which is OD-2K-1's "never an arbitrary patch, never free-form JSON"
 * expressed as a signature rather than as a rule someone enforces.
 *
 * ## Why the field is typed and the caller still has to ask first
 *
 * The parameter is `TaskCommandPatchField`, so a name outside the vocabulary
 * cannot be passed. That is necessary and not sufficient: whether *this action*
 * admits *this field* is a policy question, and `isEditableParameter` in
 * `conversation-cards/editable-parameters.ts` is where it is asked. This
 * function is the mechanism; that one is the rule.
 *
 * ## What does not change
 *
 * The pinned clock, the staleness witness, the selection, the clarification
 * slot and the operation key. The clock stays pinned because an edit is a step
 * *within* one command, which is exactly the case `issuedAt` exists for — and
 * the opposite of the navigation boundary ADR-100 governs. The operation key
 * stays because an edit re-proposes the same request rather than starting a
 * new one; what changes is the canonical patch, which is a fingerprint input,
 * so an earlier confirmation bound to the pre-edit digest can no longer be
 * consumed. That is `2K-ACT-004`, and it is mechanical rather than remembered.
 */
export function withEditedParameter(
  session: TaskCommandSession,
  field: TaskCommandPatchField,
  value: string,
): TaskCommandSession {
  const proposal = session.proposal;
  const patch = proposal.patch;
  const currentPatch = typeof patch === "object" && patch !== null && !Array.isArray(patch)
    ? (patch as Record<string, unknown>)
    : {};
  // An empty edit clears the field rather than storing `""`. The normalized
  // proposal uses `null` for "not supplied", and a blank string would be a
  // third value for the same absence — which the validator would then have to
  // learn about.
  const next = value.trim() === "" ? null : value;
  return {
    ...session,
    proposal: { ...proposal, patch: { ...currentPatch, [field]: next } },
  };
}

/** Spends the one bounded clarification slot (2E-NOMATCH-008). */
export function withClarification(
  session: TaskCommandSession,
  clarification: TaskCommandTargetHints,
): TaskCommandSession {
  return { ...session, clarification };
}

/**
 * True when the user has already answered the one clarification.
 *
 * Derived, never carried. The envelope holds the clarification itself, so a
 * caller cannot claim the slot is unspent while sending an answer, nor claim it
 * is spent while sending none.
 */
export function clarificationUsed(session: TaskCommandSession): boolean {
  return session.clarification !== null;
}

function mergeClarificationIntoProposal(
  proposal: Record<string, unknown>,
  clarification: TaskCommandTargetHints | null,
): Record<string, unknown> {
  if (clarification === null) return proposal;
  const hints = proposal.targetHints;
  const base = typeof hints === "object" && hints !== null && !Array.isArray(hints)
    ? (hints as Record<string, unknown>)
    : {};
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(clarification)) {
    if (value === undefined) continue;
    merged[key] = value;
  }
  return { ...proposal, targetHints: merged };
}

export type TaskCommandDerivation =
  | { readonly status: "ok"; readonly command: ValidatedTaskCommand }
  | {
      readonly status: "invalid" | "unsupported" | "needs_clarification";
      readonly reason: string;
      readonly field?: string;
    };

/**
 * Re-derives the command this session is about, at the pinned instant.
 *
 * The merge happens at the *payload* level and the result then goes through the
 * real `validateTaskCommand`, rather than merging into an already-validated
 * command. That ordering is deliberate: it re-applies the bounded-hint rules,
 * the canonical key order, the status-term resolution and
 * `MAX_TARGET_HINTS_SERIALIZED` to the merged value, so a clarification cannot
 * carry the command past a bound the first validation enforced.
 *
 * `timeZone` is a parameter and never an envelope field (2E-I18N-002). It is
 * read from `profiles.timezone` server-side by every caller, exactly as
 * `work-projection.ts:110-116` reads it. A client-supplied zone would decide
 * what "next Friday" means, which is a decision the model is already forbidden
 * from making.
 */
export function deriveTaskCommand(
  session: TaskCommandSession,
  timeZone: string,
): TaskCommandDerivation {
  const payload = mergeClarificationIntoProposal(session.proposal, session.clarification);
  const validation = validateTaskCommand(payload, { now: session.issuedAt, timeZone });
  if (validation.status === "ok") return { status: "ok", command: validation.command };
  return {
    status: validation.status,
    reason: validation.reason,
    ...(validation.field === undefined ? {} : { field: validation.field }),
  };
}

/**
 * The base command, with the clarification deliberately excluded.
 *
 * `continueTaskCommandNoMatch` consumes a continuation minted by
 * `decideInitialTaskCommandNoMatch`, and that continuation has to be built from
 * the command *before* the answer was merged — otherwise the clarified command
 * would be handed to the initial decision, which can request a clarification,
 * and the bounded-once guarantee of 2E-NOMATCH-008 would rest on a caller
 * remembering not to ask twice.
 */
export function deriveBaseTaskCommand(
  session: TaskCommandSession,
  timeZone: string,
): TaskCommandDerivation {
  return deriveTaskCommand({ ...session, clarification: null }, timeZone);
}

export type ApplicableTaskCommandSession = TaskCommandSession & {
  readonly selectedTaskId: string;
  readonly expected: TaskCommandStalenessWitness;
};

/**
 * Narrows a session to one a write may proceed from.
 *
 * **The witness is required, and that requirement is load-bearing.** A session
 * that reached a writing path without one is an envelope no server render ever
 * produced — every path that renders a preview calls `withStalenessWitness`.
 * Accepting it would hand `buildTaskCommandPreview` an absent `expected`, which
 * makes 2E-PREVIEW-006 structurally unreachable and turns the apply into the
 * silent recompute-and-apply PRD §12.6 forbids by name. The database's
 * twelve-column gate would still refuse a genuinely stale write, so this is not
 * the only wall — it is the one that lets the user be *told* rather than
 * refused.
 */
export function requireApplicableSession(
  session: TaskCommandSession,
): ApplicableTaskCommandSession | null {
  if (session.selectedTaskId === null || session.expected === null) return null;
  if (session.expected.taskId !== session.selectedTaskId) return null;
  return session as ApplicableTaskCommandSession;
}
