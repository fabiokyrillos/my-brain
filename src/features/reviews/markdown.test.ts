import { describe, expect, it } from "vitest";

import {
  authorizeHref,
  hasRenderableContent,
  parseReviewMarkdown,
  stripUnsafeCharacters,
  type ReviewBlock,
  type ReviewInline,
} from "./markdown";

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const OTHER_ID = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";

/**
 * Built from code points, never written as literals.
 *
 * A source file holding a real U+202E is reported by `grep` as binary and
 * renders its own assertions in the wrong order — the exact confusion these
 * characters are removed to prevent. This file was written the literal way twice
 * before it was written this way.
 */
const RLO = String.fromCharCode(0x202e);
const PDF = String.fromCharCode(0x202c);
const CONTROLS = String.fromCharCode(0x00, 0x07, 0x9f);

function textOf(nodes: readonly ReviewInline[]): string {
  return nodes.map((node) => node.value).join("");
}

function kindsOf(blocks: readonly ReviewBlock[]): string[] {
  return blocks.map((block) => block.kind);
}

/**
 * The stored shape, taken from the owner's own screenshot of a generated weekly
 * review — the markers, the levels and the flattening are the defect this parser
 * exists to end.
 */
const STORED = [
  "## Revisão da semana",
  "",
  "### Entregas",
  "- Nenhuma entrega registrada.",
  "",
  "### Tarefas abertas",
  "- **Fazer o relatório do Sweepstakes** — status: inbox; sem prazo definido.",
  "",
  "### Melhorias sugeridas",
  "1. Definir prazo e próximo passo.",
  "2. Tirar a tarefa do inbox.",
].join("\n");

describe("the parse produces blocks, not markup", () => {
  it("turns the stored weekly review into headings, lists and no visible markers", () => {
    const blocks = parseReviewMarkdown(STORED);

    expect(kindsOf(blocks)).toEqual(["heading", "heading", "list", "heading", "list", "heading", "list"]);

    const rendered = blocks
      .map((block) => (block.kind === "list" ? block.items.map(textOf).join(" ") : textOf(block.inline)))
      .join(" ");

    // The markers are gone as markers, and the words are all still here.
    expect(rendered).not.toContain("##");
    expect(rendered).not.toContain("**");
    expect(rendered).toContain("Revisão da semana");
    expect(rendered).toContain("Fazer o relatório do Sweepstakes");
    expect(rendered).toContain("Definir prazo e próximo passo.");
  });

  it("normalises heading depth against the document's own shallowest level", () => {
    // The generator opens at `##`, so `##` is the top of THIS document and must
    // become h3 — not h4, which a fixed table would produce by reserving a level
    // for a `#` that never appears.
    const blocks = parseReviewMarkdown(STORED).filter((block) => block.kind === "heading");
    expect(blocks.map((block) => (block.kind === "heading" ? block.level : 0))).toEqual([3, 4, 4, 4]);
  });

  it("clamps a document that really does start at # into the same ceiling", () => {
    const blocks = parseReviewMarkdown("# Topo\n\n## Meio\n\n### Fundo\n\n#### Mais fundo\n\n##### Fundo demais");
    expect(blocks.map((block) => (block.kind === "heading" ? block.level : 0))).toEqual([3, 4, 5, 5, 5]);
  });

  it("marks an ordered list as ordered and an unordered one as not", () => {
    const blocks = parseReviewMarkdown("- um\n- dois\n\n1. primeiro\n2. segundo");
    expect(blocks).toHaveLength(2);
    expect(blocks[0].kind === "list" && blocks[0].ordered).toBe(false);
    expect(blocks[1].kind === "list" && blocks[1].ordered).toBe(true);
  });

  it("joins consecutive plain lines into one paragraph", () => {
    const blocks = parseReviewMarkdown("uma linha\noutra linha\n\nsegundo parágrafo");
    expect(kindsOf(blocks)).toEqual(["paragraph", "paragraph"]);
    expect(blocks[0].kind === "paragraph" && textOf(blocks[0].inline)).toBe("uma linha outra linha");
  });

  it("reads emphasis, strong and code as their own nodes", () => {
    const blocks = parseReviewMarkdown("**forte** e *ênfase* e `código`");
    const inline = blocks[0].kind === "paragraph" ? blocks[0].inline : [];
    expect(inline.map((node) => node.kind)).toEqual(["strong", "text", "emphasis", "text", "code"]);
    expect(textOf(inline)).toBe("forte e ênfase e código");
  });

  it("refuses a non-string without throwing", () => {
    for (const value of [null, undefined, 42, {}, []]) {
      expect(parseReviewMarkdown(value)).toEqual([]);
    }
  });

  it("reports nothing renderable for whitespace and for a heading with no words", () => {
    expect(hasRenderableContent(parseReviewMarkdown("   \n\n  \n"))).toBe(false);
    // `### ` opens a heading and closes it with nothing, which is a stray run of
    // hashes rather than a heading — emitting an empty <h3> would put a silent
    // gap in the page outline.
    expect(hasRenderableContent(parseReviewMarkdown("### "))).toBe(false);
    // …and the control: real content must report true, or the checks above are
    // passing because the predicate always says false.
    expect(hasRenderableContent(parseReviewMarkdown("texto"))).toBe(true);
  });

  it("shows a bare run of hashes as the characters it is, rather than deleting them", () => {
    // `###` with no space is not heading syntax at all. The principle is the
    // same one that governs `<script>`: unrecognised syntax becomes text, never
    // nothing, so a model cannot erase its own words by mistyping a marker.
    const blocks = parseReviewMarkdown("###");
    expect(kindsOf(blocks)).toEqual(["paragraph"]);
    expect(blocks[0].kind === "paragraph" && textOf(blocks[0].inline)).toBe("###");
  });
});

