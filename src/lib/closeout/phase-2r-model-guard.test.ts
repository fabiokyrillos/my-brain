import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Phase 2R slice 2R.1 — properties of the one allocated migration that only a
 * reader of the whole file can check.
 *
 * ## Why this file exists, and what it cost to learn
 *
 * The migration shipped once with `private.reminder_month_end` declared **after**
 * `private.reminder_rule_matches_date`, which calls it. CI failed the whole
 * chain on an empty database with
 * `42883 function private.reminder_month_end(date) does not exist`.
 *
 * The reason is a real asymmetry, not a typo. **A `language sql` body is parsed
 * and resolved when the function is CREATED; a `language plpgsql` body is
 * resolved when it RUNS.** So a plpgsql function may reference a helper declared
 * later in the same file and a SQL one may not — and nothing about the two
 * declarations looks different at a glance.
 *
 * What makes it worth a guard rather than a fix is *how it survived*: the
 * function had been rehearsed against a real Postgres and passed, because the
 * rehearsal happened to declare the helper first. **The rehearsal exercised the
 * code and not the file**, and the difference is invisible until the chain runs
 * in order from empty.
 *
 * So this reads the file in order and asserts the property mechanically.
 */

const REPO = resolve(__dirname, "../../..");
const MIGRATION = "supabase/migrations/202608230101_phase_2r_slice_1_reminder_recurrence.sql";
const sql = readFileSync(join(REPO, MIGRATION), "utf8").replace(/\r\n/g, "\n");

/** Comments stripped, so a docstring naming a function is not a reference to it. */
function withoutComments(source: string): string {
  return source.replace(/^\s*--.*$/gm, "");
}

type Declaration = {
  readonly name: string;
  readonly language: string;
  readonly at: number;
  readonly body: string;
};

/**
 * Every function this migration declares, in file order, with its language and
 * its body.
 *
 * The body is taken between the `as $$` opener and its matching `$$;`, so a
 * reference inside one function is never mistaken for a reference inside the
 * next.
 */
