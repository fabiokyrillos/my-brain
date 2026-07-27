import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  TASK_COMMAND_OPERATION_KEY_BOUNDS,
  TaskCommandApplyError,
  applyTaskCommand,
  buildApplyPayload,
  mapTaskCommandApplyError,
  normalizeTaskCommandOperationKey,
  type TaskCommandApplyClient,
  type TaskCommandApplyInput,
  type TaskCommandRpcError,
} from "./apply";
import {
  TASK_COMMAND_APPLY_FAILURES,
  TASK_COMMAND_ERROR_DETAILS,
  TASK_COMMAND_FAILURE_POLICY,
  type TaskCommandApplyFailure,
} from "./errors";
import {
  issueTaskCommandConfirmation,
  type TaskCommandConfirmationClient,
} from "./confirmation";
import { buildFingerprintPayload } from "./fingerprint";
import { TASK_MATCH_LIMITS } from "./match-policy";
import {
  describeUnreachableCandidates,
  rankTaskCandidates,
  type TaskCandidateRow,
  type TaskPreState,
} from "./matching";
import { buildTaskCommandPreview, type TaskCommandPreview } from "./preview";
import { validateTaskCommand, type ValidatedTaskCommand } from "./schema";
import {
  TASK_COMMAND_ACTIONS,
  TASK_COMMAND_POLICY_VERSION,
  actionPolicy,
  type TaskCommandAction,
  type TaskCommandPatchField,
} from "./taxonomy";

/**
 * PRD 2E-UPDATE-005/006/009/017, 2E-IDEMPOTENCY-001/004, 2E-OPERATIONS-002.
 *
 * Four contracts are under test and they are different in kind.
 *
 *   1. **The payload.** Which seven values reach `public.apply_task_command`, and
 *      that the owner is not among them.
 *   2. **The operation key.** That one normalization serves the fingerprint call
 *      and the apply call, and that it is `btrim`'s normalization rather than
 *      JavaScript's — the divergence that would silently break replay detection
 *      over nothing but a tab.
 *   3. **The result.** That the returned jsonb is validated rather than trusted,
 *      that the replay flag round-trips, and that `no_change` resolves as an
 *      outcome instead of raising.
 *   4. **The mapper.** That a case exists for **every** declared failure, asserted
 *      by iterating `TASK_COMMAND_APPLY_FAILURES` rather than a key list written
 *      out here. 2E-UPDATE-017 requires exactly that, and a hand-written list is
 *      a second declaration of the vocabulary whose one unreachable failure mode
 *      is the one that matters: a code added to `errors.ts`, given no mapper
 *      branch, and this file's list quietly updated to match.
 *
 * Fixtures go through `validateTaskCommand`, `rankTaskCandidates` and
 * `buildTaskCommandPreview` rather than being hand-written DTOs, the way
 * `fingerprint.test.ts` does: the canonical patch and the observation instant are
 * the values the RPC hashes, so they have to be the ones the preview really
 * produces and not ones this file invented.
 */

const NOW = "2026-07-25T12:00:00.000Z";
const OBSERVED = "2026-07-25T11:59:00.000Z";
const TIME_ZONE = "America/Sao_Paulo";

const OWNER = "11111111-1111-4111-8111-111111111111";
const TASK_ID = "33333333-3333-4333-8333-333333333333";
const UNDO_ID = "44444444-4444-4444-8444-444444444444";
const REMINDER_ID = "66666666-6666-4666-8666-666666666666";
const OPERATION_KEY = "aaaaaaaa-1111-4111-8111-111111111111";

const TITLE = "Send the report";
/** A well-formed sha-256 hex value: 64 characters, lowercase. */
const FINGERPRINT = "3b1f0c8a".repeat(8);
/**
 * `pg_catalog.to_char(..., 'YYYY-MM-DD"T"HH24:MI:SS.USOF')` as the RPC emits it.
 *
 * `OF` renders a whole-hour offset as `+00`, not `+00:00`, so this is deliberately
 * *not* strict ISO-8601. A schema that required ISO here would reject every legal
 * value the function can produce.
 */
const UNDO_EXPIRES_AT = "2026-07-26T12:00:00.000000+00";

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

function commandFor(action: TaskCommandAction): ValidatedTaskCommand {
  const patch: Record<string, string> = {};
  for (const field of actionPolicy(action).requiredPatchFields) patch[field] = PATCH_VALUES[field];

  const result = validateTaskCommand(
    {
      action,
      targetHints: { titleWords: ["report"] },
      patch,
      operationKey: OPERATION_KEY,
    },
    { now: NOW, timeZone: TIME_ZONE },
  );
  if (result.status !== "ok") {
    throw new Error(`fixture command is not valid: ${JSON.stringify(result)}`);
  }
  return result.command;
}

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
    completedAt: status === "completed" ? "2026-07-20T10:00:00.000Z" : null,
    cancelledAt: status === "cancelled" ? "2026-07-20T10:00:00.000Z" : null,
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

type Scenario = { readonly preview: TaskCommandPreview; readonly preState: TaskPreState };

function scenario(
  action: TaskCommandAction = "complete_task",
  overrides: Partial<TaskCandidateRow> = {},
): Scenario {
  const command = commandFor(action);
  const rows: readonly TaskCandidateRow[] = [
    taskRow({ status: actionPolicy(action).eligibleFrom[0], ...overrides }),
  ];
  const unreachable = describeUnreachableCandidates(rows);
  if (unreachable !== null) {
    throw new Error(`fixture rows are not reachable from SQL: ${unreachable}`);
  }

  const result = rankTaskCandidates({ command, rows, ownerId: OWNER, now: NOW, timeZone: TIME_ZONE });
  const candidate = result.candidates[0];
  if (candidate === undefined) throw new Error("fixture produced no candidate to preview");

  return {
    preState: candidate.preState,
    preview: buildTaskCommandPreview({
      command,
      result,
      rows,
      selectedTaskId: TASK_ID,
      expected: null,
      locale: "pt-BR",
      timeZone: TIME_ZONE,
    }),
  };
}

