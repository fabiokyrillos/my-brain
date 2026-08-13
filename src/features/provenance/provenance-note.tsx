/**
 * `2N-PROV-001`…`-004`, `2N-RELATION-002`/`-008`, `2N-ACCESS-002`/`-003` — the
 * one place a claim states where it came from.
 *
 * A component rather than a snippet each section repeats, for the reason
 * `bounded-notice.tsx` gives: a convergence maintained by every list remembering
 * to render the same line is one refactor away from ending, and here the failure
 * would be worse than silent — a section that forgot would present a derived
 * claim as if the owner had asserted it.
 *
 * ## Why `subject` may never be the content
 *
 * The link that opens a source needs an accessible name, or a page with four
 * source links gives a screen-reader user four controls called "Abrir registro"
 * with nothing to tell them apart. The obvious name is the thing it belongs to —
 * the memory's text, the task's title — and on this page that text is exactly
 * what `ProtectedContent` may be withholding. An `aria-label` carrying it would
 * hand the masked string straight to assistive technology and to the DOM, which
 * is the leak `2N-PRIVACY-002` is about, arriving through the accessibility tree
 * instead of through the screen.
 *
 * So `subject` is a **neutral positional label** the caller builds from things
 * that are never protected — a section name and an index. The type cannot
 * enforce that, so it is stated here and asserted in
 * `provenance-note.test.tsx`, which renders a masked subject and fails if the
 * string reaches any attribute.
 *
 * There is deliberately **no `title`**. A native tooltip is unreachable by
 * keyboard, invisible to touch, and would be a second copy of the same text in
 * an attribute — three reasons, any one of which would be enough.
 */

import Link from "next/link";

import { getProvenanceCopy } from "./copy";
import type { Provenance } from "./contracts";
import type { Locale } from "@/lib/preferences";

export function ProvenanceNote({
  href,
  locale,
  provenance,
  subject,
}: {
  /**
   * Where the source opens, when there is one. The caller builds it so this
   * component never constructs a route, and so the return anchor
   * (`2N-PERSON-006`) is decided by the page that knows its own layout.
   */
  readonly href?: string;
  readonly locale: Locale;
  readonly provenance: Provenance;
  /**
   * A neutral positional label — NEVER the claim's content. See this file's
   * header; `provenance-note.test.tsx` fails if content reaches an attribute.
   */
  readonly subject: string;
}) {
  const copy = getProvenanceCopy(locale);

  if (provenance.kind === "sourced" && href) {
    return (
      <p className="provenance-note" data-provenance="sourced">
        <span className="provenance-label">{copy.originLabel}</span>
        <Link aria-label={copy.openSource(subject)} href={href}>
          {copy.sourced}
        </Link>
      </p>
    );
  }

  /*
   * `sourced` without an `href` falls through to `unsourced` rather than
   * rendering an unopenable "there is a source" line. Saying a source exists
   * while offering no way to reach it is the shape `2N-PROV-002` refuses, and it
   * would also make the sentence a probe: it would confirm the entry id exists
   * even where the page cannot open it.
   */
  const kind = provenance.kind === "owner-authored" ? "owner-authored" : "unsourced";
  const text = kind === "owner-authored" ? copy.ownerAuthored : copy.unsourced;

  return (
    <p className="provenance-note" data-provenance={kind}>
      <span className="provenance-label">{copy.originLabel}</span>
      <span>{text}</span>
    </p>
  );
}

/**
 * `2N-PERSON-004` — whether the owner maintains a section or the page computed
 * it, said in words rather than by where the section sits on the page.
 *
 * `2N-ACCESS-002` is the reason this is text at all: a layout convention — edit
 * controls on the left, read-only on the right — conveys nothing to a screen
 * reader and nothing at a narrow viewport where both columns stack.
 */
export function SectionOriginNote({
  locale,
  origin,
}: {
  readonly locale: Locale;
  readonly origin: "persisted" | "derived";
}) {
  const copy = getProvenanceCopy(locale);
  return (
    <p className="section-origin" data-section-origin={origin}>
      {origin === "persisted" ? copy.persistedSection : copy.derivedSection}
    </p>
  );
}
