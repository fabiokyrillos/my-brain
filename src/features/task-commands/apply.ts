/**
 * The data-access half of Phase 2E's mutation: it calls
 * `public.apply_task_command` (migration `202607260058`) and validates what
 * comes back.
 *
 * Deliberately free of `import "server-only"` and of a constructed client, the
 * way `candidates.ts:5-14` and `fingerprint.ts:114-126` are. Slice 2E.1 shipped
 * `AIProvider.parseTaskCommand` inside the server-only provider and had to
 * record "no behavioural test is possible" as a deferral; keeping the Supabase
 * client an injected parameter means the whole path from a preview to the seven
 * declared arguments — and every branch of the error mapper — is exercisable by
 * Vitest without a database and without a network.
 *
 * **This module decides nothing about the mutation.** Eligibility, the canonical
 * patch, the delta and the reminder consequences were decided by the taxonomy and
 * the preview; ownership, staleness, idempotency and the audit trail are decided
 * inside the RPC, where `auth.uid()` in a `WHERE` clause is the entire tenant
 * boundary because a `SECURITY DEFINER` function bypasses RLS. What lives here is
 * the transport: which seven values are sent, how the returned jsonb is
 * validated, and which declared failure an error maps to.
 *
 * **No fingerprint is computed here** (ADR-042, `fingerprint.ts:1-28`). The RPC
 * derives it by calling `public.task_command_fingerprint` with the same seven
 * inputs the preview hashed, so a TypeScript digest would have to agree with
 * `jsonb::text` byte for byte — which it cannot. This module's only obligation
 * towards that identity is the operation key, below.
 */

import { z } from "zod";

import type { Database } from "@/lib/supabase/database.types";

import {
  TASK_COMMAND_FAILURE_POLICY,
  taskCommandErrorDetailFor,
  type TaskCommandApplyFailure,
  type TaskCommandApplyFailureOutcome,
} from "./errors";
import type { TaskPreState } from "./matching";
import type { TaskCommandPreview } from "./preview";
import { TASK_COMMAND_ACTIONS, type TaskCommandAction } from "./taxonomy";

type ApplyArgs = Database["public"]["Functions"]["apply_task_command"]["Args"];

/**
 * The narrowest shape of a Supabase client this needs.
 *
 * `details` is added to `candidates.ts:39-44`'s error shape because the whole
 * failure vocabulary lives there: `PostgrestError` declares it as a required
 * string, so the real client satisfies this, and a test double supplies only the
 * two fields the case under test is about.
 */
export type TaskCommandApplyClient = {
  rpc(
    fn: "apply_task_command",
    args: ApplyArgs,
  ): PromiseLike<{
    data: unknown;
    error: { message: string; code?: string; details?: string } | null;
  }>;
};

/**
 * What the mapper reads off a failed call.
 *
 * Every field optional, following `src/features/tasks/actions.ts:37-43`: this is
 * a local structural type and not `PostgrestError`, so a test can state the one
 * or two fields a case is about without fabricating a `name` and a `hint`.
 * `hint` is absent entirely — the 2C type declares it and never reads it, and a
 * field nothing reads is a field a reader will eventually believe is load-bearing.
 */
export type TaskCommandRpcError = {
  readonly code?: string;
  readonly message?: string;
  readonly details?: string;
};

export class TaskCommandApplyError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "TaskCommandApplyError";
    this.code = code;
  }
}

/**
 * `undo_operations_operation_key_check` bounds the *stored* key at 8..260
 * (`202607170020:81-82`) and the RPC prepends an 11-character
 * `'taskcmd-v1:'` namespace, so the caller's half is bounded at 8..240 exactly as
 * `202607220044:182-190` reserves the difference for `'confirm-v6:'`.
 */
export const TASK_COMMAND_OPERATION_KEY_BOUNDS = { min: 8, max: 240 } as const;

