/**
 * What is stored, resolved once, for both the form that renders it and the
 * action that writes past it.
 *
 * ## Why this had to be extracted
 *
 * Slice 2P.5 splits `SettingsForm` across four sections, and a section's save
 * writes the columns it owns while passing every other column through from the
 * stored row. That only holds if *"what is stored"* means the same thing on
 * both sides: if the renderer's fallback for a missing `agent_preferences` row
 * disagreed with the writer's by one value, saving Geral would rewrite an
 * Assistente column to something the reader never saw.
 *
 * `loadSettingsFormValues` already owned that resolution — the defaults, the
 * bounds check on the weekday, the `slice(0, 5)` on times, the model
 * validation. It is now a pure function that both callers use, so there is one
 * answer rather than two that happen to agree today.
 *
 * It is deliberately **not** `server-only`: it reads nothing and is the thing
 * the section-ownership tests exercise directly.
 */

import { isTextModelId, type AIRoutingProfile, type TextModelId } from "@/lib/ai/model-routing";
import { defaultAgentPreferences } from "@/lib/preferences";
import type { SettingsFormValues } from "./settings-contracts";

/** The `profiles` columns this resolution needs. Others may be present. */
export type StoredProfileRow = Readonly<{ timezone?: string | null }> | null;

/** The `agent_preferences` columns this resolution needs. Others may be present. */
export type StoredPreferencesRow = Readonly<{
  agent_name?: string | null;
  personality?: string | null;
  tone?: string | null;
  quiet_start?: string | null;
  quiet_end?: string | null;
  important_reminder_override?: boolean | null;
  max_followups_per_day?: number | null;
  response_detail?: string | null;
  daily_review_time?: string | null;
  weekly_review_time?: string | null;
  weekly_review_day?: number | null;
  ai_profile?: string | null;
  chat_model?: string | null;
  extraction_model?: string | null;
  review_model?: string | null;
  file_model?: string | null;
}> | null;

function timeValue(value: string | null | undefined, fallback: string) {
  return String(value ?? fallback).slice(0, 5);
}

function oneOf<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return typeof value === "string" && values.includes(value as T) ? (value as T) : fallback;
}

/** 0–6, Sunday-based — the same range `parseReviewWeekday` accepts. */
function weekday(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6
    ? value
    : fallback;
}

function model(value: unknown, fallback: TextModelId): TextModelId {
  return isTextModelId(value) ? value : fallback;
}

/**
 * The stored values, expressed the way a form would have submitted them.
 *
 * ## Why this inverse exists
 *
 * `updateProfile` builds one complete object and parses it with the unchanged
 * strict schema, so the fields a section does not own have to arrive in the
 * schema's **input** vocabulary rather than its output one. Every field is a
 * string or a number on the wire except one:
 * `importantReminderOverride` is `z.string().optional().transform(v => v ===
 * "on")`, because an unticked checkbox submits **nothing**. Passing the stored
 * `boolean` straight in would fail `z.string()` and turn every save in the
 * other three sections into "review the fields".
 *
 * So absence is the value here too: the key is present as `"on"` when the
 * preference is on, and absent when it is off — exactly what a browser sends.
 */
export function storedAsSubmission(values: SettingsFormValues): Record<string, unknown> {
  return {
    timezone: values.timezone,
    agentName: values.agentName,
    personality: values.personality,
    tone: values.tone,
    responseDetail: values.responseDetail,
    quietStart: values.quietStart,
    quietEnd: values.quietEnd,
    ...(values.importantReminderOverride ? { importantReminderOverride: "on" } : {}),
    maxFollowupsPerDay: values.maxFollowupsPerDay,
    dailyReviewTime: values.dailyReviewTime,
    weeklyReviewTime: values.weeklyReviewTime,
    weeklyReviewDay: values.weeklyReviewDay,
    aiProfile: values.aiProfile,
    chatModel: values.chatModel,
    extractionModel: values.extractionModel,
    reviewModel: values.reviewModel,
    fileModel: values.fileModel,
  };
}

export function resolveSettingsFormValues(
  profile: StoredProfileRow,
  preferences: StoredPreferencesRow,
): SettingsFormValues {
  return Object.freeze({
    timezone: profile?.timezone ?? "America/Sao_Paulo",
    agentName: preferences?.agent_name?.trim() || defaultAgentPreferences.agentName,
    personality: oneOf(preferences?.personality, ["direct", "proactive", "warm", "analytical"] as const, "proactive"),
    tone: oneOf(preferences?.tone, ["direct", "informal", "natural", "professional"] as const, "direct"),
    quietStart: timeValue(preferences?.quiet_start, "22:30"),
    quietEnd: timeValue(preferences?.quiet_end, "07:00"),
    importantReminderOverride: preferences?.important_reminder_override ?? true,
    maxFollowupsPerDay: preferences?.max_followups_per_day ?? 3,
    responseDetail: oneOf(preferences?.response_detail, ["short", "balanced", "detailed"] as const, "short"),
    /*
     * `2O-PREF-004`. The fallbacks match the ones `buildSettingsPayload` has
     * been sending since before that slice — 22:00, 19:00 and Friday — so a form
     * opened against a row that predates the controls renders the value that was
     * already being written, rather than proposing a change nobody asked for.
     *
     * `weeklyReviewDay` is bounded rather than defaulted blindly: the column has
     * no CHECK the application can rely on, and `parseReviewWeekday` refuses
     * anything outside 0–6, so the form must not offer a value the consumer will
     * then decline to read.
     */
    dailyReviewTime: timeValue(preferences?.daily_review_time, "22:00"),
    weeklyReviewTime: timeValue(preferences?.weekly_review_time, "19:00"),
    weeklyReviewDay: weekday(preferences?.weekly_review_day, 5),
    aiProfile: oneOf(preferences?.ai_profile, ["quality", "balanced", "economy", "custom"] as const satisfies readonly AIRoutingProfile[], "quality"),
    chatModel: model(preferences?.chat_model, "gpt-5.6-terra"),
    extractionModel: model(preferences?.extraction_model, "gpt-5.6-luna"),
    reviewModel: model(preferences?.review_model, "gpt-5.6-terra"),
    fileModel: model(preferences?.file_model, "gpt-5.6-luna"),
  });
}
