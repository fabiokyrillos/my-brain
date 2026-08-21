/**
 * The review content parser — a **typed AST**, never HTML.
 *
 * ## Why this exists at all
 *
 * A census of the repository found **no Markdown renderer in the product**:
 * `package.json` carries no `remark`, `rehype`, `marked`, `markdown-it` or
 * `dompurify`, and the only `markdown` matches under `src/` are closeout guards
 * that read `docs/`. So there was nothing to reuse, and the stored content —
 * `summaries.content`, written verbatim from `answerFromKnowledge` — reached the
 * screen through `<p>{content}</p>`, which collapses the newlines and leaves
 * `##`, `###` and `**` visible as literal characters.
 *
 * ## The security posture, and why it is structural rather than careful
 *
 * The input is **model output**. It is untrusted in exactly the way user content
 * is untrusted, and the product's standard is that untrusted content is data,
 * never instructions and never markup.
 *
 * So this module produces a closed union of value objects. It does not produce
 * an HTML string, it does not accept one, and there is no `dangerouslySetInner
 * HTML` anywhere on the path from `summaries.content` to the screen. A tag in
 * the source is not sanitised — it is **never parsed as a tag in the first
 * place**, and arrives at the renderer as the literal characters a reader should
 * see. That is a stronger guarantee than sanitising, because it has no allow-list
 * of elements to get wrong.
 *
 * The same reasoning governs links, and it is the one place the guarantee is
 * *parameterised* rather than absolute — see {@link authorizeHref}.
 *
 * ## Unrecognised syntax becomes text, never nothing
 *
 * Images, tables, block quotes, raw HTML, autolinks, reference links, entities,
 * footnotes: all render as the literal characters they are. **Not stripped.**
 * Stripping would let a model delete words from its own report by wrapping them
 * in a syntax this parser happens not to implement — a report that silently
 * loses content is worse than one that shows a stray bracket.
 */

import { citedTypeForSegment, vouchedKey } from "./citation-routes";

/** One run of inline content. `link` is the only node that can carry an href. */
export type ReviewInline =
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "strong"; readonly value: string }
  | { readonly kind: "emphasis"; readonly value: string }
  | { readonly kind: "code"; readonly value: string }
  | { readonly kind: "link"; readonly value: string; readonly href: string };

/**
 * Heading levels are **clamped into the host page's outline**.
 *
 * The detail page owns `<h1>` (the review's title) and `<h2>` (its sections), so
 * the deepest a model may reach is `<h3>`. A document outline is a property of
 * the page, not a decision the content gets to make.
 */
export type ReviewHeadingLevel = 3 | 4 | 5;

export type ReviewBlock =
  | { readonly kind: "heading"; readonly level: ReviewHeadingLevel; readonly inline: readonly ReviewInline[] }
  | { readonly kind: "paragraph"; readonly inline: readonly ReviewInline[] }
  | {
      readonly kind: "list";
      readonly ordered: boolean;
      readonly items: readonly (readonly ReviewInline[])[];
    };

export type ReviewMarkdownOptions = {
  /**
   * The **`(type, id)` pairs** this caller can vouch for, as `vouchedKey`
   * builds them — never bare ids.
   *
   * `2Q-LINK-001/002`. Until Phase 2Q this was a set of ids, and the gate keyed
   * on the uuid alone: an envelope vouching for entry `X` also authorized
   * `/pt-BR/app/work/X`. Empty still means no link in the content may become an
   * anchor, which is what a review with no stored references gets.
   */
  readonly vouchedFor?: ReadonlySet<string>;
};

/**
 * Characters removed before anything is parsed.
 *
 * Written as a predicate rather than a regex on purpose. A character class
 * holding C0 controls is either an ESLint `no-control-regex` violation or a
 * source file with literal control bytes in it — this file was written the
 * second way once, and `grep` reported it as binary.
 *
 * Bidirectional overrides (U+200E/U+200F, U+202A–U+202E, U+2066–U+2069) let text
 * render in an order the source does not have, which is the classic way a benign
 * string is displayed as something else. The C0/C1 controls go for the same
 * reason with less imagination required. `\n` and `\t` survive, because they are
 * the two characters this parser gives meaning to.
 */
