import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { recurrenceArtifacts } from "./phase-2m-recurrence-guard.test";
import { REMINDER_COLUMNS as TWO_P_REMINDER_COLUMNS } from "./phase-2p-reminder-recurrence-guard.test";

/**
 * Phase 2R slice 2R.0 — **measure, change nothing.**
 *
 * `2R-FOUNDATION-001` … `-006`, executed rather than described. The slice's
 * whole product is a measurement, so the measurement has to be the kind that
 * can fail: every block below either reads the tree and asserts what it found,
 * or drives a control that proves the reader is not answering on an empty set.
 *
 * ## What this file may and may not assert
 *
 * It may assert **the tree**. It may not assert the deployed database — CI runs
 * this suite with no network at all, and a test that silently skipped when it
 * could not reach Supabase would be a test that always passes. The four hosted
 * readings this slice took are `select`-only, are reproduced with their exact
 * SQL in `PHASE_2R_SLICE_00_ACCEPTANCE.md`, and are asserted here only as
 * *documentary* facts: that the record states them, and states them in the
 * shape the audit can be checked against.
 *
 * That division is deliberate and it is the honest one. A hosted fact proved by
 * a document is a document; a hosted fact **recorded** by a document, with the
 * query that produced it, is evidence a later reader can re-run. This file
 * keeps the two apart instead of blurring them.
 *
 * ## The finding this slice produced
 *
 * `2R-FOUNDATION-004` asked for the single timezone-resolution path to be named
 * and any second one reported **as a defect**. There is a second one, it is
 * reachable, and two of its call sites are the reminders surface this phase is
 * about. `2R-TZ-SECOND-AUTHORITY` below is that report, written as an
 * executable census so the number cannot drift while nobody is looking.
 */

const REPO = resolve(__dirname, "../../..");
const read = (relative: string) => readFileSync(join(REPO, relative), "utf8").replace(/\r\n/g, "\n");

const ACCEPTANCE = "docs/reports/phase-2r/PHASE_2R_SLICE_00_ACCEPTANCE.md";

/** Comments blanked in place, so a file that *describes* a shape does not count as carrying it. */
function blankComments(source: string): string {
  const blank = (text: string) => text.replace(/[^\n]/g, " ");
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:])\/\/[^\n]*/g, (match, lead: string) => lead + blank(match.slice(lead.length)));
}

// ---------------------------------------------------------------------------
// 2R-FOUNDATION-001 — the absence of recurrence, re-proved at this baseline
// ---------------------------------------------------------------------------

/**
 * `reminders`' twelve columns, in the generated order.
 *
 * A closed list rather than a pattern for what must be absent: it fails on a
 * column added under **any** name, which is the property
 * `phase-2p-reminder-recurrence-guard.test.ts` established and this slice
 * inherits rather than re-invents. The two files assert the same list on
 * purpose — when slice 2R.1 adds a column, **both** must be moved, and a phase
 * that could satisfy one while forgetting the other would be a phase that
 * changed the schema in one place and the record in none.
 */
const REMINDER_COLUMNS = [
  "created_at",
  "detached_at",
  "entry_id",
  "id",
  "important",
  "remind_at",
  "sent_at",
  "series_id",
  "series_sequence",
  "snoozed_until",
  "status",
  "task_id",
  "title",
  "updated_at",
  "user_id",
] as const;

function reminderRowColumns(): string[] {
  const types = read("src/lib/supabase/database.types.ts");
  const start = types.indexOf("\n      reminders: {\n        Row: {\n");
  expect(start, "generated reminders Row block").toBeGreaterThan(-1);
  const rowStart = types.indexOf("Row: {", start);
  const rowEnd = types.indexOf("\n        }", rowStart);
  return [...types.slice(rowStart, rowEnd).matchAll(/^\s+(\w+)\??:/gm)].map((match) => match[1]!);
}