function inputFor(operationKey = OPERATION_KEY, action: TaskCommandAction = "complete_task"): TaskCommandApplyInput {
  const { preview, preState } = scenario(action);
  return { preview, preState, operationKey };
}

type ApplyArgs = Parameters<TaskCommandApplyClient["rpc"]>[1];

function recordingClient(response: {
  data: unknown;
  error: { message: string; code?: string; details?: string } | null;
}) {
  const calls: Array<{ fn: string; args: ApplyArgs }> = [];
  const client: TaskCommandApplyClient = {
    rpc(fn, args) {
      calls.push({ fn, args });
      return Promise.resolve(response);
    },
  };
  return { calls, client };
}

/** The seven arguments `public.apply_task_command` declares, alphabetically. */
const DECLARED_ARGS = [
  "p_action",
  "p_observed_before",
  "p_operation_key",
  "p_patch",
  "p_policy_version",
  "p_pre_state",
  "p_task_id",
];

const APPLIED_RESULT = {
  outcome: "applied",
  task_id: TASK_ID,
  action: "complete_task",
  undo_id: UNDO_ID,
  idempotent: false,
  request_fingerprint: FINGERPRINT,
  reminders_cancelled: 2,
  reminder_created_id: null,
  undo_expires_at: UNDO_EXPIRES_AT,
} as const;

const NO_CHANGE_RESULT = {
  outcome: "no_change",
  task_id: TASK_ID,
  action: "complete_task",
  undo_id: null,
  idempotent: false,
  request_fingerprint: null,
  reminders_cancelled: 0,
  reminder_created_id: null,
  undo_expires_at: null,
} as const;

describe("the seven declared arguments (2E-OPERATIONS-002)", () => {
  it("sends exactly the declared arguments, and nothing more", () => {
    expect(Object.keys(buildApplyPayload(inputFor())).sort()).toEqual(DECLARED_ARGS);
  });

  it("does not send the owner, because the RPC derives it from auth.uid()", () => {
    // `task_command_fingerprint` takes the owner as an argument, being pure. A
    // mutation that accepted one would let a caller name an owner, and inside a
    // `SECURITY DEFINER` function that predicate is the whole tenant boundary.
    const payload: Record<string, unknown> = buildApplyPayload(inputFor());

    expect(Object.keys(payload)).not.toContain("p_owner_id");
    expect(payload.p_owner_id).toBeUndefined();
  });

  it("sources every argument from the preview, the pre-state or the caller", () => {
    const input = inputFor();
    const payload = buildApplyPayload(input);

    expect(payload.p_task_id).toBe(TASK_ID);
    expect(payload.p_task_id).toBe(input.preview.task.taskId);
    expect(payload.p_action).toBe(input.preview.action);
    expect(payload.p_patch).toEqual(input.preview.canonicalPatch);
    expect(payload.p_pre_state).toEqual(input.preState);
    expect(payload.p_observed_before).toBe(OBSERVED);
    expect(payload.p_observed_before).toBe(input.preview.observedBefore);
    expect(payload.p_policy_version).toBe(TASK_COMMAND_POLICY_VERSION);
    expect(payload.p_operation_key).toBe(OPERATION_KEY);
  });

  it("hashes the observation instant, never the current one", () => {
    // The TOCTOU anchor: the RPC's twelve-column gate is evaluated against the
    // state observed at this instant, and the fingerprint binds it.
    const payload = buildApplyPayload(inputFor());

    expect(payload.p_observed_before).toBe(OBSERVED);
    expect(payload.p_observed_before).not.toBe(NOW);
  });

  it("carries every instant as text, so no session timezone can change the request", () => {
    const payload = buildApplyPayload(inputFor());
    const preState = payload.p_pre_state as Record<string, unknown>;

    expect(typeof payload.p_observed_before).toBe("string");
    expect(typeof preState.updatedAt).toBe("string");
    for (const value of Object.values(payload)) expect(value).not.toBeInstanceOf(Date);
  });

  it("refuses a preview that carries no observation instant", () => {
    // The same refusal `buildFingerprintPayload` makes: an empty string would
    // yield a valid digest over a fabricated instant, and two different requests
    // would share the identity 2E-UPDATE-006's replay check reads.
    const input = inputFor();
    const withoutObservation = { ...input, preview: { ...input.preview, observedBefore: null } };

    expect(() => buildApplyPayload(withoutObservation)).toThrow(TaskCommandApplyError);
    try {
      buildApplyPayload(withoutObservation);
      throw new Error("a payload was built over an instant that was never observed");
    } catch (error) {
      expect((error as TaskCommandApplyError).code).toBe("missing_observation");
    }
  });
});

