import { describe, expect, it } from "vitest";

import {
  TaskCandidateQueryError,
  loadTaskCandidates,
  type TaskCandidateQueryClient,
} from "./candidates";
import { TASK_MATCH_LIMITS } from "./match-policy";
import { validateTaskCommand, type ValidatedTaskCommand } from "./schema";
import { actionPolicy, type TaskCommandAction } from "./taxonomy";

const NOW = "2026-07-25T12:00:00.000Z";
const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER_OWNER = "22222222-2222-4222-8222-222222222222";

function command(input: {
  action: TaskCommandAction;
  titleWords?: string[];
  project?: string;
  context?: string;
  person?: string;
}): ValidatedTaskCommand {
  const targetHints: Record<string, unknown> = {};
  if (input.titleWords) targetHints.titleWords = input.titleWords;
  if (input.project) targetHints.project = input.project;
  if (input.context) targetHints.context = input.context;
  if (input.person) targetHints.person = input.person;

  const result = validateTaskCommand(
    {
      action: input.action,
      targetHints,
      patch: {},
      operationKey: "aaaaaaaa-1111-4111-8111-111111111111",
    },
    { now: NOW, timeZone: "America/Sao_Paulo" },
  );
  if (result.status !== "ok") throw new Error(`fixture invalid: ${JSON.stringify(result)}`);
  return result.command;
}

function sqlRow(overrides: Record<string, unknown> = {}) {
  return {
    task_id: "33333333-3333-4333-8333-333333333333",
    owner_id: OWNER,
    title: "Send the report",
    status: "todo",
    due_at: null,
    planned_at: null,
    manual_priority: null,
    created_at: "2026-07-01T00:00:00.000Z",
    description: null,
    completed_at: null,
    cancelled_at: null,
    intentional_no_due: false,
    no_due_reason: null,
    updated_at: "2026-07-01T00:00:00.000Z",
    project_ids: ["55555555-5555-4555-8555-555555555555"],
    project_names: ["Acme"],
    context_ids: [],
    context_names: [],
    person_ids: [],
    person_names: [],
    person_roles: [],
    observed_before: NOW,
    project_hint_matched: true,
    context_hint_matched: false,
    person_hint_matched: false,
    last_audited_at: null,
    prefilter_tier: 0,
    token_overlap: 1,
    query_token_count: 1,
    effective_limit: 25,
    ...overrides,
  };
}

function recordingClient(response: { data: unknown; error: { message: string; code?: string } | null }) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const client: TaskCandidateQueryClient = {
    rpc(fn, args) {
      calls.push({ fn, args });
      return Promise.resolve(response);
    },
  };
  return { calls, client };
}

