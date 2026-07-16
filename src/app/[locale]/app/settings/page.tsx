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
    supabase.from("agent_preferences").select("agent_name,follow_up_intensity,daily_review_time").eq("user_id", user.id).maybeSingle(),
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
        }}
      />
    </div>
  );
}
