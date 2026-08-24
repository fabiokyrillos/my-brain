import { describe, expect, it } from "vitest";

import { locales } from "@/lib/preferences";

import { getReminderCopy } from "./copy";
import { describeRecurrenceRule } from "./recurrence-language";
import {
  RECURRENCE_FREQUENCIES,
  RECURRENCE_ORDINALS,
  type RecurrenceRule,
} from "./recurrence-rule";

/**
 * `2R-SURFACE-004` — the rule in the owner's words, never as a rule string.
 *
 * ## The negative case is the requirement
 *
 * "States the rule in words" is satisfiable by `JSON.stringify(rule)`, which is
 * words in the sense that it is text. What the requirement forbids is the
 * database's vocabulary reaching the screen — `monthlyWeekday`, a brace, an
 * `RRULE` — which is the same defect UX-21 recorded when this surface printed
 * `{item.status}` to a Portuguese reader. So the sweep below runs every rule
 * this product can express through both locales and asserts what must **not**
 * appear, and the positive cases exist to keep that sweep from passing on an
 * empty string.
 *
 * ## Why the rules are generated rather than listed
 *
 * `RECURRENCE_FREQUENCIES` and `RECURRENCE_ORDINALS` are the closed sets the
 * schema exports. Iterating them means a sixth frequency cannot be added
 * without arriving here, whereas a hand-listed fixture set would keep passing
 * while saying nothing about the new member.
 */

/** Every rule shape the union admits, with the interesting values of each. */
const EVERY_RULE: readonly RecurrenceRule[] = [
  { version: 1, frequency: "daily" },
  { version: 1, frequency: "weekly", weekdays: [1] },
  { version: 1, frequency: "weekly", weekdays: [7] },
  { version: 1, frequency: "weekly", weekdays: [1, 3, 5] },
  { version: 1, frequency: "weekly", weekdays: [1, 2, 3, 4, 5, 6, 7] },
  { version: 1, frequency: "monthlyDay", day: 1 },
  { version: 1, frequency: "monthlyDay", day: 31 },
  ...RECURRENCE_ORDINALS.map(
    (ordinal): RecurrenceRule => ({
      version: 1,
      frequency: "monthlyWeekday",
      ordinal,
      weekday: 5,
    }),
  ),
  { version: 1, frequency: "yearly", month: 1, day: 1 },
  { version: 1, frequency: "yearly", month: 12, day: 25 },
];

