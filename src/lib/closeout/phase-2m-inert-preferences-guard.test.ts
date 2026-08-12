import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * `2M-REVIEW-006` and `R-24` — **"the settings surface never offers a control
 * that changes nothing."**
 *
 * Slice 2M.0's `2M-AUDIT-005` recorded an end state for each of the five inert
 * scheduling preferences, and this is that record made unfalsifiable:
 *
 * | preference | end state | asserted here as |
 * |---|---|---|
 * | `daily_review_time` | given a consumer | a real read, in `review-schedule.ts`, reached from the reviews route |
 * | `weekly_review_day` | given a consumer | the same |
 * | `weekly_review_time` | given a consumer | the same |
 * | `planning_day` | retired from the interface | no control, no field, no label |
 * | `planning_time` | retired from the interface | no control, no field, no label |
 *
 * **Retiring a control is not deleting a column.** The columns stay — the
 * settings payload still carries them through unchanged, which is what stops a
 * save wiping a value the user set before the control was withdrawn. What must
 * not exist is an *input* for a value nothing reads.
 *
 * ## Why a source scan and a mutation control
 *
 * "Has a consumer" is not observable from a behaviour test: a projection that
 * reads a column and throws the value away passes every assertion about output.
 * So this asserts the read exists **and** that the reading module's output
 * depends on it — the second half is `review-schedule.test.ts`'s "moves when the
 * preference moves", named here so the two halves are findable together.
 */

const REPO = join(__dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(REPO, relative), "utf8");

function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const CONSUMED = ["daily_review_time", "weekly_review_time", "weekly_review_day"] as const;
const RETIRED = ["planning_day", "planning_time"] as const;

const SCHEDULE = read("src/features/day-review/review-schedule.ts");
const PROJECTION = read("src/features/day-review/day-review-projection.ts");
const ROUTE = read("src/app/[locale]/app/reviews/page.tsx");
const SETTINGS_FORM = withoutComments(read("src/features/profile/settings-form.tsx"));
const SETTINGS_VIEW = withoutComments(read("src/features/profile/settings-view.ts"));
const SETTINGS_SCHEMA = withoutComments(read("src/features/profile/schema.ts"));
const SETTINGS_PAYLOAD = read("src/features/profile/settings-payload.ts");

describe("2M-REVIEW-006: the three consumed preferences have a real reader", () => {
  it("selects all three from `agent_preferences`", () => {
    for (const column of CONSUMED) {
      expect(PROJECTION, `${column} is never read`).toContain(column);
    }
  });

  it("carries each of them into the module that decides what the surface says", () => {
    // camelCase at the boundary, snake_case in the query. Both halves asserted,
    // because a column selected and never passed on is a column with no consumer.
    for (const property of ["dailyReviewTime", "weeklyReviewTime", "weeklyReviewDay"]) {
      expect(PROJECTION, `${property} never reaches the reader`).toContain(property);
      expect(SCHEDULE, `${property} is not a parameter of the reader`).toContain(property);
    }
  });

  it("renders the reading on a surface the user can reach", () => {
    expect(ROUTE).toContain("loadDayReviewProjection");
    expect(read("src/features/day-review/day-review-view.tsx")).toContain("projection.schedule");
  });

  it("keeps the behavioural half of this claim in a named test", () => {
    // `R-24` is about consumption, and consumption is only proved by the output
    // changing. That proof is behavioural and lives beside the module; this line
    // exists so deleting it is a failing test rather than a silent gap.
    const behavioural = read("src/features/day-review/review-schedule.test.ts");
    expect(behavioural).toContain("which is what makes it a consumer");
    expect(behavioural).toContain("dailyReviewTime: \"20:00\"");
  });
});

describe("2M-REVIEW-006: the two retired preferences are absent from the interface", () => {
  it("offers no control, no label and no form field for either", () => {
    for (const column of RETIRED) {
      const camel = column.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
      expect(SETTINGS_FORM, `the settings form offers ${column}`).not.toContain(camel);
      expect(SETTINGS_FORM, `the settings form offers ${column}`).not.toContain(column);
      expect(SETTINGS_VIEW, `the settings view surfaces ${column}`).not.toContain(camel);
      expect(SETTINGS_SCHEMA, `the settings schema accepts ${column}`).not.toContain(camel);
    }
  });

  it("does not delete the columns: the payload still carries them through", () => {
    // The other half of the decision, and the one a careless "cleanup" would
    // break. A save that stopped sending these would overwrite a value the user
    // set before the control was withdrawn.
    for (const column of RETIRED) {
      expect(SETTINGS_PAYLOAD, `${column} was dropped from the payload`).toContain(column);
    }
  });

  it("is not vacuous: the settings form does render other controls", () => {
    // Every assertion above is a `not.toContain`, which passes trivially against
    // an empty string. This is what proves the corpus is the real form.
    expect(SETTINGS_FORM.length).toBeGreaterThan(2000);
    expect(SETTINGS_FORM).toContain("timezone");
  });
});

describe("2M-REVIEW-007: the promise the reviews surface makes stays true", () => {
  it("re-asserts the sentence in both locales", () => {
    // The copy is not corrected, because nothing in this slice became scheduled.
    // The requirement's other branch — "if any review becomes scheduled, the copy
    // is corrected in the same change" — is therefore not taken, and this test is
    // what stops the sentence drifting while it remains true.
    expect(ROUTE).toContain("nada é executado por horário configurado");
    expect(ROUTE).toContain("nothing runs from a configured schedule");
    const copy = read("src/features/day-review/copy.ts");
    expect(copy).toContain("Nada é executado por horário configurado");
    expect(copy).toContain("Nothing runs from a configured schedule");
  });

  it("nothing in the review path schedules, enqueues or arms anything", () => {
    for (const [name, source] of [["review-schedule.ts", SCHEDULE], ["the projection", PROJECTION], ["the route", ROUTE]] as const) {
      const text = withoutComments(source);
      for (const token of ["setTimeout", "setInterval", "pg_cron", "\"jobs\"", "enqueue"]) {
        expect(text, `${name} reached for ${token}`).not.toContain(token);
      }
    }
  });
});
