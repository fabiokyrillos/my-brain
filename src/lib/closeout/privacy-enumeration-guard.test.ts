import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ENUMERATED_TABLES,
  ENUMERATION_COVERAGE,
  PRIVACY_CATEGORIES,
  WITHHELD_TABLES,
} from "@/features/privacy/enumeration";

/**
 * `2O-PRIVACY-002`'s enforcement — the guard the owner's decision requires.
 *
 * ## What this guard is for
 *
 * `2O-PRIVACY-002` asks the census to derive its categories *"from the same
 * enumeration the deletion path uses, so the two cannot disagree about what a
 * user owns."* The deletion path's enumeration is
 * `public.account_owned_row_counts`, and it is unreachable from an authenticated
 * surface three times over — it raises unless `auth.role() = 'service_role'`,
 * `202608040072` revoked it from every client role **and carries a postcondition
 * that fails the database build if the grant returns**, and reading it from an
 * authenticated path is ADR-118 Decision 9's named stop condition.
 *
 * The owner resolved this: the surface counts under the user's own identity and
 * RLS, the categories are an explicit **projection**, and *this guard* is what
 * stops the projection and the enumeration drifting. **If a new `public` table
 * with a `user_id` column appears, this fails** until it is either given a
 * category or withheld with a governed reason.
 *
 * ## Where the truth comes from, and why that source is legitimate
 *
 * `account_owned_row_counts` enumerates at run time:
 *
 * > every `information_schema` BASE TABLE in schema `public` carrying a column
 * > named `user_id`.
 *
 * This guard evaluates the same predicate against
 * `src/lib/supabase/database.types.ts`, which is **generated from the live
 * schema** and which `CLAUDE.md` requires to be regenerated in the same change
 * as any schema change. Deriving from it is therefore deriving from the schema,
 * and it runs in the `application` CI job with no database — so a new table
 * fails the build in the fastest job rather than only in the slowest.
 *
 * `supabase/tests/phase_2o_privacy_enumeration.sql` closes the other half: it
 * runs the **literal predicate** against a live database and proves the two
 * populations agree, that `authenticated` really can read every table the
 * projection counts, and that the withheld three really cannot. Neither test
 * alone is sufficient: this one cannot see a stale generated file, and that one
 * cannot see the TypeScript projection.
 */

const REPO = process.cwd();
const TYPES = join(REPO, "src/lib/supabase/database.types.ts");

/** Block and line comments removed, so an authority scan reads code and not documentation. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * What an authenticated path may not *do*.
 *
 * `account_owned_row_counts` is matched as a **call** rather than as a name, and
 * that is a correction this guard forced rather than a convenience. `export.ts`
 * names the function in the archive's own scope declaration — `2O-PRIVACY-006`
 * requires the archive to state what it covers, and *"the predicate
 * `public.account_owned_row_counts` uses"* is the truest way to say it. Failing
 * on the name would be answered by making the archive vaguer about its own
 * scope, which trades a real property for a passing test.
 *
 * ADR-118 Decision 9 forbids **a service-role read on an authenticated path**,
 * and `rpc("account_owned_row_counts"` is the only shape that performs one from
 * PostgREST. `the comment stripper does not blind the scan` plants exactly that
 * call to prove the narrowing did not turn the assertion into a formality.
 */
const FORBIDDEN_IN_AUTHENTICATED_PATH = [
  "service_role",
  "SERVICE_ROLE",
  "createServiceClient",
  'rpc("account_owned_row_counts"',
  "rpc('account_owned_row_counts'",
  'from("jobs").insert',
  ".storage.from(",
] as const;

/**
 * The deletion enumeration's predicate, evaluated against the generated types:
 * every `public` table whose `Row` carries a `user_id` column.
 */
