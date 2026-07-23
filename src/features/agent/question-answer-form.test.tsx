import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  QuestionAnswerForm,
  type QuestionResolutionAction,
  type QuestionResolutionState,
  type QuestionUndoAction,
} from "./forms";

const questionId = "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6";
const undoId = "9b8ff364-1adf-4f7a-8d40-4fbcbcfc1131";

function successState(overrides: Partial<QuestionResolutionState> = {}): QuestionResolutionState {
  return {
    status: "success",
    code: "resolution_succeeded",
    message: "Resposta registrada.",
    undoId,
    replayed: false,
    retryable: false,
    ...overrides,
  };
}

function failureState(
  code: Exclude<QuestionResolutionState["code"], "resolution_succeeded" | null>,
  message: string,
  retryable = false,
): QuestionResolutionState {
  return { status: "error", code, message, undoId: null, replayed: false, retryable };
}

const noopUndo: QuestionUndoAction = vi.fn(async () => ({ status: "idle" as const, message: "" }));

describe("QuestionAnswerForm", () => {
  it("submits the answer with a preserved operation key and shows the undo control on success", async () => {
    const actionMock = vi.fn<QuestionResolutionAction>(async () => successState());
    render(
      <QuestionAnswerForm action={actionMock} undoAction={noopUndo} locale="pt-BR" questionId={questionId} />,
    );

    await userEvent.type(screen.getByRole("textbox", { name: "Resposta" }), "Sexta às 14h");
    await userEvent.click(screen.getByRole("button", { name: "Responder" }));

    await waitFor(() => expect(actionMock).toHaveBeenCalledOnce());
    const formData = actionMock.mock.calls[0]?.[1];
    expect(formData.get("questionId")).toBe(questionId);
    expect(formData.get("locale")).toBe("pt-BR");
    expect(formData.get("answer")).toBe("Sexta às 14h");
    const submittedKey = String(formData.get("operationKey"));
    expect(submittedKey.length).toBeGreaterThanOrEqual(8);

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Resposta registrada.");
    expect(screen.getByRole("button", { name: "Desfazer resposta" })).toBeVisible();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("keeps the operation key across a retry of the same answer and rotates it when the answer changes", async () => {
    const actionMock = vi.fn<QuestionResolutionAction>(async () =>
      failureState("retryable_failure", "Não foi possível responder agora. Tente novamente.", true),
    );
    render(
      <QuestionAnswerForm action={actionMock} undoAction={noopUndo} locale="pt-BR" questionId={questionId} />,
    );

    const input = screen.getByRole("textbox", { name: "Resposta" });
    await userEvent.type(input, "Primeira resposta");
    await userEvent.click(screen.getByRole("button", { name: "Responder" }));
    await screen.findByRole("alert");
    await userEvent.click(screen.getByRole("button", { name: "Responder" }));
    await waitFor(() => expect(actionMock).toHaveBeenCalledTimes(2));

    const firstKey = String(actionMock.mock.calls[0]?.[1].get("operationKey"));
    const retryKey = String(actionMock.mock.calls[1]?.[1].get("operationKey"));
    expect(retryKey).toBe(firstKey);

    await userEvent.type(input, " editada");
    await userEvent.click(screen.getByRole("button", { name: "Responder" }));
    await waitFor(() => expect(actionMock).toHaveBeenCalledTimes(3));
    const rotatedKey = String(actionMock.mock.calls[2]?.[1].get("operationKey"));
    expect(rotatedKey).not.toBe(firstKey);
  });

  it("associates a validation failure with the answer field and focuses it", async () => {
    const actionMock = vi.fn<QuestionResolutionAction>(async () =>
      failureState("validation_error", "Escreva uma resposta com até 4000 caracteres."),
    );
    render(
      <QuestionAnswerForm action={actionMock} undoAction={noopUndo} locale="pt-BR" questionId={questionId} />,
    );

    const input = screen.getByRole("textbox", { name: "Resposta" });
    await userEvent.type(input, "x");
    await userEvent.click(screen.getByRole("button", { name: "Responder" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Escreva uma resposta com até 4000 caracteres.");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", alert.id);
    await waitFor(() => expect(input).toHaveFocus());
  });

  it("renders distinct stale, non-open, and mismatch states as alerts with focus", async () => {
    const cases = [
      failureState("stale_interpretation", "A interpretação desta pergunta mudou. Atualize a página antes de responder."),
      failureState("not_open", "Esta pergunta não está mais aberta."),
      failureState("idempotency_mismatch", "Esta tentativa não corresponde mais à resposta atual. Revise e tente novamente."),
    ];
    for (const state of cases) {
      const actionMock = vi.fn<QuestionResolutionAction>(async () => state);
      const view = render(
        <QuestionAnswerForm action={actionMock} undoAction={noopUndo} locale="pt-BR" questionId={questionId} />,
      );
      await userEvent.type(screen.getByRole("textbox", { name: "Resposta" }), "resposta");
      await userEvent.click(screen.getByRole("button", { name: "Responder" }));
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(state.message);
      expect(view.container.querySelector(`[data-state="${state.code}"]`)).not.toBeNull();
      await waitFor(() => expect(alert).toHaveFocus());
      view.unmount();
    }
  });

  it("runs the undo flow and returns the question to an editable state", async () => {
    const actionMock = vi.fn<QuestionResolutionAction>(async () => successState());
    const undoMock = vi.fn<QuestionUndoAction>(async () => ({
      status: "success" as const,
      message: "Resposta desfeita. A pergunta voltou para a fila.",
    }));
    render(
      <QuestionAnswerForm action={actionMock} undoAction={undoMock} locale="pt-BR" questionId={questionId} />,
    );

    await userEvent.type(screen.getByRole("textbox", { name: "Resposta" }), "Sexta às 14h");
    await userEvent.click(screen.getByRole("button", { name: "Responder" }));
    const undoButton = await screen.findByRole("button", { name: "Desfazer resposta" });
    await userEvent.click(undoButton);

    await waitFor(() => expect(undoMock).toHaveBeenCalledOnce());
    const undoData = undoMock.mock.calls[0]?.[1];
    expect(undoData.get("undoId")).toBe(undoId);
    expect(undoData.get("questionId")).toBe(questionId);

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Resposta desfeita. A pergunta voltou para a fila.");
    await waitFor(() => expect(status).toHaveFocus());
    expect(screen.getByRole("textbox", { name: "Resposta" })).toBeVisible();
  });

  it("renders the English copy", () => {
    const actionMock = vi.fn<QuestionResolutionAction>(async () => successState());
    render(
      <QuestionAnswerForm action={actionMock} undoAction={noopUndo} locale="en" questionId={questionId} />,
    );
    expect(screen.getByRole("textbox", { name: "Answer" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Answer" })).toBeEnabled();
  });
});
