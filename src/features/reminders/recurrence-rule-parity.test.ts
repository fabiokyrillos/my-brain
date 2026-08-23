import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { defaultAgentPreferences } from "@/lib/preferences";

import {
  RECURRENCE_FREQUENCIES,
  RECURRENCE_ORDINALS,
  RECURRENCE_RULE_VERSION,
  parseRecurrenceRule,
} from "./recurrence-rule";
import { reminderSeriesCommandSchema } from "./series-schema";

/**
 * **The TypeScript validator and the SQL one admit the same closed set.**
 *
 * ## Why this file exists at all
 *
 * Two validators for one rule is exactly the shape of the defect slice 2R.0
 * reported: `2R-TZ-SECOND-AUTHORITY` is eight call sites applying a laxer
 * version of a rule the contract states once. Phase 2R could not answer that
 * finding and then quietly create a second instance of it.
 *
 * The split is nonetheless necessary and deliberate. The database must validate
 * because a CHECK constraint is the only thing a caller cannot go around;
 * TypeScript must validate because `2R-MODEL-002` asks for a **named reason**
 * the surface can translate, and a `check_violation` is not one. So there are
 * two, and this file is the price of having two: it asserts they cannot drift.
 *
 * `src/lib/ai/extraction-parity.test.ts` does the same job for the worker's
 * copy of the extraction schema, and for the same reason.
 *
 * ## What is compared, and what is not
 *
 * The **vocabulary** — frequencies, key sets, ordinals, the version, the
 * fallback zone — read out of the migration's own text rather than restated
 * here. What is deliberately not compared is the *implementation*: the two are
 * allowed to differ in how they refuse, only not in what they refuse.
 */

const REPO = resolve(__dirname, "../../..");
const MIGRATION = "supabase/migrations/202608230101_phase_2r_slice_1_reminder_recurrence.sql";
const sql = readFileSync(join(REPO, MIGRATION), "utf8").replace(/\r\n/g, "\n");

/**
 * The migration's `reminder_rule_is_valid` body only.
 *
 * Sliced rather than searched over the whole file, because the file's prose
 * legitimately names things the validator does not admit — the comments explain
 * what was refused — and a whole-file grep would read a refusal as a
 * declaration.
 */
function validatorBody(): string {
  const start = sql.indexOf("create or replace function private.reminder_rule_is_valid");
  expect(start, "the validator moved or was renamed").toBeGreaterThan(-1);
  const end = sql.indexOf("\n$$;", start);
  expect(end, "the validator body is unterminated").toBeGreaterThan(start);
  return sql.slice(start, end);
}

describe("the closed set is the same set on both sides", () => {
  it("declares the same five frequencies, and no sixth on either side", () => {
    const body = validatorBody();
    // Read out of the SQL `case` rather than typed here, so a frequency added
    // to the database and not to TypeScript fails, and so does the reverse.
    const inSql = [...body.matchAll(/^    when '([A-Za-z]+)' then allowed_keys/gm)]
      .map((match) => match[1]);
    expect(inSql).toEqual([...RECURRENCE_FREQUENCIES]);
  });

  it("declares the same key set for each frequency", () => {
    const body = validatorBody();
    const expected: Record<string, string[]> = {
      daily: ["version", "frequency"],
      weekly: ["version", "frequency", "weekdays"],
      monthlyDay: ["version", "frequency", "day"],
      monthlyWeekday: ["version", "frequency", "ordinal", "weekday"],
      yearly: ["version", "frequency", "month", "day"],
    };
    for (const [frequency, keys] of Object.entries(expected)) {
      const pattern = new RegExp(
        `when '${frequency}' then allowed_keys := array\\[([^\\]]*)\\];`,
      );
      const found = pattern.exec(body);
      expect(found, `${frequency} has no key set in SQL`).not.toBeNull();
      const declared = found![1].split(",").map((key) => key.trim().replace(/^'|'$/g, ""));
      expect(declared, `${frequency}'s key set differs`).toEqual(keys);
    }

    // And the same set, exercised through the TypeScript side: a rule carrying
    // exactly those keys parses, and one carrying an extra does not.
    expect(parseRecurrenceRule({ version: 1, frequency: "monthlyWeekday", ordinal: 1, weekday: 1 }).ok)
      .toBe(true);
    expect(parseRecurrenceRule({ version: 1, frequency: "monthlyWeekday", ordinal: 1, weekday: 1, day: 1 }).ok)
      .toBe(false);
  });

  it("pins the same version, in a literal on both sides", () => {
    expect(validatorBody()).toContain("(p_rule ->> 'version')::numeric is distinct from 1");
    expect(RECURRENCE_RULE_VERSION).toBe(1);
  });

  it("admits the same ordinals, including last and excluding a fifth", () => {
    const body = validatorBody();
    expect(body).toContain("private.reminder_rule_integer_between(p_rule -> 'ordinal', 1, 4)");
    expect(body).toContain("private.reminder_rule_integer_between(p_rule -> 'ordinal', -1, -1)");
    expect([...RECURRENCE_ORDINALS].sort((a, b) => a - b)).toEqual([-1, 1, 2, 3, 4]);
  });

  it("bounds weekday, day and month identically", () => {
    const body = validatorBody();
    expect(body).toContain("current_day < 1 or current_day > 7");
    expect(body).toContain("private.reminder_rule_integer_between(p_rule -> 'day', 1, 31)");
    expect(body).toContain("private.reminder_rule_integer_between(p_rule -> 'month', 1, 12)");
    expect(body).toContain("private.reminder_rule_integer_between(p_rule -> 'weekday', 1, 7)");
  });

  it("requires a strictly ascending weekday list on both sides", () => {
    expect(validatorBody()).toContain("current_day <= previous");
    expect(parseRecurrenceRule({ version: 1, frequency: "weekly", weekdays: [3, 1] }).ok).toBe(false);
    expect(parseRecurrenceRule({ version: 1, frequency: "weekly", weekdays: [1, 3] }).ok).toBe(true);
  });

  it("is not vacuous: the reader really read the validator", () => {
    expect(validatorBody().length).toBeGreaterThan(1000);
    expect(validatorBody()).toContain("allowed_keys");
    // And a frequency the set does not contain is absent from the SQL too.
    expect(validatorBody()).not.toContain("'hourly'");
  });
});

