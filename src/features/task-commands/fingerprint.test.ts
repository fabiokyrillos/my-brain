import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  TaskCommandFingerprintError,
  buildFingerprintPayload,
  loadTaskCommandFingerprint,
  type TaskCommandFingerprintClient,
} from "./fingerprint";
import { TASK_MATCH_LIMITS, TASK_MATCH_POLICY_VERSION } from "./match-policy";
import {
  describeUnreachableCandidates,
  rankTaskCandidates,
  type TaskCandidateRow,
  type TaskPreState,
} from "./matching";
import type { TaskCommandPreviewDisposition } from "./outcomes";
import { buildTaskCommandPreview, type TaskCommandPreview } from "./preview";
import { validateTaskCommand, type ValidatedTaskCommand } from "./schema";
import {
  TASK_COMMAND_POLICY_VERSION,
  actionPolicy,
  type TaskCommandAction,
  type TaskCommandPatchField,
} from "./taxonomy";

/**
 * PRD 2E-PREVIEW-004 and 2E-IDEMPOTENCY-003.
 *
 * Two contracts are under test and they are deliberately different in kind. The
 * first is behavioural: which seven values are hashed, when the RPC is called at
 * all, and what a malformed answer does. The second is structural: **no module
 * in this directory may hash anything.** Postgres owns the digest, because Slice
 * 2E.4's mutation RPC has to derive the same value to recognize a replay, and a
 * TypeScript implementation would have to agree with `jsonb::text` byte for byte
 * — which it cannot, since jsonb sorts object keys by length and then by bytes
 * while `schema.ts`'s `canonicalize` sorts lexicographically.
 *
 * The structural half reads the directory rather than naming modules, the way
 * `normalizer-divergence.test.ts` does: a guard that names its files stops
 * applying the moment the code moves to a new sibling.
 */

const NOW = "2026-07-25T12:00:00.000Z";
const OBSERVED = "2026-07-25T11:59:00.000Z";
const TIME_ZONE = "America/Sao_Paulo";

const OWNER = "11111111-1111-4111-8111-111111111111";
const TASK_ID = "33333333-3333-4333-8333-333333333333";
const OPERATION_KEY = "aaaaaaaa-1111-4111-8111-111111111111";
const PROJECT_ID = "55555555-5555-4555-8555-555555555555";

const TITLE = "Send the report";
const EXISTING_DUE = "2026-08-01T15:30:00.000Z";

/** A well-formed sha256 hex digest: 64 characters, lowercase. */
const DIGEST = "3b1f0c8a".repeat(8);

type FingerprintArgs = Parameters<TaskCommandFingerprintClient["rpc"]>[1];

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

/**
 * A proposal assembled with its keys in a caller-chosen order.
 *
 * `order: "reversed"` writes the same four keys back to front, and the hints
 * likewise. The command contract canonicalizes both, which is what makes the
 * payload below independent of how the model happened to serialize its answer.
 */
function commandFor(
  action: TaskCommandAction,
  options: { readonly order?: "declared" | "reversed"; readonly patch?: Record<string, string> } = {},
): ValidatedTaskCommand {
  const patch: Record<string, string> = {};
  for (const field of actionPolicy(action).requiredPatchFields) patch[field] = PATCH_VALUES[field];
  Object.assign(patch, options.patch ?? {});

  const hints =
    options.order === "reversed"
      ? { temporalPhrase: "tomorrow", titleWords: ["report"] }
      : { titleWords: ["report"], temporalPhrase: "tomorrow" };
  const proposal =
    options.order === "reversed"
      ? { operationKey: OPERATION_KEY, patch, targetHints: hints, action }
      : { action, targetHints: hints, patch, operationKey: OPERATION_KEY };

  const result = validateTaskCommand(proposal, { now: NOW, timeZone: TIME_ZONE });
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

type Scenario = {
  readonly preview: TaskCommandPreview;
  readonly preState: TaskPreState;
};

/**
 * A real preview, built the way the product builds one.
 *
 * Fixtures go through `validateTaskCommand`, `rankTaskCandidates` and
 * `buildTaskCommandPreview` rather than being hand-written DTOs, so the payload
 * is proven against the shape the preview actually produces — including the
 * canonical patch, which is the value the fingerprint is *about*.
 */
function scenario(input: {
  readonly action: TaskCommandAction;
  readonly order?: "declared" | "reversed";
  readonly patch?: Record<string, string>;
  readonly row?: Partial<TaskCandidateRow>;
  readonly expected?: { readonly taskId: string; readonly updatedAt: string } | null;
}): Scenario {
  const command = commandFor(input.action, { order: input.order, patch: input.patch });
  const rows: readonly TaskCandidateRow[] = [
    taskRow({ status: actionPolicy(input.action).eligibleFrom[0], ...input.row }),
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
      expected: input.expected ?? null,
      locale: "pt-BR",
      timeZone: TIME_ZONE,
    }),
  };
}

