import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getAIProvider } from "@/lib/ai";
import { recordAIUsage } from "@/lib/ai/usage";
import { requireUser } from "@/lib/auth/require-user";
import { recordProductEvent } from "@/features/product-analytics/server";

import {
  applyTaskCommandAction,
  confirmTaskCommandAction,
  createTaskFromCommand,
  restoreCancelledTask,
  runTaskCommand,
  selectTaskCommandCandidate,
  startTaskCommand,
  undoTaskCommand,
  undoWorkOperation,
} from "./actions";
import { idleTaskCommandState } from "./console-state";
import { idleTaskUndoState } from "./task-undo-state";
import { parseTaskCommandSession } from "./session";

// `undo-listing.ts` is a server-only projection; the repository's convention
// for testing one is to neutralise the guard, exactly as
// `settings-view.test.ts` does.

// The BYOK gate is mocked open here: these suites exercise their own feature's
// logic, not credential resolution. The gate's real behaviour -- including that
// a closed gate makes NO provider call (matrix case 12) -- is exercised against
// the real module in src/lib/byok/gate.test.ts.
vi.mock("@/lib/byok/gate", () => ({
  openAiGate: vi.fn(async () => ({
    ok: true,
    credential: { outcome: "resolved", secret: { expose: () => "sk-test" }, provider: "openai", keyVersion: 1 },
  })),
  gateMessageKey: (reason: string) => (reason === "credential_required" ? "credentialRequired" : "credentialUnreadable"),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/ai", () => ({ getAIProvider: vi.fn() }));
vi.mock("@/lib/ai/usage", () => ({ recordAIUsage: vi.fn(async () => true) }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));
vi.mock("@/features/product-analytics/server", () => ({
  createProductEventIdempotencyKey: vi.fn(() => "11111111-1111-5111-8111-111111111111"),
  recordProductEvent: vi.fn(async () => ({
    accepted: true,
    recorded: true,
    eventId: "evt-1",
    code: "recorded",
  })),
}));

const OWNER = "22222222-2222-4222-8222-222222222222";
const TASK_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_TASK_ID = "44444444-4444-4444-8444-444444444444";
const UNDO_ID = "66666666-6666-4666-8666-666666666666";

/** One row of `list_task_command_candidates`, in the shape the RPC emits. */
function sqlRow(overrides: Record<string, unknown> = {}) {
  return {
    task_id: TASK_ID,
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
    project_ids: [],
    project_names: [],
    context_ids: [],
    context_names: [],
    person_ids: [],
    person_names: [],
    person_roles: [],
    observed_before: "PLACEHOLDER",
    project_hint_matched: false,
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
    project_ref_name: null,
    context_ref_name: null,
    person_ref_name: null,
    scheduled_reminder_count: 0,
    next_reminder_at: null,
    ...overrides,
  };
}

type RpcCall = { fn: string; args: Record<string, unknown> };

type Harness = {
  readonly rpcCalls: RpcCall[];
  client: unknown;
  rows: Record<string, unknown>[];
  applyResult: { data: unknown; error: unknown };
  confirmationResult: { data: unknown; error: unknown };
  creationPreviewResult: { data: unknown; error: unknown };
  creationConfirmResult: { data: unknown; error: unknown };
  createResult: { data: unknown; error: unknown };
  undoRow: Record<string, unknown> | null;
  undoError: { code?: string; details?: string; message: string } | null;
  timezone: string | null;
};

function harness(): Harness {
  const state: Harness = {
    rpcCalls: [],
    client: null,
    rows: [sqlRow()],
    applyResult: {
      data: {
        outcome: "applied",
        task_id: TASK_ID,
        action: "complete_task",
        undo_id: UNDO_ID,
        idempotent: false,
        request_fingerprint: "a".repeat(64),
        reminders_cancelled: 0,
        reminder_created_id: null,
        undo_expires_at: "2026-07-29T12:00:00.000000+00",
      },
      error: null,
    },
    confirmationResult: {
      data: {
        confirmation_id: "55555555-5555-4555-8555-555555555555",
        task_id: TASK_ID,
        action: "cancel_task",
        request_fingerprint: "b".repeat(64),
        status: "issued",
        replayed: false,
      },
      error: null,
    },
    creationPreviewResult: {
      data: {
        outcome: "creation_offered",
        will_mutate: false,
        action: "set_planned",
        title: "book the flights",
        status: "inbox",
        canonical_payload: {
          title: "book the flights",
          status: "inbox",
          dueAt: null,
          plannedAt: "2026-08-04T12:00:00.000Z",
          manualPriority: null,
          relationType: null,
          relationId: null,
          relationName: null,
          personRole: null,
        },
        request_fingerprint: "c".repeat(64),
        requires_confirmation: true,
        reversible: true,
        undo_window_hours: 24,
        reminder: { will_create: false, remind_at: null, timing: "none" },
      },
      error: null,
    },
    creationConfirmResult: {
      data: {
        confirmation_id: "77777777-7777-4777-8777-777777777777",
        action: "create_task",
        command_action: "set_planned",
        request_fingerprint: "c".repeat(64),
        status: "issued",
        replayed: false,
      },
      error: null,
    },
    createResult: {
      data: {
        outcome: "applied",
        task_id: OTHER_TASK_ID,
        action: "set_planned",
        undo_id: UNDO_ID,
        idempotent: false,
        request_fingerprint: "c".repeat(64),
        reminder_created_id: null,
        undo_expires_at: "2026-07-29T12:00:00.000000+00",
        creation_undone: false,
      },
      error: null,
    },
    undoRow: {
      id: UNDO_ID,
      action_type: "apply_task_command",
      entity_ids: [TASK_ID],
      created_at: "2026-07-28T11:00:00.000Z",
      expires_at: "2099-01-01T00:00:00.000Z",
      status: "available",
    },
    undoError: null,
    timezone: "America/Sao_Paulo",
  };

  const profileQuery = {
    select: vi.fn(function (this: unknown) { return this; }),
    eq: vi.fn(function (this: unknown) { return this; }),
    maybeSingle: vi.fn(async () => ({ data: { timezone: state.timezone }, error: null })),
  };
  const preferencesQuery = {
    select: vi.fn(function (this: unknown) { return this; }),
    eq: vi.fn(function (this: unknown) { return this; }),
    maybeSingle: vi.fn(async () => ({ data: { chat_model: "gpt-5.6-luna" }, error: null })),
  };
  const undoQuery = {
    select: vi.fn(function (this: unknown) { return this; }),
    eq: vi.fn(function (this: unknown) { return this; }),
    maybeSingle: vi.fn(async () => ({ data: state.undoRow, error: null })),
  };

  const client = {
    from: vi.fn((table: string) =>
      table === "profiles" ? profileQuery : table === "agent_preferences" ? preferencesQuery : undoQuery,
    ),
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ fn, args });
      switch (fn) {
        case "list_task_command_candidates":
          // The RPC echoes the observation instant it was given onto every row,
          // which is what the pinned clock is *for*.
          return {
            data: state.rows.map((row) => ({ ...row, observed_before: args.p_observed_before })),
            error: null,
          };
        case "apply_task_command":
          return state.applyResult;
        case "issue_task_command_confirmation":
          return state.confirmationResult;
        case "preview_task_command_creation":
          return state.creationPreviewResult;
        case "issue_task_command_creation_confirmation":
          return state.creationConfirmResult;
        case "create_task_command":
          return state.createResult;
        case "undo_operation":
          return { data: null, error: state.undoError };
        default:
          return { data: null, error: null };
      }
    }),
  };

  state.client = client;
  vi.mocked(requireUser).mockResolvedValue({
    supabase: client,
    user: { id: OWNER },
  } as unknown as Awaited<ReturnType<typeof requireUser>>);
  return state;
}

