/**
 * Phase 2N slice 2N.3 — the rules the M1 unit closes by, asserted against the
 * tree rather than narrated in a report.
 *
 * Slice 2N.2 recorded why this file exists: *a `not-built-by-rule` whose only
 * evidence is a sentence is a classification nobody re-checks.* Three of this
 * slice's requirements close by rule, and each of them is a claim about what the
 * schema and the app **cannot** express. A later phase that makes any of them
 * expressible must fail here, in the same change that makes it expressible.
 *
 * It also holds together the one convergence M1 created: the validity predicate
 * now exists **twice**, once in SQL and once in TypeScript, and they are the
 * same rule. Two copies of a rule with no test between them is how a scheduled
 * memory ends up retrievable on one path and not the other.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(__dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(REPO, relative), "utf8");

const MIGRATIONS = join(REPO, "supabase", "migrations");
const M1 = "202608130093_phase_2n_slice_3_validity_aware_retrieval.sql";

const MEMORY_SURFACES = [
  "src/app/[locale]/app/memories/page.tsx",
  "src/app/[locale]/app/memories/[memoryId]/page.tsx",
];

function migrationSources(): string {
  return readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith(".sql"))
    .map((file) => readFileSync(join(MIGRATIONS, file), "utf8"))
    .join("\n");
}

describe("2N-CORRECT-003: the validity predicate is one rule with two spellings", () => {
  const file = read(join("supabase", "migrations", M1));
  const lifecycle = read("src/features/memories/lifecycle.ts");

  /**
   * The FUNCTION BODY, not the file.
   *
   * The migration's header explains the defect it repairs, and to do that it
   * quotes the offending `limit least(…)` clause in prose. A guard reading the
   * whole file finds that quotation first and concludes the bound precedes the
   * predicate — which is exactly the wrong verdict, produced by a scan looking
   * at an explanation instead of at code. The migration's own verification
   * block hit the same trap from the other side.
   */
  const sql = (() => {
    const open = file.indexOf("as $$");
    const close = file.indexOf("$$;", open);
    expect(open, "M1 no longer declares a function body this guard can read").toBeGreaterThan(0);
    expect(close).toBeGreaterThan(open);
    return file.slice(open, close);
  })();

  it("applies validity inside the retrieved set, ahead of the bound", () => {
    /*
     * The requirement is specifically about WHERE the filter runs. Filtering
     * after the bound removes an archived memory from the citations while it
     * has already displaced a live one, and no downstream code can recover a
     * row the database never sent.
     */
    const predicate = sql.indexOf("valid_until is null");
    const bound = sql.indexOf("limit least(");
    expect(predicate, "the retrieval function no longer reads valid_until").toBeGreaterThan(0);
    expect(bound, "the bound is no longer expressed as this guard can read it").toBeGreaterThan(0);
    expect(bound, "validity must be applied BEFORE the bound, not after it").toBeGreaterThan(predicate);
  });

  it("uses both halves of the window, because one half admits a scheduled memory", () => {
    // A predicate carrying only `valid_until` retrieves a memory the product
    // tells the owner is not in use yet. That is the same lie in the other
    // direction, and it is the specific mistake `phase_2k_memory_undo.sql`'s
    // narrower predicate would invite if it were copied here.
    expect(sql).toMatch(/valid_from is null or public\.memories\.valid_from <= now\(\)/);
    expect(sql).toMatch(/valid_until is null or public\.memories\.valid_until > now\(\)/);
  });

  it("inverts exactly the boundaries `isMemoryInForce` declares", () => {
    /*
     * `lifecycle.ts` is the product's definition and the badge the owner reads
     * comes from it. The SQL is its negation:
     *
     *   archived  when `until <= at`  ->  retrieved when `valid_until >  now()`
     *   scheduled when `from  >  at`  ->  retrieved when `valid_from  <= now()`
     *
     * Both boundaries are INCLUSIVE of the instant they name. If either
     * comparison is flipped in TypeScript, the two stop being the same rule and
     * this fails — which is the only reason it is safe to keep both copies.
     */
    expect(lifecycle, "the archived boundary changed in TypeScript").toMatch(
      /until !== null && until <= at\) return "archived"/,
    );
    expect(lifecycle, "the scheduled boundary changed in TypeScript").toMatch(
      /from !== null && from > at\) return "scheduled"/,
    );
  });

  it("keeps the posture RLS depends on, and touches nothing else", () => {
    // Read from the whole FILE, not the body: the posture is declared in the
    // function header, and a `create table` smuggled in beside the function
    // would be outside the body too.
    expect(file).toMatch(/security invoker/);
    expect(file).toMatch(/set search_path = ''/);
    // M1's whole affected surface is one function. Anything below would make it
    // carry a second responsibility, which `OD-2N-14` forbids by allocation.
    for (const forbidden of [
      /create table/i,
      /alter table/i,
      /create policy/i,
      /create index/i,
      /cron\.schedule/i,
      /create type/i,
    ]) {
      expect(file, `M1 carries schema beyond its allocation: ${forbidden}`).not.toMatch(forbidden);
    }
  });

  it("does not widen what retrieval may return", () => {
    // `source_type` stays exactly the two arms it has always had. Widening it
    // is a named stop condition for this slice.
    const types = [...sql.matchAll(/'(\w+)'::text/g)].map((match) => match[1]);
    expect(new Set(types)).toEqual(new Set(["entry", "memory"]));
  });
});