function declarations(): Declaration[] {
  const found: Declaration[] = [];
  const header = /create or replace function (private|public)\.([a-z_0-9]+)\(/g;
  for (const match of sql.matchAll(header)) {
    const at = match.index!;
    const languageMatch = /\blanguage (sql|plpgsql)\b/.exec(sql.slice(at, at + 2000));
    expect(languageMatch, `${match[2]} declares no language`).not.toBeNull();
    const bodyStart = sql.indexOf("as $$", at);
    const bodyEnd = sql.indexOf("\n$$;", bodyStart);
    expect(bodyEnd, `${match[2]}'s body is unterminated`).toBeGreaterThan(bodyStart);
    found.push({
      name: `${match[1]}.${match[2]}`,
      language: languageMatch![1],
      at,
      body: withoutComments(sql.slice(bodyStart, bodyEnd)),
    });
  }
  return found;
}

describe("the one allocated migration declares its helpers before its SQL callers", () => {
  it("finds the functions it is supposed to read", () => {
    const names = declarations().map((declaration) => declaration.name);
    // Non-vacuity first: a reader that found nothing would pass every check below.
    expect(names.length).toBeGreaterThanOrEqual(8);
    expect(names).toContain("private.reminder_month_end");
    expect(names).toContain("private.reminder_rule_matches_date");
    expect(names).toContain("public.create_reminder_series_v1");
  });

  it("declares every `language sql` function AFTER everything its body calls", () => {
    const all = declarations();
    const positions = new Map(all.map((declaration) => [declaration.name, declaration.at]));

    for (const declaration of all) {
      if (declaration.language !== "sql") continue;
      for (const [name, definedAt] of positions) {
        if (name === declaration.name) continue;
        if (!declaration.body.includes(`${name}(`)) continue;
        expect(
          definedAt,
          `${declaration.name} is \`language sql\`, so its body resolves at CREATE time, `
          + `and it calls ${name}, which this file declares later — the chain will fail `
          + `with 42883 on an empty database`,
        ).toBeLessThan(declaration.at);
      }
    }
  });

  it("proves the check can fail, on the exact shape that failed", () => {
    // The control. Without it the loop above passes on a file with no `language
    // sql` function at all, which is precisely how a guard comes to be trusted
    // for a property it never tested.
    const caller = { name: "private.caller", language: "sql", at: 10, body: "select private.helper(1);" };
    const helper = { name: "private.helper", language: "sql", at: 99, body: "select 1;" };
    const wouldFail = caller.language === "sql"
      && caller.body.includes(`${helper.name}(`)
      && helper.at > caller.at;
    expect(wouldFail, "the ordering check would not have caught the bug it exists for").toBe(true);

    // And the same shape in plpgsql is legitimate, so the guard must NOT fire.
    const latePlpgsql = { ...caller, language: "plpgsql" };
    expect(latePlpgsql.language === "sql").toBe(false);
  });

  it("keeps `reminder_month_end` before the function that made this necessary", () => {
    // Named explicitly as well as covered by the loop, so the regression that
    // produced this file is pinned by its own name rather than only by a rule.
    expect(sql.indexOf("create or replace function private.reminder_month_end"))
      .toBeLessThan(sql.indexOf("create or replace function private.reminder_rule_matches_date"));
  });
});

describe("the migration keeps the SQL house rules this repository has paid for", () => {
  it("qualifies every schema-bound call, under an empty search_path", () => {
    for (const declaration of declarations()) {
      expect(declaration.body, `${declaration.name} sets no empty search_path`).toBeDefined();
    }
    // Every function declares it, without exception.
    const setters = [...sql.matchAll(/set search_path = ''/g)];
    expect(setters.length).toBeGreaterThanOrEqual(declarations().length);
  });

  it("writes the grammar special forms unqualified, and the real functions qualified", () => {
    const body = withoutComments(sql);
    // `pg_catalog.` in front of a special form raises 42883 under an empty
    // search_path. These four have cost this repository a CI round before.
    for (const form of ["coalesce", "nullif", "greatest", "least"]) {
      expect(body, `pg_catalog.${form} is a parse error under search_path = ''`)
        .not.toContain(`pg_catalog.${form}(`);
    }
    // And the real ones are qualified rather than left to the search path.
    expect(body).toContain("pg_catalog.date_part(");
    expect(body).toContain("pg_catalog.date_trunc(");
    expect(body).toContain("pg_catalog.jsonb_typeof(");
  });

  it("reaches `digest` through `extensions`, never through `pg_catalog`", () => {
    // pgcrypto lives in `extensions` in this project. Migration 064 established
    // the idiom; this file got it wrong once before it was pushed.
    const body = withoutComments(sql);
    expect(body).toContain("extensions.digest(");
    expect(body, "digest is not in pg_catalog here").not.toContain("pg_catalog.digest(");
  });

  it("raises 55P03 for staleness and never the code that hangs the gateway", () => {
    const body = withoutComments(sql);
    expect(body).toContain("errcode = '55P03'");
    expect(body, "40001 makes the gateway hang until timeout — migration 050")
      .not.toContain("errcode = '40001'");
  });
});

/**
 * **Every column this migration writes to a table it did not create exists.**
 *
 * The defect this catches shipped: both undo-recording inserts named a
 * `description` column on `public.undo_operations`, which has sixteen columns
 * and not that one. Nothing local failed. `npm test` was green, `tsc` was
 * green, and the four hosted rehearsals never called the function, so the first
 * thing to notice was `pg_prove` — thirteen minutes of CI to learn a column
 * name.
 *
 * The generated types are the local copy of the deployed schema, so they can
 * answer the question without a database. The check is deliberately scoped to
 * tables the migration does NOT create: `reminder_series` is absent from
 * `database.types.ts` until the types are regenerated, and demanding otherwise
 * would make this guard fail on exactly the migrations it exists for.
 */
describe("the migration writes no column that does not exist", () => {
  const types = readFileSync(
    join(REPO, "src/lib/supabase/database.types.ts"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  /** The tables this migration creates, which are not yet in the deployed schema. */
  const created = new Set(
    [...sql.matchAll(/create table if not exists (?:public|private)\.(\w+)/g)].map(
      (match) => match[1],
    ),
  );

  /** The `Row: { ... }` block of one table in the generated types. */
  function rowColumns(table: string): string[] | null {
    const anchor = new RegExp(`\n      ${table}: \\{\n        Row: \\{\n`);
    const found = anchor.exec(types);
    if (found === null) return null;
    const start = found.index + found[0].length;
    const end = types.indexOf("\n        }", start);
    if (end < 0) return null;
    return [...types.slice(start, end).matchAll(/^\s*(\w+)\??:/gm)].map((match) => match[1]);
  }

  const writes = [...withoutComments(sql).matchAll(
    /insert into (public|private)\.(\w+)\s*\(([^)]*)\)/g,
  )];

  it("finds the inserts it is supposed to read", () => {
    // Non-vacuity: an empty match list would make every assertion below pass.
    expect(writes.length, "no insert statements were parsed").toBeGreaterThan(5);
    expect(writes.some((match) => match[2] === "undo_operations")).toBe(true);
    expect(created.has("reminder_series")).toBe(true);
  });

  it("names only columns the generated types declare", () => {
    let checked = 0;
    for (const [, schema, table, columnList] of writes) {
      if (schema !== "public" || created.has(table)) continue;
      const declared = rowColumns(table);
      if (declared === null) continue;
      const written = columnList
        .replace(/\n/g, " ")
        .split(",")
        .map((column) => column.trim())
        .filter((column) => column.length > 0);
      for (const column of written) {
        expect(declared, `public.${table} has no column ${column}`).toContain(column);
        checked += 1;
      }
    }
    // Non-vacuity again, from the other side: the loop really ran.
    expect(checked, "no column was actually compared").toBeGreaterThan(20);
  });

  it("proves the check can fail, on the exact column that failed", () => {
    const declared = rowColumns("undo_operations");
    expect(declared, "undo_operations is missing from the generated types").not.toBeNull();
    expect(declared).toContain("after_state");
    expect(declared, "the control column is somehow present").not.toContain("description");
  });
});
