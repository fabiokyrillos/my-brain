/**
 * `2Q-CITE-001` — the generated types agree with the migration, in **both**
 * directions.
 *
 * ## Why this is not "we regenerated the file"
 *
 * `supabase gen types typescript` cannot produce this column here yet, and the
 * reason is a sequencing fact rather than a tooling complaint: the `--linked`
 * generator reads the **deployed** database, and the deployed database does not
 * carry `summaries.citations` until the migration is applied — which happens
 * *after* this pull request merges, because the migration's own gates require a
 * green merge SHA first. Generating from a local stack is not available either
 * (ADR-041 records why: the CLI demands an access token even against a local
 * `--db-url`, and satisfying it offline meant planting a credential-shaped
 * literal that GitHub push protection correctly rejected).
 *
 * So the entry is added **by hand**, exactly as ADR-041 established for
 * `list_task_command_candidates`, and **no claim of regeneration is made
 * anywhere.** Parity is proved three ways instead:
 *
 *   migration  — the schema as declared      (this file, both directions)
 *   types file — the schema as TypeScript believes it
 *   pgTAP      — the schema as Postgres actually built it
 *                (`supabase/tests/phase_2q_summary_citations.sql`)
 *
 * The fourth proof arrives at deployment: once the migration is applied,
 * `supabase gen types typescript --linked` is diffed against the committed file
 * and the result is recorded in the slice's deployment record. That is the
 * check this file cannot perform, and it is named rather than implied.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(__dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(REPO, relative), "utf8").replace(/\r\n/g, "\n");

const MIGRATION = "supabase/migrations/202608210100_phase_2q_slice_1_summary_citations.sql";
const TYPES = "src/lib/supabase/database.types.ts";
const PGTAP = "supabase/tests/phase_2q_summary_citations.sql";

/** The `summaries` block of the generated types, split by its three faces. */
function summariesFace(face: "Row" | "Insert" | "Update"): readonly string[] {
  const types = read(TYPES);
  const table = types.indexOf("      summaries: {");
  expect(table, "the summaries table is gone from the generated types").toBeGreaterThan(-1);
  const start = types.indexOf(`${face}: {`, table);
  const end = types.indexOf("        }", start);
  return [...types.slice(start, end).matchAll(/^ {10}([a-z_]+)\??:/gm)].map((match) => match[1]);
}

