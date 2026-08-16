/**
 * Slice 2N.0's structural obligations — the ones no unit test can hold, because
 * each is a property of the **tree** rather than of a function.
 *
 * Five things this slice promised not to do, and three it promised to do
 * everywhere rather than somewhere. Every one of them is the kind that passes by
 * inspection today and stops being true in a diff nobody reads closely.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { DOMAIN_SPECS } from "@/features/search/contracts";

const REPO = join(__dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(REPO, relative), "utf8");
const code = (relative: string) =>
  read(relative).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function walk(dir: string, found: string[] = []): string[] {
  const absolute = join(REPO, dir);
  for (const entry of readdirSync(absolute)) {
    const full = join(absolute, entry);
    if (statSync(full).isDirectory()) walk(join(dir, entry), found);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) found.push(join(dir, entry).replace(/\\/g, "/"));
  }
  return found;
}

const CONTEXTUAL_ROUTES = [
  "src/app/[locale]/app/people/page.tsx",
  "src/app/[locale]/app/people/[personId]/page.tsx",
  "src/app/[locale]/app/projects/[projectId]/page.tsx",
  "src/app/[locale]/app/memories/page.tsx",
  "src/app/[locale]/app/memories/[memoryId]/page.tsx",
  "src/app/[locale]/app/files/page.tsx",
];

describe("2N-PRIVACY-006/-010: `notes` left the searchable people domain", () => {
  it("is neither matched nor snippeted", () => {
    // ADR-110 Decision 5, and a deliberate narrowing of ADR-093 rather than an
    // accidental reopening — the distinction `2N-PRIVACY-006` exists to force.
    expect(DOMAIN_SPECS.people.columns).toEqual(["name"]);
    expect(DOMAIN_SPECS.people.snippetColumn).toBeNull();
  });

  it("was not replaced by another free-text column on the same domain", () => {
    /*
     * The obvious wrong fix: swap `notes` for some other prose so the result row
     * keeps its subtitle. That would satisfy the letter of the requirement and
     * recreate the exposure one column over. A person result is a name.
     */
    expect(DOMAIN_SPECS.people.columns).not.toContain("notes");
    expect(DOMAIN_SPECS.people.snippetColumn).not.toBe("notes");
    expect(DOMAIN_SPECS.people.columns).toHaveLength(1);
  });

  it("leaves ADR-093's other domains alone", () => {
    // The narrowing is signed for `people` only. A diff that tidied the other
    // six the same way would be reopening a closed decision.
    expect(DOMAIN_SPECS.projects.columns).toEqual(["name", "description"]);
    expect(DOMAIN_SPECS.organizations.columns).toEqual(["name", "description"]);
    expect(DOMAIN_SPECS.entries.columns).toEqual(["original_content"]);
  });

  it("keeps the person findable by name and by alias", () => {
    // Masking a note never hides the person (`2N-PRIVACY-010`).
    expect(DOMAIN_SPECS.people.titleColumn).toBe("name");
    expect(DOMAIN_SPECS.people.aliasEntityType).toBe("person");
  });

  it("is not selected by any indirect contextual surface", () => {
    /*
     * `2N-PRIVACY-010` forbids displaying the note on an indirect surface, and
     * the strongest form of that is not fetching it. The person's OWN page is a
     * direct surface and does select it — it masks it, and hands it to the edit
     * form, which ADR-110 Decision 9 explicitly allows because opening that form
     * is an explicit act.
     */
    const indirect = CONTEXTUAL_ROUTES.filter(
      (route) => route !== "src/app/[locale]/app/people/[personId]/page.tsx",
    );
    for (const route of indirect) {
      expect(code(route), `${route} selects or renders people.notes`).not.toMatch(/\bnotes\b/);
    }
  });

  it("masks it on the one page that does render it, rather than printing it", () => {
    const page = code("src/app/[locale]/app/people/[personId]/page.tsx");
    expect(page).toMatch(/deriveFreeTextSensitivity\(\)/);
    // The bare interpolation the audit found. If this reappears, the note is
    // being printed beside the mask that was supposed to withhold it.
    expect(page).not.toMatch(/<p>\{person\.notes/);
  });
});

