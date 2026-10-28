/**
 * `NOTIFY-HEARTBEAT-DESTINATION` — the migration changed ONE expression.
 *
 * `CREATE OR REPLACE FUNCTION` rewrites the whole body, so a migration that
 * means to change one line is a migration that retypes three hundred. The
 * heartbeat is the only automatic mechanism this product has, and a stray edit
 * inside it would be a silent regression with no symptom until a notice came
 * out wrong — or stopped coming out.
 *
 * So the body was extracted mechanically from `202608240102` rather than
 * retyped, and this asserts what that extraction promises: **every line is the
 * same except the destination expression.** It compares the two blocks as sets
 * of normalised lines and requires the difference to be exactly the old
 * expression leaving and the new one arriving.
 *
 * Comments are stripped before comparing, deliberately: the new migration
 * explains itself at length and that prose is not behaviour. What is compared
 * is the SQL.
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = resolve(__dirname, "../../..");
const PREVIOUS = "202608240102_phase_2s_slice_1_notification_suppressions.sql";
const CURRENT = "202610280103_notify_heartbeat_destination.sql";

function heartbeatSql(file: string): string[] {
  const text = readFileSync(join(REPO, "supabase/migrations", file), "utf8");
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) =>
    line.startsWith("create or replace function public.run_user_heartbeat"),
  );
  expect(start, `${file} must define run_user_heartbeat`).toBeGreaterThan(-1);
  const end = lines.findIndex((line, index) => index > start && line.trim() === "$$;");
  expect(end, `${file}'s definition must terminate`).toBeGreaterThan(start);

  return lines
    .slice(start, end + 1)
    .map((line) => line.trim())
    // Comment-only lines carry no behaviour, and the new migration adds prose.
    .filter((line) => line.length > 0 && !line.startsWith("--"));
}

const OLD_EXPRESSION = [
  "case when user_locale = 'en' then '/en/app/reminders' else '/pt-BR/app/reminders' end,",
];

const NEW_EXPRESSION = [
  "case",
  "when reminder.task_id is not null then",
  "(case when user_locale = 'en' then '/en/app/work/' else '/pt-BR/app/work/' end)",
  "|| reminder.task_id::text",
  "else",
  "(case when user_locale = 'en' then '/en/app/reminders/' else '/pt-BR/app/reminders/' end)",
  "|| reminder.id::text",
  "end,",
];

describe("the heartbeat redefinition changes one expression and nothing else", () => {
  const previous = heartbeatSql(PREVIOUS);
  const current = heartbeatSql(CURRENT);

  it("removes only the old destination expression", () => {
    const removed = previous.filter((line) => !current.includes(line));
    expect(removed).toEqual(OLD_EXPRESSION);
  });

  it("adds only the new destination expression", () => {
    // `case` and `end,` already occur elsewhere in the body, so a set
    // difference cannot see them arrive. What it can see is every line that is
    // new to this file, and that set must be exactly the rest of the
    // expression.
    const added = current.filter((line) => !previous.includes(line));
    expect(added).toEqual(NEW_EXPRESSION.filter((line) => !previous.includes(line)));
  });

  it("keeps the function's posture verbatim", () => {
    for (const clause of ["security definer", "set search_path = ''", "language plpgsql"]) {
      expect(current, `${clause} must survive the redefinition`).toContain(clause);
    }
  });

  it("adds no grant, because create or replace keeps the ones that exist", () => {
    const text = readFileSync(join(REPO, "supabase/migrations", CURRENT), "utf8");
    expect(/^\s*grant\s/im.test(text), "no grant may be widened here").toBe(false);
  });

  it("leaves the line count equal apart from the expression", () => {
    // The strongest statement of the whole point: same body, one expression
    // longer. If a block were dropped, this is what would notice.
    expect(current.length - previous.length).toBe(NEW_EXPRESSION.length - OLD_EXPRESSION.length);
  });
});
