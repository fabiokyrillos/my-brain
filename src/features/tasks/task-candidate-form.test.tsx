import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ActionableCandidateView } from "@/features/daily-cycle/contracts";
import {
  TaskCandidateForm,
  type ConfirmTasksAction,
  type ConfirmTasksState,
} from "./task-candidate-form";

const taskCandidatesPresented = vi.hoisted(() => vi.fn(() => null));
const recordCandidateEditStarted = vi.hoisted(() => vi.fn());
const recordCandidateEditReset = vi.hoisted(() => vi.fn());
vi.mock("@/features/product-analytics/interaction-events", () => ({
  TaskCandidatesPresented: taskCandidatesPresented,
  recordCandidateEditStarted,
  recordCandidateEditReset,
}));

const candidates: ActionableCandidateView[] = [
  {
    key: "0",
    title: "Atualizar o relatório",
    description: "Revisar o rascunho",
    dueAt: "2026-07-20T15:00:00Z",
  },
  {
    key: "1",
    title: "Conversar com Maria",
    description: "Agendar conversa",
  },
];

const entryId = "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6";
const interpretationId = "94f6c9d0-2f4e-4a2e-8f2c-9b2a3c4d5e6f";
const operationKey = "6118fb25-2f80-432a-aa96-0e76d924862e";

const successState: ConfirmTasksState = {
  status: "success",
  code: "confirmed",
  message: "Tarefas criadas.",
  undoId: null,
  replayed: false,
  retryable: false,
};

const recoverableErrorState: ConfirmTasksState = {
  status: "error",
  code: "operation_failed",
  message: "Não foi possível criar as tarefas.",
  undoId: null,
  retryable: true,
};

function actionReturning(result: ConfirmTasksState = successState) {
  return vi.fn(async () => result) as ConfirmTasksAction;
}

function renderForm(overrides: Partial<React.ComponentProps<typeof TaskCandidateForm>> = {}) {
  const action = overrides.action ?? actionReturning();
  const props: React.ComponentProps<typeof TaskCandidateForm> = {
    action,
    candidates,
    entryId,
    interpretationId,
    locale: "pt-BR",
    operationKey,
    timezone: "America/Sao_Paulo",
    ...overrides,
  };

  return { action, props, ...render(<TaskCandidateForm {...props} />) };
}

function editorFor(title: string) {
  return screen.getByRole("group", { name: `Sugestão: ${title}` });
}

async function expandEditor(user: ReturnType<typeof userEvent.setup>, title: string) {
  const editor = editorFor(title);
  await user.click(within(editor).getByRole("button", { name: `Editar sugestão: ${title}` }));
  return editor;
}

function submittedFormData(action: ConfirmTasksAction, call = 0) {
  return vi.mocked(action).mock.calls[call]?.[1] as FormData;
}