describe("2N-PERSON-003 / -PROJECT-006 / -KNOWS-008: no silent bound survives", () => {
  it("leaves no bare numeric limit on a contextual route", () => {
    /*
     * The audit's finding, as a rule: `.limit(100)` six times on the person page
     * and four on the project page, none of them stating its bound. Every bound
     * now comes from the shared vocabulary, so the number a surface applies and
     * the number it reports are necessarily the same.
     */
    for (const route of CONTEXTUAL_ROUTES) {
      const bare = code(route).match(/\.limit\(\s*\d+\s*\)/g) ?? [];
      expect(bare, `${route} still bounds a list with a bare number`).toEqual([]);
    }
  });

  it("asks for one row more than it shows, wherever it reports a bound", () => {
    // A `BoundedNotice` fed by a query that did not probe would report `bounded:
    // false` forever — the silent truncation again, wearing a component.
    for (const route of CONTEXTUAL_ROUTES) {
      const source = code(route);
      if (!source.includes("<BoundedNotice")) continue;
      expect(source, `${route} reports a bound it never measured`).toMatch(/withProbe\(/);
      expect(source).toMatch(/boundedList\(/);
    }
  });

  it("feeds every panel list from a bounded list, never from the raw query", () => {
    /*
     * The defect the two checks above could not see, and the reason this one is
     * phrased about the DATA rather than about the notice.
     *
     * Three lists on the person page (`relationships`, `contexts`, linked
     * `projects`) and one on the project page (linked `people`) were queried with
     * `withProbe(limit)` and then handed straight to their panel. Both checks
     * above passed the whole time: the routes *did* call `withProbe`, they *did*
     * call `boundedList`, and they *did* render `<BoundedNotice>` — just for
     * their other lists. So the probe row was rendered rather than reported, and
     * at 51 relationships or 101 linked projects the page showed one row past its
     * own limit and claimed to be complete.
     *
     * A required `bound` prop stops the notice being forgotten, which `tsc`
     * enforces. It cannot stop the rows themselves being the untrimmed array —
     * `bound={boundedX}` beside `rows={raw.map(...)}` type-checks perfectly and
     * renders one row too many. That is what this asserts.
     */
    for (const route of CONTEXTUAL_ROUTES) {
      const source = code(route);
      const fed = [...source.matchAll(/(?:rows|relationships)=\{([A-Za-z0-9_.]+)\.map\(/g)];
      for (const [, expression] of fed) {
        expect(
          expression,
          `${route} feeds a panel from \`${expression}\`, which is the untrimmed query result`,
        ).toMatch(/\.items$/);
      }
    }
  });

  it("has exactly one bounds vocabulary, and it is search's word", () => {
    /*
     * `2N-PERSON-003` says the bound is stated "in the vocabulary search already
     * uses". Two words for one fact is how a product describes the same
     * truncation two ways on two screens.
     *
     * Scoped to the bounds module and the routes this slice governs, and NOT to
     * `src/features` at large, because `hasMore`/`hasNext` already exist there
     * for **pagination** — which is a different fact with a different remedy.
     * "There is a next page" comes with a way to reach it; "this list is
     * bounded" does not. Flagging pagination as a competing bounds vocabulary
     * would have been a guard that fails on correct code, and those get
     * weakened rather than obeyed.
     */
    expect(read("src/features/bounds/contracts.ts")).toMatch(/readonly bounded: boolean/);
    const competing = [...walk("src/features/bounds"), ...CONTEXTUAL_ROUTES].filter((file) =>
      /\b(isTruncated|wasCapped|wasTruncated|capped:|truncated:)\b/.test(code(file)),
    );
    expect(competing, "a competing bounds vocabulary appeared").toEqual([]);
  });
});

describe("2N-IDENTITY-004/-009: the alias reader reads, and only reads", () => {
  const reader = "src/features/entities/aliases.ts";

  it("is the only thing in src that reads or writes entity_aliases", () => {
    /*
     * **Narrowed by slice 2O.5, and narrowed rather than weakened.**
     *
     * The claim this test protects is `2N-IDENTITY-004`/`-009`: exactly one
     * module may **reach** `entity_aliases`, and none may write it. It was
     * expressed as *any mention of the name*, which was exact while the tree
     * held nothing else that could mention it — and then
     * `src/features/privacy/enumeration.ts` named the table in a **list of
     * table names**, because `2O-PRIVACY-002` requires the privacy projection to
     * cover every table the deletion enumeration reaches. Naming a table in an
     * enumeration is not reaching it, and there is no data access in that file
     * at all.
     *
     * The two available responses were an allowlist entry and a narrower
     * predicate. An allowlist grants a **file** a permission in order to make a
     * test pass — the move §82 recorded refusing for `BYOK-GUARD-005` — and it
     * would have exempted that file from the real rule forever. So the predicate
     * moves to the access shape, `from("entity_aliases")`, which is the only way
     * PostgREST reaches a table, and the control below proves the narrowing did
     * not turn the assertion into a formality.
     */
    const callers = walk("src").filter(
      (file) =>
        file !== "src/lib/supabase/database.types.ts" && /from\(["']entity_aliases["']\)/.test(code(file)),
    );
    expect(callers).toEqual([reader]);
  });

  it("the narrowed predicate still catches a second reader", () => {
    // The control. Without it, "only one module reaches the table" would be
    // satisfied by a predicate that had quietly stopped matching anything.
    const access = /from\(["']entity_aliases["']\)/;
    expect(access.test(code(reader)), "the reader itself no longer matches").toBe(true);
    expect(access.test('const rows = await supabase.from("entity_aliases").select("*");')).toBe(true);
    expect(access.test("const tables = ['entity_aliases', 'entity_tags'];")).toBe(false);
  });

  it("opens no write path", () => {
    /*
     * `2N-IDENTITY-009` says an alias is owner-authored and this slice ships no
     * writer. Asserting the absence is what stops one arriving "while we are
     * here" — and an alias writer is the first half of entity merge, which
     * OD-2N-3 A forbids outright.
     */
    const source = code(reader);
    for (const write of [".insert(", ".update(", ".upsert(", ".delete("]) {
      expect(source, `the alias reader gained ${write}`).not.toContain(write);
    }
  });

  it("uses no service-role client and accepts no owner id", () => {
    // `2N-SEC-002`: ownership stays RLS-and-query only.
    const source = code(reader);
    expect(source).not.toMatch(/service_role|SERVICE_ROLE|createServiceClient/);
    expect(source).not.toMatch(/user_id/);
  });

  it("applies the validity window in every query it makes", () => {
    const source = code(reader);
    const selects = source.match(/\.from\("entity_aliases"\)/g) ?? [];
    const fromClauses = source.match(/valid_from\.is\.null/g) ?? [];
    const toClauses = source.match(/valid_to\.is\.null/g) ?? [];
    expect(selects.length).toBeGreaterThan(0);
    expect(fromClauses).toHaveLength(selects.length);
    expect(toClauses).toHaveLength(selects.length);
  });

  it("does not re-implement the SQL normalizer", () => {
    /*
     * `normalize_entity_alias` is revoked from `authenticated`, and
     * `normalizer-divergence.test.ts` already proves a TypeScript port disagrees
     * with it on combining marks. A second normalizer here would be a second
     * answer to a question that already has an authority.
     */
    expect(code(reader)).not.toMatch(/normalized_alias|normalize/i);
  });
});

describe("2N.0 adds no schema and no new authority", () => {
  it("creates no migration", () => {
    /*
     * The slice's own stop condition. `M1`, `M2` and `M3` are allocated to 2N.3
     * and 2N.7 and are non-transferable; 2N.0's schema impact is none, and a
     * migration appearing in this slice means a requirement changed shape
     * without anybody deciding to let it.
     */
    const migrations = readdirSync(join(REPO, "supabase", "migrations")).filter((file) =>
      file.endsWith(".sql"),
    );
    /*
     * **Re-framed when slice 2N.3 spent M1.** This asserted 92 files and that
     * NO Phase 2N migration existed anywhere — true when 2N.0 shipped, and a
     * claim about the whole phase rather than about this slice. The phase is
     * now authorized to spend three.
     *
     * The narrower claim is the one this file wants and it is stronger: every
     * Phase 2N migration names the slice that spent it, and none names 2N.0.
     */
    const phase2n = migrations.filter((file) => /phase_2n/i.test(file));
    for (const file of phase2n) {
      expect(file, `${file} does not name the slice that spent it`).toMatch(/_slice_\d+_/);
    }
    expect(
      phase2n.filter((file) => /_slice_0_/.test(file)),
      "2N.0's schema impact is none; M1 and M3 belong to 2N.3 and M2 to 2N.7",
    ).toEqual([]);
  });

  it("adds no sensitivity column to people or projects", () => {
    // `2N-PRIVACY-003`, asserted against the generated types rather than the
    // migrations, so a column added by any route would be caught.
    const types = read("src/lib/supabase/database.types.ts");
    for (const table of ["people", "projects"]) {
      const start = types.indexOf(`      ${table}: {`);
      expect(start, `${table} missing from the generated types`).toBeGreaterThan(0);
      const row = types.slice(start, types.indexOf("Insert: {", start));
      expect(row, `${table} gained a sensitivity column`).not.toContain("sensitivity");
    }
  });

  it("adds no write path to the contextual routes", () => {
    /*
     * `2N-SEC-003`. This slice is a presentation change: it masks, bounds and
     * reads. A `.insert(`/`.update(`/`.delete(` appearing directly on a route
     * would be a client-reachable write outside the Server Action layer.
     */
    for (const route of CONTEXTUAL_ROUTES) {
      const source = code(route);
      for (const write of [".insert(", ".update(", ".upsert(", ".delete("]) {
        expect(source, `${route} gained a direct ${write}`).not.toContain(write);
      }
    }
  });

  it("keeps the derivation free of I/O, so it cannot widen a scope", () => {
    const source = code("src/features/sensitivity/subject-derivation.ts");
    expect(source).not.toMatch(/supabase|createClient|fetch\(|from\(/);
  });
});

describe("2N-TIME-002: the tree-wide local-day guard is not accommodated", () => {
  it("keeps OPEN_OCCURRENCES empty", () => {
    /*
     * ADR-112 Decision 3 and its "alternatives considered" forbid widening the
     * allowlist to admit a new route: a route that would need one has a defect,
     * not an exemption. This slice added four routes' worth of edits to files
     * inside that guard's corpus, so the assertion is that they needed nothing.
     *
     * The guard itself owns the census — this only asserts the allowlist stayed
     * shut, which is the half a new slice could quietly change.
     */
    const guard = read("src/lib/closeout/local-day-correction-guard.test.ts");
    const declaration = guard.match(/const OPEN_OCCURRENCES[^=]*=\s*(\[[^\]]*\])/);
    expect(declaration, "OPEN_OCCURRENCES not found").not.toBeNull();
    expect(declaration?.[1].replace(/\s|\/\/.*$/gm, "")).toBe("[]");
  });

  it("builds no second timezone guard", () => {
    // ADR-112 Decision 3: a narrower census beside a tree-wide rule reads as
    // authoritative to the next author. 2N.0 builds none.
    const guards = readdirSync(join(REPO, "src", "lib", "closeout"));
    expect(guards.filter((file) => /^phase-2n-.*(time|timezone|offset|local-day)/.test(file))).toEqual([]);
  });
});
