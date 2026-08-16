"use client";

import { useState } from "react";

import type { Locale } from "@/lib/preferences";

import {
  APPEARANCE_STORAGE_KEY,
  appearanceChoices,
  applyAppearanceChoice,
  parseAppearanceChoice,
  type AppearanceChoice,
} from "./contracts";
import { getAppearanceCopy } from "./copy";

/**
 * The appearance control — `2O-PREF-013`.
 *
 * ## Why the initial state is a lazy initializer, not an effect
 *
 * The pre-paint script has already put the right attribute on `<html>` by the
 * time React runs. If this component's initial state disagreed with it, the
 * first render would show the wrong radio selected and then correct itself —
 * which is the flash `2O-PREF-014` exists to prevent, moved from the page to the
 * control.
 *
 * So the initializer reads **the same key through the same parser** as the
 * script. They cannot disagree, because there is one closed set and one parser
 * between them. This is the pattern the framework guide names *"syncing with
 * React state"*, and the reason it insists both sides read the same source.
 *
 * `typeof window === "undefined"` guards the server pass: this is a Client
 * Component, so it still renders on the server, where `localStorage` does not
 * exist. `system` is the honest server answer — the server cannot know the
 * choice, and `system` is what the document looks like without one.
 *
 * ## Why there is no save button
 *
 * `2O-PREF-014` holds the value client-side only. There is no payload, no
 * Server Action and no round trip, so a save button would be a control that
 * confirms something already done. `2O-PREF-012` still holds: the same control
 * that set the choice is the one that changes it, and every state remains
 * reachable from every other.
 *
 * ## `2O-PREF-008` and the registry
 *
 * This control governs **no column** — `appearance` carries `columns: []` in
 * `capabilityRegistry`, for the same reason `home_status` and `manual_reviews`
 * do. `capability-registry-guard.test.ts` reaches it through the appearance
 * direction rather than through the settings form's `name=` attributes, because
 * radios written by this component are not preference columns.
 */
export function AppearanceControl({ locale }: { locale: Locale }) {
  const copy = getAppearanceCopy(locale);
  const [choice, setChoice] = useState<AppearanceChoice>(() => {
    if (typeof window === "undefined") return "system";
    try {
      return parseAppearanceChoice(window.localStorage.getItem(APPEARANCE_STORAGE_KEY));
    } catch {
      // Private mode and blocked site data throw rather than returning null.
      return "system";
    }
  });

  function choose(next: AppearanceChoice) {
    setChoice(next);
    applyAppearanceChoice(document.documentElement, next);
    try {
      window.localStorage.setItem(APPEARANCE_STORAGE_KEY, next);
    } catch {
      /*
       * The choice still applied — the attribute is already on the document.
       * It simply will not survive a reload, which is the most this product can
       * honestly promise in a browser that refuses to store anything, and is
       * strictly better than refusing to change the theme at all.
       */
    }
  }

  return (
    <section className="appearance-section" aria-labelledby="appearance-heading">
      <h2 id="appearance-heading">{copy.title}</h2>
      <p className="appearance-intro">{copy.intro}</p>
      <fieldset className="appearance-fieldset">
        <legend>{copy.legend}</legend>
        <div className="appearance-options">
          {/*
            The description sits **outside** the label and is linked by
            `aria-describedby` — the pattern `settings-form.tsx` records and
            `ModelSelect` was corrected to.

            A `<small>` nested inside a `<label>` joins the control's accessible
            *name*, because the label's whole subtree is the name. Here that was
            not cosmetic: "Seguir o aparelho" is described as *"acompanha o modo
            claro ou escuro"*, so all three radios answered to "Claro" and a
            screen-reader user would have heard the same two words on every
            option. Split, the label names the control and the description is
            announced as a description.
          */}
          {appearanceChoices.map((option) => (
            <div
              key={option}
              className={`appearance-option${choice === option ? " active" : ""}`}
            >
              <input
                aria-describedby={`appearance-${option}-description`}
                checked={choice === option}
                id={`appearance-${option}`}
                name="appearance"
                onChange={() => choose(option)}
                type="radio"
                value={option}
              />
              <span className="appearance-option-copy">
                <label htmlFor={`appearance-${option}`}>{copy.options[option].label}</label>
                <small id={`appearance-${option}-description`}>
                  {copy.options[option].description}
                </small>
              </span>
            </div>
          ))}
        </div>
      </fieldset>
      {/*
        `2O-PREF-015`'s last clause, and `ADR-116` Decision 8. Stated on the
        surface rather than only in a document, because the reader is the person
        who pays the cost when they open the product on their phone.
      */}
      <p className="appearance-scope">{copy.scope}</p>
    </section>
  );
}