describe("TaskCandidateForm", () => {
  it("mounts one CandidateEditor per actionable candidate in stable order with locale and profile timezone", () => {
    renderForm();

    const editors = screen.getAllByRole("group");
    expect(editors.map((editor) => editor.getAttribute("aria-disabled"))).toEqual(["false", "false"]);
    expect(editors.map((editor) => within(editor).getByText(/Sugestão:/).textContent)).toEqual([
      "Sugestão: Atualizar o relatório",
      "Sugestão: Conversar com Maria",
    ]);
    expect(within(editors[0]).getByText("Horário em America/Sao_Paulo")).toBeVisible();
  });

  it("passes the English locale and explicit profile timezone to CandidateEditor", async () => {
    const user = userEvent.setup();
    renderForm({ locale: "en", timezone: "America/New_York" });

    const editor = screen.getByRole("group", { name: "Suggestion: Atualizar o relatório" });
    expect(within(editor).getByText("Time in America/New_York")).toBeVisible();
    await user.click(within(editor).getByRole("button", { name: "Edit suggestion: Atualizar o relatório" }));
    expect(within(editor).getByLabelText("Due date (America/New_York)")).toBeVisible();
  });

  it("starts selected, disables editing when deselected, and restores the retained edit when reselected", async () => {
    const user = userEvent.setup();
    renderForm();
    const editor = await expandEditor(user, "Atualizar o relatório");
    const title = within(editor).getByLabelText("Título");
    await user.clear(title);
    await user.type(title, "Relatório final");

    const checkbox = screen.getByRole("checkbox", { name: /Atualizar o relatório/ });
    await user.click(checkbox);
    expect(within(editor).getByRole("button", { name: "Editar sugestão: Atualizar o relatório" })).toBeDisabled();

    await user.click(checkbox);
    expect(within(editor).getByLabelText("Título")).toHaveValue("Relatório final");
  });

  it("submits only selected indices and excludes retained edits from deselected candidates", async () => {
    const user = userEvent.setup();
    const action = actionReturning();
    renderForm({ action });
    const firstEditor = await expandEditor(user, "Atualizar o relatório");
    await user.clear(within(firstEditor).getByLabelText("Título"));
    await user.type(within(firstEditor).getByLabelText("Título"), "Relatório final");
    const secondEditor = await expandEditor(user, "Conversar com Maria");
    await user.click(within(secondEditor).getByRole("button", { name: "Remover descrição: Conversar com Maria" }));
    await user.click(screen.getByRole("checkbox", { name: /Atualizar o relatório/ }));

    await user.click(screen.getByRole("button", { name: "Criar 1 tarefa" }));

    const data = submittedFormData(action);
    expect(data.getAll("candidateIndex")).toEqual(["1"]);
    expect(data.get("candidateEdits")).toBe('[{"candidateIndex":1,"changes":{"description":null}}]');
  });

  it("serializes unchanged selected candidates as an empty canonical edit array", async () => {
    const user = userEvent.setup();
    const action = actionReturning();
    renderForm({ action });

    await user.click(screen.getByRole("button", { name: "Criar 2 tarefas" }));

    expect(submittedFormData(action).get("candidateEdits")).toBe("[]");
  });

  it("aggregates multiple edits by ascending candidate index with canonical field order", async () => {
    const user = userEvent.setup();
    const action = actionReturning();
    renderForm({ action });
    const secondEditor = await expandEditor(user, "Conversar com Maria");
    await user.clear(within(secondEditor).getByLabelText("Descrição"));
    await user.type(within(secondEditor).getByLabelText("Descrição"), "Nova descrição");
    const firstEditor = await expandEditor(user, "Atualizar o relatório");
    await user.clear(within(firstEditor).getByLabelText("Título"));
    await user.type(within(firstEditor).getByLabelText("Título"), "Relatório final");
    await user.click(within(firstEditor).getByRole("button", { name: "Remover prazo: Atualizar o relatório" }));

    await user.click(screen.getByRole("button", { name: "Criar 2 tarefas" }));

    expect(submittedFormData(action).get("candidateEdits")).toBe(
      '[{"candidateIndex":0,"changes":{"title":"Relatório final","dueAt":null}},{"candidateIndex":1,"changes":{"description":"Nova descrição"}}]',
    );
  });

  it("overwrites injected hidden edit data with canonical React state", async () => {
    const user = userEvent.setup();
    const action = actionReturning();
    const { container } = renderForm({ action });
    const injected = document.createElement("input");
    injected.type = "hidden";
    injected.name = "candidateEdits";
    injected.value = '{"ownerId":"attacker","candidateIndex":999}';
    container.querySelector("form")?.append(injected);

    await user.click(screen.getByRole("button", { name: "Criar 2 tarefas" }));

    expect(submittedFormData(action).getAll("candidateEdits")).toEqual(["[]"]);
  });

  it("blocks submission while a selected editor has invalid local state", async () => {
    const user = userEvent.setup();
    const action = actionReturning();
    renderForm({ action });
    const editor = await expandEditor(user, "Atualizar o relatório");
    await user.clear(within(editor).getByLabelText("Título"));

    await user.click(screen.getByRole("button", { name: "Criar 2 tarefas" }));

    expect(action).not.toHaveBeenCalled();
    expect(screen.getByText("Revise as edições antes de criar as tarefas.")).toHaveAttribute("role", "alert");
  });

  it("retains edits after a recoverable action failure", async () => {
    const user = userEvent.setup();
    const action = actionReturning(recoverableErrorState);
    renderForm({ action });
    const editor = await expandEditor(user, "Atualizar o relatório");
    const title = within(editor).getByLabelText("Título");
    await user.clear(title);
    await user.type(title, "Relatório final");

    await user.click(screen.getByRole("button", { name: "Criar 2 tarefas" }));

    expect(await screen.findByText("Não foi possível criar as tarefas.")).toHaveAttribute("role", "alert");
    expect(within(editor).getByLabelText("Título")).toHaveValue("Relatório final");
  });

  it("keeps one idempotency key for a same-payload retry and replaces it after a material payload change", async () => {
    const user = userEvent.setup();
    const action = actionReturning(recoverableErrorState);
    renderForm({ action });

    await user.click(screen.getByRole("button", { name: "Criar 2 tarefas" }));
    await user.click(screen.getByRole("button", { name: "Criar 2 tarefas" }));
    const firstKey = submittedFormData(action, 0).get("operationKey");
    const retryKey = submittedFormData(action, 1).get("operationKey");
    expect(firstKey).toBe(operationKey);
    expect(retryKey).toBe(firstKey);

    await user.click(screen.getByRole("checkbox", { name: /Conversar com Maria/ }));
    await user.click(screen.getByRole("button", { name: "Criar 1 tarefa" }));
    expect(submittedFormData(action, 2).get("operationKey")).not.toBe(firstKey);
  });

  it("keeps the confirmation acknowledgement and undo control after submitting", async () => {
    const action = actionReturning({ ...successState, message: "2 tarefas criadas.", undoId: "undo-id" });
    const user = userEvent.setup();
    renderForm({
      action,
      undoAction: vi.fn(async () => ({ status: "success" as const, message: "Criação desfeita." })),
    });

    await user.click(screen.getByRole("button", { name: "Criar 2 tarefas" }));

    expect(await screen.findByRole("status")).toHaveTextContent("2 tarefas criadas.");
    expect(screen.getByRole("button", { name: "Desfazer criação" })).toBeVisible();
  });

  it("records when the available candidate set becomes visible", () => {
    renderForm();

    expect(taskCandidatesPresented).toHaveBeenCalledWith(
      expect.objectContaining({ candidateCount: 2, entryId, interpretationId, locale: "pt-BR" }),
      undefined,
    );
  });

  it("starts with every candidate selected and permits selecting only some", () => {
    renderForm();

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes.every((checkbox) => (checkbox as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByRole("button", { name: "Criar 2 tarefas" })).toHaveAttribute("type", "submit");
  });

  it("submits each candidate's own key rather than its position in an already-filtered list", () => {
    const preFiltered: ActionableCandidateView[] = [
      { key: "1", title: "Conversar com Maria" },
      { key: "2", title: "Enviar contrato" },
    ];
    renderForm({ candidates: preFiltered });

    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(checkboxes.map((checkbox) => checkbox.value)).toEqual(["1", "2"]);
  });

  it("announces confirmed tasks and exposes undo when available", () => {
    renderForm({
      initialState: { ...successState, message: "2 tarefas criadas.", undoId: "undo-id" },
      undoAction: vi.fn(async () => ({ status: "success" as const, message: "Criação desfeita." })),
    });

    expect(screen.getByRole("status")).toHaveTextContent("2 tarefas criadas.");
    expect(screen.getByRole("button", { name: "Desfazer criação" })).toBeInTheDocument();
  });

  it("shows an explicit empty state instead of an unusable form when no candidate is available", () => {
    renderForm({ candidates: [] });

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Criar/ })).not.toBeInTheDocument();
    expect(screen.getByText("Nenhuma sugestão pendente para confirmar.")).toBeInTheDocument();
  });

  it("never renders a raw AI extraction confidence score", () => {
    const { container } = renderForm();

    expect(container.querySelector(".confidence-pill")).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\d+%/);
  });
});