function isUnsafeCharacter(character: string): boolean {
  if (character === "\n" || character === "\t") return false;
  const code = character.codePointAt(0) ?? 0;
  if (code < 0x20) return true;
  if (code >= 0x7f && code <= 0x9f) return true;
  if (code === 0x200e || code === 0x200f) return true;
  if (code >= 0x202a && code <= 0x202e) return true;
  return code >= 0x2066 && code <= 0x2069;
}

export function stripUnsafeCharacters(text: string): string {
  let output = "";
  for (const character of text) {
    if (!isUnsafeCharacter(character)) output += character;
  }
  return output;
}

/**
 * An internal app route carrying exactly one record id.
 *
 * A **bare** surface link (`/pt-BR/app/tasks`, no id) is deliberately *not*
 * matched: it names no record, so nothing about it can be verified, and
 * admitting it would put a second rule beside the allow-set. One gate, one
 * sentence — an anchor exists only where a caller vouched for the id.
 */
const INTERNAL_ROUTE =
  /^\/(?:pt-BR|en)\/app\/([a-z-]+)\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;

/**
 * The href to render, or `null` for "this is not a link".
 *
 * `null` does not mean "drop it" — the caller turns the node into **text**, so
 * the words survive and only the navigation is refused. Everything that is not
 * an internal route to a **vouched-for `(type, id)` pair** returns `null`:
 * `javascript:`, `data:`, `http(s):`, `mailto:`, protocol-relative `//host`, a
 * path with a fabricated id, a well-formed path whose id nobody supplied — and,
 * since Phase 2Q, **a well-formed path whose id was vouched for as a different
 * kind of record.**
 *
 * ## The pair, and why the id alone was not enough
 *
 * `2Q-LINK-002`. The surface segment used to be `[a-z-]+` and was never read,
 * so one vouched-for uuid authorized `inbox/`, `work/`, `people/`, `projects/`
 * and `memories/` alike — `2Q-FOUNDATION-004` executed exactly that. It never
 * leaked (`work/[taskId]` scopes by `user_id` and calls `notFound()`); it handed
 * the owner **a broken link they would click**, which is the failure class this
 * phase exists to remove. The segment is now read back to a type through
 * `citation-routes.ts`, and the pair must match.
 *
 * A segment that maps to **no** citable type is refused outright rather than
 * compared — so `people/` and `projects/` can never be admitted by any envelope,
 * which is stricter than refusing a mismatch and needs no second rule.
 *
 * Exported so the test can call the real function rather than re-implement its
 * regex — a control that carries its own private copy of the mechanism is not a
 * control.
 */
export function authorizeHref(href: string, vouchedFor: ReadonlySet<string>): string | null {
  const trimmed = stripUnsafeCharacters(href).trim();
  const match = INTERNAL_ROUTE.exec(trimmed);
  if (!match) return null;
  const type = citedTypeForSegment(match[1]);
  if (!type) return null;
  return vouchedFor.has(vouchedKey(type, match[2])) ? trimmed : null;
}

/**
 * Inline scanning, leftmost-first over one alternation.
 *
 * Order inside the alternation is the whole of the precedence: code spans first
 * so their contents stay literal, then links, then `**` before `*` so a bold run
 * is not read as two italic ones. An unterminated marker matches nothing and
 * therefore survives as text, which is what a reader should see.
 */
