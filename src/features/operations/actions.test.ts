/**
 * The Work surface's Server Actions.
 *
 * Slice 2F.2 replaced the mechanism this file used to test. Until then,
 * `applyWorkItemAction` delegated to `persistTaskStatus`, which read the current
 * status, wrote `public.tasks` directly, and returned `void` — so the assertions
 * were about a `.update()` call shape and about which product event followed it.
 * Both the writer and its only other caller (`updateTaskStatus`) are gone
 * (2F-SURFACE-012/013), and what replaces them is a click-time resolution
 * through `list_task_command_candidates` followed by `apply_task_command`.
 *
 * What is asserted here is therefore the *surface's* contract: which rendered
 * state each outcome produces, which analytics each emits, and that a refusal
 * revalidates nothing. The resolution mechanism itself is covered by
 * `task-commands/work-command.test.ts`, against injected clients.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createProductEventIdempotencyKey, recordProductEvent } from "@/features/product-analytics/server";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { applyWorkItemAction, createRecord } from "./actions";
import { idleWorkItemActionState } from "./work-action-state";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));
vi.mock("@/features/product-analytics/server", () => ({
  createProductEventIdempotencyKey: vi.fn(() => "55555555-5555-5555-8555-555555555555"),
  recordProductEvent: vi.fn(async () => ({ accepted: true, recorded: true, eventId: "evt-1", code: "recorded" })),
}));

const taskId = "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6";
const userId = "11111111-1111-4111-8111-111111111111";
const operationKey = "6118fb25-2f80-432a-aa96-0e76d924862e";
const observed = "2026-07-29T11:59:58.000Z";
const title = "Enviar proposta";

function taskClient() {
  const insert = vi.fn(async () => ({ error: null }));
  const from = vi.fn(() => ({
    insert,
    select: vi.fn(function (this: unknown) { return this; }),
    eq: vi.fn(function (this: unknown) { return this; }),
    maybeSingle: vi.fn(async () => ({ data: { timezone: "America/Sao_Paulo" }, error: null })),
  }));
  return {
    client: {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: userId } } })) },
      from,
    },
    insert,
  };
}

function candidateRow(overrides: Record<string, unknown> = {}) {
  return {
    task_id: taskId,
    owner_id: userId,
    title,
    description: null,
    status: "waiting",
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
    observed_before: observed,
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

/** A client that answers the profile read, the resolution RPC and the apply RPC. */
function workClient(options: {
  readonly rows?: readonly Record<string, unknown>[];
  readonly apply?: Record<string, unknown>;
} = {}) {
  const rows = options.rows ?? [candidateRow()];
  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    if (fn === "list_task_command_candidates") return { data: rows, error: null };
    return {
      data: {
        outcome: "applied",
        task_id: taskId,
        action: args.p_action,
        undo_id: "44444444-4444-4444-8444-444444444444",
        idempotent: false,
        request_fingerprint: "3b1f0c8a".repeat(8),
        reminders_cancelled: 0,
        reminder_created_id: null,
        undo_expires_at: "2026-07-30T12:00:00.000000+00",
        ...(options.apply ?? {}),
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

/**
 * The payloads `recordProductEvent` was called with.
 *
 * The module mock replaces the function with a zero-argument `vi.fn`, so the
 * real parameter type is gone and the calls read as `unknown`. Narrowing once,
 * here, is what keeps every assertion below reading the two fields it is about
 * rather than restating a cast.
 */
function emittedPayloads(): { name: string; properties?: unknown }[] {
  return vi.mocked(recordProductEvent).mock.calls.map(
    ([payload]) => payload as unknown as { name: string; properties?: unknown },
  );
}

async function flushAfter() {
  await Promise.all(vi.mocked(after).mock.calls.map(([task]) => (typeof task === "function" ? task() : task)));
}

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function workForm(overrides: Record<string, string> = {}) {
  return form({ taskId, locale: "pt-BR", action: "resume_task", title, operationKey, ...overrides });
}

function useWorkClient(options: Parameters<typeof workClient>[0] = {}) {
  const client = workClient(options);
  vi.mocked(requireUser).mockResolvedValue({ supabase: client, user: { id: userId } } as never);
  return client;
}

describe("manual creation revalidation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("revalidates canonical Work in both locales after manual task creation", async () => {
    const { client } = taskClient();
    vi.mocked(createClient).mockResolvedValue(client as never);

    await createRecord(
      { status: "idle", message: "" },
      form({ kind: "task", locale: "pt-BR", name: "Enviar proposta" }),
    );

    expect(revalidatePath).toHaveBeenCalledWith("/pt-BR/app/work");
    expect(revalidatePath).toHaveBeenCalledWith("/en/app/work");
  });
});

