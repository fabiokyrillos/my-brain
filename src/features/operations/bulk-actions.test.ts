/**
 * `2L-BULK-006`, `-008`, `-009`, `-010`, `-011`, `-012` — the bulk Server
 * Action, driven end to end against an injected client.
 *
 * A file of its own rather than an appendix to `actions.test.ts`, because what
 * is under test here is a *set* rather than a click: every harness below
 * answers per task id, so "the middle item fails and the rest still apply" is
 * asserted against the RPC calls that actually happened rather than against a
 * stubbed summary.
 *
 * The pure halves — the eligible set, the preview partition and the summary
 * shape — are proved in their own files. What only this level can prove is that
 * the loop does not abort, that each item carries its own key, and that a
 * refusal reaches the result instead of the error boundary.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { recordProductEvent } from "@/features/product-analytics/server";
import { requireUser } from "@/lib/auth/require-user";

import { applyBulkWorkCommand } from "./actions";
import { idleBulkCommandState } from "./bulk-command-state";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));
vi.mock("@/features/rate-limits/server", () => ({
  admitRateLimitedOperation: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/features/product-analytics/server", () => ({
  createProductEventIdempotencyKey: vi.fn(() => "55555555-5555-5555-8555-555555555555"),
  recordProductEvent: vi.fn(async () => ({ accepted: true, recorded: true, eventId: "evt-1", code: "recorded" })),
}));

const USER = "11111111-1111-4111-8111-111111111111";
const ID_A = "aaaaaaaa-1111-4111-8111-111111111111";
const ID_B = "bbbbbbbb-2222-4222-8222-222222222222";
const ID_C = "cccccccc-3333-4333-8333-333333333333";
const OBSERVED = "2026-07-29T11:59:58.000Z";

const key = (n: number) => `${String(n).repeat(8)}-4444-4444-8444-444444444444`;

function candidateRow(taskId: string, overrides: Record<string, unknown> = {}) {
  return {
    task_id: taskId,
    owner_id: USER,
    title: "Enviar proposta",
    description: null,
    status: "todo",
    due_at: null,
    planned_at: null,
    manual_priority: null,
    completed_at: null,
    cancelled_at: null,
    intentional_no_due: false,
    no_due_reason: null,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-28T09:00:00.000Z",
    project_ids: [],
    project_names: [],
    context_ids: [],
    context_names: [],
    person_ids: [],
    person_names: [],
    person_roles: [],
    project_hint_matched: false,
    context_hint_matched: false,
    person_hint_matched: false,
    last_audited_at: null,
    observed_before: OBSERVED,
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

function bulkClient(options: {
  readonly rows: readonly Record<string, unknown>[];
  readonly applyByTask?: Record<string, Record<string, unknown>>;
}) {
  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    if (fn === "list_task_command_candidates") return { data: options.rows, error: null };
    const task = String(args.p_task_id);
    return {
      data: {
        outcome: "applied",
        task_id: task,
        action: args.p_action,
        undo_id: `${task.slice(0, 8)}-9999-4999-8999-999999999999`,
        idempotent: false,
        request_fingerprint: "3b1f0c8a".repeat(8),
        reminders_cancelled: 0,
        reminder_created_id: null,
        undo_expires_at: "2099-07-30T12:00:00.000000+00",
        ...(options.applyByTask?.[task] ?? {}),
      },
      error: null,
    };
  });
  return {
    rpc,
    from: vi.fn(() => ({
      select: vi.fn(function (this: unknown) { return this; }),
      eq: vi.fn(function (this: unknown) { return this; }),
      maybeSingle: vi.fn(async () => ({ data: { timezone: "America/Sao_Paulo" }, error: null })),
    })),
  };
}

type Item = { taskId: string; operationKey?: string };

function bulkForm(items: readonly Item[], fields: Record<string, string> = {}) {
  const data = new FormData();
  data.set("locale", "en");
  data.set("action", "set_priority");
  data.set("value", "high");
  data.set(
    "items",
    JSON.stringify(
      items.map((item, index) => ({
        taskId: item.taskId,
        title: "Enviar proposta",
        operationKey: item.operationKey ?? key(index + 1),
      })),
    ),
  );
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

function applyCalls(client: ReturnType<typeof bulkClient>) {
  return client.rpc.mock.calls
    .filter(([fn]) => fn === "apply_task_command")
    .map(([, args]) => args as { p_task_id: string; p_operation_key: string });
}

async function flushAfter() {
  await Promise.all(
    vi.mocked(after).mock.calls.map(([task]) => (typeof task === "function" ? task() : task)),
  );
}

function useClient(client: unknown) {
  vi.mocked(requireUser).mockResolvedValue({ supabase: client, user: { id: USER } } as never);
}

describe("2L-BULK-008/009: the middle item fails and the rest still apply", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reports n-1 applied and 1 refused with its reason", async () => {
    // The canonical test the plan names a release blocker. B is absent from the
    // resolution result — the shape a task deleted or moved out of scope takes —
    // so it refuses while A and C are written.
    const client = bulkClient({ rows: [candidateRow(ID_A), candidateRow(ID_C)] });
    useClient(client);

    const state = await applyBulkWorkCommand(
      idleBulkCommandState,
      bulkForm([{ taskId: ID_A }, { taskId: ID_B }, { taskId: ID_C }]),
    );

    expect(state.summary?.kind).toBe("partial");
    expect(state.summary?.appliedCount).toBe(2);
    expect(state.summary?.refusedCount).toBe(1);
    expect(state.summary?.notApplied[0]).toMatchObject({ taskId: ID_B, reason: "unresolvable" });
    // And the two applies genuinely reached the RPC, in order, for the right rows.
    expect(applyCalls(client).map((args) => args.p_task_id)).toEqual([ID_A, ID_C]);
  });

  it("never reports a partial as a complete success", async () => {
    useClient(bulkClient({ rows: [candidateRow(ID_A)] }));
    const state = await applyBulkWorkCommand(
      idleBulkCommandState,
      bulkForm([{ taskId: ID_A }, { taskId: ID_B }]),
    );
    expect(state.summary?.kind).toBe("partial");
    expect(state.message).not.toMatch(/^Done/);
  });

  it("reports every item failing as a total failure", async () => {
    useClient(bulkClient({ rows: [] }));
    const state = await applyBulkWorkCommand(
      idleBulkCommandState,
      bulkForm([{ taskId: ID_A }, { taskId: ID_B }]),
    );
    expect(state.summary?.kind).toBe("none_applied");
    expect(state.message).toMatch(/Nothing changed/);
  });
});

describe("2L-BULK-010/012: keys and reversal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("carries one operation key per item", async () => {
    const client = bulkClient({ rows: [candidateRow(ID_A), candidateRow(ID_B)] });
    useClient(client);

    await applyBulkWorkCommand(idleBulkCommandState, bulkForm([{ taskId: ID_A }, { taskId: ID_B }]));

    const keys = applyCalls(client).map((args) => args.p_operation_key);
    expect(new Set(keys).size).toBe(2);
  });

  it("offers undo for the applied subset only", async () => {
    const client = bulkClient({
      rows: [candidateRow(ID_A), candidateRow(ID_B)],
      applyByTask: {
        [ID_B]: {
          outcome: "no_change",
          undo_id: null,
          undo_expires_at: null,
          request_fingerprint: null,
        },
      },
    });
    useClient(client);

    const state = await applyBulkWorkCommand(
      idleBulkCommandState,
      bulkForm([{ taskId: ID_A }, { taskId: ID_B }]),
    );

    expect(state.summary?.undoable.map((item) => item.taskId)).toEqual([ID_A]);
    expect(state.summary?.unchangedCount).toBe(1);
  });
});

describe("2L-BULK-003/004/006: what the boundary refuses before reading anything", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses the destructive verb, so its confirmation arm is unreachable", async () => {
    const client = bulkClient({ rows: [candidateRow(ID_A)] });
    useClient(client);

    const state = await applyBulkWorkCommand(
      idleBulkCommandState,
      bulkForm([{ taskId: ID_A }], { action: "cancel_task", value: "" }),
    );

    expect(state.status).toBe("refused");
    expect(state.summary).toBeNull();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("refuses a free-text verb, which OD-2L-3 A excludes", async () => {
    const client = bulkClient({ rows: [candidateRow(ID_A)] });
    useClient(client);

    const state = await applyBulkWorkCommand(
      idleBulkCommandState,
      bulkForm([{ taskId: ID_A }], { action: "rename_task", value: "novo título" }),
    );

    expect(state.status).toBe("refused");
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("refuses a set above the ceiling rather than truncating it", async () => {
    const client = bulkClient({ rows: [] });
    useClient(client);
    const tooMany = Array.from({ length: 51 }, (_, index) => ({
      taskId: `aaaaaaaa-1111-4111-8111-${String(index).padStart(12, "0")}`,
      operationKey: `bbbbbbbb-2222-4222-8222-${String(index).padStart(12, "0")}`,
    }));

    const state = await applyBulkWorkCommand(idleBulkCommandState, bulkForm(tooMany));

    expect(state.status).toBe("refused");
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("refuses a duplicated task id, which is not a set anybody selected", async () => {
    const client = bulkClient({ rows: [candidateRow(ID_A)] });
    useClient(client);

    const state = await applyBulkWorkCommand(
      idleBulkCommandState,
      bulkForm([
        { taskId: ID_A, operationKey: key(1) },
        { taskId: ID_A, operationKey: key(2) },
      ]),
    );

    expect(state.status).toBe("refused");
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("refuses one bad value once, rather than fifty times", async () => {
    const client = bulkClient({ rows: [candidateRow(ID_A)] });
    useClient(client);

    const state = await applyBulkWorkCommand(
      idleBulkCommandState,
      bulkForm([{ taskId: ID_A }, { taskId: ID_B }], { value: "not-a-priority" }),
    );

    expect(state.status).toBe("refused");
    expect(client.rpc).not.toHaveBeenCalled();
  });
});

describe("what a bulk run leaves behind", () => {
  beforeEach(() => vi.clearAllMocks());

  it("revalidates the Work surfaces only when something was applied", async () => {
    useClient(bulkClient({ rows: [] }));
    await applyBulkWorkCommand(idleBulkCommandState, bulkForm([{ taskId: ID_A }]));
    expect(revalidatePath).not.toHaveBeenCalled();

    vi.clearAllMocks();
    useClient(bulkClient({ rows: [candidateRow(ID_A)] }));
    await applyBulkWorkCommand(idleBulkCommandState, bulkForm([{ taskId: ID_A }]));
    expect(revalidatePath).toHaveBeenCalled();
  });

  it("emits the existing applied event once per applied item, and invents no name", async () => {
    // `2L-METRICS-*` belongs to slice 2L.5, and this slice declares nothing:
    // a bulk apply reports through the event a single apply already reports
    // through, so the funnel stays truthful without a vocabulary change.
    useClient(bulkClient({ rows: [candidateRow(ID_A), candidateRow(ID_B)] }));

    await applyBulkWorkCommand(idleBulkCommandState, bulkForm([{ taskId: ID_A }, { taskId: ID_B }]));
    await flushAfter();

    const names = vi.mocked(recordProductEvent).mock.calls.map(
      ([payload]) => (payload as unknown as { name: string }).name,
    );
    expect(names).toEqual(["task_command_applied", "task_command_applied"]);
  });
});