const INLINE =
  /`([^`\n]+)`|\[([^\]\n]*)\]\(([^)\s]*)\)|\*\*([^*\n]+)\*\*|__([^_\n]+)__|\*([^*\n]+)\*|_([^_\n]+)_/g;

function parseInline(source: string, vouchedFor: ReadonlySet<string>): readonly ReviewInline[] {
  const nodes: ReviewInline[] = [];
  let cursor = 0;

  const pushText = (value: string) => {
    if (!value) return;
    const previous = nodes[nodes.length - 1];
    // Adjacent text runs are merged so a refused link cannot be told apart from
    // ordinary prose by the shape of the node list.
    if (previous?.kind === "text") {
      nodes[nodes.length - 1] = { kind: "text", value: previous.value + value };
    } else {
      nodes.push({ kind: "text", value });
    }
  };

  INLINE.lastIndex = 0;
  for (let match = INLINE.exec(source); match !== null; match = INLINE.exec(source)) {
    pushText(source.slice(cursor, match.index));
    cursor = match.index + match[0].length;

    if (match[1] !== undefined) {
      nodes.push({ kind: "code", value: match[1] });
    } else if (match[2] !== undefined && match[3] !== undefined) {
      const href = authorizeHref(match[3], vouchedFor);
      // The label, always. A refused link loses its navigation, never its words.
      if (href) nodes.push({ kind: "link", value: match[2], href });
      else pushText(match[2] || match[3]);
    } else if (match[4] !== undefined || match[5] !== undefined) {
      nodes.push({ kind: "strong", value: (match[4] ?? match[5]) as string });
    } else {
      nodes.push({ kind: "emphasis", value: (match[6] ?? match[7]) as string });
    }
  }
  pushText(source.slice(cursor));
  return nodes;
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const UNORDERED = /^\s{0,3}[-*+]\s+(.*)$/;
const ORDERED = /^\s{0,3}\d{1,9}[.)]\s+(.*)$/;

/**
 * The parse.
 *
 * Blocks are line-oriented. Consecutive plain lines join into one paragraph with
 * a single space, which is Markdown's own rule and part of why the stored content
 * currently renders as one unbroken wall: the newlines were never separators to
 * the browser either.
 *
 * Heading depth is **normalised against the document's own shallowest heading**
 * rather than mapped from a fixed table. The generator opens at `##` and puts
 * sections at `###`; a fixed table would spend a level on a `#` that never
 * appears and push every real section one step deeper. Normalising means the
 * outline is correct whatever level the model chose to start at.
 */
export function parseReviewMarkdown(
  source: unknown,
  options: ReviewMarkdownOptions = {},
): readonly ReviewBlock[] {
  if (typeof source !== "string") return [];
  const vouchedFor = options.vouchedFor ?? new Set<string>();
  // Line endings first, then the strip: a lone `\r` is a line break, and
  // removing it as a control character would silently join two lines.
  const text = stripUnsafeCharacters(source.replace(/\r\n?/g, "\n"));
  const lines = text.split("\n");

  const depths = lines
    .map((line) => HEADING.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => match[1].length);
  const shallowest = depths.length ? Math.min(...depths) : 1;

  const blocks: ReviewBlock[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const joined = paragraph.join(" ").trim();
    paragraph = [];
    if (joined) blocks.push({ kind: "paragraph", inline: parseInline(joined, vouchedFor) });
  };
  const flushList = () => {
    if (!list) return;
    const { ordered, items } = list;
    list = null;
    blocks.push({ kind: "list", ordered, items: items.map((item) => parseInline(item, vouchedFor)) });
  };
  const flush = () => {
    flushParagraph();
    flushList();
  };

  for (const line of lines) {
    if (!line.trim()) {
      flush();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      const level = Math.min(5, Math.max(3, 3 + (heading[1].length - shallowest))) as ReviewHeadingLevel;
      const inline = parseInline(heading[2].trim(), vouchedFor);
      // A heading with no text is not a heading; it is a stray run of hashes,
      // and printing it as an empty <h3> would put a silent gap in the outline.
      if (inline.length) blocks.push({ kind: "heading", level, inline });
      continue;
    }

    const unordered = UNORDERED.exec(line);
    const ordered = unordered ? null : ORDERED.exec(line);
    if (unordered || ordered) {
      flushParagraph();
      const wantsOrdered = ordered !== null;
      if (list && list.ordered !== wantsOrdered) flushList();
      if (!list) list = { ordered: wantsOrdered, items: [] };
      list.items.push(((unordered ?? ordered) as RegExpExecArray)[1].trim());
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }
  flush();

  return Object.freeze(blocks);
}

/**
 * Whether there is anything to render.
 *
 * A summary that is whitespace, or only stray hashes, parses to zero blocks —
 * and a page that rendered an empty article for it would be claiming the review
 * exists and says nothing, when the truth is that it says nothing *readable*.
 */
export function hasRenderableContent(blocks: readonly ReviewBlock[]): boolean {
  return blocks.length > 0;
}
