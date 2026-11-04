/**
 * Life Brain B.2 — `LB-B-006`: tasks and reminders reach the knowledge answer.
 *
 * Chat retrieved entries and memories by vector only, so "quais exames estão
 * pendentes?" could not see the task that holds the answer — the status lived
 * in `tasks` and never reached the prompt (`AUDIT_CHAT_RETRIEVAL.md` §2.5). These
 * pin the text match that adds them: the words that are searched, what the
 * model is shown, and what is never shown.
 */

import { describe, expect, it } from "vitest";

import { loadStructuredSources, searchTermsFor, type StructuredSourceClient } from "./structured-sources";

describe("searchTermsFor", () => {
  it("keeps the content words of a question and drops the grammar", () => {
    expect(searchTermsFor("Quais exames estão pendentes?")).toEqual(["exame", "pendente"]);
    expect(searchTermsFor("O que ficou pendente do passaporte?")).toEqual(["pendente", "passaporte"]);
    expect(searchTermsFor("When is the dentist appointment?")).toEqual(["dentist", "appointment"]);
  });

  it("keeps accents, because the stored titles have them", () => {
    expect(searchTermsFor("E a consulta da cardiologista?")).toEqual(["consulta", "cardiologista"]);
    expect(searchTermsFor("o que falta da mudança")).toEqual(["falta", "mudança"]);
  });

  it("returns nothing for a question made only of grammar", () => {
    expect(searchTermsFor("o que tem?")).toEqual([]);
    expect(searchTermsFor("e aí?")).toEqual([]);
  });

  it("is bounded, deduplicated and never carries a filter metacharacter", () => {
    const terms = searchTermsFor("exame, exames (sangue) urina* fezes% glicemia_ colesterol triglicerídeos hemograma");
    expect(terms.length).toBeLessThanOrEqual(6);
    expect(new Set(terms).size).toBe(terms.length);
    for (const term of terms) expect(term).toMatch(/^[\p{L}\p{N}]+$/u);
  });
});

type Recorded = { table: string; or?: string; in?: [string, readonly string[]]; neq?: [string, string]; eq?: [string, string] };

function fakeClient(data: Record<string, unknown[]>, failing: readonly string[] = []) {
  const calls: Recorded[] = [];
  const client = {
    from(table: string) {
      const call: Recorded = { table };
      calls.push(call);
      const builder = {
        select: () => builder,
        or: (filter: string) => { call.or = filter; return builder; },
        in: (column: string, values: readonly string[]) => { call.in = [column, values]; return builder; },
        neq: (column: string, value: string) => { call.neq = [column, value]; return builder; },
        eq: (column: string, value: string) => { call.eq = [column, value]; return builder; },
        order: () => builder,
        limit: () => builder,
        then: (resolve: (value: { data: unknown[] | null; error: { message: string } | null }) => unknown) =>
          resolve(failing.includes(table) ? { data: null, error: { message: "boom" } } : { data: data[table] ?? [], error: null }),
      };
      return builder;
    },
  } as unknown as StructuredSourceClient;
  return { client, calls };
}

const base = { userId: "u1", locale: "pt-BR" as const, timezone: "America/Sao_Paulo" };

