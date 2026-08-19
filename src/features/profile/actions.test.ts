import { describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import { getCapabilitySummaryCopy } from "@/features/shell/capability-copy";
import { createClient } from "@/lib/supabase/server";
import { updateProfile } from "./actions";
import { PROFILE_SECTION_FIELDS, type ProfileFormSection } from "./settings-sections";

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

/**
 * What a section's form actually submits: `locale`, `section`, and that
 * section's own fields — nothing else.
 *
 * Built from `PROFILE_SECTION_FIELDS` rather than typed out, so a field that
 * moves between sections moves here too and cannot leave a test asserting a
 * payload no form can produce. `settings-form.test.tsx` proves the real form
 * submits exactly these keys.
 */
const SUBMITTED: Readonly<Record<string, string>> = {
  agentName: "Ada",
  timezone: "America/New_York",
  personality: "analytical",
  tone: "professional",
  quietStart: "23:00",
  quietEnd: "06:00",
  importantReminderOverride: "on",
  maxFollowupsPerDay: "2",
  responseDetail: "detailed",
  dailyReviewTime: "21:00",
  weeklyReviewTime: "18:00",
  weeklyReviewDay: "3",
  aiProfile: "custom",
  chatModel: "gpt-5.6-luna",
  extractionModel: "gpt-5-mini",
  reviewModel: "gpt-5.6-luna",
  fileModel: "gpt-5-mini",
};

function sectionFormData(section: ProfileFormSection, overrides: Record<string, string | null> = {}) {
  const formData = new FormData();
  formData.set("locale", "en");
  formData.set("section", section);
  for (const field of PROFILE_SECTION_FIELDS[section]) {
    if (field in overrides) continue;
    formData.set(field, SUBMITTED[field]);
  }
  for (const [key, value] of Object.entries(overrides)) {
    // `null` means "this field was not submitted" — an unticked checkbox.
    if (value !== null) formData.set(key, value);
  }
  formData.set("$ACTION_REF_1", "framework-metadata");
  return formData;
}

/** The stored row every test writes past. Deliberately different from `SUBMITTED`. */
const STORED_PREFERENCES = {
  agent_name: "Brain",
  personality: "proactive",
  tone: "direct",
  response_detail: "short",
  quiet_start: "22:30:00",
  quiet_end: "07:00:00",
  important_reminder_override: true,
  max_followups_per_day: 3,
  follow_up_intensity: "balanced",
  daily_review_time: "22:00:00",
  autonomy_level: "suggestive",
  weekly_review_day: 5,
  weekly_review_time: "19:00:00",
  planning_day: 1,
  planning_time: "08:00:00",
  ai_profile: "quality",
  chat_model: "gpt-5.6-terra",
  extraction_model: "gpt-5.6-luna",
  review_model: "gpt-5.6-terra",
  file_model: "gpt-5.6-luna",
  reasoning_model: "gpt-5.6-terra",
  background_model: "gpt-5-mini",
  privacy_default: "private",
};

/** Typed so `rpc.mock.calls[0][1]` is the payload rather than a tuple of nothing. */
type SaveRpc = (name: string, payload: { p_profile: Record<string, unknown>; p_preferences: Record<string, unknown> }) => Promise<{ error: { code: string; message: string } | null }>;

function activeClient(rpc = vi.fn<SaveRpc>(async () => ({ error: null })), storedProfile: unknown = { display_name: "Owner", locale: "en", timezone: "America/Sao_Paulo" }) {
  const profile = queryStub(storedProfile);
  const preferences = queryStub(STORED_PREFERENCES);
  const lifecycle = queryStub({ status: "active" });
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1", user_metadata: { display_name: "Fallback" } } }, error: null })) },
    from: vi.fn((table: string) => table === "account_lifecycle" ? lifecycle : table === "profiles" ? profile : preferences),
    rpc,
  } as never);
  return { profile, preferences, rpc };
}

