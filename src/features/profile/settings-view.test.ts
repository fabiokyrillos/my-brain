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
      personality: "analytical",
      tone: "professional",
      quiet_start: "23:00:00",
      quiet_end: "06:30:00",
      important_reminder_override: false,
      max_followups_per_day: 2,
      response_detail: "detailed",
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
      personality: "analytical",
      tone: "professional",
      quietStart: "23:00",
      quietEnd: "06:30",
      importantReminderOverride: false,
      maxFollowupsPerDay: 2,
      responseDetail: "detailed",
      aiProfile: "balanced",
      chatModel: "gpt-5.6-luna",
      extractionModel: "gpt-5-mini",
      reviewModel: "gpt-5.6-luna",
      fileModel: "gpt-5-mini",
    });
    expect(values).not.toHaveProperty("dailyReviewTime");
    expect(values).not.toHaveProperty("privacyDefault");
  });
});
