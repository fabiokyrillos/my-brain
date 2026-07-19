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
  timezone: ianaTimezone,
  personality: z.enum(["direct", "proactive", "warm", "analytical"]),
  tone: z.enum(["direct", "informal", "natural", "professional"]),
  quietStart: time,
  quietEnd: time,
  importantReminderOverride: z.string().optional().transform((value) => value === "on"),
  maxFollowupsPerDay: z.coerce.number().int().min(0).max(20),
  responseDetail: z.enum(["short", "balanced", "detailed"]),
  aiProfile: z.enum(["quality", "balanced", "economy", "custom"]),
  chatModel: textModel,
  extractionModel: textModel,
  reviewModel: textModel,
  fileModel: textModel,
}).strict();

export type ProfileInput = z.infer<typeof profileSchema>;
