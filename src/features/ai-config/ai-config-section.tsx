import Link from "next/link";

import { TEXT_MODEL_LABELS, type TextModelId } from "@/lib/ai/model-routing";
import type { Locale } from "@/lib/preferences";

import { AI_ROUTE_CONTRACTS, resolveRoutedModels } from "./contracts";
import { getAiConfigCopy } from "./copy";

/**
 * What this product does with a model, said on the page that configures it —
 * `2O-AICONFIG-001`, `-002`, `-003`, `-004`, `-005` and `-008`.
 *
 * ## It renders itself without calling anything
 *
 * `2O-AICONFIG-009` and `R-2O-17`: **no surface in this family makes a model
 * call to render itself.** This is a Server Component over a constant and four
 * values the settings page had already loaded — no provider import, no `fetch`,
 * no RPC. `ai-config-section.test.tsx` asserts the absence in the module's own
 * source, with a planted violation proving the check can fail, because an
 * absence nobody can make fail is not evidence (`R-2O-16`).
 *
 * ## Why the routing table lives here and not in the form
 *
 * The form is where a route is **changed**; this is where the whole set is
 * **stated**, including the three routes the form has no control for and never
 * will. Putting the two unconsumed columns inside `SettingsForm` would have
 * meant rendering a row in a list of inputs that is not an input — which is the
 * shape `R-24` refuses — and putting `embedding_model` there would have been an
 * input for a column `R-2O-13b` forbids one for.
 *
 * ## What it does not say
 *
 * No price, no rate and no projection (`2O-COST-005`, `R-2O-18`). Spend belongs
 * to Custos, where the figures are provider facts recorded at call time rather
 * than a number this page would have to invent.
 */
export function AiConfigSection({
  locale,
  credentialConfigured,
  saved,
}: {
  locale: Locale;
  /**
   * `2O-AICONFIG-008`. Whether a credential is configured, and **not** its
   * status, its age or any part of it.
   *
   * A boolean is the whole of what this section is allowed to know: it states
   * that the operations below do not happen and offers one path to fix it. What
   * went wrong with a key, and when it was last validated, is
   * `CredentialPanel`'s — one surface owns the credential, and this one links to
   * it rather than restating it in a second voice.
   */
  credentialConfigured: boolean;
  saved: Readonly<Record<"chatModel" | "extractionModel" | "reviewModel" | "fileModel", string>>;
}) {
  const copy = getAiConfigCopy(locale);
  const routed = resolveRoutedModels(saved);

  return (
    <section className="ai-config-section" aria-labelledby="ai-config-heading">
      <h2 id="ai-config-heading">{copy.title}</h2>
      <p className="ai-config-intro">{copy.intro}</p>

      {credentialConfigured ? (
        <p className="ai-config-credential">{copy.credential}</p>
      ) : (
        /*
         * `2O-AICONFIG-008` — *"told so wherever an AI capability is offered,
         * with one path to fix it, and never by a failure"*. It is a statement
         * rendered with the page, not an error raised after something was
         * attempted, and it carries exactly one action.
         */
        <p className="ai-config-credential absent">
          {copy.credentialAbsent}{" "}
          {/*
            `#byok-heading` is the panel's own heading id, which already exists
            because the section is `aria-labelledby` it. Linking to an anchor the
            target already publishes means this path cannot break by someone
            renaming a decorative wrapper, and it required no change to the
            credential surface — which has exactly one mount point and stays that
            way.
          */}
          <Link href={`/${locale}/app/settings#byok-heading`}>{copy.credentialAbsentAction}</Link>
        </p>
      )}

      <h3 className="ai-config-routing-heading">{copy.routingTitle}</h3>
      <p className="ai-config-routing-intro">{copy.routingIntro}</p>
      <ul className="ai-config-routes" aria-label={copy.routesLabel}>
        {AI_ROUTE_CONTRACTS.map((route) => {
          // No cast, and no lookup that can miss: `routes` is a `Record` over
          // the contract's own column union, so a route added without copy
          // fails to compile rather than rendering `undefined` in production.
          const entry = copy.routes[route.column];
          const model = routed[route.column];
          return (
            <li key={route.column} className={`ai-config-route ${route.disposition}`}>
              <strong>{entry.name}</strong>
              <span className="ai-config-route-effect">{entry.effect}</span>
              {model === null ? null : (
                <span className="ai-config-route-model">
                  <span className="ai-config-route-model-label">{copy.modelLabel}</span>
                  <code>{model in TEXT_MODEL_LABELS ? TEXT_MODEL_LABELS[model as TextModelId] : model}</code>
                </span>
              )}
              <small className="ai-config-route-disposition">{copy.dispositions[route.disposition]}</small>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
