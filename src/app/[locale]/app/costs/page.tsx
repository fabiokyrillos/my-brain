import Link from "next/link";
import { notFound } from "next/navigation";
import { UniversalStateLine, UniversalStateView } from "@/features/experience/universal-state";
import {
  AlertTriangle,
  ArrowUpRight,
  Coins,
  Gauge,
  Layers3,
  ReceiptText,
} from "lucide-react";
import { parseAICostSummary, type AIUsageRow } from "@/lib/ai/cost-summary";
import { TEXT_MODEL_LABELS, type TextModelId } from "@/lib/ai/model-routing";
import { getTransparencyCopy } from "@/features/transparency/copy";
import { DataAiTabs } from "@/features/transparency/data-ai-tabs";
import { requireUser } from "@/lib/auth/require-user";
import { isLocale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";
import { getAgentName } from "@/features/profile/agent-identity";
import { QuotaSection } from "@/features/quotas/quota-section";
import { loadQuotaUsage } from "@/features/quotas/usage";

type PriceRow = {
  id: string;
  model: string;
  input_usd_per_million: string | number;
  cached_input_usd_per_million: string | number;
  output_usd_per_million: string | number;
  pricing_version: string;
  source_url: string;
  effective_from: string;
};

const operationLabels = {
  capture_extraction: ["Captura e organização", "Capture and organization"],
  semantic_search: ["Busca semântica", "Semantic search"],
  chat: ["Chat principal", "Main chat"],
  review: ["Revisões e resumos", "Reviews and summaries"],
  file_analysis: ["Análise de arquivos", "File analysis"],
  advanced_reasoning: ["Raciocínio avançado", "Advanced reasoning"],
  background: ["Rotinas internas", "Background routines"],
  task_command: ["Comandos de tarefa", "Task commands"],
} as const;

const profileLabels = {
  quality: ["Qualidade máxima", "Maximum quality"],
  balanced: ["Equilibrado", "Balanced"],
  economy: ["Econômico", "Economy"],
  custom: ["Personalizado", "Custom"],
} as const;

function formatUsd(nanoUsd: number, locale: string) {
  const value = nanoUsd / 1_000_000_000;
  if (value > 0 && value < 0.0001) return "< US$ 0,0001";
  return new Intl.NumberFormat(locale === "pt-BR" ? "pt-BR" : "en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value < 0.01 ? 4 : 2,
    maximumFractionDigits: value < 0.01 ? 6 : 2,
  }).format(value);
}

function modelLabel(model: string) {
  return model in TEXT_MODEL_LABELS
    ? TEXT_MODEL_LABELS[model as TextModelId]
    : model;
}

function operationLabel(operation: string, pt: boolean) {
  const labels = operationLabels[operation as keyof typeof operationLabels];
  return labels ? labels[pt ? 0 : 1] : operation;
}

function modelClass(model: string) {
  if (model.includes("terra")) return "terra";
  if (model.includes("luna")) return "luna";
  if (model.includes("embedding")) return "embedding";
  return "mini";
}

