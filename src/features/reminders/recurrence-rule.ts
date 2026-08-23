import { z } from "zod";

/**
 * `2R-MODEL-001` … `-003` — the closed, enumerated, versioned rule set.
 *
 * ## What this is, and what `OD-2R-2` refused
 *
 * A reminder may repeat in exactly **five** shapes, signed by ADR-132
 * Decision 3: daily; weekly on chosen weekdays; monthly on a day of the month;
 * monthly on an ordinal weekday; yearly. Anything else is refused at this
 * boundary and never reaches storage.
 *
 * The alternative — an RFC 5545 subset parsed from text — was **refused by
 * name**, and the owner's reason was the failure mode rather than the
 * capability: a rule string the parser reads differently from the writer fires
 * at the wrong time **with no error anywhere**. A closed union cannot do that.
 * Every value it admits is enumerated here, and a value it does not admit is a
 * refusal with a named reason before any write.
 *
 * ## What this module deliberately does NOT do
 *
 * **It does not compute an instant.** `2R-TIME-007` requires occurrence
 * instants to be computed in *one* place, and that place is the database —
 * `private.reminder_next_instant`, reached by the materialisation trigger and
 * by the preview RPC, so the two literally cannot disagree.
 *
 * That split is not arbitrary. Slice 2R.0 reported a defect
 * (`2R-TZ-SECOND-AUTHORITY`) whose whole shape is *two implementations of one
 * rule*, and answering it by adding a second implementation of the DST policy
 * — one in TypeScript for the preview, one in SQL for the trigger — would have
 * reproduced the finding inside the fix. It was also **measured** rather than
 * assumed: Postgres's own `at time zone` disagrees with both signed edge cases,
 * resolving a spring-forward gap to the requested wall clock plus the shift
 * (03:30, not the first valid 03:00) and a fall-back overlap to the **second**
 * occurrence rather than the first. A hand-written TypeScript resolver would
 * have had to agree with a hand-written SQL one about all of that, forever.
 *
 * So TypeScript owns the **shape** and the **words**; the database owns the
 * **instants**. `recurrence-rule-parity.test.ts` asserts the two validators
 * admit the same closed set, the way `extraction-parity.test.ts` holds the
 * worker's schema to `src/lib/ai`'s.
 *
 * ## Weekday numbering
 *
 * **ISO-8601: 1 = Monday … 7 = Sunday.** Chosen because Postgres's `isodow` is
 * the same, so the rule the surface writes and the predicate the database
 * evaluates use one numbering with no translation step to get wrong. It is
 * *not* JavaScript's `getDay()` (0 = Sunday), and `weekdayFromJsDay` exists so
 * that difference is converted in one named place rather than inline.
 */

/**
 * The rule format's version, stored inside every rule.
 *
 * `2R-MODEL-003`: a rule of an **unknown** version is refused rather than
 * guessed at. A literal rather than a range — widening it is a decision, and a
 * decision should look like an edit here rather than like data that happened to
 * parse.
 */
export const RECURRENCE_RULE_VERSION = 1;

/** The five patterns `OD-2R-2` signed, and no sixth. */
export const RECURRENCE_FREQUENCIES = [
  "daily",
  "weekly",
  "monthlyDay",
  "monthlyWeekday",
  "yearly",
] as const;

export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

/**
 * The ordinals *"monthly by position and weekday"* admits.
 *
 * `-1` is **last**, which is what makes "the last Friday of the month"
 * expressible without a sixth pattern. There is deliberately no `5`: a fifth
 * Friday exists in some months and not others, so a rule naming it would be a
 * rule that silently skips months — the class of surprise `OD-2R-5` was signed
 * to remove rather than introduce.
 */
export const RECURRENCE_ORDINALS = [1, 2, 3, 4, -1] as const;

export type RecurrenceOrdinal = (typeof RECURRENCE_ORDINALS)[number];

const version = z.literal(RECURRENCE_RULE_VERSION);

/** ISO-8601 weekday: 1 = Monday … 7 = Sunday, matching Postgres `isodow`. */
const isoWeekday = z.number().int().min(1).max(7);

