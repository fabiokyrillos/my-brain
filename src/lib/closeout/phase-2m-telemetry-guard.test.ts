import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { productEventNames, productSurfaces } from "@/features/product-analytics/contracts";

/**
 * `2M-METRICS-001` / `2M-AUDIT-002` — **no producer may precede its migration**,
 * enforced instead of promised.
 *
 * ## What this would have caught, twice
 *
 * `202608080087` and `202608090089` are both extraordinary post-phase
 * corrections, authorized outside a closed budget, and both fixed the same
 * defect: the application declared a vocabulary the deployed database did not
 * admit. Every emission was refused at the last real write path, inside
 * producers that wrap emission in `.catch(() => {})` — so it was **silent**, and
 * Phase 2K reached closeout with its telemetry entirely inert.
 *
 * The property that was missing is small and checkable: **every name and every
 * surface the application declares must already be admitted by the migration
 * chain.** This asserts it on every run.
 *
 * ## Why it reads the chain rather than the live database
 *
 * The chain is what CI has, and it is the thing a pull request changes. A live
 * reading proves deployment and belongs to G8; this proves *ordering*, which is
 * the half that was wrong. They are different questions and both are asked.
 *
 * ## The enforcement points, by name
 *
 * `2M-AUDIT-002` requires them enumerated rather than counted, because a count
 * is what let a "non-vocabulary guard" survive one correction and cause the
 * next. At this baseline they are exactly five:
 *
 * 1. `product_events_event_name_check` — the table CHECK on the name;
 * 2. `private.validate_product_event_properties` — the per-name key whitelist;
 * 3. `productEventNames` — the application's name vocabulary;
 * 4. `product_events_surface_check` — the table CHECK on the surface;
 * 5. `productSurfaces` — the application's surface vocabulary.
 *
 * The writer holds **no** copy of either: `202608080087` deleted the frozen
 * event-name list and `202608090089` deleted the surface list. That absence is
 * asserted below, because it is the property those two migrations bought.
 */

const REPO = join(__dirname, "..", "..", "..");
const MIGRATIONS = join(REPO, "supabase/migrations");

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).sort();
}

/**
 * The values a named `check (<column> in (...))` constraint admits, taken from
 * the **last** migration that rewrites it — which is what the deployed database
 * has, because the chain is append-only and applied in order.
 */
function admittedValues(column: string): readonly string[] {
  let latest: string[] = [];
  for (const file of migrationFiles()) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8");
    const at = sql.search(new RegExp(`${column}\\s+in\\s*\\(`));
    if (at < 0) continue;
    const open = sql.indexOf("(", at);
    let depth = 0;
    let close = -1;
    for (let index = open; index < sql.length; index += 1) {
      if (sql[index] === "(") depth += 1;
      else if (sql[index] === ")") {
        depth -= 1;
        if (depth === 0) {
          close = index;
          break;
        }
      }
    }
    if (close < 0) continue;
    const values = [...sql.slice(open + 1, close).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    // A later migration that rewrites the constraint replaces it wholesale, so
    // the last one wins — but a *narrower* rewrite would be a real vocabulary
    // loss rather than a parse failure, and taking the last is what represents
    // that faithfully.
    if (values.length > 0) latest = values;
  }
  return latest;
}

/** The event names `private.validate_product_event_properties` has a branch for. */
function validatedEventNames(): readonly string[] {
  let latest: string[] = [];
  for (const file of migrationFiles()) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8");
    const start = sql.indexOf("function private.validate_product_event_properties");
    if (start < 0) continue;
    const body = sql.slice(start);
    const end = body.indexOf("raise exception 'Unsupported product event'");
    if (end < 0) continue;
    const names = [...body.slice(0, end).matchAll(/when\s+((?:'[a-z_]+'\s*,?\s*)+)then/g)]
      .flatMap((match) => [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));
    if (names.length > 0) latest = names;
  }
  return latest;
}