describe("candidate query arguments", () => {
  it("sends the action's own eligible statuses, straight from the taxonomy", async () => {
    const { calls, client } = recordingClient({ data: [], error: null });

    await loadTaskCandidates({
      client,
      command: command({ action: "restore_task", titleWords: ["gym"] }),
      ownerId: OWNER,
      now: NOW,
    });

    expect(calls[0].fn).toBe("list_task_command_candidates");
    expect(calls[0].args.p_eligible_statuses).toEqual([...actionPolicy("restore_task").eligibleFrom]);
    expect(calls[0].args.p_eligible_statuses).toEqual(["cancelled"]);
  });

  it("joins the title words with the one separator the normalizer erases anyway", async () => {
    const { calls, client } = recordingClient({ data: [], error: null });

    await loadTaskCandidates({
      client,
      command: command({ action: "complete_task", titleWords: ["send", "the", "report"] }),
      ownerId: OWNER,
      now: NOW,
    });

    expect(calls[0].args.p_title_query).toBe("send the report");
  });

  it("sends null rather than an empty string when a hint is absent", async () => {
    const { calls, client } = recordingClient({ data: [], error: null });

    await loadTaskCandidates({
      client,
      command: command({ action: "complete_task" }),
      ownerId: OWNER,
      now: NOW,
    });

    // Omitted, not nulled: the generated argument type says these are optional
    // strings, JSON.stringify drops an undefined value, and the function's own
    // `default null` then applies.
    expect(calls[0].args.p_title_query).toBeUndefined();
    expect(calls[0].args.p_project_hint).toBeUndefined();
    expect(calls[0].args.p_context_hint).toBeUndefined();
    expect(calls[0].args.p_person_hint).toBeUndefined();
  });

  it("sends each relation hint to its own argument", async () => {
    // Asserted with three distinct values, because the previous coverage only
    // checked that all three were *absent* — under which any permutation of the
    // three arguments, or all three reading from one hint, passes. The RPC
    // compares each against a different table, so a swap silently matches
    // people against project names.
    const { calls, client } = recordingClient({ data: [], error: null });

    await loadTaskCandidates({
      client,
      command: command({
        action: "complete_task",
        titleWords: ["report"],
        project: "Acme Holdings",
        context: "Deep Work",
        person: "Ana Paula",
      }),
      ownerId: OWNER,
      now: NOW,
    });

    expect(calls[0].args.p_project_hint).toBe("Acme Holdings");
    expect(calls[0].args.p_context_hint).toBe("Deep Work");
    expect(calls[0].args.p_person_hint).toBe("Ana Paula");
    expect(calls[0].args.p_title_query).toBe("report");
  });

  it("passes the injected instant, so the recency window is never the server's clock", async () => {
    const { calls, client } = recordingClient({ data: [], error: null });

    await loadTaskCandidates({
      client,
      command: command({ action: "complete_task", titleWords: ["report"] }),
      ownerId: OWNER,
      now: new Date(NOW),
    });

    expect(calls[0].args.p_observed_before).toBe(NOW);
  });

  it("asks for the policy's candidate limit unless told otherwise", async () => {
    const { calls, client } = recordingClient({ data: [], error: null });
    const cmd = command({ action: "complete_task", titleWords: ["report"] });

    await loadTaskCandidates({ client, command: cmd, ownerId: OWNER, now: NOW });
    await loadTaskCandidates({ client, command: cmd, ownerId: OWNER, now: NOW, limit: 3 });

    expect(calls[0].args.p_limit).toBe(TASK_MATCH_LIMITS.candidates);
    expect(calls[1].args.p_limit).toBe(3);
  });

  it("refuses an injected instant that is not a date", async () => {
    const { client } = recordingClient({ data: [], error: null });

    await expect(
      loadTaskCandidates({
        client,
        command: command({ action: "complete_task", titleWords: ["report"] }),
        ownerId: OWNER,
        now: "not a date",
      }),
    ).rejects.toThrow(TaskCandidateQueryError);
  });
});