/**
 * The operation key, normalized the way the RPC normalizes it.
 *
 * **This exists because the same key is sent twice and hashed once.** The RPC
 * does `pg_catalog.btrim(p_operation_key)` and then passes the *btrimmed* value
 * to `public.task_command_fingerprint`, while the preview's fingerprint was
 * computed from whatever `buildFingerprintPayload` was handed
 * (`fingerprint.ts:110`). Send an untrimmed key to one and a trimmed key to the
 * other and the two digests differ over nothing: the replay check
 * (2E-UPDATE-006) then reads a stored fingerprint that cannot match, every retry
 * looks like a fresh request, and `2E_IDEMPOTENCY_MISMATCH` is raised against a
 * payload that is in fact identical. Routing both call sites through this one
 * function is what makes that unrepresentable.
 *
 * **Only ASCII spaces are trimmed, and that is not a shortcut.** `btrim(text)`
 * with no second argument removes U+0020 and nothing else — not tabs, not
 * newlines, not U+00A0. `String.prototype.trim()` removes all of them, so a key
 * arriving as `"\tabcdefgh"` would be sent as `"abcdefgh"` while the RPC hashed
 * `"\tabcdefgh"`, reintroducing the exact divergence this function exists to
 * close. The POSIX-class form `202607230047:85-90` forward-fixed is for *free
 * text*; an operation key is not free text, and `btrim` is correct there and
 * therefore correct here.
 *
 * Length is counted in code points, because `pg_catalog.char_length` counts
 * characters: a 240-character key ending in an astral emoji is legal in Postgres
 * and would be 241 by `String.prototype.length`.
 */
export function normalizeTaskCommandOperationKey(operationKey: string): string {
  const normalized = operationKey.replace(/^ +| +$/g, "");
  const { min, max } = TASK_COMMAND_OPERATION_KEY_BOUNDS;
  const length = [...normalized].length;
  if (length < min || length > max) {
    // The RPC refuses this with a bare `22023` regardless, so refusing here is
    // not a second opinion — it is the same rule stated where it costs nothing.
    // Raised rather than mapped to `invalid_payload`: a key this process built is
    // a precondition it violated, not an outcome to show a user.
    throw new TaskCommandApplyError(
      `operation key must be ${min}..${max} characters after trimming, got ${length}`,
      "invalid_operation_key",
    );
  }
  return normalized;
}

/**
 * The five values a resolved command contributes to the request.
 *
 * Declared structurally rather than as `TaskCommandPreview` because a preview is
 * only one of the two things that can produce them. The chat surface resolves a
 * natural-language command into a preview the user reads and then applies;
 * Phase 2F's Work surface resolves a click through the same
 * `list_task_command_candidates` read and applies immediately, with no preview
 * to render — 2F-SURFACE-010's recorded trade. `TaskCommandPreview` satisfies
 * this type, so the chat path is unchanged.
 *
 * These are exactly the values the fingerprint binds, which is why nothing wider
 * is accepted: the request the RPC hashes is provably the request that was
 * resolved.
 */
export type TaskCommandApplySource = {
  readonly task: { readonly taskId: string };
  readonly action: TaskCommandAction;
  readonly canonicalPatch: TaskCommandPreview["canonicalPatch"];
  readonly observedBefore: string | null;
  readonly policyVersion: string;
};

export type TaskCommandApplyInput = {
  /** What is being applied — a preview, or a resolved Work-surface click. */
  readonly source: TaskCommandApplySource;
  /** The pre-state the resolution observed. The RPC's nineteen-key staleness gate. */
  readonly preState: TaskPreState;
  readonly operationKey: string;
};

/**
 * The seven declared arguments, in the shape the RPC expects.
 *
 * **There is no `p_owner_id`.** `task_command_fingerprint` takes the owner as an
 * argument because it is pure and hashes whatever it is given; this RPC derives
 * it from `auth.uid()` and passes it to the fingerprint itself. A caller that
 * could name the owner could name another one, which is why the mutation path
 * does not offer the field at all.
 *
 * `p_observed_before` travels as text and every instant inside `p_pre_state` is
 * already text, for the reason `fingerprint.ts:61-78` records: a typed
 * `timestamptz` renders through the session `TimeZone` GUC that
 * `set search_path = ''` does not pin, so it would hash differently for two
 * callers in two zones. `p_patch` and `p_pre_state` are passed through
 * unmodified — key order is irrelevant on the wire because jsonb re-sorts on
 * arrival, and canonicalizing a second time here is exactly how the value this
 * process sends stops being the value the preview hashed.
 */
