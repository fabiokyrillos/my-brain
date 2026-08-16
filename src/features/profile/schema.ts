import { z } from "zod";

const ianaTimezone = z.string().refine((value) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return value.includes("/") || value === "UTC";
  } catch {
    return false;
  }
}, "Use um timezone IANA válido");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const textModel = z.enum(["gpt-5.6-terra", "gpt-5.6-luna", "gpt-5-mini"]);

export const profileSchema = z.object({
  locale: z.enum(["pt-BR", "en"]),
  // Bounded to match `agent_preferences_agent_name_check` exactly (1–60 after
  // trimming). A looser bound here would turn a typo into a database error the
  // form could not explain; a tighter one would refuse a name the column
  // accepts.
  agentName: z.string().trim().min(1).max(60),
  timezone: ianaTimezone,
  personality: z.enum(["direct", "proactive", "warm", "analytical"]),
  tone: z.enum(["direct", "informal", "natural", "professional"]),
  quietStart: time,
  quietEnd: time,
  importantReminderOverride: z.string().optional().transform((value) => value === "on"),
  maxFollowupsPerDay: z.coerce.number().int().min(0).max(20),
  responseDetail: z.enum(["short", "balanced", "detailed"]),
  /*
   * `2O-PREF-004`. The three review preferences that already have a consumer.
   *
   * This object is `.strict()`, which is why these lines are not optional
   * bookkeeping: a control rendered in the form without a key here makes the
   * whole parse fail and the **entire save** return "review the fields", with no
   * indication of which one. The strictness is right — it refuses fields nobody
   * declared — and it makes the form and this schema a single unit that has to
   * move together.
   *
   * `weeklyReviewDay` is coerced because a `<select>` submits a string, and
   * bounded 0–6 to match `parseReviewWeekday`, which refuses anything outside
   * that range rather than folding it into a different day.
   */
  dailyReviewTime: time,
  weeklyReviewTime: time,
  weeklyReviewDay: z.coerce.number().int().min(0).max(6),
  aiProfile: z.enum(["quality", "balanced", "economy", "custom"]),
  chatModel: textModel,
  extractionModel: textModel,
  reviewModel: textModel,
  fileModel: textModel,
}).strict();

export type ProfileInput = z.infer<typeof profileSchema>;
