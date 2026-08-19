import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { requireSupabaseData } from "@/lib/supabase/result";
import type { SettingsFormValues } from "./settings-contracts";
import { resolveSettingsFormValues } from "./settings-resolve";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * The read. The **resolution** — the defaults, the bounds, the model
 * validation — moved to `settings-resolve.ts` in slice 2P.5, because
 * `updateProfile` now needs the identical answer.
 *
 * A section's save writes the columns that section owns and passes every other
 * column through from the stored row. If the renderer and the writer resolved a
 * missing `agent_preferences` row differently by even one value, saving Geral
 * would rewrite an Assistente column to something the reader never saw. One
 * function, two callers, one answer.
 */
export async function loadSettingsFormValues(supabase: SupabaseClient, userId: string): Promise<SettingsFormValues> {
  const [profileResult, preferencesResult] = await Promise.all([
    supabase.from("profiles").select("timezone").eq("user_id", userId).maybeSingle(),
    supabase.from("agent_preferences").select("agent_name,personality,tone,quiet_start,quiet_end,important_reminder_override,max_followups_per_day,response_detail,daily_review_time,weekly_review_time,weekly_review_day,ai_profile,chat_model,extraction_model,review_model,file_model").eq("user_id", userId).maybeSingle(),
  ]);
  const profile = requireSupabaseData(profileResult, "load operational profile settings");
  const preferences = requireSupabaseData(preferencesResult, "load operational agent settings");

  return resolveSettingsFormValues(profile, preferences);
}
