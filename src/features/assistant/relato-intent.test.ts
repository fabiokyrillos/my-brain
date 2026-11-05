import { describe, expect, it } from "vitest";

import { looksLikeRelato } from "./relato-intent";

describe("looksLikeRelato — keep what happened, answer what is asked", () => {
  it.each([
    "Fui no cardiologista hoje, Dr. Silva pediu exames",
    "Hoje paguei a conta de luz",
    "Conversei com a Ana sobre a viagem",
    "Comprei as passagens para Lisboa",
    "I went to the dentist this morning",
    "Today I paid the rent",
  ])("keeps %j", (text) => {
    expect(looksLikeRelato(text)).toBe(true);
  });

  it.each([
    "O que eu fiz ontem?",
    "Quando fui ao cardiologista",
    "me diga o que comprei",
    "liste o que paguei este mês",
    "what did I buy",
    "show me what I paid",
    "Preciso ligar para a Ana",
    "fui",
    "Lembrete amanhã às 9",
  ])("does not keep %j", (text) => {
    expect(looksLikeRelato(text)).toBe(false);
  });
});
