import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { loadBrainOverview, OVERVIEW_RECENT_LIMIT } = await import("./overview");
const { LIBRARY_COUNTS, LIBRARY_RECENCY } = await import("./contracts");

/**
 * Brain's overview loader — what it asks the database, and what it does with a
 * refusal.
 *
 * The rules live in `contracts.ts` and are proved by the closeout guard without
 * a client. What can only be proved here is behaviour: that a failed count is a
 * missing number rather than a zero, that a failed recent read is an empty list
 * rather than a thrown page, that `sensitivity` is asked for exactly where it
 * exists, and that the count leaves no row in the response at all.
 */

type Result = { data?: unknown; error?: unknown; count?: number | null };

type Call = { table: string; method: string; args: unknown[] };

/**
 * A PostgREST double that records the whole chain and answers per table.
 *
 * The count path terminates at `.select(..., { head: true })` and the recent
 * path at `.limit()`, so both are thenable and the double has to know which is
 * which — the same split the loader itself makes.
 */
function client(results: Record<string, { count?: Result; recent?: Result }>) {
  const calls: Call[] = [];
  return {
    calls,
    supabase: {
      from(table: string) {
        const answers = results[table] ?? {};
        const chain: Record<string, unknown> = {};
        for (const method of ["order", "eq", "in"]) {
          chain[method] = (...args: unknown[]) => {
            calls.push({ table, method, args });
            return chain;
          };
        }
        chain.select = (...args: unknown[]) => {
          calls.push({ table, method: "select", args });
          const options = args[1] as { head?: boolean } | undefined;
          if (options?.head) {
            return Promise.resolve(answers.count ?? { count: 0, error: null });
          }
          return chain;
        };
        chain.limit = (...args: unknown[]) => {
          calls.push({ table, method: "limit", args });
          return Promise.resolve(answers.recent ?? { data: [], error: null });
        };
        return chain;
      },
    } as never,
  };
}

function domain(summaries: Awaited<ReturnType<typeof loadBrainOverview>>, key: string) {
  const found = summaries.find((summary) => summary.key === key);
  if (!found) throw new Error(`no summary for ${key}`);
  return found;
}

describe("the overview counts without fetching rows", () => {
  it("asks for a head count, so a domain's contents never leave the database", async () => {
    const { supabase, calls } = client({});
    await loadBrainOverview(supabase, "pt-BR");

    for (const table of Object.values(LIBRARY_COUNTS)) {
      const select = calls.find((call) => call.table === table && call.method === "select");
      expect(select, `${table} was never counted`).toBeDefined();
      expect(
        calls.some(
          (call) =>
            call.table === table &&
            call.method === "select" &&
            (call.args[1] as { head?: boolean } | undefined)?.head === true,
        ),
        `${table} was counted without head: true`,
      ).toBe(true);
    }
  });

  it("adds no user_id predicate that would mask an RLS failure", async () => {
    const { supabase, calls } = client({});
    await loadBrainOverview(supabase, "pt-BR");
    expect(calls.filter((call) => call.method === "eq")).toEqual([]);
  });
});

describe("a refusal is a missing answer, never a wrong one", () => {
  it("renders a failed count as null rather than as zero", async () => {
    const { supabase } = client({ people: { count: { count: null, error: { message: "denied" } } } });
    const summaries = await loadBrainOverview(supabase, "pt-BR");

    expect(domain(summaries, "people").count).toBeNull();
    // …and the domain still says it is countable, so the surface can tell the
    // reader the count failed instead of silently showing nothing.
    expect(domain(summaries, "people").countSupported).toBe(true);
  });

  it("renders a failed recent read as an empty list rather than throwing", async () => {
    const { supabase } = client({
      memories: { recent: { data: null, error: { message: "denied" } } },
    });
    const summaries = await loadBrainOverview(supabase, "pt-BR");

    expect(domain(summaries, "memories").recent).toEqual([]);
    expect(domain(summaries, "memories").recencySupported).toBe(true);
  });

  it("keeps 'no recency here' apart from 'nothing recent'", async () => {
    const { supabase } = client({});
    const summaries = await loadBrainOverview(supabase, "pt-BR");

    // Contextos is counted and deliberately has no recent list (`2I-LIB-005`).
    expect(domain(summaries, "contexts").countSupported).toBe(true);
    expect(domain(summaries, "contexts").recencySupported).toBe(false);
    // Relações has neither: a relation is derived at read time from several
    // tables, so there is no row to count.
    expect(domain(summaries, "relations").countSupported).toBe(false);
    expect(domain(summaries, "relations").recencySupported).toBe(false);
  });
});