describe("loadStructuredSources", () => {
  it("asks for nothing when the question has no content word", async () => {
    const { client, calls } = fakeClient({});
    const result = await loadStructuredSources(client, { ...base, question: "o que tem?" });

    expect(result.sources).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("matches task and reminder titles on every term, owner-scoped, and skips cancelled rows", async () => {
    const { client, calls } = fakeClient({});
    await loadStructuredSources(client, { ...base, question: "Quais exames estão pendentes?" });

    const tasks = calls.find((call) => call.table === "tasks")!;
    const reminders = calls.find((call) => call.table === "reminders")!;
    expect(tasks.or).toBe("title.ilike.*exame*,title.ilike.*pendente*");
    expect(tasks.eq).toEqual(["user_id", "u1"]);
    expect(tasks.neq).toEqual(["status", "cancelled"]);
    expect(reminders.or).toBe("title.ilike.*exame*,title.ilike.*pendente*");
    expect(reminders.eq).toEqual(["user_id", "u1"]);
    expect(reminders.neq).toEqual(["status", "cancelled"]);
  });

  it("shows the model a task's title, state and dates, and a reminder's title and time", async () => {
    const { client } = fakeClient({
      tasks: [{ id: "t1", title: "Exame de sangue", status: "todo", due_at: "2026-11-06T23:59:59-03:00", planned_at: null, source_entry_id: null, created_at: "2026-11-02T12:00:00Z" }],
      reminders: [{ id: "r1", title: "Levar o pedido do exame", remind_at: "2026-11-06T11:00:00Z", status: "scheduled", entry_id: null, created_at: "2026-11-02T12:00:00Z" }],
    });
    const { sources } = await loadStructuredSources(client, { ...base, question: "Quais exames estão pendentes?" });

    expect(sources.map((source) => source.id)).toEqual(["task:t1", "reminder:r1"]);
    const [task, reminder] = sources;
    expect(task.type).toBe("task");
    expect(task.content).toBe("Tarefa: Exame de sangue. Situação: a fazer. Prazo: 06/11/2026.");
    expect(task.occurredAt).toBe("2026-11-06T23:59:59-03:00");
    expect(task.similarity).toBeNull();
    expect(reminder.type).toBe("reminder");
    expect(reminder.content).toBe("Lembrete: Levar o pedido do exame. Quando: 06/11/2026, 08:00. Situação: agendado.");
    expect(reminder.occurredAt).toBe("2026-11-06T11:00:00Z");
  });

  it("says a task is done, and that it has no deadline, rather than leaving the model to guess", async () => {
    const { client } = fakeClient({
      tasks: [{ id: "t2", title: "Exame de urina", status: "completed", due_at: null, planned_at: null, source_entry_id: null, created_at: "2026-10-01T12:00:00Z" }],
    });
    const { sources } = await loadStructuredSources(client, { ...base, locale: "en", question: "When was the urine exam?" });

    expect(sources[0]!.content).toBe("Task: Exame de urina. State: completed. No deadline.");
    expect(sources[0]!.occurredAt).toBe("2026-10-01T12:00:00Z");
  });

  it("never sends the model a task or reminder whose source is highly sensitive, or unreadable", async () => {
    const { client, calls } = fakeClient({
      tasks: [
        { id: "t1", title: "Exame de rotina", status: "todo", due_at: null, planned_at: null, source_entry_id: "e-normal", created_at: "2026-11-01T00:00:00Z" },
        { id: "t2", title: "Exame da biópsia", status: "todo", due_at: null, planned_at: null, source_entry_id: "e-secret", created_at: "2026-11-01T00:00:00Z" },
        { id: "t3", title: "Exame que ninguém lê", status: "todo", due_at: null, planned_at: null, source_entry_id: "e-gone", created_at: "2026-11-01T00:00:00Z" },
      ],
      reminders: [
        { id: "r1", title: "Resultado do exame da biópsia", remind_at: "2026-11-06T11:00:00Z", status: "scheduled", entry_id: "e-secret", created_at: "2026-11-01T00:00:00Z" },
      ],
      entries: [
        { id: "e-normal", sensitivity: "normal" },
        { id: "e-secret", sensitivity: "highly_sensitive" },
      ],
    });
    const result = await loadStructuredSources(client, { ...base, question: "exames" });

    expect(result.sources.map((source) => source.id)).toEqual(["task:t1"]);
    expect(result.sources.some((source) => source.content.includes("biópsia"))).toBe(false);
    expect(result.withheld).toBe(3);
    const entries = calls.find((call) => call.table === "entries")!;
    expect(entries.in?.[0]).toBe("id");
    expect([...(entries.in?.[1] ?? [])].sort()).toEqual(["e-gone", "e-normal", "e-secret"]);
    expect(entries.eq).toEqual(["user_id", "u1"]);
  });

  it("fails closed: if the classifications cannot be read, nothing sourced from an entry is sent", async () => {
    const { client } = fakeClient({
      tasks: [
        { id: "t1", title: "Exame manual", status: "todo", due_at: null, planned_at: null, source_entry_id: null, created_at: "2026-11-01T00:00:00Z" },
        { id: "t2", title: "Exame da anotação", status: "todo", due_at: null, planned_at: null, source_entry_id: "e1", created_at: "2026-11-01T00:00:00Z" },
      ],
    }, ["entries"]);
    const { sources } = await loadStructuredSources(client, { ...base, question: "exames" });

    expect(sources.map((source) => source.id)).toEqual(["task:t1"]);
  });

  it("lets one failed table cost only its own sources", async () => {
    const { client } = fakeClient({
      reminders: [{ id: "r1", title: "Exame amanhã", remind_at: "2026-11-06T11:00:00Z", status: "scheduled", entry_id: null, created_at: "2026-11-01T00:00:00Z" }],
    }, ["tasks"]);
    const result = await loadStructuredSources(client, { ...base, question: "exames" });

    expect(result.sources.map((source) => source.id)).toEqual(["reminder:r1"]);
    expect(result.failed).toEqual(["tasks"]);
  });
});
