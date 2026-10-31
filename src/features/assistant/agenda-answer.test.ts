import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { CalendarItemView, CalendarProjection } from "@/features/calendar/calendar-contracts";
import { AGENDA_REACH, parseCitations } from "@/features/conversation-sources/contracts";
import { UNDETERMINED } from "@/features/sensitivity/task-derivation";

import { agendaQueryFor, composeAgendaAnswer } from "./agenda-answer";
import type { AgendaSpan } from "./agenda-intent";

const ZONE = "America/Sao_Paulo";
const TODAY = { year: 2026, month: 10, day: 31 } as const;

const TASK_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TASK_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const REMINDER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function item(overrides: Partial<CalendarItemView> & Pick<CalendarItemView, "id" | "lane" | "at" | "date">): CalendarItemView {
  return {
    commitment: overrides.lane === "intention" ? "intended" : "committed",
    title: "Sem título",
    sensitivity: UNDETERMINED,
    href: null,
    elapsed: false,
    reschedule: null,
    repeats: null,
    ...overrides,
  };
}

function projection(
  days: readonly { date: string; inPeriod?: boolean; items: readonly CalendarItemView[] }[],
  failedLanes: CalendarProjection["failedLanes"] = [],
  rangeStart: CalendarProjection["rangeStart"] = TODAY,
): CalendarProjection {
  const all = days.flatMap((day) => day.items);
  return {
    days: days.map((day) => ({ date: day.date, isToday: false, inPeriod: day.inPeriod ?? true, items: [...day.items] })),
    timezone: ZONE,
    rangeStart,
    rangeEnd: rangeStart,
    failedLanes: [...failedLanes],
    itemCount: all.length,
  };
}

const TOMORROW: AgendaSpan = { kind: "day", offset: 1 };

describe("agendaQueryFor — the window each question names", () => {
  it("reads today, tomorrow and the day after as single days", () => {
    expect(agendaQueryFor({ kind: "day", offset: 0 }, TODAY)).toEqual({
      orientation: "day",
      anchor: TODAY,
      lanes: ["deadline", "intention", "reminder"],
    });
    expect(agendaQueryFor(TOMORROW, TODAY).anchor).toEqual({ year: 2026, month: 11, day: 1 });
    expect(agendaQueryFor({ kind: "day", offset: 2 }, TODAY).anchor).toEqual({ year: 2026, month: 11, day: 2 });
  });

  it("reads this and next week as the calendar's own week", () => {
    expect(agendaQueryFor({ kind: "week", offset: 0 }, TODAY)).toMatchObject({ orientation: "week", anchor: TODAY });
    expect(agendaQueryFor({ kind: "week", offset: 1 }, TODAY)).toMatchObject({
      orientation: "week",
      anchor: { year: 2026, month: 11, day: 7 },
    });
  });

  it("reads this and next month as months", () => {
    expect(agendaQueryFor({ kind: "month", offset: 0 }, TODAY)).toMatchObject({ orientation: "month", anchor: TODAY });
    expect(agendaQueryFor({ kind: "month", offset: 1 }, TODAY)).toMatchObject({
      orientation: "month",
      anchor: { year: 2026, month: 11 },
    });
  });

  it("reads 'dia N' as the next date with that day, today included", () => {
    expect(agendaQueryFor({ kind: "day_of_month", day: 31 }, TODAY).anchor).toEqual(TODAY);
    expect(agendaQueryFor({ kind: "day_of_month", day: 12 }, TODAY).anchor).toEqual({ year: 2026, month: 11, day: 12 });
    // November has no 31st, so "dia 31" asked on the 5th is December's.
    expect(agendaQueryFor({ kind: "day_of_month", day: 31 }, { year: 2026, month: 11, day: 5 }).anchor)
      .toEqual({ year: 2026, month: 12, day: 31 });
  });

  it("never asks the projection for reviews or unconfirmed suggestions", () => {
    for (const span of [TOMORROW, { kind: "week", offset: 0 }, { kind: "month", offset: 1 }] as const) {
      expect(agendaQueryFor(span, TODAY).lanes).toEqual(["deadline", "intention", "reminder"]);
    }
  });
});