function payloadFor(input: Scenario, operationKey = OPERATION_KEY): FingerprintArgs {
  return buildFingerprintPayload({
    preview: input.preview,
    preState: input.preState,
    ownerId: OWNER,
    operationKey,
  });
}

function recordingClient(response: {
  data: unknown;
  error: { message: string; code?: string } | null;
}) {
  const calls: Array<{ fn: string; args: FingerprintArgs }> = [];
  const client: TaskCommandFingerprintClient = {
    rpc(fn, args) {
      calls.push({ fn, args });
      return Promise.resolve(response);
    },
  };
  return { calls, client };
}

/** One reachable fixture per declared disposition, so the gate is proven, not assumed. */
const SHAPES: Record<TaskCommandPreviewDisposition, () => Scenario> = {
  previewed: () => scenario({ action: "complete_task" }),
  matched_requires_confirmation: () => scenario({ action: "cancel_task" }),
  no_change: () => scenario({ action: "clear_due", row: { dueAt: null } }),
  rejected_stale: () =>
    scenario({
      action: "complete_task",
      expected: { taskId: TASK_ID, updatedAt: "2026-07-24T00:00:00.000Z" },
    }),
  refused: () => scenario({ action: "assign_project", row: { projectRefId: null } }),
};

/** The seven arguments `public.task_command_fingerprint` declares. */
const DECLARED_ARGS = [
  "p_observed_before",
  "p_operation_key",
  "p_owner_id",
  "p_patch",
  "p_policy_version",
  "p_pre_state",
  "p_task_id",
];

describe("2E-PREVIEW-004 — the seven hashed values", () => {
  it("sends exactly the declared arguments, and nothing more", () => {
    const payload = payloadFor(scenario({ action: "complete_task" }));

    expect(Object.keys(payload).sort()).toEqual(DECLARED_ARGS);
  });

  it("sources every argument from the caller, the preview or the pre-state", () => {
    const input = scenario({ action: "complete_task" });
    const payload = payloadFor(input);

    expect(payload.p_owner_id).toBe(OWNER);
    expect(payload.p_task_id).toBe(input.preview.task.taskId);
    expect(payload.p_task_id).toBe(TASK_ID);
    expect(payload.p_observed_before).toBe(input.preview.observedBefore);
    expect(payload.p_observed_before).toBe(OBSERVED);
    expect(payload.p_pre_state).toEqual(input.preState);
    expect(payload.p_patch).toEqual(input.preview.canonicalPatch);
    expect(payload.p_policy_version).toBe(input.preview.policyVersion);
    expect(payload.p_operation_key).toBe(OPERATION_KEY);
  });

  it("hashes the observation instant, never the current one", () => {
    // The TOCTOU anchor. Hashing "now" would bind the identity to the moment the
    // fingerprint was taken rather than to the state the preview asserted.
    const payload = payloadFor(scenario({ action: "complete_task" }));

    expect(payload.p_observed_before).toBe(OBSERVED);
    expect(payload.p_observed_before).not.toBe(NOW);
  });

  it("hashes the command policy version, not the match policy version", () => {
    // 2E-PREVIEW-004 says "policy version", singular, and the two answer
    // different questions: the match policy decided *which* task this is about,
    // which `p_task_id` already binds. The match policy version travels in the
    // preview DTO for provenance instead.
    const input = scenario({ action: "complete_task" });
    const payload = payloadFor(input);

    expect(payload.p_policy_version).toBe(TASK_COMMAND_POLICY_VERSION);
    expect(payload.p_policy_version).not.toBe(TASK_MATCH_POLICY_VERSION);
    expect(input.preview.matchPolicyVersion).toBe(TASK_MATCH_POLICY_VERSION);
    expect(Object.keys(payload)).not.toContain("p_match_policy_version");
  });

  it("carries the operation key the caller passed, not one read off the command", () => {
    const other = "bbbbbbbb-2222-4222-8222-222222222222";
    const payload = payloadFor(scenario({ action: "complete_task" }), other);

    expect(payload.p_operation_key).toBe(other);
    expect(payload.p_operation_key).not.toBe(OPERATION_KEY);
  });

  it("carries every instant as text, so no session timezone can change the digest", () => {
    // `to_jsonb(timestamptz)` renders through the session's TimeZone GUC, which
    // `set search_path = ''` does not pin — a timestamp crossing the boundary as
    // a typed value would hash differently for two callers in two zones.
    const input = scenario({ action: "reschedule_due", row: { dueAt: EXISTING_DUE } });
    const payload = payloadFor(input);
    const preState = payload.p_pre_state as Record<string, unknown>;

    expect(typeof payload.p_observed_before).toBe("string");
    expect(typeof preState.updatedAt).toBe("string");
    expect(typeof preState.dueAt).toBe("string");
    for (const value of Object.values(payload)) {
      expect(value).not.toBeInstanceOf(Date);
    }
  });

  it("changes when the patch changes, so two different requests cannot share an identity", () => {
    const renameA = payloadFor(scenario({ action: "rename_task", patch: { title: "Alpha" } }));
    const renameB = payloadFor(scenario({ action: "rename_task", patch: { title: "Beta" } }));

    expect(renameA.p_patch).not.toEqual(renameB.p_patch);
  });

  it("hashes the resolved relation id rather than the words the user typed", () => {
    // What binds the identity is the row Slice 2E.4 will write, not the name the
    // command carried: a project renamed between preview and apply must not
    // silently retarget the assignment, and the replay check has to recognize
    // the same request under the new name.
    // The row carries the resolved project's stored name as well as its id,
    // because SQL never returns one without the other — and the point of the
    // assertion below is that neither the name nor the words the command carried
    // reach the hashed patch.
    const payload = payloadFor(
      scenario({
        action: "assign_project",
        row: { projectRefId: PROJECT_ID, projectRefName: "ACME Corp." },
      }),
    );
    const patch = payload.p_patch as Record<string, unknown>;

    expect(patch.projectId).toBe(PROJECT_ID);
    expect(JSON.stringify(payload.p_patch)).not.toContain("Acme");
  });
});

