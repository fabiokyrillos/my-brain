/**
 * Slice D2 — the task detail surface's Server Action.
 *
 * `detail-command.test.ts` covers the resolution mechanism against injected
 * clients. What is asserted here is the *surface's* contract:
 *
 *   * which rendered, localized state each outcome produces,
 *   * that a destructive edit **cannot** reach the write on the direct route,
 *     and that its confirmation is issued by the call that renders the prompt,
 *   * that the confirm call reproduces the issuing call's instant, because the
 *     fingerprint the confirmation is bound to hashes it,
 *   * which analytics each round emits, and that a refusal revalidates nothing,
 *   * that nothing throws out of the action.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { recordProductEvent } from "@/features/product-analytics/server";
import { requireUser } from "@/lib/auth/require-user";
import { applyTaskDetailCommand } from "./detail-actions";
import { idleTaskDetailCommandState } from "./detail-action-state";
import { getTaskDetailControlsCopy } from "./detail-controls-copy";
import { getTaskCommandCopy } from "./copy";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));
vi.mock("@/features/product-analytics/server", () => ({
  createProductEventIdempotencyKey: vi.fn(() => "55555555-5555-5555-8555-555555555555"),
  recordProductEvent: vi.fn(async () => ({ accepted: true, recorded: true, eventId: "evt-1", code: "recorded" })),
}));

const taskId = "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6";
const userId = "11111111-1111-4111-8111-111111111111";
const operationKey = "6118fb25-2f80-432a-aa96-0e76d924862e";
const projectId = "66666666-6666-4666-8666-666666666666";
const title = "Enviar a proposta da Aurora";
const ptBR = getTaskDetailControlsCopy("pt-BR");
const en = getTaskDetailControlsCopy("en");

function candidateRow(overrides: Record<string, unknown> = {}) {
  return {
    task_id: taskId,
    owner_id: userId,
    title,
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
    // Echoed back by the query's own `refs` CTE, so it equals whatever
    // `p_observed_before` the caller sent. The double below reproduces that
    // rather than pinning a constant, because the whole confirmation flow turns
    // on the two calls agreeing on this value.
    observed_before: null,
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

type Call = { readonly fn: string; readonly args: Record<string, unknown> };

function detailClient(options: {
  readonly rows?: readonly Record<string, unknown>[];
  readonly apply?: Record<string, unknown>;
  readonly applyError?: { message: string; code?: string; details?: string };
  readonly confirmError?: { message: string; code?: string; details?: string };
} = {}) {
  const calls: Call[] = [];
  const rows = options.rows ?? [candidateRow()];
  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, args });
    if (fn === "list_task_command_candidates") {
      return {
        data: rows.map((row) => ({
          ...row,
          // The RPC cross-joins the instant it was given onto every row.
          observed_before: row.observed_before ?? args.p_observed_before,
        })),
        error: null,
      };
    }
    if (fn === "issue_task_command_confirmation") {
      if (options.confirmError) return { data: null, error: options.confirmError };
      return {
        data: {
          confirmation_id: "99999999-9999-4999-8999-999999999999",
          task_id: taskId,
          action: "cancel_task",
          request_fingerprint: "3b1f0c8a".repeat(8),
          status: "issued",
          replayed: false,
        },
        error: null,
      };
    }
    if (options.applyError) return { data: null, error: options.applyError };
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
        undo_expires_at: "2026-07-31T12:00:00.000000+00",
        ...(options.apply ?? {}),
      },
      error: null,
    };
  });
  return {
    calls,
    rpc,
    from: vi.fn(() => ({
      select: vi.fn(function (this: unknown) { return this; }),
      eq: vi.fn(function (this: unknown) { return this; }),
      maybeSingle: vi.fn(async () => ({ data: { timezone: "America/Sao_Paulo" }, error: null })),
    })),
  };
}

function withClient(options: Parameters<typeof detailClient>[0] = {}) {
  const client = detailClient(options);
  vi.mocked(requireUser).mockResolvedValue({ supabase: client, user: { id: userId } } as never);
  return client;
}

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function detailForm(overrides: Record<string, string> = {}) {
  return form({
    intent: "apply",
    taskId,
    locale: "pt-BR",
    action: "rename_task",
    title,
    operationKey,
    value: "Enviar a proposta revisada",
    ...overrides,
  });
}

function run(overrides: Record<string, string> = {}) {
  return applyTaskDetailCommand(idleTaskDetailCommandState, detailForm(overrides));
}

function emittedPayloads(): { name: string; properties?: unknown }[] {
  return vi.mocked(recordProductEvent).mock.calls.map(
    ([payload]) => payload as unknown as { name: string; properties?: unknown },
  );
}

async function flushAfter() {
  await Promise.all(
    vi.mocked(after).mock.calls.map(([task]) => (typeof task === "function" ? task() : task)),
  );
}

function fns(client: { calls: Call[] }): string[] {
  return client.calls.map((call) => call.fn);
}

describe("the direct route applies a non-destructive edit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves and applies, calling those two RPCs and nothing else", async () => {
    const client = withClient();
    const state = await run();

    expect(state.status).toBe("applied");
    expect(fns(client)).toEqual(["list_task_command_candidates", "apply_task_command"]);
  });

  it("titles the outcome from the shared command vocabulary, in both locales", async () => {
    withClient();
    expect((await run()).heading).toBe(getTaskCommandCopy("pt-BR").outcomes.applied.title);

    withClient();
    expect((await run({ locale: "en" })).heading).toBe(getTaskCommandCopy("en").outcomes.applied.title);
  });

  it("reports a no-change as its own outcome and revalidates nothing", async () => {
    withClient({
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
    const state = await run();

    expect(state.status).toBe("no_change");
    expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled();
  });

  it("revalidates the detail route itself, in both locales, after an applied edit", async () => {
    withClient();
    await run();

    const paths = vi.mocked(revalidatePath).mock.calls.map(([path]) => path);
    expect(paths).toContain(`/pt-BR/app/work/${taskId}`);
    expect(paths).toContain(`/en/app/work/${taskId}`);
    expect(paths).toContain("/pt-BR/app/work");
  });

  it("sends the caller's own timezone-resolved date, never a client instant", async () => {
    const client = withClient();
    const state = await run({ action: "reschedule_due", value: "2026-08-15" });

    expect(state.status).toBe("applied");
    const apply = client.calls.find((call) => call.fn === "apply_task_command");
    const patch = apply?.args.p_patch as { dueAt: string };
    const local = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" })
      .format(new Date(patch.dueAt));
    expect(local).toBe("2026-08-15");
  });

  it("carries a relation reference to SQL and applies the id it resolved", async () => {
    const client = withClient({ rows: [candidateRow({ project_ref_id: projectId })] });
    const state = await run({ action: "assign_project", value: "Aurora" });

    expect(state.status).toBe("applied");
    const list = client.calls.find((call) => call.fn === "list_task_command_candidates");
    expect(list?.args.p_project_ref).toBe("Aurora");
    const apply = client.calls.find((call) => call.fn === "apply_task_command");
    expect(apply?.args.p_patch).toEqual({ projectId });
  });
});

describe("2E-DESTRUCTIVE-002/003 — the destructive verb cannot be applied directly", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses cancel_task on the direct route without reading anything", async () => {
    const client = withClient();
    const state = await run({ action: "cancel_task", intent: "apply", value: "" });

    expect(state.status).toBe("refused");
    expect(client.calls).toHaveLength(0);
  });

  it("refuses a non-destructive verb on the confirmation route", async () => {
    // Issuing a confirmation for an action that needs none would strand a row no
    // apply can consume, which `issueTaskCommandConfirmation` raises as a caller
    // defect rather than rendering.
    const client = withClient();
    const state = await run({ intent: "request_cancel" });

    expect(state.status).toBe("refused");
    expect(client.calls).toHaveLength(0);
  });

  it("issues the confirmation and stops there, writing nothing", async () => {
    const client = withClient();
    const state = await run({ action: "cancel_task", intent: "request_cancel", value: "" });

    expect(state.status).toBe("awaiting_confirmation");
    expect(state.heading).toBe(ptBR.confirm.pendingHeading);
    expect(fns(client)).toEqual([
      "list_task_command_candidates",
      "issue_task_command_confirmation",
    ]);
    expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled();
  });

  it("hands back the operation key and the instant the digest was derived from", async () => {
    const client = withClient();
    const state = await run({ action: "cancel_task", intent: "request_cancel", value: "" });

    const issue = client.calls.find((call) => call.fn === "issue_task_command_confirmation");
    expect(state.pending?.operationKey).toBe(operationKey);
    expect(state.pending?.observedBefore).toBe(issue?.args.p_observed_before);
    // The title resolution returned, never the one the page was rendered with.
    expect(state.pending?.title).toBe(title);
  });

  it("names the task in the pending state so the dialog can say what will change", async () => {
    withClient({ rows: [candidateRow({ title: "Outro título" })] });
    const state = await run({ action: "cancel_task", intent: "request_cancel", value: "" });
    expect(state.pending?.title).toBe("Outro título");
  });

  it("applies on confirm, reproducing the carried instant exactly", async () => {
    const carried = new Date(Date.now() - 2_000).toISOString();
    const client = withClient();
    const state = await run({
      action: "cancel_task",
      intent: "confirm_cancel",
      value: "",
      observedBefore: carried,
    });

    expect(state.status).toBe("applied");
    const apply = client.calls.find((call) => call.fn === "apply_task_command");
    // 2E-PREVIEW-004: `task_command_fingerprint` hashes `observedBefore`, so a
    // second instant would derive a digest matching no issued confirmation.
    expect(apply?.args.p_observed_before).toBe(carried);
    expect(apply?.args.p_patch).toEqual({ status: "cancelled" });
  });

  it("refuses a confirm carrying no instant at all", async () => {
    const client = withClient();
    const state = await run({ action: "cancel_task", intent: "confirm_cancel", value: "" });

    expect(state.status).toBe("refused");
    expect(state.refreshable).toBe(true);
    expect(client.calls).toHaveLength(0);
  });

  it("refuses a confirm whose instant is malformed, in the future, or long expired", async () => {
    for (const observedBefore of [
      "not an instant",
      "2026-07-30",
      new Date(Date.now() + 60_000).toISOString(),
      new Date(Date.now() - 60 * 60_000).toISOString(),
    ]) {
      const client = withClient();
      const state = await run({
        action: "cancel_task",
        intent: "confirm_cancel",
        value: "",
        observedBefore,
      });
      expect(state.status, observedBefore).toBe("refused");
      expect(client.calls, observedBefore).toHaveLength(0);
    }
  });

  it("renders the declared failure when the database refuses the confirmation gate", async () => {
    withClient({
      applyError: { message: "confirmation required", code: "P0001", details: "2E_CONFIRMATION_REQUIRED" },
    });
    const state = await run({
      action: "cancel_task",
      intent: "confirm_cancel",
      value: "",
      observedBefore: new Date().toISOString(),
    });

    expect(state.status).toBe("failed");
    expect(state.reason).toBe(getTaskCommandCopy("pt-BR").failures["2E_CONFIRMATION_REQUIRED"]);
  });

  it("reports a failed issuance as a failure rather than opening a prompt", async () => {
    withClient({ confirmError: { message: "not yours", code: "P0002" } });
    const state = await run({ action: "cancel_task", intent: "request_cancel", value: "" });

    expect(state.status).toBe("failed");
    expect(state.pending).toBeNull();
  });
});

describe("refusals render, are localized, and write nothing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses an unresolvable task with a reload affordance, in both locales", async () => {
    const client = withClient({ rows: [] });
    const state = await run();

    expect(state.status).toBe("refused");
    expect(state.heading).toBe(ptBR.rowRefusals.unresolvable.title);
    expect(state.refreshable).toBe(true);
    expect(fns(client)).toEqual(["list_task_command_candidates"]);

    withClient({ rows: [] });
    expect((await run({ locale: "en" })).heading).toBe(en.rowRefusals.unresolvable.title);
  });

  it("refuses an action the row's status no longer admits", async () => {
    const client = withClient({ rows: [candidateRow({ status: "completed" })] });
    const state = await run({ action: "set_priority", value: "high" });

    expect(state.heading).toBe(ptBR.rowRefusals.ineligible.title);
    expect(fns(client)).toEqual(["list_task_command_candidates"]);
  });

  it("refuses an unresolved relation with the sentence the preview path already had", async () => {
    const client = withClient({ rows: [candidateRow({ project_ref_id: null })] });
    const state = await run({ action: "assign_project", value: "Aurora" });

    expect(state.status).toBe("refused");
    expect(state.heading)
      .toBe(getTaskCommandCopy("pt-BR").refusals.relation_reference_unresolved.title);
    expect(fns(client)).toEqual(["list_task_command_candidates"]);
  });

  it("names the control's own reason for an empty required field, before any read", async () => {
    const client = withClient();
    const state = await run({ value: "   " });

    expect(state.reason).toBe(ptBR.valueRefusals.missing_value);
    expect(client.calls).toHaveLength(0);
  });

  it("separates a malformed date from one outside the window, in both locales", async () => {
    withClient();
    expect((await run({ action: "reschedule_due", value: "15/08/2026" })).reason)
      .toBe(ptBR.valueRefusals.date_invalid);

    withClient();
    expect((await run({ action: "set_planned", value: "2035-01-01" })).reason)
      .toBe(ptBR.valueRefusals.date_out_of_range);

    withClient();
    expect((await run({ action: "set_planned", value: "2035-01-01", locale: "en" })).reason)
      .toBe(en.valueRefusals.date_out_of_range);
  });

  it("refuses a choice outside the policy's closed set before any read", async () => {
    const client = withClient();
    const state = await run({ action: "set_priority", value: "catastrófica" });

    expect(state.reason).toBe(ptBR.valueRefusals.value_not_allowed);
    expect(client.calls).toHaveLength(0);
  });

  it("refuses a status the action may not reach, closing the unconfirmed route", async () => {
    const client = withClient();
    const state = await run({ action: "set_status", value: "cancelled" });

    expect(state.status).toBe("refused");
    expect(client.calls).toHaveLength(0);
  });

  it("renders a stale pre-state as a reloadable failure rather than overwriting", async () => {
    withClient({ applyError: { message: "moved", code: "55P03" } });
    const state = await run();

    expect(state.status).toBe("failed");
    expect(state.reason).toBe(getTaskCommandCopy("pt-BR").failures.stale_pre_state);
    expect(state.refreshable).toBe(true);
  });

  it("renders a malformed request rather than throwing out of the Server Action", async () => {
    withClient();
    const state = await applyTaskDetailCommand(
      idleTaskDetailCommandState,
      form({ intent: "apply", taskId: "not-a-uuid", locale: "pt-BR", action: "rename_task", title, operationKey }),
    );

    expect(state.status).toBe("failed");
    expect(state.detail).toBe(ptBR.unexpected);
  });

  it("announces heading, detail and reason together on every settled state", async () => {
    withClient();
    const applied = await run();
    expect(applied.announcement).toContain(applied.heading);

    withClient();
    const refused = await run({ value: "" });
    expect(refused.announcement).toContain(ptBR.valueRefusals.missing_value);
  });
});

describe("2F-ANALYTICS-001/002 — what the surface reports", () => {
  beforeEach(() => vi.clearAllMocks());

  it("emits task_command_applied with commandOrigin 'work' and the direct route", async () => {
    withClient();
    await run();
    await flushAfter();

    const applied = emittedPayloads().find((event) => event.name === "task_command_applied");
    expect(applied?.properties).toMatchObject({
      commandOrigin: "work",
      applyRoute: "direct",
      outcomeCategory: "applied",
      replayed: false,
    });
  });

  it("reports the confirmed route for the verb that spends a confirmation", async () => {
    withClient();
    await run({
      action: "cancel_task",
      intent: "confirm_cancel",
      value: "",
      observedBefore: new Date().toISOString(),
    });
    await flushAfter();

    const applied = emittedPayloads().find((event) => event.name === "task_command_applied");
    expect(applied?.properties).toMatchObject({ applyRoute: "confirmed" });
  });

  it("emits task_status_changed only when the status actually moved", async () => {
    withClient();
    await run({
      action: "cancel_task",
      intent: "confirm_cancel",
      value: "",
      observedBefore: new Date().toISOString(),
    });
    await flushAfter();

    const moved = emittedPayloads().find((event) => event.name === "task_status_changed");
    expect(moved?.properties).toEqual({ fromStatus: "todo", toStatus: "cancelled" });
  });

  it("emits no status transition for an edit that moves no status", async () => {
    withClient();
    await run();
    await flushAfter();

    expect(emittedPayloads().map((event) => event.name)).not.toContain("task_status_changed");
  });

  it("emits nothing at all for a refused round", async () => {
    withClient({ rows: [] });
    await run();
    await flushAfter();

    expect(emittedPayloads()).toHaveLength(0);
  });

  it("reports a replay as replayed rather than as a second apply", async () => {
    withClient({ apply: { idempotent: true } });
    await run();
    await flushAfter();

    const applied = emittedPayloads().find((event) => event.name === "task_command_applied");
    expect(applied?.properties).toMatchObject({ replayed: true });
  });
});
