import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 2F-GUARD-001 — the plpgsql grammar-trap guard.
 *
 * Two SQL constructs look like ordinary function calls but are grammar, and
 * each has already cost this repository a CI round trip (Slice 2E.4;
 * `docs/TODO.md` "plpgsql `if … case … then` trap"):
 *
 * 1. `coalesce` / `nullif` / `greatest` / `least` have no `pg_proc` entry, so
 *    `pg_catalog.coalesce(...)` parses as an ordinary lookup that can never
 *    resolve — and under `set search_path = ''` there is no fallback. plpgsql
 *    parse-analyses expressions at first *execution*, so `create or replace
 *    function` deploys the defect silently.
 * 2. A bare `case … when … then … end` cannot appear in a plpgsql `if`
 *    condition: the condition scanner stops at the first `then` at paren depth
 *    zero, which is the CASE's own `then`, producing `42601 syntax error at end
 *    of input` — the migration does not apply at all.
 *
 * This guard scans every file in `supabase/migrations/` (where every deployed
 * function body lives — pgTAP's `pg_temp` helpers are test-only and out of
 * scope). Comments and single-quoted literals are stripped first, because the
 * chain legitimately *names* these patterns inside post-deploy string-literal
 * guards (e.g. `202607250052:802`) and prose comments.
 *
 * The two historical occurrences below live in function bodies that later
 * migrations superseded (`202607220045` forward-fixed `044`'s; `202607250052`
 * replaced `undo_operation` entirely). The chain applies because plpgsql does
 * not resolve the lookup at creation time. Migrations are append-only, so the
 * defective text is permanent history — allowlisted exactly, so a third
 * occurrence fails this gate and so does silent drift of the allowlist itself.
 */

const MIGRATIONS_DIR = path.resolve(process.cwd(), "supabase", "migrations");

type Occurrence = { file: string; line: number; match: string };

const HISTORICAL_CATALOG_CALLS: readonly Occurrence[] = [
  {
    file: "202607220041_phase_2c_slice_4_candidate_dispositions.sql",
    line: 1524,
    match: "pg_catalog.greatest(",
  },
  {
    file: "202607220044_phase_2c_slice_5_task_graph.sql",
    line: 1506,
    match: "pg_catalog.greatest(",
  },
];

/**
 * Replaces SQL comments (line and nested block) and single-quoted literals
 * with spaces, preserving every offset and newline so reported line numbers
 * match the file. Dollar-quoted bodies are deliberately NOT stripped — they
 * are exactly where the defects live.
 */
export function stripSqlCommentsAndLiterals(sql: string): string {
  const out = sql.split("");
  let i = 0;
  let blockDepth = 0;
  let inLineComment = false;
  let inLiteral = false;
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      else out[i] = " ";
      i += 1;
      continue;
    }
    if (blockDepth > 0) {
      if (ch === "*" && next === "/") {
        blockDepth -= 1;
        out[i] = " ";
        out[i + 1] = " ";
        i += 2;
        continue;
      }
      if (ch === "/" && next === "*") {
        blockDepth += 1;
        out[i] = " ";
        out[i + 1] = " ";
        i += 2;
        continue;
      }
      if (ch !== "\n") out[i] = " ";
      i += 1;
      continue;
    }
    if (inLiteral) {
      if (ch === "'" && next === "'") {
        out[i] = " ";
        out[i + 1] = " ";
        i += 2;
        continue;
      }
      if (ch === "'") {
        inLiteral = false;
        out[i] = " ";
        i += 1;
        continue;
      }
      if (ch !== "\n") out[i] = " ";
      i += 1;
      continue;
    }
    if (ch === "-" && next === "-") {
      inLineComment = true;
      out[i] = " ";
      i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      blockDepth = 1;
      out[i] = " ";
      out[i + 1] = " ";
      i += 2;
      continue;
    }
    if (ch === "'") {
      inLiteral = true;
      out[i] = " ";
      i += 1;
      continue;
    }
    i += 1;
  }
  return out.join("");
}

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (text[i] === "\n") line += 1;
  return line;
}

/**
 * Trap 1: schema-qualified lookups of grammar constructs that have no `pg_proc`
 * entry — **two families, and the second was added the hard way.**
 *
 * The first family (`coalesce`, `nullif`, `greatest`, `least`) fails at plpgsql's
 * first *execution*, so a migration deploys clean and breaks later.
 *
 * The second family is worse and this guard did not name it until Phase 2M slice
 * 2M.4b. `position(x IN y)`, `substring(x FROM y)`, `overlay(x PLACING y FROM z)`,
 * `trim(BOTH x FROM y)` and `extract(field FROM x)` are **parsed forms**: the
 * keyword inside the parentheses is grammar, and it is only grammar for the
 * unqualified spelling. `pg_catalog.position('a' in b)` is therefore a **syntax
 * error at parse time** — `42601` — and the migration does not apply at all.
 *
 * It cost a red CI run to learn, on a migration whose first application was that
 * run. The fix in every case is an ordinary function that means the same thing
 * and *can* be qualified: `pg_catalog.strpos`, `pg_catalog.substr`,
 * `pg_catalog.btrim`, `pg_catalog.date_part`.
 *
 * Both families are reported through one allowlist, because both are "a
 * schema-qualified name that is not a function".
 */
export function findUnresolvableCatalogCalls(cleanedSql: string): { index: number; match: string }[] {
  const pattern =
    /pg_catalog\s*\.\s*(coalesce|nullif|greatest|least|position|overlay|substring|trim|extract)\s*\(/gi;
  const hits: { index: number; match: string }[] = [];
  for (const m of cleanedSql.matchAll(pattern)) {
    hits.push({ index: m.index ?? 0, match: `pg_catalog.${m[1].toLowerCase()}(` });
  }
  return hits;
}

/**
 * Trap 2: a depth-zero `case` between a plpgsql `if`/`elsif` and its `then`.
 *
 * The scan walks forward from each `if`/`elsif` token, tracking paren depth.
 * The condition ends at the first depth-zero `then`. A depth-zero `;` or a
 * dollar-quote boundary aborts the walk (that `if` was `drop … if exists`,
 * `create … if not exists`, or ran off the body) — those are not plpgsql
 * conditionals. `end if` is skipped by looking at the preceding token.
 */
export function findIfCaseTraps(cleanedSql: string): { index: number }[] {
  const hits: { index: number }[] = [];
  const ifPattern = /\b(elsif|if)\b/gi;
  for (const m of cleanedSql.matchAll(ifPattern)) {
    const start = m.index ?? 0;
    const before = cleanedSql.slice(0, start).trimEnd();
    if (/\bend$/i.test(before)) continue;
    let depth = 0;
    let i = start + m[0].length;
    let sawDepthZeroCase = false;
    let resolved: "trap" | "clean" | "abort" | null = null;
    const cap = Math.min(cleanedSql.length, i + 4000);
    while (i < cap) {
      const ch = cleanedSql[i];
      if (ch === "(") {
        depth += 1;
        i += 1;
        continue;
      }
      if (ch === ")") {
        depth -= 1;
        i += 1;
        continue;
      }
      if (depth === 0 && ch === ";") {
        resolved = "abort";
        break;
      }
      if (depth === 0 && ch === "$" && cleanedSql[i + 1] === "$") {
        resolved = "abort";
        break;
      }
      if (/[a-zA-Z_]/.test(ch)) {
        let j = i;
        while (j < cleanedSql.length && /[a-zA-Z_0-9]/.test(cleanedSql[j])) j += 1;
        const word = cleanedSql.slice(i, j).toLowerCase();
        if (depth === 0 && word === "then") {
          resolved = sawDepthZeroCase ? "trap" : "clean";
          break;
        }
        if (depth === 0 && word === "case") sawDepthZeroCase = true;
        i = j;
        continue;
      }
      i += 1;
    }
    if (resolved === "trap") hits.push({ index: start });
  }
  return hits;
}

function scanMigrations(): {
  catalogCalls: Occurrence[];
  ifCaseTraps: Occurrence[];
} {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const catalogCalls: Occurrence[] = [];
  const ifCaseTraps: Occurrence[] = [];
  for (const file of files) {
    const raw = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const cleaned = stripSqlCommentsAndLiterals(raw);
    for (const hit of findUnresolvableCatalogCalls(cleaned)) {
      catalogCalls.push({ file, line: lineOf(cleaned, hit.index), match: hit.match });
    }
    for (const hit of findIfCaseTraps(cleaned)) {
      ifCaseTraps.push({ file, line: lineOf(cleaned, hit.index), match: "if … case … then" });
    }
  }
  return { catalogCalls, ifCaseTraps };
}

describe("2F-GUARD-001: the migration chain carries no new grammar trap", () => {
  it("finds exactly the two allowlisted historical pg_catalog lookups, superseded and never to grow", () => {
    const { catalogCalls } = scanMigrations();
    expect(catalogCalls).toEqual(HISTORICAL_CATALOG_CALLS);
  });

  it("finds no depth-zero case inside any plpgsql if condition", () => {
    const { ifCaseTraps } = scanMigrations();
    expect(ifCaseTraps).toEqual([]);
  });
});

describe("2F-GUARD-001: the detector itself is falsifiable", () => {
  it("detects a schema-qualified coalesce inside a function body", () => {
    const body = stripSqlCommentsAndLiterals(
      "create function f() returns int as $$ begin return pg_catalog.coalesce(1, 2); end $$ language plpgsql;",
    );
    expect(findUnresolvableCatalogCalls(body)).toHaveLength(1);
  });

  it("detects the pattern through whitespace and case variance", () => {
    expect(findUnresolvableCatalogCalls("PG_CATALOG . Greatest (a, b)")).toHaveLength(1);
  });

  it("detects the PARSED forms too — the family that fails at 42601, not at first call", () => {
    /*
     * Added by Phase 2M slice 2M.4b, and added the hard way: the migration
     * carried `pg_catalog.position('x' in pg_get_functiondef(oid))`, this guard
     * did not name `position`, and the whole `supabase db reset` reddened with
     * `syntax error at or near "pg_get_functiondef"`. The migration would not
     * have applied AT ALL — a strictly louder failure than the `coalesce`
     * family's, and one this guard existed to make impossible.
     *
     * The keyword inside the parentheses is grammar, and it is grammar only for
     * the unqualified spelling.
     */
    const cases = [
      "select pg_catalog.position('a' in b);",
      "select pg_catalog.substring(a from 2 for 3);",
      "select pg_catalog.overlay(a placing 'x' from 2);",
      "select pg_catalog.trim(both ' ' from a);",
      "select pg_catalog.extract(epoch from a);",
    ];
    for (const source of cases) {
      expect(findUnresolvableCatalogCalls(source), source).toHaveLength(1);
    }
  });

  it("leaves the ordinary functions that replace them alone", () => {
    // The fix for each is a real function that means the same thing and CAN be
    // schema-qualified. A guard that also flagged these would push authors back
    // toward the unqualified spellings, which is the opposite of the house rule.
    const source = [
      "select pg_catalog.strpos(a, 'x');",
      "select pg_catalog.substr(a, 2, 3);",
      "select pg_catalog.btrim(a, ' ');",
      "select pg_catalog.date_part('epoch', a);",
    ].join("\n");
    expect(findUnresolvableCatalogCalls(source)).toEqual([]);
  });

  it("ignores the pattern inside comments and string literals, where the chain legitimately names it", () => {
    const body = stripSqlCommentsAndLiterals(
      [
        "-- never write pg_catalog.coalesce( in a body",
        "/* pg_catalog.greatest( is grammar, not a function */",
        "if position('pg_catalog.least(' in lower(bundle)) > 0 then raise exception 'no'; end if;",
      ].join("\n"),
    );
    expect(findUnresolvableCatalogCalls(body)).toEqual([]);
  });

  it("detects a bare case in an if condition — the 42601 trap", () => {
    const body = "if case when a >= b then a else b end > 0 then x := 1; end if;";
    expect(findIfCaseTraps(body)).toHaveLength(1);
  });

  it("detects the same trap on elsif", () => {
    const body = "if a then x := 1; elsif case when b then 1 else 0 end = 1 then x := 2; end if;";
    expect(findIfCaseTraps(body)).toHaveLength(1);
  });

  it("accepts a parenthesized case in an if condition, which is legal", () => {
    const body = "if (case when a >= b then a else b end) > 0 then x := 1; end if;";
    expect(findIfCaseTraps(body)).toEqual([]);
  });

  it("does not mistake drop/create … if exists for a conditional", () => {
    const body = [
      "drop function if exists public.f(uuid);",
      "create table if not exists public.t (id int);",
      "select case when 1 = 1 then 'a' else 'b' end;",
    ].join("\n");
    expect(findIfCaseTraps(body)).toEqual([]);
  });

  it("does not mistake end if for a conditional opener", () => {
    expect(findIfCaseTraps("if a then x := 1; end if;")).toEqual([]);
  });
});
