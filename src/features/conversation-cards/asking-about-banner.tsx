import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import type { Locale } from "@/lib/preferences";

import {
  askAboutCopy,
  askAboutSourceHref,
  type ResolvedAskAboutSubject,
} from "./ask-about";

/**
 * `2P-CHAT-005` — "without losing the source context", made literal.
 *
 * Two facts and nothing else: what this conversation is about, and the way back
 * to where it started. The requirement's second half is the harder one — a
 * contextual affordance that drops the owner onto a bare composer has lost the
 * context even though it carried the subject — so the return link is part of the
 * same component as the heading rather than something a page might forget to
 * render beside it.
 *
 * The name arrives already resolved under RLS (`resolve-ask-about.ts`). This
 * component reads no data and decides nothing: if the subject could not be
 * resolved, the page renders nothing here at all, which is the same output an
 * unowned id produces.
 */
export function AskingAboutBanner({
  locale,
  resolved,
}: {
  locale: Locale;
  resolved: ResolvedAskAboutSubject;
}) {
  const copy = askAboutCopy(locale);
  return (
    <aside className="asking-about-banner">
      <p className="asking-about-subject">{copy.asking(resolved.name)}</p>
      <Link className="back-link" href={askAboutSourceHref(locale, resolved.subject)}>
        <ArrowLeft aria-hidden="true" size={16} />
        {copy.back(resolved.name)}
      </Link>
    </aside>
  );
}