describe("2R-FOUNDATION-001: recurrence is absent, re-proved rather than inherited", () => {
  /**
   * **Moved by slice 2R.1, exactly as this file said it would have to be.**
   *
   * The comment on `REMINDER_COLUMNS` promised that when the model landed,
   * **both** this list and `phase-2p-reminder-recurrence-guard.test.ts`'s would
   * have to move — and that a phase which satisfied one while forgetting the
   * other would have changed the schema in one place and the record in none.
   * Both moved, in this commit, and the equality below is what proves it: the
   * two files hold the same fifteen names.
   */
  it("finds `reminders` carrying the twelve it had plus the three the model added", () => {
    expect(reminderRowColumns().sort()).toEqual([...REMINDER_COLUMNS]);
    expect(REMINDER_COLUMNS).toHaveLength(15);
    expect([...REMINDER_COLUMNS]).toEqual([...TWO_P_REMINDER_COLUMNS]);
  });

  it("finds no recurrence artifact anywhere the 2M decision governs", () => {
    // Delegated, not duplicated. `phase-2m-recurrence-guard.test.ts` owns the
    // repository-wide scan; re-implementing it here would be a second place for
    // one refusal to drift, which is the mistake slice 2P.7 already recorded.
    expect(recurrenceArtifacts(REPO)).toEqual([]);
  });

  /**
   * **Inverted by slice 2R.1: the allocation is spent, and spent exactly once.**
   *
   * Slice 2R.0 asserted zero Phase 2R migrations and one hundred files. Both
   * are now false by authorization rather than by accident, so the assertion is
   * flipped and keeps its strictness: **exactly one** file names this phase, and
   * a second is the stop condition ADR-132 Decision 8 made it.
   */
  it("finds exactly ONE migration naming this phase, and one hundred and one in all", () => {
    const migrations = readdirSync(join(REPO, "supabase/migrations"));
    expect(migrations.filter((name) => /phase[_-]?2r/i.test(name)))
      .toEqual(["202608230101_phase_2r_slice_1_reminder_recurrence.sql"]);
    expect(migrations.filter((name) => name.endsWith(".sql")).length).toBe(101);
  });

  it("is not vacuous: the column reader really reads, and the closed list really closes", () => {
    expect(reminderRowColumns()).toContain("remind_at");
    expect(reminderRowColumns()).toHaveLength(REMINDER_COLUMNS.length);
    expect([...REMINDER_COLUMNS, "an_extra_column"].sort()).not.toEqual([...REMINDER_COLUMNS]);
  });
});

// ---------------------------------------------------------------------------
// 2R-FOUNDATION-002 — the heartbeat's rules, observed
// ---------------------------------------------------------------------------

/**
 * The migration that most recently defines `run_user_heartbeat`.
 *
 * **Derived, never named.** The function has been redefined five times across
 * four years of migrations, and a test pinned to one filename would go on
 * asserting a body Postgres no longer runs. This picks the last migration in
 * lexical order that contains the definition — which is the order the chain is
 * applied in, so it is the one that wins.
 */
function latestHeartbeatDefinition(): { file: string; body: string } {
  const dir = join(REPO, "supabase/migrations");
  const candidates = readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .filter((name) =>
      readFileSync(join(dir, name), "utf8")
        .includes("create or replace function public.run_user_heartbeat(p_user_id uuid)"),
    );
  const file = candidates.at(-1);
  expect(file, "no migration defines run_user_heartbeat").toBeDefined();
  return { file: `supabase/migrations/${file}`, body: read(`supabase/migrations/${file}`) };
}

/**
 * The four properties `2R-FOUNDATION-002` names, plus the two that make
 * recurrence's delivery question answerable at all.
 *
 * Each is a clause the deployed function either contains or does not. They were
 * **also** read live from `pg_proc.prosrc` on the deployed database — the SQL is
 * in the acceptance record — and this asserts the migration chain that produced
 * that body, so a divergence between the two would show up as one of these
 * failing while the record still quoted the other.
 */