/**
 * A day of the month, 1..31 — **including the days some months do not have.**
 *
 * Refusing 31 would make *"the 31st"* unsayable, and `OD-2R-5` case 3 decided
 * the opposite: the rule is accepted and a month too short for it uses its
 * **last day**. The clamp is a property of the generator, not of the validator,
 * and putting it here instead would silently rewrite the owner's intention into
 * "the 30th" for every month.
 */
const dayOfMonth = z.number().int().min(1).max(31);

export const recurrenceRuleSchema = z.discriminatedUnion("frequency", [
  z.object({ version, frequency: z.literal("daily") }).strict(),
  z
    .object({
      version,
      frequency: z.literal("weekly"),
      /*
       * Non-empty, unique and ascending. Ascending is enforced rather than
       * sorted-on-read so that one rule has exactly one stored spelling: two
       * byte-different rules meaning the same thing would make "did the series
       * change?" unanswerable by comparison, which `2R-SERIES-003` needs.
       */
      weekdays: z
        .array(isoWeekday)
        .min(1)
        .max(7)
        .refine((days) => new Set(days).size === days.length, { message: "duplicate weekday" })
        .refine((days) => days.every((day, at) => at === 0 || day > days[at - 1]!), {
          message: "weekdays must ascend",
        }),
    })
    .strict(),
  z.object({ version, frequency: z.literal("monthlyDay"), day: dayOfMonth }).strict(),
  z
    .object({
      version,
      frequency: z.literal("monthlyWeekday"),
      ordinal: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(-1)]),
      weekday: isoWeekday,
    })
    .strict(),
  z
    .object({
      version,
      frequency: z.literal("yearly"),
      month: z.number().int().min(1).max(12),
      day: dayOfMonth,
    })
    .strict(),
]);

export type RecurrenceRule = z.infer<typeof recurrenceRuleSchema>;

/**
 * Parse an untrusted value into a rule, or say why not.
 *
 * Returns a discriminated result rather than throwing, because every caller is
 * a boundary that has to turn a refusal into a sentence for the owner —
 * `2R-MODEL-002` asks for *"a named reason"*, and an exception with a Zod
 * stringification is not one.
 */
export type RecurrenceRuleParse =
  | { readonly ok: true; readonly rule: RecurrenceRule }
  | { readonly ok: false; readonly reason: RecurrenceRuleRefusal };

/**
 * Why a rule was refused, as a closed vocabulary.
 *
 * Closed so the surface can carry one translated sentence per reason instead of
 * rendering a validator's internal text, and so a new refusal cannot appear
 * without a copy key appearing with it.
 */
export const RECURRENCE_REFUSALS = [
  "not-an-object",
  "unknown-version",
  "unknown-frequency",
  "malformed",
] as const;

export type RecurrenceRuleRefusal = (typeof RECURRENCE_REFUSALS)[number];

export function parseRecurrenceRule(value: unknown): RecurrenceRuleParse {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, reason: "not-an-object" };
  }

  const candidate = value as Record<string, unknown>;

  /*
   * Version before shape, and deliberately so.
   *
   * A version-2 rule will have fields this union does not know, so parsing it
   * first would refuse it as `malformed` — which reads as "the owner wrote
   * something wrong" when the truth is "this build is older than the rule". The
   * distinction matters the day a version 2 exists, and it is unrecoverable
   * afterwards, so it is made now while it costs three lines.
   */
  if (candidate.version !== RECURRENCE_RULE_VERSION) {
    return { ok: false, reason: "unknown-version" };
  }

  if (
    typeof candidate.frequency !== "string"
    || !(RECURRENCE_FREQUENCIES as readonly string[]).includes(candidate.frequency)
  ) {
    return { ok: false, reason: "unknown-frequency" };
  }

  const parsed = recurrenceRuleSchema.safeParse(candidate);
  return parsed.success ? { ok: true, rule: parsed.data } : { ok: false, reason: "malformed" };
}

/**
 * JavaScript's `Date.getDay()` (0 = Sunday) as an ISO weekday (1 = Monday).
 *
 * One named conversion instead of `day === 0 ? 7 : day` at each call site. The
 * off-by-one it prevents is the kind that only shows up on Sundays.
 */
export function weekdayFromJsDay(jsDay: number): number {
  return jsDay === 0 ? 7 : jsDay;
}
