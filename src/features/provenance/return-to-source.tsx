/**
 * `2N-PERSON-006`, `2N-PROV-003` — opening a source must not cost the reader
 * their place.
 *
 * A contextual page hands its own anchor to the entry page as `?back=…`, and
 * this renders the link that spends it. Modelled on
 * `conversation-cards/return-to-conversation.tsx`, which solves the same problem
 * for citations, and re-using its shape rather than inventing a second one is
 * the point: two ways to come back would drift.
 *
 * ## The value is untrusted, and is treated that way
 *
 * It arrives in a URL, so it can be hand-edited, stale, or hostile. Rendering it
 * into an `href` without checking is an **open redirect**: `?back=https://evil…`
 * or the protocol-relative `?back=//evil…` would turn a link the product drew
 * into a link off the product, on a page the user reached from their own data.
 *
 * So it is matched against a strict allow-list — this app's own locales, under
 * `/app`, with an optional simple fragment — and **anything else renders
 * nothing**. Refusing is always safe here: the browser's own Back still works,
 * so the failure mode of a rejected handle is an ordinary page, never a broken
 * one.
 *
 * A server component with no interactivity, so it adds no client bundle.
 */

import Link from "next/link";

import { getProvenanceCopy } from "./copy";
import { locales, type Locale } from "@/lib/preferences";

/**
 * Same-origin, this app, simple fragment. Nothing else.
 *
 * Built from `locales` rather than written out, so adding a locale cannot leave
 * its return links silently rejected. The path segment character class excludes
 * `\`, `:`, `?`, `#` and `.` deliberately: `//host`, `https://host`,
 * `/pt-BR/app/..%2F..` and query strings all fail to match rather than being
 * sanitised, because a rejected handle costs nothing and a sanitised one is a
 * guess about intent.
 */
const RETURN_PATTERN = new RegExp(
  `^/(?:${locales.join("|")})/app(?:/[A-Za-z0-9_-]+)*(?:#[A-Za-z0-9_-]+)?$`,
);

/** The parsed handle, or `null` when it is anything this app would not have written. */
export function parseReturnTarget(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string" || value === "") return null;
  return RETURN_PATTERN.test(value) ? value : null;
}

export function ReturnToSource({
  back,
  locale,
}: {
  /** The raw `?back=` value, exactly as it arrived. */
  readonly back: string | string[] | undefined;
  readonly locale: Locale;
}) {
  const target = parseReturnTarget(back);
  if (!target) return null;

  const copy = getProvenanceCopy(locale);
  return (
    <Link className="return-to-source" data-return-to-source="true" href={target}>
      {copy.returnToSource}
    </Link>
  );
}
