import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    resolution: "answered",
    snoozedUntil: null,
    consequence: "none",
    consequenceStatus: "none",
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
  return {
    status: "error",
    code,
    message,
    resolution: null,
    snoozedUntil: null,
    consequence: null,
    consequenceStatus: null,
    undoId: null,
    replayed: false,
    retryable,
  };
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
    expect(screen.getByRole("button", { name: "Defer" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Not relevant" })).toBeEnabled();
  });

  // Phase 2D Slice 2D.2 — dispositions.
  it("dismisses through the resolution contract and shows the dismissal undo control", async () => {
    const actionMock = vi.fn<QuestionResolutionAction>(async () =>
      successState({ resolution: "dismissed", message: "Pergunta descartada." }),
    );
    const view = render(
      <QuestionAnswerForm action={actionMock} undoAction={noopUndo} locale="pt-BR" questionId={questionId} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Descartar" }));

    await waitFor(() => expect(actionMock).toHaveBeenCalledOnce());
    const formData = actionMock.mock.calls[0]?.[1];
    expect(formData.get("kind")).toBe("dismissed");
    expect(formData.get("questionId")).toBe(questionId);
    expect(String(formData.get("operationKey")).length).toBeGreaterThanOrEqual(8);

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Pergunta descartada.");
    expect(view.container.querySelector('[data-state="dismissed"]')).not.toBeNull();
    const undoButton = screen.getByRole("button", { name: "Desfazer descarte" });
    expect(undoButton).toBeVisible();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("marks not relevant distinctly and passes the resolution kind to the undo action", async () => {
    const actionMock = vi.fn<QuestionResolutionAction>(async () =>
      successState({ resolution: "not_relevant", message: "Pergunta marcada como não relevante." }),
    );
    const undoMock = vi.fn<QuestionUndoAction>(async () => ({
      status: "success" as const,
      message: "Resolução desfeita. A pergunta voltou para a fila.",
    }));
    const view = render(
      <QuestionAnswerForm action={actionMock} undoAction={undoMock} locale="pt-BR" questionId={questionId} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Não é relevante" }));
    await waitFor(() => expect(actionMock).toHaveBeenCalledOnce());
    expect(actionMock.mock.calls[0]?.[1].get("kind")).toBe("not_relevant");
    expect(view.container.querySelector('[data-state="not_relevant"]')).not.toBeNull();

    await userEvent.click(await screen.findByRole("button", { name: "Desfazer marcação" }));
    await waitFor(() => expect(undoMock).toHaveBeenCalledOnce());
    const undoData = undoMock.mock.calls[0]?.[1];
    expect(undoData.get("resolution")).toBe("not_relevant");
    expect(undoData.get("undoId")).toBe(undoId);

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Resolução desfeita. A pergunta voltou para a fila.");
    expect(screen.getByRole("textbox", { name: "Resposta" })).toBeVisible();
  });

  it("defers through the defer panel, converting the wall time in the profile timezone", async () => {
    const actionMock = vi.fn<QuestionResolutionAction>(async () =>
      successState({
        resolution: "deferred",
        message: "Pergunta adiada.",
        snoozedUntil: "2030-07-24T15:30:00.000Z",
      }),
    );
    const view = render(
      <QuestionAnswerForm
        action={actionMock}
        undoAction={noopUndo}
        locale="pt-BR"
        questionId={questionId}
        timezone="America/Sao_Paulo"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Adiar" }));
    const deferInput = screen.getByLabelText("Adiar até");
    expect(deferInput).toHaveValue();
    // São Paulo is UTC-03: 12:30 wall time is 15:30Z.
    fireEvent.change(deferInput, { target: { value: "2030-07-24T12:30" } });
    await userEvent.click(screen.getByRole("button", { name: "Confirmar adiamento" }));

    await waitFor(() => expect(actionMock).toHaveBeenCalledOnce());
    const formData = actionMock.mock.calls[0]?.[1];
    expect(formData.get("kind")).toBe("deferred");
    expect(formData.get("snoozedUntil")).toBe("2030-07-24T12:30:00-03:00");

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Pergunta adiada até");
    expect(status).toHaveTextContent("24/07/2030");
    expect(status).toHaveTextContent("12:30");
    expect(view.container.querySelector('[data-state="deferred"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: "Desfazer adiamento" })).toBeVisible();
  });

  it("shows a field-associated local error for an unconvertible deferral value without dispatching", async () => {
    const actionMock = vi.fn<QuestionResolutionAction>(async () => successState());
    render(
      <QuestionAnswerForm
        action={actionMock}
        undoAction={noopUndo}
        locale="pt-BR"
        questionId={questionId}
        timezone="America/New_York"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Adiar" }));
    const deferInput = screen.getByLabelText("Adiar até");
    // 02:30 on 2030-03-10 does not exist in America/New_York (DST gap), so
    // the wall-time conversion fails locally before any dispatch.
    fireEvent.change(deferInput, { target: { value: "2030-03-10T02:30" } });
    await userEvent.click(screen.getByRole("button", { name: "Confirmar adiamento" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Escolha uma data e hora futuras válidas.");
    expect(deferInput).toHaveAttribute("aria-invalid", "true");
    expect(deferInput).toHaveAttribute("aria-describedby", alert.id);
    await waitFor(() => expect(deferInput).toHaveFocus());
    expect(actionMock).not.toHaveBeenCalled();
  });

  it("closes the defer panel without submitting when cancelled", async () => {
    const actionMock = vi.fn<QuestionResolutionAction>(async () => successState());
    render(
      <QuestionAnswerForm action={actionMock} undoAction={noopUndo} locale="pt-BR" questionId={questionId} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Adiar" }));
    expect(screen.getByLabelText("Adiar até")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByLabelText("Adiar até")).toBeNull();
    expect(actionMock).not.toHaveBeenCalled();
  });

  it("rotates the operation key when the resolution kind changes", async () => {
    const actionMock = vi.fn<QuestionResolutionAction>(async () =>
      failureState("retryable_failure", "Não foi possível concluir agora. Tente novamente.", true),
    );
    render(
      <QuestionAnswerForm action={actionMock} undoAction={noopUndo} locale="pt-BR" questionId={questionId} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Descartar" }));
    await screen.findByRole("alert");
    await userEvent.click(screen.getByRole("button", { name: "Descartar" }));
    await waitFor(() => expect(actionMock).toHaveBeenCalledTimes(2));
    const firstKey = String(actionMock.mock.calls[0]?.[1].get("operationKey"));
    const retryKey = String(actionMock.mock.calls[1]?.[1].get("operationKey"));
    expect(retryKey).toBe(firstKey);

    await userEvent.click(screen.getByRole("button", { name: "Não é relevante" }));
    await waitFor(() => expect(actionMock).toHaveBeenCalledTimes(3));
    const rotatedKey = String(actionMock.mock.calls[2]?.[1].get("operationKey"));
    expect(rotatedKey).not.toBe(firstKey);
  });

  // Phase 2D Slice 2D.4 — confirmed consequence / reinterpretation.
  it("never offers the reinterpretation control unless it is possible", () => {
    const actionMock = vi.fn<QuestionResolutionAction>(async () => successState());
    render(
      <QuestionAnswerForm action={actionMock} undoAction={noopUndo} locale="pt-BR" questionId={questionId} />,
    );
    expect(screen.queryByRole("button", { name: "Responder e reinterpretar" })).toBeNull();
  });

  it("mutates nothing when the consequence panel is opened", async () => {
    const actionMock = vi.fn<QuestionResolutionAction>(async () => successState());
    render(
      <QuestionAnswerForm
        action={actionMock}
        undoAction={noopUndo}
        locale="pt-BR"
        questionId={questionId}
        canReinterpret
      />,
    );

    await userEvent.type(screen.getByRole("textbox", { name: "Resposta" }), "Sexta às 14h");
    await userEvent.click(screen.getByRole("button", { name: "Responder e reinterpretar" }));

    // The disclosure states plainly that nothing has happened yet, and no
    // action was dispatched by opening it.
    expect(screen.getByText("Nada foi aplicado ainda. Isto só acontece se você confirmar.")).toBeVisible();
    expect(actionMock).not.toHaveBeenCalled();
  });

  it("submits the reinterpret consequence only on explicit confirmation", async () => {
    const actionMock = vi.fn<QuestionResolutionAction>(async () =>
      successState({ consequence: "reinterpret", consequenceStatus: "reinterpretation_queued", message: "Resposta registrada. A reinterpretação deste registro foi enfileirada." }),
    );
    render(
      <QuestionAnswerForm
        action={actionMock}
        undoAction={noopUndo}
        locale="pt-BR"
        questionId={questionId}
        canReinterpret
      />,
    );

    await userEvent.type(screen.getByRole("textbox", { name: "Resposta" }), "Sexta às 14h");
    await userEvent.click(screen.getByRole("button", { name: "Responder e reinterpretar" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirmar e reinterpretar" }));

    await waitFor(() => expect(actionMock).toHaveBeenCalledOnce());
    const formData = actionMock.mock.calls[0]?.[1];
    expect(formData.get("kind")).toBe("answer");
    expect(formData.get("consequence")).toBe("reinterpret");
    expect(formData.get("answer")).toBe("Sexta às 14h");

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("A reinterpretação deste registro foi enfileirada.");
    expect(screen.getByText("Desfazer também cancela a reinterpretação enfileirada, se ela ainda não tiver começado.")).toBeVisible();
  });

  it("skipping the consequence returns to the plain answer without a consequence", async () => {
    const actionMock = vi.fn<QuestionResolutionAction>(async () => successState());
    render(
      <QuestionAnswerForm
        action={actionMock}
        undoAction={noopUndo}
        locale="pt-BR"
        questionId={questionId}
        canReinterpret
      />,
    );

    await userEvent.type(screen.getByRole("textbox", { name: "Resposta" }), "Sexta às 14h");
    await userEvent.click(screen.getByRole("button", { name: "Responder e reinterpretar" }));
    await userEvent.click(screen.getByRole("button", { name: "Pular consequência" }));
    await userEvent.click(screen.getByRole("button", { name: "Responder" }));

    await waitFor(() => expect(actionMock).toHaveBeenCalledOnce());
    const formData = actionMock.mock.calls[0]?.[1];
    expect(formData.get("consequence")).toBeNull();
  });

  it("renders the English consequence copy", async () => {
    const actionMock = vi.fn<QuestionResolutionAction>(async () => successState());
    render(
      <QuestionAnswerForm
        action={actionMock}
        undoAction={noopUndo}
        locale="en"
        questionId={questionId}
        canReinterpret
      />,
    );
    await userEvent.type(screen.getByRole("textbox", { name: "Answer" }), "Friday at 2pm");
    await userEvent.click(screen.getByRole("button", { name: "Answer and re-interpret" }));
    expect(screen.getByText("Nothing has been applied yet. This only happens if you confirm.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Confirm and re-interpret" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Skip consequence" })).toBeEnabled();
  });
});
