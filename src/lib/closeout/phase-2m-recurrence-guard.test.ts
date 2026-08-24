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
 *
 * **Split in two by ADR-132 Decision 1, and the split is the whole point.**
 *
 * The lift is `strictly limited to reminders`. So the patterns are separated by
 * what they would be evidence *of*:
 *
 *  - `TASK_SHAPES` name recurrence **on tasks**, which `OD-2R-6` keeps OUT with
 *    no destination inside this phase. They are scanned **everywhere, with no
 *    exemption at all** — not even in the files the lift authorizes.
 *  - `NEUTRAL_SHAPES` name recurrence in general. They stay forbidden
 *    everywhere **except** the enumerated reminder files below.
 *
 * Widening the allowlist is therefore a visible, reviewable act, and it can
 * never accidentally admit a recurring *task*: that half has no allowlist to
 * widen.
 */
const TASK_SHAPES: ReadonlyArray<readonly [string, RegExp]> = [
  ["a task series model", /\btask_series\b|\btaskSeries\b/],
  ["a task occurrence model", /\btask_occurrences\b|\btaskOccurrences\b/],
  ["a recurring-task flag", /\bis_recurring\b|\bisRecurring\b|\brecurring_task\b/],
];

const NEUTRAL_SHAPES: ReadonlyArray<readonly [string, RegExp]> = [
  ["an iCalendar recurrence rule", /\brrule\b/i],
  ["a recurrence rule field", /\brecurrence_rule\b|\brecurrenceRule\b/],
  ["a recurrence pattern field", /\brecurrence_pattern\b|\brecurrencePattern\b/],
  ["a bare recurrence column or property", /\brecurrence\s*[:=]|\brecurrence\b\s+(text|jsonb|interval)/],
  ["a repeat interval field", /\brepeat_(every|interval|until|count)\b|\brepeatEvery\b|\brepeatUntil\b/],
  ["a series model", /\bseries_id\b|\bseriesId\b|\brecurring_series\b/],
  ["an occurrence model", /\boccurrence_id\b|\boccurrenceId\b|\brecurring_occurrence\b/],
  ["a recurrence exception model", /\brecurrence_exception\b|\bexdate\b|\bexrule\b/i],
  ["a recurrence expander", /\bexpandRecurrence\b|\bexpand_recurrence\b|\bexpandSeries\b/],
];

const RECURRENCE_SHAPES: ReadonlyArray<readonly [string, RegExp]> = [
  ...TASK_SHAPES,
  ...NEUTRAL_SHAPES,
];

/**
 * The files ADR-132 Decision 1's lift authorizes to carry a neutral shape.
 *
 * **Enumerated, never globbed.** A glob over `src/features/reminders/` would
 * silently admit whatever anyone put there next, which is how a scoped lift
 * becomes an unscoped one. Every entry is a file Phase 2R slice 2R.1 created or
 * changed for the recurrence model, and `the allowlist is exactly what the lift
 * authorizes` below asserts the list rather than trusting it.
 *
 * Note what is NOT here: `src/features/tasks/**`, `src/features/calendar/**` and
 * every migration that is not the one allocated one. The lift does not reach
 * tasks, the calendar, or any other object.
 */