export default async function CostsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale = rawLocale;
  const pt = locale === "pt-BR";
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
   * rendered from their own results below.
   */
  const summary = summaryResult.error ? null : parseAICostSummary(summaryResult.data);
  const usage = (usageResult.error ? [] : usageResult.data ?? []) as AIUsageRow[];
  const pricing = (pricingResult.error ? [] : pricingResult.data ?? []) as PriceRow[];
  const usageUnreadable = Boolean(usageResult.error);
  const pricingUnreadable = Boolean(pricingResult.error);
  const totalBreakdown = Math.max(summary?.allTimeCostNanoUsd ?? 0, 1);
  const quotaUsage = await loadQuotaUsage(supabase, user.id, new Date());
  const activeProfile = (preferences?.ai_profile ??
    "quality") as keyof typeof profileLabels;

  return (
    <div className="cost-page">
      <header className="cost-hero">
        <div>
          {/* The section this surface belongs to, said the same way on all
              three — see the history page on why the eyebrow moved. */}
          <p className="eyebrow">{getTransparencyCopy(locale).title.toUpperCase()}</p>
          <h1>{pt ? "Custos de IA" : "AI costs"}</h1>
          <p>
            {pt
              ? "Cada chamada, modelo e token com o preço aplicado preservado no histórico."
              : "Every call, model, and token with its applied price preserved in history."}
          </p>
        </div>
        <div className="cost-hero-actions">
          <span className="calculated-badge">
            <ReceiptText size={15} />
            {pt
              ? "Calculado pelos tokens da API"
              : "Calculated from API tokens"}
          </span>
          <Link href={`/${locale}/app/settings`} className="cost-settings-link">
            {pt ? "Ajustar modelos" : "Adjust models"}
            <ArrowUpRight size={15} />
          </Link>
        </div>
      </header>

      <DataAiTabs active="costs" locale={locale} />

      <section
        className="cost-profile-strip"
        aria-label={pt ? "Perfil ativo" : "Active profile"}
      >
        <span>{pt ? "PERFIL ATIVO" : "ACTIVE PROFILE"}</span>
        <strong>
          {profileLabels[activeProfile]?.[pt ? 0 : 1] ?? activeProfile}
        </strong>
        <p>
          {pt
            ? "Terra para conversa e síntese; modelos econômicos nas rotinas previsíveis."
            : "Terra for conversation and synthesis; efficient models for predictable routines."}
        </p>
      </section>

      {/*
        `2O-COST-006`. Every figure below carries the period it covers — Hoje,
        Este mês, Desde o início — and this is the zone those periods were
        computed in, which was the half that was missing: the timezone was
        passed to `get_ai_cost_summary` and never said out loud, so "Hoje" was a
        day the reader could not identify. The quota window below is **UTC** and
        says so separately, because the two really are different windows.
      */}
      <p className="cost-zone">
        {pt
          ? `Períodos calculados no fuso da sua conta (${timezone}).`
          : `Periods computed in your account's zone (${timezone}).`}
      </p>

      {summary === null ? (
        /*
         * `2O-COST-007`. A failed read, said as one. Not four zeroed cards —
         * which would state that nothing has been spent, a claim this page
         * cannot make when it could not read the ledger.
         */
        <section className="cost-metrics unreadable" aria-label={pt ? "Resumo de custos" : "Cost summary"}>
          <article className="primary">
            <span>{pt ? "Resumo indisponível" : "Summary unavailable"}</span>
            <strong>{pt ? "Não foi possível ler" : "Could not be read"}</strong>
            <small>
              {pt
                ? "O total não foi calculado. Isto não significa custo zero."
                : "The total was not computed. This does not mean zero cost."}
            </small>
          </article>
        </section>
      ) : (
      <section
        className="cost-metrics"
        aria-label={pt ? "Resumo de custos" : "Cost summary"}
      >
        <article>
          <span>{pt ? "Hoje" : "Today"}</span>
          <strong>{formatUsd(summary.todayCostNanoUsd, locale)}</strong>
          <small>USD</small>
        </article>
        <article className="primary">
          <span>{pt ? "Este mês" : "This month"}</span>
          <strong>{formatUsd(summary.monthCostNanoUsd, locale)}</strong>
          <small>
            {summary.monthCalls} {pt ? "chamadas" : "calls"}
          </small>
        </article>
        <article>
          <span>{pt ? "Desde o início" : "All time"}</span>
          <strong>{formatUsd(summary.allTimeCostNanoUsd, locale)}</strong>
          <small>
            {summary.allTimeCalls} {pt ? "chamadas" : "calls"}
          </small>
        </article>
        <article>
          <span>{pt ? "Tokens no mês" : "Tokens this month"}</span>
          <strong>
            {new Intl.NumberFormat(locale).format(summary.monthTokens)}
          </strong>
          <small>{pt ? "entrada + saída" : "input + output"}</small>
        </article>
      </section>
      )}

      {/*
        `2O-COST-002`. The ceilings the database really enforces, beside the
        spend they bound. On Custos rather than in Ajustes because this is where
        an owner already comes to ask *how much*, and a limit is the other half
        of that question.
      */}
      <QuotaSection locale={locale} usage={quotaUsage} />

      {summary !== null && summary.unpricedCalls > 0 && (
        <div className="cost-warning">
          <AlertTriangle size={17} />
          <div>
            <strong>
              {pt ? "Há chamadas sem preço" : "Some calls are unpriced"}
            </strong>
            <p>
              {pt
                ? `${summary.unpricedCalls} chamada(s) usaram um modelo ainda não cadastrado no catálogo. Os tokens foram mantidos e o total não foi inventado.`
                : `${summary.unpricedCalls} call(s) used a model not yet in the catalog. Tokens were kept and no cost was invented.`}
            </p>
          </div>
        </div>
      )}

      {summary === null ? null : summary.allTimeCalls === 0 ? (
        <UniversalStateView
          actionHref={`/${locale}/app/capture`}
          actionLabel={pt ? "Fazer uma captura" : "Capture something"}
          className="cost-empty"
          description={pt
            ? `Quando o ${agentName} interpretar uma captura, responder no chat ou analisar um arquivo, o consumo aparecerá aqui.`
            : `When ${agentName} interprets a capture, answers in chat, or analyzes a file, usage will appear here.`}
          locale={locale}
          state="empty"
          title={pt ? "Nenhum custo registrado ainda" : "No recorded cost yet"}
        />
      ) : (
        <>
          <section
            className="spend-trace"
            aria-label={
              pt
                ? "Distribuição de custo por modelo"
                : "Cost distribution by model"
            }
          >
            <header>
              <div>
                <span>{pt ? "RASTRO DO GASTO" : "SPEND TRACE"}</span>
                <h2>{pt ? "Onde o custo aconteceu" : "Where cost happened"}</h2>
              </div>
              <small>{pt ? "Histórico completo" : "All-time history"}</small>
            </header>
            <div className="trace-bar">
              {summary.byModel
                .filter((item) => item.costNanoUsd > 0)
                .map((item) => (
                  <span
                    key={item.key}
                    className={modelClass(item.key)}
                    style={{
                      width: `${Math.max((item.costNanoUsd / totalBreakdown) * 100, 1)}%`,
                    }}
                    title={`${modelLabel(item.key)}: ${formatUsd(item.costNanoUsd, locale)}`}
                  />
                ))}
            </div>
            <div className="trace-legend">
              {summary.byModel.map((item) => (
                <div key={item.key}>
                  <i className={modelClass(item.key)} />
                  <span>{modelLabel(item.key)}</span>
                  <strong>{formatUsd(item.costNanoUsd, locale)}</strong>
                </div>
              ))}
            </div>
          </section>

          <div className="cost-breakdown-grid">
            <section className="cost-panel">
              <header>
                <Gauge size={18} />
                <div>
                  <span>{pt ? "POR FUNÇÃO" : "BY FUNCTION"}</span>
                  <h2>{pt ? "O que consumiu" : "What consumed"}</h2>
                </div>
              </header>
              <div className="cost-ranking">
                {summary.byOperation.map((item, index) => (
                  <article key={item.key}>
                    <span className="rank">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <strong>{operationLabel(item.key, pt)}</strong>
                      <small>
                        {item.calls} {pt ? "chamadas" : "calls"} ·{" "}
                        {new Intl.NumberFormat(locale).format(
                          item.inputTokens + item.outputTokens,
                        )}{" "}
                        tokens
                      </small>
                    </div>
                    <b>{formatUsd(item.costNanoUsd, locale)}</b>
                  </article>
                ))}
              </div>
            </section>
            <section className="cost-panel">
              <header>
                <Layers3 size={18} />
                <div>
                  <span>{pt ? "POR MODELO" : "BY MODEL"}</span>
                  <h2>{pt ? "Qualidade x volume" : "Quality vs. volume"}</h2>
                </div>
              </header>
              <div className="cost-ranking">
                {summary.byModel.map((item, index) => (
                  <article key={item.key}>
                    <span className={`model-dot ${modelClass(item.key)}`}>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <strong>{modelLabel(item.key)}</strong>
                      <small>
                        {item.calls} {pt ? "chamadas" : "calls"} ·{" "}
                        {new Intl.NumberFormat(locale).format(item.inputTokens)}{" "}
                        in /{" "}
                        {new Intl.NumberFormat(locale).format(
                          item.outputTokens,
                        )}{" "}
                        out
                      </small>
                    </div>
                    <b>{formatUsd(item.costNanoUsd, locale)}</b>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <section className="recent-costs">
            <header>
              <div>
                <span>{pt ? "ÚLTIMAS CHAMADAS" : "RECENT CALLS"}</span>
                <h2>{pt ? "Detalhe do consumo" : "Usage detail"}</h2>
              </div>
              <small>{pt ? "As 20 mais recentes" : "Most recent 20"}</small>
            </header>
            {/*
              `2O-COST-007` again, one section down. An empty table and an
              unreadable one look identical, and only one of them means "no calls
              were made" — so the failed read says so rather than letting the
              absence of rows do the talking.
            */}
            {usageUnreadable && (
              /* `2O-RECOVER-001`. A read that failed is `error_recoverable`,
                 not a quieter kind of empty — and the vocabulary's own safety
                 line ("nothing was changed") is exactly the reassurance this
                 sentence was written by hand to give. */
              <UniversalStateLine
                className="cost-read-failed"
                description={pt
                  ? "Não foi possível ler as últimas chamadas. A lista abaixo está vazia por falha de leitura, não por ausência de consumo."
                  : "Recent calls could not be read. The list below is empty because the read failed, not because nothing was used."}
                locale={locale}
                state="error_recoverable"
              />
            )}
            <div className="cost-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{pt ? "Quando" : "When"}</th>
                    <th>{pt ? "Função" : "Function"}</th>
                    <th>{pt ? "Modelo" : "Model"}</th>
                    <th>{pt ? "Tokens" : "Tokens"}</th>
                    <th>Cache</th>
                    <th>{pt ? "Custo" : "Cost"}</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.map((event) => (
                    <tr key={event.id}>
                      <td>
                        {new Intl.DateTimeFormat(locale, {
                          dateStyle: "short",
                          timeStyle: "short",
                          timeZone: timezone,
                        }).format(new Date(event.created_at))}
                      </td>
                      <td>{operationLabel(event.operation, pt)}</td>
                      <td>
                        <span
                          className={`table-model ${modelClass(event.model)}`}
                        >
                          {modelLabel(event.model)}
                        </span>
                      </td>
                      <td>
                        {new Intl.NumberFormat(locale).format(
                          event.input_tokens + event.output_tokens,
                        )}
                      </td>
                      <td>
                        {new Intl.NumberFormat(locale).format(
                          event.cached_input_tokens,
                        )}
                      </td>
                      <td>
                        {event.cost_status === "unpriced"
                          ? pt
                            ? "Sem preço"
                            : "Unpriced"
                          : formatUsd(
                              Math.round(
                                Number(event.cost_usd) * 1_000_000_000,
                              ),
                              locale,
                            )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <section className="pricing-catalog">
        <header>
          <div>
            <span>{pt ? "CATÁLOGO APLICADO" : "APPLIED CATALOG"}</span>
            <h2>
              {pt
                ? "Preço padrão por 1 milhão de tokens"
                : "Standard price per 1 million tokens"}
            </h2>
          </div>
          <small>{pricing[0]?.pricing_version ?? "—"}</small>
        </header>
        {pricingUnreadable && (
          <UniversalStateLine
            className="cost-read-failed"
            description={pt
              ? "Não foi possível ler o catálogo de preços. Nenhum preço foi inventado para preencher a lacuna."
              : "The pricing catalog could not be read. No price was invented to fill the gap."}
            locale={locale}
            state="error_recoverable"
          />
        )}
        <div className="pricing-grid">
          {pricing.map((price) => (
            <a
              key={price.id}
              href={price.source_url}
              target="_blank"
              rel="noreferrer"
            >
              <strong>{modelLabel(price.model)}</strong>
              <span>
                <b>
                  $
                  {Number(price.input_usd_per_million)
                    .toFixed(3)
                    .replace(/0+$/, "")
                    .replace(/\.$/, "")}
                </b>{" "}
                in
              </span>
              <span>
                <b>
                  $
                  {Number(price.cached_input_usd_per_million)
                    .toFixed(3)
                    .replace(/0+$/, "")
                    .replace(/\.$/, "")}
                </b>{" "}
                cache
              </span>
              <span>
                <b>
                  $
                  {Number(price.output_usd_per_million)
                    .toFixed(3)
                    .replace(/0+$/, "")
                    .replace(/\.$/, "")}
                </b>{" "}
                out
              </span>
              <ArrowUpRight size={14} />
            </a>
          ))}
        </div>
      </section>

      <footer className="cost-footnote">
        <ReceiptText size={18} />
        <p>
          <strong>
            {pt ? "O que este número significa:" : "What this number means:"}
          </strong>{" "}
          {pt
            ? "o custo é calculado com os tokens retornados pela API e o preço padrão congelado em cada chamada. A fatura da OpenAI continua sendo a autoridade contábil para créditos, impostos, priority processing, cache writes e outros ajustes da organização."
            : "cost is calculated from API-returned tokens and the standard price snapshotted on each call. The OpenAI invoice remains the accounting authority for credits, taxes, priority processing, cache writes, and other organization adjustments."}
        </p>
      </footer>
    </div>
  );
}