describe("composeAgendaAnswer — the projection, said as an answer", () => {
  it("lists each item with its time and kind, and cites only the tasks", () => {
    const answer = composeAgendaAnswer({
      span: TOMORROW,
      locale: "pt-BR",
      projection: projection([{
        date: "2026-11-01",
        items: [
          item({ id: `reminder:${REMINDER}`, lane: "reminder", at: "2026-11-01T12:00:00.000Z", date: "2026-11-01", title: "Dentista" }),
          item({ id: `deadline:${TASK_A}`, lane: "deadline", at: "2026-11-01T20:00:00.000Z", date: "2026-11-01", title: "Enviar o relatório" }),
        ],
      }]),
    });

    expect(answer.content).toContain("Amanhã, você tem 2 itens na agenda:");
    expect(answer.content).toContain("09:00 · Dentista · lembrete");
    expect(answer.content).toContain("17:00 · Enviar o relatório · prazo");

    const citations = parseCitations(answer.citations);
    expect(citations.evidence).toBe("evidenced");
    expect(citations.reach).toEqual(AGENDA_REACH);
    // A reminder has no citable type yet (B.2 decides it), so it is listed and
    // not cited; the task is cited by the id the projection read.
    expect(citations.sources).toEqual([
      { id: `task:${TASK_A}`, type: "task", sourceId: TASK_A, support: "product_state" },
    ]);
    expect(answer.citedSourceIds).toEqual([`task:${TASK_A}`]);
  });

  it("cites only ids the projection returned, once each", () => {
    const answer = composeAgendaAnswer({
      span: TOMORROW,
      locale: "pt-BR",
      projection: projection([{
        date: "2026-11-01",
        items: [
          item({ id: `deadline:${TASK_A}`, lane: "deadline", at: "2026-11-01T13:00:00.000Z", date: "2026-11-01", title: "A" }),
          // The same task, planned AND due the same day: one source, two lines.
          item({ id: `intention:${TASK_A}`, lane: "intention", at: "2026-11-01T12:00:00.000Z", date: "2026-11-01", title: "A" }),
          item({ id: `intention:${TASK_B}`, lane: "intention", at: "2026-11-01T14:00:00.000Z", date: "2026-11-01", title: "B" }),
        ],
      }]),
    });

    const read = new Set([TASK_A, TASK_B]);
    expect(answer.citedSourceIds).toEqual([`task:${TASK_A}`, `task:${TASK_B}`]);
    for (const source of parseCitations(answer.citations).sources) {
      expect(read.has(source.sourceId)).toBe(true);
    }
  });

  it("masks a highly sensitive title in position rather than dropping it", () => {
    const answer = composeAgendaAnswer({
      span: TOMORROW,
      locale: "pt-BR",
      projection: projection([{
        date: "2026-11-01",
        items: [item({
          id: `deadline:${TASK_A}`,
          lane: "deadline",
          at: "2026-11-01T13:00:00.000Z",
          date: "2026-11-01",
          title: "Resultado do exame de HIV",
          sensitivity: { kind: "derived", level: "highly_sensitive" },
        })],
      }]),
    });

    expect(answer.content).not.toContain("HIV");
    expect(answer.content).toContain("Amanhã, você tem 1 item na agenda:");
    expect(answer.content).toContain("10:00 · item protegido · prazo");
    expect(answer.content).toContain("Itens protegidos ficam ocultos aqui");
  });

  it("says plainly when the window is empty, and records no qualifying evidence", () => {
    const answer = composeAgendaAnswer({
      span: TOMORROW,
      locale: "pt-BR",
      projection: projection([{ date: "2026-11-01", items: [] }]),
    });

    expect(answer.content).toBe("Não encontrei nada na sua agenda amanhã.");
    const citations = parseCitations(answer.citations);
    expect(citations.evidence).toBe("no_qualifying_evidence");
    expect(citations.sources).toEqual([]);
  });

  it("names a lane it could not read instead of calling the day empty", () => {
    const answer = composeAgendaAnswer({
      span: TOMORROW,
      locale: "pt-BR",
      projection: projection([{ date: "2026-11-01", items: [] }], [{ lane: "reminder" }]),
    });

    expect(answer.content).toContain("Não consegui ler os lembretes agora, então pode haver mais.");
    expect(answer.content).not.toContain("Não encontrei nada");
  });

  it("refuses to answer when no lane could be read at all", () => {
    expect(() => composeAgendaAnswer({
      span: TOMORROW,
      locale: "pt-BR",
      projection: projection([{ date: "2026-11-01", items: [] }], [
        { lane: "deadline" }, { lane: "intention" }, { lane: "reminder" },
      ]),
    })).toThrow();
  });

  it("groups a week by day, and a month keeps only its own days", () => {
    const week = composeAgendaAnswer({
      span: { kind: "week", offset: 0 },
      locale: "pt-BR",
      projection: projection([
        { date: "2026-10-26", items: [item({ id: `deadline:${TASK_A}`, lane: "deadline", at: "2026-10-26T13:00:00.000Z", date: "2026-10-26", title: "A" })] },
        { date: "2026-10-27", items: [] },
        { date: "2026-10-28", items: [item({ id: `deadline:${TASK_B}`, lane: "deadline", at: "2026-10-28T13:00:00.000Z", date: "2026-10-28", title: "B" })] },
      ]),
    });
    expect(week.content).toContain("Esta semana, você tem 2 itens na agenda:");
    expect(week.content).toMatch(/seg\.?, 26 de out/u);
    expect(week.content).toMatch(/qua\.?, 28 de out/u);
    expect(week.content).not.toMatch(/ter\.?, 27 de out/u);

    const month = composeAgendaAnswer({
      span: { kind: "month", offset: 0 },
      locale: "pt-BR",
      projection: projection([
        // The grid's padding from the previous month.
        { date: "2026-09-28", inPeriod: false, items: [item({ id: `deadline:${TASK_A}`, lane: "deadline", at: "2026-09-28T13:00:00.000Z", date: "2026-09-28", title: "Fora" })] },
        { date: "2026-10-02", items: [item({ id: `deadline:${TASK_B}`, lane: "deadline", at: "2026-10-02T13:00:00.000Z", date: "2026-10-02", title: "Dentro" })] },
      ]),
    });
    expect(month.content).toContain("Este mês, você tem 1 item na agenda:");
    expect(month.content).toContain("Dentro");
    expect(month.content).not.toContain("Fora");
    expect(month.citedSourceIds).toEqual([`task:${TASK_B}`]);
  });

  it("bounds a long list and points at the Agenda for the rest", () => {
    const items = Array.from({ length: 30 }, (_, index) => {
      const id = `${index.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;
      return item({ id: `deadline:${id}`, lane: "deadline", at: "2026-11-01T13:00:00.000Z", date: "2026-11-01", title: `T${index}` });
    });
    const answer = composeAgendaAnswer({ span: TOMORROW, locale: "pt-BR", projection: projection([{ date: "2026-11-01", items }]) });

    expect(answer.content).toContain("Amanhã, você tem 30 itens na agenda:");
    expect(answer.content).toContain("…e mais 15. A Agenda mostra tudo.");
    // The envelope's own bound.
    expect(parseCitations(answer.citations).sources).toHaveLength(20);
  });

  it("answers in English through the same copy record", () => {
    const answer = composeAgendaAnswer({
      span: { kind: "day_of_month", day: 12 },
      locale: "en",
      projection: projection([{
        date: "2026-11-12",
        items: [item({ id: `reminder:${REMINDER}`, lane: "reminder", at: "2026-11-12T12:00:00.000Z", date: "2026-11-12", title: "Dentist" })],
      }], [], { year: 2026, month: 11, day: 12 }),
    });
    expect(answer.content).toContain("On November 12, you have 1 item on your agenda:");
    expect(answer.content).toContain("09:00 · Dentist · reminder");

    const empty = composeAgendaAnswer({ span: TOMORROW, locale: "en", projection: projection([{ date: "2026-11-01", items: [] }]) });
    expect(empty.content).toBe("I found nothing on your agenda tomorrow.");
  });
});
