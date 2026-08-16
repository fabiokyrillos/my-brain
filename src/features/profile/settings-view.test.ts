import { describe, expect, it, vi } from "vitest";
import { loadSettingsFormValues } from "./settings-view";

vi.mock("server-only", () => ({}));

type Result = { data: unknown; error: unknown };

function queryStub(result: Result) {
  const stub: Record<string, unknown> = {};
  stub.select = vi.fn(() => stub);
  stub.eq = vi.fn(() => stub);
  stub.maybeSingle = vi.fn(async () => result);
  return stub;
}

describe("loadSettingsFormValues", () => {
  it("owner-scopes both queries and returns only visible operational values", async () => {
    const profile = queryStub({ data: { timezone: "America/Belem" }, error: null });
    const preferences = queryStub({ data: {
      agent_name: "Ada",
      personality: "analytical",
      tone: "professional",
      quiet_start: "23:00:00",
      quiet_end: "06:30:00",
      important_reminder_override: false,
      max_followups_per_day: 2,
      response_detail: "detailed",
      daily_review_time: "21:15:00",
      weekly_review_time: "18:45:00",
      weekly_review_day: 3,
      ai_profile: "balanced",
      chat_model: "gpt-5.6-luna",
      extraction_model: "gpt-5-mini",
      review_model: "gpt-5.6-luna",
      file_model: "gpt-5-mini",
    }, error: null });
    const from = vi.fn((table: string) => table === "profiles" ? profile : preferences);

    const values = await loadSettingsFormValues({ from } as never, "user-1");

    expect(profile.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(preferences.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(values).toEqual({
      timezone: "America/Belem",
      agentName: "Ada",
      personality: "analytical",
      tone: "professional",
      quietStart: "23:00",
      quietEnd: "06:30",
      importantReminderOverride: false,
      maxFollowupsPerDay: 2,
      responseDetail: "detailed",
      // `HH:MM:SS` in the column, `HH:MM` in the form — the same narrowing
      // `quietStart` takes, because `<input type="time">` refuses seconds.
      dailyReviewTime: "21:15",
      weeklyReviewTime: "18:45",
      weeklyReviewDay: 3,
      aiProfile: "balanced",
      chatModel: "gpt-5.6-luna",
      extractionModel: "gpt-5-mini",
      reviewModel: "gpt-5.6-luna",
      fileModel: "gpt-5-mini",
    });
    /*
     * `dailyReviewTime` used to be asserted absent here, alongside
     * `privacyDefault`, because neither had a control. `2O-PREF-004` gave it
     * one — it has a proved consumer in `day-review/review-schedule.ts` — so the
     * assertion is now made against the columns that still have none.
     *
     * `privacyDefault` stays, and `planningDay` and `planningTime` join it:
     * `OD-2O-7` **A** keeps the nine consumer-less columns without a control,
     * and `2O-PREF-007` keeps the two retired ones retired. A loader that
     * started returning them would be the first half of a control appearing.
     */
    for (const absent of ["privacyDefault", "planningDay", "planningTime", "autonomyLevel", "followUpIntensity"]) {
      expect(values, absent).not.toHaveProperty(absent);
    }
  });
});
