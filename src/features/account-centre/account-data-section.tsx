import Link from "next/link";

import type { Locale } from "@/lib/preferences";

import { ACCOUNT_CENTRE_DESTINATIONS, accountCentreLinks } from "./contracts";
import { getAccountCentreCopy } from "./copy";

/**
 * Conta e dados, inside Ajustes — `2O-PREF-001` and `2O-PREF-002`.
 *
 * ## No control here does anything but navigate
 *
 * Links, and nothing else. No toggle, no "delete my account" button, no consent
 * checkbox — every one of those would be a control this section cannot honour,
 * and ADR-114 Decision 7 forbids the affordance before it forbids the feature.
 * Deletion in particular is reached by a link to the page that asks properly;
 * putting the irreversible action one click from a preferences list is exactly
 * what `SH-DELETE-002`'s confirmation and re-authentication exist to prevent.
 *
 * ## It reads nothing
 *
 * A Server Component with no data access, mounted on the busiest authenticated
 * page in the product. Ajustes already performs four reads before it renders;
 * a fifth to show a consent date would be paid by every visit to a page most
 * people open for something else. The acceptance record belongs to
 * `2O-CONSENT-001` in slice 2O.5 and slots into this section when it ships.
 */
export function AccountDataSection({ locale }: { locale: Locale }) {
  const copy = getAccountCentreCopy(locale);

  return (
    <section className="data-ai-section" aria-labelledby="account-data-heading">
      <h2 id="account-data-heading">{copy.title}</h2>
      <p className="data-ai-intro">{copy.intro}</p>
      <ul className="data-ai-doors">
        {ACCOUNT_CENTRE_DESTINATIONS.flatMap((destination) => {
          const entry = copy.entries[destination];
          return accountCentreLinks(locale, destination).map((link) => (
            <li key={`${destination}-${link.key}`}>
              <Link className="data-ai-door" href={link.href}>
                <strong>{entry.links[link.key].label}</strong>
                <span>{entry.links[link.key].description}</span>
              </Link>
            </li>
          ));
        })}
      </ul>
    </section>
  );
}