describe("what comes back", () => {
  it("maps the row contract onto the matcher's shape", async () => {
    const { client } = recordingClient({ data: [sqlRow()], error: null });

    const rows = await loadTaskCandidates({
      client,
      command: command({ action: "complete_task", titleWords: ["report"] }),
      ownerId: OWNER,
      now: NOW,
    });

    expect(rows).toEqual([
      {
        taskId: "33333333-3333-4333-8333-333333333333",
        ownerId: OWNER,
        title: "Send the report",
        status: "todo",
        dueAt: null,
        plannedAt: null,
        manualPriority: null,
        createdAt: "2026-07-01T00:00:00.000Z",
        description: null,
        completedAt: null,
        cancelledAt: null,
        intentionalNoDue: false,
        noDueReason: null,
        updatedAt: "2026-07-01T00:00:00.000Z",
        projectIds: ["55555555-5555-4555-8555-555555555555"],
        projectNames: ["Acme"],
        contextIds: [],
        contextNames: [],
        personIds: [],
        personNames: [],
        personRoles: [],
        observedBefore: NOW,
        projectHintMatched: true,
        contextHintMatched: false,
        personHintMatched: false,
        lastAuditedAt: null,
        prefilterTier: 0,
        tokenOverlap: 1,
        queryTokenCount: 1,
        effectiveLimit: 25,
      },
    ]);
  });

  it("treats a null payload as an empty candidate set", async () => {
    const { client } = recordingClient({ data: null, error: null });

    await expect(
      loadTaskCandidates({
        client,
        command: command({ action: "complete_task", titleWords: ["report"] }),
        ownerId: OWNER,
        now: NOW,
      }),
    ).resolves.toEqual([]);
  });

  it("raises rather than returns when the RPC fails", async () => {
    const { client } = recordingClient({ data: null, error: { message: "boom", code: "42883" } });

    await expect(
      loadTaskCandidates({
        client,
        command: command({ action: "complete_task", titleWords: ["report"] }),
        ownerId: OWNER,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "42883" });
  });

  it("raises on a row shape the matcher would have silently mis-scored", async () => {
    // A missing `query_token_count` would arrive as undefined and score as "no
    // overlap signal" — a wrong answer that looks like a right one.
    const missingTier: Record<string, unknown> = { ...sqlRow() };
    delete missingTier.prefilter_tier;
    const { client } = recordingClient({ data: [missingTier], error: null });

    await expect(
      loadTaskCandidates({
        client,
        command: command({ action: "complete_task", titleWords: ["report"] }),
        ownerId: OWNER,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "invalid_row_shape" });
  });

  it("raises on a column the row contract does not declare", async () => {
    const { client } = recordingClient({ data: [sqlRow({ dynamic_priority: 3 })], error: null });

    await expect(
      loadTaskCandidates({
        client,
        command: command({ action: "complete_task", titleWords: ["report"] }),
        ownerId: OWNER,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "invalid_row_shape" });
  });

  /**
   * Every refinement in `rowSchema`, driven from a table.
   *
   * A mutation run showed each of these survived removal: the one test that
   * existed deleted `prefilter_tier`, and `prefilter_tier: z.any()` parses a
   * missing key happily, so the weakest possible schema passed the check meant
   * to defend it.
   *
   * The assertion is on the *code*, not merely on rejection, and that is
   * load-bearing. Several of these values are also refused one layer later by
   * `describeUnreachableCandidates`, which raises `unreachable_row_shape`. If
   * this asserted "it throws", removing a refinement would leave the suite green
   * on the strength of a different control. Relaxing any of these to a generic
   * rejection un-pins the layer it was written to pin.
   */
  const invalidRows: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
    ["a task id that is not a uuid", { task_id: "not-a-uuid" }],
    ["an owner id that is not a uuid", { owner_id: "11111111-1111-4111-8111" }],
    ["a negative token overlap", { token_overlap: -1 }],
    ["a fractional token overlap", { token_overlap: 1.5 }],
    ["a negative query token count", { query_token_count: -1 }],
    ["an effective limit below one", { effective_limit: 0 }],
    ["a negative effective limit", { effective_limit: -25 }],
    ["a fractional prefilter tier", { prefilter_tier: 1.5 }],
    ["a prefilter tier below the vocabulary", { prefilter_tier: -1 }],
    ["a prefilter tier above the vocabulary", { prefilter_tier: 4 }],
    ["a null where a count is expected", { token_overlap: null }],
    ["a string where a count is expected", { prefilter_tier: "0" }],
    ["a null title", { title: null }],
    ["a null status", { status: null }],
    ["a null observation instant", { observed_before: null }],
    ["a null intentional_no_due", { intentional_no_due: null }],
    ["person arrays that are not aligned", { person_ids: ["a"], person_names: [], person_roles: [] }],
  ];

  it.each(invalidRows)("refuses %s at the schema", async (_label, overrides) => {
    const { client } = recordingClient({ data: [sqlRow(overrides)], error: null });

    await expect(
      loadTaskCandidates({
        client,
        command: command({ action: "complete_task", titleWords: ["report"] }),
        ownerId: OWNER,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "invalid_row_shape" });
  });

  const requiredKeys = [
    "task_id", "owner_id", "title", "status", "observed_before",
    "prefilter_tier", "token_overlap", "query_token_count", "effective_limit",
    "intentional_no_due", "created_at", "updated_at", "project_ids", "person_roles",
  ] as const;

  it.each(requiredKeys)("refuses a row missing %s", async (key) => {
    const row: Record<string, unknown> = { ...sqlRow() };
    delete row[key];
    const { client } = recordingClient({ data: [row], error: null });

    await expect(
      loadTaskCandidates({
        client,
        command: command({ action: "complete_task", titleWords: ["report"] }),
        ownerId: OWNER,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "invalid_row_shape" });
  });

  it("names the field that was wrong, so a paged human is not reading a thirty-column diff", async () => {
    const { client } = recordingClient({ data: [sqlRow({ prefilter_tier: 9 })], error: null });

    await expect(
      loadTaskCandidates({
        client,
        command: command({ action: "complete_task", titleWords: ["report"] }),
        ownerId: OWNER,
        now: NOW,
      }),
    ).rejects.toThrow(/prefilter_tier/);
  });

  /**
   * The second layer: values every field-level rule accepts, in combinations
   * `list_task_command_candidates` has no execution that produces.
   */
  const unreachableRows: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
    [
      "an exact title hit carrying only part of the hint",
      { prefilter_tier: 0, token_overlap: 1, query_token_count: 4 },
    ],
    [
      "a phrase hit carrying only part of it",
      { prefilter_tier: 1, token_overlap: 2, query_token_count: 5 },
    ],
    [
      "an overlap larger than the token array it counts",
      { prefilter_tier: 2, token_overlap: 6, query_token_count: 5 },
    ],
    [
      "a tier-2 row with neither a shared token nor a relation hit",
      { prefilter_tier: 2, token_overlap: 0, query_token_count: 3, project_hint_matched: false },
    ],
    [
      "a tier-3 row that carries a relation hit",
      {
        prefilter_tier: 3,
        token_overlap: 0,
        query_token_count: 0,
        project_hint_matched: true,
      },
    ],
    [
      "a tier-3 row that reports query tokens",
      { prefilter_tier: 3, token_overlap: 0, query_token_count: 2, project_hint_matched: false },
    ],
  ];

  it.each(unreachableRows)("refuses %s", async (_label, overrides) => {
    const { client } = recordingClient({ data: [sqlRow(overrides)], error: null });

    await expect(
      loadTaskCandidates({
        client,
        command: command({ action: "complete_task", titleWords: ["report"] }),
        ownerId: OWNER,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "unreachable_row_shape" });
  });

  it("refuses a set whose rows disagree about the query's token count", async () => {
    // Each row is individually reachable. `query_token_count` is computed once
    // per query and cross-joined onto every row, so this set is not.
    const { client } = recordingClient({
      data: [
        sqlRow(),
        sqlRow({
          task_id: "44444444-4444-4444-8444-444444444444",
          prefilter_tier: 2,
          token_overlap: 1,
          query_token_count: 4,
        }),
      ],
      error: null,
    });

    await expect(
      loadTaskCandidates({
        client,
        command: command({ action: "complete_task", titleWords: ["report"] }),
        ownerId: OWNER,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "unreachable_row_shape" });
  });

  it("raises, never filters, when a row belongs to another owner", async () => {
    // Reaching here would mean the RPC predicate *and* forced RLS both failed.
    // Quietly dropping the row would leave that undetected.
    const { client } = recordingClient({
      data: [sqlRow(), sqlRow({ task_id: "44444444-4444-4444-8444-444444444444", owner_id: OTHER_OWNER })],
      error: null,
    });

    await expect(
      loadTaskCandidates({
        client,
        command: command({ action: "complete_task", titleWords: ["report"] }),
        ownerId: OWNER,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "cross_owner_row" });
  });
});
