import { describe, expect, it } from "vitest";

import { getHistoryCopy, type HistoryCopy } from "./copy";
import { describeHistoryEvent, extractChanges, type HistoryEventRow } from "./event";

const pt = getHistoryCopy("pt-BR", "Brain");
const en = getHistoryCopy("en", "Brain");

/** Dates are formatted by the caller, so tests never depend on a timezone. */
const formatDate = (iso: string) => `[${iso.slice(0, 10)}]`;

function row(overrides: Partial<HistoryEventRow> = {}): HistoryEventRow {
  return {
    id: "audit-1",
    actionType: "task_updated",
    actor: "user",
    entityType: "task",
    entityId: "task-1",
    beforeState: null,
    afterState: null,
    occurredAt: "2026-07-30T18:00:00.000Z",
    ...overrides,
  };
}

const found = (label: string | null) => ({ found: true, label });
const missing = { found: false, label: null };

describe("describeHistoryEvent — who acted", () => {
  it("names the owner as 'Você'", () => {
    const event = describeHistoryEvent(row({ actionType: "task_created" }), found("Preparar relatório"), pt, formatDate);
    expect(event.sentence).toBe("Você adicionou a tarefa “Preparar relatório” à lista");
  });

  it("names the assistant by its configured name, not 'agent'", () => {
    const copy = getHistoryCopy("pt-BR", "Íris");
    const event = describeHistoryEvent(
      row({ actor: "agent", actionType: "entry_interpreted", entityType: "entry", entityId: "entry-1" }),
      found("Comprei passagens"),
      copy,
      formatDate,
    );
    expect(event.sentence).toBe("O Íris interpretou o registro “Comprei passagens”");
    expect(event.sentence).not.toMatch(/agent|Brain/);
  });

  it("names the system as 'O sistema'", () => {
    const event = describeHistoryEvent(
      row({ actor: "system", actionType: "entry_interpretation_failed", entityType: "entry" }),
      missing,
      pt,
      formatDate,
    );
    expect(event.sentence).toBe("O sistema não conseguiu interpretar o registro");
  });

  it("folds an unrecognised actor to the system rather than printing it", () => {
    const event = describeHistoryEvent(row({ actor: "root" }), missing, pt, formatDate);
    expect(event.actor).toBe("system");
    expect(event.sentence).not.toMatch(/root/);
  });
});

describe("describeHistoryEvent — what changed", () => {
  it("reads a single field change as one sentence, with both values localized", () => {
    const event = describeHistoryEvent(
      row({
        beforeState: { status: "todo", priority: "medium" },
        afterState: { status: "todo", priority: "high" },
      }),
      found("Preparar relatório"),
      pt,
      formatDate,
    );

    expect(event.sentence).toBe(
      "Você alterou a prioridade de “Preparar relatório” de Média para Alta",
    );
    // Folded into the sentence, so the row is not a sentence plus a one-row table.
    expect(event.changes).toEqual([]);
  });

  it("lists the fields separately when more than one changed", () => {
    const event = describeHistoryEvent(
      row({
        beforeState: { status: "todo", priority: "low" },
        afterState: { status: "completed", priority: "high" },
      }),
      found("Preparar relatório"),
      pt,
      formatDate,
    );

    expect(event.sentence).toBe("Você atualizou a tarefa “Preparar relatório”");
    expect(event.changes).toEqual([
      { field: "status", label: "Situação", from: "A fazer", to: "Concluída" },
      { field: "priority", label: "Prioridade", from: "Baixa", to: "Alta" },
    ]);
  });

  it("describes a date change through the caller's formatter", () => {
    const event = describeHistoryEvent(
      row({
        beforeState: { due_at: "2026-08-01T12:00:00.000Z" },
        afterState: { due_at: "2026-08-02T12:00:00.000Z" },
      }),
      found("Enviar proposta"),
      pt,
      formatDate,
    );
    expect(event.sentence).toBe(
      "Você alterou o prazo de “Enviar proposta” de [2026-08-01] para [2026-08-02]",
    );
  });

  it("says 'sem valor' for a side that was genuinely absent", () => {
    const event = describeHistoryEvent(
      row({ beforeState: { due_at: null }, afterState: { due_at: "2026-08-02T12:00:00.000Z" } }),
      found("Enviar proposta"),
      pt,
      formatDate,
    );
    expect(event.sentence).toBe(
      "Você alterou o prazo de “Enviar proposta” de sem valor para [2026-08-02]",
    );
  });
});

