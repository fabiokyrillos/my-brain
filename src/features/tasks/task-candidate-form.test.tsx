import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ActionableCandidateView } from "@/features/daily-cycle/contracts";
import { TaskCandidateForm, type ConfirmTasksAction } from "./task-candidate-form";

const taskCandidatesPresented = vi.hoisted(() => vi.fn(() => null));
vi.mock("@/features/product-analytics/interaction-events", () => ({
  TaskCandidatesPresented: taskCandidatesPresented,
}));

const candidates: ActionableCandidateView[] = [
  { key: "0", title: "Atualizar o relatório" },
  { key: "1", title: "Conversar com Maria" },
];

const entryId = "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6";
const interpretationId = "94f6c9d0-2f4e-4a2e-8f2c-9b2a3c4d5e6f";
const operationKey = "6118fb25-2f80-432a-aa96-0e76d924862e";

describe("TaskCandidateForm", () => {
  it("keeps the confirmation acknowledgement and undo control after submitting", async () => {
    const action = vi.fn(async () => ({ status: "success" as const, message: "2 tarefas criadas.", undoId: "undo-id" })) as ConfirmTasksAction;
    const user = userEvent.setup();
    render(
      <TaskCandidateForm
        action={action}
        candidates={candidates}
        entryId={entryId}
        interpretationId={interpretationId}
        locale="pt-BR"
        operationKey={operationKey}
        undoAction={vi.fn(async () => ({ status: "success" as const, message: "Criação desfeita." }))}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Criar 2 tarefas" }));

    expect(await screen.findByRole("status")).toHaveTextContent("2 tarefas criadas.");
    expect(screen.getByRole("button", { name: "Desfazer criação" })).toBeVisible();
  });

  it("records when the available candidate set becomes visible", () => {
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

    expect(taskCandidatesPresented).toHaveBeenCalledWith(
      expect.objectContaining({ candidateCount: 2, entryId, interpretationId, locale: "pt-BR" }),
      undefined,
    );
  });

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

  it("shows an explicit empty state instead of an unusable form when no candidate is available", () => {
    const action = vi.fn(async () => ({ status: "success" as const, message: "", undoId: null })) as ConfirmTasksAction;
    render(
      <TaskCandidateForm
        action={action}
        candidates={[]}
        entryId={entryId}
        interpretationId={interpretationId}
        locale="pt-BR"
        operationKey={operationKey}
      />,
    );

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Criar/ })).not.toBeInTheDocument();
    expect(screen.getByText("Nenhuma sugestão pendente para confirmar.")).toBeInTheDocument();
  });

  it("submits each candidate's own key as candidateIndex, not its position in the (already-filtered) list", () => {
    const action = vi.fn(async () => ({ status: "success" as const, message: "Tarefas criadas.", undoId: null })) as ConfirmTasksAction;
    const preFiltered: ActionableCandidateView[] = [
      { key: "1", title: "Conversar com Maria" },
      { key: "2", title: "Enviar contrato" },
    ];
    render(
      <TaskCandidateForm
        action={action}
        candidates={preFiltered}
        entryId={entryId}
        interpretationId={interpretationId}
        locale="pt-BR"
        operationKey={operationKey}
      />,
    );

    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(checkboxes.map((checkbox) => checkbox.value)).toEqual(["1", "2"]);
  });

  it("never renders a raw AI extraction confidence score (PROJ-005/REV-002)", () => {
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

    expect(container.querySelector(".confidence-pill")).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\d+%/);
  });
});
