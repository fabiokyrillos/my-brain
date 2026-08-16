import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { QUOTAS } from "@/lib/quotas";

import { QUOTA_DETAILS } from "./refusal";
import { loadQuotaUsage, utcDayStart, type QuotaUsage } from "./usage";

/**
 * `2O-COST-002`: the ceiling stated is the ceiling enforced, and the usage
 * beside it is counted the way the trigger counts it.
 *
 * `2O-COST-007`: a read that fails is `null`, and `null` is never rendered as
 * zero.
 */

// The loader is `server-only`. Without this the file reports **zero tests**
// while the run says nothing failed — the silent shape §79 recorded and this
// repository has been bitten by once already.
vi.mock("server-only", () => ({}));

const REPO = resolve(__dirname, "../../..");
const MIGRATION = readFileSync(
  join(REPO, "supabase/migrations/202608050076_quota_enforcement.sql"),
  "utf8",
);

/** A Supabase double whose每 builder step returns itself and resolves to a result. */
function clientReturning(results: Record<string, unknown>) {
  const build = (table: string) => {
    const result = results[table] ?? { count: 0, data: [], error: null };
    const chain: Record<string, unknown> = {};
    for (const step of ["select", "eq", "gte", "in", "limit"]) {
      chain[step] = vi.fn(() => chain);
    }
    chain.then = (resolveWith: (value: unknown) => unknown) => Promise.resolve(result).then(resolveWith);
    return chain;
  };
  return { from: vi.fn((table: string) => build(table)) } as never;
}

const NOW = new Date("2026-08-16T03:20:00.000Z");

function byDetail(rows: readonly QuotaUsage[], detail: string) {
  return rows.find((row) => row.detail === detail)!;
}

describe("2O-COST-002: every ceiling comes from the enforced configuration", () => {
  it("reports each ceiling as the constant, never as a literal", async () => {
    const rows = await loadQuotaUsage(clientReturning({}), "user-1", NOW);
    expect(byDetail(rows, "QUOTA_ENTRIES_PER_DAY").ceiling).toBe(QUOTAS.entriesPerDay);
    expect(byDetail(rows, "QUOTA_LIVE_JOBS").ceiling).toBe(QUOTAS.liveJobsPerUser);
    expect(byDetail(rows, "QUOTA_STORAGE_BYTES").ceiling).toBe(QUOTAS.storageBytesPerUser);
    expect(byDetail(rows, "QUOTA_STORAGE_OBJECTS").ceiling).toBe(QUOTAS.storageObjectsPerUser);
    expect(byDetail(rows, "QUOTA_ATTACHMENTS_PER_DAY").ceiling).toBe(QUOTAS.attachmentsPerDay);
  });

  it("uses only details the refusal vocabulary declares, so one page and one refusal agree", () => {
    // The shared vocabulary is the point: a surface that invented its own
    // ceiling names would state a limit whose refusal says something else.
    return loadQuotaUsage(clientReturning({}), "user-1", NOW).then((rows) => {
      for (const row of rows) {
        expect(QUOTA_DETAILS as readonly string[]).toContain(row.detail);
      }
    });
  });

  it("names the one ceiling it deliberately omits, and omits it", async () => {
    const rows = await loadQuotaUsage(clientReturning({}), "user-1", NOW);
    // Per-record rather than per-account, so it has no account usage figure.
    expect(rows.map((row) => row.detail)).not.toContain("QUOTA_ATTACHMENTS_PER_ENTRY");
    expect(rows).toHaveLength(5);
  });
});

