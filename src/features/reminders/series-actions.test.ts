import { describe, expect, it, vi, beforeEach } from "vitest";

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => revalidatePath(path) }));

const rpc = vi.fn();
const requireUser = vi.fn();
const assertActiveAccount = vi.fn();
vi.mock("@/lib/auth/require-user", () => ({
  requireUser: (locale: string) => requireUser(locale),
  assertActiveAccount: (...args: unknown[]) => assertActiveAccount(...args),
}));

import { getReminderCopy } from "./copy";
import { applyReminderSeriesCommand, undoReminderSeriesOperation } from "./series-actions";
import { IDLE_REMINDER_SERIES_STATE } from "./series-action-state";

/**
 * The write half of slice 2R.2 — what the action does with what the RPC returns.
 *
 * ## Why the mapping is worth a test of its own
 *
 * Everything the database does is proved in pgTAP against real Postgres. What
 * lives here is the layer between: which sentence the owner reads, which scope
 * is reported, and — the one that carries a requirement — whether an operation
 * is *offered* a reversal at all.
 *
 * `2R-SERIES-008` is enforced by `undoId` being a pass-through. A test that
 * asserted "the action returns an undo id" would pass on an action that minted
 * one, so the cases below drive the RPC returning **no** id and assert the
 * action does not invent it. That is the direction the requirement runs in.
 */

const SERIES_ID = "77777777-7777-4777-8777-777777777777";
const UNDO_ID = "99999999-9999-4999-8999-999999999999";
const copy = getReminderCopy("pt-BR").series;

beforeEach(() => {
  rpc.mockReset();
  revalidatePath.mockReset();
  requireUser.mockReset();
  assertActiveAccount.mockReset();
  requireUser.mockResolvedValue({
    supabase: { rpc: (name: string, args: unknown) => rpc(name, args) },
    user: { id: "11111111-1111-4111-8111-111111111111" },
  });
  assertActiveAccount.mockResolvedValue(undefined);
});

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

const submission = (overrides: Record<string, string> = {}) =>
  form({
    locale: "pt-BR",
    seriesId: SERIES_ID,
    operationKey: "r2-occurrence-abcdefgh",
    scope: "occurrence",
    ...overrides,
  });

