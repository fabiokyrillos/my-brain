import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TaskCandidateForm, type ConfirmTasksAction } from "./task-candidate-form";

const candidates = [
  { title: "Atualizar o relatório", description: null, dueAt: null, waitingOn: null, parentIndex: null, confidence: 0.95, explicit: false },
  { title: "Conversar com Maria", description: null, dueAt: null, waitingOn: null, parentIndex: 0, confidence: 0.91, explicit: false },
];

const entryId = "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6";
const interpretationId = "94f6c9d0-2f4e-4a2e-8f2c-9b2a3c4d5e6f";
const operationKey = "6118fb25-2f80-432a-aa96-0e76d924862e";

describe("TaskCandidateForm", () => {
  it("starts with every candidate selected and permits selecting only some", () => {
    const action = vi.fn(async () => ({ status: "success" as const, message: "Tarefas criadas.", undoId: null })) as ConfirmTasksAction;
    render(
      <TaskCandidateForm
        action={action}
        candidates={candidates}
        entryId={entryId}
        interpretationId={interpretationId}
        locale="pt-BR"
        operationKey={operationKey}
      />,
    );

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes.every((checkbox) => (checkbox as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByRole("button", { name: "Criar 2 tarefas" })).toHaveAttribute("type", "submit");
  });

  it("submits the current interpretation id and operation key as hidden fields", () => {
    const action = vi.fn(async () => ({ status: "success" as const, message: "Tarefas criadas.", undoId: null })) as ConfirmTasksAction;
    const { container } = render(
      <TaskCandidateForm
        action={action}
        candidates={candidates}
        entryId={entryId}
        interpretationId={interpretationId}
        locale="pt-BR"
        operationKey={operationKey}
      />,
    );

    expect(container.querySelector('input[name="entryId"]')).toHaveValue(entryId);
    expect(container.querySelector('input[name="interpretationId"]')).toHaveValue(interpretationId);
    expect(container.querySelector('input[name="operationKey"]')).toHaveValue(operationKey);
  });

  it("announces confirmed tasks and exposes undo when available", () => {
    const action = vi.fn(async () => ({ status: "success" as const, message: "2 tarefas criadas.", undoId: "undo-id" })) as ConfirmTasksAction;
    render(
      <TaskCandidateForm
        action={action}
        candidates={candidates}
        entryId={entryId}
        initialState={{ status: "success", message: "2 tarefas criadas.", undoId: "undo-id" }}
        interpretationId={interpretationId}
        locale="pt-BR"
        operationKey={operationKey}
        undoAction={vi.fn(async () => ({ status: "success" as const, message: "Criação desfeita." }))}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("2 tarefas criadas.");
    expect(screen.getByRole("button", { name: "Desfazer criação" })).toBeInTheDocument();
  });

  it("does not offer a candidate the server marked unavailable for the current interpretation", () => {
    const action = vi.fn(async () => ({ status: "success" as const, message: "Tarefas criadas.", undoId: null })) as ConfirmTasksAction;
    render(
      <TaskCandidateForm
        action={action}
        candidates={candidates}
        entryId={entryId}
        interpretationId={interpretationId}
        locale="pt-BR"
        operationKey={operationKey}
        unavailableIndexes={[0]}
      />,
    );

    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.getByText("Conversar com Maria")).toBeInTheDocument();
    expect(screen.queryByText("Atualizar o relatório")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar 1 tarefa" })).toBeInTheDocument();
  });

  it("shows an explicit empty state instead of an unusable form when every candidate is unavailable", () => {
    const action = vi.fn(async () => ({ status: "success" as const, message: "", undoId: null })) as ConfirmTasksAction;
    render(
      <TaskCandidateForm
        action={action}
        candidates={candidates}
        entryId={entryId}
        interpretationId={interpretationId}
        locale="pt-BR"
        operationKey={operationKey}
        unavailableIndexes={[0, 1]}
      />,
    );

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Criar/ })).not.toBeInTheDocument();
    expect(screen.getByText("Nenhuma sugestão pendente para confirmar.")).toBeInTheDocument();
  });
});
