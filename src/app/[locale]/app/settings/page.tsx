import { redirect } from "next/navigation";
import { SettingsForm } from "@/features/profile/settings-form";
import { updateProfile } from "@/features/profile/actions";
import { createClient } from "@/lib/supabase/server";
import { isLocale } from "@/lib/preferences";

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : "pt-BR";
  const pt = locale === "pt-BR";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const [{ data: profile }, { data: preferences }] = await Promise.all([
    supabase.from("profiles").select("display_name,locale,timezone").eq("user_id", user.id).maybeSingle(),
    supabase.from("agent_preferences").select("agent_name,follow_up_intensity,daily_review_time,personality,tone,autonomy_level,weekly_review_day,weekly_review_time,planning_day,planning_time,quiet_start,quiet_end,important_reminder_override,max_followups_per_day,response_detail,ai_provider,ai_model,privacy_default").eq("user_id", user.id).maybeSingle(),
  ]);

  return (
    <div className="settings-page">
      <p className="eyebrow">{pt ? "CONFIGURAÇÕES DO AGENTE" : "AGENT SETTINGS"}</p>
      <h1>{pt ? "Seu Brain, do seu jeito" : "Your Brain, your way"}</h1>
      <p>{pt
        ? "Ajuste como o agente fala, acompanha e respeita seu tempo."
        : "Tune how the agent communicates, follows up, and respects your time."}</p>

      <SettingsForm
        action={updateProfile}
        locale={locale}
        values={{
          displayName: profile?.display_name ?? String(user.user_metadata.display_name ?? ""),
          agentName: preferences?.agent_name ?? "Brain",
          locale: isLocale(profile?.locale) ? profile.locale : locale,
          timezone: profile?.timezone ?? "America/Sao_Paulo",
          followUpIntensity: preferences?.follow_up_intensity ?? "balanced",
          dailyReviewTime: String(preferences?.daily_review_time ?? "22:00").slice(0, 5),
          personality: preferences?.personality ?? "proactive",
          tone: preferences?.tone ?? "direct",
          autonomyLevel: preferences?.autonomy_level ?? "autonomous",
          weeklyReviewDay: preferences?.weekly_review_day ?? 5,
          weeklyReviewTime: String(preferences?.weekly_review_time ?? "19:00").slice(0, 5),
          planningDay: preferences?.planning_day ?? 1,
          planningTime: String(preferences?.planning_time ?? "08:00").slice(0, 5),
          quietStart: String(preferences?.quiet_start ?? "22:30").slice(0, 5),
          quietEnd: String(preferences?.quiet_end ?? "07:00").slice(0, 5),
          importantReminderOverride: preferences?.important_reminder_override ?? true,
          maxFollowupsPerDay: preferences?.max_followups_per_day ?? 3,
          responseDetail: preferences?.response_detail ?? "short",
          aiProvider: preferences?.ai_provider ?? "openai",
          aiModel: preferences?.ai_model ?? "gpt-5.6-luna",
          privacyDefault: preferences?.privacy_default ?? "normal",
        }}
      />
    </div>
  );
}