describe("2N-KNOWS-005: fact / interpretation / inference is not representable for a memory", () => {
  it("finds no epistemic classification on the memories table", () => {
    /*
     * The requirement's own clause decides this: *never asserts a distinction it
     * cannot substantiate.* `memories` carries no classification column and no
     * `interpretation_id`, so the product has nothing to read.
     *
     * `memories.kind` contains a value spelled `fact`, beside `preference`,
     * `habit` and seven more. It is a CATEGORY OF SUBJECT MATTER. Rendering it
     * as an epistemic level would mint a vocabulary out of a taxonomy that never
     * meant one — the same move slice 2N.2 refused when it declined to map
     * `blocker` onto `risk`.
     */
    const types = read("src/lib/supabase/database.types.ts");
    const start = types.indexOf("      memories: {");
    expect(start, "memories missing from the generated types").toBeGreaterThan(0);
    const row = types.slice(start, types.indexOf("Insert: {", start));
    for (const column of ["element_classifications", "classification", "interpretation_id", "epistemic"]) {
      expect(row, `memories gained ${column}; 2N-KNOWS-005 must be reclassified`).not.toContain(column);
    }
  });

  it("control: the same scan DOES find the classification vocabulary that exists", () => {
    // Without this the assertion above passes against a types file that failed
    // to load, or a scan looking in the wrong place. `entry_interpretations`
    // really does carry `element_classifications` — the point is that a memory
    // holds no pointer to one.
    const types = read("src/lib/supabase/database.types.ts");
    const start = types.indexOf("      entry_interpretations: {");
    expect(start).toBeGreaterThan(0);
    const row = types.slice(start, types.indexOf("Insert: {", start));
    expect(row).toContain("element_classifications");
  });
});

describe("2N-KNOWS-009: nothing in this family reaches a provider", () => {
  it("keeps the memory surfaces free of any provider call", () => {
    // True by construction today, which is exactly why it is asserted: a
    // property true only by accident is one a later edit breaks in silence.
    for (const surface of MEMORY_SURFACES) {
      const source = read(surface);
      for (const forbidden of ["@/lib/ai", "getAIProvider", "openai", "embedText"]) {
        expect(source, `${surface} reaches a provider`).not.toContain(forbidden);
      }
    }
  });
});

