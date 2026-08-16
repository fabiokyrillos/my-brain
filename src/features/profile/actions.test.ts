import { describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateProfile } from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// Like real Next, the mocked redirect throws so the action aborts server-side.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

function queryStub(data: unknown) {
  const stub: Record<string, unknown> = {};
  stub.select = vi.fn(() => stub);
  stub.eq = vi.fn(() => stub);
  stub.maybeSingle = vi.fn(async () => ({ data, error: null }));
  return stub;
}

function operationalFormData() {
  const formData = new FormData();
  for (const [key, value] of Object.entries({
    locale: "en",
    agentName: "Ada",
    timezone: "America/New_York",
    personality: "analytical",
    tone: "professional",
    quietStart: "23:00",
    quietEnd: "06:00",
    importantReminderOverride: "on",
    maxFollowupsPerDay: "2",
    responseDetail: "detailed",
    dailyReviewTime: "22:00",
    weeklyReviewTime: "19:00",
    weeklyReviewDay: "5",
    aiProfile: "custom",
    chatModel: "gpt-5.6-luna",
    extractionModel: "gpt-5-mini",
    reviewModel: "gpt-5.6-terra",
    fileModel: "gpt-5-mini",
  })) formData.set(key, value);
  formData.set("$ACTION_REF_1", "framework-metadata");
  return formData;
}

describe("updateProfile", () => {
  it("owner-scopes the preservation snapshot before saving the complete RPC payload", async () => {
    const profile = queryStub({ display_name: "Owner", locale: "en" });
    const preferences = queryStub({
      agent_name: "Brain",
      follow_up_intensity: "balanced",
      daily_review_time: "22:00:00",
      autonomy_level: "suggestive",
      weekly_review_day: 5,
      weekly_review_time: "19:00:00",
      planning_day: 1,
      planning_time: "08:00:00",
      reasoning_model: "gpt-5.6-terra",
      background_model: "gpt-5-mini",
      privacy_default: "private",
    });
    const lifecycle = queryStub({ status: "active" });
    const rpc = vi.fn(async () => ({ error: null }));
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1", user_metadata: { display_name: "Fallback" } } }, error: null })) },
      from: vi.fn((table: string) => table === "account_lifecycle" ? lifecycle : table === "profiles" ? profile : preferences),
      rpc,
    } as never);

    const result = await updateProfile({ status: "idle", message: "" }, operationalFormData());

    expect(result).toEqual({ status: "success", message: "Preferences saved." });
    expect(profile.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(preferences.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(rpc).toHaveBeenCalledWith("save_profile_settings", expect.objectContaining({
      p_profile: { displayName: "Owner", locale: "en", timezone: "America/New_York" },
      p_preferences: expect.objectContaining({
        autonomyLevel: "suggestive",
        dailyReviewTime: "22:00",
        privacyDefault: "private",
        personality: "analytical",
      }),
    }));
  });

  // SH-LIFECYCLE-009: a non-active account is refused server-side before any write.
  it("redirects a suspended account to the account-state surface before saving anything", async () => {
    const lifecycle = queryStub({ status: "suspended" });
    const rpc = vi.fn(async () => ({ error: null }));
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1", user_metadata: { display_name: "Fallback" } } }, error: null })) },
      from: vi.fn(() => lifecycle),
      rpc,
    } as never);

    await expect(updateProfile({ status: "idle", message: "" }, operationalFormData())).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith(expect.stringMatching(/\/account-state$/));
    expect(rpc).not.toHaveBeenCalled();
  });
});