const REMINDER_RECURRENCE_ALLOWLIST: readonly string[] = [
  "supabase/migrations/202608230101_phase_2r_slice_1_reminder_recurrence.sql",
  "src/features/reminders/recurrence-rule.ts",
  "src/features/reminders/recurrence-rule.test.ts",
  "src/features/reminders/recurrence-rule-parity.test.ts",
  "src/features/reminders/recurrence-language.ts",
  "src/features/reminders/recurrence-language.test.ts",
  "src/features/reminders/recurrence-derivation.ts",
  "src/features/reminders/recurrence-derivation.test.ts",
  "src/features/reminders/series-action-state.ts",
  "src/features/reminders/series-actions.ts",
  "src/features/reminders/series-actions.test.ts",
  "src/features/reminders/series-schema.ts",
  "src/features/reminders/series-schema.test.ts",
  /*
   * Slice 2R.2 — the surface half of the same lift.
   *
   * 2R.1 added the writer; these are the files that let the owner *reach* it,
   * plus the three the scope question made recurrence-aware. Enumerated
   * individually for the reason above: `series-feedback.tsx` is deliberately
   * NOT here, because it never spells a governed shape — adding it "for
   * symmetry" would authorize a file the scan does not report, which is how an
   * enumerated list starts drifting toward a glob.
   *
   * `lifecycle.test.ts`, `outcomes.test.ts` and `projection.test.ts` are the
   * same category as the guards below: they record the model rather than
   * implement it, and the record is what carries the shape.
   */
  "src/features/reminders/series-controls.tsx",
  "src/features/reminders/series-controls.test.tsx",
  "src/features/reminders/operation-key.ts",
  "src/features/reminders/projection.ts",
  "src/features/reminders/projection.test.ts",
  "src/features/reminders/lifecycle.test.ts",
  "src/features/reminders/outcomes.test.ts",
  /*
   * Slice 2R.3's answer to this boundary, rather than a widening of it.
   *
   * `2R-SURFACE-003` asks EVERY surface that lists a recurring reminder to say
   * so, and the calendar is one — but ADR-132 Decision 1's lift is *"strictly
   * limited to reminders"* and this list deliberately excludes
   * `src/features/calendar/**`. The first implementation had the calendar read
   * the rule's own columns, and this guard refused it. Correctly.
   *
   * `repeat-labels.ts` is where that lookup went instead: the calendar asks in
   * its own terms — *these reminder ids, which of them repeat* — and receives
   * sentences. The recurrence vocabulary never leaves the reminders feature, so
   * **the boundary held and the code moved**. `calendar-projection.ts` and its
   * test carry none of these shapes, which is why neither is here.
   */
  "src/features/reminders/repeat-labels.ts",
  "src/features/reminders/repeat-labels.test.ts",
  "src/lib/closeout/phase-2r-model-guard.test.ts",
  /*
   * The two guards that hold `reminders`' closed column list.
   *
   * Same category as the generated types below: they RECORD the schema rather
   * than implement anything, and the column list is the record. Leaving them
   * out would mean the guards that prove the lift landed correctly are
   * themselves reported as the artifact the lift authorized — an enforcer
   * defeated by a recorder, which slice 2P.7 already wrote down as the wrong
   * way round.
   */
  "src/lib/closeout/phase-2p-reminder-recurrence-guard.test.ts",
  "src/lib/closeout/phase-2r-foundation.test.ts",
  /*
   * **Generated, and listed for exactly that reason.**
   *
   * `database.types.ts` is emitted from the schema. Once the migration adds
   * `reminders.series_id`, the generated file carries it whether anyone wants it
   * to or not, so its entry here records a CONSEQUENCE of the lift rather than a
   * decision to write recurrence into it. Leaving it out would mean the next
   * type regeneration failed a guard nobody could satisfy without hand-editing
   * generated output -- which is how a generated file stops being generated.
   */
  "src/lib/supabase/database.types.ts",
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
      // The lift is scoped to reminders, so the allowlist exempts a file from
      // the NEUTRAL shapes only. The task shapes are scanned in every file
      // without exception, because `OD-2R-6` keeps recurring tasks out and
      // nothing in Phase 2R may quietly start them.
      const lifted = REMINDER_RECURRENCE_ALLOWLIST.includes(file);
      const shapes = lifted ? TASK_SHAPES : RECURRENCE_SHAPES;
      for (const [shape, pattern] of shapes) {
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
    // The label moved when ADR-132 Decision 1 split the shapes: `task_series`
    // is now a TASK shape, which is the half with no exemption anywhere. The
    // assertion is unchanged in strength -- it still demands this fires -- and
    // the second half is what the split bought, so it is asserted too.
    expect(recurrenceArtifacts(root).map((f) => f.shape)).toContain("a task series model");
    expect(TASK_SHAPES.map(([label]) => label)).toContain("a task series model");

    // And the neutral half still fires on a series column that is not a task's.
    const neutral = scratchRoot();
    writeFileSync(
      join(neutral, "supabase/migrations/202611010003_series.sql"),
      "alter table public.notes add column series_id uuid;\n",
    );
    expect(recurrenceArtifacts(neutral).map((f) => f.shape)).toContain("a series model");
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

  /**
   * **The lift, and the half of it that has no exemption.**
   *
   * ADR-132 Decision 1 lifted the recurrence refusal `strictly limited to
   * reminders`, and ADR-133 authorized building it. A guard that answered that
   * by going quiet everywhere would have converted a scoped lift into an
   * unscoped one — so the exemption is per-file AND per-shape, and this is the
   * control that proves the task half really is unexemptable.
   */
  it("keeps recurring TASKS refused even inside a file the lift authorizes", () => {
    const root = scratchRoot();
    mkdirSync(join(root, "src/features/reminders"), { recursive: true });
    // An allowlisted path, carrying both kinds of shape.
    writeFileSync(
      join(root, "src/features/reminders/recurrence-rule.ts"),
      "const seriesId = 1;\nconst isRecurring = true;\n",
    );
    const found = recurrenceArtifacts(root).filter(
      (artifact) => artifact.where === "src/features/reminders/recurrence-rule.ts",
    );
    // The neutral shape is lifted...
    expect(found.map((artifact) => artifact.shape)).not.toContain("a series model");
    // ...and the task shape is not, in the same file, in the same run.
    expect(found.map((artifact) => artifact.shape)).toContain("a recurring-task flag");
  });

  it("keeps the neutral shapes refused everywhere the lift does not reach", () => {
    const root = scratchRoot();
    mkdirSync(join(root, "src/features/tasks"), { recursive: true });
    mkdirSync(join(root, "src/features/calendar"), { recursive: true });
    writeFileSync(join(root, "src/features/tasks/repeat.ts"), "const seriesId = 1;\n");
    writeFileSync(join(root, "src/features/calendar/repeat.ts"), "const seriesId = 1;\n");
    const where = recurrenceArtifacts(root).map((artifact) => artifact.where);
    expect(where).toContain("src/features/tasks/repeat.ts");
    expect(where).toContain("src/features/calendar/repeat.ts");
  });

  it("keeps the allowlist enumerated, so widening it is a visible act", () => {
    // Asserted as a closed list rather than a count: a tenth entry added
    // without a decision fails here, and so does a rename that quietly moves a
    // file out from under the scan.
    expect([...REMINDER_RECURRENCE_ALLOWLIST]).toEqual([
      "supabase/migrations/202608230101_phase_2r_slice_1_reminder_recurrence.sql",
      "src/features/reminders/recurrence-rule.ts",
      "src/features/reminders/recurrence-rule.test.ts",
      "src/features/reminders/recurrence-rule-parity.test.ts",
      "src/features/reminders/recurrence-language.ts",
      "src/features/reminders/recurrence-language.test.ts",
      "src/features/reminders/recurrence-derivation.ts",
      "src/features/reminders/recurrence-derivation.test.ts",
      "src/features/reminders/series-action-state.ts",
      "src/features/reminders/series-actions.ts",
      "src/features/reminders/series-actions.test.ts",
      "src/features/reminders/series-schema.ts",
      "src/features/reminders/series-schema.test.ts",
      "src/features/reminders/series-controls.tsx",
      "src/features/reminders/series-controls.test.tsx",
      "src/features/reminders/operation-key.ts",
      "src/features/reminders/projection.ts",
      "src/features/reminders/projection.test.ts",
      "src/features/reminders/lifecycle.test.ts",
      "src/features/reminders/outcomes.test.ts",
      "src/features/reminders/repeat-labels.ts",
      "src/features/reminders/repeat-labels.test.ts",
      "src/lib/closeout/phase-2r-model-guard.test.ts",
      "src/lib/closeout/phase-2p-reminder-recurrence-guard.test.ts",
      "src/lib/closeout/phase-2r-foundation.test.ts",
      "src/lib/supabase/database.types.ts",
    ]);
    // Nothing under tasks or the calendar is lifted, and no migration other
    // than the one ADR-132 allocated.
    for (const entry of REMINDER_RECURRENCE_ALLOWLIST) {
      expect(entry).not.toMatch(/features\/tasks\//);
      expect(entry).not.toMatch(/features\/calendar\//);
    }
    expect(REMINDER_RECURRENCE_ALLOWLIST.filter((entry) => entry.startsWith("supabase/migrations/")))
      .toHaveLength(1);
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
