import { describe, expect, it } from "vitest";

import type { SearchResult } from "./contracts";
import { groupResults, rowSnippet, splitMatches } from "./presentation";

const result = (domain: SearchResult["domain"], id: string): SearchResult => ({
  domain,
  id,
  title: id,
  snippet: null,
  occurredAt: null,
  href: `/x/${id}`,
});

describe("groupResults", () => {
  it("puts results under their kind, kinds in the product's order, rows as they arrived", () => {
    const groups = groupResults([
      result("files", "f1"),
      result("entries", "e1"),
      result("tasks", "t1"),
      result("entries", "e2"),
      result("tasks", "t2"),
    ]);
    expect(groups.map((group) => [group.domain, group.results.map((row) => row.id)])).toEqual([
      ["tasks", ["t1", "t2"]],
      ["entries", ["e1", "e2"]],
      ["files", ["f1"]],
    ]);
  });

  it("drops no result and invents no empty group", () => {
    const input = [result("people", "p1"), result("memories", "m1")];
    const groups = groupResults(input);
    expect(groups.flatMap((group) => group.results)).toHaveLength(input.length);
    expect(groups.every((group) => group.results.length > 0)).toBe(true);
  });
});

describe("splitMatches", () => {
  it("cuts the text at every match, whatever its case", () => {
    expect(splitMatches("Carro novo, carro velho", "carro")).toEqual([
      { text: "Carro", match: true },
      { text: " novo, ", match: false },
      { text: "carro", match: true },
      { text: " velho", match: false },
    ]);
  });

  it("returns the text whole when nothing matches or nothing was asked", () => {
    expect(splitMatches("Seguro", "carro")).toEqual([{ text: "Seguro", match: false }]);
    expect(splitMatches("Seguro", "  ")).toEqual([{ text: "Seguro", match: false }]);
    expect(splitMatches("", "carro")).toEqual([]);
  });

  it("loses no character", () => {
    const text = "…o carro do Zé (carro) — CARRO";
    expect(splitMatches(text, "carro").map((segment) => segment.text).join("")).toBe(text);
  });
});

describe("rowSnippet", () => {
  it("keeps a snippet that says more than the title", () => {
    expect(rowSnippet({ title: "Multa", snippet: "…chegou a notificação da multa do carro…" })).toBe(
      "…chegou a notificação da multa do carro…",
    );
  });

  it("cuts a snippet that only repeats the title", () => {
    expect(rowSnippet({ title: "Revisão do carro na sexta", snippet: "Revisão do carro  na sexta" })).toBeNull();
    expect(rowSnippet({ title: "Revisão do carro na sexta às 9h", snippet: "…do carro na sexta…" })).toBeNull();
  });

  it("is null without a snippet", () => {
    expect(rowSnippet({ title: "Zé", snippet: null })).toBeNull();
    expect(rowSnippet({ title: "Zé", snippet: "  " })).toBeNull();
  });
});