function provider(proposal: Record<string, unknown>) {
  vi.mocked(getAIProvider).mockReturnValue({
    parseTaskCommand: vi.fn(async () => ({
      proposal,
      model: "gpt-5.6-luna",
      promptVersion: "2026-07-25.1",
      strategyVersion: "task-command-v1",
      inputTokens: 10,
      cachedInputTokens: 0,
      outputTokens: 5,
      reasoningTokens: 0,
      providerRequestId: "req-1",
    })),
  } as never);
}

function modelProposal(overrides: Record<string, unknown> = {}) {
  return {
    outcome: "proposal",
    action: "complete_task",
    unsupportedReason: null,
    targetHints: {
      titleWords: ["report"],
      project: null,
      person: null,
      context: null,
      status: null,
      temporalPhrase: null,
    },
    patch: {
      title: null,
      note: null,
      status: null,
      priority: null,
      dueAt: null,
      plannedAt: null,
      projectRef: null,
      contextRef: null,
      personRef: null,
    },
    ...overrides,
  };
}

function form(entries: Record<string, string>) {
  const data = new FormData();
  data.set("locale", "en");
  data.set("origin", "chat");
  Object.entries(entries).forEach(([key, value]) => data.set(key, value));
  return data;
}

async function flushAfter() {
  const calls = vi.mocked(after).mock.calls;
  await Promise.all(calls.map(([task]) => (typeof task === "function" ? task() : task)));
}