describe("updateProfile", () => {
  it("owner-scopes the preservation snapshot before saving the complete RPC payload", async () => {
    const { profile, preferences, rpc } = activeClient();

    const result = await updateProfile({ status: "idle", message: "" }, sectionFormData("general"));

    /*
     * `2O-PREF-010`. The message used to be "Preferences saved." and nothing
     * else — true of a save that changed nothing, and silent about what would
     * now behave differently.
     *
     * Slice 2P.5 made this assertion **stronger** rather than moving it. The
     * submission is Geral's, which owns `timezone` and nothing else, so exactly
     * ONE capability may move — and `identity_names` must not, even though the
     * fixture's stored `agent_name` differs from what the other sections would
     * have sent. That is `2P-SETTINGS-004` measured at the action rather than
     * asserted at the form.
     */
    expect(result.status).toBe("success");
    const copy = getCapabilitySummaryCopy("en");
    expect(result.message).toContain("Preferences saved.");
    expect(result.message).toContain(copy.entries.timezone.effect);
    expect(result.message).not.toContain(copy.entries.identity_names.effect);
    expect(result.message).not.toContain(copy.entries.quiet_hours.effect);
    expect(result.message).not.toContain(copy.entries.scheduled_reviews.effect);
    expect(profile.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(preferences.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(rpc).toHaveBeenCalledWith("save_profile_settings", expect.objectContaining({
      p_profile: { displayName: "Owner", locale: "en", timezone: "America/New_York" },
      p_preferences: expect.objectContaining({
        autonomyLevel: "suggestive",
        dailyReviewTime: "22:00",
        privacyDefault: "private",
      }),
    }));
  });

  // SH-LIFECYCLE-009: a non-active account is refused server-side before any write.
  it("redirects a suspended account to the account-state surface before saving anything", async () => {
    const lifecycle = queryStub({ status: "suspended" });
    const rpc = vi.fn<SaveRpc>(async () => ({ error: null }));
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1", user_metadata: { display_name: "Fallback" } } }, error: null })) },
      from: vi.fn(() => lifecycle),
      rpc,
    } as never);

    await expect(updateProfile({ status: "idle", message: "" }, sectionFormData("general"))).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith(expect.stringMatching(/\/account-state$/));
    expect(rpc).not.toHaveBeenCalled();
  });
});

/**
 * `2P-SETTINGS-004` — *saving one section cannot reset unsaved or stored values
 * owned by another section.*
 *
 * This is the requirement the split could most plausibly have broken, and it is
 * measured at the writer rather than argued from the form's shape: what lands
 * in `save_profile_settings` is what the database will hold.
 */
