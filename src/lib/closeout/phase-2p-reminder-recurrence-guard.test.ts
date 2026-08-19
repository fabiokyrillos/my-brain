/**
 * Slice 2P.7 — the owner's correction of `2P-REMINDER-002`, and the
 * confirmation that `2P-CALENDAR-001` means a real month.
 *
 * ## What this file does NOT do, and why that is the design
 *
 * It does **not** re-implement a scan for recurrence artifacts.
 * `phase-2m-recurrence-guard.test.ts` already forbids every implementation
 * shape — rule fields, series and occurrence models, exception models,
 * expanders, repeating flags — across `src`, `supabase/migrations`,
 * `supabase/functions` and `public`, with its own mutation controls and a
 * deliberately **single-file** self-exemption.
 *
 * The first draft of this file did duplicate it, and the duplication announced
 * itself immediately: the fixtures a scan needs are the forbidden shapes as
 * string literals, so the 2M guard reported this file three times. The lesson is
 * not that the 2M guard is too strict — it is that a second scanner would be a
 * second place for one refusal to drift, and the honest fix is to have one
 * enforcer and one recorder.
 *
 * So the enforcement of *"no recurrence artifact"* stays where it already lives,
 * and this file records what the owner decided on 2026-08-19 and pins the two
 * things the 2M guard cannot see:
 *
 *   * that `2P-REMINDER-002`'s wording was corrected with its prior text
 *     preserved, the remainder named, and the count untouched;
 *   * that `2P-CALENDAR-001` was **confirmed** rather than corrected, so nobody
 *     later renames Agenda into Mês and calls the requirement met.
 *
 * ## The schema half, expressed without naming the forbidden shapes
 *
 * `reminders`'s generated row block is asserted against its **exact** column
 * list rather than against a pattern for what must be absent. That is stronger —
 * a column added under any name at all fails it — and it keeps this file free of
 * the literals the 2M guard scans for, which is what lets both guards coexist
 * without an exemption.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CALENDAR_ORIENTATIONS } from "@/features/calendar/calendar-query";

import { recurrenceArtifacts } from "./phase-2m-recurrence-guard.test";

const REPO = join(__dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(REPO, relative), "utf8");

const DECISIONS = read("docs/DECISIONS.md");
const PRD = read("docs/initiatives/phase-2p/PHASE_2P_PRD.md");
const PLAN = read("docs/initiatives/phase-2p/PHASE_2P_IMPLEMENTATION_PLAN.md");
const TYPES = read("src/lib/supabase/database.types.ts");

/**
 * Every column `reminders` has, in the generated order.
 *
 * A closed list rather than a pattern for what must be absent: it fails on a
 * column added under **any** name, and it says what the table is instead of what
 * it is not.
 */
const REMINDER_COLUMNS = [
  "created_at",
  "entry_id",
  "id",
  "important",
  "remind_at",
  "sent_at",
  "snoozed_until",
  "status",
  "task_id",
  "title",
  "updated_at",
  "user_id",
] as const;

/**
 * The generated `reminders` row block, as a list of column names.
 *
 * Normalized first: this repository is LF with `autocrlf`, so the working copy
 * on Windows carries CRLF and an anchor written with bare `\n` finds nothing — a
 * reader that silently matched zero characters would make every assertion below
 * it pass.
 */
function reminderRowColumns(): string[] {
  const types = TYPES.replaceAll("\r\n", "\n");
  const start = types.indexOf("\n      reminders: {\n        Row: {\n");
  expect(start, "generated reminders Row block").toBeGreaterThan(-1);
  const rowStart = types.indexOf("Row: {", start);
  const rowEnd = types.indexOf("\n        }", rowStart);
  return [...types.slice(rowStart, rowEnd).matchAll(/^\s+(\w+)\??:/gm)].map((match) => match[1]!);
}