describe("2Q-CITE-001: the migration and the generated types describe one column", () => {
  it("declares exactly one column, and it is the allocated one", () => {
    const sql = read(MIGRATION);
    const added = [...sql.matchAll(/add column\s+([a-z_]+)/gi)].map((match) => match[1]);
    expect(added, "the one migration adds more than the one column").toEqual(["citations"]);
    expect(sql).toMatch(/alter table public\.summaries/);
    expect(sql).toMatch(/citations jsonb not null default '\[\]'::jsonb/);
  });

  it("appears on all three faces of the generated type", () => {
    expect(summariesFace("Row")).toContain("citations");
    expect(summariesFace("Insert")).toContain("citations");
    expect(summariesFace("Update")).toContain("citations");
  });

  it("is optional on Insert and Update because the column has a default", () => {
    const types = read(TYPES);
    const table = types.indexOf("      summaries: {");
    const insert = types.slice(types.indexOf("Insert: {", table), types.indexOf("Update: {", table));
    expect(insert).toContain("citations?: Json");
    // Required on Row: the column is `not null`, so a read always has a value
    // and no caller has to handle an absent one.
    const row = types.slice(types.indexOf("Row: {", table), types.indexOf("Insert: {", table));
    expect(row).toContain("citations: Json");
    expect(row).not.toContain("citations?: Json");
  });

  it("agrees in the OTHER direction too: the types add no column the migration did not", () => {
    /*
     * The half that catches a hand-edit going the wrong way. The `summaries`
     * table's column set is the fourteen the deployed database carried at
     * parity `202608190099` — recorded live in the slice 2Q.0 acceptance record
     * — plus exactly the one this migration adds.
     */
    expect([...summariesFace("Row")].sort()).toEqual([
      "citations",
      "content",
      "generated_at",
      "id",
      "input_tokens",
      "model",
      "original_content",
      "output_tokens",
      "period_end",
      "period_start",
      "period_type",
      "status",
      "title",
      "updated_at",
      "user_id",
    ]);
  });

  it("and pgTAP pins the same name, so all three artifacts agree or one goes red", () => {
    expect(read(PGTAP)).toMatch(/has_column\(\s*'public',\s*'summaries',\s*'citations'/);
  });
});

describe("2Q-CITE-002 / -003: what the migration deliberately does NOT do", () => {
  /**
   * The migration's **executable, non-documentary** SQL.
   *
   * **This is not tidiness, it is the difference between a check and a
   * coincidence** — and it took two passes to get right, both recorded because
   * the second is the less obvious one.
   *
   * The first version scanned the raw file and failed on `on delete set null`
   * inside a `--` comment explaining *why the column is deliberately not a
   * foreign key*. Stripping `--` lines fixed that and the scan then failed on
   * `foreign key` again — this time inside the `comment on column … is '…'`
   * statement, which is **prose that lives inside a statement**. A line-based
   * stripper cannot see the difference; only knowing what the statement *is*
   * can.
   *
   * The rule underneath both: **an authority guard must forbid the act, not the
   * word**, or it fails on the paragraph explaining why the act is forbidden.
   * Rewording the explanation until the scanner agreed would have been fixing
   * the evidence to fit the test, and this repository has paid for that once
   * already.
   */
  const sql = () =>
    read(MIGRATION)
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n")
      // `comment on …;` is documentation the database happens to store. It is
      // removed as a unit, not by line, because its body spans many of them.
      .replace(/comment on [\s\S]*?;\s*$/gim, "")
      .toLowerCase();

  it("creates no foreign key, so deleting a cited record cannot rewrite history", () => {
    expect(sql()).not.toMatch(/references\s+public\./);
    expect(sql()).not.toMatch(/on delete (cascade|set null)/);
    expect(sql()).not.toMatch(/foreign key/);
  });

  it("creates no policy, no grant and no revoke", () => {
    for (const forbidden of ["create policy", "alter policy", "drop policy", "grant ", "revoke "]) {
      expect(sql(), `the migration contains ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("creates no check constraint, trigger or validator, which is what keeps the vocabulary free", () => {
    for (const forbidden of ["check (", "create trigger", "create or replace function"]) {
      expect(sql(), `the migration contains ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("performs no backfill, because OD-2Q-3 is signed as option A", () => {
    expect(sql()).not.toMatch(/^\s*update public\.summaries/m);
    expect(sql()).not.toMatch(/insert into public\.summaries/);
  });

  it("is not vacuous: these scans do find their subjects in a migration that has them", () => {
    // The control. Without it every assertion above would pass on an empty
    // file, and would keep passing if the reader broke.
    const other = read("supabase/migrations/202608190099_phase_2p_slice_4_automation_policy_and_calibration.sql").toLowerCase();
    expect(other).toContain("grant ");
    expect(other).toContain("create or replace function");
  });

  it("is two-sided the other way: the stripper removes prose and keeps statements", () => {
    /*
     * The control for the stripper itself. Without it, a stripper that removed
     * **everything** would make every refusal above pass on an empty string —
     * which is the failure mode of fixing a scanner instead of a finding, and
     * the one that would be hardest to notice.
     */
    const raw = read(MIGRATION);
    // Both kinds of prose really are present in the file...
    expect(raw, "the -- explanation must still say why there is no FK")
      .toMatch(/on delete set null/);
    expect(raw, "the column comment must still say it is not a foreign key")
      .toMatch(/comment on column public\.summaries\.citations/);
    // ...and both are really removed from what the refusals scan...
    expect(sql()).not.toMatch(/on delete set null/);
    expect(sql()).not.toMatch(/comment on column/);
    // ...while the one statement that must survive does.
    expect(sql(), "the stripper ate the migration itself")
      .toContain("alter table public.summaries");
    expect(sql()).toContain("add column citations jsonb not null default '[]'::jsonb");
  });
});
