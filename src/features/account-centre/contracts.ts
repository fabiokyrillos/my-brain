import { getNavigationHref } from "@/features/shell/capabilities";
import { POLICY_DOCUMENTS, legalDocumentPath } from "@/features/legal/versions";
import type { Locale } from "@/lib/preferences";

/**
 * Conta e dados — `2O-PREF-001` and `2O-PREF-002`.
 *
 * ## What this is, and what it deliberately is not
 *
 * `2O-PREF-001` requires **one destination from which every preference in the
 * product is reachable**, and names it: Ajustes. Dados e IA already reaches the
 * three transparency surfaces from there. Three more things were reachable from
 * nowhere inside Ajustes — notifications, the consent record and account
 * deletion — and this is the section that reaches them.
 *
 * It is **the Dados e IA pattern applied a second time**, which is what
 * `2O-PREF-002` asks for, and the pattern's central claim is the one it inherits
 * verbatim: **no route is redirected and no route ends.** `/app/notifications`
 * keeps its pagination and its deep links; `/{locale}/account/delete` keeps its
 * CAPTCHA, its re-authentication and its position outside `app/`; the legal
 * documents keep being public. A tab of Ajustes would have had to re-implement
 * all of it, and three routes would have stopped being rendering surfaces to
 * make room.
 *
 * ## Three destinations, because the requirement names three
 *
 * `consent` resolves to **two** links rather than one, derived from
 * `POLICY_DOCUMENTS` — the same closed set the database, the acceptance gate and
 * the version constants use, so a third document cannot appear here without
 * appearing there first.
 *
 * ## What this section does **not** do, and where each piece went
 *
 * It is navigational and reads nothing. That is the same call
 * `2O-ONBOARD-005` made about the credential panel and the owner confirmed:
 * reach the existing surface by an explicit, contextual link rather than
 * embedding it, keeping one write path and one mount point. Concretely:
 *
 *  - **Which version was accepted, and when** — `2O-CONSENT-001` and `-002`,
 *    slice 2O.5. `policy_acceptances` today has **no reader that displays it**:
 *    it is read by the acceptance gate and by `/consent` to decide one sentence.
 *    This section reaches the *documents*, which is `2O-CONSENT-003`'s *"in one
 *    step"*, and the acceptance record itself slots in here when 2O.5 builds it.
 *  - **Deletion's properties** — `2O-PRIVACY-008`, slice 2O.5.
 *  - **Notification consent and delivery** — `2O-NOTIFY`, slice 2O.6.
 *
 * ## Why `/{locale}/consent` is not one of the links
 *
 * It is an **interposition**, not a record. It redirects to `/{locale}/app` the
 * moment nothing is owed, which is true of every account that is up to date — so
 * a link labelled "consent" would bounce almost every reader straight back to
 * the cockpit. `R-2O-12` refuses a control that changes nothing, and this would
 * have been one for the overwhelming majority of the people who clicked it.
 */
export const ACCOUNT_CENTRE_DESTINATIONS = ["notifications", "consent", "deletion"] as const;

export type AccountCentreDestination = (typeof ACCOUNT_CENTRE_DESTINATIONS)[number];

export type AccountCentreLink = Readonly<{ key: string; href: string }>;

/**
 * The routes a destination reaches, resolved for one locale.
 *
 * Every href comes from an existing resolver — `getNavigationHref` for the one
 * inside `/app`, `legalDocumentPath` for the documents — rather than being
 * spelled here. A literal would be a second place for a route to be written
 * down, and this repository has already paid for one of those.
 */
export function accountCentreLinks(
  locale: Locale,
  destination: AccountCentreDestination,
): readonly AccountCentreLink[] {
  switch (destination) {
    case "notifications":
      return [{ key: "notifications", href: getNavigationHref(locale, "notifications") }];
    case "consent":
      return POLICY_DOCUMENTS.map((document) => ({
        key: document,
        href: legalDocumentPath(locale, document),
      }));
    case "deletion":
      /*
       * The one literal, and it is unavoidable: this route is outside `app/`,
       * deliberately, so that an account owing consent can still reach it —
       * `getNavigationHref` only resolves `/app` destinations and giving it a
       * navigation row would put deletion in the product's menus.
       */
      return [{ key: "deletion", href: `/${locale}/account/delete` }];
  }
}

/**
 * The routes that wear the strip, and the two that do not.
 *
 * `2O-PREF-002` asks the reached route to wear *a strip with a way back*. Both
 * authenticated destinations do. The **legal documents deliberately do not**:
 * they are public (`SH-LEGAL-001`), reachable without a session, and linked from
 * the register form and the consent gate as well as from here — a strip offering
 * "back to Ajustes" would point a signed-out reader at a page they cannot open.
 * The way back a public document needs is the browser's own, and it has it.
 */
export const ACCOUNT_CENTRE_STRIP_ROUTES = ["notifications", "deletion"] as const;

export type AccountCentreStripRoute = (typeof ACCOUNT_CENTRE_STRIP_ROUTES)[number];
