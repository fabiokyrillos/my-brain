import { describe, expect, it, vi } from "vitest";
import { loadHomeSupplementalProjection } from "./home-projection";

vi.mock("server-only", () => ({}));

type Result = { data: unknown; error: unknown; count?: number | null };

function queryStub(result: Result) {
  const stub: Record<string, unknown> = {};
  for (const method of ["select", "eq", "or", "order", "limit"]) {
    stub[method] = vi.fn(() => stub);
  }
  stub.then = (onFulfilled: (value: Result) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return stub as Record<string, ReturnType<typeof vi.fn>> & PromiseLike<Result>;
}

describe("loadHomeSupplementalProjection", () => {
  it("returns the owner-scoped waiting count and the newest open question preview", async () => {
    const waitingStub = queryStub({ data: null, error: null, count: 3 });
    const questionsStub = queryStub({ data: [{ question: "Isso é um retrabalho ou uma tarefa nova?" }], error: null });
    const from = vi.fn((table: string) => (table === "tasks" ? waitingStub : questionsStub));

    const result = await loadHomeSupplementalProjection({ from } as never, "user-1");

    expect(from).toHaveBeenCalledWith("tasks");
    expect(from).toHaveBeenCalledWith("pending_questions");
    expect(waitingStub.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(waitingStub.eq).toHaveBeenCalledWith("status", "waiting");
    expect(questionsStub.eq).toHaveBeenCalledWith("user_id", "user-1");
    // Read-time snooze reactivation (Slice 2D.2): open, or snoozed past its
    // deadline, is the single actionable-question predicate.
    expect(questionsStub.or).toHaveBeenCalledWith(
      expect.stringContaining("status.eq.open,and(status.eq.snoozed,snoozed_until.lte."),
    );
    expect(questionsStub.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(questionsStub.limit).toHaveBeenCalledWith(1);
    expect(result).toEqual({ waitingCount: 3, openQuestionPreview: "Isso é um retrabalho ou uma tarefa nova?" });
  });

  it("returns a null preview and zero count when nothing is waiting or open", async () => {
    const waitingStub = queryStub({ data: null, error: null, count: 0 });
    const questionsStub = queryStub({ data: [], error: null });
    const from = vi.fn((table: string) => (table === "tasks" ? waitingStub : questionsStub));

    const result = await loadHomeSupplementalProjection({ from } as never, "user-1");

    expect(result).toEqual({ waitingCount: 0, openQuestionPreview: null });
  });

  it("treats a missing count as zero rather than throwing", async () => {
    const waitingStub = queryStub({ data: null, error: null, count: null });
    const questionsStub = queryStub({ data: [], error: null });
    const from = vi.fn((table: string) => (table === "tasks" ? waitingStub : questionsStub));

    const result = await loadHomeSupplementalProjection({ from } as never, "user-1");

    expect(result.waitingCount).toBe(0);
  });

  it("fails closed by throwing when the waiting-count query errors", async () => {
    const waitingStub = queryStub({ data: null, error: { message: "boom" } });
    const questionsStub = queryStub({ data: [], error: null });
    const from = vi.fn((table: string) => (table === "tasks" ? waitingStub : questionsStub));

    await expect(loadHomeSupplementalProjection({ from } as never, "user-1")).rejects.toThrow();
  });
});
