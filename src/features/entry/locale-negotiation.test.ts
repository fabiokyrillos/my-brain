import { describe, expect, it } from "vitest";

import { negotiateEntryLocale } from "./locale-negotiation";

describe("2O-ENTRY-001: pt-BR is the fallback, not the answer", () => {
  it("gives an English browser English", () => {
    expect(negotiateEntryLocale("en-US,en;q=0.9")).toBe("en");
    expect(negotiateEntryLocale("en")).toBe("en");
    expect(negotiateEntryLocale("en-GB")).toBe("en");
  });

  it("gives a Portuguese browser Portuguese", () => {
    expect(negotiateEntryLocale("pt-BR,pt;q=0.9,en;q=0.8")).toBe("pt-BR");
    expect(negotiateEntryLocale("pt-PT")).toBe("pt-BR");
    expect(negotiateEntryLocale("pt")).toBe("pt-BR");
  });

  it("falls back to pt-BR only when nothing is understood", () => {
    // The fallback is a last resort. If it were reached by a browser that said
    // `en`, the page would be in the wrong language and the header would look
    // like it had been honoured.
    expect(negotiateEntryLocale(null)).toBe("pt-BR");
    expect(negotiateEntryLocale("")).toBe("pt-BR");
    expect(negotiateEntryLocale("de-DE,fr;q=0.7")).toBe("pt-BR");
    expect(negotiateEntryLocale("*")).toBe("pt-BR");
  });

  it("honours quality values rather than source order", () => {
    // A header is a ranked list, not a sequence. `en;q=0.9` before `pt;q=0.4`
    // means English even though Portuguese is written first.
    expect(negotiateEntryLocale("pt;q=0.4,en;q=0.9")).toBe("en");
    expect(negotiateEntryLocale("en;q=0.3,pt-BR;q=0.8")).toBe("pt-BR");
  });

  it("keeps source order when qualities tie", () => {
    expect(negotiateEntryLocale("en,pt")).toBe("en");
    expect(negotiateEntryLocale("pt,en")).toBe("pt-BR");
    expect(negotiateEntryLocale("en;q=0.5,pt;q=0.5")).toBe("en");
  });

  it("ignores a language with q=0, which means explicitly not wanted", () => {
    expect(negotiateEntryLocale("en;q=0,pt;q=0.5")).toBe("pt-BR");
    // And when every understood language is refused, the fallback applies.
    expect(negotiateEntryLocale("en;q=0,pt;q=0")).toBe("pt-BR");
  });

  it("survives a malformed header instead of throwing", () => {
    // The header is attacker-controllable. A parser that throws would turn a
    // public page into a 500 for anyone who sent a bad string.
    for (const header of ["en;q=", "en;q=abc", ";;;", "en;;q=0.5", "e".repeat(5000), "en;q=1.5"]) {
      expect(() => negotiateEntryLocale(header)).not.toThrow();
      expect(["pt-BR", "en"]).toContain(negotiateEntryLocale(header));
    }
  });

  it("is case-insensitive, as the specification requires", () => {
    expect(negotiateEntryLocale("EN-US")).toBe("en");
    expect(negotiateEntryLocale("PT-br")).toBe("pt-BR");
  });

  it("does not match a language that merely starts with the same letters", () => {
    // `eng` is not `en`, and a `startsWith` implementation would say it is.
    expect(negotiateEntryLocale("enm")).toBe("pt-BR");
    expect(negotiateEntryLocale("ptx")).toBe("pt-BR");
  });
});