describe("the fallback zone is the same declared default on both sides", () => {
  /**
   * `private.reminder_owner_timezone` applies the contract's rule — contains
   * `/` or is exactly `UTC` — and falls back to a literal. That literal is a
   * second declaration of `defaultAgentPreferences.timezone`, which is the
   * shape `resolveOwnerTimeZone`'s own docstring warns about. It cannot be
   * imported into SQL, so it is pinned here instead.
   */
  it("falls back to the same zone TypeScript declares", () => {
    const start = sql.indexOf("create or replace function private.reminder_owner_timezone");
    expect(start, "the zone resolver moved").toBeGreaterThan(-1);
    const body = sql.slice(start, sql.indexOf("\n$$;", start));
    const fallbacks = [...body.matchAll(/return '([^']+)';/g)].map((match) => match[1]);
    expect(new Set(fallbacks).size, "the SQL side has more than one fallback zone").toBe(1);
    expect(fallbacks[0]).toBe(defaultAgentPreferences.timezone);
  });

  it("applies the contract's rule and not the laxer one slice 2R.0 reported", () => {
    const start = sql.indexOf("create or replace function private.reminder_owner_timezone");
    const body = sql.slice(start, sql.indexOf("\n$$;", start));
    // The strict half: a value with no `/` that is not UTC falls back.
    expect(body).toContain("pg_catalog.strpos(stored, '/') = 0 and stored is distinct from 'UTC'");
    // And it names the finding, so a later reader knows which rule this is.
    expect(sql).toContain("2R-TZ-SECOND-AUTHORITY");
  });
});

