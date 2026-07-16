"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { profileSchema } from "./schema";
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { status: "error", message: "Sua sessão expirou. Entre novamente." };
  }

  const input = parsed.data;
  const [profileResult, preferencesResult] = await Promise.all([
    supabase.from("profiles").upsert({
      user_id: user.id,
      display_name: input.displayName,
      locale: input.locale,
      timezone: input.timezone,
    }, { onConflict: "user_id" }),
    supabase.from("agent_preferences").upsert({
      user_id: user.id,
      agent_name: input.agentName,
      follow_up_intensity: input.followUpIntensity,
      daily_review_time: input.dailyReviewTime,
      personality: input.personality,
      tone: input.tone,
      autonomy_level: input.autonomyLevel,
      weekly_review_day: input.weeklyReviewDay,
      weekly_review_time: input.weeklyReviewTime,
      planning_day: input.planningDay,
      planning_time: input.planningTime,
      quiet_start: input.quietStart,
      quiet_end: input.quietEnd,
      important_reminder_override: input.importantReminderOverride,
      max_followups_per_day: input.maxFollowupsPerDay,
      response_detail: input.responseDetail,
      ai_provider: input.aiProvider,
      ai_model: input.aiModel,
      privacy_default: input.privacyDefault,
    }, { onConflict: "user_id" }),
  ]);

  if (profileResult.error || preferencesResult.error) {
    return { status: "error", message: "Não foi possível salvar. Tente novamente." };
  }

  revalidatePath(`/${input.locale}/app/settings`);
  return { status: "success", message: "Preferências salvas." };
}
