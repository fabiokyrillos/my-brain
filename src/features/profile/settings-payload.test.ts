import { describe, expect, it } from "vitest";
import type { ProfileInput } from "./schema";
import { buildSettingsPayload, type SettingsPersistenceSnapshot } from "./settings-payload";

const input: ProfileInput = {
  locale: "pt-BR",
  agentName: "Brain",
  timezone: "America/Sao_Paulo",
  personality: "warm",
  tone: "natural",
  quietStart: "23:00",
  quietEnd: "06:00",
  importantReminderOverride: true,
  maxFollowupsPerDay: 4,
  responseDetail: "balanced",
  /*
   * Deliberately different from every value in `snapshot` below — 07:15 against
   * a stored 21:30, 20:45 against 18:30, Tuesday against Thursday.
   *
   * `2O-PREF-004` replaced a round-trip: these three used to be read from the
   * stored row and written straight back, so a fixture whose input matched the
   * snapshot would pass identically before and after the change and would prove
   * nothing at all.
   */
  dailyReviewTime: "07:15",
  weeklyReviewTime: "20:45",
  weeklyReviewDay: 2,
  aiProfile: "custom",
  chatModel: "gpt-5.6-luna",
  extractionModel: "gpt-5-mini",
  reviewModel: "gpt-5.6-terra",
  fileModel: "gpt-5-mini",
};

const snapshot: SettingsPersistenceSnapshot = {
  fallbackDisplayName: "Fábio",
  profile: { display_name: "Fabin", locale: "en" },
  preferences: {
    agent_name: "Brain local",
    follow_up_intensity: "calm",
    daily_review_time: "21:30:00",
    autonomy_level: "suggestive",
    weekly_review_day: 4,
    weekly_review_time: "18:30:00",
    planning_day: 0,
    planning_time: "09:00:00",
    ai_provider: "openai",
    reasoning_model: "gpt-5.6-luna",
    background_model: "gpt-5-mini",
    embedding_model: "text-embedding-3-small",
    privacy_default: "private",
  },
};

describe("buildSettingsPayload", () => {
  it("merges visible settings with the owner-scoped snapshot and preserves hidden preferences", () => {
    const payload = buildSettingsPayload(input, snapshot);
    expect(payload.profile).toEqual({ displayName: "Fabin", locale: "en", timezone: "America/Sao_Paulo" });
    expect(payload.preferences).toMatchObject({
      agentName: "Brain",
      followUpIntensity: "calm",
      autonomyLevel: "suggestive",
      personality: "warm",
      tone: "natural",
      responseDetail: "balanced",
      privacyDefault: "private",
      reasoningModel: "gpt-5.6-luna",
      backgroundModel: "gpt-5-mini",
    });
  });

  /**
   * `2O-PREF-004` beside `2O-PREF-007` — the two halves that have to stay apart.
   *
   * Five columns were inert together under `2M-AUDIT-005`. Three were given a
   * consumer and are now given a control; two were retired and stay retired. The
   * payload writes all five, so this is the assertion that stops a future edit
   * "finishing the job" by wiring the other two up as well.
   */
  it("sends the review preferences from the form and the planning ones from the row", () => {
    const payload = buildSettingsPayload(input, snapshot);

    // Submitted. The snapshot holds 21:30 / 18:30 / Thursday, and none of them
    // reaches the payload.
    expect(payload.preferences).toMatchObject({
      dailyReviewTime: "07:15",
      weeklyReviewTime: "20:45",
      weeklyReviewDay: 2,
    });

    // Preserved. `2O-PREF-007`: no control, so the stored value is the only
    // thing that could be written, and a save must not disturb it.
    expect(payload.preferences).toMatchObject({ planningDay: 0, planningTime: "09:00" });
  });

  it("keeps the planning columns when the row has never held one", () => {
    const payload = buildSettingsPayload(input, { ...snapshot, preferences: null });
    expect(payload.preferences).toMatchObject({ planningDay: 1, planningTime: "08:00" });
    // And the three controlled ones still come from the form, not from a
    // fallback — a null row must not silently reinstate the round-trip.
    expect(payload.preferences).toMatchObject({
      dailyReviewTime: "07:15",
      weeklyReviewTime: "20:45",
      weeklyReviewDay: 2,
    });
  });

  it("applies the complete preset server-side without accepting hidden model fields", () => {
    const payload = buildSettingsPayload({ ...input, aiProfile: "economy" }, snapshot);
    expect(payload.preferences).toMatchObject({
      aiProfile: "economy",
      chatModel: "gpt-5-mini",
      extractionModel: "gpt-5-mini",
      reasoningModel: "gpt-5.6-luna",
      reviewModel: "gpt-5-mini",
      fileModel: "gpt-5-mini",
      backgroundModel: "gpt-5-mini",
      embeddingModel: "text-embedding-3-small",
    });
  });
});