describe("2F-SURFACE-001 — the Work buttons route through apply_task_command", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves at click time and applies, calling the two RPCs and nothing else", async () => {
    const client = useWorkClient();

    const state = await applyWorkItemAction(idleWorkItemActionState, workForm());

    expect(state.status).toBe("applied");
    expect(client.rpc.mock.calls.map(([fn]) => fn)).toEqual([
      "list_task_command_candidates",
      "apply_task_command",
    ]);
  });

  it("renders the title resolution returned, not the one the row was rendered with", async () => {
    useWorkClient({ rows: [candidateRow({ title: "Renomeada em outro lugar" })] });

    const state = await applyWorkItemAction(idleWorkItemActionState, workForm({ title: "Título antigo" }));

    expect(state.status).toBe("applied");
    expect(state.title).toBe("Renomeada em outro lugar");
  });

  it("revalidates canonical Work in both locales after an applied command", async () => {
    useWorkClient();

    await applyWorkItemAction(idleWorkItemActionState, workForm({ locale: "en" }));

    expect(revalidatePath).toHaveBeenCalledWith("/pt-BR/app/work");
    expect(revalidatePath).toHaveBeenCalledWith("/en/app/work");
  });

  it("reports a no-change as its own outcome and revalidates nothing", async () => {
    useWorkClient({
      apply: {
        outcome: "no_change",
        undo_id: null,
        idempotent: false,
        request_fingerprint: null,
        reminders_cancelled: 0,
        reminder_created_id: null,
        undo_expires_at: null,
      },
    });

    const state = await applyWorkItemAction(idleWorkItemActionState, workForm());

    expect(state.status).toBe("no_change");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("2F-SURFACE-005/011 — refusals render, and write nothing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses an unresolvable click with a localized refresh affordance", async () => {
    const client = useWorkClient({ rows: [] });

    const state = await applyWorkItemAction(idleWorkItemActionState, workForm());

    expect(state.status).toBe("refused");
    expect(state.refreshable).toBe(true);
    expect(state.retryable).toBe(true);
    expect(state.heading).toBe("Esta tarefa não está mais aqui");
    // Never applied, and no surface was revalidated for a write that never happened.
    expect(client.rpc.mock.calls.map(([fn]) => fn)).toEqual(["list_task_command_candidates"]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("localizes the same refusal in English", async () => {
    useWorkClient({ rows: [] });

    const state = await applyWorkItemAction(idleWorkItemActionState, workForm({ locale: "en" }));

    expect(state.heading).toBe("This task is no longer here");
  });

  it("carries no task content on a refusal", async () => {
    useWorkClient({ rows: [] });

    const state = await applyWorkItemAction(idleWorkItemActionState, workForm());

    expect(state.title).toBeNull();
  });

  it("renders a malformed request rather than throwing out of the Server Action", async () => {
    useWorkClient();

    const state = await applyWorkItemAction(idleWorkItemActionState, workForm({ taskId: "not-a-uuid" }));

    expect(state.status).toBe("failed");
    expect(state.retryable).toBe(true);
  });

  it("announces the outcome for a screen reader on every settled state", async () => {
    useWorkClient({ rows: [] });

    const state = await applyWorkItemAction(idleWorkItemActionState, workForm());

    expect(state.announcement).toBe(`${state.heading}. ${state.detail}`);
    expect(state.announcement.length).toBeGreaterThan(0);
  });
});

describe("2F-ANALYTICS-001/002 — what the surface reports", () => {
  beforeEach(() => vi.clearAllMocks());

  it("emits task_command_applied with commandOrigin 'work' and no new event name", async () => {
    useWorkClient();

    await applyWorkItemAction(idleWorkItemActionState, workForm());
    expect(recordProductEvent).not.toHaveBeenCalled();
    await flushAfter();

    expect(recordProductEvent).toHaveBeenCalledWith(expect.objectContaining({
      name: "task_command_applied",
      // The event family, exactly as the chat mount sends it; the *property*
      // names the mount (2F-ANALYTICS-002).
      surface: "task_command",
      properties: expect.objectContaining({
        commandOrigin: "work",
        outcomeCategory: "applied",
        applyRoute: "direct",
        replayed: false,
      }),
    }));
  });

  it("emits task_status_changed with its current allowlisted shape", async () => {
    useWorkClient();

    await applyWorkItemAction(idleWorkItemActionState, workForm());
    await flushAfter();

    expect(recordProductEvent).toHaveBeenCalledWith(expect.objectContaining({
      name: "task_status_changed",
      surface: "work",
      subject: { type: "task", id: taskId },
      // From the click-time pre-state and the canonical patch — the same pair the
      // fingerprint bound, not a separate read.
      properties: { fromStatus: "waiting", toStatus: "todo" },
    }));
    expect(createProductEventIdempotencyKey).toHaveBeenCalledWith("task_status_changed", operationKey);
  });

  it("emits no status transition when nothing changed", async () => {
    useWorkClient({
      apply: {
        outcome: "no_change",
        undo_id: null,
        idempotent: false,
        request_fingerprint: null,
        reminders_cancelled: 0,
        reminder_created_id: null,
        undo_expires_at: null,
      },
    });

    await applyWorkItemAction(idleWorkItemActionState, workForm());
    await flushAfter();

    const names = emittedPayloads().map((payload) => payload.name);
    expect(names).toContain("task_command_applied");
    expect(names).not.toContain("task_status_changed");
  });

  it("emits nothing at all for a refused click", async () => {
    useWorkClient({ rows: [] });

    await applyWorkItemAction(idleWorkItemActionState, workForm());
    await flushAfter();

    expect(recordProductEvent).not.toHaveBeenCalled();
  });

  it("reports a replay as replayed rather than as a second apply", async () => {
    useWorkClient({ apply: { idempotent: true } });

    await applyWorkItemAction(idleWorkItemActionState, workForm());
    await flushAfter();

    expect(recordProductEvent).toHaveBeenCalledWith(expect.objectContaining({
      name: "task_command_applied",
      properties: expect.objectContaining({ replayed: true }),
    }));
  });

  it("carries no task or reminder content in any payload (2F-ANALYTICS-003)", async () => {
    useWorkClient();

    await applyWorkItemAction(idleWorkItemActionState, workForm());
    await flushAfter();

    for (const payload of emittedPayloads()) {
      expect(JSON.stringify(payload.properties ?? {})).not.toContain(title);
    }
  });
});
