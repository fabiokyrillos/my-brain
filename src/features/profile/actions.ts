"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { profileSchema } from "./schema";
import { buildSettingsPayload } from "./settings-payload";
import type { ProfileFormState } from "./settings-form";

export async function updateProfile(
  _state: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Revise os campos antes de salvar." };
  }

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { status: "error", message: "Sua sessão expirou. Entre novamente." };
  }

  const payload = buildSettingsPayload(parsed.data);
  const { error } = await supabase.rpc("save_profile_settings", {
    p_profile: payload.profile,
    p_preferences: payload.preferences,
  });
  if (error) {
    console.error("Profile settings save failed", error.code);
    return { status: "error", message: "Não foi possível salvar. Tente novamente." };
  }

  revalidatePath(`/${parsed.data.locale}/app/settings`);
  return { status: "success", message: "Preferências salvas." };
}
