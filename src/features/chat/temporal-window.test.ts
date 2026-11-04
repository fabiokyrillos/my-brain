import { describe, expect, it } from "vitest";

import { byRecency, readTemporalQuestion, temporalWindowFor, type TemporalSpan } from "./temporal-window";

const ZONE = "America/Sao_Paulo"; // UTC−3, no daylight saving since 2019
const TODAY = { year: 2026, month: 11, day: 4 } as const; // a Wednesday

const spanOf = (question: string) => readTemporalQuestion(question).span;

describe("readTemporalQuestion — the words, with no clock and no zone", () => {
  it.each([
    ["O que eu fiz hoje?", { kind: "day", offset: 0 }],
    ["o que aconteceu ontem", { kind: "day", offset: -1 }],
    ["What did I write yesterday?", { kind: "day", offset: -1 }],
    ["e anteontem?", { kind: "day", offset: -2 }],
    ["what happened the day before yesterday", { kind: "day", offset: -2 }],
    ["O que eu registrei essa semana?", { kind: "week", offset: 0 }],
    ["o que aconteceu na semana passada?", { kind: "week", offset: -1 }],
    ["what did I do last week", { kind: "week", offset: -1 }],
    ["gastos deste mês", { kind: "month", offset: 0 }],
    ["o que anotei desta semana", { kind: "week", offset: 0 }],
    ["o que falei mês passado sobre o carro", { kind: "month", offset: -1 }],
    ["médicos este ano", { kind: "year", offset: 0 }],
    ["viagens do ano passado", { kind: "year", offset: -1 }],
    ["O que falei sobre a viagem em março?", { kind: "named_month", month: 3, year: null }],
    ["what did I say about the trip in March", { kind: "named_month", month: 3, year: null }],
    ["exames de março de 2025", { kind: "named_month", month: 3, year: 2025 }],
    ["the dentist in March 2025", { kind: "named_month", month: 3, year: 2025 }],
    ["o que aconteceu em 2025?", { kind: "year_number", year: 2025 }],
    ["nos últimos 10 dias", { kind: "last_days", days: 10 }],
    ["nas últimas 2 semanas", { kind: "last_days", days: 14 }],
    ["in the last 30 days", { kind: "last_days", days: 30 }],
  ] as const)("%s → a span", (question, expected) => {
    expect(spanOf(question)).toEqual(expected);
  });

  it.each([
    "O que falei sobre a viagem?",
    "Quem é a Ana?",
    "o que aconteceu ontem e na semana passada?",
    "hoje ou ontem?",
    "nos últimos 0 dias",
    "nos últimos 400 dias",
    "",
  ])("%s → no span, because it names none or more than one", (question) => {
    expect(spanOf(question)).toBeNull();
  });

  it("reads nothing past its length bound", () => {
    expect(spanOf(`${"palavra ".repeat(40)} ontem`)).toBeNull();
  });

  it.each([
    ["Quando foi a última vez que fui ao dentista?", true],
    ["quando eu fui ao cardiologista", true],
    ["qual o registro mais recente sobre a casa", true],
    ["When did I last see the doctor?", true],
    ["what did I write recently", true],
    ["O que falei sobre a viagem?", false],
  ] as const)("%s → recency %s", (question, recency) => {
    expect(readTemporalQuestion(question).recency).toBe(recency);
  });

  it("reads a span and recency together", () => {
    expect(readTemporalQuestion("quando foi a última vez em março?")).toEqual({
      span: { kind: "named_month", month: 3, year: null },
      recency: true,
    });
  });
});

describe("temporalWindowFor — the owner's local days, as instants", () => {
  const windowOf = (span: TemporalSpan) => temporalWindowFor(span, TODAY, ZONE);

  it("puts a day at the owner's midnights, not UTC's", () => {
    expect(windowOf({ kind: "day", offset: 0 })).toEqual({
      since: "2026-11-04T03:00:00.000Z",
      until: "2026-11-05T03:00:00.000Z",
    });
    expect(windowOf({ kind: "day", offset: -1 }).since).toBe("2026-11-03T03:00:00.000Z");
  });

  it("starts a week on Monday, and last week is the whole previous one", () => {
    expect(windowOf({ kind: "week", offset: 0 })).toEqual({
      since: "2026-11-02T03:00:00.000Z",
      until: "2026-11-09T03:00:00.000Z",
    });
    expect(windowOf({ kind: "week", offset: -1 })).toEqual({
      since: "2026-10-26T03:00:00.000Z",
      until: "2026-11-02T03:00:00.000Z",
    });
  });

  it("reads a month and a year by their own lengths", () => {
    expect(windowOf({ kind: "month", offset: -1 })).toEqual({
      since: "2026-10-01T03:00:00.000Z",
      until: "2026-11-01T03:00:00.000Z",
    });
    expect(windowOf({ kind: "year", offset: 0 })).toEqual({
      since: "2026-01-01T03:00:00.000Z",
      until: "2027-01-01T03:00:00.000Z",
    });
    expect(windowOf({ kind: "year_number", year: 2024 }).until).toBe("2025-01-01T03:00:00.000Z");
  });

  it("takes the most recent March that has begun when no year is named", () => {
    expect(windowOf({ kind: "named_month", month: 3, year: null })).toEqual({
      since: "2026-03-01T03:00:00.000Z",
      until: "2026-04-01T03:00:00.000Z",
    });
    // In November, a December with no year is last year's.
    expect(windowOf({ kind: "named_month", month: 12, year: null }).since).toBe("2025-12-01T03:00:00.000Z");
    expect(windowOf({ kind: "named_month", month: 2, year: 2024 }).until).toBe("2024-03-01T03:00:00.000Z");
  });

  it("ends 'the last N days' with today, inclusive", () => {
    expect(windowOf({ kind: "last_days", days: 7 })).toEqual({
      since: "2026-10-29T03:00:00.000Z",
      until: "2026-11-05T03:00:00.000Z",
    });
  });

  it("keeps a day exactly a day across a clock change", () => {
    // New York, the Sunday clocks went back in 2026: a 25-hour day.
    const window = temporalWindowFor({ kind: "day", offset: 0 }, { year: 2026, month: 11, day: 1 }, "America/New_York");
    expect(new Date(window.until).getTime() - new Date(window.since).getTime()).toBe(25 * 60 * 60 * 1000);
  });
});

describe("byRecency — newest first, never dropping a row", () => {
  it("orders by the instant, keeps ties stable and undated rows last", () => {
    const rows = [
      { id: "a", occurredAt: "2026-03-01T12:00:00.000Z" },
      { id: "b", occurredAt: "not a date" },
      { id: "c", occurredAt: "2026-10-01T12:00:00.000Z" },
      { id: "d", occurredAt: "2026-03-01T12:00:00.000Z" },
    ];
    expect(byRecency(rows).map((row) => row.id)).toEqual(["c", "a", "d", "b"]);
    expect(rows.map((row) => row.id)).toEqual(["a", "b", "c", "d"]);
  });
});
