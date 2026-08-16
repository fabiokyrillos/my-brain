"use server";

import { revalidatePath } from "next/cache";
import { assertActiveAccount } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { changedColumns, describeSaveOutcome } from "./save-outcome";
import { profileSchema } from "./schema";
import { buildSettingsPayload } from "./settings-payload";
import type { ProfileFormState } from "./settings-form";

function localized(locale: "pt-BR" | "en", pt: string, en: string) {
  return locale === "pt-BR" ? pt : en;
}

export async function updateProfile(
  _state: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const requestedLocale = formData.get("locale") === "en" ? "en" : "pt-BR";
  const submittedSettings = Object.fromEntries(
    Array.from(formData.entries()).filter(([key]) => !key.startsWith("$ACTION_")),
  );
  const parsed = profileSchema.safeParse(submittedSettings);
  if (!parsed.success) {
    return { status: "error", message: localized(requestedLocale, "Revise os campos antes de salvar.", "Review the fields before saving.") };
  }

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { status: "error", message: localized(parsed.data.locale, "Sua sessão expirou. Entre novamente.", "Your session expired. Sign in again.") };
  }
  await assertActiveAccount(supabase, user.id, parsed.data.locale);

  const [profileResult, preferencesResult] = await Promise.all([
    /*
     * `2O-PREF-010` widened both selects, and neither adds a query.
     *
     * The snapshot existed to **preserve** hidden preferences; it is now also
     * the *before* half of what changed. Answering "what will behave
     * differently" needs the previous value of every column a control writes —
     * `personality`, `tone`, the quiet hours, the routing — and none of those
     * were selected, because nothing had ever needed to compare them.
     *
     * `timezone` joins the profile select for the same reason. It is the one
     * preference stored on `profiles` rather than `agent_preferences`, and it
     * is the single most consequential one to change.
     */
    supabase.from("profiles").select("display_name,locale,timezone").eq("user_id", user.id).maybeSingle(),
    supabase.from("agent_preferences").select("agent_name,personality,tone,response_detail,quiet_start,quiet_end,important_reminder_override,max_followups_per_day,follow_up_intensity,daily_review_time,autonomy_level,weekly_review_day,weekly_review_time,planning_day,planning_time,ai_provider,ai_profile,chat_model,extraction_model,review_model,file_model,reasoning_model,background_model,embedding_model,privacy_default").eq("user_id", user.id).maybeSingle(),
  ]);
  if (profileResult.error || preferencesResult.error) {
    return { status: "error", message: localized(parsed.data.locale, "Não foi possível carregar suas preferências atuais.", "Could not load your current preferences.") };
  }

  const payload = buildSettingsPayload(parsed.data, {
    fallbackDisplayName: String(user.user_metadata.display_name ?? "Usuário"),
    profile: profileResult.data,
    preferences: preferencesResult.data,
  });
  const { error } = await supabase.rpc("save_profile_settings", {
    p_profile: payload.profile,
    p_preferences: payload.preferences,
  });
  if (error) {
    /*
     * `2O-PREF-011`. The message says it failed and invites a retry, and the
     * **input is kept by construction**: this returns a state, it does not
     * redirect and it does not revalidate, so the form React is holding — every
     * field of it — is exactly what the reader typed. A `revalidatePath` here
     * would refresh the page out from under a failed save and discard it, which
     * is the shape slice 2N.3 found in the undo control.
     *
     * A partial write is impossible for a different reason: the payload is one
     * `save_profile_settings` call, so it lands whole or not at all.
     */
    console.error("Profile settings save failed", error.code);
    return { status: "error", message: localized(parsed.data.locale, "Não foi possível salvar. Tente novamente.", "Could not save. Try again.") };
  }

  revalidatePath(`/${parsed.data.locale}/app/settings`);
  /*
   * `2O-PREF-010`. What changed, and what will now behave differently — in the
   * registry's own words, which are the same words the summary on this page
   * uses. Diffed against the snapshot that was read before the write, so it
   * describes the change rather than the submission: a save that alters nothing
   * says so instead of claiming an effect.
   */
  const changed = changedColumns(
    { ...(preferencesResult.data ?? {}), timezone: profileResult.data?.timezone ?? null },
    { ...payload.preferences, timezone: payload.profile.timezone },
  );
  return { status: "success", message: describeSaveOutcome(parsed.data.locale, changed) };
}