function userOwnedTables(): string[] {
  const source = readFileSync(TYPES, "utf8");
  const start = source.indexOf("  public: {");
  const end = source.indexOf("    Views: {", start);
  expect(start, "the generated types no longer expose a public schema block").toBeGreaterThan(-1);
  expect(end, "the generated types no longer expose a Views block").toBeGreaterThan(start);

  const block = source.slice(start, end);
  const marks = [...block.matchAll(/^ {6}(\w+): \{$/gm)].map(
    (match) => [match[1], match.index ?? 0] as const,
  );

  return marks
    .filter(([, index], position) => {
      const stop = position + 1 < marks.length ? marks[position + 1][1] : block.length;
      const body = block.slice(index, stop);
      const row = body.slice(body.indexOf("Row: {"), body.indexOf("Insert: {"));
      return /^\s+user_id:/m.test(row);
    })
    .map(([name]) => name)
    .sort();
}

describe("2O-PRIVACY-002: the projection and the deletion enumeration cannot disagree", () => {
  it("the predicate matches tables at all, so the derivation is not passing by describing nothing", () => {
    // The failure mode of every inventory test, and this repository has hit it:
    // the matcher stops matching, the set comes back empty, and every
    // subset assertion below passes vacuously.
    expect(userOwnedTables().length).toBeGreaterThan(40);
  });

  it("every table the deletion path enumerates is either counted or withheld", () => {
    const uncovered = userOwnedTables().filter((table) => !ENUMERATION_COVERAGE.includes(table));
    expect(
      uncovered,
      "a public table with a user_id column entered the deletion enumeration and this surface does not name it. " +
        "Give it a category in PRIVACY_CATEGORIES, or record it in WITHHELD_TABLES with the reason and the migration " +
        "that revoked it. Do not delete this assertion: 2O-PRIVACY-002 is the requirement it enforces.",
    ).toEqual([]);
  });

  it("nothing is counted or withheld that the deletion path does not enumerate", () => {
    const owned = new Set(userOwnedTables());
    const invented = ENUMERATION_COVERAGE.filter((table) => !owned.has(table));
    expect(
      invented,
      "the projection names a table the deletion enumeration does not reach — the disagreement runs both ways",
    ).toEqual([]);
  });

  it("the coverage is exactly the enumeration, with nothing named twice", () => {
    expect([...ENUMERATION_COVERAGE].sort()).toEqual(userOwnedTables());
    expect(new Set(ENUMERATION_COVERAGE).size).toBe(ENUMERATION_COVERAGE.length);
  });

  it("a planted table proves the guard can fail", () => {
    // The control, in the direction that matters: a new user-owned table must
    // not slip through. Asserting only against the current tree would pass on a
    // guard whose predicate had quietly stopped working.
    const planted = [...userOwnedTables(), "phase_2p_new_user_owned_table"];
    expect(planted.filter((table) => !ENUMERATION_COVERAGE.includes(table))).toEqual([
      "phase_2p_new_user_owned_table",
    ]);
  });

  it("a planted category entry proves the guard can fail the other way", () => {
    const owned = new Set(userOwnedTables());
    const planted = [...ENUMERATION_COVERAGE, "a_table_that_does_not_exist"];
    expect(planted.filter((table) => !owned.has(table))).toEqual(["a_table_that_does_not_exist"]);
  });
});

describe("2O-PRIVACY-002: the withheld exclusions are governed, not preferences", () => {
  it("each withheld table names the migration that revoked it, and that file exists", () => {
    const migrations = new Set(readdirSync(join(REPO, "supabase/migrations")));
    expect(WITHHELD_TABLES.length).toBeGreaterThan(0);
    for (const entry of WITHHELD_TABLES) {
      expect(migrations, `${entry.table} cites a migration that is not in the tree`).toContain(
        entry.revokedBy,
      );
    }
  });

  it("each withheld table really is revoked from authenticated in the migration it cites", () => {
    // A justification that cites a file which does not contain the revocation is
    // a justification nobody checked. The claim is verified against the SQL.
    for (const entry of WITHHELD_TABLES) {
      const sql = readFileSync(join(REPO, "supabase/migrations", entry.revokedBy), "utf8");
      const revocation = new RegExp(
        `revoke\\s+all\\s+on\\s+(?:table\\s+)?public\\.${entry.table}\\s+from[^;]*authenticated`,
        "i",
      );
      expect(
        revocation.test(sql),
        `${entry.revokedBy} does not revoke public.${entry.table} from authenticated`,
      ).toBe(true);
    }
  });

  it("no withheld table is also counted", () => {
    const counted = new Set(ENUMERATED_TABLES.map((entry) => entry.table));
    for (const entry of WITHHELD_TABLES) expect(counted.has(entry.table)).toBe(false);
  });

  it("the pgTAP suite withholds exactly the same three, pinned in both directions", () => {
    /*
     * The database half of this guard proves things TypeScript cannot — that
     * `authenticated` really may read every counted table and really may not
     * read the withheld ones — and to do it, it must name the withheld set in
     * SQL. That is a second copy, and this repository has been bitten by one
     * before: `product_events`' writer list froze at `202607280061` and silently
     * refused newer events for weeks.
     *
     * So there is **one literal, read by two tests**. The SQL file is the copy;
     * this assertion parses it and pins `WITHHELD_TABLES` to it in both
     * directions, so neither can change without the other failing.
     */
    const sql = readFileSync(join(REPO, "supabase/tests/phase_2o_privacy_enumeration.sql"), "utf8");
    const block = /create temporary table withheld_tables[\s\S]*?unnest\(array\[([\s\S]*?)\]\)/.exec(
      sql,
    );
    expect(block, "the pgTAP suite no longer declares withheld_tables as an array literal").not.toBeNull();

    const inSql = [...(block?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map((match) => match[1]).sort();
    expect(inSql.length, "the SQL parse matched nothing, so this pin proves nothing").toBeGreaterThan(0);
    expect(inSql).toEqual(WITHHELD_TABLES.map((entry) => entry.table).sort());
  });
});

describe("2O-PRIVACY-001 and -003: the surface counts and does not preview", () => {
  it("every category owns at least one table and no table has two categories", () => {
    const seen = new Set<string>();
    for (const category of PRIVACY_CATEGORIES) {
      expect(category.tables.length, `${category.key} has no tables`).toBeGreaterThan(0);
      for (const entry of category.tables) {
        expect(seen.has(entry.table), `${entry.table} appears in two categories`).toBe(false);
        seen.add(entry.table);
      }
    }
  });

  it("the census reads counts only — no row body is ever requested", () => {
    // T-4: a category count is safe, a category preview is not. This is enforced
    // in the query rather than in the markup, so a component cannot reintroduce
    // a preview without first changing the reader.
    const census = readFileSync(join(REPO, "src/features/privacy/census.ts"), "utf8");
    expect(census).toContain('count: "exact"');
    expect(census).toContain("head: true");
  });

  it("a refused count is never rendered as zero", () => {
    const census = readFileSync(join(REPO, "src/features/privacy/census.ts"), "utf8");
    // The refusal path returns `null` and the category resolves to `unreadable`.
    // A `?? 0` on the error branch is precisely the defect the owner's decision
    // names, so the shape is asserted rather than trusted.
    expect(census).toMatch(/if \(result\.error\) return null;/);
    expect(census).toContain('status: "unreadable"');
    expect(census).not.toMatch(/result\.error[^\n]*\?\?\s*0/);
  });
});

describe("2O-PRIVACY-004 and R-2O-19: the export is complete or it refuses", () => {
  const exportSource = readFileSync(join(REPO, "src/features/privacy/export.ts"), "utf8");

  it("the export holds no table list of its own", () => {
    // Completeness is derived, never asserted: a second list is the drift T-2
    // describes, and the only defence is that there is nowhere for it to live.
    expect(exportSource).toContain("ENUMERATED_TABLES");
    for (const category of PRIVACY_CATEGORIES) {
      for (const entry of category.tables) {
        expect(
          exportSource.includes(`"${entry.table}"`),
          `export.ts names ${entry.table} literally — that is a second enumeration`,
        ).toBe(false);
      }
    }
  });

  it("a refused read returns a refusal and never the rows that succeeded", () => {
    expect(exportSource).toContain('status: "refused"');
    expect(exportSource).toContain("if (page.error) return null;");
  });

  it("the export needs no job, no storage object and no service-role client", () => {
    // ADR-118 Decision 9: an export needing a job, storage or a migration is a
    // stop condition, and so is a service-role read on an authenticated path.
    //
    // **The scan is over code, not prose**, and that distinction is the whole
    // reason this assertion is trustworthy. These modules *document* why they
    // cannot call `account_owned_row_counts` — that explanation is the most
    // useful thing in the file for the next reader, and a guard that fails on it
    // would be answered by deleting the explanation. Comments are stripped, and
    // `the comment stripper does not blind the scan` below plants a real call to
    // prove the stripping did not turn the assertion into a formality.
    for (const file of ["export.ts", "actions.ts", "census.ts", "consent-record.ts"]) {
      const source = withoutComments(readFileSync(join(REPO, "src/features/privacy", file), "utf8"));
      for (const forbidden of FORBIDDEN_IN_AUTHENTICATED_PATH) {
        expect(source.includes(forbidden), `${file} reaches for ${forbidden}`).toBe(false);
      }
    }
  });

  it("the comment stripper does not blind the scan", () => {
    // The control the stripping needs. A real call survives it; the same text
    // inside a comment does not. Without this, "no file reaches for a privileged
    // read" would be satisfiable by a stripper that removed everything.
    const called = 'const counts = await supabase.rpc("account_owned_row_counts", { p_user_id: id });';
    const stripped = withoutComments(called);
    expect(
      FORBIDDEN_IN_AUTHENTICATED_PATH.some((pattern) => stripped.includes(pattern)),
      "a real service-role call survives comment stripping and is caught",
    ).toBe(true);

    for (const commented of [
      "/* it cannot call supabase.rpc(\"account_owned_row_counts\", …) because */",
      "// it cannot call supabase.rpc(\"account_owned_row_counts\")",
    ]) {
      const withoutIt = withoutComments(commented);
      expect(
        FORBIDDEN_IN_AUTHENTICATED_PATH.some((pattern) => withoutIt.includes(pattern)),
        "an explanation of why the call is forbidden is not the call",
      ).toBe(false);
    }

    // And naming the function in prose or in a scope declaration is not calling
    // it — the distinction this guard was narrowed to respect.
    expect(
      FORBIDDEN_IN_AUTHENTICATED_PATH.some((pattern) =>
        'derivedFrom: "public.account_owned_row_counts\' predicate"'.includes(pattern),
      ),
    ).toBe(false);
    // And a URL's `//` is not a comment, so stripping does not eat live code.
    expect(withoutComments('const u = "https://example.test/x";')).toContain("https://example.test");
  });

  it("the secret-bearing columns are withheld from the archive", () => {
    // An archive is a file that leaves the product. The BYOK ciphertext and the
    // push capability triple must not be in one.
    const withheld = new Map(
      ENUMERATED_TABLES.filter((entry) => entry.withheldColumns?.length).map((entry) => [
        entry.table,
        (entry.withheldColumns ?? []).map((column) => column.column),
      ]),
    );
    expect(withheld.get("user_ai_credentials")).toEqual(
      expect.arrayContaining(["ciphertext", "iv"]),
    );
    expect(withheld.get("push_subscriptions")).toEqual(
      expect.arrayContaining(["endpoint", "auth", "p256dh"]),
    );
  });
});

describe("2O-PRIVACY-007: the retention posture is reachable and stays generated", () => {
  const section = readFileSync(join(REPO, "src/features/privacy/privacy-section.tsx"), "utf8");

  it("the retention copy comes from the schedule rather than from this slice", () => {
    expect(section).toContain("retentionLine");
    expect(section).toContain("RETENTION_SCHEDULE");
  });

  it("the honesty gate is rendered", () => {
    expect(section).toContain("hasUnenforcedWindow");
  });

  it("this phase schedules no sweep", () => {
    // `R-2O-22`: scheduling is authorization, and a schedule belongs in an
    // operator script. Nothing in this feature may arm one.
    for (const file of readdirSync(join(REPO, "src/features/privacy"))) {
      const source = readFileSync(join(REPO, "src/features/privacy", file), "utf8");
      expect(source.includes("cron.schedule"), `${file} schedules a sweep`).toBe(false);
    }
  });
});
