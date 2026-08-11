import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseProductEventPayload, productEventNames } from "@/features/product-analytics/contracts";

/**
 * The refusal's `failureKind` exists in both validators, and neither can move
 * without the other — `2H-RATE-003`, ADR-084.
 *
 * ADR-084 exists because SH.6 shipped a producer sending
 * `failureKind: 'quota'` against a database enum and a TypeScript union that
 * neither contained it. Every quota refusal recorded **no telemetry at all** for
 * weeks, while the code read as though it recorded one, because the emitter
 * wrapped its call in `.catch(() => {})` and read no result.
 *
 * The lesson was that a one-directional check is not a check. So this file
 * proves both directions:
 *
 *   * every literal the TypeScript contract admits is admitted by the migration;
 *   * every literal the migration admits is admitted by the TypeScript contract;
 *   * the event name itself is in the table CHECK, the property validator and
 *     the contract's name list.
 *
 * And it proves the vocabulary is **distinct** from its neighbours, because
 * "which control refused this" is the one question the funnel exists to answer
 * and a shared word would make it unanswerable.
 */

/**
 * The migration that CURRENTLY declares the vocabulary, not the one that first
 * added `rate_limit_refused`.
 *
 * Each phase that widens `product_events` re-declares the whole list, so the
 * newest such migration is the one whose CHECK is in force. Pinning the Phase 2H
 * file made this test assert what a superseded migration said -- it passed
 * because 2H's list still contained the name, while the list actually enforced
 * lived two migrations later.
 */
/*
 * The migration that most recently re-declared the vocabulary.
 *
 * It moves with the chain, and it must: this file asserts that **every**
 * name in `productEventNames` survives in the CHECK, so reading an older
 * migration would report a name "dropped" that was simply added after it.
 * Phase 2K slice 2K.8 moved it from `202608080086`, and Phase 2M slice 2M.1
 * moved it from `202608090088`.
 */
const MIGRATION = "supabase/migrations/202608110090_phase_2m_daily_cycle_telemetry.sql";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

/** The array literal the migration passes to one enum validator. */
function migrationEnum(sql: string, property: string): string[] {
  const arm = /when 'rate_limit_refused' then([\s\S]*?)when 'needs_attention_viewed' then/
    .exec(sql.slice(sql.indexOf("case p_event_name", sql.indexOf("select key into unknown_key"))));
  if (!arm) throw new Error("the rate_limit_refused validation arm is missing");

  const pattern = new RegExp(`require_product_event_enum\\(p_properties, '${property}', array\\[([^\\]]*)\\]\\)`);
  const match = pattern.exec(arm[1]);
  if (!match) throw new Error(`the ${property} enum is missing from the rate_limit_refused arm`);

  return [...match[1].matchAll(/'([a-z_]+)'/g)].map((entry) => entry[1]).sort();
}

const sql = read(MIGRATION);

describe("2H-RATE-003 — the event name is admitted everywhere it must be", () => {
  it("is in the TypeScript name list", () => {
    expect(productEventNames).toContain("rate_limit_refused");
  });

  it("is in the table CHECK", () => {
    const constraint = /add constraint product_events_event_name_check check \(event_name in \(([\s\S]*?)\)\);/
      .exec(sql);
    expect(constraint).not.toBeNull();
    expect(constraint?.[1]).toContain("'rate_limit_refused'");
  });

  it("has an allowed-key arm and a validation arm in the property validator", () => {
    expect(sql).toContain("allowed_keys := array['operation', 'failureKind'];");
    expect(sql).toContain("perform private.require_product_event_enum(p_properties, 'failureKind', array['rate_limited']);");
  });

  it("keeps every pre-existing event name in the CHECK", () => {
    const constraint = /add constraint product_events_event_name_check check \(event_name in \(([\s\S]*?)\)\);/
      .exec(sql);
    for (const name of productEventNames) {
      expect(constraint?.[1], `${name} was dropped from the event CHECK`).toContain(`'${name}'`);
    }
  });
});

describe("2H-RATE-003 — both directions, property by property", () => {
  // The TypeScript side, read by exercising the parser rather than by
  // restating the union: a union restated in a test is a third place to drift.
  function accepts(properties: Record<string, unknown>): boolean {
    return parseProductEventPayload({
      name: "rate_limit_refused",
      surface: "server",
      locale: "pt-BR",
      viewportClass: "unknown",
      appVersion: "server",
      idempotencyKey: "3f2a1b4c-5d6e-4f70-8123-456789abcdef",
      properties,
    }) !== null;
  }

  const OPERATIONS = ["ai", "upload"];
  const FAILURE_KINDS = ["rate_limited"];

  it("the migration admits exactly the operations the contract admits", () => {
    expect(migrationEnum(sql, "operation")).toEqual([...OPERATIONS].sort());
    for (const operation of OPERATIONS) {
      expect(accepts({ operation, failureKind: "rate_limited" }), `contract rejects ${operation}`).toBe(true);
    }
  });

  it("the migration admits exactly the failureKinds the contract admits", () => {
    expect(migrationEnum(sql, "failureKind")).toEqual([...FAILURE_KINDS].sort());
    for (const failureKind of FAILURE_KINDS) {
      expect(accepts({ operation: "ai", failureKind }), `contract rejects ${failureKind}`).toBe(true);
    }
  });

  it("the contract rejects a literal the migration would reject too", () => {
    // The discriminating control. Without it, a parser that accepted everything
    // would pass every assertion above.
    expect(accepts({ operation: "ai", failureKind: "quota" })).toBe(false);
    expect(accepts({ operation: "chat", failureKind: "rate_limited" })).toBe(false);
    expect(accepts({ operation: "ai" })).toBe(false);
    expect(accepts({ operation: "ai", failureKind: "rate_limited", extra: 1 })).toBe(false);
  });
});

describe("2H-RATE-003 — the vocabulary is distinct from its neighbours", () => {
  it("does not reuse SH.5's throttle, SH.6's quota, or the lifecycle words", () => {
    const neighbours = ["quota", "throttled", "lifecycle_blocked", "captcha", "storage", "provider_error"];
    for (const neighbour of neighbours) {
      expect(
        migrationEnum(sql, "failureKind"),
        `rate_limited must not share a literal with ${neighbour}`,
      ).not.toContain(neighbour);
    }
  });

  it("leaves capture_save_failed's vocabulary untouched", () => {
    // A widening that changed a neighbouring event would be scope this slice
    // does not have, and would silently reclassify already-recorded events.
    expect(sql).toContain(
      "perform private.require_product_event_enum(p_properties, 'failureKind', array['validation', 'session', 'storage', 'unknown', 'quota']);",
    );
  });
});
