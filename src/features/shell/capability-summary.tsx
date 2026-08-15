import type { Locale } from "@/lib/preferences";

import { getCapabilityRegistryView } from "./capabilities";
import { getCapabilitySummaryCopy } from "./capability-copy";

/**
 * The capability registry's first product consumer — `2O-ACTIVATION-004`.
 *
 * ## Why this had to exist before anything else in Phase 2O
 *
 * `capabilityRegistry` shipped sixteen rows recording which preferences are
 * real, and until this component **nothing rendered any of them**. Its only
 * importer was its own test, so a row could claim anything and no user would
 * ever see a difference — which makes `R-24` (*the settings surface never offers
 * a control that changes nothing*) a convention rather than a mechanism, and
 * makes `consumerEvidence` a comment in a type's clothing.
 *
 * Load-bearing means exactly this: **a stale row now changes what a user sees.**
 * Flip a row to `visible: false` and its paragraph disappears from Ajustes;
 * flip one to `visible: true` and the build fails until someone writes what it
 * does. That is the property `capability-registry-guard.test.ts` asserts, and
 * this is the surface that makes it true.
 *
 * ## Why only the visible rows
 *
 * `2O-ACTIVATION-007` requires the nine consumer-less columns to be *recorded*
 * in the registry and **absent from the preferences interface**. They are
 * `visible: false`, so the filter below is what discharges the second half —
 * they are data the repository keeps and not a promise the product makes.
 * `scheduled_reviews` is filtered out by the same clause while it has no
 * control, which is the honest state until `2O-PREF-004` gives it one.
 *
 * ## No control here changes anything
 *
 * This is a statement, not a form. Every control in Ajustes lives in
 * `SettingsForm` and the credential panel; adding one here would be a second
 * write path for a preference that already has one.
 */
export function CapabilitySummary({ locale }: { locale: Locale }) {
  const copy = getCapabilitySummaryCopy(locale);
  const capabilities = getCapabilityRegistryView("settings").filter((capability) => capability.visible);

  return (
    <section className="capability-summary" aria-labelledby="capability-summary-heading">
      <h2 id="capability-summary-heading">{copy.title}</h2>
      <p className="capability-summary-intro">{copy.intro}</p>
      <ul className="capability-summary-list" aria-label={copy.listLabel}>
        {capabilities.map((capability) => {
          // No cast. `getCapabilityRegistryView` keeps its literal key union, so
          // this lookup is the compiler checking that every rendered row has
          // copy — which is the whole mechanism, and a cast here would remove it.
          const entry = copy.entries[capability.key];
          return (
            <li key={capability.key} className="capability-summary-item">
              <strong>{entry.name}</strong>
              <span>{entry.effect}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
