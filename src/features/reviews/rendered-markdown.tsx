import Link from "next/link";
import { Fragment, type ReactNode } from "react";

import { parseReviewMarkdown, type ReviewBlock, type ReviewInline } from "./markdown";

/**
 * The AST, on screen.
 *
 * ## Why this is a server component and takes no `content` prop of its own
 *
 * It renders `readonly ReviewBlock[]`, never a string. The parse happens in the
 * caller, which means a surface cannot accidentally hand raw stored text to this
 * component and get markup: there is no code path from a `string` to an element
 * that does not go through `parseReviewMarkdown` first.
 *
 * ## Why every element is written out rather than produced from a map
 *
 * `React.createElement(tag, ...)` with a computed tag is one refactor away from
 * a computed tag that came from the content. The elements below are literals, so
 * the set of tags this module can emit is fixed at authoring time and is visible
 * in one screen: `h3`, `h4`, `h5`, `p`, `ul`, `ol`, `li`, `strong`, `em`, `code`
 * and `Link`. There is no `dangerouslySetInnerHTML` and no `key` that carries
 * user text.
 */

function inline(nodes: readonly ReviewInline[]): ReactNode {
  return nodes.map((node, index) => {
    const key = `${node.kind}-${index}`;
    if (node.kind === "strong") return <strong key={key}>{node.value}</strong>;
    if (node.kind === "emphasis") return <em key={key}>{node.value}</em>;
    if (node.kind === "code") return <code key={key}>{node.value}</code>;
    if (node.kind === "link") {
      /*
       * Reached only for an href the parser authorised against the caller's
       * allow-set — an internal app route naming a record the caller vouched
       * for. Every other href arrived here as a `text` node, so this branch
       * cannot render an external destination even if one was written.
       */
      return (
        <Link className="review-content-link" href={node.href} key={key}>
          {node.value}
        </Link>
      );
    }
    /*
     * A `Fragment`, not a `<span>`.
     *
     * The span was there only to carry the `key` an array element needs, and it
     * put a wrapper element around every run of ordinary prose — enough that
     * `getByText("…").tagName` on a heading returned `SPAN` instead of `H3`.
     * That is a real defect and not only a test inconvenience: a heading whose
     * text is boxed in an inline element is harder to style, and the extra
     * element says nothing about the content.
     */
    return <Fragment key={key}>{node.value}</Fragment>;
  });
}

function block(node: ReviewBlock, index: number): ReactNode {
  const key = `${node.kind}-${index}`;
  if (node.kind === "heading") {
    const children = inline(node.inline);
    if (node.level === 3) return <h3 key={key}>{children}</h3>;
    if (node.level === 4) return <h4 key={key}>{children}</h4>;
    return <h5 key={key}>{children}</h5>;
  }
  if (node.kind === "paragraph") return <p key={key}>{inline(node.inline)}</p>;
  const items = node.items.map((item, itemIndex) => (
    <li key={`${key}-${itemIndex}`}>{inline(item)}</li>
  ));
  return node.ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>;
}

export function RenderedReviewContent({ blocks }: { blocks: readonly ReviewBlock[] }) {
  return <div className="review-content">{blocks.map(block)}</div>;
}

/**
 * The one call site's convenience: parse and render together.
 *
 * `allowedIds` is required rather than optional, so a caller has to state what
 * it can vouch for — an omitted option that defaults to "nothing" reads the same
 * as a caller that forgot, and only one of those is a decision.
 */
export function ReviewContent({
  allowedIds,
  content,
}: {
  allowedIds: ReadonlySet<string>;
  content: string;
}) {
  return <RenderedReviewContent blocks={parseReviewMarkdown(content, { allowedIds })} />;
}
