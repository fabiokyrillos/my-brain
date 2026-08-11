import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * `2M-RECUR-001` … `-003` — OD-2M-7: **recurrence is out of Phase 2M**, and the
 * absence is mechanical rather than remembered.
 *
 * ## Why a guard and not a review note
 *
 * The owner signed recurrence out and named the refusal explicitly: no
 * recurrence field, no series table, no occurrence table, no exception model, no
 * repeating rule, **no preparatory UI and no preparatory event**. The last two
 * are what a review cannot catch. A `series_id` column added "for later" does
 * nothing yet, reads as harmless in a diff, and by the time anyone notices, the
 * decision has been overtaken by code instead of by a decision — which is
 * exactly what `phase-2l-no-gesture-guard.test.ts` exists to prevent one surface
 * over.
 *
 * ## What is deliberately NOT matched
 *
 * The product already refuses recurrence **honestly and deterministically**, and
 * that refusal has to keep working:
 *
 * - `recurrence_requested` — a declared member of the task-command refusal
 *   taxonomy, with copy in both locales and an instruction in the extraction
 *   contract;
 * - `recurring_info` — a memory kind;
 * - `historical_recurrence` — a technical-details label;
 * - `String.prototype.repeat`, `repeated`, `repeatedly` in prose and tests.
 *
 * So the patterns below name **implementation shapes**, not the word. A guard
 * that fired on the word would fail the very files written to refuse the
 * feature, which this repository has already lost a slice to once.
 *
 * ## Comments are stripped first
 *
 * For the same reason: the modules that refuse recurrence explain what they
 * refuse, and naming a thing is not building it.
 */

const REPO = join(__dirname, "..", "..", "..");

/**
 * The shapes a recurrence implementation would take, in the two languages this
 * repository writes. Each is an artifact, not a mention.
 */
const RECURRENCE_SHAPES: ReadonlyArray<readonly [string, RegExp]> = [
  ["an iCalendar recurrence rule", /\brrule\b/i],
  ["a recurrence rule field", /\brecurrence_rule\b|\brecurrenceRule\b/],
  ["a recurrence pattern field", /\brecurrence_pattern\b|\brecurrencePattern\b/],
  ["a bare recurrence column or property", /\brecurrence\s*[:=]|\brecurrence\b\s+(text|jsonb|interval)/],
  ["a repeat interval field", /\brepeat_(every|interval|until|count)\b|\brepeatEvery\b|\brepeatUntil\b/],
  ["a series model", /\bseries_id\b|\bseriesId\b|\brecurring_series\b|\btask_series\b/],
  ["an occurrence model", /\boccurrence_id\b|\boccurrenceId\b|\btask_occurrences\b|\brecurring_occurrence\b/],
  ["a recurrence exception model", /\brecurrence_exception\b|\bexdate\b|\bexrule\b/i],
  ["a recurrence expander", /\bexpandRecurrence\b|\bexpand_recurrence\b|\bexpandSeries\b/],
  ["a recurring-task flag", /\bis_recurring\b|\bisRecurring\b|\brecurring_task\b/],
];

/** Everything the decision governs. Naming them makes this a decision, not a house style. */
const GOVERNED_TREES = ["src", "supabase/migrations", "supabase/functions", "public"];

/**
 * The one file the scan skips: **this one**.
 *
 * Its mutation fixtures are the forbidden shapes as string literals, so a guard
 * that scanned itself would report itself and could only be silenced by deleting
 * the proofs that make it a guard. Stripping comments is not enough — the
 * fixtures are code, deliberately.
 *
 * The exemption is a **single named path**, and `the exemption is exactly one
 * file` below asserts that, because a broadened exemption is how a guard stops
 * guarding. Every other file under `src/lib/closeout/` is still scanned.
 */
const SELF = "src/lib/closeout/phase-2m-recurrence-guard.test.ts";

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ")
    .replace(/^\s*--.*$/gm, " ");
}

function sourceFiles(root: string, dir: string, found: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(join(root, dir));
  } catch {
    return found;
  }
  for (const entry of entries) {
    const relative = `${dir}/${entry}`;
    if (statSync(join(root, relative)).isDirectory()) sourceFiles(root, relative, found);
    else if (/\.(ts|tsx|js|sql)$/.test(entry)) found.push(relative);
  }
  return found;
}

export function recurrenceArtifacts(root: string): Array<{ shape: string; where: string }> {
  const found: Array<{ shape: string; where: string }> = [];
  for (const tree of GOVERNED_TREES) {
    for (const file of sourceFiles(root, tree)) {
      if (file === SELF) continue;
      const code = stripComments(readFileSync(join(root, file), "utf8"));
      for (const [shape, pattern] of RECURRENCE_SHAPES) {
        if (pattern.test(code)) found.push({ shape, where: file });
      }
    }
  }
  return found;
}

const roots: string[] = [];
function scratchRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "recur-"));
  for (const dir of GOVERNED_TREES) mkdirSync(join(root, dir), { recursive: true });
  roots.push(root);
  return root;
}