describe("2M-METRICS-001: no producer precedes its migration", () => {
  it("admits every event name the application declares", () => {
    const admitted = new Set(admittedValues("event_name"));
    const undeclared = productEventNames.filter((name) => !admitted.has(name));
    expect(
      undeclared,
      `the application declares event names the migration chain does not admit: ${undeclared.join(", ")}`,
    ).toEqual([]);
  });

  it("admits every surface the application declares", () => {
    const admitted = new Set(admittedValues("surface"));
    const undeclared = productSurfaces.filter((surface) => !admitted.has(surface));
    expect(
      undeclared,
      `the application declares surfaces the migration chain does not admit: ${undeclared.join(", ")}`,
    ).toEqual([]);
  });

  it("gives every declared event name a property branch, so none is refused at 22023", () => {
    // The second gate. Phase 2K widened the CHECK and the validator but not the
    // surface CHECK; a name admitted by one and refused by another is exactly as
    // inert as a name admitted by neither, and just as silent.
    const validated = new Set(validatedEventNames());
    const missing = productEventNames.filter((name) => !validated.has(name));
    expect(
      missing,
      `these event names have no property branch and would raise 22023: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("detects the defect it exists for, on a name the chain does not admit", () => {
    // The mutation. Without it, a rule whose extraction silently returned
    // everything would pass and prove nothing.
    const admitted = new Set(admittedValues("event_name"));
    expect(admitted.has("calendar_day_viewed")).toBe(false);
    expect(admitted.size).toBeGreaterThan(20);
    const wouldFail = ["capture_started", "calendar_day_viewed"].filter((n) => !admitted.has(n));
    expect(wouldFail).toEqual(["calendar_day_viewed"]);
  });
});

describe("2M-AUDIT-002: the enforcement points are enumerated, not counted", () => {
  it("finds all five where the audit says they are", () => {
    const chain = migrationFiles().map((file) => readFileSync(join(MIGRATIONS, file), "utf8")).join("\n");
    expect(chain).toContain("product_events_event_name_check");
    expect(chain).toContain("private.validate_product_event_properties");
    expect(chain).toContain("product_events_surface_check");

    const contracts = readFileSync(
      join(REPO, "src/features/product-analytics/contracts.ts"),
      "utf8",
    );
    expect(contracts).toMatch(/export const productEventNames = \[/);
    expect(contracts).toMatch(/export const productSurfaces = \[/);
  });

  it("keeps the writer free of a vocabulary copy, which is what two corrections bought", () => {
    /*
     * `202608080087` deleted the frozen event-name list from
     * `private.record_product_event` and `202608090089` deleted the surface
     * list. A third copy reappearing is the exact shape of both defects, so it
     * is asserted against rather than remembered.
     *
     * The check is deliberately on the LAST definition of the function: earlier
     * migrations legitimately contain the copies they later delete, and a scan
     * over the whole chain would fail on its own history.
     */
    let lastDefinition = "";
    for (const file of migrationFiles()) {
      const sql = readFileSync(join(MIGRATIONS, file), "utf8");
      const start = sql.lastIndexOf("function private.record_product_event");
      if (start < 0) continue;
      const body = sql.slice(start);
      const end = body.indexOf("\n$$;");
      lastDefinition = end < 0 ? body : body.slice(0, end);
    }
    expect(lastDefinition, "record_product_event was not found in the chain").not.toBe("");
    expect(lastDefinition, "the writer carries an event-name vocabulary copy again")
      .not.toMatch(/p_event_name\s+(not\s+)?in\s*\(\s*'/);
    expect(lastDefinition, "the writer carries a surface vocabulary copy again")
      .not.toMatch(/p_surface\s+(not\s+)?in\s*\(\s*'/);
  });

  it("declares no calendar surface yet, because migration 1 has not been spent", () => {
    // Slice 2M.1 changes this, and the change is a migration plus this line.
    // Asserting the current state means the transition is visible as a decision
    // rather than as a diff nobody read.
    expect((productSurfaces as readonly string[]).includes("calendar")).toBe(false);
    expect(admittedValues("surface")).not.toContain("calendar");
  });
});