function emittedProperties(name: string): Record<string, unknown> | undefined {
  const call = vi
    .mocked(recordProductEvent)
    .mock.calls.find(([payload]) => (payload as { name: string }).name === name);
  return call ? ((call[0] as { properties: Record<string, unknown> }).properties) : undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("startTaskCommand", () => {
  it("previews an unambiguous match and hands back a session", async () => {
    harness();
    provider(modelProposal());
    const state = await startTaskCommand(idleTaskCommandState, form({ commandText: "mark the report as done" }));

    expect(state.status).toBe("resolved");
    expect(state.control).toBe("apply");
    expect(state.preview?.disposition).toBe("previewed");
    expect(state.session).not.toBeNull();
  });

  it("records the AI usage before anything derived from the proposal", async () => {
    const bench = harness();
    provider(modelProposal());
    await startTaskCommand(idleTaskCommandState, form({ commandText: "mark the report as done" }));

    // 2E-PROVENANCE-002: the ledger write happens before the first domain read
    // that depends on the proposal.
    expect(recordAIUsage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ operation: "task_command", model: "gpt-5.6-luna", userId: OWNER }),
    );
    const usageOrder = vi.mocked(recordAIUsage).mock.invocationCallOrder[0];
    const firstCandidateCall = vi.mocked((bench.client as { rpc: ReturnType<typeof vi.fn> }).rpc)
      .mock.invocationCallOrder[0];
    expect(usageOrder).toBeLessThan(firstCandidateCall);
  });

  it("bills a parse that failed after the response, and says so in the user's language", async () => {
    harness();
    const { TaskCommandProviderError } = await import("@/lib/ai/task-command-schema");
    vi.mocked(getAIProvider).mockReturnValue({
      parseTaskCommand: vi.fn(async () => {
        throw new TaskCommandProviderError("no_structured_output", {
          usage: { inputTokens: 4 },
          model: "gpt-5.6-luna",
        });
      }),
    } as never);

    const state = await startTaskCommand(idleTaskCommandState, form({ commandText: "hello" }));
    expect(recordAIUsage).toHaveBeenCalledTimes(1);
    expect(state.retryable).toBe(true);
    expect(state.reason).toBe("I could not read your command right now. Try again.");
  });

  it("reports a model refusal as its own reason rather than a generic failure", async () => {
    harness();
    provider(
      modelProposal({ outcome: "unsupported", action: null, unsupportedReason: "recurrence_requested" }),
    );
    const state = await startTaskCommand(idleTaskCommandState, form({ commandText: "repeat this weekly" }));
    expect(state.reason).toBe("I do not handle repeating schedules yet.");
    expect(state.terminal).toBe(true);
    expect(state.session).toBeNull();
  });

  it("presents competing candidates as a choice rather than picking one", async () => {
    const bench = harness();
    bench.rows = [
      sqlRow({ title: "Send the report" }),
      sqlRow({ task_id: OTHER_TASK_ID, title: "Send the report" }),
    ];
    provider(modelProposal());
    const state = await startTaskCommand(idleTaskCommandState, form({ commandText: "mark the report as done" }));

    expect(state.control).toBe("choose");
    expect(state.disambiguation?.candidates.length).toBe(2);
    // 2E-MATCH-015: no fallback to "first result".
    expect(state.preview).toBeNull();
  });
});

describe("the pinned clock (2E-IDEMPOTENCY-004)", () => {
  it("sends the identical observation instant on every step of one command", async () => {
    const bench = harness();
    provider(modelProposal());
    const first = await startTaskCommand(idleTaskCommandState, form({ commandText: "mark the report as done" }));
    expect(first.session).not.toBeNull();

    await applyTaskCommandAction(
      idleTaskCommandState,
      form({ session: first.session as string }),
    );

    const observed = bench.rpcCalls
      .filter((call) => call.fn === "list_task_command_candidates")
      .map((call) => call.args.p_observed_before);
    expect(observed.length).toBeGreaterThan(1);
    expect(new Set(observed).size).toBe(1);

    // And the apply hashes the same instant, which is what makes a replay a
    // replay rather than an idempotency mismatch.
    const apply = bench.rpcCalls.find((call) => call.fn === "apply_task_command");
    expect(apply?.args.p_observed_before).toBe(observed[0]);
  });

  it("keeps one operation key across the whole command", async () => {
    const bench = harness();
    provider(modelProposal());
    const first = await startTaskCommand(idleTaskCommandState, form({ commandText: "mark the report as done" }));
    await applyTaskCommandAction(idleTaskCommandState, form({ session: first.session as string }));

    const apply = bench.rpcCalls.find((call) => call.fn === "apply_task_command");
    const parsed = parseTaskCommandSession(first.session as string);
    expect(parsed.status).toBe("ok");
    if (parsed.status !== "ok") return;
    expect(apply?.args.p_operation_key).toBe(parsed.session.proposal.operationKey);
  });
});

