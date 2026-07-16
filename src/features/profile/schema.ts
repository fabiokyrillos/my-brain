import { z } from "zod";

const ianaTimezone = z.string().refine((value) => {
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); return value.includes("/") || value === "UTC"; } catch { return false; }
}, "Use um timezone IANA válido");

export const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  agentName: z.string().trim().min(1).max(60),
  locale: z.enum(["pt-BR", "en"]),
  timezone: ianaTimezone,
  followUpIntensity: z.enum(["calm", "balanced", "insistent", "custom"]),
  dailyReviewTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});
export type ProfileInput = z.infer<typeof profileSchema>;
