import { describe, expect, it } from "vitest";

import { looksLikeMemoryIntent } from "./memory-intent";

describe("looksLikeMemoryIntent", () => {
  it("recognizes the imperative memory phrasings the owner named", () => {
    expect(looksLikeMemoryIntent("Lembre disso sempre")).toBe(true);
    expect(looksLikeMemoryIntent("Lembre disso sempre.")).toBe(true);
    expect(looksLikeMemoryIntent("Lembre-se disso: eu odeio reuniões antes das 10h")).toBe(true);
    expect(looksLikeMemoryIntent("Remember this: I hate meetings before 10am")).toBe(true);
    expect(looksLikeMemoryIntent("Always remember that Marina prefers email")).toBe(true);
  });

  it("recognizes both locales regardless of which one the interface is in", () => {
    // The recognizer takes no locale: a bilingual owner types in whichever
    // language the thought arrived in, and routing must not depend on a
    // preference set months ago.
    expect(looksLikeMemoryIntent("Guarde isso: o Jaime cuida do faturamento")).toBe(true);
    expect(looksLikeMemoryIntent("Nunca esqueça o aniversário da Marina")).toBe(true);
    expect(looksLikeMemoryIntent("Don't forget I sign off on every invoice")).toBe(true);
  });

  it("matches unaccented typing, which is how people actually type on phones", () => {
    expect(looksLikeMemoryIntent("nunca esqueca o aniversario da Marina")).toBe(true);
    expect(looksLikeMemoryIntent("nao esqueca de que eu prefiro email")).toBe(true);
  });

  it("never claims a question, however much it mentions remembering", () => {
    // These are the false positives that would cost the user a real answer, so
    // they are the ones the recognizer is designed around rather than a
    // afterthought: a question is routed to the knowledge answer.
    expect(looksLikeMemoryIntent("Você lembra o que combinei com o Jaime?")).toBe(false);
    expect(looksLikeMemoryIntent("Do you remember what I agreed with Jaime?")).toBe(false);
    expect(looksLikeMemoryIntent("O que combinei com Jaime?")).toBe(false);
    expect(looksLikeMemoryIntent("What did I agree with Marina?")).toBe(false);
  });

  it("refuses a memory phrase that is itself a question", () => {
    // The opener matches, but the sentence asks rather than instructs. The
    // question mark wins, because answering a question the user asked is
    // recoverable and silently swallowing it is not.
    expect(looksLikeMemoryIntent("Lembre disso sempre?")).toBe(false);
    expect(looksLikeMemoryIntent("Remember this?")).toBe(false);
  });

  it("does not claim task commands or captures", () => {
    expect(looksLikeMemoryIntent("Mude a prioridade da tarefa do relatório")).toBe(false);
    expect(looksLikeMemoryIntent("Adicione uma tarefa para revisar os números amanhã")).toBe(false);
    expect(looksLikeMemoryIntent("Marque a tarefa do relatório como feita")).toBe(false);
    expect(looksLikeMemoryIntent("Reunião com Marina amanhã às 14h")).toBe(false);
  });

  it("requires the phrase to open the sentence, not merely to appear in it", () => {
    // "…so remember this" buried in a paragraph is narration, not an
    // instruction, and the paragraph is far more likely to be a capture.
    expect(looksLikeMemoryIntent("Conversei com o Jaime hoje e ele pediu para lembrar disso")).toBe(false);
    expect(looksLikeMemoryIntent("The meeting went well and I should remember this")).toBe(false);
  });

  it("ignores leading punctuation, whitespace and case", () => {
    expect(looksLikeMemoryIntent("   LEMBRE DISSO sempre")).toBe(true);
    expect(looksLikeMemoryIntent("- remember this: invoices go to me")).toBe(true);
  });

  it("treats empty and whitespace-only text as no intent at all", () => {
    expect(looksLikeMemoryIntent("")).toBe(false);
    expect(looksLikeMemoryIntent("   ")).toBe(false);
  });
});
