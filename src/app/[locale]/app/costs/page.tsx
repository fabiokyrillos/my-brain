import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui";
import { getCostsCopy } from "@/features/costs/copy";
import { CostsView, type PriceRow } from "@/features/costs/cost-view";
import { getAgentName } from "@/features/profile/agent-identity";
import { loadQuotaUsage } from "@/features/quotas/usage";
import { DataAiTabs } from "@/features/transparency/data-ai-tabs";
import { parseAICostSummary, type AIUsageRow } from "@/lib/ai/cost-summary";
import { requireUser } from "@/lib/auth/require-user";
import { isLocale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";

/**
 * Custos — the second view of Dados e IA.
 *
 * ## Editorial calmo (ADR-180)
 *
 * The route loads and `CostsView` draws. The page opens the way Histórico does —
 * the strip that says where it lives, then its name — and then answers the one
 * question it exists for: this month's figure, in the reading face. What used to
 * stand between the reader and that number (an eyebrow, a description, a badge,
 * a profile card, four metric cards, a legend) is gone or folded.
 *
 * No query changed: the same four reads, the same RPC, the same quota loader.
 */
export default async function CostsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale = rawLocale;
  const { supabase, user } = await requireUser(locale);

  const agentName = await getAgentName();

  const profileResult = await supabase
    .from("profiles")
    .select("timezone")
    .eq("user_id", user.id)
    .maybeSingle();
  const profile = requireSupabaseData(profileResult, "load cost profile");
  const timezone = profile?.timezone ?? "America/Sao_Paulo";
  const [preferencesResult, summaryResult, usageResult, pricingResult] = await Promise.all([
    supabase
      .from("agent_preferences")
      .select("ai_profile")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.rpc("get_ai_cost_summary", { p_timezone: timezone }),
    supabase
      .from("ai_usage_events")
      .select(
        "id,operation,model,input_tokens,cached_input_tokens,output_tokens,reasoning_tokens,cost_usd,cost_status,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("ai_model_pricing")
      .select(
        "id,model,input_usd_per_million,cached_input_usd_per_million,output_usd_per_million,pricing_version,source_url,effective_from",
      )
      .eq("provider", "openai")
      .eq("service_tier", "standard")
      .is("effective_until", null)
      .order("input_usd_per_million", { ascending: false }),
  ]);
  const preferences = requireSupabaseData(preferencesResult, "load cost preferences");
  /*
   * `2O-COST-007` — *"a cost read that fails renders as a failed read, never as
   * zero"*.
   *
   * This was `requireSupabaseData`, which throws and takes the whole route to
   * the error boundary. That never rendered zero, so the requirement's worst
   * outcome was already avoided — but it did not render a *failed read* either:
   * the page vanished, including the profile, the limits and the pricing table,
   * none of which had failed.
   *
   * `null` now means the aggregate could not be read, and it is a value the
   * markup handles rather than an exception the page dies of. The other two
   * reads keep `?? []` because an empty list of recent calls and an empty
   * catalogue are both **legible as empty**, and their failure states are
   * rendered from their own results by the view.
   */
  const summary = summaryResult.error ? null : parseAICostSummary(summaryResult.data);
  const usage = (usageResult.error ? [] : usageResult.data ?? []) as AIUsageRow[];
  const pricing = (pricingResult.error ? [] : pricingResult.data ?? []) as PriceRow[];
  const quotaUsage = await loadQuotaUsage(supabase, user.id, new Date());

  return (
    <div className="content-page cost-page">
      {/* The strip first, then the name — the same opening as Histórico. */}
      <DataAiTabs active="costs" locale={locale} />

      <PageHeader size="compact" title={getCostsCopy(locale).title} />

      <CostsView
        agentName={agentName}
        locale={locale}
        pricing={pricing}
        pricingUnreadable={Boolean(pricingResult.error)}
        profile={preferences?.ai_profile ?? "quality"}
        quotaUsage={quotaUsage}
        summary={summary}
        timezone={timezone}
        usage={usage}
        usageUnreadable={Boolean(usageResult.error)}
      />
    </div>
  );
}
