import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { loadCandidateRelationOptions } = await import("./relation-options");

type Result = { data: unknown; error: unknown };

function queryStub(result: Result) {
  const stub: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order"]) {
    stub[method] = vi.fn(() => stub);
  }
  stub.limit = vi.fn(async () => result);
  return stub as Record<string, ReturnType<typeof vi.fn>>;
}

function supabaseStub(results: Record<string, Result>) {
  return {
    from: vi.fn((table: string) => queryStub(results[table] ?? { data: [], error: null })),
  };
}

describe("loadCandidateRelationOptions", () => {
  it("maps owned projects, contexts, and people to id/label options", async () => {
    const supabase = supabaseStub({
      projects: { data: [{ id: "p1", name: "Website relaunch" }], error: null },
      contexts: { data: [{ id: "c1", name: "Work" }], error: null },
      people: { data: [{ id: "u1", name: "Alice" }], error: null },
    });

    const options = await loadCandidateRelationOptions(supabase as never, "user-1");

    expect(options).toEqual({
      projects: [{ id: "p1", label: "Website relaunch" }],
      contexts: [{ id: "c1", label: "Work" }],
      people: [{ id: "u1", label: "Alice" }],
    });
  });

  it("scopes every query to the given owner", async () => {
    const supabase = supabaseStub({});
    await loadCandidateRelationOptions(supabase as never, "user-42");

    const projectsQuery = supabase.from.mock.results[0]?.value as Record<string, ReturnType<typeof vi.fn>>;
    expect(projectsQuery.eq).toHaveBeenCalledWith("user_id", "user-42");
  });

  it("returns empty arrays when the user owns nothing yet", async () => {
    const supabase = supabaseStub({});
    const options = await loadCandidateRelationOptions(supabase as never, "user-1");

    expect(options).toEqual({ projects: [], contexts: [], people: [] });
  });

  it("throws when a query fails instead of silently returning partial options", async () => {
    const supabase = supabaseStub({
      projects: { data: null, error: { message: "boom" } },
    });

    await expect(loadCandidateRelationOptions(supabase as never, "user-1")).rejects.toThrow();
  });
});
