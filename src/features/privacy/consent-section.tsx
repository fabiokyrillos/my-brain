import Link from "next/link";

import { legalDocumentPath } from "@/features/legal/versions";
import type { NotificationConsentState } from "@/features/product-analytics/contracts";
import type { Locale } from "@/lib/preferences";

import { ConsentRevocation } from "./consent-revocation";
import type { ConsentRecord } from "./consent-record";
import { getPrivacyCopy } from "./copy";

/**
 * The consent record — `2O-CONSENT-001` … `-005`.
 *
 * ## `2O-CONSENT-001` — which document, at which version, and when
 *
 * `policy_acceptances` has had readers since SH.5 and **no display**. Slice
 * 2O.3's `account-centre/contracts.ts` recorded the gap and reserved the place
 * rather than filling it early; this is that place, and closing it is what lets
 * `2O-PREF-002`'s remainder close honestly — Ajustes now reaches the account's
 * own acceptance history and not only the documents.
 *
 * ## `2O-CONSENT-003` — the text in one step
 *
 * Each row links to the document at its public route, in the current locale.
 * The documents are public (`SH-LEGAL-001`), so the link works with or without
 * a session, and the two locales are the two the product has.
 *
 * ## `2O-CONSENT-005` — nothing here is implied, pre-ticked or bundled
 *
 * This surface **records**; it never collects. There is no checkbox on it. The
 * only control is a revocation, and a revocation cannot be a hidden acceptance.
 *
 * ## An unreadable record is not an empty one
 *
 * Rendering *"no acceptance recorded"* to an account whose table simply could
 * not be read is a false statement about a legal fact, so `unreadable` renders
 * as itself. The consent **gate** fails the other way on purpose — an unreadable
 * table there means "not accepted", costing one extra screen — and the two
 * directions are correct for their own stakes.
 */
export function ConsentSection({
  locale,
  record,
  pushConsent,
  timeZone,
}: {
  locale: Locale;
  record: ConsentRecord;
  pushConsent: NotificationConsentState;
  /**
   * The owner's zone, not the host's — `LDC-GUARD-001`.
   *
   * `local-day-correction-guard.test.ts` caught this section formatting an
   * acceptance date with no `timeZone`, which resolves to whatever zone the
   * rendering server happens to be in. An acceptance recorded at 22:00 in São
   * Paulo would have displayed as the **next day** to a reader in UTC — a wrong
   * date on a legal record, produced by an omission rather than by a bug
   * anybody would notice. Thirty-one occurrences of this shape were repaired
   * across the tree by the Local Day Correction, and the guard exists so the
   * thirty-second cannot ship.
   */
  timeZone: string;
}) {
  const copy = getPrivacyCopy(locale);
  const formatDate = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone });

  return (
    <section className="data-ai-section" aria-labelledby="consent-record-heading">
      <h2 id="consent-record-heading">{copy.consent.heading}</h2>
      <p className="data-ai-intro">{copy.consent.lead}</p>

      {record.status === "unreadable" ? (
        <p role="alert">{copy.consent.unreadable}</p>
      ) : (
        <ul className="privacy-consent">
          {record.records.map((entry) => (
            <li key={entry.document}>
              <strong>{entry.document === "terms" ? (locale === "en" ? "Terms of use" : "Termos de uso") : locale === "en" ? "Privacy policy" : "Política de privacidade"}</strong>
              <span>
                {entry.acceptedVersion === null || entry.acceptedAt === null
                  ? copy.consent.never
                  : copy.consent.accepted(
                      entry.acceptedVersion,
                      formatDate.format(new Date(entry.acceptedAt)),
                    )}
              </span>
              {/*
                `2O-CONSENT-002`. The version in force comes from
                `POLICY_VERSIONS`, which `version-parity.test.ts` already pins to
                `private.current_policy_version` in both directions — so this
                surface compares against the repository's own contract rather
                than restating a version anywhere.
              */}
              <span>{entry.current ? copy.consent.current : copy.consent.outdated(entry.currentVersion)}</span>
              <Link href={legalDocumentPath(locale, entry.document)}>{copy.consent.read}</Link>
            </li>
          ))}
        </ul>
      )}

      {/*
        `2O-CONSENT-004`. Notification consent is the only genuinely optional
        consent today, and the mechanism that honours a revocation —
        `revoke_push_consent`, read back by `readPushConsent` — has shipped since
        slice 2M with **no control anywhere in the product**. Presenting it here
        gives that producer its first consumer; the permission *request* flow
        stays with `2O-NOTIFY` in slice 2O.6, which is a different problem.
      */}
      <h3>{copy.consent.optionalHeading}</h3>
      <p className="data-ai-intro">{copy.consent.optionalLead}</p>
      <ConsentRevocation locale={locale} state={pushConsent} />
    </section>
  );
}
