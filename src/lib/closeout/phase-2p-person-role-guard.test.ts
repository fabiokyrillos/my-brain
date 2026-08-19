/**
 * Slice 2P.6 — the owner's correction of `2P-PERSON-001`, pinned.
 *
 * ## Why a guard rather than a paragraph
 *
 * The requirement used to say *"Company and role are editable from their
 * displayed section"*. `people` has no `role` column — measured live against the
 * deployed schema — so the sentence named a field the product does not have, and
 * building it as written meant adding one. That is a third Phase 2P migration and
 * therefore a stop condition (ADR-123).
 *
 * The owner refused the column and corrected the wording by amendment. The risk
 * this file exists for is not that somebody disagrees: it is that a later reader
 * finds a person page with no global role, decides the requirement is unmet, and
 * adds the obvious column. The correction has to be **executable** to survive
 * that, which means the amendment, the preserved prior wording and the absence of
 * the column are all assertions rather than prose.
 *
 * ## It forbids the act, not the word
 *
 * A guard that failed on the string `people.role` would fail on this very
 * docstring, and on the amendment that explains the refusal — the failure mode
 * this repository has already recorded as *"an authority guard must forbid the
 * act, not the word"*. So the assertions are about **shape**:
 *
 *   * the generated `people` row type, which mirrors the deployed schema;
 *   * migration SQL that would add the column;
 *   * a data-access call that would read or write it.
 *
 * Prose about roles is untouched by all three.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(__dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(REPO, relative), "utf8");

const DECISIONS = read("docs/DECISIONS.md");
const PRD = read("docs/initiatives/phase-2p/PHASE_2P_PRD.md");
const PLAN = read("docs/initiatives/phase-2p/PHASE_2P_IMPLEMENTATION_PLAN.md");
const TYPES = read("src/lib/supabase/database.types.ts");

/**
 * The `people` table's generated `Row` block, and nothing else.
 *
 * Anchored on `      people: {` at the schema's own indentation so it cannot
 * match `task_people`, `person_projects` or a `people` key nested somewhere
 * else — the substring trap that would make this assertion answer about the
 * wrong table.
 */
function peopleRowBlock(): string {
  // Normalized first: this repository is LF with `autocrlf`, so the working
  // copy on Windows carries CRLF and an anchor written with bare `\n` finds
  // nothing — a guard that silently matches zero characters would pass every
  // assertion below it.
  const types = TYPES.replaceAll("\r\n", "\n");
  const start = types.indexOf("\n      people: {\n        Row: {\n");
  expect(start, "generated people Row block").toBeGreaterThan(-1);
  const rowStart = types.indexOf("Row: {", start);
  const rowEnd = types.indexOf("\n        }", rowStart);
  return types.slice(rowStart, rowEnd);
}

/**
 * SQL that would add a role column to `people`.
 *
 * Both grammars: `alter table people add column role` and a `create table
 * people (... role ...)`. The word boundary matters — `role` must not match
 * `roles`, and the table name must not match `task_people`.
 */
const ADDS_PEOPLE_ROLE =
  /alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?(?<!_)people\b[\s\S]{0,300}?add\s+column\s+(?:if\s+not\s+exists\s+)?"?role"?\b/i;

/** A data-access call that reads or writes `people.role`. */
const READS_PEOPLE_ROLE = /\.from\(\s*"people"\s*\)[\s\S]{0,200}?\brole\b/;

function sourceFiles(directory: string, collected: string[] = []): string[] {
  for (const entry of readdirSync(join(REPO, directory), { withFileTypes: true })) {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) sourceFiles(relative, collected);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) collected.push(relative);
  }
  return collected;
}

