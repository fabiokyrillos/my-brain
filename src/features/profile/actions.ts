"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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

  const [profileResult, preferencesResult] = await Promise.all([
    supabase.from("profiles").select("display_name,locale").eq("user_id", user.id).maybeSingle(),
    supabase.from("agent_preferences").select("agent_name,follow_up_intensity,daily_review_time,autonomy_level,weekly_review_day,weekly_review_time,planning_day,planning_time,ai_provider,reasoning_model,background_model,embedding_model,privacy_default").eq("user_id", user.id).maybeSingle(),
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
    console.error("Profile settings save failed", error.code);
    return { status: "error", message: localized(parsed.data.locale, "Não foi possível salvar. Tente novamente.", "Could not save. Try again.") };
  }

  revalidatePath(`/${parsed.data.locale}/app/settings`);
  return { status: "success", message: localized(parsed.data.locale, "Preferências salvas.", "Preferences saved.") };
}
