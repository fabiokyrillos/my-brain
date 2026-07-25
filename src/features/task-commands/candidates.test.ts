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
    project_names: ["Acme"],
    context_names: [],
    person_names: [],
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

    expect(calls[0].args.p_title_query).toBeNull();
    expect(calls[0].args.p_project_hint).toBeNull();
    expect(calls[0].args.p_context_hint).toBeNull();
    expect(calls[0].args.p_person_hint).toBeNull();
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
        projectNames: ["Acme"],
        contextNames: [],
        personNames: [],
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
    const { client } = recordingClient({ data: [sqlRow({ description: "leaked" })], error: null });

    await expect(
      loadTaskCandidates({
        client,
        command: command({ action: "complete_task", titleWords: ["report"] }),
        ownerId: OWNER,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "invalid_row_shape" });
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
