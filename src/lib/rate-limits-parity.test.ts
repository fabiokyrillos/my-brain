import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RATE_LIMITS, RATE_LIMIT_WINDOW_INTERVAL, rateLimitCeiling } from "./rate-limits";

/**
 * The signed rate values exist in three places and must be one value —
 * `2H-RATE-002`.
 *
 * PRD §14.2 is the signature. `src/lib/rate-limits.ts` is what the application
 * passes as a required argument. `private.rate_limit_parameters` is what the
 * drain claim path reads, because its signature cannot be extended (ADR-057).
 * Three places is two chances to drift, so this file compares all three **in
 * both directions**: a constant §14.2 does not name fails, a §14.2 row the
 * constants do not implement fails, and a seed row that disagrees with either
 * fails.
 *
 * This is `quotas-parity.test.ts`'s shape, and it is here for ADR-084's reason:
 * a value checked in only one direction is a value that can quietly stop being
 * the value everyone agreed to.
 */

const MIGRATION = "supabase/migrations/202608070081_phase_2h_rate_limiting.sql";
const PRD = "docs/initiatives/phase-2h/PHASE_2H_PRD.md";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

/** The seed rows, parsed out of the migration rather than restated here. */
function seededParameters(sql: string): Map<string, number> {
  const insert = /insert into private\.rate_limit_parameters \(key, value, note\) values([\s\S]*?);/
    .exec(sql);
  if (!insert) throw new Error("the rate_limit_parameters seed is missing from the migration");

  const rows = new Map<string, number>();
  for (const match of insert[1].matchAll(/\('([a-z_]+)',\s*(\d+),/g)) {
    rows.set(match[1], Number(match[2]));
  }
  return rows;
}

describe("2H-RATE-002 — the signed values are one value in three places", () => {
  const sql = read(MIGRATION);
  const prd = read(PRD);
  const seed = seededParameters(sql);

  const expected = new Map<string, number>([
    ["ai_operations_per_hour", RATE_LIMITS.aiOperationsPerHour],
    ["uploads_per_hour", RATE_LIMITS.uploadsPerHour],
    ["rolling_window_seconds", RATE_LIMITS.rollingWindowSeconds],
  ]);

  it("seeds exactly the keys the constants implement, and no others", () => {
    expect([...seed.keys()].sort()).toEqual([...expected.keys()].sort());
  });

  it("seeds the same number the constants carry, key by key", () => {
    for (const [key, value] of expected) {
      expect(seed.get(key), `${key} disagrees between the migration seed and src/lib/rate-limits.ts`)
        .toBe(value);
    }
  });

  it("carries PRD §14.2's signed V-1 and V-2 ceilings", () => {
    // Read out of the PRD's own table rather than restated, so a PRD amendment
    // that changed a number without changing the code fails here.
    expect(prd).toContain(`**${RATE_LIMITS.aiOperationsPerHour} operations per user per rolling hour**`);
    expect(prd).toContain(`**${RATE_LIMITS.uploadsPerHour} accepted upload requests per user per rolling hour**`);
  });

  it("carries PRD §14.2's signed V-3 window shape", () => {
    expect(prd).toContain("**Rolling window — not a fixed clock-hour window**");
    // One hour, in the unit the parameter is stored in. A window that stopped
    // being an hour would make the PRD's "per rolling hour" false.
    expect(RATE_LIMITS.rollingWindowSeconds).toBe(60 * 60);
  });

  it("exposes each bucket's ceiling exhaustively", () => {
    expect(rateLimitCeiling("ai")).toBe(RATE_LIMITS.aiOperationsPerHour);
    expect(rateLimitCeiling("upload")).toBe(RATE_LIMITS.uploadsPerHour);
  });

  it("builds the interval literal from the constant rather than restating it", () => {
    expect(RATE_LIMIT_WINDOW_INTERVAL).toBe(`${RATE_LIMITS.rollingWindowSeconds} seconds`);
  });
});

describe("2H-RATE-002 — no ceiling has a default anywhere in the signature", () => {
  const sql = read(MIGRATION);

  it("declares every claim parameter without a default", () => {
    // A `default` on any of these would be a number entering production that no
    // signature covers, which is the exact failure ADR-080 Decision 2 forbids.
    const signatures = [
      /create or replace function private\.consume_rate_limit_slot\(([\s\S]*?)\)\s*\nreturns/,
      /create or replace function public\.claim_rate_limit_slot\(([\s\S]*?)\)\s*\nreturns/,
      /create or replace function public\.claim_rate_limit_slot_for_user\(([\s\S]*?)\)\s*\nreturns/,
    ];
    for (const pattern of signatures) {
      const match = pattern.exec(sql);
      expect(match, `signature not found for ${pattern}`).not.toBeNull();
      expect(match?.[1]).not.toContain("default");
    }
  });

  it("refuses an absent parameter rather than falling back to a number", () => {
    expect(sql).toContain("RATE_LIMIT_PARAMETER_MISSING");
    expect(sql).not.toMatch(/coalesce\(\s*parameter\s*,\s*\d+\s*\)/);
  });
});

describe("2H-RATE-006 — the limiter is not a spend control", () => {
  const sql = read(MIGRATION);

  it("declares no cost, price, spend or token column on the limiter state", () => {
    const table = /create table public\.rate_limit_events \(([\s\S]*?)\n\);/.exec(sql);
    expect(table).not.toBeNull();
    expect(table?.[1]).not.toMatch(/cost|usd|spend|price|token/i);
  });

  it("asserts that absence inside the migration, not only in this test", () => {
    // A test can be deleted; a migration that refuses to apply cannot be
    // deleted retroactively from a database that already ran it.
    expect(sql).toContain("2H-RATE-006: rate_limit_events must carry no spend semantics");
  });
});

describe("PRD §14.2 V-6 — no exemption path exists", () => {
  const sql = read(MIGRATION);

  /**
   * The decision's body only, not the file.
   *
   * The prose above the function says "no exemption branch" and "no owner is
   * exempt", which is the documentation working. Scanning the whole file for
   * the word would make the explanation fail the assertion it is explaining —
   * a gate that punishes writing down why is a gate that gets the comment
   * deleted instead of the code fixed.
   */
  const decision = (() => {
    const start = sql.indexOf("create or replace function private.consume_rate_limit_slot");
    const end = sql.indexOf("comment on function private.consume_rate_limit_slot", start);
    expect(start, "the decision function is missing").toBeGreaterThan(-1);
    expect(end, "the decision function has no terminator").toBeGreaterThan(start);
    return sql.slice(start, end);
  })();

  it("contains no account identifier anywhere in the decision", () => {
    // A hard-coded UUID in an admission decision is the shape an exemption
    // takes. There is none, and there must never be one to widen later.
    expect(decision).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  it("contains no exemption vocabulary in the decision", () => {
    expect(decision).not.toMatch(/\bexempt\b|\bbypass\b|\bunlimited\b|\bis_owner\b|\bskip_limit\b/i);
  });

  it("reads its identity from auth.uid(), never from an argument, on the session door", () => {
    const session = sql.slice(
      sql.indexOf("create or replace function public.claim_rate_limit_slot("),
      sql.indexOf("comment on function public.claim_rate_limit_slot(text"),
    );
    expect(session).toContain("caller uuid := auth.uid()");
    expect(session).not.toContain("p_user_id");
  });
});
