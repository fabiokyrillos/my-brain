import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TaskCandidateForm, type ConfirmTasksAction } from "./task-candidate-form";

const candidates = [
  { title: "Atualizar o relatório", description: null, dueAt: null, waitingOn: null, parentIndex: null, confidence: 0.95, explicit: false },
  { title: "Conversar com Maria", description: null, dueAt: null, waitingOn: null, parentIndex: 0, confidence: 0.91, explicit: false },
];

describe("TaskCandidateForm", () => {
  it("starts with every candidate selected and permits selecting only some", () => {
    const action = vi.fn(async () => ({ status: "success" as const, message: "Tarefas criadas.", undoId: null })) as ConfirmTasksAction;
    render(<TaskCandidateForm action={action} candidates={candidates} entryId="72f1f8af-8b90-4f1d-9916-ec6d983fd4c6" locale="pt-BR" />);

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes.every((checkbox) => (checkbox as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByRole("button", { name: "Criar 2 tarefas" })).toHaveAttribute("type", "submit");
  });

  it("announces confirmed tasks and exposes undo when available", () => {
    const action = vi.fn(async () => ({ status: "success" as const, message: "2 tarefas criadas.", undoId: "undo-id" })) as ConfirmTasksAction;
    render(
      <TaskCandidateForm
        action={action}
        candidates={candidates}
        entryId="72f1f8af-8b90-4f1d-9916-ec6d983fd4c6"
        initialState={{ status: "success", message: "2 tarefas criadas.", undoId: "undo-id" }}
        locale="pt-BR"
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("2 tarefas criadas.");
    expect(screen.getByRole("button", { name: "Desfazer criação" })).toBeInTheDocument();
  });
});