export function buildApplyPayload(input: TaskCommandApplyInput): ApplyArgs {
  const { source, preState, operationKey } = input;
  // The same refusal `buildFingerprintPayload` makes, for the same reason: the
  // instant is hashed, and an empty string would yield a *valid* digest over a
  // fabricated observation, so two different requests would share one identity.
  // Unreachable in the product — only a shell whose match ranked no candidates
  // carries the null, and no shell has a write ahead of it — which is why it is a
  // throw rather than a substitution.
  if (source.observedBefore === null) {
    throw new TaskCommandApplyError(
      "an applicable command must carry the instant its pre-state was observed at",
      "missing_observation",
    );
  }
  return {
    p_task_id: source.task.taskId,
    p_action: source.action,
    p_patch: source.canonicalPatch as unknown as ApplyArgs["p_patch"],
    p_pre_state: preState as unknown as ApplyArgs["p_pre_state"],
    p_observed_before: source.observedBefore,
    p_policy_version: source.policyVersion,
    p_operation_key: normalizeTaskCommandOperationKey(operationKey),
  };
}

/** The mutation happened, or an identical earlier one did. */
export type TaskCommandApplied = {
  readonly outcome: "applied";
  readonly taskId: string;
  readonly action: TaskCommandAction;
  readonly undoId: string;
  /**
   * The RPC's `idempotent` flag, under the name 2E-IDEMPOTENCY-004 and
   * `ConfirmTasksState.replayed` both use: "returns the original outcome marked
   * as replayed".
   */
  readonly replayed: boolean;
  readonly requestFingerprint: string;
  readonly remindersCancelled: number;
  readonly reminderCreatedId: string | null;
  readonly undoExpiresAt: string;
};

/**
 * The task already held exactly what the command asked for.
 *
 * Every field beside the identity is pinned to its empty value in the *type*,
 * because 2E-UPDATE-009 requires this outcome to write "no task update, no audit
 * row and no undo row" — so an `undoId` here would be evidence the RPC wrote
 * something it promised not to.
 */
export type TaskCommandNoChange = {
  readonly outcome: "no_change";
  readonly taskId: string;
  readonly action: TaskCommandAction;
  readonly undoId: null;
  readonly replayed: false;
  readonly requestFingerprint: null;
  readonly remindersCancelled: 0;
  readonly reminderCreatedId: null;
  readonly undoExpiresAt: null;
};

export type TaskCommandApplyFailed = {
  readonly outcome: TaskCommandApplyFailureOutcome;
  /** The declared reason, for copy lookup and for logs. Never message text. */
  readonly failure: TaskCommandApplyFailure;
  readonly retryable: boolean;
  /** What the database actually reported, which for `undeclared_failure` is the point. */
  readonly sqlstate: string | null;
};

/**
 * Discriminated on `outcome`, which is 2E-UX-001's own vocabulary rather than a
 * parallel `status` field beside it.
 *
 * A second discriminant was written and rejected: `ConfirmTasksState` carries
 * both `status` and `code` and nothing type-checks their pairing, so
 * `{ status: "success", code: "not_found" }` compiles. Here the three failure
 * outcomes are a union of literals on one member, which TypeScript narrows just
 * as well, and there is only one field for a caller to branch on.
 */
export type TaskCommandApplyResult =
  | TaskCommandApplied
  | TaskCommandNoChange
  | TaskCommandApplyFailed;

const uuidSchema = z.string().uuid();
const fingerprintSchema = z.string().regex(/^[0-9a-f]{64}$/);
const actionSchema = z.enum(TASK_COMMAND_ACTIONS);

