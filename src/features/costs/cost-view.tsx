import { ArrowUpRight, ChevronRight } from "lucide-react";
import Link from "next/link";

import { UniversalStateLine, UniversalStateView } from "@/features/experience/universal-state";
import { QuotaSection } from "@/features/quotas/quota-section";
import type { QuotaUsage } from "@/features/quotas/usage";
import type { AICostSummary, AIUsageRow } from "@/lib/ai/cost-summary";
import { TEXT_MODEL_LABELS, type TextModelId } from "@/lib/ai/model-routing";
import type { Locale } from "@/lib/preferences";

import { getCostsCopy, type CostsCopy } from "./copy";
import { formatRate, formatUsd, usdToNano, withShares, type ShareRow } from "./summary";

export type PriceRow = {
  id: string;
  model: string;
  input_usd_per_million: string | number;
  cached_input_usd_per_million: string | number;
  output_usd_per_million: string | number;
  pricing_version: string;
  source_url: string;
  effective_from: string;
};

/**
 * Custos, below the strip and the title (Editorial calmo, ADR-180).
 *
 * The page answers *quanto gastei?*, so the answer is its subject: this month's
 * figure in the reading face, the two other periods beside their names, and one
 * caption saying what kind of number it is. What makes the spend up follows as
 * rows — a name, its part of the whole, the amount — and everything a reader
 * consults rather than reads (the per-model split, the last calls, the price
 * catalogue) is one closed line each.
 *
 * It renders what it is given and reads nothing: the route loads, this draws.
 */