describe("governed labels are asked for with their classification", () => {
  it("selects sensitivity exactly where the recency source carries it", async () => {
    const { supabase, calls } = client({});
    await loadBrainOverview(supabase, "pt-BR");

    for (const spec of Object.values(LIBRARY_RECENCY)) {
      const select = calls.find(
        (call) =>
          call.table === spec!.table &&
          call.method === "select" &&
          typeof call.args[0] === "string" &&
          (call.args[0] as string).includes(spec!.label),
      );
      expect(select, `${spec!.table} was never read for its recent rows`).toBeDefined();
      expect(
        (select!.args[0] as string).includes("sensitivity"),
        `${spec!.table} asks for sensitivity but declares no protected surface`,
      ).toBe(spec!.surface !== null);
    }
  });

  it("derives a level for a governed row and none for a structural identifier", async () => {
    const { supabase } = client({
      memories: {
        recent: { data: [{ id: "m1", content: "a private note", sensitivity: "private" }], error: null },
      },
      people: { recent: { data: [{ id: "p1", name: "Marina" }], error: null } },
    });
    const summaries = await loadBrainOverview(supabase, "pt-BR");

    expect(domain(summaries, "memories").recent).toEqual([
      { id: "m1", label: "a private note", sensitivity: { kind: "derived", level: "private" } },
    ]);
    expect(domain(summaries, "memories").recentSurface).toBe("memory");

    expect(domain(summaries, "people").recent).toEqual([
      { id: "p1", label: "Marina", sensitivity: null },
    ]);
    expect(domain(summaries, "people").recentSurface).toBeNull();
  });

  it("fails closed when a governed row arrives with no classification", async () => {
    /*
     * `readableLevelsOf` keeps the row and stores `null`; `toSensitivityLevel`
     * then fails closed on it. The row is still shown as a masked stub rather
     * than dropped, which is the arm the contract chose: the reader learns
     * something is there without learning what.
     */
    // Keyed by the **table**, not the lens: `files` reads `attachments`, and a
    // fixture keyed by the lens name would have fed the loader nothing and
    // passed for the wrong reason.
    const { supabase } = client({
      attachments: { recent: { data: [{ id: "f1", original_name: "contrato.pdf" }], error: null } },
    });
    const summaries = await loadBrainOverview(supabase, "pt-BR");

    expect(domain(summaries, "files").recent).toHaveLength(1);
    expect(domain(summaries, "files").recent[0].sensitivity).toEqual({
      kind: "derived",
      level: "highly_sensitive",
    });
  });
});

describe("the overview stays a door", () => {
  it("asks for three recent rows and no more", async () => {
    const { supabase, calls } = client({});
    await loadBrainOverview(supabase, "pt-BR");
    const limits = calls.filter((call) => call.method === "limit").map((call) => call.args[0]);

    expect(limits.length).toBe(Object.keys(LIBRARY_RECENCY).length);
    expect(new Set(limits)).toEqual(new Set([OVERVIEW_RECENT_LIMIT]));
    expect(OVERVIEW_RECENT_LIMIT).toBeLessThanOrEqual(5);
  });

  it("points every domain at the route it already had", async () => {
    const { supabase } = client({});
    const summaries = await loadBrainOverview(supabase, "en");

    expect(summaries.map((summary) => summary.href)).toEqual([
      "/en/app/people",
      "/en/app/projects",
      "/en/app/organizations",
      "/en/app/contexts",
      "/en/app/memories",
      "/en/app/files",
      "/en/app/relations",
      "/en/app/chat",
    ]);
  });
});