describe("the observation instant is required, never substituted", () => {
  it("throws rather than hashing a preview that carries no observation instant", () => {
    // `TaskCommandPreview.observedBefore` is nullable, and exactly one shape
    // carries the null: a shell whose match ranked no candidates, so there was no
    // observation to report. That shape is never fingerprintable — the
    // disposition gate below returns null for it — so this is unreachable, and
    // unreachable is why it is a throw.
    //
    // Substituting anything is the failure worth refusing. The value is hashed and
    // `public.task_command_fingerprint` is `strict`: a null yields null instead of
    // a digest, while an empty string yields a *valid* one over a fabricated
    // instant — and two different requests would then share the identity
    // 2E-UPDATE-006's replay check reads.
    const input = SHAPES.previewed();
    const withoutObservation = {
      preview: { ...input.preview, observedBefore: null },
      preState: input.preState,
      ownerId: OWNER,
      operationKey: OPERATION_KEY,
    };

    expect(() => buildFingerprintPayload(withoutObservation)).toThrow(TaskCommandFingerprintError);
    try {
      buildFingerprintPayload(withoutObservation);
      throw new Error("a payload was built over an instant that was never observed");
    } catch (error) {
      expect(error).toBeInstanceOf(TaskCommandFingerprintError);
      expect((error as TaskCommandFingerprintError).code).toBe("missing_observation");
    }
  });

  it("never sends an empty string in its place", () => {
    // The value the field used to hold. Asserted on the payload rather than only
    // on the throw, because the substitution this refuses would pass every other
    // assertion in this file.
    const payload = payloadFor(SHAPES.previewed());

    expect(payload.p_observed_before).toBe(OBSERVED);
    expect(payload.p_observed_before).not.toBe("");
    expect(payload.p_observed_before).not.toBeNull();
  });

  it("does not reach the payload builder for a disposition with no write ahead of it", async () => {
    // Why the throw above is unreachable in the product: a shell is terminal at
    // preview time, and the loader refuses it before an observation instant is
    // ever read.
    const input = SHAPES.rejected_stale();
    const { calls, client } = recordingClient({ data: DIGEST, error: null });

    await expect(
      loadTaskCommandFingerprint(client, {
        preview: { ...input.preview, observedBefore: null },
        preState: input.preState,
        ownerId: OWNER,
        operationKey: OPERATION_KEY,
      }),
    ).resolves.toBeNull();
    expect(calls).toEqual([]);
  });
});

