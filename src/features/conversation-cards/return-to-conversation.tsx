/**
 * `2K-CONT-002` / `2K-CONT-004` — the way back.
 *
 * A citation link carries a continuity handle as `?from=…`. This renders the
 * link that spends it, on the object the user went to look at, and it is the
 * whole of what "records enough context to return" means in the product.
 *
 * ## Why it re-parses rather than passing the string through
 *
 * The value arrives in a URL and is untrusted. Parsing it here means a mangled,
 * stale or hand-edited handle renders **nothing** instead of a link to a
 * malformed URL — and it means this component cannot be handed a payload that
 * carries more than the schema allows, because the schema is strict and would
 * refuse it.
 *
 * ## Why the handle travels intact
 *
 * The return link carries the same identifiers back to the conversation, where
 * `resumeConversationCard` re-derives from scratch with a **new** clock. The
 * handle is not an authorization and cannot become one: it names a
 * conversation, a message and an object, and every check runs again on arrival.
 *
 * A server component with no interactivity, so it adds no client bundle to a
 * page that had none.
 */

import Link from "next/link";

import type { Locale } from "@/lib/preferences";

import { parseContinuityHandle } from "./continuity";
import { getConversationCardsCopy } from "./copy";

export function ReturnToConversation({
  from,
  locale,
}: {
  /** The raw `?from=` value, exactly as it arrived. */
  from: string | string[] | undefined;
  locale: Locale;
}) {
  const raw = Array.isArray(from) ? from[0] : from;
  const parsed = parseContinuityHandle(raw);
  if (parsed.status !== "ok") return null;

  const copy = getConversationCardsCopy(locale);
  const { c } = parsed.handle;
  return (
    <Link
      className="conversation-return"
      href={`/${locale}/app/chat/${c}?resume=${encodeURIComponent(raw as string)}`}
    >
      {copy.returnToConversation}
    </Link>
  );
}