describe("the destructive confirmation is issued where the preview is rendered", () => {
  it("mints it during the round that renders the preview, not during Confirm", async () => {
    const bench = harness();
    provider(
      modelProposal({
        action: "cancel_task",
        targetHints: {
          titleWords: ["gym"],
          project: null,
          person: null,
          context: null,
          status: null,
          temporalPhrase: null,
        },
      }),
    );
    bench.rows = [sqlRow({ title: "gym" })];

    const previewed = await startTaskCommand(idleTaskCommandState, form({ commandText: "cancel my gym task" }));
    expect(previewed.control).toBe("confirm");
    expect(previewed.preview?.disposition).toBe("matched_requires_confirmation");
    // Issued by the rendering round.
    expect(bench.rpcCalls.filter((call) => call.fn === "issue_task_command_confirmation")).toHaveLength(1);

    const before = bench.rpcCalls.length;
    bench.applyResult = {
      data: { ...(bench.applyResult.data as Record<string, unknown>), action: "cancel_task" },
      error: null,
    };
    const confirmed = await confirmTaskCommandAction(
      idleTaskCommandState,
      form({ session: previewed.session as string }),
    );

    // The Confirm round issues nothing: the token it spends was bound to the
    // preview the user actually saw.
    const issuedDuringConfirm = bench.rpcCalls
      .slice(before)
      .filter((call) => call.fn === "issue_task_command_confirmation");
    expect(issuedDuringConfirm).toHaveLength(0);
    expect(confirmed.heading).toBe("Done");
  });

  it("refuses to apply a destructive preview through the non-destructive route", async () => {
    const bench = harness();
    provider(
      modelProposal({
        action: "cancel_task",
        targetHints: {
          titleWords: ["gym"],
          project: null,
          person: null,
          context: null,
          status: null,
          temporalPhrase: null,
        },
      }),
    );
    bench.rows = [sqlRow({ title: "gym" })];
    const previewed = await startTaskCommand(idleTaskCommandState, form({ commandText: "cancel my gym task" }));

    const applied = await applyTaskCommandAction(
      idleTaskCommandState,
      form({ session: previewed.session as string }),
    );

    expect(bench.rpcCalls.some((call) => call.fn === "apply_task_command")).toBe(false);
    expect(applied.control).toBe("confirm");
  });
});

describe("the staleness witness (2E-PREVIEW-006)", () => {
  it("reports a row that moved as stale instead of applying it", async () => {
    const bench = harness();
    provider(modelProposal());
    const previewed = await startTaskCommand(idleTaskCommandState, form({ commandText: "mark the report as done" }));

    // The task changed elsewhere between the preview and the apply.
    bench.rows = [sqlRow({ updated_at: "2026-07-28T09:00:00.000Z" })];
    const applied = await applyTaskCommandAction(
      idleTaskCommandState,
      form({ session: previewed.session as string }),
    );

    expect(applied.preview?.disposition).toBe("rejected_stale");
    expect(bench.rpcCalls.some((call) => call.fn === "apply_task_command")).toBe(false);
    expect(applied.retryable).toBe(true);
  });

  it("refuses a write from an envelope that never carried a witness", async () => {
    const bench = harness();
    provider(modelProposal());
    const previewed = await startTaskCommand(idleTaskCommandState, form({ commandText: "mark the report as done" }));
    const parsed = parseTaskCommandSession(previewed.session as string);
    expect(parsed.status).toBe("ok");
    if (parsed.status !== "ok") return;

    const stripped = JSON.stringify({ ...parsed.session, expected: null });
    const applied = await applyTaskCommandAction(idleTaskCommandState, form({ session: stripped }));

    expect(bench.rpcCalls.some((call) => call.fn === "apply_task_command")).toBe(false);
    expect(applied.reason).toBe("Your session expired. Sign in and try again.");
  });
});

describe("no-match", () => {
  it("offers creation and mints its confirmation at render time", async () => {
    const bench = harness();
    bench.rows = [];
    provider(
      modelProposal({
        action: "set_planned",
        targetHints: {
          titleWords: ["book", "the", "flights"],
          project: null,
          person: null,
          context: null,
          status: null,
          temporalPhrase: null,
        },
        patch: {
          title: null,
          note: null,
          status: null,
          priority: null,
          dueAt: null,
          plannedAt: "next week",
          projectRef: null,
          contextRef: null,
          personRef: null,
        },
      }),
    );

    const state = await startTaskCommand(
      idleTaskCommandState,
      form({ commandText: "remind me to book the flights next week" }),
    );
    expect(state.control).toBe("create");
    expect(state.creation?.title).toBe("book the flights");
    expect(bench.rpcCalls.some((call) => call.fn === "issue_task_command_creation_confirmation")).toBe(true);
    expect(bench.rpcCalls.some((call) => call.fn === "create_task_command")).toBe(false);

    const created = await createTaskFromCommand(
      idleTaskCommandState,
      form({ session: state.session as string }),
    );
    expect(created.heading).toBe("Done");
    expect(created.undo?.undoId).toBe(UNDO_ID);
  });

  it("asks one bounded question when nothing task-like was expressed", async () => {
    const bench = harness();
    bench.rows = [];
    provider(modelProposal());

    const asked = await startTaskCommand(idleTaskCommandState, form({ commandText: "push that one" }));
    expect(asked.control).toBe("clarify");

    // 2E-NOMATCH-008: the answer is merged and re-matched exactly once.
    const answered = await runTaskCommand(
      idleTaskCommandState,
      form({ intent: "clarify", session: asked.session as string, clarification: "the Acme invoice" }),
    );
    expect(answered.terminal).toBe(true);
    expect(answered.control).toBe("none");

    // And the slot cannot be spent twice.
    const again = await runTaskCommand(
      idleTaskCommandState,
      form({ intent: "clarify", session: asked.session as string, clarification: "no really" }),
    );
    expect(again.terminal).toBe(true);
  });
});