describe("2E-IDEMPOTENCY-003 — the payload does not depend on key order", () => {
  it("is byte-identical for two proposals whose keys were written in opposite orders", () => {
    const declared = payloadFor(scenario({ action: "reschedule_due", order: "declared" }));
    const reversed = payloadFor(scenario({ action: "reschedule_due", order: "reversed" }));

    expect(JSON.stringify(declared)).toBe(JSON.stringify(reversed));
  });

  it("carries a canonical patch whose keys are sorted with no undefined holes", () => {
    // The property that makes the line above structural rather than lucky: the
    // patch reaching the payload was already canonicalized, so there is no order
    // left for a caller to vary.
    const payload = payloadFor(
      scenario({
        action: "reschedule_due",
        row: { dueAt: null, intentionalNoDue: true, noDueReason: "Waiting on scope" },
      }),
    );
    const patch = payload.p_patch as Record<string, unknown>;
    const keys = Object.keys(patch);

    expect(keys.length).toBeGreaterThan(1);
    expect(keys).toEqual([...keys].sort());
    for (const value of Object.values(patch)) expect(value).not.toBeUndefined();
  });

  it("treats a hand-reordered patch as the same value, because jsonb re-sorts on arrival", () => {
    // Stated precisely, because the assertion is weaker than a byte comparison
    // and deliberately so: this module passes the object through untouched, so a
    // caller who reorders the keys produces different JSON *text*. It is the same
    // jsonb value on arrival, which is what the digest is computed over — and it
    // is why this module does not, and must not, canonicalize a second time.
    const input = scenario({
      action: "reschedule_due",
      row: { dueAt: null, intentionalNoDue: true, noDueReason: "Waiting on scope" },
    });
    const original = payloadFor(input);
    const reorderedPatch = Object.fromEntries(
      Object.entries(original.p_patch as Record<string, unknown>).reverse(),
    );
    const reordered = buildFingerprintPayload({
      preview: { ...input.preview, canonicalPatch: reorderedPatch },
      preState: input.preState,
      ownerId: OWNER,
      operationKey: OPERATION_KEY,
    });

    expect(reordered.p_patch).toEqual(original.p_patch);
    expect(Object.keys(reordered)).toEqual(Object.keys(original));
  });
});

describe("loadTaskCommandFingerprint calls the RPC once, with the declared payload", () => {
  it("passes exactly the arguments buildFingerprintPayload produced", async () => {
    const input = scenario({ action: "complete_task" });
    const { calls, client } = recordingClient({ data: DIGEST, error: null });

    const fingerprint = await loadTaskCommandFingerprint(client, {
      preview: input.preview,
      preState: input.preState,
      ownerId: OWNER,
      operationKey: OPERATION_KEY,
    });

    expect(fingerprint).toBe(DIGEST);
    expect(calls).toHaveLength(1);
    expect(calls[0].fn).toBe("task_command_fingerprint");
    expect(calls[0].args).toEqual(payloadFor(input));
    expect(Object.keys(calls[0].args).sort()).toEqual(DECLARED_ARGS);
  });

  it.each(["previewed", "matched_requires_confirmation"] as const)(
    "fingerprints a %s preview, which still has a write ahead of it",
    async (disposition) => {
      const input = SHAPES[disposition]();
      const { calls, client } = recordingClient({ data: DIGEST, error: null });

      const fingerprint = await loadTaskCommandFingerprint(client, {
        preview: input.preview,
        preState: input.preState,
        ownerId: OWNER,
        operationKey: OPERATION_KEY,
      });

      expect(input.preview.disposition).toBe(disposition);
      expect(fingerprint).toBe(DIGEST);
      expect(calls).toHaveLength(1);
    },
  );

  it.each(["no_change", "rejected_stale", "refused"] as const)(
    "does not fingerprint a %s preview, and does not reach the database to find out",
    async (disposition) => {
      // Terminal at preview time: there is no later write for an identity to
      // bind, and manufacturing one would put a fingerprint over an empty patch
      // into a confirmation token's scope.
      const input = SHAPES[disposition]();
      const { calls, client } = recordingClient({ data: DIGEST, error: null });

      const fingerprint = await loadTaskCommandFingerprint(client, {
        preview: input.preview,
        preState: input.preState,
        ownerId: OWNER,
        operationKey: OPERATION_KEY,
      });

      expect(input.preview.disposition).toBe(disposition);
      expect(fingerprint).toBeNull();
      expect(calls).toEqual([]);
    },
  );
});

