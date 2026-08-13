/**
 * Slice 2N.1 — the properties of the **tree** that keep the person page honest.
 *
 * Each of these is something no unit test on a function could hold: they are
 * claims about which files exist, what the schema does and does not carry, and
 * which call sites are allowed to say which things.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { OWNER_AUTHORED_TABLES } from "@/features/provenance/contracts";

const REPO = join(__dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(REPO, relative), "utf8");
/**
 * Source with comments stripped.
 *
 * Mandatory here, not a nicety: every module below *documents* the rule it
 * obeys, so a guard reading raw text would match the sentence explaining the
 * ban and fail on a correct file. A guard that fails on correct code gets
 * weakened by whoever touches it next.
 */
const code = (relative: string) =>
  read(relative).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function walk(dir: string, found: string[] = []): string[] {
  const absolute = join(REPO, dir);
  for (const entry of readdirSync(absolute)) {
    const full = join(absolute, entry);
    const relative = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) walk(relative, found);
    else if (/\.(ts|tsx)$/.test(entry)) found.push(relative);
  }
  return found;
}

const PERSON_PAGE = "src/app/[locale]/app/people/[personId]/page.tsx";
const MIGRATIONS = "supabase/migrations";

function migrationSources(): string {
  return readdirSync(join(REPO, MIGRATIONS))
    .filter((file) => file.endsWith(".sql"))
    .map((file) => readFileSync(join(REPO, MIGRATIONS, file), "utf8"))
    .join("\n");
}

describe("2N-RELATION-003 / OD-2N-8 A: the provenance premise is asserted, not trusted", () => {
  it("finds no provenance column on any table this slice calls owner-authored", () => {
    /*
     * `ownerAuthored(table)` is only honest while the table genuinely has no way
     * to record a source — otherwise the page would be printing "informado por
     * você" over a column that says otherwise.
     *
     * So the union in `contracts.ts` is checked against the migrations rather
     * than believed. If a later phase adds `source_entry_id` to one of these
     * tables, this fails and forces the union to shrink in the same change.
     */
    const sql = migrationSources();
    for (const table of OWNER_AUTHORED_TABLES) {
      const createStatement = new RegExp(`create table[^;]*public\\.${table}\\b[^;]*;`, "is");
      const definition = sql.match(createStatement)?.[0] ?? "";
      expect(definition, `${table} is not defined in the migrations`).not.toBe("");
      expect(definition, `${table} gained a source column; ownerAuthored() is now a fabrication`)
        .not.toMatch(/source_entry_id|interpretation_id/);
    }
  });

  it("adds no migration of its own", () => {
    // `OD-2N-8` A removed the provenance migration, and the slice's schema
    // impact is none. The phase budget is asserted elsewhere; this asserts the
    // narrower thing — 2N.1 created nothing.
    const migrations = readdirSync(join(REPO, MIGRATIONS)).filter((file) => file.endsWith(".sql"));
    /*
     * **Re-framed when slice 2N.3 spent M1.** This pinned the directory at 92
     * files with `202608120092` last, which held only while the phase had spent
     * nothing. Bumping the number on each spend would make this a guard that
     * gets edited to go green; asserting attribution instead is stronger, and
     * it survives M3 and M2 without an edit.
     */
    const phase2n = migrations.filter((file) => /phase_2n/i.test(file));
    for (const file of phase2n) {
      expect(file, `${file} does not name the slice that spent it`).toMatch(/_slice_\d+_/);
    }
    expect(
      phase2n.filter((file) => /_slice_1_/.test(file)),
      "2N.1's schema impact is none; M1 and M3 belong to 2N.3 and M2 to 2N.7",
    ).toEqual([]);
  });
});