describe("the create verb (2G.2)", () => {
  function createProposal(patch: Record<string, string | null> = {}) {
    return modelProposal({
      outcome: "create",
      action: null,
      targetHints: {
        titleWords: ["book", "the", "flights"],
        project: null,
        person: null,
        context: null,
        status: null,
        temporalPhrase: null,
      },
      patch: {
        title: null,
        note: null,
        status: null,
        priority: null,
        dueAt: null,
        plannedAt: null,
        projectRef: null,
        contextRef: null,
        personRef: null,
        ...patch,
      },
    });
  }

  it("routes a bare creation to the family, never the matcher (2G-ROUTE-001)", async () => {
    const bench = harness();
    provider(createProposal());

    const state = await startTaskCommand(
      idleTaskCommandState,
      form({ commandText: "add a task to book the flights" }),
    );
    expect(state.control).toBe("create");
    expect(state.creation?.title).toBe("book the flights");

    // The matcher never ran — there is no existing task to match.
    expect(bench.rpcCalls.some((call) => call.fn === "list_task_command_candidates")).toBe(false);
    const preview = bench.rpcCalls.find((call) => call.fn === "preview_task_command_creation");
    expect(preview?.args.p_action).toBe("create_title_only");
    expect(preview?.args.p_title_words).toEqual(["book", "the", "flights"]);
    expect(preview?.args.p_patch).toEqual({});
    // The confirmation is minted at render time, against the shown payload.
    expect(bench.rpcCalls.some((call) => call.fn === "issue_task_command_creation_confirmation")).toBe(true);
    expect(bench.rpcCalls.some((call) => call.fn === "create_task_command")).toBe(false);

    // The session is a creation session, and says so.
    expect(JSON.parse(state.session as string).create).toBe(true);
  });

  it("resolves one qualifier deterministically and maps it to the family's action", async () => {
    const bench = harness();
    provider(createProposal({ dueAt: "tomorrow" }));

    await startTaskCommand(idleTaskCommandState, form({ commandText: "add a task due tomorrow" }));

    const preview = bench.rpcCalls.find((call) => call.fn === "preview_task_command_creation");
    expect(preview?.args.p_action).toBe("reschedule_due");
    // The lexicon resolved the phrase at the pinned instant: an ISO instant
    // reaches the RPC, never the user's words (2E-COMMAND-014 inherited).
    const patch = preview?.args.p_patch as Record<string, unknown>;
    expect(String(patch.dueAt)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("keeps the first declared qualifier when the model returned several", async () => {
    const bench = harness();
    provider(createProposal({ dueAt: "tomorrow", priority: "high" }));

    await startTaskCommand(idleTaskCommandState, form({ commandText: "add an urgent task for tomorrow" }));

    const preview = bench.rpcCalls.find((call) => call.fn === "preview_task_command_creation");
    // dueAt precedes priority in TASK_COMMAND_CREATION_QUALIFIERS declaration
    // order; the preview shows exactly what will be created (2G-CREATE-002).
    expect(preview?.args.p_action).toBe("reschedule_due");
    expect(Object.keys(preview?.args.p_patch as Record<string, unknown>)).toEqual(["dueAt"]);
  });

  it("asks for an unresolvable date to be said differently, and writes nothing", async () => {
    const bench = harness();
    provider(createProposal({ dueAt: "whenever the mood strikes" }));

    const state = await startTaskCommand(
      idleTaskCommandState,
      form({ commandText: "add a task due whenever" }),
    );
    expect(state.retryable).toBe(true);
    expect(bench.rpcCalls.some((call) => call.fn === "preview_task_command_creation")).toBe(false);
    expect(bench.rpcCalls.some((call) => call.fn === "create_task_command")).toBe(false);
  });

  it("creates through the same family on confirm, idempotently keyed (2G-ROUTE-007)", async () => {
    const bench = harness();
    provider(createProposal());

    const offered = await startTaskCommand(
      idleTaskCommandState,
      form({ commandText: "add a task to book the flights" }),
    );
    const previewKey = bench.rpcCalls.find((call) => call.fn === "preview_task_command_creation")
      ?.args.p_operation_key;

    const created = await createTaskFromCommand(
      idleTaskCommandState,
      form({ session: offered.session as string }),
    );
    expect(created.heading).toBe("Done");
    expect(created.undo?.undoId).toBe(UNDO_ID);

    const create = bench.rpcCalls.find((call) => call.fn === "create_task_command");
    expect(create?.args.p_action).toBe("create_title_only");
    // The confirm re-derived the identical identity the preview fingerprinted.
    expect(create?.args.p_operation_key).toBe(previewKey);

    await flushAfter();
    const applied = emittedProperties("task_command_applied");
    expect(applied?.applyRoute).toBe("created");
  });

  it("emits no task_command_previewed event for an explicit create", async () => {
    // `creation_offered` there means "a mutation matched nothing", the funnel
    // the ADR-055 reader measures; an explicit create must not pollute it
    // (design note §3).
    harness();
    provider(createProposal());

    await startTaskCommand(idleTaskCommandState, form({ commandText: "add a task" }));
    await flushAfter();
    expect(emittedProperties("task_command_previewed")).toBeUndefined();
  });

  it("names the supported surfaces when refusing an out-of-scope creation (2G-ROUTE-004)", async () => {
    harness();
    provider(
      modelProposal({
        outcome: "unsupported",
        action: null,
        unsupportedReason: "unsupported_action",
      }),
    );

    const state = await startTaskCommand(
      idleTaskCommandState,
      form({ commandText: "create a reminder for tomorrow" }),
    );
    expect(state.unsupportedReason).toBe("unsupported_action");
    expect(state.reason).toMatch(/create a new task/i);
    expect(state.reason).toMatch(/reminders, projects, people and events/i);
  });
});

describe("undo", () => {
  it("re-reads the operation and refuses an expired one without calling the router", async () => {
    const bench = harness();
    bench.undoRow = {
      id: UNDO_ID,
      action_type: "apply_task_command",
      entity_ids: [TASK_ID],
      created_at: "2026-07-01T00:00:00.000Z",
      expires_at: "2026-07-02T00:00:00.000Z",
      status: "available",
    };
    const state = await undoTaskCommand(idleTaskCommandState, form({ undoId: UNDO_ID }));

    expect(state.heading).toBe("The undo window has closed");
    expect(bench.rpcCalls.some((call) => call.fn === "undo_operation")).toBe(false);
  });

  it("distinguishes an already-spent operation from an expired one", async () => {
    const bench = harness();
    bench.undoRow = {
      id: UNDO_ID,
      action_type: "apply_task_command",
      entity_ids: [TASK_ID],
      created_at: "2026-07-28T11:00:00.000Z",
      expires_at: "2099-01-01T00:00:00.000Z",
      status: "undone",
    };
    const state = await undoTaskCommand(idleTaskCommandState, form({ undoId: UNDO_ID }));
    expect(state.heading).toBe("Nothing left to undo");
  });

  it("refuses an operation that is not Phase 2E's", async () => {
    const bench = harness();
    bench.undoRow = {
      id: UNDO_ID,
      action_type: "confirm_entry_task_candidates",
      entity_ids: [TASK_ID],
      created_at: "2026-07-28T11:00:00.000Z",
      expires_at: "2099-01-01T00:00:00.000Z",
      status: "available",
    };
    const state = await undoTaskCommand(idleTaskCommandState, form({ undoId: UNDO_ID }));
    expect(state.heading).toBe("Nothing left to undo");
    expect(bench.rpcCalls.some((call) => call.fn === "undo_operation")).toBe(false);
  });

  it("calls the router for an available operation", async () => {
    const bench = harness();
    const state = await undoTaskCommand(idleTaskCommandState, form({ undoId: UNDO_ID }));
    expect(bench.rpcCalls.some((call) => call.fn === "undo_operation")).toBe(true);
    expect(state.heading).toBe("Undone.");
  });
});

/*
 * `2L-EDIT-008` — the Work surfaces' undo.
 *
 * The same mechanism, deliberately reached through this module: the Phase 2L
 * authority census pins which modules may call the shared `undo_operation`
 * router, and a fifth caller beside the Work list would be a second route into
 * a reversal with a second chance to forget the ownership re-read. What is
 * asserted here is that the row is re-read first and that the vocabulary a row
 * can render stays distinct where the domain distinguishes it.
 */
describe("undo, from a Work surface (2L-EDIT-008)", () => {
  const undoForm = (undoId: string) => {
    const data = new FormData();
    data.set("undoId", undoId);
    data.set("locale", "en");
    return data;
  };

  it("calls the router for an available operation and says it is done", async () => {
    const bench = harness();
    const state = await undoWorkOperation(idleTaskUndoState, undoForm(UNDO_ID));

    expect(bench.rpcCalls.some((call) => call.fn === "undo_operation")).toBe(true);
    expect(state.status).toBe("undone");
    expect(state.message).toBe("Undone.");
    // The announcement is the message: a row's undo is one sentence, and a
    // screen-reader user should hear exactly what a sighted one reads.
    expect(state.announcement).toBe(state.message);
  });

  it("refuses an expired operation without calling the router", async () => {
    const bench = harness();
    bench.undoRow = {
      id: UNDO_ID,
      action_type: "apply_task_command",
      entity_ids: [TASK_ID],
      created_at: "2026-07-01T00:00:00.000Z",
      expires_at: "2026-07-02T00:00:00.000Z",
      status: "available",
    };
    const state = await undoWorkOperation(idleTaskUndoState, undoForm(UNDO_ID));

    expect(state.status).toBe("expired");
    expect(bench.rpcCalls.some((call) => call.fn === "undo_operation")).toBe(false);
  });

  it("keeps already-spent and expired distinct, as the domain does", async () => {
    const bench = harness();
    bench.undoRow = {
      id: UNDO_ID,
      action_type: "apply_task_command",
      entity_ids: [TASK_ID],
      created_at: "2026-07-28T11:00:00.000Z",
      expires_at: "2099-01-01T00:00:00.000Z",
      status: "undone",
    };
    const state = await undoWorkOperation(idleTaskUndoState, undoForm(UNDO_ID));

    expect(state.status).toBe("unavailable");
    expect(bench.rpcCalls.some((call) => call.fn === "undo_operation")).toBe(false);
  });

  it("gives one answer for an id that is not the caller's, does not exist, or is not a task command", async () => {
    // 2E-OWNERSHIP-002. The three collapse because the re-read returns nothing
    // in the first two cases and a foreign `action_type` in the third, and a
    // surface that distinguished them would be an existence oracle.
    const bench = harness();
    bench.undoRow = null;
    const missing = await undoWorkOperation(idleTaskUndoState, undoForm(UNDO_ID));

    bench.undoRow = {
      id: UNDO_ID,
      action_type: "confirm_entry_task_candidates",
      entity_ids: [TASK_ID],
      created_at: "2026-07-28T11:00:00.000Z",
      expires_at: "2099-01-01T00:00:00.000Z",
      status: "available",
    };
    const foreign = await undoWorkOperation(idleTaskUndoState, undoForm(UNDO_ID));

    expect(JSON.stringify(missing)).toBe(JSON.stringify(foreign));
    expect(bench.rpcCalls.some((call) => call.fn === "undo_operation")).toBe(false);
  });

  it("reports the outcome through the existing event, with no new name or property", async () => {
    /*
     * `2L-METRICS-002`/`-003`/`-005`. `task_command_undone` already admits
     * `commandOrigin: 'work'` and a closed `undoResult`, both as deployed
     * database constraints — so the Work affordance reports through the
     * vocabulary the console already reports through. A name the deployed CHECK
     * rejects would be a producer that cannot write, which is the defect
     * `2L-METRICS-003` exists to catch.
     */
    const bench = harness();
    await undoWorkOperation(idleTaskUndoState, undoForm(UNDO_ID));
    await Promise.all(
      vi.mocked(after).mock.calls.map(([task]) => (typeof task === "function" ? task() : task)),
    );

    const undone = vi.mocked(recordProductEvent).mock.calls
      .map(([payload]) => payload as unknown as { name: string; properties?: Record<string, unknown> })
      .filter((payload) => payload.name === "task_command_undone");
    expect(undone).toHaveLength(1);
    expect(undone[0].properties?.commandOrigin).toBe("work");
    expect(undone[0].properties?.undoResult).toBe("undone");
    expect(bench.rpcCalls.some((call) => call.fn === "undo_operation")).toBe(true);
  });

  it("maps its one state with no vocabulary member onto the truthful neighbour", async () => {
    // `failed` has no member of its own in the deployed enum. Inventing one
    // would cost a migration; reporting it as `refused` is what the router's
    // own refusals report and is true of what happened.
    const bench = harness();
    bench.undoRow = null;
    await undoWorkOperation(idleTaskUndoState, undoForm(UNDO_ID));
    await Promise.all(
      vi.mocked(after).mock.calls.map(([task]) => (typeof task === "function" ? task() : task)),
    );

    const results = vi.mocked(recordProductEvent).mock.calls
      .map(([payload]) => payload as unknown as { name: string; properties?: Record<string, unknown> })
      .filter((payload) => payload.name === "task_command_undone")
      .map((payload) => payload.properties?.undoResult);
    expect(results).toEqual(["unavailable"]);
  });

  it("refuses a malformed id before it reaches anything", async () => {
    const bench = harness();
    const state = await undoWorkOperation(idleTaskUndoState, undoForm("not-a-uuid"));

    expect(state.status).toBe("failed");
    expect(bench.rpcCalls.some((call) => call.fn === "undo_operation")).toBe(false);
  });
});

describe("the recovery surface", () => {
  it("previews a restore rather than writing it, and records no model provenance", async () => {
    const bench = harness();
    bench.rows = [sqlRow({ status: "cancelled", cancelled_at: "2026-07-20T10:00:00.000Z", title: "gym" })];

    const state = await restoreCancelledTask(
      idleTaskCommandState,
      form({ taskId: TASK_ID, taskTitle: "gym" }),
    );

    expect(getAIProvider).not.toHaveBeenCalled();
    expect(state.control).toBe("apply");
    expect(bench.rpcCalls.some((call) => call.fn === "apply_task_command")).toBe(false);

    const parsed = parseTaskCommandSession(state.session as string);
    expect(parsed.status).toBe("ok");
    if (parsed.status !== "ok") return;
    // 2E-PROVENANCE-001 asks for the model "where a model was involved". None
    // was, and the record says so rather than inventing one.
    expect(parsed.session.model).toBeNull();
    expect(parsed.session.promptVersion).toBeNull();
  });
});

describe("cache revalidation", () => {
  it("refreshes the task surfaces after a write, so the list beside the console is not stale", async () => {
    harness();
    provider(modelProposal());
    const previewed = await startTaskCommand(
      idleTaskCommandState,
      form({ commandText: "mark the report as done" }),
    );
    vi.mocked(revalidatePath).mockClear();
    await applyTaskCommandAction(
      idleTaskCommandState,
      form({ session: previewed.session as string }),
    );

    const paths = vi.mocked(revalidatePath).mock.calls.map(([path]) => path);
    expect(paths).toContain("/en/app/work");
    expect(paths).toContain("/en/app/work/cancelled");
  });

  it("revalidates nothing when the write did not happen", async () => {
    const bench = harness();
    provider(modelProposal());
    const previewed = await startTaskCommand(
      idleTaskCommandState,
      form({ commandText: "mark the report as done" }),
    );
    bench.rows = [sqlRow({ updated_at: "2026-07-28T09:00:00.000Z" })];
    vi.mocked(revalidatePath).mockClear();
    await applyTaskCommandAction(
      idleTaskCommandState,
      form({ session: previewed.session as string }),
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("analytics", () => {
  it("emits only bounded categories, never content", async () => {
    harness();
    provider(modelProposal());
    await startTaskCommand(idleTaskCommandState, form({ commandText: "mark the report as done" }));
    await flushAfter();

    const properties = emittedProperties("task_command_previewed");
    expect(properties).toBeDefined();
    const serialized = JSON.stringify(properties);
    expect(serialized).not.toContain("Send the report");
    expect(serialized).not.toContain("mark the report as done");
    expect(serialized).not.toContain(TASK_ID);
    expect(properties).toMatchObject({
      commandOrigin: "chat",
      candidateCount: 1,
      // The preview's own disposition, not the match verdict: a
      // one-step-eligible match rests at `previewed`, and reporting it as
      // `matched_requires_confirmation` would make PRD §18's first question
      // unanswerable from the event that exists to answer it.
      outcomeCategory: "previewed",
      oneStep: true,
      requiresConfirmation: false,
      policyVersion: expect.stringMatching(/^\d{4}-\d{2}-\d{2}\.\d+$/),
    });
  });

  it("never fails the user's action when telemetry is down", async () => {
    harness();
    provider(modelProposal());
    vi.mocked(recordProductEvent).mockRejectedValue(new Error("telemetry is down"));

    const state = await startTaskCommand(idleTaskCommandState, form({ commandText: "mark the report as done" }));
    await expect(flushAfter()).resolves.not.toThrow();
    expect(state.control).toBe("apply");
  });
});

describe("fault mapping (2E-UX-002)", () => {
  it("renders a state rather than letting a precondition fault escape the action", async () => {
    const bench = harness();
    provider(modelProposal());
    // A row shape the RPC could not have produced: `loadTaskCandidates` raises
    // `TaskCandidateQueryError` on it, and an uncaught raise would drop the
    // user's pending command entirely.
    bench.rows = [sqlRow({ prefilter_tier: 0, token_overlap: 0, query_token_count: 3 })];

    const state = await startTaskCommand(idleTaskCommandState, form({ commandText: "mark the report as done" }));
    expect(state.status).toBe("resolved");
    expect(state.retryable).toBe(true);
    expect(state.reason).toBe("Something went wrong and nothing was changed. Try again.");
  });

  it("refuses an unknown intent instead of falling through to a branch", async () => {
    harness();
    const state = await runTaskCommand(idleTaskCommandState, form({ intent: "delete_everything" }));
    expect(state.reason).toBe("Something went wrong and nothing was changed. Try again.");
  });

  it("refuses a tampered envelope", async () => {
    harness();
    const state = await selectTaskCommandCandidate(
      idleTaskCommandState,
      form({ session: "{\"version\":\"nope\"}", taskId: TASK_ID }),
    );
    expect(state.reason).toBe("Your session expired. Sign in and try again.");
  });
});

describe("the timezone is the caller's own (2E-I18N-002)", () => {
  it("reads it from the profile and not from the envelope", async () => {
    const bench = harness();
    bench.timezone = "Pacific/Kiritimati";
    provider(modelProposal());
    await startTaskCommand(idleTaskCommandState, form({ commandText: "mark the report as done" }));

    expect(
      vi.mocked((bench.client as { from: ReturnType<typeof vi.fn> }).from).mock.calls
        .some(([table]) => table === "profiles"),
    ).toBe(true);
  });

  it("falls back to the product default rather than to the host zone", async () => {
    const bench = harness();
    bench.timezone = null;
    provider(modelProposal());
    const state = await startTaskCommand(idleTaskCommandState, form({ commandText: "mark the report as done" }));
    expect(state.status).toBe("resolved");
  });
});
