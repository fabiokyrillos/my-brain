import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { productSurfaces } from "@/features/product-analytics/contracts";

/**
 * `2L-AUDIT-004`, `2L-METRICS-004`, `2L-VIEW-002` — the Work telemetry
 * vocabulary, enumerated **by name** at every enforcement point.
 *
 * ## Why this file exists, and why a count would not do
 *
 * This repository has now paid twice for a copy of a product-event vocabulary
 * that nobody enumerated. `202608080087` deleted the frozen **event-name** copy
 * from `private.record_product_event` and left the **surface** copy standing —
 * one field over — and `202608090089` had to delete that one too, after a
 * deployment probe found every Phase 2K event refused `22023` inside producers
 * that swallow the failure.
 *
 * The lesson recorded in both corrections is that *"there are N enforcement
 * points"* is not a measurement. **The names are the measurement.** So this
 * guard does not count anything: it extracts each vocabulary from each place it
 * is declared and compares the sets element by element.
 *
 * ## The three places, and the one that must stay empty
 *
 * 1. **The application contract** — `productSurfaces` and the `workView`
 *    property validator in `product-analytics/contracts.ts`.
 * 2. **The table CHECK** — `product_events_surface_check`, whose latest
 *    definition is the canonical surface vocabulary and says so in its own
 *    comment.
 * 3. **The property validator** — `private.validate_product_event_properties`,
 *    whose latest definition carries `workView`'s allowed values.
 * 4. **The writer**, `private.record_product_event`, which after `202608090089`
 *    holds **no** copy of either vocabulary — and this guard asserts that
 *    emptiness, because the defect was never a wrong list, it was a *second*
 *    list.
 *
 * ## What this proves for Phase 2L specifically
 *
 * OD-2L-2 is signed as **option A**: `today`, `all` and `waiting` stay the only
 * reported views. That decision is only free if the three existing values are
 * genuinely what every gate enforces — so this guard is what makes
 * `1 allocated · 0 spent` a fact rather than an intention. A fourth value
 * appearing anywhere fails here, whichever place it appears in first.
 */

const REPO = join(__dirname, "..", "..", "..");
const MIGRATIONS = join(REPO, "supabase", "migrations");

const read = (relative: string) => readFileSync(join(REPO, relative), "utf8");

/** The signed Work view vocabulary (OD-2L-2 option A). */
export const SIGNED_WORK_VIEWS = ["today", "all", "waiting"] as const;

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).sort();
}

/**
 * The **last** migration whose text matches `pattern`, read in chain order.
 *
 * Migrations are append-only, so a vocabulary appears in every migration that
 * ever redefined the object carrying it. Only the newest definition is in force,
 * and asserting over all of them would fail on history that is correct.
 */
export function latestMigrationMatching(pattern: RegExp): { name: string; sql: string } {
  const matches = migrationFiles().filter((name) =>
    pattern.test(readFileSync(join(MIGRATIONS, name), "utf8")),
  );
  const name = matches.at(-1);
  if (name === undefined) throw new Error(`no migration matches ${pattern}`);
  return { name, sql: readFileSync(join(MIGRATIONS, name), "utf8") };
}

/** Strips SQL line comments so a commented-out value is not read as declared. */
export function stripSqlComments(sql: string): string {
  return sql.replace(/^\s*--.*$/gm, "");
}