const HEARTBEAT_CLAUSES: ReadonlyArray<readonly [string, string]> = [
  ["a per-user advisory lock", "pg_try_advisory_xact_lock(hashtextextended('my-brain-heartbeat:'"],
  ["quiet hours starting 22:30 by default", "coalesce(preferences.quiet_start, '22:30')"],
  ["quiet hours ending 07:00 by default", "coalesce(preferences.quiet_end, '07:00')"],
  ["a daily cap of 3 by default", "coalesce(preferences.max_followups_per_day, 3)"],
  ["the cap expressed as remaining slots", "available_slots := greatest(daily_cap - delivered_today, 0)"],
  ["the candidate set truncated to those slots", "limit available_slots"],
  ["a 24-hour cooldown", "notification.created_at > now() - interval '24 hours'"],
  ["the cooldown scoped to the two task types", "candidate.type in ('task_overdue', 'task_stale')"],
  ["reminders admitted through quiet hours only when important", "(not in_quiet_hours or (allow_important and reminder.important))"],
  ["one notification per reminder id, forever", "'reminder:' || reminder.id::text"],
];

/**
 * Clauses that must **not** be there.
 *
 * Without these the block above is a list of ten `toContain`s over a 9 000
 * character string, which is very nearly a list of ten ways to pass.
 */
const HEARTBEAT_ABSENT: ReadonlyArray<readonly [string, string]> = [
  ["a recurrence concept", "recurrence"],
  ["a 48-hour cooldown", "interval '48 hours'"],
  ["the cooldown widened to reminders", "candidate.type in ('task_overdue', 'task_stale', 'reminder')"],
];

describe("2R-FOUNDATION-002: the heartbeat's rules, as they are before anything touches them", () => {
  it("defines the function last in the migration the chain actually applies last", () => {
    const { file } = latestHeartbeatDefinition();
    expect(file).toBe("supabase/migrations/202608040073_account_lifecycle_admin.sql");
  });

  it.each(HEARTBEAT_CLAUSES)("carries %s", (_label, clause) => {
    expect(latestHeartbeatDefinition().body).toContain(clause);
  });

  it.each(HEARTBEAT_ABSENT)("carries no %s", (_label, clause) => {
    // The heartbeat body only — not the whole migration, which legitimately
    // discusses other things.
    const body = latestHeartbeatDefinition().body;
    const start = body.indexOf("create or replace function public.run_user_heartbeat(p_user_id uuid)");
    const end = body.indexOf("\n$$;", start);
    expect(body.slice(start, end)).not.toContain(clause);
  });

  it("runs hourly, by a schedule the chain declares rather than by a comment", () => {
    expect(read("supabase/migrations/202607160008_scheduled_heartbeat.sql"))
      .toContain("cron.schedule('my-brain-hourly-heartbeat', '0 * * * *'");
  });
});

// ---------------------------------------------------------------------------
// 2R-FOUNDATION-003 — the reminder modal's current shape
// ---------------------------------------------------------------------------

/**
 * The composer's field groups, in DOM order.
 *
 * Recorded **by position**, because the thing slice 2R.3 must not do is turn
 * this dialog into a form, and "the groups exist" is true of a form too. The
 * order is the one `2P-REMINDER-002` was corrected to require: content; date
 * and time; importance; an optional link; then save.
 *
 * **Slice 2R.3 inserts recurrence between date-and-time and importance**, and
 * the position is the point rather than an arrangement: every parameter the rule
 * needs is the date immediately above it, so the two are adjacent. The list is
 * extended rather than replaced, so the five 2P groups keep their relative order
 * under the same assertion.
 */
const COMPOSER_GROUPS = [
  'id="reminder-compose-field-content"',
  'id="reminder-compose-field-when"',
  'id="reminder-compose-field-recurrence"',
  'id="reminder-compose-field-important"',
  'id="reminder-compose-field-task"',
  'className="task-command-primary"',
] as const;