describe("2N-PROV-004: no surface invents an origin", () => {
  it("never calls ownerAuthored for a table that carries a nullable source column", () => {
    /*
     * The type system already refuses `ownerAuthored("memories")`. This asserts
     * the same property against the text, because the failure it prevents is so
     * quiet: `memories.source_entry_id` and `tasks.source_entry_id` are both
     * `on delete set null`, so a deleted entry leaves a NULL that is
     * indistinguishable from "the owner typed this" — and printing "informado
     * por você" there is a claim about where knowledge came from that nobody
     * made.
     */
    for (const file of [...walk("src/features"), ...walk("src/app")]) {
      const source = code(file);
      for (const forbidden of ["memories", "tasks", "entries", "people"]) {
        expect(source, `${file} calls ownerAuthored("${forbidden}")`).not.toContain(
          `ownerAuthored("${forbidden}")`,
        );
      }
    }
  });

  it("keeps both nullable-source columns declared `on delete set null`", () => {
    // The premise of the rule above. If this ever changed to `on delete cascade`
    // a NULL would become unambiguous, and the reasoning in `contracts.ts` would
    // need revisiting rather than silently remaining over-cautious.
    const sql = migrationSources();
    expect(sql).toMatch(/source_entry_id uuid references public\.entries\(id\) on delete set null/);
  });

  it("asks the contract whether a source is openable, rather than re-testing it", () => {
    /*
     * Found reviewing the diff, not by a test.
     *
     * The first draft wrote `resolvableEntryIds.has(id) ? sourceHref(id) : undefined`
     * beside `provenance={deriveClaimProvenance(id, resolvableEntryIds)}` — two
     * answers to one question, computed from the same inputs by two different
     * expressions. They agree today and would drift the moment the contract
     * gained a condition, leaving a page that offers a link to a claim it
     * simultaneously labels unsourced.
     *
     * `isOpenable` is the single answer, and it also removes the non-null
     * assertion the duplicated form needed.
     */
    expect(code(PERSON_PAGE), "the page re-implements the contract's resolvability test")
      .not.toMatch(/resolvableEntryIds\.has\(/);
    expect(code(PERSON_PAGE)).toMatch(/isOpenable\(/);
  });

  it("infers no source from text, date or proximity", () => {
    /*
     * `2N-PROV-005`. The provenance module performs no I/O and reads no content,
     * and the way to keep that true is for it to have no signature that could
     * accept content to guess from.
     */
    for (const file of walk("src/features/provenance")) {
      if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) continue;
      const source = code(file);
      expect(source, `${file} reaches for a client`).not.toMatch(/createClient|supabase|fetch\(/);
      expect(source, `${file} reaches for a provider`).not.toMatch(/openai|embed|AIProvider/i);
    }
  });
});

describe("2N-RELATION-005: confidence is never rendered as certainty", () => {
  it("renders no confidence value on the person surfaces", () => {
    /*
     * This is sharper than it first looks, and the first draft of this guard got
     * it wrong by being broader.
     *
     * All three relation tables carry a `confidence` column, and their writers
     * set it to the constant **1** for every owner-authored row
     * (`associations.ts`, `relationships.ts`). Writing that constant is not
     * rendering certainty — it is a column being filled. But *rendering* it
     * would print "100%" beside something the owner merely typed, which is
     * `2N-RELATION-005`'s failure exactly: a bare number shown as a fact, and
     * the most confident-looking number in the table at that.
     *
     * So the assertion is scoped to what renders — the page and the components —
     * and deliberately NOT to the Server Actions, which is where the writes
     * live. A guard that flagged the writes would fail on correct code.
     */
    const renderers = [PERSON_PAGE, ...walk("src/features/entities").filter((f) => f.endsWith(".tsx"))];
    for (const file of renderers) {
      if (file.includes(".test.")) continue;
      expect(code(file), `${file} renders a confidence value`).not.toMatch(/\bconfidence\b/i);
    }
  });

  it("does not even select the column into a person-page projection", () => {
    // Stronger than not printing it: a value absent from the projection cannot
    // be rendered by a later edit, and is not sitting in the RSC payload either.
    const selects = code(PERSON_PAGE).match(/\.select\("[^"]*"\)/g) ?? [];
    expect(selects.length).toBeGreaterThan(0);
    for (const projection of selects) {
      expect(projection, "confidence reached the person page's data").not.toContain("confidence");
    }
  });
});

describe("2N-PERSON-007 / 2N-SEC-003: the page introduces no new authority", () => {
  it("adds no write of its own", () => {
    const source = code(PERSON_PAGE);
    expect(source).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    expect(source).not.toMatch(/service_role|SERVICE_ROLE/);
  });

  it("adds no writer to the provenance module", () => {
    // The slice ships a reader and only a reader, the same shape `aliases.ts`
    // keeps: there is deliberately no `recordProvenance` for a later caller to
    // find and reach for.
    for (const file of walk("src/features/provenance")) {
      expect(code(file), `${file} writes`).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    }
  });
});

describe("2N-PERSON-004: every section says whether the owner maintains it", () => {
  it("marks each section of the person page as persisted or derived", () => {
    /*
     * Counted rather than merely present: the page has six sections a reader
     * could edit or not, and one unmarked section is exactly the case where a
     * derived list reads as something they can change.
     *
     * Two of the six are marked inside the panels they render
     * (`RelationshipPanel` and the two `AssociationPanel`s), so the assertion
     * spans both files rather than the page alone.
     */
    const onPage = code(PERSON_PAGE).match(/<SectionOriginNote/g) ?? [];
    expect(onPage.length, "the person page marks identity, tasks, memories and timeline").toBe(4);

    for (const panel of [
      "src/features/entities/relationship-panel.tsx",
      "src/features/entities/association-panel.tsx",
    ]) {
      expect(code(panel), `${panel} does not state whether it is persisted`).toMatch(/<SectionOriginNote/);
    }
  });
});

describe("2N-ACCESS-005: the copy is typed, not scattered", () => {
  it("routes every provenance string through the copy module", () => {
    // The rule `ENGINEERING_STANDARDS` states and this phase repeats: no locale
    // ternary carrying user-facing copy outside a typed module.
    for (const file of walk("src/features/provenance")) {
      if (file.endsWith("copy.ts") || file.includes(".test.")) continue;
      expect(code(file), `${file} decides copy inline`).not.toMatch(/locale === "pt-BR" \?/);
    }
  });
});