/**
 * `undo_expires_at` is checked for presence and nothing more.
 *
 * The RPC renders it with `pg_catalog.to_char(..., 'YYYY-MM-DD"T"HH24:MI:SS.USOF')`
 * rather than `to_jsonb(timestamptz)`, so that the value does not depend on the
 * session `TimeZone` GUC. `OF` emits a whole-hour offset as `+00`, not `+00:00`,
 * which means the result is *not* strict ISO-8601 — and an ISO regex here would
 * reject every legal value the function can produce. Rendering it for a user is
 * the surface's job, against the caller's zone.
 */
const renderedInstantSchema = z.string().min(1);

const appliedSchema = z
  .object({
    outcome: z.literal("applied"),
    task_id: uuidSchema,
    action: actionSchema,
    undo_id: uuidSchema,
    idempotent: z.boolean(),
    request_fingerprint: fingerprintSchema,
    reminders_cancelled: z.number().int().min(0),
    reminder_created_id: uuidSchema.nullable(),
    undo_expires_at: renderedInstantSchema,
  })
  .strict();

const noChangeSchema = z
  .object({
    outcome: z.literal("no_change"),
    task_id: uuidSchema,
    action: actionSchema,
    // Literals, not `.nullable()`: the emptiness is the contract, not an
    // allowance. 2E-UPDATE-009's "writes no undo row" is checkable here, and a
    // future edit that started reserving a key on this path would fail parsing
    // instead of quietly offering an undo control for a write that never happened.
    undo_id: z.null(),
    idempotent: z.literal(false),
    request_fingerprint: z.null(),
    reminders_cancelled: z.literal(0),
    reminder_created_id: z.null(),
    undo_expires_at: z.null(),
  })
  .strict();

const resultSchema = z.discriminatedUnion("outcome", [appliedSchema, noChangeSchema]);

function failure(code: TaskCommandApplyFailure, error: TaskCommandRpcError): TaskCommandApplyFailed {
  const policy = TASK_COMMAND_FAILURE_POLICY[code];
  return {
    outcome: policy.outcome,
    failure: code,
    retryable: policy.retryable,
    // The observed code, not `policy.sqlstate`: for `undeclared_failure` the
    // declared value is null and the observed one is the only clue there is.
    sqlstate: error.code ?? null,
  };
}

/**
 * Maps a failed `apply_task_command` call onto a declared failure.
 *
 * Keyed on `(code, details)` and never on `message`, which is 2E-UPDATE-017: the
 * DETAIL token is the contract and the message is prose that may be reworded.
 * The 2C mapper (`src/features/tasks/actions.ts:542-593`) keys four of its cases
 * on message text and is what this departs from.
 *
 * **Ordering is load-bearing in exactly one place.** The bare-`22023`
 * catch-all must sit *below* the declared `22023` details, or the two
 * invalid-value codes become dead branches and both surface as "this request did
 * not arrive in the expected shape" — which is the mistake trap 14 of the slice
 * brief names against the 2C mapper. Here the detail lookup happens first inside
 * the same branch, so the two cannot be reordered independently.
 *
 * **`55P03` now has two meanings and the detail is what separates them.** The
 * staleness raise still carries none, which is the convention
 * `src/features/agent/actions.ts:221` established for every staleness gate in
 * the repository and which this preserves as the *fallback*. Slice 2E.5 added
 * one detailed raise on that code — `2E_CREATION_UNDONE`, the SQLSTATE PRD
 * 2E-DESTRUCTIVE-008 names by hand — so the token is looked up first. Matching
 * on the code alone, as this did before, would have degraded "that task was
 * deleted, and it cannot be restored" into "the task changed since the preview",
 * which invites a refresh-and-retry that can never succeed.
 */
export function mapTaskCommandApplyError(error: TaskCommandRpcError): TaskCommandApplyFailed {
  if (error.code === "42501") return failure("unauthenticated", error);
  if (error.code === "P0002") return failure("task_not_found", error);

  if (error.code === "55P03") {
    const detail = taskCommandErrorDetailFor("55P03", error.details);
    if (detail !== null) return failure(detail, error);
    return failure("stale_pre_state", error);
  }

  if (error.code === "P0001") {
    const detail = taskCommandErrorDetailFor("P0001", error.details);
    if (detail !== null) return failure(detail, error);
    // A `P0001` with no declared token is one of the undo router's three
    // errcode-less raises — `'Unsupported undo operation'`,
    // `'Undo operation is no longer available'`, `'Undo operation expired'`
    // (`202607250052`) — or something new. None of them is a payload problem, so
    // it falls through rather than being folded onto `invalid_payload`.
    return failure("undeclared_failure", error);
  }

  if (error.code === "22023") {
    const detail = taskCommandErrorDetailFor("22023", error.details);
    if (detail !== null) return failure(detail, error);
    return failure("invalid_payload", error);
  }

  return failure("undeclared_failure", error);
}

