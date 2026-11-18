/**
 * Editorial calmo — a turn of the conversation, set as prose.
 *
 * A turn was one `<p>` with `white-space: pre-wrap`, so an answer of three
 * paragraphs and a numbered list was one block with blank lines in it. This
 * reads the text's own line structure and nothing else: a blank line ends a
 * paragraph, and consecutive lines that each open with a list mark ("1.", "-",
 * "•") are a list.
 *
 * **It renders text, never markup.** Every piece is a React text node, so
 * model output and owner content stay data: no HTML is parsed, no link is
 * made, and an inline mark such as `**` is shown as written.
 */

export type ProseBlock =
  | { readonly kind: "paragraph"; readonly text: string }
  | { readonly kind: "ordered" | "unordered"; readonly items: readonly string[] };

const ORDERED = /^\s*\d{1,3}[.)]\s+(.*)$/;
const UNORDERED = /^\s*[-*•]\s+(.*)$/;

/** Pure: the text's blocks, in order. An empty text has none. */
export function proseBlocks(text: string): readonly ProseBlock[] {
  const blocks: ProseBlock[] = [];
  let paragraph: string[] = [];
  let list: { kind: "ordered" | "unordered"; items: string[] } | null = null;

  const flush = () => {
    if (paragraph.length > 0) blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
    if (list !== null) blocks.push(list);
    paragraph = [];
    list = null;
  };

  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (line.trim() === "") {
      flush();
      continue;
    }
    const ordered = ORDERED.exec(line);
    const unordered = ordered ? null : UNORDERED.exec(line);
    const kind = ordered ? "ordered" : unordered ? "unordered" : null;
    if (kind === null) {
      // A line under a list item with no mark of its own continues that item.
      if (list !== null && /^\s+\S/.test(line)) {
        list.items[list.items.length - 1] += `\n${line.trim()}`;
        continue;
      }
      if (list !== null) flush();
      paragraph.push(line);
      continue;
    }
    if (list === null || list.kind !== kind) {
      flush();
      list = { kind, items: [] };
    }
    list.items.push((ordered ?? unordered)![1]!);
  }
  flush();
  return blocks;
}

export function Prose({ className, text }: { className?: string; text: string }) {
  const blocks = proseBlocks(text);
  return (
    <div className={className}>
      {blocks.map((block, index) => {
        if (block.kind === "paragraph") return <p key={index}>{block.text}</p>;
        const items = block.items.map((item, position) => <li key={position}>{item}</li>);
        return block.kind === "ordered" ? <ol key={index}>{items}</ol> : <ul key={index}>{items}</ul>;
      })}
    </div>
  );
}
