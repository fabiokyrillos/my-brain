import { describe, expect, it } from "vitest";

import { detectAgendaQuestion, type AgendaSpan } from "./agenda-intent";

/**
 * Life Brain B.1 (`LB-B-005`) — which sentences are agenda questions.
 *
 * The positive list is what the route exists for; the negative list is what it
 * must never take. A false positive skips the command parse **and** the
 * knowledge answer, so the negatives are the half that carries the risk: every
 * imperative that mentions a day is a task command, every past-tense question
 * is a memory question, and every qualified question ("com a Ana", "sobre a
 * viagem") is a retrieval question the agenda cannot answer honestly.
 */
const POSITIVES: readonly (readonly [string, AgendaSpan])[] = [
  // pt-BR
  ["O que tenho hoje?", { kind: "day", offset: 0 }],
  ["o que eu tenho amanhã?", { kind: "day", offset: 1 }],
  ["O que tenho depois de amanhã?", { kind: "day", offset: 2 }],
  ["O que tenho essa semana?", { kind: "week", offset: 0 }],
  ["O que tenho na próxima semana?", { kind: "week", offset: 1 }],
  ["Tenho algo amanhã?", { kind: "day", offset: 1 }],
  ["Tenho algum compromisso hoje?", { kind: "day", offset: 0 }],
  ["Tenho alguma coisa no dia 12?", { kind: "day_of_month", day: 12 }],
  ["Como está minha agenda amanhã?", { kind: "day", offset: 1 }],
  ["Qual é a minha agenda de hoje?", { kind: "day", offset: 0 }],
  ["Minha agenda da semana que vem", { kind: "week", offset: 1 }],
  ["O que tenho este mês?", { kind: "month", offset: 0 }],
  ["o que tenho marcado pro mês que vem?", { kind: "month", offset: 1 }],
  ["Quais são meus compromissos amanhã?", { kind: "day", offset: 1 }],
  // en
  ["What do I have today?", { kind: "day", offset: 0 }],
  ["what do i have tomorrow", { kind: "day", offset: 1 }],
  ["What do I have this week?", { kind: "week", offset: 0 }],
  ["What's on my calendar next week?", { kind: "week", offset: 1 }],
  ["Do I have anything on the 12th?", { kind: "day_of_month", day: 12 }],
  ["What's my schedule for this month?", { kind: "month", offset: 0 }],
  ["Do I have anything the day after tomorrow?", { kind: "day", offset: 2 }],
];

const NEGATIVES: readonly string[] = [
  // Commands that mention a day — the command parser's, never this route's.
  "Mova a tarefa do relatório para amanhã",
  "Adie o dentista para a próxima semana",
  "Move the report task to tomorrow",
  // A statement, not a question — capture-shaped, not agenda-shaped.
  "Tenho dentista amanhã às 9h",
  "Registre que amanhã tenho dentista",
  // Past tense and "last time" belong to retrieval (and to B.3's window).
  "O que eu fiz ontem?",
  "O que tive semana passada?",
  "What did I do today?",
  "Quando fui ao médico pela última vez?",
  // A qualified question the agenda cannot answer honestly.
  "O que tenho amanhã com a Ana?",
  "What do I have tomorrow about the trip?",
  // Questions with no window at all.
  "Quais exames estão pendentes?",
  "O que tenho pendente?",
  "What do I have to do?",
  // Two windows in one sentence: ambiguous, so not this route.
  "O que tenho hoje e amanhã?",
  // A named month is B.3's parser, not a guess here.
  "Tenho algo no dia 3 de dezembro?",
  // A day of the month that does not exist.
  "Tenho algo no dia 45?",
  // The date itself, not the agenda.
  "Que dia é hoje?",
  "O que é hoje?",
];

describe("detectAgendaQuestion", () => {
  it.each(POSITIVES)("reads %j as an agenda question", (sentence, span) => {
    expect(detectAgendaQuestion(sentence)).toEqual(span);
  });

  it.each(NEGATIVES)("does not take %j", (sentence) => {
    expect(detectAgendaQuestion(sentence)).toBeNull();
  });

  it("covers at least twenty sentences across both locales", () => {
    expect(POSITIVES.length + NEGATIVES.length).toBeGreaterThanOrEqual(20);
    expect(POSITIVES.length).toBeGreaterThanOrEqual(10);
    expect(NEGATIVES.length).toBeGreaterThanOrEqual(10);
  });

  it("refuses a long text even when it opens like an agenda question", () => {
    // An agenda question is short. A paragraph that happens to start with
    // "o que tenho amanhã" is something else, and the model should read it.
    expect(detectAgendaQuestion(`O que tenho amanhã? ${"contexto ".repeat(40)}`)).toBeNull();
  });
});
