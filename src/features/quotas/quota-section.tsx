import type { Locale } from "@/lib/preferences";

import { getQuotaStatusCopy, quotaSectionCopy } from "./copy";
import type { QuotaUsage } from "./usage";

const MIB = 1024 * 1024;

/**
 * What the account's ceilings are and how much of each is used —
 * `2O-COST-002`, `-006` and `-007`.
 *
 * ## It states, it does not forecast
 *
 * `2O-COST-005` and `R-2O-18`: no price, no rate, no projection. A "you will
 * hit this in about four days" would be exactly the invention the refusal
 * names, and it is not here. Nor is a percentage bar that implies a trend —
 * every figure is a count against a ceiling, both of which are facts right now.
 *
 * ## `null` is rendered, not swallowed
 *
 * `2O-COST-007` says a failed read renders as a failed read and never as zero.
 * `used === null` prints the unreadable sentence in place of the number, and the
 * ceiling beside it still prints, because the ceiling is a constant and knowing
 * it did not become uncertain when a count failed.
 */
function formatUsed(usage: QuotaUsage, locale: Locale) {
  const format = (value: number) => new Intl.NumberFormat(locale).format(value);
  if (usage.detail === "QUOTA_STORAGE_BYTES") {
    return {
      used: usage.used === null ? null : `${format(Math.round(usage.used / MIB))} MiB`,
      ceiling: `${format(Math.round(usage.ceiling / MIB))} MiB`,
    };
  }
  return {
    used: usage.used === null ? null : format(usage.used),
    ceiling: format(usage.ceiling),
  };
}

export function QuotaSection({
  locale,
  usage,
}: {
  locale: Locale;
  usage: readonly QuotaUsage[];
}) {
  const copy = quotaSectionCopy[locale];

  return (
    <section className="quota-section" aria-labelledby="quota-heading">
      <h2 id="quota-heading">{copy.title}</h2>
      <p className="quota-intro">{copy.intro}</p>
      <ul className="quota-list" aria-label={copy.listLabel}>
        {usage.map((entry) => {
          const status = getQuotaStatusCopy(locale, entry.detail);
          const figures = formatUsed(entry, locale);
          return (
            <li key={entry.detail} className="quota-item">
              <strong>{status.title}</strong>
              {figures.used === null ? (
                <span className="quota-figure unreadable">{copy.unreadable}</span>
              ) : (
                <span className="quota-figure">
                  {figures.used} {copy.ofCeiling} {figures.ceiling}
                </span>
              )}
              <small className="quota-window">{status.window}</small>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
