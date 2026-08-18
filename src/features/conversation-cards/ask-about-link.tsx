import { MessagesSquare } from "lucide-react";
import Link from "next/link";

import type { Locale } from "@/lib/preferences";

import { askAboutCopy, askAboutHref, type AskAboutSubject } from "./ask-about";

/**
 * `2P-CHAT-005` — the affordance on a contextual page.
 *
 * A plain link, deliberately. The alternatives were a button posting to an
 * action and a client component holding the subject in state; both would make
 * "ask about this" a thing that *happens* rather than a place you go, and
 * neither is needed — there is nothing to write, and the destination is a URL.
 * A link is also the only version that middle-clicks, keyboard-activates and
 * screen-reader-announces correctly without any code of its own.
 *
 * The accessible name carries the subject, because a page can render several of
 * these and "Ask about this" repeated four times tells a screen-reader user
 * nothing about which one they are on.
 */
export function AskAboutLink({
  locale,
  name,
  about,
}: {
  locale: Locale;
  /** The subject's name, already rendered elsewhere on the page by its owner. */
  name: string;
  about: AskAboutSubject;
}) {
  const copy = askAboutCopy(locale);
  return (
    <Link
      aria-label={copy.asking(name)}
      className="ask-about-link"
      href={askAboutHref(locale, about)}
    >
      <MessagesSquare aria-hidden="true" size={16} />
      {copy.action}
    </Link>
  );
}