export function CostsView({
  locale,
  timezone,
  agentName,
  profile,
  summary,
  usage,
  usageUnreadable,
  pricing,
  pricingUnreadable,
  quotaUsage,
}: {
  locale: Locale;
  timezone: string;
  agentName: string;
  profile: string;
  /** `null` is a failed read (`2O-COST-007`), never a zero. */
  summary: AICostSummary | null;
  usage: readonly AIUsageRow[];
  usageUnreadable: boolean;
  pricing: readonly PriceRow[];
  pricingUnreadable: boolean;
  quotaUsage: readonly QuotaUsage[];
}) {
  const copy = getCostsCopy(locale);
  const number = new Intl.NumberFormat(locale);
  const usd = (nanoUsd: number) => formatUsd(nanoUsd, locale);
  const stamp = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short", timeZone: timezone });
  const hasSpend = summary !== null && summary.allTimeCalls > 0;

  return (
    <>
      {summary === null ? (
        /*
         * `2O-COST-007`. A failed read, said as one — not a figure of zero,
         * which would state that nothing has been spent.
         */
        <section aria-label={copy.summaryLabel} className="cost-figure unreadable">
          <p className="cost-figure-value">{copy.unreadable.title}</p>
          <p className="cost-zone">{copy.unreadable.body}</p>
        </section>
      ) : hasSpend ? (
        <section aria-label={copy.summaryLabel} className="cost-figure">
          <p className="cost-figure-period">{copy.periods.month}</p>
          <p className="cost-figure-value">{usd(summary.monthCostNanoUsd)}</p>
          <dl className="cost-figure-others">
            <div>
              <dt>{copy.periods.today}</dt>
              <dd>{usd(summary.todayCostNanoUsd)}</dd>
            </div>
            <div>
              <dt>{copy.periods.allTime}</dt>
              <dd>{usd(summary.allTimeCostNanoUsd)}</dd>
            </div>
          </dl>
          {/* `2O-COST-006`: the zone the periods were computed in, said once. */}
          <p className="cost-zone">{copy.estimate(timezone)}</p>
          {summary.unpricedCalls > 0 ? (
            <p className="cost-warning">{copy.unpriced(summary.unpricedCalls)}</p>
          ) : null}
        </section>
      ) : (
        <UniversalStateView
          actionHref={`/${locale}/app/capture`}
          actionLabel={copy.empty.action}
          className="cost-empty"
          description={copy.empty.body(agentName)}
          locale={locale}
          state="empty"
          title={copy.empty.title}
        />
      )}

      {hasSpend ? (
        <section aria-labelledby="cost-by-operation" className="cost-section">
          <h2 className="cost-section-title" id="cost-by-operation">
            <span>{copy.byOperation}</span>
            <small>{copy.sinceStart}</small>
          </h2>
          <ul className="cost-rows">
            {withShares(summary.byOperation, summary.allTimeCostNanoUsd).map((row) => (
              <BreakdownRow
                caption={`${row.percent} · ${copy.calls(number.format(row.calls))}`}
                key={row.key}
                label={copy.operations[row.key] ?? row.key}
                row={row}
                usd={usd}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {/*
        `2O-COST-002`. The ceilings the database really enforces, beside the
        spend they bound: a limit is the other half of *how much*.
      */}
      <QuotaSection locale={locale} usage={quotaUsage} />

      {hasSpend ? (
        <details className="cost-fold">
          <summary className="cost-fold-summary">
            <span>{copy.byModel}</span>
            <small>{summary.byModel.length}</small>
          </summary>
          <ul className="cost-rows">
            {withShares(summary.byModel, summary.allTimeCostNanoUsd).map((row) => (
              <BreakdownRow
                caption={`${row.percent} · ${copy.calls(number.format(row.calls))} · ${copy.tokensInOut(
                  number.format(row.inputTokens),
                  number.format(row.outputTokens),
                )}`}
                key={row.key}
                label={modelLabel(row.key)}
                row={row}
                usd={usd}
              />
            ))}
          </ul>
        </details>
      ) : null}

      {hasSpend ? (
        <details className="cost-fold recent-costs">
          <summary className="cost-fold-summary">
            <span>{copy.recent.title}</span>
            <small>{usageUnreadable ? null : usage.length}</small>
          </summary>
          {/*
            `2O-COST-007` again. An empty list and an unreadable one look the
            same, and only one of them means "no calls were made".
          */}
          {usageUnreadable ? (
            <UniversalStateLine
              className="cost-read-failed"
              description={copy.recent.unreadable}
              locale={locale}
              state="error_recoverable"
            />
          ) : null}
          <ul className="cost-rows">
            {usage.map((event) => (
              <li className="cost-row" key={event.id}>
                <span className="cost-row-main">
                  <span className="cost-row-label">{copy.operations[event.operation] ?? event.operation}</span>
                  <span className="cost-row-caption">{callCaption(event, copy, stamp, number)}</span>
                </span>
                <span className="cost-row-amount">
                  {event.cost_status === "unpriced" ? copy.recent.unpriced : usd(usdToNano(event.cost_usd))}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <details className="cost-fold pricing-catalog">
        <summary className="cost-fold-summary">
          <span>{copy.pricing.title}</span>
          <small>{pricing[0]?.pricing_version ?? null}</small>
        </summary>
        <p className="cost-fold-note">{copy.pricing.method}</p>
        {pricingUnreadable ? (
          <UniversalStateLine
            className="cost-read-failed"
            description={copy.pricing.unreadable}
            locale={locale}
            state="error_recoverable"
          />
        ) : null}
        {pricing.length ? (
          <>
            <p className="cost-fold-note">{copy.pricing.unit}</p>
            <ul className="cost-rows">
              {pricing.map((price) => (
                <li className="cost-row" key={price.id}>
                  <a className="cost-row-link" href={price.source_url} rel="noreferrer" target="_blank">
                    <span className="cost-row-main">
                      <span className="cost-row-label">{modelLabel(price.model)}</span>
                      <span className="cost-row-caption">
                        {copy.pricing.line(
                          formatRate(price.input_usd_per_million),
                          formatRate(price.cached_input_usd_per_million),
                          formatRate(price.output_usd_per_million),
                        )}
                      </span>
                    </span>
                    <ArrowUpRight aria-hidden="true" size={16} />
                  </a>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </details>

      {/* The one way out of the page: what decides the figure above. */}
      <Link className="cost-profile" href={`/${locale}/app/settings`}>
        <span className="cost-row-label">{copy.profile.label}</span>
        <span className="cost-profile-value">{copy.profile.names[profile] ?? profile}</span>
        <ChevronRight aria-hidden="true" size={16} />
      </Link>
    </>
  );
}

function BreakdownRow({
  row,
  label,
  caption,
  usd,
}: {
  row: ShareRow;
  label: string;
  caption: string;
  usd: (nanoUsd: number) => string;
}) {
  return (
    <li className="cost-row">
      <span className="cost-row-main">
        <span className="cost-row-label">{label}</span>
        <span className="cost-row-caption">{caption}</span>
      </span>
      <span className="cost-row-amount">{usd(row.costNanoUsd)}</span>
      {/* The row's part of the whole, drawn; the caption says it in figures. */}
      <span aria-hidden="true" className="cost-row-rule">
        <span style={{ width: `${row.width}%` }} />
      </span>
    </li>
  );
}

function modelLabel(model: string) {
  return model in TEXT_MODEL_LABELS ? TEXT_MODEL_LABELS[model as TextModelId] : model;
}

function callCaption(
  event: AIUsageRow,
  copy: CostsCopy,
  stamp: Intl.DateTimeFormat,
  number: Intl.NumberFormat,
): string {
  const parts = [
    stamp.format(new Date(event.created_at)),
    modelLabel(event.model),
    copy.recent.tokens(number.format(event.input_tokens + event.output_tokens)),
  ];
  if (event.cached_input_tokens > 0) parts.push(copy.recent.cached(number.format(event.cached_input_tokens)));
  return parts.join(" · ");
}