describe("2P-PERSON-001 was corrected by amendment, and the column stays refused", () => {
  it("records the amendment where the requirement was signed", () => {
    expect(DECISIONS).toMatch(
      /Amendment \(2026-08-19\) — the owner corrects `2P-PERSON-001`'s wording and signs where a role lives/,
    );
    // The refusal itself, and the reason it is not merely a preference.
    expect(DECISIONS).toMatch(/\*\*refuses the column\*\*/);
    expect(DECISIONS).toMatch(/there is no global role for a person/i);
    expect(DECISIONS).toMatch(/a role on a project belongs to the `person_projects` relation/i);
    expect(DECISIONS).toMatch(/a role on a task belongs to the `task_people` relation/i);
    expect(DECISIONS).toMatch(/the absence of a role produces no inference/i);
    // The count must not have moved with the wording.
    expect(DECISIONS).toMatch(/\*\*The count stays 87, the fourteen families and nine slices are unchanged/);
  });

  it("keeps the superseded wording in the history rather than overwriting it", () => {
    const superseded = "Company and role are editable from their displayed section with one explicit action.";
    // In both places: the decision log, and the PRD the declaration lives in.
    expect(DECISIONS).toContain(superseded);
    expect(PRD).toContain(superseded);
    // And the declaration line itself now carries the corrected text.
    expect(PRD).toMatch(
      /^- \*\*2P-PERSON-001:\*\* The associated company is editable directly in the person's main section/m,
    );
  });

  it("carries the correction into the plan the slice is executed from", () => {
    expect(PLAN).toMatch(/`2P-PERSON-001` was corrected by the owner on 2026-08-19/);
    expect(PLAN).toMatch(/\*\*No column is added\*\*/);
    expect(PLAN).toMatch(/\*\*Zero migrations\*\*/);
  });

  it("records slice 2P.6's zero-migration posture against the migration authorization", () => {
    expect(DECISIONS).toMatch(/Amendment \(2026-08-19\) — slice 2P\.6 needs no migration/);
    expect(DECISIONS).toMatch(/`people\.role` in particular is refused by name/);
    expect(DECISIONS).toMatch(/\*\*No relation is persisted to improve a drawing\*\*/);
  });

  it("has no role column on people, in the schema the code is generated from", () => {
    const block = peopleRowBlock();
    expect(block).toContain("organization_id");
    expect(block).not.toMatch(/^\s+role\??:/m);
  });

  it("adds no migration that would create one", () => {
    const directory = "supabase/migrations";
    for (const name of readdirSync(join(REPO, directory))) {
      if (!name.endsWith(".sql")) continue;
      expect(ADDS_PEOPLE_ROLE.test(read(`${directory}/${name}`)), name).toBe(false);
    }
  });

  it("has no data-access call that reads or writes it", () => {
    for (const file of sourceFiles("src")) {
      expect(READS_PEOPLE_ROLE.test(read(file)), file).toBe(false);
    }
  });

  it("is not vacuous: every matcher answers differently on a planted fixture", () => {
    // The migration matcher fires on the statement it forbids, and stays silent
    // on the neighbouring table whose name ends in the same word.
    expect(ADDS_PEOPLE_ROLE.test("alter table public.people add column role text;")).toBe(true);
    expect(ADDS_PEOPLE_ROLE.test('alter table people add column if not exists "role" text;')).toBe(true);
    expect(ADDS_PEOPLE_ROLE.test("alter table public.task_people add column role text;")).toBe(false);
    expect(ADDS_PEOPLE_ROLE.test("alter table public.people add column roles text[];")).toBe(false);
    // It does not fire on prose that merely discusses the refusal — the whole
    // reason this guard tests shape rather than the string.
    expect(ADDS_PEOPLE_ROLE.test("`people.role` is refused; a role lives on the relation.")).toBe(false);

    // The data-access matcher fires on the call and not on the two neighbours
    // that legitimately read a role from a relationship table.
    expect(READS_PEOPLE_ROLE.test('supabase.from("people").select("id,role")')).toBe(true);
    expect(READS_PEOPLE_ROLE.test('supabase.from("task_people").select("task_id,role")')).toBe(false);
    expect(READS_PEOPLE_ROLE.test('supabase.from("person_projects").select("project_id,role")')).toBe(false);
    expect(READS_PEOPLE_ROLE.test('supabase.from("people").select("id,name,notes,organization_id")')).toBe(false);

    // And the row-block reader really is reading a block that has columns in it.
    expect(peopleRowBlock()).toMatch(/notes\??: string \| null/);
  });
});
