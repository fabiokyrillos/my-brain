import { Smartphone } from "lucide-react";

import type { Locale } from "@/lib/preferences";

import { getInstallCopy } from "./install-copy";

/**
 * `2O-MOBILE-004` — *installing the product as an app is explained where a user
 * would look.*
 *
 * ## A Server Component, and no control
 *
 * There is nothing to hold and nothing to submit: the gesture belongs to the
 * browser, not to this page. That keeps it out of `2O-ACTIVATION-005`'s
 * direction B entirely — it renders no control, so there is no row for it to
 * need and no capability the registry would have to invent.
 *
 * ## Where it sits, and why not lower
 *
 * Directly after the appearance choice and the capability summary, which is
 * where the page stops being about *what the product does with your data* and
 * starts being about *how you use it*. Putting it beside notifications was the
 * alternative and it is worse in the way that matters: it would read as a step
 * toward turning alerts on, which is exactly the claim `OD-2O-11` forbids.
 *
 * ## The structure is a description list because that is what it is
 *
 * Three platforms, each with the gesture that browser actually uses. A `<dl>`
 * pairs them for a screen reader rather than leaving three headings and three
 * paragraphs whose association is visual. `2O-ACCESS-003`: the pairing is
 * carried by the element, not by a column.
 */
export function InstallSection({ locale }: { locale: Locale }) {
  const copy = getInstallCopy(locale);

  return (
    <section className="settings-section install-section" aria-labelledby="install-heading">
      <div className="settings-section-heading">
        <span>
          <Smartphone size={16} aria-hidden />
        </span>
        <div>
          <h2 id="install-heading">{copy.title}</h2>
          <p>{copy.intro}</p>
        </div>
      </div>

      <div className="install-body">
        <ul className="install-benefits">
          {copy.benefits.map((benefit) => (
            <li key={benefit}>{benefit}</li>
          ))}
        </ul>

        <dl className="install-steps">
          {copy.steps.map((step) => (
            <div className="install-step" key={step.platform}>
              <dt>{step.platform}</dt>
              <dd>{step.instruction}</dd>
            </div>
          ))}
        </dl>

        {/*
          The limit, on the surface. `2O-NOTIFY-006` states that delivery is
          unconfirmed and `OD-2O-11` declines the investigation; a page that
          explained installing without this sentence would let a reader conclude
          that installing is the missing step for alerts, which is precisely the
          false claim this phase is not allowed to make.
        */}
        <p className="install-caveat quiet-state">{copy.caveat}</p>
      </div>
    </section>
  );
}
