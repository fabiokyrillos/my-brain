export const locales = ["pt-BR", "en"] as const;
export type Locale = (typeof locales)[number];

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && locales.includes(value as Locale);
}

export function resolveLocale(value: unknown): Locale {
  return isLocale(value) ? value : "pt-BR";
}

export const defaultAgentPreferences = {
  agentName: "Brain",
  locale: "pt-BR" as Locale,
  tone: "direct",
  autonomyLevel: "autonomous",
  followUpIntensity: "balanced",
  dailyReviewTime: "22:00",
  timezone: "America/Sao_Paulo",
  responseDetail: "short",
} as const;