describe("the operation key is normalized once and used twice (2E-IDEMPOTENCY-001)", () => {
  const padded = `  ${OPERATION_KEY}  `;

  it("sends the same key to the fingerprint RPC and to the apply RPC", () => {
    // The whole reason this helper exists. The RPC btrims the key and passes the
    // *btrimmed* value to `public.task_command_fingerprint`, so an untrimmed key
    // sent to one call and a trimmed one to the other produces two digests over
    // one request: the replay check then reads a stored fingerprint that cannot
    // match, every retry looks new, and `2E_IDEMPOTENCY_MISMATCH` is raised
    // against a payload that is in fact identical.
    const input = inputFor(padded);
    const applyPayload = buildApplyPayload(input);
    const fingerprintPayload = buildFingerprintPayload({
      preview: input.preview,
      preState: input.preState,
      ownerId: OWNER,
      operationKey: normalizeTaskCommandOperationKey(padded),
    });

    expect(applyPayload.p_operation_key).toBe(OPERATION_KEY);
    expect(fingerprintPayload.p_operation_key).toBe(applyPayload.p_operation_key);
  });

  it("normalizes inside the fingerprint builder, so a padded key cannot reach the digest", () => {
    // The negative half, so the assertion above is not merely satisfied by both
    // sides happening to receive the same string.
    //
    // An earlier revision of this test asserted the opposite — that passing the
    // padded key straight to `buildFingerprintPayload` produced a *different*
    // value from the apply payload — which documented the divergence as correct
    // and forbade fixing it at the source. An adversarial review found that the
    // two builders really did disagree whenever a caller passed an untrimmed
    // key, and that this test was what protected the disagreement. The
    // normalization now lives inside `buildFingerprintPayload`, so what has to
    // be proven is that the padding is gone rather than that the two differ.
    const input = inputFor(padded);
    const fromPadded = buildFingerprintPayload({
      preview: input.preview,
      preState: input.preState,
      ownerId: OWNER,
      operationKey: padded,
    });

    expect(fromPadded.p_operation_key).toBe(OPERATION_KEY);
    expect(fromPadded.p_operation_key).not.toBe(padded);
    expect(fromPadded.p_operation_key).toBe(buildApplyPayload(input).p_operation_key);
  });

  it("trims ASCII spaces, matching btrim", () => {
    expect(normalizeTaskCommandOperationKey(padded)).toBe(OPERATION_KEY);
    expect(normalizeTaskCommandOperationKey(`${OPERATION_KEY} `)).toBe(OPERATION_KEY);
    expect(normalizeTaskCommandOperationKey(` ${OPERATION_KEY}`)).toBe(OPERATION_KEY);
    expect(normalizeTaskCommandOperationKey(OPERATION_KEY)).toBe(OPERATION_KEY);
  });

  it("trims nothing else, because btrim(text) removes U+0020 alone", () => {
    // `String.prototype.trim()` removes tabs, newlines and U+00A0 as well.
    // `pg_catalog.btrim(p_operation_key)` does not, so trimming them here would
    // send a key the RPC never hashed and reintroduce the exact divergence the
    // helper closes. Each case is a key that stays 8..240 after trimming.
    for (const whitespace of ["\t", "\n", "\r", " ", " "]) {
      const key = `${whitespace}${OPERATION_KEY}${whitespace}`;
      expect(normalizeTaskCommandOperationKey(key), JSON.stringify(whitespace)).toBe(key);
      expect(key.trim()).not.toBe(normalizeTaskCommandOperationKey(key));
    }
  });

  it("keeps interior spaces, which btrim also keeps", () => {
    expect(normalizeTaskCommandOperationKey("  alpha b  charlie  ")).toBe("alpha b  charlie");
  });

  it("refuses a key outside the bound the RPC enforces", () => {
    const { min, max } = TASK_COMMAND_OPERATION_KEY_BOUNDS;
    // 8..240, not 8..260: `undo_operations_operation_key_check` bounds the stored
    // key at 260 and the RPC prepends an 11-character namespace.
    expect(min).toBe(8);
    expect(max).toBe(240);

    for (const key of ["", "short", "a".repeat(min - 1), " ".repeat(20), `  ${"a".repeat(max + 1)}  `]) {
      expect(() => normalizeTaskCommandOperationKey(key), JSON.stringify(key)).toThrow(
        TaskCommandApplyError,
      );
    }
    expect(normalizeTaskCommandOperationKey("a".repeat(min))).toHaveLength(min);
    expect(normalizeTaskCommandOperationKey("a".repeat(max))).toHaveLength(max);
  });

  it("counts code points, the way char_length does", () => {
    const { max } = TASK_COMMAND_OPERATION_KEY_BOUNDS;
    // An astral character is one `char_length` but two UTF-16 code units, so a key
    // Postgres accepts at exactly the bound would be refused by `.length`.
    const key = `${"a".repeat(max - 1)}\u{1f600}`;
    expect(key.length).toBe(max + 1);
    expect([...key]).toHaveLength(max);
    expect(normalizeTaskCommandOperationKey(key)).toBe(key);
  });

  it("refuses before reaching the database", async () => {
    const { calls, client } = recordingClient({ data: APPLIED_RESULT, error: null });

    await expect(applyTaskCommand(client, inputFor("short"))).rejects.toBeInstanceOf(
      TaskCommandApplyError,
    );
    expect(calls).toEqual([]);
  });
});

