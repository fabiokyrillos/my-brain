import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Prose, proseBlocks } from "./prose";

describe("a turn is set as prose", () => {
  it("ends a paragraph at a blank line and keeps a single break inside one", () => {
    expect(proseBlocks("Primeira linha\nsegunda linha\n\nOutro parágrafo")).toEqual([
      { kind: "paragraph", text: "Primeira linha\nsegunda linha" },
      { kind: "paragraph", text: "Outro parágrafo" },
    ]);
  });

  it("reads consecutive marked lines as a list, numbered or not", () => {
    expect(proseBlocks("Faltam três coisas:\n1. Revisar\n2) Confirmar\n\n- um\n• dois\n* três\nFim.")).toEqual([
      { kind: "paragraph", text: "Faltam três coisas:" },
      { kind: "ordered", items: ["Revisar", "Confirmar"] },
      { kind: "unordered", items: ["um", "dois", "três"] },
      { kind: "paragraph", text: "Fim." },
    ]);
  });

  it("keeps an indented line with the item above it", () => {
    expect(proseBlocks("- um\n  ainda um\n- dois")).toEqual([{ kind: "unordered", items: ["um\nainda um", "dois"] }]);
  });

  it("does not take a date or a negative number for a list", () => {
    expect(proseBlocks("2026 foi um bom ano.\n-5 graus em Curitiba.")).toEqual([
      { kind: "paragraph", text: "2026 foi um bom ano.\n-5 graus em Curitiba." },
    ]);
  });

  it("has no block for an empty text", () => {
    expect(proseBlocks("")).toEqual([]);
    expect(proseBlocks("\n \n")).toEqual([]);
  });

  it("renders text, never markup", () => {
    const { container } = render(<Prose className="chat-message-body" text={"<b>oi</b> **forte**\n\n1. <img src=x>"} />);
    expect(container.querySelector("b, img")).toBeNull();
    expect(container.querySelector(".chat-message-body > p")?.textContent).toBe("<b>oi</b> **forte**");
    expect(container.querySelector(".chat-message-body > ol > li")?.textContent).toBe("<img src=x>");
  });
});