describe("2P-REMINDER-002 dropped recurrence, and the schema stays as it is", () => {
  it("records the amendment where the requirement was signed", () => {
    expect(DECISIONS).toMatch(
      /Amendment \(2026-08-19\) — the owner confirms `2P-CALENDAR-001` means a real month view, and corrects `2P-REMINDER-002` to drop recurrence/,
    );
    expect(DECISIONS).toMatch(/\*\*The owner refuses it\.\*\*/);
    expect(DECISIONS).toMatch(/because the product has no persistent model for it/i);
    expect(DECISIONS).toMatch(
      /\*\*The count stays 87, the fourteen families and nine slices are unchanged, and no ID is renumbered, reused or removed\.\*\*/,
    );
  });

  it("keeps the superseded wording in the history rather than overwriting it", () => {
    const superseded =
      "The modal/sheet groups content, schedule, recurrence/importance and optional links in that order.";
    expect(DECISIONS).toContain(superseded);
    expect(PRD).toContain(superseded);
    expect(PRD).toMatch(
      /^- \*\*2P-REMINDER-002:\*\* The modal\/sheet groups content, date and time, importance, an optional link, and the save and cancel actions/m,
    );
  });

  it("names the remainder, so it cannot be quietly counted as delivered", () => {
    for (const document of [DECISIONS, PRD, PLAN]) {
      expect(document).toContain("2P-REMINDER-RECURRENCE");
    }
    expect(DECISIONS).toMatch(/never classified `built`, `baseline` or `partial`/);
    /*
     * The remainder must NOT look like a requirement to the declaration guard,
     * which counts `- **2P-FAMILY-000:**` lines and locks the total at 87. A
     * remainder written with a three-digit number would silently make it 88 and
     * fail a guard nobody would connect back to this decision.
     */
    expect(/^- \*\*2P-[A-Z]+-\d{3}:\*\*/m.test("- **2P-REMINDER-RECURRENCE:** text")).toBe(false);
  });

  it("records slice 2P.7's zero-migration posture against the migration authorization", () => {
    expect(DECISIONS).toMatch(/Amendment \(2026-08-19\) — slice 2P\.7 needs no migration either/);
    expect(DECISIONS).toMatch(/a recurrence column on `reminders` in particular is refused by name/);
  });

  it("leaves `reminders` with exactly the columns it had", () => {
    // A closed list, so a column added under any name at all fails here — not
    // only one whose name resembles a repeat rule.
    expect(reminderRowColumns().sort()).toEqual([...REMINDER_COLUMNS]);
  });

  it("delegates the artifact scan rather than running a second one", () => {
    /*
     * One enforcer, one recorder. `phase-2m-recurrence-guard.test.ts` owns the
     * repository-wide refusal; this asserts it is still clean and still reachable
     * from here, so the delegation cannot rot into a comment pointing at a guard
     * somebody deleted.
     */
    expect(typeof recurrenceArtifacts).toBe("function");
    expect(recurrenceArtifacts(REPO)).toEqual([]);
  });
});

describe("2P-CALENDAR-001 means a real month, and Agenda is not it", () => {
  it("records the confirmation, with the month view's own contract", () => {
    expect(DECISIONS).toMatch(/Agenda must not be interpreted or renamed as Mês/);
    expect(DECISIONS).toMatch(/\*\*Dia, Semana and Mês\*\*/);
    expect(DECISIONS).toMatch(/a plain list may not be declared a month view/);
    // The two properties most likely to be dropped once a grid gets hard.
    expect(DECISIONS).toMatch(/without relying on colour alone/);
    expect(DECISIONS).toMatch(/\*\*create no new write path\*\*/);
    expect(PLAN).toMatch(/`2P-CALENDAR-001` means a real month view/);
  });

  it("leaves the requirement's own text unchanged, because this was a confirmation", () => {
    // `2P-REMINDER-002` was corrected and carries its superseded wording;
    // `2P-CALENDAR-001` was not, and the PRD must not read as though it moved.
    expect(PRD).toMatch(
      /^- \*\*2P-CALENDAR-001:\*\* Calendar has clear day, week and month navigation with an unmistakable current day\.$/m,
    );
  });

  it("still has no month orientation, which is why the slice has work to do", () => {
    // Stated as a fact rather than as a bar: when 2P.7 ships the month this
    // expectation flips, and the flip is the delivery.
    expect([...CALENDAR_ORIENTATIONS]).toEqual(["day", "week", "agenda"]);
  });

  it("is not vacuous: the readers above really read something", () => {
    // Three assertions are regex reads over prose and one is a schema read.
    // Each is shown answering on content that exists.
    expect(DECISIONS.length).toBeGreaterThan(10_000);
    expect(reminderRowColumns()).toContain("remind_at");
    expect(reminderRowColumns().length).toBe(REMINDER_COLUMNS.length);
    // And the closed-list assertion is shown failing on a planted extra column.
    expect([...REMINDER_COLUMNS, "extra"].sort()).not.toEqual([...REMINDER_COLUMNS]);
  });
});
