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
  /**
   * The patch, which the taxonomy gates per action — `assign_project` requires
   * `projectRef` and forbids the other two, so a command carrying all three
   * cannot be built and the reference arguments have to be proven one action at
   * a time.
   */
  patch?: Record<string, unknown>;
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
      patch: input.patch ?? {},
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
    project_ref_id: null,
    context_ref_id: null,
    person_ref_id: null,
    scheduled_reminder_count: 0,
    next_reminder_at: null,
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

  it.each([
    ["assign_project", "projectRef", "p_project_ref"],
    ["assign_context", "contextRef", "p_context_ref"],
    ["assign_person", "personRef", "p_person_ref"],
  ] as const)(
    "sends %s's patch reference to %s's own argument",
    async (action, patchField, argument) => {
      // One action at a time, because the taxonomy allows each of them exactly
      // one reference field. The three arguments are asserted *together* — the
      // one that carries a value and the two that must not — so a swap is
      // caught. A swap is not cosmetic here: SQL resolves each reference against
      // a different table, and a person reference arriving as `p_project_ref`
      // would resolve to nothing and make the preview report that the project
      // the user named does not exist.
      const { calls, client } = recordingClient({ data: [], error: null });

      await loadTaskCandidates({
        client,
        command: command({
          action,
          titleWords: ["report"],
          patch: { [patchField]: "Acme Holdings" },
        }),
        ownerId: OWNER,
        now: NOW,
      });

      const args = calls[0].args;
      expect(args[argument]).toBe("Acme Holdings");
      for (const other of ["p_project_ref", "p_context_ref", "p_person_ref"]) {
        if (other !== argument) expect(args[other]).toBeUndefined();
      }
    },
  );

  it("keeps the patch's references distinct from the target hints of the same name", async () => {
    // "add the invoice task to Acme" carries a title hint of "invoice" and a
    // project *ref* of "Acme": the hint says which task the user meant, the
    // reference says what to assign to it. Feeding one into the other's argument
    // would make the task already in Acme outrank the one the user named, which
    // is the defect `writesRelation` exists to prevent on the scoring side.
    const { calls, client } = recordingClient({ data: [], error: null });

    await loadTaskCandidates({
      client,
      command: command({
        action: "assign_project",
        titleWords: ["invoice"],
        project: "Billing",
        patch: { projectRef: "Acme" },
      }),
      ownerId: OWNER,
      now: NOW,
    });

    expect(calls[0].args.p_project_hint).toBe("Billing");
    expect(calls[0].args.p_project_ref).toBe("Acme");
  });

  it("omits every patch reference when the command carries none", async () => {
    // Omitted, not nulled, for the same reason the hints are: the generated
    // argument type says these are optional strings, JSON.stringify drops an
    // undefined value, and the function's own `default null` then applies.
    const { calls, client } = recordingClient({ data: [], error: null });

    await loadTaskCandidates({
      client,
      command: command({ action: "complete_task", titleWords: ["report"] }),
      ownerId: OWNER,
      now: NOW,
    });

    expect(calls[0].args).not.toHaveProperty("p_project_ref", null);
    expect(calls[0].args.p_project_ref).toBeUndefined();
    expect(calls[0].args.p_context_ref).toBeUndefined();
    expect(calls[0].args.p_person_ref).toBeUndefined();
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

  it.each([
    "2026-07-25T12:00",
    "2026-07-25T12:00:00",
    "2026-07-25T12:00:00.000",
    "2026-07-25",
  ])("refuses %s, which Date.parse would read in the host's zone", async (instant) => {
    // `rankTaskCandidates` already refuses these as a 2E-MATCH-017 violation,
    // and this layer accepted them — so the query ran against a host-dependent
    // instant before anything threw, making `p_observed_before`, the recency
    // window and the audit cut-off depend on the machine. A caller using
    // `loadTaskCandidates` alone got no error at all.
    const { calls, client } = recordingClient({ data: [], error: null });

    await expect(
      loadTaskCandidates({
        client,
        command: command({ action: "complete_task", titleWords: ["report"] }),
        ownerId: OWNER,
        now: instant,
      }),
    ).rejects.toMatchObject({ code: "invalid_clock" });
    // ...and it refused *before* querying, not after.
    expect(calls).toHaveLength(0);
  });

  it("accepts the designator forms that are unambiguous", async () => {
    const { client } = recordingClient({ data: [], error: null });

    for (const instant of ["2026-07-25T12:00:00.000Z", "2026-07-25T12:00Z", "2026-07-25T09:00-03:00"]) {
      await expect(
        loadTaskCandidates({
          client,
          command: command({ action: "complete_task", titleWords: ["report"] }),
          ownerId: OWNER,
          now: instant,
        }),
      ).resolves.toEqual([]);
    }
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
        projectRefId: null,
        contextRefId: null,
        personRefId: null,
        scheduledReminderCount: 0,
        nextReminderAt: null,
      },
    ]);
  });

  it("carries the resolved references and the reminder state through to the row", async () => {
    // The preview half of the projection, and the only place the five columns
    // Slice 2E.3 added are proven to arrive with values rather than as the nulls
    // the base fixture uses. Each is mapped from a differently-named SQL column,
    // so a transposition here would silently show one relation's id under
    // another's label.
    const { client } = recordingClient({
      data: [
        sqlRow({
          project_ref_id: "66666666-6666-4666-8666-666666666666",
          context_ref_id: "77777777-7777-4777-8777-777777777777",
          person_ref_id: "88888888-8888-4888-8888-888888888888",
          scheduled_reminder_count: 2,
          next_reminder_at: "2026-07-26T09:00:00.000Z",
        }),
      ],
      error: null,
    });

    const rows = await loadTaskCandidates({
      client,
      command: command({ action: "complete_task", titleWords: ["report"] }),
      ownerId: OWNER,
      now: NOW,
    });

    expect(rows[0]).toMatchObject({
      projectRefId: "66666666-6666-4666-8666-666666666666",
      contextRefId: "77777777-7777-4777-8777-777777777777",
      personRefId: "88888888-8888-4888-8888-888888888888",
      scheduledReminderCount: 2,
      nextReminderAt: "2026-07-26T09:00:00.000Z",
    });
  });

  it("raises on a reminder column renamed to something plausible", async () => {
    // `.strict()` over the five new columns, asserted against a near-miss rather
    // than an obviously foreign key: a projection that started returning
    // `reminder_count` would leave `scheduled_reminder_count` missing *and* add
    // an undeclared key, and a schema that merely ignored unknown keys would
    // render "no reminders" for a task that has two.
    const row: Record<string, unknown> = { ...sqlRow(), reminder_count: 2 };
    delete row.scheduled_reminder_count;
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
    // The reference columns are nullable but not free-form. A name arriving
    // where an id was declared is a projection that stopped resolving, and
    // binding a relation to it would assign the wrong thing — or, once Slice
    // 2E.4 stores it as `remove_added_relation`'s target, undo the wrong thing.
    ["a project reference that is not a uuid", { project_ref_id: "Acme" }],
    ["a context reference that is not a uuid", { context_ref_id: "deep-work" }],
    ["a person reference that is not a uuid", { person_ref_id: "11111111-1111-4111-8111" }],
    // Non-null and non-negative: SQL coalesces the count to 0, so both a null
    // and a negative mean the projection changed. Either would be read as "no
    // reminders" by a preview that trusted the number.
    ["a null scheduled reminder count", { scheduled_reminder_count: null }],
    ["a negative scheduled reminder count", { scheduled_reminder_count: -1 }],
    ["a fractional scheduled reminder count", { scheduled_reminder_count: 1.5 }],
    ["a non-string next reminder instant", { next_reminder_at: 1_764_000_000 }],
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
    // Nullable is not optional. A dropped reference column would arrive as
    // undefined and read as "resolved to nothing", which is the one answer a
    // preview must not give when the truth is "the projection stopped telling
    // us".
    "project_ref_id", "context_ref_id", "person_ref_id",
    "scheduled_reminder_count", "next_reminder_at",
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

  it("names the field that was wrong, so a paged human is not reading a thirty-five-column diff", async () => {
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

  it.each([
    ["the observation instant", { observed_before: "2026-07-25T11:00:00.000Z" }],
    ["the effective limit", { effective_limit: 7 }],
    // The `refs` CTE resolves each reference once and cross-joins it, so these
    // are query-scalars exactly as the two above are. Two ids in one set would
    // mean the preview and the Slice 2E.4 apply — which binds the resolved id
    // rather than the user's words — could name different projects.
    ["the resolved project reference", { project_ref_id: "66666666-6666-4666-8666-666666666666" }],
    ["the resolved context reference", { context_ref_id: "77777777-7777-4777-8777-777777777777" }],
    ["the resolved person reference", { person_ref_id: "88888888-8888-4888-8888-888888888888" }],
  ])("refuses a set whose rows disagree about %s", async (_label, overrides) => {
    // `b.observed_before` and `b.lim` are single-row cross joins, exactly like
    // `cardinality(q.tokens)`. The observation instant is the one that matters
    // most: it is what 2E-UPDATE-003's TOCTOU gate will compare against, and a
    // set carrying two of them means one of the pre-states was never observed
    // at the instant the write would claim.
    const { client } = recordingClient({
      data: [
        sqlRow(),
        sqlRow({ task_id: "44444444-4444-4444-8444-444444444444", ...overrides }),
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

  it("accepts a set whose rows disagree about their reminders, which are per-row", async () => {
    // The mirror of the tests above, and the reason they are worth having. The
    // reminder lateral runs once per candidate, so two rows reporting different
    // counts is the ordinary case — folding these into the query-scalar
    // agreement check would refuse every result set containing one task with a
    // reminder and one without.
    const { client } = recordingClient({
      data: [
        sqlRow({ scheduled_reminder_count: 0, next_reminder_at: null }),
        sqlRow({
          task_id: "44444444-4444-4444-8444-444444444444",
          scheduled_reminder_count: 3,
          next_reminder_at: "2026-07-26T09:00:00.000Z",
        }),
      ],
      error: null,
    });

    const rows = await loadTaskCandidates({
      client,
      command: command({ action: "complete_task", titleWords: ["report"] }),
      ownerId: OWNER,
      now: NOW,
    });

    expect(rows.map((row) => row.scheduledReminderCount)).toEqual([0, 3]);
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