describe("the applied result (2E-IDEMPOTENCY-004)", () => {
  it("calls the RPC once with the declared payload and returns the outcome", async () => {
    const input = inputFor();
    const { calls, client } = recordingClient({ data: APPLIED_RESULT, error: null });

    const result = await applyTaskCommand(client, input);

    expect(calls).toHaveLength(1);
    expect(calls[0].fn).toBe("apply_task_command");
    expect(calls[0].args).toEqual(buildApplyPayload(input));
    expect(result).toEqual({
      outcome: "applied",
      taskId: TASK_ID,
      action: "complete_task",
      undoId: UNDO_ID,
      replayed: false,
      requestFingerprint: FINGERPRINT,
      remindersCancelled: 2,
      reminderCreatedId: null,
      undoExpiresAt: UNDO_EXPIRES_AT,
    });
  });

  it("round-trips the replay flag in both directions", async () => {
    // 2E-IDEMPOTENCY-004: "A replayed operation returns the original outcome
    // marked as replayed." The RPC calls the field `idempotent`; this is the only
    // place the rename happens, and losing it would present a replay as a fresh
    // write — with an undo control for an operation whose 24-hour window started
    // earlier than the surface thinks.
    for (const idempotent of [false, true]) {
      const { client } = recordingClient({
        data: { ...APPLIED_RESULT, idempotent },
        error: null,
      });
      const result = await applyTaskCommand(client, inputFor());

      expect(result.outcome).toBe("applied");
      if (result.outcome !== "applied") throw new Error("narrowing failed");
      expect(result.replayed).toBe(idempotent);
    }
  });

  it("carries the reminder effects the RPC reported", async () => {
    const { client } = recordingClient({
      data: { ...APPLIED_RESULT, reminders_cancelled: 3, reminder_created_id: REMINDER_ID },
      error: null,
    });

    const result = await applyTaskCommand(client, inputFor());

    if (result.outcome !== "applied") throw new Error("narrowing failed");
    expect(result.remindersCancelled).toBe(3);
    expect(result.reminderCreatedId).toBe(REMINDER_ID);
  });

  it("accepts the offset form to_char actually emits", async () => {
    // `OF` renders a whole-hour offset as `+00`. An ISO-8601 check here would
    // reject every value the RPC produces at UTC.
    for (const rendered of [
      "2026-07-26T12:00:00.000000+00",
      "2026-07-26T09:00:00.000000-03",
      "2026-07-26T12:00:00.000000+05:30",
    ]) {
      const { client } = recordingClient({
        data: { ...APPLIED_RESULT, undo_expires_at: rendered },
        error: null,
      });
      const result = await applyTaskCommand(client, inputFor());

      if (result.outcome !== "applied") throw new Error("narrowing failed");
      expect(result.undoExpiresAt).toBe(rendered);
    }
  });
});

describe("no_change is an outcome, not an error (2E-UPDATE-009)", () => {
  it("resolves rather than rejecting, and reports nothing was written", async () => {
    const { client } = recordingClient({ data: NO_CHANGE_RESULT, error: null });

    const result = await applyTaskCommand(client, inputFor());

    expect(result).toEqual({
      outcome: "no_change",
      taskId: TASK_ID,
      action: "complete_task",
      undoId: null,
      replayed: false,
      requestFingerprint: null,
      remindersCancelled: 0,
      reminderCreatedId: null,
      undoExpiresAt: null,
    });
  });

  it("carries no undo id, because the RPC wrote no undo row", async () => {
    // 2E-UPDATE-009 requires `no_change` to write "no task update, no audit row
    // and no undo row". An undo id here would be evidence of a write the RPC
    // promised not to make, so the schema pins the field to `null` rather than
    // merely allowing it.
    const { client } = recordingClient({
      data: { ...NO_CHANGE_RESULT, undo_id: UNDO_ID },
      error: null,
    });

    await expect(applyTaskCommand(client, inputFor())).rejects.toBeInstanceOf(TaskCommandApplyError);
  });

  it("refuses a no_change that claims a reminder was touched", async () => {
    for (const overrides of [
      { reminders_cancelled: 1 },
      { reminder_created_id: REMINDER_ID },
      { request_fingerprint: FINGERPRINT },
      { idempotent: true },
      { undo_expires_at: UNDO_EXPIRES_AT },
    ]) {
      const { client } = recordingClient({
        data: { ...NO_CHANGE_RESULT, ...overrides },
        error: null,
      });

      await expect(
        applyTaskCommand(client, inputFor()),
        JSON.stringify(overrides),
      ).rejects.toBeInstanceOf(TaskCommandApplyError);
    }
  });
});

describe("the returned jsonb is validated, never trusted", () => {
  async function codeOf(data: unknown): Promise<string> {
    const { client } = recordingClient({ data, error: null });
    try {
      await applyTaskCommand(client, inputFor());
    } catch (error) {
      expect(error).toBeInstanceOf(TaskCommandApplyError);
      return (error as TaskCommandApplyError).code;
    }
    throw new Error("the wrapper accepted a result it should have refused");
  }

  it.each([
    ["null", null],
    ["a string", "applied"],
    ["a number", 1],
    ["an array", [APPLIED_RESULT]],
    ["an unknown outcome", { ...APPLIED_RESULT, outcome: "applied_maybe" }],
    ["a missing outcome", { ...APPLIED_RESULT, outcome: undefined }],
    ["an undeclared action", { ...APPLIED_RESULT, action: "archive_task" }],
    ["a non-uuid task id", { ...APPLIED_RESULT, task_id: "33333333" }],
    ["a non-uuid undo id", { ...APPLIED_RESULT, undo_id: "not-a-uuid" }],
    ["a null undo id on an applied result", { ...APPLIED_RESULT, undo_id: null }],
    ["an uppercase fingerprint", { ...APPLIED_RESULT, request_fingerprint: FINGERPRINT.toUpperCase() }],
    ["a truncated fingerprint", { ...APPLIED_RESULT, request_fingerprint: FINGERPRINT.slice(0, 63) }],
    ["a null fingerprint on an applied result", { ...APPLIED_RESULT, request_fingerprint: null }],
    ["a negative cancellation count", { ...APPLIED_RESULT, reminders_cancelled: -1 }],
    ["a fractional cancellation count", { ...APPLIED_RESULT, reminders_cancelled: 1.5 }],
    ["a stringly-typed cancellation count", { ...APPLIED_RESULT, reminders_cancelled: "2" }],
    ["an empty expiry", { ...APPLIED_RESULT, undo_expires_at: "" }],
    ["a null expiry on an applied result", { ...APPLIED_RESULT, undo_expires_at: null }],
    ["an extra field", { ...APPLIED_RESULT, surface: "chat" }],
  ])("raises invalid_result_shape for %s", async (_label, data) => {
    // A throw rather than a mapped failure: a shape this module cannot parse means
    // it and `202607260058` disagree about the contract, which is a deployment
    // fault. Reporting it as `refused` would tell a user their command was
    // declined when it may well have committed.
    expect(await codeOf(data)).toBe("invalid_result_shape");
  });

  it("names the offending path, so the likely cause is visible", async () => {
    const { client } = recordingClient({
      data: { ...APPLIED_RESULT, reminders_cancelled: "2" },
      error: null,
    });

    await expect(applyTaskCommand(client, inputFor())).rejects.toThrow(/reminders_cancelled/);
  });

  it("prefers the error over the data when both arrive", async () => {
    // A driver returning a payload alongside an error would otherwise have that
    // payload read as a committed outcome and its `undo_id` offered as an undo.
    const { client } = recordingClient({
      data: APPLIED_RESULT,
      error: { message: "boom", code: "55P03" },
    });

    const result = await applyTaskCommand(client, inputFor());

    expect(result.outcome).toBe("rejected_stale");
  });
});