describe("the predicates match the ones the trigger enforces", () => {
  it("counts the entry day from UTC midnight, as `private.utc_day_start()` defines it", () => {
    expect(MIGRATION).toContain("date_trunc('day', pg_catalog.now() at time zone 'UTC')");
    // 03:20 UTC on the 16th is still the 16th's window — and would be the 15th's
    // if this were computed in São Paulo, which is exactly the mistake the
    // local-day correction was run to remove from surfaces that are local.
    expect(utcDayStart(NOW)).toBe("2026-08-16T00:00:00.000Z");
    expect(utcDayStart(new Date("2026-08-16T00:00:00.000Z"))).toBe("2026-08-16T00:00:00.000Z");
    expect(utcDayStart(new Date("2026-08-16T23:59:59.999Z"))).toBe("2026-08-16T00:00:00.000Z");
  });

  it("keeps the trigger's own predicates readable, so a drift here is visible there", () => {
    // Read out of the migration rather than restated, which is what stops this
    // test from being a second copy of the rule it is protecting.
    expect(MIGRATION).toMatch(/from public\.entries as entry[\s\S]{0,160}created_at >= private\.utc_day_start\(\)/);
    expect(MIGRATION).toMatch(/job\.status in \('pending', 'running'\)/);
    expect(MIGRATION).toMatch(/job\.status = 'failed' and job\.attempts < job\.max_attempts/);
    expect(MIGRATION).toMatch(/count\(\*\) filter \(where attachment\.created_at >= private\.utc_day_start\(\)\)/);
  });

  it("over-counts live jobs rather than under-counting them", async () => {
    /*
     * The stated divergence. PostgREST cannot compare `attempts` to
     * `max_attempts`, so exhausted `failed` rows are counted here and not by the
     * trigger. The direction is the whole argument: telling someone the queue is
     * fuller than it is costs them a retry, and telling them it is emptier than
     * it is walks them into a refusal.
     */
    const rows = await loadQuotaUsage(
      clientReturning({ jobs: { count: 7, data: [], error: null } }),
      "user-1",
      NOW,
    );
    expect(byDetail(rows, "QUOTA_LIVE_JOBS").used).toBe(7);
  });
});

describe("2O-COST-007: a failed read is `null` and never zero", () => {
  it("returns `null` for the count that errored and answers the rest", async () => {
    const rows = await loadQuotaUsage(
      clientReturning({
        entries: { count: null, data: null, error: { message: "boom" } },
        jobs: { count: 3, data: [], error: null },
      }),
      "user-1",
      NOW,
    );
    expect(byDetail(rows, "QUOTA_ENTRIES_PER_DAY").used).toBeNull();
    // Independent, so one unreadable table does not blank the page.
    expect(byDetail(rows, "QUOTA_LIVE_JOBS").used).toBe(3);
  });

  it("tells an empty account apart from an unreadable one", async () => {
    const empty = await loadQuotaUsage(
      clientReturning({ entries: { count: 0, data: [], error: null } }),
      "user-1",
      NOW,
    );
    expect(byDetail(empty, "QUOTA_ENTRIES_PER_DAY").used).toBe(0);
    expect(byDetail(empty, "QUOTA_ENTRIES_PER_DAY").used).not.toBeNull();
  });

  it("returns `null` rather than a short sum when the byte rows come back truncated", async () => {
    // The failure a `limit` can create: more rows than the object ceiling means
    // the sum is incomplete, and an incomplete sum presented as usage would
    // under-report storage — the same direction the job count refuses.
    const rows = await loadQuotaUsage(
      clientReturning({
        attachments: {
          count: 0,
          data: Array.from({ length: QUOTAS.storageObjectsPerUser + 1 }, () => ({ size_bytes: 1 })),
          error: null,
        },
      }),
      "user-1",
      NOW,
    );
    expect(byDetail(rows, "QUOTA_STORAGE_BYTES").used).toBeNull();
  });

  it("sums the bytes it did read", async () => {
    const rows = await loadQuotaUsage(
      clientReturning({
        attachments: { count: 2, data: [{ size_bytes: 400 }, { size_bytes: 600 }], error: null },
      }),
      "user-1",
      NOW,
    );
    expect(byDetail(rows, "QUOTA_STORAGE_BYTES").used).toBe(1000);
  });
});