describe("2R-FOUNDATION-003: the modal's current field groups, read from the component", () => {
  it("holds six groups, in this order and no other", () => {
    const source = blankComments(read("src/features/reminders/reminder-composer.tsx"));
    const positions = COMPOSER_GROUPS.map((marker) => {
      const at = source.indexOf(marker);
      expect(at, `${marker} is not in the composer`).toBeGreaterThan(-1);
      return at;
    });
    expect(positions, "the composer's groups are out of order")
      .toEqual([...positions].sort((a, b) => a - b));
  });

  it("holds exactly five named inputs, so a sixth cannot arrive unrecorded", () => {
    /*
      `recurrence` is the one slice 2R.3 added, and it is the ONLY one it added.

      That is the stop condition expressed as a count: the form this dialog must
      not become would need weekday checkboxes, a day number, an ordinal and a
      month, and every one of them would show up here. One new name is the
      measurable form of "the date supplies the parameters".
    */
    const source = blankComments(read("src/features/reminders/reminder-composer.tsx"));
    const named = [...source.matchAll(/\bname="([a-zA-Z]+)"/g)].map((match) => match[1]);
    expect([...new Set(named)].sort())
      .toEqual(["important", "locale", "recurrence", "remindAtLocal", "taskId", "title"]);
  });

  /**
   * The modal's limits — measured as a defect in 2R.0, repaired in 2R.3.
   *
   * ## What this recorded, and what changed
   *
   * Slice 2R.0 measured that the mobile half was handled — below 640px the
   * dialog is a bottom sheet with `max-height: 92vh` and `overflow-y: auto` —
   * and that **the desktop half was not**: `.task-command-dialog` declared a
   * width and no height bound at all, so a dialog taller than the viewport had
   * no scroll container and its primary action became unreachable. The backdrop
   * centres it in a 20px-padded grid, so the overflow escaped both ends.
   *
   * The record said *"update this record"* if the desktop rule ever gained one,
   * and **slice 2R.3 is the body tall enough to require it**: the recurrence
   * group plus a three-occurrence preview. `2R-MOBILE-002` asks that the preview
   * not push save off screen, and 2R.0 is why that had to be satisfied on both
   * breakpoints even though only one is named.
   *
   * So the assertion is inverted rather than deleted. Deleting it would leave
   * the repair unguarded, and the next author to tidy the shared dialog would
   * have nothing telling them which declaration is load-bearing.
   */
  it("bounds the dialog's height at every width, which 2R.3 repaired", () => {
    const css = read("src/app/task-commands.css");
    const mobile = css.slice(css.indexOf("@media (max-width: 640px)"));
    expect(mobile).toContain("max-height: 92vh");
    expect(mobile).toContain("overflow-y: auto");

    const desktop = css.slice(
      css.indexOf(".task-command-dialog {"),
      css.indexOf("@media (max-width: 640px)"),
    );
    expect(desktop, "the desktop dialog lost its height bound — 2R-MOBILE-002 depends on it")
      .toContain("max-height: calc(100vh - 40px)");
    expect(desktop, "the desktop dialog lost its scroll container")
      .toContain("overflow-y: auto");
    // Not vacuous: the slice really is the dialog's own block.
    expect(desktop).toContain("width: min(100%, 460px)");
    expect(desktop).toContain("width: min(100%, 520px)");
  });
});

// ---------------------------------------------------------------------------
// 2R-FOUNDATION-004 — the timezone authority, and the second one
// ---------------------------------------------------------------------------

/**
 * **The contract.** `resolveOwnerTimeZone` is the one resolver: it applies
 * `isSupportedTimeZone`'s rule — the value must construct an
 * `Intl.DateTimeFormat` **and** contain `/` or be exactly `UTC` — and falls back
 * to `defaultAgentPreferences.timezone` otherwise. `getOwnerTimeZone` is its
 * request-memoised Server Component accessor.
 */
const TIMEZONE_CONTRACT = "src/lib/time/owner-timezone.ts";