describe("the mapper has a case for every declared failure (2E-UPDATE-017)", () => {
  /**
   * The error the database would send for a declared failure, derived from the
   * policy table rather than written out per case.
   */
  function errorFor(failure: TaskCommandApplyFailure): TaskCommandRpcError {
    const policy = TASK_COMMAND_FAILURE_POLICY[failure];
    if (policy.sqlstate === null) {
      // `undeclared_failure` is not a database code. A `23514` is the concrete
      // thing it stands in for: a table CHECK the RPC did not translate.
      return { code: "23514", message: "new row violates check constraint" };
    }
    const isToken = (TASK_COMMAND_ERROR_DETAILS as readonly string[]).includes(failure);
    return {
      code: policy.sqlstate,
      message: policy.message ?? "validation failed",
      details: isToken ? failure : undefined,
    };
  }

  it.each(TASK_COMMAND_APPLY_FAILURES)("resolves %s", (failure) => {
    const mapped = mapTaskCommandApplyError(errorFor(failure));
    const policy = TASK_COMMAND_FAILURE_POLICY[failure];

    expect(mapped.failure).toBe(failure);
    expect(mapped.outcome).toBe(policy.outcome);
    expect(mapped.retryable).toBe(policy.retryable);
  });

  it("reaches every declared failure, so none is unreachable", () => {
    // The complement of the assertion above: it proves each declared failure is
    // produced by *some* error, and this proves the set of produced failures is
    // the whole declared list rather than a subset that happens to be iterated.
    const reached = TASK_COMMAND_APPLY_FAILURES.map(
      (failure) => mapTaskCommandApplyError(errorFor(failure)).failure,
    );
    expect([...reached].sort()).toEqual([...TASK_COMMAND_APPLY_FAILURES].sort());
  });

  it("reports the SQLSTATE the database actually sent", () => {
    expect(mapTaskCommandApplyError({ code: "23514" }).sqlstate).toBe("23514");
    expect(mapTaskCommandApplyError({ code: "55P03" }).sqlstate).toBe("55P03");
    expect(mapTaskCommandApplyError({}).sqlstate).toBeNull();
  });
});

describe("the mapper keys on (code, details) and nothing else", () => {
  it("puts the bare-22023 catch-all below the declared 22023 details", () => {
    // Ordering is load-bearing here and nowhere else: reversed, the two
    // invalid-value codes become dead branches and both surface as "this request
    // did not arrive in the expected shape" — the mistake the 2C mapper's own
    // ordering comment warns about.
    expect(mapTaskCommandApplyError({ code: "22023", details: "2E_INVALID_RELATION" }).failure).toBe(
      "2E_INVALID_RELATION",
    );
    expect(mapTaskCommandApplyError({ code: "22023", details: "2E_DUE_CONSISTENCY" }).failure).toBe(
      "2E_DUE_CONSISTENCY",
    );
    expect(mapTaskCommandApplyError({ code: "22023" }).failure).toBe("invalid_payload");
    expect(mapTaskCommandApplyError({ code: "22023", details: "" }).failure).toBe("invalid_payload");
  });

  it("does not consult details for 55P03", () => {
    // The RPC's staleness raise carries none, and `src/features/agent/actions.ts`
    // branches on the code alone. A details check here would make a future detail
    // on that raise change the answer.
    expect(mapTaskCommandApplyError({ code: "55P03" }).failure).toBe("stale_pre_state");
    expect(
      mapTaskCommandApplyError({ code: "55P03", details: "2E_TRANSITION_INTEGRITY" }).failure,
    ).toBe("stale_pre_state");
    expect(mapTaskCommandApplyError({ code: "55P03" }).outcome).toBe("rejected_stale");
  });

  it("never keys on message text", () => {
    // 2E-UPDATE-017 forbids a vocabulary built out of message text. Two errors
    // with the same code and detail and different messages must map identically,
    // so rewording a message cannot change a product outcome.
    const withMessage = mapTaskCommandApplyError({
      code: "P0001",
      details: "2E_INELIGIBLE_STATUS",
      message: "Action is not allowed from the current status",
    });
    const reworded = mapTaskCommandApplyError({
      code: "P0001",
      details: "2E_INELIGIBLE_STATUS",
      message: "totally different prose",
    });

    expect(reworded).toEqual(withMessage);
    expect(mapTaskCommandApplyError({ message: "Task not found" }).failure).toBe(
      "undeclared_failure",
    );
  });

  it("refuses a detail arriving under the wrong SQLSTATE", () => {
    // A `P0001` carrying `2E_INVALID_RELATION` is not that failure. Folding it
    // there would report a non-retryable payload problem as one, while a `22023`
    // carrying `2E_TRANSITION_INTEGRITY` would become a retryable conflict and
    // invite an endless retry.
    expect(mapTaskCommandApplyError({ code: "P0001", details: "2E_INVALID_RELATION" }).failure).toBe(
      "undeclared_failure",
    );
    expect(
      mapTaskCommandApplyError({ code: "22023", details: "2E_TRANSITION_INTEGRITY" }).failure,
    ).toBe("invalid_payload");
  });

  it("does not answer for another phase's vocabulary", () => {
    // `2C_*` and `2D_*` are raised by RPCs sharing this database, and
    // `error.details` carries no other discriminator.
    expect(
      mapTaskCommandApplyError({ code: "P0001", details: "2D_IDEMPOTENCY_MISMATCH" }).failure,
    ).toBe("undeclared_failure");
    expect(mapTaskCommandApplyError({ code: "P0001", details: "2C_INVALID_RELATION" }).failure).toBe(
      "undeclared_failure",
    );
  });

  it("does not fold an unrecognized P0001 onto invalid_payload", () => {
    // The undo router's three errcode-less raises reach a caller as a bare
    // `P0001` with no detail (`'Unsupported undo operation'`, `'Undo operation is
    // no longer available'`, `'Undo operation expired'`). None of them is a
    // payload problem, and calling one that would be a false explanation.
    const mapped = mapTaskCommandApplyError({ code: "P0001", message: "Undo operation expired" });

    expect(mapped.failure).toBe("undeclared_failure");
    expect(mapped.retryable).toBe(true);
  });

  it("maps an error with no code at all to the undeclared fallback", () => {
    const mapped = mapTaskCommandApplyError({ message: "fetch failed" });

    expect(mapped.failure).toBe("undeclared_failure");
    expect(mapped.outcome).toBe("refused");
    expect(mapped.retryable).toBe(true);
  });

  it("resolves every failure to an outcome that has copy", () => {
    // Every mapper answer has to be a `TASK_COMMAND_OUTCOMES` member, because the
    // surface titles a failure with `copy.outcomes[result.outcome]` and explains
    // it with `copy.failures[result.failure]`.
    for (const failure of TASK_COMMAND_APPLY_FAILURES) {
      const mapped = mapTaskCommandApplyError(errorForFailure(failure));
      expect(["rejected_stale", "rejected_conflict", "refused"], failure).toContain(mapped.outcome);
    }
  });

  function errorForFailure(failure: TaskCommandApplyFailure): TaskCommandRpcError {
    const policy = TASK_COMMAND_FAILURE_POLICY[failure];
    if (policy.sqlstate === null) return { code: "23514" };
    const isToken = (TASK_COMMAND_ERROR_DETAILS as readonly string[]).includes(failure);
    return { code: policy.sqlstate, details: isToken ? failure : undefined };
  }
});

