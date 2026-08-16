import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { getNavigationHref } from "@/features/shell/capabilities";
import type { Locale } from "@/lib/preferences";

import type { AccountCentreStripRoute } from "./contracts";
import { getAccountCentreCopy } from "./copy";

/**
 * The Conta e dados strip — `2O-PREF-002`'s *"wears a strip with a way back"*.
 *
 * ## Why a way back is the whole point
 *
 * `2O-PREF-001` makes Ajustes the one destination every preference is reachable
 * from. A reader who arrives on `/app/notifications` — from a deep link, from a
 * notification, or from the global bell — otherwise has no sign that the page
 * belongs to anything, and no path to the rest of their settings. Without the
 * strip, consolidation is a claim the section makes and the destination
 * contradicts. `DataAiTabs` carries the identical link for the identical reason,
 * one section over.
 *
 * ## Why it is not `DataAiTabs`
 *
 * That strip also renders sibling lenses, because Atividade, Custos and
 * Processamento are three views of one thing and moving between them is a real
 * journey. These two are not siblings: notifications and account deletion have
 * nothing to say to each other, and a strip offering to jump from the
 * notification list to the deletion form would be an affordance nobody wants
 * within one click. So this carries the way back and the page's own name, and
 * no lateral movement.
 *
 * ## Where it is not worn
 *
 * The legal documents. They are public (`SH-LEGAL-001`), reachable with no
 * session, and linked from the register form and the consent gate as well as
 * from Ajustes — so "back to Ajustes" would point a signed-out reader at a page
 * they cannot open. `ACCOUNT_CENTRE_STRIP_ROUTES` records that as a closed set
 * rather than as an omission.
 */
export function AccountDataStrip({
  locale,
  route,
}: {
  locale: Locale;
  route: AccountCentreStripRoute;
}) {
  const copy = getAccountCentreCopy(locale);

  return (
    <nav aria-label={copy.title} className="data-ai-tabs">
      <Link className="data-ai-up" href={getNavigationHref(locale, "settings")}>
        <ArrowLeft aria-hidden="true" size={14} />
        {copy.backToSettings}
      </Link>
      <div className="data-ai-lenses">
        {/*
          The current page names itself, and it is not a link. `aria-current
          ="page"` on a non-link says "you are here" without promising a
          destination — the same claim `DataAiTabs` makes about its active lens,
          minus the siblings there is no reason to offer.
        */}
        <span aria-current="page" className="data-ai-lens">
          {copy.stripLabel[route]}
        </span>
      </div>
    </nav>
  );
}