/** The quoted values of a `... in ( 'a', 'b' )` list, in declaration order. */
export function extractInList(sql: string, marker: RegExp): string[] {
  const start = sql.search(marker);
  if (start === -1) throw new Error(`marker ${marker} not found`);
  const open = sql.indexOf("(", sql.indexOf("in", start));
  let depth = 0;
  let end = open;
  for (let index = open; index < sql.length; index += 1) {
    if (sql[index] === "(") depth += 1;
    if (sql[index] === ")") {
      depth -= 1;
      if (depth === 0) {
        end = index;
        break;
      }
    }
  }
  return [...stripSqlComments(sql.slice(open, end)).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

/** The values of a `require_product_event_enum(..., '<key>', array[...])` call. */
export function extractEnumArray(sql: string, key: string): string[] {
  const pattern = new RegExp(
    `require_product_event_enum\\([^;]*?'${key}'\\s*,\\s*array\\[([^\\]]*)\\]`,
    "s",
  );
  const match = pattern.exec(stripSqlComments(sql));
  if (match === null) throw new Error(`no enum array declared for ${key}`);
  return [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

/* -------------------------------------------------------------------------- */
/* The vocabularies, at every enforcement point                                */
/* -------------------------------------------------------------------------- */

describe("2L-AUDIT-004: the Work view vocabulary is one vocabulary", () => {
  const validator = latestMigrationMatching(
    /create or replace function private\.validate_product_event_properties/,
  );

  it("names the effective validator migration, so a reader can check it", () => {
    // Recorded rather than asserted loosely: if a later migration redefines the
    // validator, this value moves and the reviewer sees which file to read.
    expect(validator.name).toBe("202608090088_phase_2k_conversation_telemetry.sql");
  });

  it("the database validator allows exactly the three signed views", () => {
    expect(extractEnumArray(validator.sql, "workView")).toEqual([...SIGNED_WORK_VIEWS]);
  });

  it("the application contract allows exactly the same three, in the same order", () => {
    // `contracts.ts` validates `workView` with an inline `isOneOf` list. Read as
    // text rather than imported, because the point is to compare *declarations*:
    // importing the module would compare it with itself.
    const source = read("src/features/product-analytics/contracts.ts");
    const match = /isOneOf\(value\.workView, \[([^\]]*)\]\)/.exec(source);
    expect(match, "the workView validator is no longer an inline isOneOf list").not.toBeNull();
    const declared = [...match![1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
    expect(declared).toEqual([...SIGNED_WORK_VIEWS]);
  });

  it("the projection's own view list is the same three", () => {
    const source = read("src/features/daily-cycle/work-projection.ts");
    const match = /export const workViews = \[([^\]]*)\]/.exec(source);
    expect(match, "workViews is no longer a literal array").not.toBeNull();
    const declared = [...match![1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
    expect(declared).toEqual([...SIGNED_WORK_VIEWS]);
  });

  it("proves the extraction is non-vacuous", () => {
    // An extractor that returned `[]` everywhere would make all three
    // comparisons pass against each other. Assert the shape it must have found.
    expect(extractEnumArray(validator.sql, "workView")).toHaveLength(3);
    expect(SIGNED_WORK_VIEWS).toHaveLength(3);
  });
});

describe("2L-METRICS-004: the surface vocabulary has one canonical declaration", () => {
  const check = latestMigrationMatching(/add constraint product_events_surface_check/);

  it("names the effective surface-CHECK migration", () => {
    expect(check.name).toBe("202608090089_post_2k_product_event_surface_deduplication.sql");
  });

  it("the table CHECK and the application contract name the same surfaces", () => {
    const declared = extractInList(check.sql, /add constraint product_events_surface_check/);
    expect(declared).toEqual([...productSurfaces]);
  });

  it("includes the two surfaces Work telemetry uses", () => {
    // Non-vacuity with a subject: an empty extraction would satisfy the equality
    // above only if the contract were also empty, but this pins the two values
    // Phase 2L actually depends on.
    const declared = extractInList(check.sql, /add constraint product_events_surface_check/);
    expect(declared).toContain("work");
    expect(declared).toContain("task_command");
  });
});

describe("2L-METRICS-004: the writer holds no copy of either vocabulary", () => {
  /*
   * The property `202608080087` and `202608090089` were written to establish,
   * asserted here so Phase 2L cannot reintroduce it. The failure mode is not a
   * *wrong* list in the writer — it is a *second* list, which drifts silently
   * and refuses inside a call site that swallows the error.
   */
  const writer = latestMigrationMatching(
    /create or replace function private\.record_product_event/,
  );

  it("names the effective writer migration", () => {
    expect(writer.name).toBe("202608090089_post_2k_product_event_surface_deduplication.sql");
  });

  it("declares no surface vocabulary inside the writer's own body", () => {
    const body = writerBody(writer.sql);
    for (const surface of productSurfaces) {
      expect(body, `the writer names the surface '${surface}'`).not.toContain(`'${surface}'`);
    }
  });

  it("declares no Work event name inside the writer's own body", () => {
    const body = writerBody(writer.sql);
    for (const name of ["work_view_viewed", "task_status_changed"]) {
      expect(body, `the writer names the event '${name}'`).not.toContain(`'${name}'`);
    }
  });

  it("proves the body extraction found a real function body", () => {
    // Without this, an extractor that returned "" would pass both assertions
    // above and report a deduplication that never happened.
    const body = writerBody(writer.sql);
    expect(body).toContain("record_product_event");
    expect(body.length).toBeGreaterThan(200);
  });
});

/**
 * The text of the writer's own definition, from its `create or replace` to the
 * function terminator — never the whole migration, which legitimately contains
 * the canonical vocabulary in the CHECK above it and in its verification block
 * below.
 */
export function writerBody(sql: string): string {
  const start = sql.search(/create or replace function private\.record_product_event/);
  if (start === -1) throw new Error("writer definition not found");
  const terminator = sql.indexOf("$$;", start);
  const end = terminator === -1 ? sql.length : terminator;
  return stripSqlComments(sql.slice(start, end));
}

/* -------------------------------------------------------------------------- */
/* The extractors, applied to planted SQL                                      */
/* -------------------------------------------------------------------------- */

describe("the vocabulary extractors themselves", () => {
  /*
   * Every assertion above passes today. That is exactly when an extractor is
   * least trustworthy: one that returned an empty list, or that read the whole
   * migration instead of the function body, would also pass. These fixtures make
   * each detector fire on the mutation it exists to catch.
   */

  it("extracts an in-list in declaration order and ignores commented values", () => {
    const sql = [
      "add constraint product_events_surface_check check (surface in (",
      "  'home',",
      "  -- 'retired_surface',",
      "  'work'",
      "));",
    ].join("\n");
    expect(extractInList(sql, /add constraint product_events_surface_check/))
      .toEqual(["home", "work"]);
  });

  it("notices a fourth workView value wherever it is added", () => {
    const widened = "perform private.require_product_event_enum(p_properties, 'workView', "
      + "array['today', 'all', 'waiting', 'upcoming']);";
    expect(extractEnumArray(widened, "workView"))
      .toEqual(["today", "all", "waiting", "upcoming"]);
    // The comparison the real assertion makes, shown failing on the mutation.
    expect(extractEnumArray(widened, "workView")).not.toEqual([...SIGNED_WORK_VIEWS]);
  });

  it("refuses rather than returns an empty list when a vocabulary is absent", () => {
    // The failure mode that would make every equality above vacuous.
    expect(() => extractEnumArray("select 1;", "workView")).toThrow(/workView/);
    expect(() => extractInList("select 1;", /product_events_surface_check/)).toThrow();
    expect(() => writerBody("select 1;")).toThrow(/writer definition/);
  });

  it("reads only the writer's own body, not the migration around it", () => {
    /*
     * The decisive fixture. `202608090089` declares the canonical surface list
     * in a CHECK *and* asserts over it in a verification block — both in the
     * same file as the writer. An extractor that took the whole file would
     * report the writer as carrying a vocabulary it does not carry, and the
     * "no second copy" assertion would fail on a correct migration.
     */
    const sql = [
      "add constraint product_events_surface_check check (surface in ('work'));",
      "create or replace function private.record_product_event(...)",
      "returns uuid language plpgsql as $$",
      "begin",
      "  perform private.validate_product_event_properties(p_name, p_properties);",
      "  insert into public.product_events ...;",
      "end;",
      "$$;",
      "do $$ begin perform 1 from pg_constraint where 'work' = any(...); end $$;",
    ].join("\n");
    const body = writerBody(sql);
    expect(body).toContain("record_product_event");
    expect(body).not.toContain("'work'");
  });

  it("fires when a vocabulary copy is planted inside the writer's body", () => {
    const sql = [
      "create or replace function private.record_product_event(...)",
      "returns uuid language plpgsql as $$",
      "begin",
      "  if p_surface not in ('home', 'work') then",
      "    raise exception 'Unsupported product surface' using errcode = '22023';",
      "  end if;",
      "end;",
      "$$;",
    ].join("\n");
    expect(writerBody(sql)).toContain("'work'");
  });
});