describe("no markup and no script can survive the parse", () => {
  const HOSTILE = [
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    '<a href="javascript:alert(1)">clique</a>',
    "<iframe src=//evil.test></iframe>",
    "<style>body{display:none}</style>",
    "<svg onload=alert(1)>",
  ];

  it.each(HOSTILE)("keeps %s as literal text with no link node", (source) => {
    const blocks = parseReviewMarkdown(source, { vouchedFor: new Set([`task:${ID}`]) });
    const nodes = blocks.flatMap((block) => (block.kind === "list" ? block.items.flat() : block.inline));

    // Nothing became a link…
    expect(nodes.every((node) => node.kind !== "link")).toBe(true);
    // …and nothing was silently deleted: the words a reader would see are still
    // in the output. This is the half that fails if the parser "sanitises".
    expect(nodes.map((node) => node.value).join("")).toContain("<");
  });

  it("produces only the four inline kinds and the three block kinds, whatever it is fed", () => {
    // The closed-union guarantee, asserted rather than assumed from the types:
    // a value object that gained an `html` kind would fail here.
    const blocks = parseReviewMarkdown(
      `${STORED}\n\n${HOSTILE.join("\n\n")}\n\n> citação\n\n| a | b |\n\n![img](http://evil.test/x.png)`,
      { vouchedFor: new Set([`task:${ID}`]) },
    );
    for (const block of blocks) {
      expect(["heading", "paragraph", "list"]).toContain(block.kind);
      const inline = block.kind === "list" ? block.items.flat() : block.inline;
      for (const node of inline) {
        expect(["text", "strong", "emphasis", "code", "link"]).toContain(node.kind);
      }
    }
  });
});