/**
 * Validates the returned jsonb rather than trusting it.
 *
 * Every other RPC result in this directory is parsed (`candidates.ts:274-285`,
 * `fingerprint.ts:143-153`), and this one carries the id an undo control is built
 * from and the counts a receipt reports. A malformed payload is a *throw*, not a
 * mapped failure: it means this module and `202607260058` disagree about the
 * contract, which is a deployment fault rather than a product outcome, and
 * reporting it as `refused` would tell a user their command was declined when it
 * may well have committed.
 *
 * The cost of that choice is stated plainly: if the transaction committed and the
 * shape is wrong, the undo id is lost to this process. That is accepted, because
 * the alternative is guessing which fields a result carries. What keeps the two
 * shapes in agreement is `database-types-parity.test.ts` on the signature and the
 * migration's own post-deploy assertions on the body.
 */
function parseApplyResult(data: unknown): TaskCommandApplied | TaskCommandNoChange {
  const parsed = resultSchema.safeParse(data);
  if (!parsed.success) {
    // The offending path travels with the error, for the reason
    // `candidates.ts:276-284` gives: a bare "unexpected shape" against a
    // nine-field result tells whoever is paged nothing, and the likeliest cause
    // is a migration that landed ahead of this code.
    const issue = parsed.error.issues[0];
    const issuePath = (issue?.path ?? []).join(".");
    throw new TaskCommandApplyError(
      `apply_task_command returned an unexpected result shape at ${issuePath || "<root>"}`,
      "invalid_result_shape",
    );
  }
  if (parsed.data.outcome === "no_change") {
    return {
      outcome: "no_change",
      taskId: parsed.data.task_id,
      action: parsed.data.action,
      undoId: null,
      replayed: false,
      requestFingerprint: null,
      remindersCancelled: 0,
      reminderCreatedId: null,
      undoExpiresAt: null,
    };
  }
  return {
    outcome: "applied",
    taskId: parsed.data.task_id,
    action: parsed.data.action,
    undoId: parsed.data.undo_id,
    replayed: parsed.data.idempotent,
    requestFingerprint: parsed.data.request_fingerprint,
    remindersCancelled: parsed.data.reminders_cancelled,
    reminderCreatedId: parsed.data.reminder_created_id,
    undoExpiresAt: parsed.data.undo_expires_at,
  };
}

/**
 * Applies a previewed task command.
 *
 * A refused, stale or conflicting call resolves to a `TaskCommandApplyFailed`
 * rather than rejecting: those are product outcomes 2E-UX-001 declares and a
 * surface has copy for. Only a broken contract — a payload this module cannot
 * parse, an operation key outside its bounds, a preview with no observation —
 * rejects, because none of those is something to tell a user about.
 *
 * `no_change` is likewise a resolved outcome and never an error. The preview
 * decides it authoritatively (2E-UPDATE-009); reaching it here means the task
 * already held exactly what was asked for, and nothing was written.
 */
export async function applyTaskCommand(
  client: TaskCommandApplyClient,
  input: TaskCommandApplyInput,
): Promise<TaskCommandApplyResult> {
  const result = await client.rpc("apply_task_command", buildApplyPayload(input));
  // The error is preferred over the data when both arrive, exactly as
  // `fingerprint.ts:137-142` prefers it: a driver that returned a payload
  // alongside an error would otherwise have that payload read as a committed
  // outcome and its `undo_id` offered as an undo control.
  if (result.error) return mapTaskCommandApplyError(result.error);
  return parseApplyResult(result.data);
}
