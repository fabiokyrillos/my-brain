import { describe, expect, it, vi } from "vitest";

import { retrieveKnowledge } from "./knowledge-retrieval";

const WINDOW = { since: "2026-03-01T03:00:00.000Z", until: "2026-04-01T03:00:00.000Z" };

function client(answers: { data: unknown; error: { code?: string } | null }[]) {
  const rpc = vi.fn(async () => answers.shift() ?? { data: [], error: null });
  return { rpc };
}

describe("retrieveKnowledge — the window goes to LB-M3, and only a missing signature falls back", () => {
  it("calls the two-argument retrieval when there is no window, exactly as before", async () => {
    const stub = client([{ data: [{ source_id: "e1" }], error: null }]);
    const result = await retrieveKnowledge(stub, { embedding: "[1]", window: null, count: 8 });
    expect(stub.rpc).toHaveBeenCalledTimes(1);
    expect(stub.rpc).toHaveBeenCalledWith("match_internal_knowledge", { p_query_embedding: "[1]", p_match_count: 8 });
    expect(result).toEqual({ matches: [{ source_id: "e1" }], matchError: null, windowed: false });
  });

  it("sends the window to the four-argument retrieval", async () => {
    const stub = client([{ data: [{ source_id: "e2" }], error: null }]);
    const result = await retrieveKnowledge(stub, { embedding: "[1]", window: WINDOW, count: 8 });
    expect(stub.rpc).toHaveBeenCalledWith("match_internal_knowledge", {
      p_query_embedding: "[1]",
      p_match_count: 8,
      p_since: WINDOW.since,
      p_until: WINDOW.until,
    });
    expect(result.windowed).toBe(true);
  });

  it("falls back to the unwindowed retrieval while LB-M3 is not applied (PGRST202)", async () => {
    const stub = client([
      { data: null, error: { code: "PGRST202" } },
      { data: [{ source_id: "e3" }], error: null },
    ]);
    const result = await retrieveKnowledge(stub, { embedding: "[1]", window: WINDOW, count: 20 });
    expect(stub.rpc).toHaveBeenCalledTimes(2);
    expect(stub.rpc).toHaveBeenLastCalledWith("match_internal_knowledge", { p_query_embedding: "[1]", p_match_count: 20 });
    expect(result).toEqual({ matches: [{ source_id: "e3" }], matchError: null, windowed: false });
  });

  it("returns any other error to the caller, with no second call", async () => {
    const stub = client([{ data: null, error: { code: "42501" } }]);
    const result = await retrieveKnowledge(stub, { embedding: "[1]", window: WINDOW, count: 8 });
    expect(stub.rpc).toHaveBeenCalledTimes(1);
    expect(result.matchError).toEqual({ code: "42501" });
  });
});
