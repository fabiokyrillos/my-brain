import type { SupabaseClient } from "@supabase/supabase-js";

import { loadAutomationStatus } from "@/features/agent/automation-data";
import { loadCredentialMetadata } from "@/features/byok/credential-view";
import { loadSettingsFormValues } from "@/features/profile/settings-view";
import type { Database } from "@/lib/supabase/database.types";
import type { Locale } from "@/lib/preferences";

import { settingsSummaries, type SettingsSummaries } from "./summary";

/** Life Brain E.1: the three reads behind the list of groups, started together. */
export async function loadSettingsSummaries(
  supabase: SupabaseClient<Database>,
  userId: string,
  locale: Locale,
): Promise<SettingsSummaries> {
  const [values, automation, credential] = await Promise.all([
    loadSettingsFormValues(supabase, userId),
    loadAutomationStatus(supabase),
    loadCredentialMetadata(supabase, userId),
  ]);
  return settingsSummaries(locale, { values, automation, credential: credential.status });
}
