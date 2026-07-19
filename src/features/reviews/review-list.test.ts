import { describe, expect, it, vi } from "vitest";
import { loadReviewListProjection } from "./review-list";

vi.mock("server-only", () => ({}));

function queryStub() {
  const stub: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "range"]) stub[method] = vi.fn(() => stub);
  stub.then = (onFulfilled: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(onFulfilled);
  return stub;
}

describe("loadReviewListProjection", () => {
  it("explicitly owner-scopes the summaries query", async () => {
    const query = queryStub();
    const from = vi.fn(() => query);

    await loadReviewListProjection({ from } as never, { userId: "user-1", locale: "en", page: 1 });

    expect(from).toHaveBeenCalledWith("summaries");
    expect(query.eq).toHaveBeenCalledWith("user_id", "user-1");
  });
});