describe("a section writes its own columns and passes every other one through", () => {
  /** The stored value each column should keep when its section is not the one saving. */
  const STORED_AS_PAYLOAD: Readonly<Record<string, unknown>> = {
    timezone: "America/Sao_Paulo",
    agentName: "Brain",
    personality: "proactive",
    tone: "direct",
    responseDetail: "short",
    quietStart: "22:30",
    quietEnd: "07:00",
    importantReminderOverride: true,
    maxFollowupsPerDay: 3,
    dailyReviewTime: "22:00",
    weeklyReviewTime: "19:00",
    weeklyReviewDay: 5,
    aiProfile: "quality",
    chatModel: "gpt-5.6-terra",
    extractionModel: "gpt-5.6-luna",
    reviewModel: "gpt-5.6-terra",
    fileModel: "gpt-5.6-luna",
  };

  /** What the form sent, in the payload's own vocabulary. */
  const SUBMITTED_AS_PAYLOAD: Readonly<Record<string, unknown>> = {
    timezone: "America/New_York",
    agentName: "Ada",
    personality: "analytical",
    tone: "professional",
    responseDetail: "detailed",
    quietStart: "23:00",
    quietEnd: "06:00",
    importantReminderOverride: true,
    maxFollowupsPerDay: 2,
    dailyReviewTime: "21:00",
    weeklyReviewTime: "18:00",
    weeklyReviewDay: 3,
    aiProfile: "custom",
    chatModel: "gpt-5.6-luna",
    extractionModel: "gpt-5-mini",
    reviewModel: "gpt-5.6-luna",
    fileModel: "gpt-5-mini",
  };

  for (const section of ["general", "assistant", "ai", "planning"] as const) {
    it(`${section} writes only its own fields`, async () => {
      const { rpc } = activeClient();
      const result = await updateProfile({ status: "idle", message: "" }, sectionFormData(section));
      expect(result.status).toBe("success");

      const call = rpc.mock.calls[0][1];
      const written: Record<string, unknown> = { ...call.p_preferences, timezone: call.p_profile.timezone };
      const owned = PROFILE_SECTION_FIELDS[section] as readonly string[];

      for (const field of Object.keys(STORED_AS_PAYLOAD)) {
        const expected = owned.includes(field) ? SUBMITTED_AS_PAYLOAD[field] : STORED_AS_PAYLOAD[field];
        expect(written[field], `${section} wrote the wrong value for ${field}`).toEqual(expected);
      }
    });
  }

  /**
   * Non-vacuity, and it is the assertion that makes the loop above mean
   * something.
   *
   * If `SUBMITTED_AS_PAYLOAD` and `STORED_AS_PAYLOAD` happened to agree on a
   * field, that field's check would pass whichever branch the action took. Every
   * one of them differs, so every check discriminates.
   */
  it("submits a different value from the stored one for every single field", () => {
    for (const field of Object.keys(STORED_AS_PAYLOAD)) {
      if (field === "importantReminderOverride") continue; // covered by its own test below
      expect(SUBMITTED_AS_PAYLOAD[field], `${field} cannot discriminate`).not.toEqual(
        STORED_AS_PAYLOAD[field],
      );
    }
  });

  /**
   * The checkbox, which is the one field where **absence is the value**.
   *
   * An unticked checkbox submits nothing, so a naive "fall back to the stored
   * value when the key is missing" would make `importantReminderOverride`
   * impossible to turn off — it would silently re-enable itself on every save
   * of its own section. The action deletes the key instead of leaving the
   * stored one in place, and this is the test that would catch it coming back.
   */
  it("lets Planejamento turn the override off, because absence is its value", async () => {
    const { rpc } = activeClient();
    const result = await updateProfile(
      { status: "idle", message: "" },
      sectionFormData("planning", { importantReminderOverride: null }),
    );
    expect(result.status).toBe("success");
    const call = rpc.mock.calls[0][1];
    expect(call.p_preferences.importantReminderOverride).toBe(false);
  });

  it("but another section's save leaves it exactly as stored", async () => {
    const { rpc } = activeClient();
    await updateProfile({ status: "idle", message: "" }, sectionFormData("general"));
    const call = rpc.mock.calls[0][1];
    expect(call.p_preferences.importantReminderOverride).toBe(true);
  });

  /**
   * The stored row and the rendered form resolve through **one** function, so a
   * missing `agent_preferences` row means the same thing to both. Without it, a
   * save in Geral would write a default the reader never saw into thirteen
   * columns of a brand-new account.
   */
  it("uses the same defaults the form renders when no preferences row exists", async () => {
    const profile = queryStub(null);
    const preferences = queryStub(null);
    const lifecycle = queryStub({ status: "active" });
    const rpc = vi.fn<SaveRpc>(async () => ({ error: null }));
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1", user_metadata: { display_name: "Fallback" } } }, error: null })) },
      from: vi.fn((table: string) => table === "account_lifecycle" ? lifecycle : table === "profiles" ? profile : preferences),
      rpc,
    } as never);

    const result = await updateProfile({ status: "idle", message: "" }, sectionFormData("general"));
    expect(result.status).toBe("success");
    const call = rpc.mock.calls[0][1];
    // `resolveSettingsFormValues`' own fallbacks, which is what the form would
    // have rendered against the same empty row.
    expect(call.p_preferences.quietStart).toBe("22:30");
    expect(call.p_preferences.quietEnd).toBe("07:00");
    expect(call.p_preferences.dailyReviewTime).toBe("22:00");
    expect(call.p_preferences.weeklyReviewDay).toBe(5);
    expect(call.p_preferences.responseDetail).toBe("short");
  });
});

/**
 * `2P-SETTINGS-007` — *a failed save preserves input and names the affected
 * section.*
 */
describe("a failure names its section and writes nothing", () => {
  it("refuses a submission with no section rather than guessing one", async () => {
    const { rpc } = activeClient();
    const formData = sectionFormData("general");
    formData.delete("section");

    const result = await updateProfile({ status: "idle", message: "" }, formData);
    expect(result.status).toBe("error");
    expect(rpc, "a sectionless submission reached the database").not.toHaveBeenCalled();
  });

  it("refuses a section that is not one", async () => {
    const { rpc } = activeClient();
    const formData = sectionFormData("general");
    formData.set("section", "notifications"); // a real settings section, but not a form one
    const result = await updateProfile({ status: "idle", message: "" }, formData);
    expect(result.status).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("names the section when the section's own field is invalid", async () => {
    const { rpc } = activeClient();
    const result = await updateProfile(
      { status: "idle", message: "" },
      sectionFormData("general", { timezone: "Not/A/Zone" }),
    );
    expect(result.status).toBe("error");
    expect(result.section).toBe("general");
    expect(result.message).toContain("General");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("names the section when the database refuses the write", async () => {
    const rpc = vi.fn<SaveRpc>(async () => ({ error: { code: "23514", message: "check" } }));
    activeClient(rpc);
    const result = await updateProfile({ status: "idle", message: "" }, sectionFormData("planning"));
    expect(result.status).toBe("error");
    expect(result.section).toBe("planning");
    expect(result.message).toContain("Planning");
  });

  it("reports the section on success too, so the message lands on the right form", async () => {
    activeClient();
    const result = await updateProfile({ status: "idle", message: "" }, sectionFormData("assistant"));
    expect(result.status).toBe("success");
    expect(result.section).toBe("assistant");
  });
});
