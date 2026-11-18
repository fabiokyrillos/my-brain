import Link from "next/link";

import { DELETION_RETAINED_FIELDS, RETENTION_SCHEDULE, hasUnenforcedWindow, retentionLine } from "@/features/legal/retention";
import { getNavigationHref } from "@/features/shell/capabilities";
import type { Locale } from "@/lib/preferences";

import { getSettingsCopy } from "@/features/settings/copy";
import { SettingFact } from "@/features/settings/setting-fact";

import { ExportControl } from "./export-control";
import { GlobalSignOut } from "./global-sign-out";
import { PRIVACY_CATEGORIES, WITHHELD_TABLES } from "./enumeration";
import { getPrivacyCopy } from "./copy";
import type { PrivacyCensus } from "./census";

/**
 * Privacidade e dados, inside Ajustes — `2O-PRIVACY-001` … `-010`.
 *
 * ## Counts only, and that is what makes T-4 unreachable
 *
 * `2O-PRIVACY-003` allows a category to *"state how many rows exist without
 * revealing content"*, and `ProtectedContent` governs anything rendered beyond
 * a count. Nothing here is rendered beyond a count: the census sends
 * `head: true` requests, so no row body ever crosses the wire, and this
 * component has no governed string to leak even by accident. The threat model's
 * *"3 memories: …"* preview cannot be written here without first changing the
 * reader — which is the point of putting the restriction in the query rather
 * than in the markup.
 *
 * ## An unreadable category says so
 *
 * `2O-PRIVACY-010` and the owner's decision for this slice both forbid turning
 * a refused read into a zero. A category that could not be counted renders the
 * word, not the number, and the section explains the distinction once rather
 * than per row.
 *
 * ## The withheld tables are shown as withheld
 *
 * Three tables in the deletion enumeration are not readable by the account.
 * Listing them with their reason is what keeps `2O-PRIVACY-002`'s claim honest:
 * the categories cover the deletion enumeration, and the three that are not
 * counted are named rather than quietly dropped.
 *
 * ## Deletion is reached, never performed here — and from one door
 *
 * `2O-PRIVACY-008` requires deletion to keep every property it has, so it is a
 * link to the page that asks properly. This component used to carry that link
 * as well as `AccountDataSection`, which closes the same group, so the page
 * offered the way out twice. Since the Editorial calmo pass (ADR-180) there is
 * one: `AccountDataSection`'s last row, the last thing on the page, in the risk
 * tone.
 */
export function PrivacySection({
  locale,
  census,
  email,
}: {
  locale: Locale;
  census: PrivacyCensus;
  email: string | null;
}) {
  const copy = getPrivacyCopy(locale);
  const settings = getSettingsCopy(locale);
  const unenforced = hasUnenforcedWindow();

  return (
    /*
      Editorial calmo (ADR-180): three rows, in the order a reader comes for
      them — take a copy, see what is stored, end the sessions — each with its
      current state and one verb. The census (twelve counts) and the retention
      schedule are still here in full, behind the row that summarises them.
    */
    <section className="data-ai-section privacy-section" aria-labelledby="privacy-heading">
      <h2 id="privacy-heading">{copy.title}</h2>

      <div className="settings-rows">
        <div className="settings-row privacy-row">
          <div className="settings-row-copy">
            <h3 className="settings-row-label">{copy.export.heading}</h3>
            <small>{copy.export.lead}</small>
          </div>
          <ExportControl locale={locale} />
        </div>

        <SettingFact
          closeVerb={settings.close}
          heading="h3"
          label={copy.census.heading}
          value={settings.rows.stored(census.countedRows, PRIVACY_CATEGORIES.length)}
          verb={settings.view}
        >
          <p className="data-ai-intro">{copy.intro}</p>
          <p className="data-ai-intro">{copy.census.lead}</p>
          <ul className="privacy-census">
            {PRIVACY_CATEGORIES.map((category) => {
              const entry = census.categories.find((candidate) => candidate.key === category.key);
              return (
                <li key={category.key}>
                  <strong>{copy.census.categories[category.key]}</strong>
                  <span>
                    {entry?.status === "counted"
                      ? copy.census.rowsLabel(entry.rows)
                      : copy.census.unreadable}
                  </span>
                  {category.surface ? (
                    <Link href={getNavigationHref(locale, category.surface)}>
                      {copy.census.seeSurface}
                    </Link>
                  ) : (
                    <span className="privacy-census-nosurface">{copy.census.noSurface}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </SettingFact>
        {/* Outside the row on purpose: a category that could not be read is said
            on the page, not behind a closed disclosure (`2O-PRIVACY-010`). */}
        {census.unreadableCategories > 0 ? (
          <p role="status" className="privacy-unreadable">
            {copy.census.unreadableExplained}
          </p>
        ) : null}

        <div className="settings-row privacy-row">
          <div className="settings-row-copy">
            <h3 className="settings-row-label">{copy.sessions.heading}</h3>
            <span className="privacy-signed-in">{email === null ? copy.sessions.signedInUnnamed : copy.sessions.signedInAs(email)}</span>
            <small>{copy.sessions.lead}</small>
          </div>
          <GlobalSignOut locale={locale} />
        </div>
      </div>

      {/*
        Life Brain E.1 (ADR-169): what is withheld from the census and the
        retention schedule (`2O-PRIVACY-007`), behind one disclosure. Both
        still render on this page, in full.
      */}
      <details className="settings-how privacy-details">
        <summary>{settings.howItWorks.stored}</summary>
        <h3>{copy.census.withheldHeading}</h3>
        <p className="data-ai-intro">{copy.census.withheldLead}</p>
        <ul className="privacy-withheld">
          {WITHHELD_TABLES.map((entry) => (
            <li key={entry.table}>
              <code>{entry.table}</code> — {copy.census.withheldReasons[entry.reason]}
            </li>
          ))}
        </ul>

        {/*
          `2O-PRIVACY-007`. The retention posture the product already publishes,
          reachable from the preferences centre for the first time: `retention.ts`
          has been in the tree since SH.6 with **no consumer at all**, which is the
          producer-with-no-consumer shape this repository has paid for twice.

          Every line is generated by `retentionLine` from `RETENTION_SCHEDULE`, so
          the copy cannot drift from the schedule, and the honesty gate is
          `hasUnenforcedWindow()` — where no sweep runs, the page says the period
          is the policy rather than the practice. **No sweep is scheduled here**:
          `R-2O-22` puts that in an operator script, and scheduling is
          authorization.
        */}
        <h3>{copy.retention.heading}</h3>
        <p className="data-ai-intro">{copy.retention.lead}</p>
        {unenforced ? (
          <p role="note" className="privacy-unenforced">
            {copy.retention.unenforced}
          </p>
        ) : null}
        <ul className="privacy-retention">
          {RETENTION_SCHEDULE.map((entry) => (
            <li key={entry.id}>{retentionLine(locale, entry)}</li>
          ))}
        </ul>
        <p className="privacy-retained-fields">
          {copy.retention.deletionKeeps}: {DELETION_RETAINED_FIELDS.join(", ")}
        </p>
      </details>
    </section>
  );
}