describe("a link exists only where the caller vouched for the (type, id) PAIR", () => {
  /*
   * **Inverted by slice 2Q.2 — `2Q-LINK-002` — and the old behaviour is kept
   * below as the planted control.**
   *
   * This suite used to hold `new Set([ID])`: a bare id, and the gate keyed on
   * the uuid alone. `2Q-FOUNDATION-004` executed what that admitted — one
   * vouched-for uuid opened `inbox/`, `work/`, `people/`, `projects/` AND
   * `memories/`. Inert at the time, because the reviews page passed an empty
   * set; live the moment slice 2Q.1 filled it.
   *
   * The set now holds `type:id` pairs, and the surface segment is read back to
   * a type. `ID` below is vouched for **as a task**, so a `work/` href is
   * admitted and an `inbox/` href for the same id is refused — which is the
   * exact case that used to pass.
   */
  const ALLOWED = new Set([`task:${ID}`]);

  const REFUSED = [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "vbscript:msgbox(1)",
    "http://evil.test",
    "https://evil.test/path",
    "mailto:someone@evil.test",
    "//evil.test/path",
    "/pt-BR/app/work",
    `/pt-BR/app/work/${OTHER_ID}`,
    "/pt-BR/app/work/not-a-uuid",
    `/fr/app/work/${ID}`,
    "../../etc/passwd",
    `https://app.test/pt-BR/app/work/${ID}`,
  ];

  it.each(REFUSED)("refuses %s", (href) => {
    expect(authorizeHref(href, ALLOWED)).toBeNull();
  });

  it("admits an internal route whose (type, id) pair is vouched for", () => {
    // The positive half. Without it every check above could pass by returning
    // null unconditionally, forever — including after ids become available.
    expect(authorizeHref(`/pt-BR/app/work/${ID}`, ALLOWED)).toBe(`/pt-BR/app/work/${ID}`);
    expect(authorizeHref(`/en/app/work/${ID}`, ALLOWED)).toBe(`/en/app/work/${ID}`);
    expect(authorizeHref(`/pt-BR/app/work/${ID.toUpperCase()}`, ALLOWED)).not.toBeNull();
    // And an entry-vouched id admits an entry route, so the gate is not simply
    // hard-coded to one surface.
    const asEntry = new Set([`entry:${ID}`]);
    expect(authorizeHref(`/en/app/inbox/${ID}`, asEntry)).toBe(`/en/app/inbox/${ID}`);
  });

  it("REFUSES the same id on a surface it was not vouched for — the planted control", () => {
    /*
     * **This is the assertion `2Q-FOUNDATION-004` predicted, inverted.** Every
     * href below was admitted before this slice, by this exact allow-set. Each
     * one is now refused, and the list is written out rather than summarised so
     * a regression names the surface it re-opened.
     */
    for (const surface of ["inbox", "memories"]) {
      expect(
        authorizeHref(`/pt-BR/app/${surface}/${ID}`, ALLOWED),
        `a task-vouched id still opens ${surface}/`,
      ).toBeNull();
    }
    // A surface that maps to no citable type is refused outright — stricter
    // than a mismatch, and it needs no second rule.
    for (const surface of ["people", "projects", "organizations", "files"]) {
      expect(
        authorizeHref(`/pt-BR/app/${surface}/${ID}`, ALLOWED),
        `${surface}/ is admissible, and nothing vouches for that type`,
      ).toBeNull();
      expect(authorizeHref(`/pt-BR/app/${surface}/${ID}`, new Set([`entry:${ID}`]))).toBeNull();
    }
  });

  it("is not vacuous: the OLD, id-only rule would have admitted every one of those", () => {
    // The control that the block above tests a real change rather than a set
    // that simply never matches. This is the retired gate, in one line.
    const oldGate = (href: string, ids: ReadonlySet<string>) => {
      const match = /^\/(?:pt-BR|en)\/app\/[a-z-]+\/([0-9a-fA-F-]{36})$/.exec(href);
      return match && ids.has(match[1].toLowerCase()) ? href : null;
    };
    for (const surface of ["inbox", "memories", "people", "projects"]) {
      expect(oldGate(`/pt-BR/app/${surface}/${ID}`, new Set([ID]))).not.toBeNull();
    }
  });

  it("renders a refused link as its own words, losing the navigation and nothing else", () => {
    const blocks = parseReviewMarkdown("veja [o relatório](https://evil.test/steal) agora", {
      vouchedFor: ALLOWED,
    });
    const inline = blocks[0].kind === "paragraph" ? blocks[0].inline : [];
    expect(inline.every((node) => node.kind !== "link")).toBe(true);
    expect(textOf(inline)).toBe("veja o relatório agora");
  });

  it("renders an allowed link as an anchor carrying that exact href", () => {
    const blocks = parseReviewMarkdown(`veja [a tarefa](/pt-BR/app/work/${ID}) agora`, {
      vouchedFor: ALLOWED,
    });
    const inline = blocks[0].kind === "paragraph" ? blocks[0].inline : [];
    const link = inline.find((node) => node.kind === "link");
    expect(link).toEqual({ kind: "link", value: "a tarefa", href: `/pt-BR/app/work/${ID}` });
  });

  it("vouches for nothing when the allow-set is empty, which is a review with no stored references", () => {
    const blocks = parseReviewMarkdown(`[a tarefa](/pt-BR/app/work/${ID})`);
    const inline = blocks[0].kind === "paragraph" ? blocks[0].inline : [];
    expect(inline.every((node) => node.kind !== "link")).toBe(true);
    expect(textOf(inline)).toBe("a tarefa");
  });
});

describe("display-order spoofing cannot survive the parse", () => {
  it("removes bidirectional overrides and control characters", () => {
    expect(stripUnsafeCharacters(`concluído${RLO}odíulcnoc${PDF}`)).toBe("concluídoodíulcnoc");
    expect(stripUnsafeCharacters(`a${CONTROLS}b`)).toBe("ab");
  });

  it("keeps the two characters the parser gives meaning to", () => {
    // The control: an over-eager strip would remove the newlines and collapse
    // every block into one paragraph, which is the defect being repaired.
    expect(stripUnsafeCharacters("a\nb\tc")).toBe("a\nb\tc");
    expect(kindsOf(parseReviewMarkdown(`### t${RLO}\n\n- um`))).toEqual(["heading", "list"]);
  });

  it("treats a lone carriage return as a line break rather than deleting it", () => {
    expect(kindsOf(parseReviewMarkdown("### um\r\r- dois"))).toEqual(["heading", "list"]);
  });
});

describe("long and adversarial content stays bounded and total", () => {
  it("parses the 8000-character ceiling the schema allows", () => {
    const long = Array.from({ length: 200 }, (_, index) => `- item ${index} com texto suficiente`).join("\n");
    const blocks = parseReviewMarkdown(long);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind === "list" && blocks[0].items).toHaveLength(200);
  });

  it("returns without throwing on unterminated markers", () => {
    for (const source of ["**sem fim", "`sem fim", "[rótulo](", "*a**b*", "___", "###### "]) {
      expect(() => parseReviewMarkdown(source)).not.toThrow();
    }
  });

  it("never loses a word to an unterminated marker", () => {
    const blocks = parseReviewMarkdown("**forte sem fim e mais texto");
    expect(blocks[0].kind === "paragraph" && textOf(blocks[0].inline)).toBe("**forte sem fim e mais texto");
  });
});