describe("2M-RECUR-001: no recurrence artifact exists anywhere the decision governs", () => {
  afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });

  it("finds none in this repository", () => {
    expect(recurrenceArtifacts(REPO)).toEqual([]);
  });

  it("exempts exactly one file, and it is this one", () => {
    // The exemption is the guard's only blind spot, so its size is asserted.
    expect(SELF).toBe("src/lib/closeout/phase-2m-recurrence-guard.test.ts");
    expect(existsSync(join(REPO, SELF))).toBe(true);
    // And the blind spot is real rather than decorative: the fixtures below are
    // genuinely detectable, so scanning this file would report them.
    const root = scratchRoot();
    mkdirSync(join(root, "src/lib/closeout"), { recursive: true });
    writeFileSync(
      join(root, "src/lib/closeout/some-other-guard.test.ts"),
      'const planted = "recurrence_rule";\n',
    );
    expect(recurrenceArtifacts(root).map((f) => f.where))
      .toContain("src/lib/closeout/some-other-guard.test.ts");
  });

  it("fires on a recurrence column added to a migration", () => {
    const root = scratchRoot();
    writeFileSync(
      join(root, "supabase/migrations/202611010001_tasks_repeat.sql"),
      "alter table public.tasks add column recurrence_rule text;\n",
    );
    expect(recurrenceArtifacts(root)).toContainEqual({
      shape: "a recurrence rule field",
      where: "supabase/migrations/202611010001_tasks_repeat.sql",
    });
  });

  it("fires on a series model, which is how recurrence usually arrives", () => {
    const root = scratchRoot();
    writeFileSync(
      join(root, "supabase/migrations/202611010002_series.sql"),
      "create table public.task_series (id uuid primary key);\n",
    );
    expect(recurrenceArtifacts(root).map((f) => f.shape)).toContain("a series model");
  });

  it("fires on a handler added 'in preparation', which does nothing yet", () => {
    const root = scratchRoot();
    mkdirSync(join(root, "src/features/calendar"), { recursive: true });
    writeFileSync(
      join(root, "src/features/calendar/repeat.ts"),
      "export function expandRecurrence() { return []; }\n",
    );
    expect(recurrenceArtifacts(root).map((f) => f.shape)).toContain("a recurrence expander");
  });

  it("fires on an occurrence model and on a recurring flag", () => {
    const root = scratchRoot();
    writeFileSync(join(root, "public/x.js"), "const occurrenceId = 1; const isRecurring = true;\n");
    const shapes = recurrenceArtifacts(root).map((f) => f.shape);
    expect(shapes).toContain("an occurrence model");
    expect(shapes).toContain("a recurring-task flag");
  });

  it("does NOT fire on the refusal, the memory kind, the label, or String.repeat", () => {
    // The control. A guard that fires on the product refusing the feature would
    // teach the next author to soften the refusal until the guard goes quiet,
    // which is worse than having no guard.
    const root = scratchRoot();
    mkdirSync(join(root, "src/features/task-commands"), { recursive: true });
    writeFileSync(
      join(root, "src/features/task-commands/copy.ts"),
      [
        `export const reasons = { recurrence_requested: "Ainda não trabalho com agendas que se repetem." };`,
        `export const kinds = ["recurring_info"] as const;`,
        `export const label = "historical_recurrence";`,
        `export const long = "a".repeat(10);`,
        `// Repeating or recurring schedules do not exist.`,
      ].join("\n"),
    );
    expect(recurrenceArtifacts(root)).toEqual([]);
  });

  it("does NOT fire on a comment that names what it refuses", () => {
    const root = scratchRoot();
    mkdirSync(join(root, "src/features/calendar"), { recursive: true });
    writeFileSync(
      join(root, "src/features/calendar/notes.ts"),
      "/* No rrule, no series_id, no occurrence_id ships here. */\nexport const x = 1;\n",
    );
    expect(recurrenceArtifacts(root)).toEqual([]);
  });
});

describe("2M-RECUR-002: the existing deterministic refusal still holds", () => {
  const read = (relative: string) => readFileSync(join(REPO, relative), "utf8");

  it("keeps `recurrence_requested` in the refusal taxonomy", () => {
    expect(read("src/features/task-commands/taxonomy.ts")).toMatch(/"recurrence_requested"/);
  });

  it("keeps user-facing copy for it in both locales", () => {
    const copy = read("src/features/task-commands/copy.ts");
    expect(copy).toMatch(/recurrence_requested: "Ainda não trabalho com agendas que se repetem\."/);
    expect(copy).toMatch(/recurrence_requested: "I do not handle repeating schedules yet\."/);
  });

  it("keeps the extraction contract instructing the model to use it", () => {
    expect(read("src/lib/ai/task-command-schema.ts"))
      .toMatch(/recurring schedules do not exist[\s\S]{0,80}recurrence_requested/i);
  });

  it("records the destination as a separate initiative rather than a deferred slice", () => {
    const prd = read("docs/initiatives/phase-2m/PHASE_2M_PRD.md");
    expect(prd).toMatch(/2M-RECUR-004:\*\*[\s\S]{0,200}separately authorized initiative/);
  });
});
