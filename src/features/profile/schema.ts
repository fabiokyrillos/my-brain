import { z } from "zod";

const ianaTimezone = z.string().refine((value) => {
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); return value.includes("/") || value === "UTC"; } catch { return false; }
}, "Use um timezone IANA válido");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  agentName: z.string().trim().min(1).max(60),
  locale: z.enum(["pt-BR", "en"]),
  timezone: ianaTimezone,
  followUpIntensity: z.enum(["calm", "balanced", "insistent", "custom"]),
  dailyReviewTime: time,
  personality: z.enum(["direct", "proactive", "warm", "analytical"]),
  tone: z.enum(["direct", "informal", "natural", "professional"]),
  autonomyLevel: z.enum(["suggestive", "balanced", "autonomous"]),
  weeklyReviewDay: z.coerce.number().int().min(0).max(6),
  weeklyReviewTime: time,
  planningDay: z.coerce.number().int().min(0).max(6),
  planningTime: time,
  quietStart: time,
  quietEnd: time,
  importantReminderOverride: z.string().optional().transform((value) => value === "on"),
  maxFollowupsPerDay: z.coerce.number().int().min(0).max(20),
  responseDetail: z.enum(["short", "balanced", "detailed"]),
  aiProvider: z.literal("openai"),
  aiModel: z.enum(["gpt-5.6-luna", "gpt-5.6-terra"]),
  privacyDefault: z.enum(["normal", "private", "highly_sensitive"]),
});
export type ProfileInput = z.infer<typeof profileSchema>;