/**
 * **`2R-TZ-SECOND-AUTHORITY` — the defect this requirement asked for.**
 *
 * Eight call sites resolve the owner's zone themselves instead of through the
 * contract, and they apply a **laxer** rule: any non-empty string is accepted
 * verbatim. The two rules agree on every value the product can store and
 * disagree on the values that would hurt — a bare abbreviation such as `EST`
 * constructs happily and carries **no DST rule**, so a day or an instant
 * computed in it is silently fixed-offset.
 *
 * **It is reachable, not theoretical**, and that is the part worth stating
 * carefully. `profiles.timezone` has **no check constraint** — read live from
 * `pg_constraint`, and the acceptance record carries the query — and the
 * writer `public.save_profile_and_preferences` stores `p_profile ->> 'timezone'`
 * unvalidated. The only enforcement is `profileSchema`'s `ianaTimezone`, in a
 * Server Action. A caller reaching the RPC directly writes what it likes.
 *
 * **Two of the eight are the reminders surface**, which is exactly the surface
 * this phase builds a wall-clock feature onto.
 *
 * The census is enumerated so it cannot drift silently in either direction: a
 * ninth site added without a decision fails here, and so does one repaired
 * without the record being updated.
 */
const SECOND_AUTHORITY_SITES = [
  "src/app/[locale]/app/history/page.tsx",
  "src/app/[locale]/app/reminders/page.tsx",
  "src/app/[locale]/app/work/cancelled/page.tsx",
  "src/features/chat/actions.ts",
  "src/features/daily-cycle/task-detail-projection.ts",
  "src/features/daily-cycle/work-projection.ts",
  "src/features/reminders/actions.ts",
] as const;

describe("2R-FOUNDATION-004: one timezone authority is named, and the second is reported", () => {
  it("names the contract, and the rule it applies", () => {
    const contract = read(TIMEZONE_CONTRACT);
    expect(contract).toContain("export function resolveOwnerTimeZone");
    expect(contract).toContain("isSupportedTimeZone(value) ? value : defaultAgentPreferences.timezone");
    expect(read("src/features/profile/owner-timezone.ts"))
      .toContain("export const getOwnerTimeZone");
  });

  it("holds the contract's rule strictly, and the write path to the same rule", () => {
    const localDay = read("src/lib/time/local-day.ts");
    expect(localDay).toContain('if (!value.includes("/") && value !== "UTC") return false;');
    // The Server Action's own validator, which is the only thing standing
    // between the column and an abbreviation.
    expect(read("src/features/profile/schema.ts"))
      .toContain('return value.includes("/") || value === "UTC";');
  });

  it("reports the second authority as a defect, with its exact census", () => {
    const found = SECOND_AUTHORITY_SITES.filter((file) => {
      const code = blankComments(read(file));
      return code.includes("defaultAgentPreferences.timezone") && !code.includes("resolveOwnerTimeZone");
    });
    expect(found, "the second-authority census moved — re-audit and update the record")
      .toEqual([...SECOND_AUTHORITY_SITES]);
  });

  it("names the two sites that are this phase's own blast radius", () => {
    expect(SECOND_AUTHORITY_SITES).toContain("src/app/[locale]/app/reminders/page.tsx");
    expect(SECOND_AUTHORITY_SITES).toContain("src/features/reminders/actions.ts");
  });

  it("proves the divergence is real rather than argued", () => {
    // The two rules, executed against the value that separates them. `EST`
    // constructs — so the lax rule keeps it — and carries no DST rule.
    const constructs = (() => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: "EST" }).format();
        return true;
      } catch {
        return false;
      }
    })();
    expect(constructs, "the divergence rests on EST constructing, and it no longer does").toBe(true);

    const lax = (value: unknown) => typeof value === "string" && value !== "";
    const strict = (value: unknown) =>
      typeof value === "string" && value !== "" && (value.includes("/") || value === "UTC") && constructs;

    expect(lax("EST")).toBe(true);
    expect(strict("EST")).toBe(false);
    // And they agree on everything the product can actually store today.
    expect(lax("America/Sao_Paulo")).toBe(strict("America/Sao_Paulo"));
  });

  it("records the defect where a later reader will find it, with its destination", () => {
    const record = read(ACCEPTANCE);
    expect(record).toContain("2R-TZ-SECOND-AUTHORITY");
    expect(record, "a defect without a destination is a defect nobody owns")
      .toMatch(/destination/i);
  });
});