describe("TypeScript computes no instant, and the migration says why", () => {
  it("keeps every instant on the database side", () => {
    // 2R-TIME-007. Asserted as an absence in the module that would otherwise be
    // the natural place to put one.
    const ruleModule = readFileSync(join(REPO, "src/features/reminders/recurrence-rule.ts"), "utf8");
    const code = ruleModule
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    for (const forbidden of ["Date.now(", "toISOString", "getTimezoneOffset"]) {
      expect(code, `${forbidden} appeared in the rule module`).not.toContain(forbidden);
    }
  });

  it("names the single place an instant is computed", () => {
    expect(sql).toContain("2R-TIME-007: the ONE place an occurrence instant is computed");
    // Two callers, which is what makes the property checkable rather than
    // merely stated: the trigger and the preview.
    const callers = [...sql.matchAll(/private\.reminder_next_instant\(/g)];
    expect(callers.length, "the generator should have several call sites").toBeGreaterThan(2);
  });
});

/**
 * The migration's `apply_reminder_series_command_v1` body only, sliced for the
 * reason `validatorBody` is sliced.
 */
function commandBody(): string {
  const start = sql.indexOf("create or replace function public.apply_reminder_series_command_v1");
  expect(start, "the command RPC moved or was renamed").toBeGreaterThan(-1);
  const end = sql.indexOf("\n$$;", start);
  expect(end, "the command RPC body is unterminated").toBeGreaterThan(start);
  return sql.slice(start, end);
}

/**
 * **The three series commands admit the same field set on both sides — and are
 * closed in the same DIRECTION.**
 *
 * This block exists because the block above did not catch the defect it was
 * shaped to catch. The rule validator demands key-set EQUALITY per frequency,
 * which is right for a rule: every key of a frequency is required to describe
 * it. That shape was reused for the command gate, where it is wrong — the six
 * allowed `edit_future` fields became six REQUIRED fields, so **the command was
 * unreachable**: no payload could change only the hour, and the body reads
 * every optional field through `coalesce(..., the stored value)`, i.e. it was
 * written for exactly the partial edit the gate refused.
 * `reminderSeriesCommandSchema` had it right the whole time. Two validators,
 * disagreeing — the finding slice 2R.0 reported, reproduced inside the slice
 * that answers it, and caught only because the pgTAP suite calls the command.
 *
 * So parity here is not only "the same names". It is also **the same
 * direction**: unknown keys refused, known keys optional, and an edit that
 * changes nothing refused rather than recorded as an undoable no-op.
 */
describe("the three series commands are the same closed set on both sides", () => {
  const expected: Record<string, string[]> = {
    detach_occurrence: ["kind"],
    edit_future: ["kind", "rule", "title", "important", "hour", "minute"],
    end_series: ["kind"],
  };

  it("declares the same field set for each command", () => {
    const body = commandBody();
    const inSql = [...body.matchAll(/^    when '([a-z_]+)' then\n\s+allowed_command_keys := array\[([^\]]*)\];/gm)];
    expect(inSql.map((match) => match[1])).toEqual(Object.keys(expected));
    for (const match of inSql) {
      const declared = match[2].split(",").map((key) => key.trim().replace(/^'|'$/g, ""));
      expect(declared, `${match[1]}'s field set differs`).toEqual(expected[match[1]]);
    }
  });

  it("accepts each optional field on its own, on both sides", () => {
    // The assertion the SQL gate failed. Every one of these is a legitimate
    // `edit_future`, and each carries exactly one changeable field.
    const singles: Record<string, unknown>[] = [
      { rule: { version: 1, frequency: "daily" } },
      { title: "Renamed" },
      { important: true },
      { hour: 7 },
      { minute: 30 },
    ];
    for (const field of singles) {
      const parsed = reminderSeriesCommandSchema.safeParse({ kind: "edit_future", ...field });
      expect(parsed.success, `${Object.keys(field)[0]} alone was refused`).toBe(true);
    }
  });

  it("refuses a field outside the set, and an edit that changes nothing", () => {
    expect(
      reminderSeriesCommandSchema.safeParse({ kind: "edit_future", hour: 7, colour: "red" }).success,
    ).toBe(false);
    expect(reminderSeriesCommandSchema.safeParse({ kind: "edit_future" }).success).toBe(false);
    expect(
      reminderSeriesCommandSchema.safeParse({ kind: "end_series", rule: { version: 1, frequency: "daily" } })
        .success,
    ).toBe(false);

    const body = commandBody();
    expect(body).toContain("An edit must change something");
    expect(body).toContain("Unsupported series command field");
  });

  it("closes the command set in the direction a command is closed in, not a rule's", () => {
    const body = commandBody();
    // The defect, stated as the thing that must not come back: a cardinality
    // comparison against the allowed set turns "allowed" into "required".
    expect(
      body,
      "the command gate compares key COUNT again -- that makes optional fields mandatory",
    ).not.toMatch(/cardinality\(allowed_command_keys\)/);
    // And the shape that must be there instead.
    expect(body).toMatch(/where not \(command_key\.key = any \(allowed_command_keys\)\)/);
  });

  it("is not vacuous: the control re-introduces the defect and the guard fires", () => {
    const broken = commandBody().replace(
      "if exists (\n    select 1\n    from pg_catalog.jsonb_object_keys(p_command) as command_key(key)",
      "if (\n    select pg_catalog.count(*)\n    from pg_catalog.jsonb_object_keys(p_command) as command_key(key)\n  ) is distinct from pg_catalog.cardinality(allowed_command_keys)\n    or exists (\n    select 1\n    from pg_catalog.jsonb_object_keys(p_command) as command_key(key)",
    );
    expect(broken, "the control did not change anything").not.toEqual(commandBody());
    expect(broken).toMatch(/cardinality\(allowed_command_keys\)/);
  });
});