describe("a fingerprint is validated, never trusted", () => {
  async function load(response: {
    data: unknown;
    error: { message: string; code?: string } | null;
  }): Promise<string | null> {
    const input = scenario({ action: "complete_task" });
    const { client } = recordingClient(response);
    return loadTaskCommandFingerprint(client, {
      preview: input.preview,
      preState: input.preState,
      ownerId: OWNER,
      operationKey: OPERATION_KEY,
    });
  }

  async function codeOf(response: {
    data: unknown;
    error: { message: string; code?: string } | null;
  }): Promise<string> {
    try {
      await load(response);
    } catch (error) {
      expect(error).toBeInstanceOf(TaskCommandFingerprintError);
      return (error as TaskCommandFingerprintError).code;
    }
    throw new Error("the loader accepted a response it should have refused");
  }

  it("raises rpc_failed when the RPC reports an error with no code", async () => {
    await expect(load({ data: null, error: { message: "boom" } })).rejects.toBeInstanceOf(
      TaskCommandFingerprintError,
    );
    expect(await codeOf({ data: null, error: { message: "boom" } })).toBe("rpc_failed");
  });

  it("passes a Postgres error code through rather than flattening it", async () => {
    expect(await codeOf({ data: null, error: { message: "no function", code: "42883" } })).toBe(
      "42883",
    );
  });

  it("prefers the error over the data when both arrive", async () => {
    // A driver that returned a payload alongside an error would otherwise have
    // its payload stored as a request identity.
    expect(await codeOf({ data: DIGEST, error: { message: "boom" } })).toBe("rpc_failed");
  });

  it.each([
    ["null", null],
    ["a number", 12345],
    ["a boolean", true],
    ["an object", { digest: DIGEST }],
    ["a short digest", DIGEST.slice(0, 63)],
    ["a long digest", `${DIGEST}0`],
    ["an uppercase digest", DIGEST.toUpperCase()],
    ["a 64-character non-hex string", "g".repeat(64)],
    ["an empty string", ""],
  ])("raises invalid_fingerprint for %s", async (_label, data) => {
    // The function is `strict`, so a null argument yields null instead of a hash
    // — and a null reaching a caller that then stores it as a request identity
    // would make two different requests share one fingerprint.
    expect(await codeOf({ data, error: null })).toBe("invalid_fingerprint");
  });

  it("accepts a well-formed lowercase digest", async () => {
    expect(await load({ data: DIGEST, error: null })).toBe(DIGEST);
  });
});

describe("no module in this directory hashes anything (Postgres owns the fingerprint)", () => {
  const FEATURE_DIR = "src/features/task-commands";

  // Enumerated from the directory rather than named, for the reason
  // `normalizer-divergence.test.ts` gives: a guard that names its files stops
  // applying the moment the code it was written for moves to a new sibling.
  const sources = readdirSync(path.resolve(process.cwd(), FEATURE_DIR))
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .sort();

  function source(file: string): string {
    return readFileSync(path.resolve(process.cwd(), FEATURE_DIR, file), "utf8");
  }

  it("has modules to check", () => {
    // Guards the guard: a glob that matched nothing would pass every assertion
    // below without reading a line of code.
    expect(sources.length).toBeGreaterThan(5);
    expect(sources).toContain("fingerprint.ts");
    expect(sources).toContain("preview.ts");
  });

  it.each(sources)("%s imports no crypto primitive", (file) => {
    const text = source(file);

    expect(text).not.toMatch(/from\s+["'](?:node:)?crypto["']/);
    expect(text).not.toMatch(/require\(\s*["'](?:node:)?crypto["']\s*\)/);
    expect(text).not.toContain("node:crypto");
  });

  it.each(sources)("%s computes no digest", (file) => {
    // Matched as calls and as algorithm literals rather than as bare substrings,
    // the way the normalizer guard is: `fingerprint.ts` explains at length *why*
    // it does not hash, and a substring check would forbid the explanation along
    // with the behaviour.
    const text = source(file);

    expect(text).not.toMatch(/createHash\s*\(/);
    expect(text).not.toMatch(/crypto\.subtle/);
    expect(text).not.toMatch(/["']sha256["']/i);
    expect(text).not.toMatch(/\bsha256\s*\(/i);
    expect(text).not.toMatch(/\bdigest\s*\(/);
  });

  it("keeps the digest's shape assertion on the SQL side of the boundary", () => {
    // The only thing this directory may say about sha256 is what a valid one
    // looks like when it comes back — which is validation, not computation.
    const text = source("fingerprint.ts");

    expect(text).toContain("[0-9a-f]{64}");
    expect(text).toContain("task_command_fingerprint");
  });
});