describe("2N-KNOWS-003: no memory surface manufactures an origin", () => {
  it("retired the three copy strings rather than leaving them renderable", () => {
    /*
     * Two of the three were false. "Created by you" was printed for every null
     * `source_entry_id`, and the column is `on delete set null`. "The
     * originating record no longer exists" was printed whenever the row did not
     * come back, which under RLS also covers a foreign entry.
     *
     * Deleted rather than deprecated: a copy string that still exists is one a
     * later surface can still render.
     */
    const tree = [...MEMORY_SURFACES, "src/features/memories/copy.ts"].map(read).join("\n");
    for (const retired of ["provenanceManual", "provenanceFromEntry", "provenanceUnknown"]) {
      expect(tree, `${retired} is still reachable`).not.toMatch(new RegExp(`${retired}\\s*[:,)]`));
    }
  });

  it("derives provenance through the shared contract on both surfaces", () => {
    for (const surface of MEMORY_SURFACES) {
      expect(read(surface), `${surface} does not use the provenance contract`)
        .toContain("deriveClaimProvenance");
    }
  });

  it("control: the contract makes owner-authorship for memories a type error", () => {
    // The assertion that matters is not that the pages call the right function,
    // but that calling the wrong one cannot compile. `OWNER_AUTHORED_TABLES` is
    // the closed union, and `memories` is deliberately not in it.
    const contracts = read("src/features/provenance/contracts.ts");
    const union = contracts.slice(
      contracts.indexOf("OWNER_AUTHORED_TABLES"),
      contracts.indexOf("] as const;", contracts.indexOf("OWNER_AUTHORED_TABLES")),
    );
    expect(union).toContain("person_relationships");
    expect(union, "memories entered the owner-authored union, which fabricates an origin")
      .not.toContain("memories");
  });
});

describe("2N-IDENTITY-005…007: merge and duplicate surfacing are not built", () => {
  const migrations = migrationSources();

  it("declares no merge authority anywhere in the schema", () => {
    // `OD-2N-3` option A. Not a preference — a signed refusal, and one that a
    // later phase is meant to re-open deliberately rather than inherit by drift.
    for (const forbidden of [
      /merge_person/i,
      /merge_project/i,
      /merge_entit/i,
      /canonical_person_id/i,
      /canonical_project_id/i,
      /duplicate_candidate/i,
    ]) {
      expect(migrations, `merge or canonical identity became representable: ${forbidden}`)
        .not.toMatch(forbidden);
    }
  });

  it("control: the same scan finds an authority that DOES exist", () => {
    // Without this, every refusal above is satisfied by a scan that read
    // nothing at all — the failure this repository has recorded as "a control
    // must not be exempt".
    expect(migrations).toMatch(/confirm_entry_task_candidates/);
    expect(migrations).toMatch(/undo_operation/);
  });

  it("surfaces no duplicate suggestion in the app", () => {
    // `2N-IDENTITY-005`: with no merge, a surfaced duplicate is an item with no
    // available action, which `2N-CONFLICT-005` refuses by rule.
    const app = readdirSync(join(REPO, "src", "features"), { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
      .map((entry) => readFileSync(join(entry.parentPath ?? entry.path, entry.name), "utf8"))
      .join("\n");
    for (const forbidden of [/possibleDuplicate/i, /duplicateOf/i, /mergeInto/i]) {
      expect(app, `a duplicate or merge affordance appeared: ${forbidden}`).not.toMatch(forbidden);
    }
  });
});

describe("2N-CORRECT-008: no memory correction path is a direct client write", () => {
  it("keeps every memory mutation behind a Server Action", () => {
    /*
     * `authenticated` holds direct `insert/update/delete` on `memories`
     * (`202607160006`), which is what makes this rule worth asserting rather
     * than assuming — and, separately, what makes `2N-CORRECT-009`'s refusal of
     * a client-side multi-delete a live rule rather than an academic one.
     */
    const actions = read("src/features/memories/actions.ts");
    expect(actions.startsWith('"use server"') || actions.includes('"use server"')).toBe(true);

    for (const surface of [
      "src/features/memories/memory-edit-form.tsx",
      "src/features/memories/memory-proposal-card.tsx",
    ]) {
      const source = read(surface);
      expect(source, `${surface} writes to the database from the client`)
        .not.toMatch(/\.from\(["']memories["']\)/);
    }
  });
});
