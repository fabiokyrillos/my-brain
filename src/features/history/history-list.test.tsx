import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { getHistoryCopy } from "./copy";
import { describeHistoryEvent, type HistoryEventRow } from "./event";
import { HistoryList } from "./history-list";
import type { Locale } from "@/lib/preferences";

afterEach(cleanup);

const formatDate = (iso: string) => `[${iso.slice(0, 10)}]`;
const formatDateTime = (iso: string) => `[${iso}]`;

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

function renderList(
  rows: readonly {
    row: HistoryEventRow;
    subject: { found: boolean; label: string | null };
  }[],
  locale: Locale = "pt-BR",
) {
  const copy = getHistoryCopy(locale, "Brain");
  const events = rows.map((item) =>
    describeHistoryEvent(item.row, item.subject, copy, formatDate),
  );
  return render(
    <HistoryList copy={copy} events={events} formatDateTime={formatDateTime} locale={locale} />,
  );
}

describe("HistoryList", () => {
  it("renders sentences, never a raw action_type, actor or entity_type", () => {
    renderList([
      { row: row({ actionType: "task_created" }), subject: { found: true, label: "Preparar relatório" } },
      {
        row: row({ id: "audit-2", actionType: "chat_answered", actor: "agent", entityType: "conversation", entityId: "conv-1" }),
        subject: { found: true, label: "Planejamento" },
      },
    ]);

    expect(screen.getByText("Você adicionou a tarefa “Preparar relatório” à lista")).toBeInTheDocument();
    expect(screen.getByText("O Brain respondeu à conversa “Planejamento”")).toBeInTheDocument();
    expect(screen.queryByText(/task_created|chat_answered/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/task_created|chat_answered|\bagent\b/);
  });

  it("never renders audit_logs.reason (UX-28)", () => {
    // The component is not even given `reason`; this pins that it stays that way.
    renderList([{ row: row({ actionType: "task_created" }), subject: { found: true, label: "Preparar relatório" } }]);
    expect(document.body.textContent).not.toMatch(/Task created|Task state changed|Owner edited/);
  });

  it("lists a multi-field change as labelled from → to pairs", () => {
    renderList([
      {
        row: row({
          beforeState: { status: "todo", priority: "low" },
          afterState: { status: "completed", priority: "high" },
        }),
        subject: { found: true, label: "Preparar relatório" },
      },
    ]);

    const changes = screen.getByText("Situação").closest("dl");
    expect(changes).not.toBeNull();
    expect(within(changes as HTMLElement).getByText("A fazer")).toBeInTheDocument();
    expect(within(changes as HTMLElement).getByText("Concluída")).toBeInTheDocument();
    expect(within(changes as HTMLElement).getByText("Baixa")).toBeInTheDocument();
    expect(within(changes as HTMLElement).getByText("Alta")).toBeInTheDocument();
  });

  it("links a subject that still exists", () => {
    renderList([{ row: row(), subject: { found: true, label: "Preparar relatório" } }]);
    expect(screen.getByRole("link", { name: "Abrir" })).toHaveAttribute(
      "href",
      "/pt-BR/app/work/task-1",
    );
  });

  it("keeps the event but withholds the link when the subject is gone", () => {
    renderList([{ row: row(), subject: { found: false, label: null } }]);

    expect(screen.getByText("Você atualizou a tarefa")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Este item não está mais disponível.")).toBeInTheDocument();
  });

  it("offers no link and no missing-item notice for a kind with no detail page", () => {
    renderList([
      {
        row: row({ actionType: "resolve_pending_question_v3", entityType: "pending_question", entityId: "q-1" }),
        subject: { found: false, label: null },
      },
    ]);

    expect(screen.getByText("Você respondeu a uma pergunta pendente")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    // Nothing is missing, so nothing claims to be.
    expect(screen.queryByText("Este item não está mais disponível.")).toBeNull();
  });

  it("shows both rows of one operation, each saying something different (UX-27)", () => {
    // A creation writes a trigger row and an RPC row. They are different facts
    // at different altitudes, so they must not render as the same sentence
    // twice — which is what UX-27 reported and what the first draft did.
    for (const operation of ["tasks_confirmed", "task_command_created"] as const) {
      cleanup();
      renderList([
        { row: row({ id: "a", actionType: operation }), subject: { found: true, label: "Revisar números" } },
        { row: row({ id: "b", actionType: "task_created" }), subject: { found: true, label: "Revisar números" } },
      ]);

      const sentences = [...document.querySelectorAll(".history-sentence")].map(
        (node) => node.textContent,
      );
      expect(sentences).toHaveLength(2);
      expect(new Set(sentences).size, `${operation} reads the same as task_created`).toBe(2);
      expect(sentences).toContain("Você adicionou a tarefa “Revisar números” à lista");
    }
  });

  it("gives no two action types the same sentence for the same subject", () => {
    // The general form of UX-27: any pair of action types that can co-occur on
    // one object would otherwise read as a duplicate.
    const copy = getHistoryCopy("pt-BR", "Brain");
    const sentences = new Map<string, string>();
    for (const action of Object.keys(copy.actions)) {
      const event = describeHistoryEvent(
        row({ actionType: action }),
        { found: true, label: "Assunto" },
        copy,
        formatDate,
      );
      const clash = sentences.get(event.sentence);
      // The four question-resolution versions are deliberately one sentence:
      // they are the same operation, re-versioned, never co-occurring.
      const allowed = /^resolve_pending_question_v|^confirm_entry_task_candidates_v/;
      if (clash !== undefined && !(allowed.test(action) && allowed.test(clash))) {
        throw new Error(`${action} and ${clash} render identically: "${event.sentence}"`);
      }
      sentences.set(event.sentence, action);
    }
  });

  it("gives every row a machine-readable timestamp", () => {
    renderList([{ row: row(), subject: { found: true, label: "Preparar relatório" } }]);
    const time = document.querySelector("time");
    expect(time).toHaveAttribute("dateTime", "2026-07-30T18:00:00.000Z");
  });

  it("renders in English without leaking Portuguese", () => {
    renderList(
      [{ row: row({ actionType: "task_created" }), subject: { found: true, label: "Prepare the report" } }],
      "en",
    );

    expect(screen.getByText("You added the task “Prepare the report” to the list")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open" })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Você|tarefa|Abrir/);
  });

  it("truncates a very long subject so one row cannot run away with the page", () => {
    renderList([{ row: row(), subject: { found: true, label: "x".repeat(400) } }]);
    const sentence = document.querySelector(".history-sentence")?.textContent ?? "";
    expect(sentence.length).toBeLessThan(140);
    expect(sentence).toContain("…");
  });
});