// ---------------------------------------------------------------------------
// 2R-FOUNDATION-005 — zero product behaviour change
// ---------------------------------------------------------------------------

describe("2R-FOUNDATION-005: this slice changes no product behaviour", () => {
  it("leaves the reminder write path exactly as it was", () => {
    const schema = blankComments(read("src/features/reminders/schema.ts"));
    // The creation contract's five keys, and no sixth.
    for (const key of ["locale", "title", "remindAtLocal", "important", "taskId"]) {
      expect(schema).toContain(`${key}:`);
    }
    expect(schema, "a recurrence field appeared in the creation contract")
      .not.toMatch(/recurrence|repeat/i);
    // The five reminder commands, unchanged.
    for (const command of ["snooze", "reschedule", "cancel", "restore", "edit"]) {
      expect(schema).toContain(`z.literal("${command}")`);
    }
  });

  it("leaves the deployed command boundary's five kinds as the only five", () => {
    const sql = read("supabase/migrations/202607310064_reminder_lifecycle_command.sql");
    const kinds = [...sql.matchAll(/^    when '([a-z]+)' then$/gm)].map((match) => match[1]);
    expect(kinds).toEqual(["snooze", "reschedule", "cancel", "restore", "edit"]);
  });

  /**
   * **Slice 2R.0's own claim, kept true by scoping it to slice 2R.0.**
   *
   * This asserted that no Phase 2R migration existed. Slice 2R.1 created one,
   * under ADR-133, so the assertion is re-aimed at what `2R-FOUNDATION-005`
   * actually says: **the measurement slice** changed nothing. It is now
   * expressed as "the one migration that exists belongs to 2R.1, not to 2R.0",
   * which is checkable and which a bare deletion of this case would not be.
   */
  it("leaves slice 2R.0 with no migration of its own", () => {
    const migrations = readdirSync(join(REPO, "supabase/migrations"));
    const mine = migrations.filter((name) => /phase[_-]?2r/i.test(name));
    expect(mine).toHaveLength(1);
    expect(mine[0], "slice 2R.0 must not own a migration").toContain("slice_1");
    expect(mine[0]).not.toContain("slice_0");
  });
});

// ---------------------------------------------------------------------------
// 2R-FOUNDATION-006 — the automation finding, re-checked at slice start
// ---------------------------------------------------------------------------

describe("2R-FOUNDATION-006: the automation rows are re-read, whatever their count", () => {
  /**
   * **Documentary, and labelled as such.** The reading itself is hosted and
   * cannot run here. What this asserts is that the record states the reading,
   * states the probe control that makes a zero legible, and reaches a verdict
   * against audit §10.3 rather than restating it.
   */
  it("records the live count, the probe control, and a verdict against audit §10.3", () => {
    const record = read(ACCEPTANCE);
    expect(record).toContain("automation_category_policies");
    expect(record, "a zero without a probe control is indistinguishable from a blind probe")
      .toMatch(/probe/i);
    expect(record, "the verdict against §10.3 must be stated, not implied")
      .toMatch(/§10\.3/);
    expect(record, "the exact SQL must be reproduced so the reading can be re-run")
      .toContain("select count(*) from public.automation_category_policies");
  });

  it("keeps the instruction that outlived every count this table has had", () => {
    const record = read(ACCEPTANCE);
    expect(record).toMatch(/read the rows, never a document/i);
  });

  it("leaves all six categories at the state the phase inherits", () => {
    // No policy row is written by this phase, so the *computed* default governs.
    // Asserted against the function that computes it rather than against a
    // sentence about it.
    const sql = read("supabase/migrations/202608190099_phase_2p_slice_4_automation_policy_and_calibration.sql");
    expect(sql).toContain("suggest_only");
    expect(read(ACCEPTANCE)).toMatch(/suggest_only/);
  });
});