describe("the canonical patch satisfies the RPC's per-action key contract", () => {
  /**
   * Migration `202607260058`'s taxonomy `case`, read out of its text.
   *
   * This is the one agreement in the slice that no other test can reach. The
   * preview builds the canonical patch and the RPC validates its key set against
   * `allowed_patch_keys`/`required_patch_keys` per action — two artifacts in two
   * languages, and a disagreement surfaces as a bare `22023` on a user's first
   * command with nothing red beforehand. `complete_task` is the sharpest case: it
   * carries `status` even though the destination is read from the taxonomy, and
   * the RPC requires the key precisely because `buildCanonicalPatch` writes it and
   * the fingerprint hashed it — a patch without it hashes a different object than
   * the preview did, so no replay of it could ever match. (The RPC's undo handler
   * used to read the resulting status back out of this key too; since the
   * ten-column guard it reads `after_state -> 'applied_state'` instead.)
   */
  /**
   * The migration holding the CURRENT `public.apply_task_command`.
   *
   * `202607260059` replaced `202607260058`'s definition with `create or replace`,
   * so 0058's text is superseded. Reading the older file left this whole block
   * asserting a taxonomy `case` the database no longer runs — and, worse, left
   * the "both destructive actions are refused" assertion below permanently green
   * against a migration that will always contain the refusal it was written to
   * observe. Whenever a later migration replaces this function again, this
   * constant moves with it.
   */
  const MIGRATION = "supabase/migrations/202607260059_phase_2e_destructive_confirmation.sql";
  const migration = readFileSync(path.resolve(process.cwd(), MIGRATION), "utf8").replace(
    /\r\n/g,
    "\n",
  );

  function keysFor(action: TaskCommandAction): { allowed: string[]; required: string[] } {
    const branch = migration.match(
      new RegExp(`\\n    when '${action}' then\\n([\\s\\S]*?)(?=\\n    when '|\\n    else\\n)`),
    );
    if (!branch) throw new Error(`${MIGRATION} declares no taxonomy branch for ${action}`);
    const read = (name: string): string[] => {
      const declared = branch[1].match(new RegExp(`${name} := array\\[([\\s\\S]*?)\\];`));
      if (!declared) throw new Error(`${action} declares no ${name}`);
      return declared[1]
        .split(",")
        .map((entry) => entry.trim().replace(/^'|'$/g, ""))
        .filter((entry) => entry.length > 0)
        .sort();
    };
    return { allowed: read("allowed_patch_keys"), required: read("required_patch_keys") };
  }

  /** Row overrides that make each action's preview reach a real canonical patch. */
  const ROWS: Partial<Record<TaskCommandAction, Partial<TaskCandidateRow>>> = {
    clear_due: { dueAt: "2026-08-01T15:30:00.000Z" },
    assign_project: { projectRefId: "55555555-5555-4555-8555-555555555555", projectRefName: "Acme" },
    assign_context: { contextRefId: "77777777-7777-4777-8777-777777777777", contextRefName: "Deep Work" },
    assign_person: { personRefId: "88888888-8888-4888-8888-888888888888", personRefName: "Ana" },
    set_waiting_on: { personRefId: "88888888-8888-4888-8888-888888888888", personRefName: "Ana" },
  };

  /**
   * All fifteen. Slice 2E.5 enabled the two the RPC used to refuse, so this list
   * is now the whole taxonomy — and it is written out rather than derived from
   * `TASK_COMMAND_ACTIONS` on purpose: deriving it would make a taxonomy entry
   * silently drop out of coverage the day someone removes it from the RPC.
   */
  const ENABLED: readonly TaskCommandAction[] = [
    "complete_task",
    "reopen_task",
    "set_status",
    "cancel_task",
    "restore_task",
    "rename_task",
    "append_note",
    "reschedule_due",
    "clear_due",
    "set_planned",
    "set_priority",
    "assign_project",
    "assign_context",
    "assign_person",
    "set_waiting_on",
  ];

  it.each(ENABLED)("%s sends only keys the RPC allows, and every key it requires", (action) => {
    const { preview } = scenario(action, ROWS[action] ?? {});
    const { allowed, required } = keysFor(action);
    const sent = Object.keys(preview.canonicalPatch).sort();

    // Guards the fixture: a `refused` or shell preview carries an empty patch and
    // would satisfy the subset check vacuously. Both applicable dispositions are
    // admitted, which is the same pair `buildFingerprintPayload` accepts
    // (`fingerprint.ts:140`) — `cancel_task` is `matched_requires_confirmation`
    // and is no less appliable for it.
    expect(
      ["previewed", "matched_requires_confirmation"],
      `${action} did not produce an applicable preview`,
    ).toContain(preview.disposition);
    for (const key of sent) {
      expect(allowed, `${action} sends ${key}, which the RPC rejects`).toContain(key);
    }
    for (const key of required) {
      expect(sent, `${action} omits ${key}, which the RPC requires`).toContain(key);
    }
  });

  it("requires status on the four actions whose destination the taxonomy decides", () => {
    // The migration admits the key with a single allowed value — the taxonomy's
    // own destination — so it cannot become a second route to a transition another
    // action guards. Refusing it would make these actions unappliable; accepting a
    // patch without it would hash a different object than the preview did.
    const destinations = {
      complete_task: "completed",
      reopen_task: "todo",
      cancel_task: "cancelled",
      restore_task: "todo",
    } as const;
    for (const [action, destination] of Object.entries(destinations)) {
      const typed = action as keyof typeof destinations;
      expect(keysFor(typed), action).toEqual({ allowed: ["status"], required: ["status"] });
      expect(Object.keys(scenario(typed).preview.canonicalPatch), action).toEqual(["status"]);
      expect(scenario(typed).preview.canonicalPatch.status, action).toBe(destination);
    }
  });

  it("enables both destructive actions and retires the token that refused them", () => {
    // Slice 2E.4 asserted the opposite here, against migration 0058. This is the
    // same structural claim in the other direction, and it is the assertion that
    // would have failed had `MIGRATION` been left pointing at the superseded file:
    // 0058 still literally contains `detail = '2E_ACTION_NOT_ENABLED'` and no
    // taxonomy branch for either verb.
    for (const action of ["cancel_task", "restore_task"] as const) {
      expect(() => keysFor(action), action).not.toThrow();
    }
    expect(migration).not.toContain("detail = '2E_ACTION_NOT_ENABLED'");
  });

  it("gates exactly the action PRD §11.2 marks as requiring confirmation", () => {
    // 2E-DESTRUCTIVE-002 and -004 are enforced only inside the RPC, and the gate
    // is keyed on a taxonomy-resolved flag rather than on an action name — so the
    // property worth pinning is that `cancel_task` is the one branch that sets it.
    // `restore_task` deliberately does not: §11.2 marks it "Confirmation: no".
    const gated = [...migration.matchAll(/\n    when '([a-z_]+)' then\n([\s\S]*?)(?=\n    when '|\n    else\n)/g)]
      .filter(([, , body]) => body.includes("action_requires_confirmation := true"))
      .map(([, action]) => action);
    expect(gated).toEqual(["cancel_task"]);

    // And the taxonomy agrees, which is the half a surface reads.
    const declared = TASK_COMMAND_ACTIONS.filter((action) => actionPolicy(action).requiresConfirmation);
    expect([...declared]).toEqual(["cancel_task"]);
  });
});

describe("a failed apply resolves rather than rejecting", () => {
  it("returns the declared failure for every SQLSTATE the RPC can raise", async () => {
    for (const error of [
      { message: "Authentication required", code: "42501" },
      { message: "Task not found", code: "P0002" },
      { message: "Task changed since the preview", code: "55P03" },
      { message: "Task command transition failed", code: "P0001", details: "2E_TRANSITION_INTEGRITY" },
    ]) {
      const { client } = recordingClient({ data: null, error });
      const result = await applyTaskCommand(client, inputFor());

      expect(result.outcome).not.toBe("applied");
      expect(result.outcome).not.toBe("no_change");
    }
  });

  it("still sends the payload, so a refusal is the database's decision", async () => {
    // Nothing here pre-empts the RPC's own checks. Eligibility, ownership and
    // staleness are decided under the row lock, where they are true; deciding any
    // of them here would be a second copy of a rule that can disagree.
    const input = inputFor();
    const { calls, client } = recordingClient({
      data: null,
      error: { message: "Action is not allowed from the current status", code: "P0001", details: "2E_INELIGIBLE_STATUS" },
    });

    const result = await applyTaskCommand(client, input);

    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual(buildApplyPayload(input));
    if (result.outcome === "applied" || result.outcome === "no_change") {
      throw new Error("a refusal was reported as a success");
    }
    expect(result.failure).toBe("2E_INELIGIBLE_STATUS");
    expect(result.retryable).toBe(false);
  });
});

describe("55P03 now means two things, and the DETAIL is what separates them", () => {
  // Slice 2E.4's mapper matched `55P03` on the code alone and documented that its
  // details were "deliberately not consulted". Slice 2E.5 gave that code two
  // declared tokens — PRD 2E-DESTRUCTIVE-008 names the SQLSTATE by hand — so the
  // mapper reads the token first and falls back to staleness. Getting the order
  // wrong is silent: both collisions would be reported as "the task changed since
  // the preview", which invites a refresh-and-retry that can never succeed.

  it("keeps a detail-less 55P03 as staleness, which is the convention every gate follows", () => {
    const mapped = mapTaskCommandApplyError({ code: "55P03", message: "Task changed since the preview" });

    expect(mapped.failure).toBe("stale_pre_state");
    expect(mapped.outcome).toBe("rejected_stale");
    expect(mapped.retryable).toBe(false);
  });

  it("resolves 2E_CREATION_UNDONE rather than degrading it to staleness", () => {
    const mapped = mapTaskCommandApplyError({ code: "55P03", details: "2E_CREATION_UNDONE" });

    expect(mapped.failure).toBe("2E_CREATION_UNDONE");
    expect(mapped.outcome).toBe("refused");
    // The distinction that matters to a user: staleness invites a fresh preview,
    // and this one can never succeed on a retry.
    expect(mapped.retryable).toBe(false);
  });

  it("does not accept a collision token arriving under the wrong SQLSTATE", () => {
    // A `P0001` carrying `2E_CREATION_UNDONE` is not that failure; it is something
    // upstream mislabelling one. The pairing is read from the policy table, so this
    // falls through to the undeclared branch rather than being narrated as a
    // collision.
    const mapped = mapTaskCommandApplyError({ code: "P0001", details: "2E_CREATION_UNDONE" });

    expect(mapped.failure).toBe("undeclared_failure");
  });

  it("maps the confirmation refusal as refused and not retryable", () => {
    // Retryable would be a lie with a cost: the surface would offer "try again"
    // for a command that fails identically until the user confirms afresh.
    const mapped = mapTaskCommandApplyError({
      code: "P0001",
      details: "2E_CONFIRMATION_REQUIRED",
      message: "Destructive action requires server-issued confirmation",
    });

    expect(mapped.failure).toBe("2E_CONFIRMATION_REQUIRED");
    expect(mapped.outcome).toBe("refused");
    expect(mapped.retryable).toBe(false);
  });
});

describe("issuing confirmation sends exactly what the apply will send", () => {
  const CONFIRMATION_KEY = "pgtap-confirmation-key";

  function confirmationClient(response: {
    data: unknown;
    error: { message: string; code?: string; details?: string } | null;
  }) {
    const calls: Array<{ fn: string; args: unknown }> = [];
    const client: TaskCommandConfirmationClient = {
      rpc(fn, args) {
        calls.push({ fn, args });
        return Promise.resolve(response);
      },
    };
    return { calls, client };
  }

  function issued(overrides: Record<string, unknown> = {}) {
    return {
      confirmation_id: "9f1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d",
      task_id: TASK_ID,
      action: "cancel_task",
      request_fingerprint: "a".repeat(64),
      status: "issued",
      replayed: false,
      ...overrides,
    };
  }

  it("sends the identical seven arguments buildApplyPayload produces", async () => {
    // The whole binding rests on this. The RPC derives the digest from these seven
    // values and `apply_task_command` derives it again from its own seven; if the
    // two calls ever sent different values the confirmation would be bound to a
    // digest the apply never computes, and every cancellation would be refused
    // with `2E_CONFIRMATION_REQUIRED` as though the user had never confirmed.
    const input = inputFor(CONFIRMATION_KEY, "cancel_task");
    const { calls, client } = confirmationClient({ data: issued(), error: null });

    await issueTaskCommandConfirmation(client, input);

    expect(calls).toHaveLength(1);
    expect(calls[0].fn).toBe("issue_task_command_confirmation");
    expect(calls[0].args).toEqual(buildApplyPayload(input));
  });

  it("refuses to issue confirmation for an action that requires none", async () => {
    // Not a second opinion on the taxonomy — the RPC refuses it too — but a row no
    // apply can ever consume is a caller bug worth naming where it happens.
    const { calls, client } = confirmationClient({ data: issued(), error: null });

    await expect(
      issueTaskCommandConfirmation(client, inputFor(CONFIRMATION_KEY, "restore_task")),
    ).rejects.toThrow(/does not require confirmation/);
    expect(calls).toHaveLength(0);
  });

  it("reports a spent confirmation as spent rather than as fresh", async () => {
    // Reached by re-issuing after the apply already succeeded. Presenting it as
    // fresh would put a Confirm control in front of a user whose command has
    // already committed.
    const { client } = confirmationClient({
      data: issued({ status: "consumed", replayed: true }),
      error: null,
    });

    const result = await issueTaskCommandConfirmation(client, inputFor(CONFIRMATION_KEY, "cancel_task"));

    if (result.outcome !== "issued") throw new Error("issuance was reported as a failure");
    expect(result.consumed).toBe(true);
    expect(result.replayed).toBe(true);
  });

  it("maps a refusal through the one shared failure vocabulary", async () => {
    // Both calls speak the same codes, so a surface has one set of sentences
    // rather than two that can drift.
    const { client } = confirmationClient({
      data: null,
      error: { message: "Operation key payload mismatch", code: "P0001", details: "2E_IDEMPOTENCY_MISMATCH" },
    });

    const result = await issueTaskCommandConfirmation(client, inputFor(CONFIRMATION_KEY, "cancel_task"));

    if (result.outcome === "issued") throw new Error("a refusal was reported as an issuance");
    expect(result.failure).toBe("2E_IDEMPOTENCY_MISMATCH");
    expect(result.retryable).toBe(false);
  });

  it("throws on a shape it cannot parse, rather than inventing a confirmation", async () => {
    const { client } = confirmationClient({ data: { confirmation_id: "not-a-uuid" }, error: null });

    await expect(
      issueTaskCommandConfirmation(client, inputFor(CONFIRMATION_KEY, "cancel_task")),
    ).rejects.toThrow(/unexpected result shape/);
  });
});
