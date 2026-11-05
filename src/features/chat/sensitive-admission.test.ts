import { describe, expect, it } from "vitest";

import { admitsSource, readSensitiveAsk } from "./sensitive-admission";

describe("readSensitiveAsk — the owner's words, both locales", () => {
  it.each([
    "Pode incluir os sensíveis",
    "inclua conteúdos sensíveis também",
    "quero tudo, mesmo os registros sensíveis",
    "include the sensitive ones",
    "including sensitive records, what did I write?",
    "sensitive ones too",
  ])("reads an explicit ask in %j", (question) => {
    expect(readSensitiveAsk(question).explicit).toBe(true);
  });

  it.each([
    "O que ficou pendente?",
    "Isso é um assunto sensível?",
    "What is sensitive about this?",
  ])("does not read an explicit ask in %j", (question) => {
    expect(readSensitiveAsk(question).explicit).toBe(false);
  });

  it.each([
    ["Quando foi minha última consulta com o cardiologista?", "health"],
    ["Como está a saúde da minha mãe?", "health"],
    ["Quanto paguei de imposto?", "finance"],
    ["Quando é o voo para Lisboa?", "travel"],
    ["What did the doctor say?", "health"],
    ["When is my flight?", "travel"],
    ["Quais ideias tive essa semana?", "ideas"],
  ] as const)("finds the area in %j", (question, area) => {
    expect(readSensitiveAsk(question).areas.has(area)).toBe(true);
  });

  it("finds two areas when the question names two", () => {
    const areas = readSensitiveAsk("A consulta da minha filha foi cara?").areas;
    expect(areas.has("health")).toBe(true);
    expect(areas.has("family")).toBe(true);
  });

  it("finds no area in a question that names none", () => {
    expect(readSensitiveAsk("O que eu fiz ontem?").areas.size).toBe(0);
  });
});

describe("admitsSource — LB-B-010", () => {
  const ordinary = { explicit: false, areas: new Set<never>() };

  it("admits normal and private sources to any question", () => {
    expect(admitsSource({ level: "normal", area: null }, ordinary)).toBe(true);
    expect(admitsSource({ level: "private", area: "health" }, ordinary)).toBe(true);
  });

  it("admits a highly sensitive source only on an explicit ask or the same area", () => {
    const secret = { level: "highly_sensitive" as const, area: "health" as const };
    expect(admitsSource(secret, ordinary)).toBe(false);
    expect(admitsSource(secret, { explicit: true, areas: new Set() })).toBe(true);
    expect(admitsSource(secret, readSensitiveAsk("como está minha saúde?"))).toBe(true);
    expect(admitsSource(secret, readSensitiveAsk("quanto gastei na viagem?"))).toBe(false);
  });

  it("never admits a highly sensitive source with no area by naming an area", () => {
    expect(admitsSource({ level: "highly_sensitive", area: null }, readSensitiveAsk("minha saúde"))).toBe(false);
  });
});