describe("describeHistoryEvent — never manufacturing detail", () => {
  it("gives a creation no from/to clause, because it has no before state", () => {
    const event = describeHistoryEvent(
      row({
        actionType: "task_created",
        beforeState: null,
        afterState: { status: "todo", priority: "high" },
      }),
      found("Revisar números"),
      pt,
      formatDate,
    );
    expect(event.sentence).toBe("Você adicionou a tarefa “Revisar números” à lista");
    expect(event.changes).toEqual([]);
  });

  it("skips a field recorded on only one side", () => {
    const changes = extractChanges(
      { beforeState: { status: "todo" }, afterState: { status: "todo", title: "Novo" } },
      "task",
      pt,
      formatDate,
    );
    expect(changes).toEqual([]);
  });

  it("drops a status value it has no label for rather than printing the raw enum", () => {
    const changes = extractChanges(
      { beforeState: { status: "todo" }, afterState: { status: "some_future_status" } },
      "task",
      pt,
      formatDate,
    );
    expect(changes).toEqual([]);
  });

  it("reads status against the right vocabulary for the entity type", () => {
    // `active` is a project status and not a task status. Rendering a project's
    // status through the task vocabulary would silently mislabel it.
    expect(
      extractChanges(
        { beforeState: { status: "active" }, afterState: { status: "paused" } },
        "project",
        pt,
        formatDate,
      ),
    ).toEqual([{ field: "status", label: "Situação", from: "Ativo", to: "Pausado" }]);

    expect(
      extractChanges(
        { beforeState: { status: "active" }, afterState: { status: "paused" } },
        "task",
        pt,
        formatDate,
      ),
    ).toEqual([]);
  });

  it("ignores a payload that is not an object", () => {
    expect(
      extractChanges({ beforeState: "todo", afterState: ["completed"] }, "task", pt, formatDate),
    ).toEqual([]);
  });

  it("falls back to a neutral sentence for an action type it has no copy for", () => {
    const event = describeHistoryEvent(
      row({ actionType: "some_future_action", actor: "system" }),
      missing,
      pt,
      formatDate,
    );
    expect(event.sentence).toBe("O sistema registrou uma alteração");
    expect(event.sentence).not.toMatch(/some_future_action/);
  });
});

describe("describeHistoryEvent — the subject", () => {
  it("marks a loaded subject as resolved, so the view may link it", () => {
    expect(describeHistoryEvent(row(), found("Preparar relatório"), pt, formatDate).subject).toBe(
      "resolved",
    );
  });

  it("marks a deleted or inaccessible subject unavailable, and drops its name", () => {
    const event = describeHistoryEvent(row(), missing, pt, formatDate);
    expect(event.subject).toBe("unavailable");
    expect(event.sentence).toBe("Você atualizou a tarefa");
  });

  it("marks a kind with no detail route as no-route, which is not an error", () => {
    const event = describeHistoryEvent(
      row({ entityType: "pending_question", entityId: "question-1", actionType: "resolve_pending_question_v3" }),
      missing,
      pt,
      formatDate,
    );
    expect(event.subject).toBe("no-route");
  });

  it("treats a row with no entity_id as no-route", () => {
    expect(describeHistoryEvent(row({ entityId: null }), missing, pt, formatDate).subject).toBe(
      "no-route",
    );
  });

  it("truncates a long subject instead of letting it run the row", () => {
    const long = "a".repeat(200);
    const event = describeHistoryEvent(row(), found(long), pt, formatDate);
    expect(event.sentence).toContain("…");
    expect(event.sentence.length).toBeLessThan(140);
  });
});

describe("describeHistoryEvent — locales", () => {
  it("renders the same row in English without leaking Portuguese", () => {
    const event = describeHistoryEvent(
      row({
        beforeState: { priority: "medium" },
        afterState: { priority: "high" },
      }),
      found("Prepare the report"),
      en,
      formatDate,
    );
    expect(event.sentence).toBe("You changed the priority of “Prepare the report” from Medium to High");
  });

  it("describes every action type in both locales without falling back", () => {
    const seen = new Set<string>();
    for (const copy of [pt, en] as HistoryCopy[]) {
      for (const action of Object.keys(copy.actions)) {
        for (const subject of [missing, found("Um assunto")]) {
          const event = describeHistoryEvent(row({ actionType: action }), subject, copy, formatDate);
          // No template syntax survives into anything a person reads.
          expect(event.sentence, `${action} leaked template syntax`).not.toMatch(/[[\]{}]/);
          expect(event.sentence).not.toMatch(/\bsubject\b/);
          // No doubled or trailing space from a dropped optional segment.
          expect(event.sentence).not.toMatch(/ {2}|\s$/);
          expect(event.sentence.startsWith(copy.actors.user)).toBe(true);
          seen.add(action);
        }
      }
    }
    expect(seen.size).toBeGreaterThan(20);
  });

  it("puts the subject where the phrase needs it, not at the end", () => {
    const confirmed = describeHistoryEvent(
      row({ actionType: "tasks_confirmed" }),
      found("Preparar relatório"),
      pt,
      formatDate,
    );
    // The record is not what is called "Preparar relatório" — the task is.
    expect(confirmed.sentence).toBe(
      "Você confirmou a tarefa “Preparar relatório” a partir de um registro",
    );
  });

  it("drops the whole optional clause when there is no subject", () => {
    const undone = describeHistoryEvent(
      row({ actionType: "operation_undone" }),
      missing,
      pt,
      formatDate,
    );
    // Not "desfez uma alteração em".
    expect(undone.sentence).toBe("Você desfez uma alteração");

    const withSubject = describeHistoryEvent(
      row({ actionType: "operation_undone" }),
      found("Revisar números"),
      pt,
      formatDate,
    );
    expect(withSubject.sentence).toBe("Você desfez uma alteração em “Revisar números”");
  });
});