describe("2R-SURFACE-004: no surface renders a raw rule", () => {
  for (const locale of locales) {
    it(`says nothing machine-shaped in ${locale}`, () => {
      for (const rule of EVERY_RULE) {
        const sentence = describeRecurrenceRule(rule, getReminderCopy(locale).series.language);

        expect(sentence.length, `${rule.frequency} produced nothing`).toBeGreaterThan(3);
        // The database's own vocabulary, spelled exactly as the column holds it.
        for (const frequency of RECURRENCE_FREQUENCIES) {
          expect(sentence, `${frequency} leaked into the sentence`).not.toContain(frequency);
        }
        expect(sentence).not.toMatch(/[{}[\]"]/);
        expect(sentence.toUpperCase()).not.toContain("RRULE");
        expect(sentence).not.toContain("version");
        // `-1` is an ordinal in the schema and a typo on a page.
        expect(sentence).not.toContain("-1");
      }
    });
  }
});

describe("the five frequencies each read as a sentence", () => {
  const pt = getReminderCopy("pt-BR").series.language;
  const en = getReminderCopy("en").series.language;

  it("daily", () => {
    expect(describeRecurrenceRule({ version: 1, frequency: "daily" }, pt)).toBe("Todo dia");
    expect(describeRecurrenceRule({ version: 1, frequency: "daily" }, en)).toBe("Every day");
  });

  it("a single weekday reads in the singular", () => {
    const monday: RecurrenceRule = { version: 1, frequency: "weekly", weekdays: [1] };
    expect(describeRecurrenceRule(monday, pt)).toBe("Toda segunda-feira");
    expect(describeRecurrenceRule(monday, en)).toBe("Every Monday");
  });

  it("maps ISO weekday 7 to Sunday, not to Saturday", () => {
    /*
      The off-by-one that only shows up on Sundays.

      `weekdays` is ISO 1..7 with Monday first, matching Postgres `isodow`, while
      the name table is a zero-indexed array. Reading `weekdays[day]` instead of
      `weekdays[day - 1]` is correct for nothing and looks correct for
      everything, because the two are only ever compared on the day it is wrong.
    */
    const sunday: RecurrenceRule = { version: 1, frequency: "weekly", weekdays: [7] };
    expect(describeRecurrenceRule(sunday, pt)).toBe("Todo domingo");
    expect(describeRecurrenceRule(sunday, en)).toBe("Every Sunday");
  });

  it("agrees the article with the weekday's gender, not with the template", () => {
    /*
      THE CASE THIS FILE EXISTS FOR, and the one it originally got wrong.

      Five pt-BR weekdays end in `-feira` and are feminine; `sábado` and
      `domingo` are masculine. The first version of this module interpolated a
      fixed `"Toda"` and its test asserted `"Toda domingo"` — a fixture written
      from the implementation instead of from the language, so both agreed and
      both were wrong.

      Asserted as a pair, feminine against masculine, because either alone
      passes against a template that never varies.
    */
    const friday: RecurrenceRule = { version: 1, frequency: "weekly", weekdays: [5] };
    const saturday: RecurrenceRule = { version: 1, frequency: "weekly", weekdays: [6] };
    expect(describeRecurrenceRule(friday, pt)).toBe("Toda sexta-feira");
    expect(describeRecurrenceRule(saturday, pt)).toBe("Todo sábado");
  });

  it("agrees the ordinal too, which is a second place the same mistake hides", () => {
    const lastFriday: RecurrenceRule = {
      version: 1, frequency: "monthlyWeekday", ordinal: -1, weekday: 5,
    };
    const lastSaturday: RecurrenceRule = {
      version: 1, frequency: "monthlyWeekday", ordinal: -1, weekday: 6,
    };
    expect(describeRecurrenceRule(lastFriday, pt)).toBe("Toda última sexta-feira do mês");
    expect(describeRecurrenceRule(lastSaturday, pt)).toBe("Todo último sábado do mês");
    // English inflects neither, and says so by giving both forms the same word.
    expect(describeRecurrenceRule(lastSaturday, en)).toBe("Every last Saturday of the month");
  });

  it("joins several weekdays with the locale's own list words", () => {
    const three: RecurrenceRule = { version: 1, frequency: "weekly", weekdays: [1, 3, 5] };
    // ", " between all but the last, " e "/" and " before the last. `Array.join`
    // would give "a, b, c", which is how nobody reads a list aloud.
    expect(describeRecurrenceRule(three, pt)).toContain("segunda-feira, quarta-feira e sexta-feira");
    expect(describeRecurrenceRule(three, en)).toContain("Monday, Wednesday and Friday");
  });

  it("monthly by day", () => {
    const first: RecurrenceRule = { version: 1, frequency: "monthlyDay", day: 1 };
    expect(describeRecurrenceRule(first, pt)).toBe("Todo dia 1");
    expect(describeRecurrenceRule(first, en)).toBe("Every month on day 1");
  });

  it("monthly by position, with `-1` spelled as last", () => {
    const last: RecurrenceRule = {
      version: 1, frequency: "monthlyWeekday", ordinal: -1, weekday: 5,
    };
    expect(describeRecurrenceRule(last, pt)).toBe("Toda última sexta-feira do mês");
    expect(describeRecurrenceRule(last, en)).toBe("Every last Friday of the month");
  });

  it("yearly", () => {
    const christmas: RecurrenceRule = { version: 1, frequency: "yearly", month: 12, day: 25 };
    expect(describeRecurrenceRule(christmas, pt)).toBe("Todo dia 25 de dezembro");
    expect(describeRecurrenceRule(christmas, en)).toBe("Every December 25");
  });
});

describe("2R-SURFACE-007: both locales are complete, per key", () => {
  it("names all seven weekdays and all twelve months in both", () => {
    // The type already makes a missing entry a compile error. This asserts the
    // entries are not present-but-empty, which the type cannot see.
    for (const locale of locales) {
      const language = getReminderCopy(locale).series.language;
      expect(language.weekdays).toHaveLength(7);
      expect(language.months).toHaveLength(12);
      for (const name of [...language.weekdays.map((day) => day.name), ...language.months]) {
        expect(name.trim().length, `${locale} has a blank name`).toBeGreaterThan(2);
      }
    }
  });

  it("names every ordinal the schema admits, in both", () => {
    for (const locale of locales) {
      const { ordinals } = getReminderCopy(locale).series.language;
      for (const ordinal of RECURRENCE_ORDINALS) {
        expect(ordinals[ordinal]?.f.trim().length, `${locale} is missing ${ordinal} (f)`)
          .toBeGreaterThan(2);
        expect(ordinals[ordinal]?.m.trim().length, `${locale} is missing ${ordinal} (m)`)
          .toBeGreaterThan(2);
      }
    }
  });

  it("never renders the same sentence for two different rules", () => {
    /*
      A formatter that ignored its argument would satisfy every assertion above
      except this one: it would return one valid sentence for everything, and
      "the rule is stated" would be false while every test passed.
    */
    for (const locale of locales) {
      const language = getReminderCopy(locale).series.language;
      const sentences = EVERY_RULE.map((rule) => describeRecurrenceRule(rule, language));
      expect(new Set(sentences).size).toBe(sentences.length);
    }
  });
});