describe("applying a scope", () => {
  it("maps the scope word to a command in exactly one place", async () => {
    rpc.mockResolvedValue({ data: { scope: "occurrence", undo_id: UNDO_ID }, error: null });
    await applyReminderSeriesCommand(IDLE_REMINDER_SERIES_STATE, submission());

    const [name, args] = rpc.mock.calls[0] as [string, { p_command: { kind: string } }];
    expect(name).toBe("apply_reminder_series_command_v1");
    // `occurrence` is `detach_occurrence`, and the surface never spelled that.
    expect(args.p_command.kind).toBe("detach_occurrence");
  });

  it("sends `edit_future` only for the wider scope", async () => {
    rpc.mockResolvedValue({ data: { scope: "future", undo_id: UNDO_ID }, error: null });
    await applyReminderSeriesCommand(
      IDLE_REMINDER_SERIES_STATE,
      submission({ scope: "future", title: "Novo título", anchorTime: "07:30" }),
    );

    const [, args] = rpc.mock.calls[0] as [
      string,
      { p_command: { kind: string; title?: string; hour?: number; minute?: number } },
    ];
    expect(args.p_command.kind).toBe("edit_future");
    expect(args.p_command.title).toBe("Novo título");
    // The wall clock is split here and resolved in the owner's zone by the RPC.
    // No instant is computed on this side — `2R-TIME-007`.
    expect(args.p_command.hour).toBe(7);
    expect(args.p_command.minute).toBe(30);
  });

  it("reports the scope the database applied, not the one submitted", async () => {
    // The disagreement case. Echoing the request would report it away.
    //
    // The submission carries a title because an `edit_future` that changes
    // nothing is refused before the RPC is reached — by the schema's own
    // `refine`, mirroring the gate the migration raises as "An edit must change
    // something". The panel always submits both fields, so this is what a real
    // wider-scope request looks like.
    rpc.mockResolvedValue({ data: { scope: "occurrence", undo_id: UNDO_ID }, error: null });
    const state = await applyReminderSeriesCommand(
      IDLE_REMINDER_SERIES_STATE,
      submission({ scope: "future", title: "Pagar o aluguel", anchorTime: "09:00" }),
    );
    expect(state.scope).toBe("occurrence");
    expect(state.message).toBe(copy.appliedOccurrence);
  });

  it("refuses a wider-scope submission that changes nothing, without calling the RPC", async () => {
    // The TypeScript side and the SQL side refuse the same request for the same
    // reason, which is the parity `series-schema.ts` exists to keep. Reaching
    // the database to be told this would spend a round trip on a refusal the
    // boundary already knows.
    const state = await applyReminderSeriesCommand(
      IDLE_REMINDER_SERIES_STATE,
      submission({ scope: "future" }),
    );
    expect(rpc).not.toHaveBeenCalled();
    expect(state.status).toBe("error");
  });

  it("passes the undo id through and never mints one", async () => {
    rpc.mockResolvedValue({ data: { scope: "series" }, error: null });
    const state = await applyReminderSeriesCommand(
      IDLE_REMINDER_SERIES_STATE,
      submission({ end: "on" }),
    );
    // No `undo_id` came back, so none is offered. `2R-SERIES-008`.
    expect(state.undoId).toBeNull();
    expect(state.message).toBe(copy.ended);
  });

  it("refuses a submission the RPC would refuse, without calling it", async () => {
    const state = await applyReminderSeriesCommand(
      IDLE_REMINDER_SERIES_STATE,
      submission({ scope: "everything" }),
    );
    expect(rpc).not.toHaveBeenCalled();
    expect(state.status).toBe("error");
  });

  it("does not revalidate on a failure", async () => {
    // A revalidation would refresh the page out from under the failed write and
    // discard the message with it.
    rpc.mockResolvedValue({ data: null, error: { message: "Series not found", code: "P0002" } });
    const state = await applyReminderSeriesCommand(IDLE_REMINDER_SERIES_STATE, submission());
    expect(state.message).toBe(copy.notFound);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("2R-SERIES-007 — spending the undo", () => {
  it("calls the shared router with the id and nothing else", async () => {
    rpc.mockResolvedValue({ data: { scope: "occurrence" }, error: null });
    await undoReminderSeriesOperation(
      IDLE_REMINDER_SERIES_STATE,
      form({ locale: "pt-BR", undoId: UNDO_ID }),
    );
    /*
      The router re-reads the recorded operation and decides for itself what to
      compensate. Sending the series or the scope alongside would be a second
      opinion about a decision the ledger has already made — which is how two
      authorities start.
    */
    expect(rpc.mock.calls[0]).toEqual(["undo_operation", { p_undo_id: UNDO_ID }]);
  });

  it("reads a first consumption as done", async () => {
    rpc.mockResolvedValue({ data: { scope: "occurrence", undone: true }, error: null });
    const state = await undoReminderSeriesOperation(
      IDLE_REMINDER_SERIES_STATE,
      form({ locale: "pt-BR", undoId: UNDO_ID }),
    );
    expect(state.status).toBe("success");
    expect(state.message).toBe(copy.undoSucceeded);
  });

  it("reads a second consumption as `already undone`, not as a second reversal", async () => {
    /*
      The exact shape `public.undo_operation` returns when the ledger row is
      already closed. Reaching this branch is the property the two 2R handlers
      have because they set `status = 'undone'`; the inherited Phase 2P
      reminder handler does not, which is `2R-UNDO-LEDGER-NOT-CLOSED` and the
      reason nothing in this slice offers an undo through that path.
    */
    rpc.mockResolvedValue({
      data: { undone: true, affected: 0, idempotent: true, interpretation_id: null },
      error: null,
    });
    const state = await undoReminderSeriesOperation(
      IDLE_REMINDER_SERIES_STATE,
      form({ locale: "pt-BR", undoId: UNDO_ID }),
    );
    expect(state.message).toBe(copy.undoAlready);
    expect(state.message).not.toBe(copy.undoSucceeded);
  });

  it("never renews the offer it just spent", async () => {
    rpc.mockResolvedValue({ data: { undone: true }, error: null });
    const state = await undoReminderSeriesOperation(
      IDLE_REMINDER_SERIES_STATE,
      form({ locale: "pt-BR", undoId: UNDO_ID }),
    );
    expect(state.undoId).toBeNull();
  });

  it("tells a stale refusal apart from a generic failure", async () => {
    // `55P03` means the series moved and the handler refused rather than
    // overwriting a newer decision. "Try again" would invite the retry that will
    // keep being refused.
    rpc.mockResolvedValue({ data: null, error: { message: "…", code: "55P03" } });
    const state = await undoReminderSeriesOperation(
      IDLE_REMINDER_SERIES_STATE,
      form({ locale: "pt-BR", undoId: UNDO_ID }),
    );
    expect(state.message).toBe(copy.undoStale);
    expect(state.message).not.toBe(copy.undoFailed);
  });

  it("refuses a malformed id without calling the router", async () => {
    const state = await undoReminderSeriesOperation(
      IDLE_REMINDER_SERIES_STATE,
      form({ locale: "pt-BR", undoId: "not-a-uuid" }),
    );
    expect(rpc).not.toHaveBeenCalled();
    expect(state.status).toBe("error");
    expect(state.message).toBe(copy.undoFailed);
  });

  it("goes through the authenticated client, so ownership is the database's to decide", async () => {
    /*
      No owner id is sent and none could be: the action holds an
      `authenticated`-scoped client and `public.undo_operation` reads
      `auth.uid()` itself, refusing a row that is not the caller's with
      `Undo operation not found`. A cross-owner attempt therefore cannot be
      expressed here — which is stronger than checking for one.
    */
    rpc.mockResolvedValue({ data: { undone: true }, error: null });
    await undoReminderSeriesOperation(
      IDLE_REMINDER_SERIES_STATE,
      form({ locale: "pt-BR", undoId: UNDO_ID }),
    );
    expect(requireUser).toHaveBeenCalledWith("pt-BR");
    const [, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(Object.keys(args)).toEqual(["p_undo_id"]);
  });
});
