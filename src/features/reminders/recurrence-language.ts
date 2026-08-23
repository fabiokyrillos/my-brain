import type { RecurrenceOrdinal, RecurrenceRule } from "./recurrence-rule";

/**
 * A recurrence rule, in the owner's words — `2R-SURFACE-004`.
 *
 * ## What this exists to prevent
 *
 * The requirement is negative before it is positive: *no surface renders a raw
 * rule, an `RRULE` or a JSON fragment*. The easy version of a "repeats" badge is
 * `JSON.stringify(rule)` or `rule.frequency`, and both put the database's
 * vocabulary on the screen — the same defect UX-21 recorded when the reminders
 * list printed `{item.status}` to a Portuguese reader.
 *
 * So there is exactly one function that turns a rule into words, every surface
 * calls it, and `recurrence-language.test.ts` asserts that its output never
 * contains a frequency literal, a brace or the word `RRULE`.
 *
 * ## Pure, and given its words rather than choosing them
 *
 * No `Intl`, no clock, no locale branch. The caller passes the
 * `RecurrenceLanguage` block from `copy.ts`, which is `satisfies Record<Locale,
 * …>` — so a missing weekday name in one locale is a **compile error**, which is
 * what `2R-SURFACE-007`'s *"asserted per key"* has to mean to be enforceable.
 *
 * `Intl.DateTimeFormat` was the obvious alternative for weekday and month names
 * and is deliberately not used. It would supply the nouns and none of the
 * agreement: pt-BR needs *"todo dia 1"* against *"toda segunda-feira"* against
 * *"toda primeira segunda-feira do mês"*, and the article changes with the
 * noun's gender rather than with the date. A name table plus a sentence template
 * per frequency is the shape that can be correct; a name from `Intl` glued to a
 * fixed prefix is the shape that is subtly wrong in one language and nobody
 * notices in the other.
 *
 * ## Why the calendar imports this rather than owning a copy
 *
 * `2R-SURFACE-003` asks every surface that lists a recurring reminder to say
 * that it repeats **and how**. Two surfaces phrasing the same rule differently
 * is the disagreement `2R-TZ-SECOND-AUTHORITY` is named for, one level down, so
 * the calendar and the agenda call this function rather than describing a rule
 * themselves.
 */

/**
 * A weekday, with the one property a sentence needs beyond its name.
 *
 * ## Why gender is here, and what happened without it
 *
 * The first version of this module was `weeklyOne: (weekday: string) => \`Toda
 * ${weekday}\``, and its test asserted `"Toda domingo"` and passed. Five of the
 * seven pt-BR weekdays are feminine because they end in *-feira*; **`sábado` and
 * `domingo` are masculine**, and the article has to follow the noun. The test
 * agreed with the code and both were wrong, which is what a fixture written from
 * the implementation rather than from the language always produces.
 *
 * So the noun carries its gender and each locale's own templates decide what to
 * do with it. English ignores the field entirely, which is the correct amount of
 * attention for English to pay it.
 */
export type WeekdayWord = {
  readonly name: string;
  /** Grammatical gender of the noun. `"n"` for languages that do not inflect. */
  readonly gender: "f" | "m" | "n";
};

/** ISO-8601 weekday order: index 0 is Monday, index 6 is Sunday. */
export type WeekdayWords = readonly [
  WeekdayWord, WeekdayWord, WeekdayWord, WeekdayWord, WeekdayWord, WeekdayWord, WeekdayWord,
];

export type MonthNames = readonly [
  string, string, string, string, string, string,
  string, string, string, string, string, string,
];

/** An ordinal in both forms, because the noun it qualifies decides which. */
export type OrdinalWord = { readonly f: string; readonly m: string };

export type RecurrenceLanguage = {
  /** The seven weekdays in full, Monday first — not the calendar's abbreviations. */
  readonly weekdays: WeekdayWords;
  readonly months: MonthNames;
  /**
   * The five positions `monthlyWeekday` admits, `-1` spelled as *last*.
   *
   * Keyed by the literal ordinal rather than by array index, because `-1` has no
   * index and mapping it to `[4]` would be a silent convention two readers
   * could disagree about.
   */
  readonly ordinals: Readonly<Record<RecurrenceOrdinal, OrdinalWord>>;
  readonly daily: string;
  /** `(weekday) => "Toda segunda-feira"` / `"Todo domingo"` — the locale agrees. */
  readonly weeklyOne: (weekday: WeekdayWord) => string;
  /** `(list) => "Toda semana: …"` — the list is already joined. */
  readonly weeklyMany: (weekdays: string) => string;
  readonly monthlyDay: (day: number) => string;
  readonly monthlyWeekday: (ordinal: OrdinalWord, weekday: WeekdayWord) => string;
  readonly yearly: (day: number, month: string) => string;
  /** The separator between all but the last item, and the one before the last. */
  readonly listSeparator: string;
  readonly listFinal: string;
};

/**
 * Joins a list the way the locale does, not the way `Array.join` does.
 *
 * `"a, b, c"` is wrong in both languages for a spoken list, and `Intl.ListFormat`
 * would be right but would take the phrasing back out of `copy.ts` where
 * `2R-SURFACE-006` puts it. Two separators cover both languages this product
 * ships.
 */
function joinList(items: readonly string[], language: RecurrenceLanguage): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  const head = items.slice(0, -1).join(language.listSeparator);
  return `${head}${language.listFinal}${items[items.length - 1]!}`;
}

/**
 * The rule as one sentence.
 *
 * Exhaustive over the union by construction: the `switch` has no `default`, and
 * the return type makes a missing branch a compile error rather than an
 * `undefined` reaching the page. A sixth frequency cannot be added without this
 * file refusing to build, which is the point — `OD-2R-2` signed five.
 */
export function describeRecurrenceRule(
  rule: RecurrenceRule,
  language: RecurrenceLanguage,
): string {
  switch (rule.frequency) {
    case "daily":
      return language.daily;
    case "weekly": {
      // `weekdays` is ISO 1..7 and the table is 0-indexed from Monday.
      const words = rule.weekdays.map((day) => language.weekdays[day - 1]!);
      return words.length === 1
        ? language.weeklyOne(words[0]!)
        : language.weeklyMany(joinList(words.map((word) => word.name), language));
    }
    case "monthlyDay":
      return language.monthlyDay(rule.day);
    case "monthlyWeekday":
      return language.monthlyWeekday(
        language.ordinals[rule.ordinal],
        language.weekdays[rule.weekday - 1]!,
      );
    case "yearly":
      return language.yearly(rule.day, language.months[rule.month - 1]!);
  }
}
