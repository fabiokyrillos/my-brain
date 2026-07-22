import { readFileSync } from "node:fs";
import path from "node:path";
import { StrictMode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionableCandidateView } from "@/features/daily-cycle/contracts";
import { CandidateEditor } from "./candidate-editor";

const recordCandidateEditStarted = vi.hoisted(() => vi.fn());
const recordCandidateEditReset = vi.hoisted(() => vi.fn());
vi.mock("@/features/product-analytics/interaction-events", () => ({
  recordCandidateEditStarted,
  recordCandidateEditReset,
}));

const entryId = "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6";

const candidate: ActionableCandidateView = {
  key: "0",
  title: "Enviar o relatório",
  description: "Usar o anexo final",
  dueAt: "2026-07-21T17:30:00+00:00",
};

function renderEditor(overrides: Partial<React.ComponentProps<typeof CandidateEditor>> = {}) {
  const onEditChange = vi.fn();
  const props: React.ComponentProps<typeof CandidateEditor> = {
    candidate,
    entryId,
    locale: "pt-BR",
    onEditChange,
    selected: true,
    timezone: "America/Sao_Paulo",
    ...overrides,
  };

  return { onEditChange, props, ...render(<CandidateEditor {...props} />) };
}

describe("CandidateEditor", () => {
  beforeEach(() => {
    recordCandidateEditStarted.mockClear();
    recordCandidateEditReset.mockClear();
  });

  it("starts collapsed", () => {
    renderEditor();

    expect(screen.queryByRole("textbox", { name: "Título" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("displays the original title", () => {
    renderEditor();

    expect(screen.getByText("Enviar o relatório")).toBeVisible();
  });

  it("displays the original description when present", () => {
    renderEditor();

    expect(screen.getByText("Usar o anexo final")).toBeVisible();
  });

  it("displays the due date with profile timezone context", () => {
    renderEditor();

    expect(screen.getByText(/21\/07\/2026.*14:30/)).toBeVisible();
    expect(screen.getByText("Horário em America/Sao_Paulo")).toBeVisible();
  });

  it("expands through the localized edit control", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));

    expect(screen.getByRole("textbox", { name: "Título" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("initializes fields from the immutable suggestion values", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));

    expect(screen.getByRole("textbox", { name: "Título" })).toHaveValue("Enviar o relatório");
    expect(screen.getByRole("textbox", { name: "Descrição" })).toHaveValue("Usar o anexo final");
    expect(screen.getByLabelText("Data limite (America/Sao_Paulo)")).toHaveValue("2026-07-21T14:30");
  });

  it("shows an edited badge after a normalized change", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));

    const title = screen.getByRole("textbox", { name: "Título" });
    await user.clear(title);
    await user.type(title, "Enviar o relatório assinado");

    expect(screen.getByText("Editada")).toBeVisible();
  });

  it("emits a canonical title-only edit", async () => {
    const user = userEvent.setup();
    const { onEditChange } = renderEditor();
    await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));
    const title = screen.getByRole("textbox", { name: "Título" });

    await user.clear(title);
    await user.type(title, "  Enviar o relatório assinado  ");

    expect(onEditChange).toHaveBeenLastCalledWith({
      candidateIndex: 0,
      changes: { title: "Enviar o relatório assinado" },
    });
  });

  it("emits a canonical description-only edit", async () => {
    const user = userEvent.setup();
    const { onEditChange } = renderEditor();
    await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));
    const description = screen.getByRole("textbox", { name: "Descrição" });

    await user.clear(description);
    await user.type(description, "  Incluir a última revisão  ");

    expect(onEditChange).toHaveBeenLastCalledWith({
      candidateIndex: 0,
      changes: { description: "Incluir a última revisão" },
    });
  });

  it("emits a canonical due-date-only edit", async () => {
    const user = userEvent.setup();
    const { onEditChange } = renderEditor();
    await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));

    fireEvent.change(screen.getByLabelText("Data limite (America/Sao_Paulo)"), {
      target: { value: "2026-07-22T09:00" },
    });

    expect(onEditChange).toHaveBeenLastCalledWith({
      candidateIndex: 0,
      changes: { dueAt: "2026-07-22T09:00:00-03:00" },
    });
  });

  it("emits all normalized editable fields together", async () => {
    const user = userEvent.setup();
    const { onEditChange } = renderEditor();
    await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Título" }), {
      target: { value: "Enviar o relatório assinado" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Descrição" }), {
      target: { value: "Incluir a última revisão" },
    });
    fireEvent.change(screen.getByLabelText("Data limite (America/Sao_Paulo)"), {
      target: { value: "2026-07-22T09:00" },
    });

    expect(onEditChange).toHaveBeenLastCalledWith({
      candidateIndex: 0,
      changes: {
        title: "Enviar o relatório assinado",
        description: "Incluir a última revisão",
        dueAt: "2026-07-22T09:00:00-03:00",
      },
    });
  });

  it("emits no edit when a normalized value equals the suggestion", async () => {
    const user = userEvent.setup();
    const { onEditChange } = renderEditor();
    await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Título" }), {
      target: { value: "  Enviar o relatório  " },
    });

    expect(onEditChange).toHaveBeenLastCalledWith(null);
  });

  it("keeps the original suggestion visible beside a changed field", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));

    const title = screen.getByRole("textbox", { name: "Título" });
    await user.clear(title);
    await user.type(title, "Enviar o relatório assinado");

    expect(screen.getByText("Sugestão original: Enviar o relatório")).toBeVisible();
  });

  it("reset restores the exact suggestion values", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));
    const title = screen.getByRole("textbox", { name: "Título" });
    await user.clear(title);
    await user.type(title, "Enviar o relatório assinado");

    await user.click(screen.getByRole("button", { name: "Restaurar sugestão: Enviar o relatório" }));

    expect(title).toHaveValue("Enviar o relatório");
    expect(screen.getByRole("textbox", { name: "Descrição" })).toHaveValue("Usar o anexo final");
    expect(screen.getByLabelText("Data limite (America/Sao_Paulo)")).toHaveValue("2026-07-21T14:30");
  });

  it("reset removes the edited state", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));
    const title = screen.getByRole("textbox", { name: "Título" });
    await user.clear(title);
    await user.type(title, "Enviar o relatório assinado");
    expect(screen.getByText("Editada")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Restaurar sugestão: Enviar o relatório" }));

    expect(screen.queryByText("Editada")).not.toBeInTheDocument();
  });

  it("reset removes the parent command override", async () => {
    const user = userEvent.setup();
    const { onEditChange } = renderEditor();
    await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Título" }), {
      target: { value: "Enviar o relatório assinado" },
    });

    await user.click(screen.getByRole("button", { name: "Restaurar sugestão: Enviar o relatório" }));

    expect(onEditChange).toHaveBeenLastCalledWith(null);
  });

  it("clearing description emits explicit clear intent", async () => {
    const user = userEvent.setup();
    const { onEditChange } = renderEditor();
    await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));

    await user.clear(screen.getByRole("textbox", { name: "Descrição" }));

    expect(onEditChange).toHaveBeenLastCalledWith({
      candidateIndex: 0,
      changes: { description: null },
    });
  });

  it("clearing due date emits explicit clear intent", async () => {
    const user = userEvent.setup();
    const { onEditChange } = renderEditor();
    await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));

    await user.clear(screen.getByLabelText("Data limite (America/Sao_Paulo)"));

    expect(onEditChange).toHaveBeenLastCalledWith({
      candidateIndex: 0,
      changes: { dueAt: null },
    });
  });

  it("exposes localized clear actions for description and due date", async () => {
    const user = userEvent.setup();
    const { onEditChange } = renderEditor();
    await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));

    await user.click(screen.getByRole("button", { name: "Remover descrição: Enviar o relatório" }));
    expect(onEditChange).toHaveBeenLastCalledWith({ candidateIndex: 0, changes: { description: null } });

    await user.click(screen.getByRole("button", { name: "Remover prazo: Enviar o relatório" }));
    expect(onEditChange).toHaveBeenLastCalledWith({
      candidateIndex: 0,
      changes: { description: null, dueAt: null },
    });
  });

  it("supports suggestions whose original description and due date are empty", async () => {
    const user = userEvent.setup();
    const emptyCandidate: ActionableCandidateView = { key: "1", title: "Agendar conversa" };
    renderEditor({ candidate: emptyCandidate });

    expect(screen.queryByText(/undefined|null/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Editar sugestão: Agendar conversa" }));
    expect(screen.getByRole("textbox", { name: "Descrição" })).toHaveValue("");
    expect(screen.getByLabelText("Data limite (America/Sao_Paulo)")).toHaveValue("");
  });

  it("resets edited empty originals back to exact empty values", async () => {
    const user = userEvent.setup();
    const emptyCandidate: ActionableCandidateView = { key: "1", title: "Agendar conversa" };
    renderEditor({ candidate: emptyCandidate });
    await user.click(screen.getByRole("button", { name: "Editar sugestão: Agendar conversa" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Descrição" }), { target: { value: "Levar pauta" } });
    fireEvent.change(screen.getByLabelText("Data limite (America/Sao_Paulo)"), {
      target: { value: "2026-07-22T09:00" },
    });

    await user.click(screen.getByRole("button", { name: "Restaurar sugestão: Agendar conversa" }));

    expect(screen.getByRole("textbox", { name: "Descrição" })).toHaveValue("");
    expect(screen.getByLabelText("Data limite (America/Sao_Paulo)")).toHaveValue("");
  });

  it("shows original description and due date beside their changed fields", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Descrição" }), {
      target: { value: "Incluir a última revisão" },
    });
    fireEvent.change(screen.getByLabelText("Data limite (America/Sao_Paulo)"), {
      target: { value: "2026-07-22T09:00" },
    });

    expect(screen.getByText("Sugestão original: Usar o anexo final")).toBeVisible();
    expect(screen.getByText(/Sugestão original:.*21\/07\/2026.*14:30/)).toBeVisible();
  });

  it("renders the complete English copy and timezone contract", async () => {
    const user = userEvent.setup();
    renderEditor({ locale: "en", timezone: "America/New_York" });

    expect(screen.getByText(/7\/21\/2026.*1:30 PM/i)).toBeVisible();
    expect(screen.getByText(/Time in America\/New_York/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Edit suggestion: Enviar o relatório" }));
    expect(screen.getByLabelText("Due date (America/New_York)")).toHaveValue("2026-07-21T13:30");
    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
      target: { value: "Send the signed report" },
    });
    expect(screen.getByText("Edited")).toBeVisible();
    expect(screen.getByText("Original suggestion: Enviar o relatório")).toBeVisible();
    expect(screen.getByRole("button", { name: "Clear description: Enviar o relatório" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Clear due date: Enviar o relatório" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Reset to suggestion: Enviar o relatório" }));
    expect(screen.getByRole("status")).toHaveTextContent("Suggestion reset.");
  });

  it("visually suspends editing while the candidate is unselected", async () => {
    const user = userEvent.setup();
    const { props, rerender } = renderEditor();
    await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));

    rerender(<CandidateEditor {...props} selected={false} />);

    expect(screen.getByRole("group", { name: "Sugestão: Enviar o relatório" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("textbox", { name: "Título" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Descrição" })).toBeDisabled();
    expect(screen.getByLabelText("Data limite (America/Sao_Paulo)")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Restaurar sugestão: Enviar o relatório" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remover descrição: Enviar o relatório" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remover prazo: Enviar o relatório" })).toBeDisabled();
  });

  it("does not erase or resubmit the retained edit when selection is suspended", async () => {
    const user = userEvent.setup();
    const { onEditChange, props, rerender } = renderEditor();
    await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Título" }), {
      target: { value: "Enviar o relatório assinado" },
    });
    const callCount = onEditChange.mock.calls.length;

    rerender(<CandidateEditor {...props} selected={false} />);

    expect(onEditChange).toHaveBeenCalledTimes(callCount);
    expect(screen.getByRole("textbox", { name: "Título" })).toHaveValue("Enviar o relatório assinado");
  });

  it("preserves local values when reselected in the same mounted session", async () => {
    const user = userEvent.setup();
    const { props, rerender } = renderEditor();
    await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));
    const title = screen.getByRole("textbox", { name: "Título" });
    await user.clear(title);
    await user.type(title, "Enviar o relatório assinado");

    rerender(<CandidateEditor {...props} selected={false} />);
    rerender(<CandidateEditor {...props} selected />);

    expect(screen.getByRole("textbox", { name: "Título" })).toHaveValue("Enviar o relatório assinado");
  });

  it("provides programmatic labels for every editable field", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));

    expect(screen.getByRole("textbox", { name: "Título" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Descrição" })).toBeVisible();
    expect(screen.getByLabelText("Data limite (America/Sao_Paulo)")).toHaveAttribute("type", "datetime-local");
  });

  it("uses a native fieldset and legend for the candidate group", () => {
    renderEditor();

    const group = screen.getByRole("group", { name: "Sugestão: Enviar o relatório" });
    expect(group.tagName).toBe("FIELDSET");
    expect(group.firstElementChild?.tagName).toBe("LEGEND");
    expect(group.firstElementChild).toHaveTextContent("Sugestão: Enviar o relatório");
  });

  it("keeps every editor action form-safe", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    const onEditChange = vi.fn();
    render(
      <form onSubmit={onSubmit}>
        <CandidateEditor
          candidate={candidate}
          entryId={entryId}
          locale="pt-BR"
          onEditChange={onEditChange}
          selected
          timezone="America/Sao_Paulo"
        />
      </form>,
    );

    const edit = screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" });
    expect(edit).toHaveAttribute("type", "button");
    await user.click(edit);
    const actions = [
      screen.getByRole("button", { name: "Restaurar sugestão: Enviar o relatório" }),
      screen.getByRole("button", { name: "Remover descrição: Enviar o relatório" }),
      screen.getByRole("button", { name: "Remover prazo: Enviar o relatório" }),
    ];
    for (const action of actions) {
      expect(action).toHaveAttribute("type", "button");
      await user.click(action);
    }
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("associates a title error with the invalid field", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));
    const title = screen.getByRole("textbox", { name: "Título" });

    await user.clear(title);
    await user.tab();

    const error = screen.getByRole("alert", { name: "Erro no título" });
    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(title).toHaveAttribute("aria-describedby", error.id);
  });

  it("associates title-length and description-length errors with their fields", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));
    const title = screen.getByRole("textbox", { name: "Título" });
    const description = screen.getByRole("textbox", { name: "Descrição" });

    fireEvent.change(title, { target: { value: "t".repeat(241) } });
    fireEvent.blur(title);
    fireEvent.change(description, { target: { value: "d".repeat(2_001) } });
    fireEvent.blur(description);

    const titleError = screen.getByRole("alert", { name: "Erro de tamanho do título" });
    const descriptionError = screen.getByRole("alert", { name: "Erro de tamanho da descrição" });
    expect(titleError).toHaveTextContent("O título deve ter no máximo 240 caracteres.");
    expect(descriptionError).toHaveTextContent("A descrição deve ter no máximo 2.000 caracteres.");
    expect(titleError.id).not.toBe("");
    expect(descriptionError.id).not.toBe("");
    expect(title.getAttribute("aria-describedby")?.split(/\s+/)).toContain(titleError.id);
    expect(description.getAttribute("aria-describedby")?.split(/\s+/)).toContain(descriptionError.id);
    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(description).toHaveAttribute("aria-invalid", "true");
  });

  it("provides exact English length errors with programmatic field association", async () => {
    const user = userEvent.setup();
    renderEditor({ locale: "en" });
    await user.click(screen.getByRole("button", { name: "Edit suggestion: Enviar o relatório" }));
    const title = screen.getByRole("textbox", { name: "Title" });
    const description = screen.getByRole("textbox", { name: "Description" });

    fireEvent.change(title, { target: { value: "t".repeat(241) } });
    fireEvent.blur(title);
    fireEvent.change(description, { target: { value: "d".repeat(2_001) } });
    fireEvent.blur(description);

    const titleError = screen.getByRole("alert", { name: "Title length error" });
    const descriptionError = screen.getByRole("alert", { name: "Description length error" });
    expect(titleError).toHaveTextContent("Title must be 240 characters or fewer.");
    expect(descriptionError).toHaveTextContent("Description must be 2,000 characters or fewer.");
    expect(titleError.id).not.toBe("");
    expect(descriptionError.id).not.toBe("");
    expect(title.getAttribute("aria-describedby")?.split(/\s+/)).toContain(titleError.id);
    expect(description.getAttribute("aria-describedby")?.split(/\s+/)).toContain(descriptionError.id);
  });

  it("supports keyboard expansion and predictable field order", async () => {
    const user = userEvent.setup();
    renderEditor();
    const editButton = screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" });

    editButton.focus();
    await user.keyboard("{Enter}");
    await user.tab();

    expect(screen.getByRole("textbox", { name: "Título" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("textbox", { name: "Descrição" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Remover descrição: Enviar o relatório" })).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText("Data limite (America/Sao_Paulo)")).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Remover prazo: Enviar o relatório" })).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText("Data planejada (America/Sao_Paulo)")).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Remover data planejada: Enviar o relatório" })).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText("Prioridade")).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("checkbox", { name: "Sem prazo definido: Enviar o relatório" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Restaurar sugestão: Enviar o relatório" })).toHaveFocus();
  });

  it("announces reset through a polite live region", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));
    const title = screen.getByRole("textbox", { name: "Título" });
    await user.clear(title);
    await user.type(title, "Enviar o relatório assinado");

    await user.click(screen.getByRole("button", { name: "Restaurar sugestão: Enviar o relatório" }));

    expect(screen.getByRole("status")).toHaveTextContent("Sugestão restaurada.");
  });

  it("keeps focus on the reset control after restoring the suggestion", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Título" }), {
      target: { value: "Enviar o relatório assinado" },
    });
    const reset = screen.getByRole("button", { name: "Restaurar sugestão: Enviar o relatório" });

    await user.click(reset);

    expect(reset).toHaveFocus();
  });

  it("keeps every actionable control at least 44 pixels at a narrow viewport", async () => {
    const stylesheet = document.createElement("style");
    stylesheet.textContent = readFileSync(path.join(process.cwd(), "src/app/operations.css"), "utf8");
    document.head.append(stylesheet);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 412 });
    window.dispatchEvent(new Event("resize"));
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));

    const group = screen.getByRole("group", { name: "Sugestão: Enviar o relatório" });
    const controls = [
      ...within(group).getAllByRole("button"),
      ...within(group).getAllByRole("textbox"),
      screen.getByLabelText("Data limite (America/Sao_Paulo)"),
    ];
    for (const control of controls) {
      const style = getComputedStyle(control);
      expect(Math.max(parseFloat(style.minHeight) || 0, parseFloat(style.height) || 0)).toBeGreaterThanOrEqual(44);
      expect(Math.max(parseFloat(style.minWidth) || 0, parseFloat(style.width) || 0)).toBeGreaterThanOrEqual(44);
      expect(control).toBeVisible();
    }
  });

  it("never renders a confidence score in the primary flow", () => {
    const candidateWithConfidence = { ...candidate, confidence: 0.97 } as ActionableCandidateView;
    const { container } = renderEditor({ candidate: candidateWithConfidence });

    expect(container.textContent).not.toMatch(/97%|0[,.]97/);
  });

  describe("planning, priority, and no-due (Slice 2C.2)", () => {
    it("starts with planned date, priority, and no-due all unset (no AI suggestion exists for them)", async () => {
      const user = userEvent.setup();
      renderEditor();
      await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));

      expect(screen.getByLabelText("Data planejada (America/Sao_Paulo)")).toHaveValue("");
      expect(screen.getByLabelText("Prioridade")).toHaveValue("");
      expect(screen.getByRole("checkbox", { name: "Sem prazo definido: Enviar o relatório" })).not.toBeChecked();
      expect(screen.queryByLabelText("Motivo (opcional)")).not.toBeInTheDocument();
    });

    it("emits a canonical planned-date-only edit", async () => {
      const user = userEvent.setup();
      const { onEditChange } = renderEditor();
      await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));

      fireEvent.change(screen.getByLabelText("Data planejada (America/Sao_Paulo)"), {
        target: { value: "2026-08-01T09:00" },
      });

      expect(onEditChange).toHaveBeenLastCalledWith({
        candidateIndex: 0,
        changes: { plannedAt: "2026-08-01T09:00:00-03:00" },
      });
    });

    it("emits a canonical priority-only edit", async () => {
      const user = userEvent.setup();
      const { onEditChange } = renderEditor();
      await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));

      await user.selectOptions(screen.getByLabelText("Prioridade"), "urgent");

      expect(onEditChange).toHaveBeenLastCalledWith({
        candidateIndex: 0,
        changes: { manualPriority: "urgent" },
      });
    });

    it("clears the planned date via its explicit clear control", async () => {
      const user = userEvent.setup();
      const { onEditChange } = renderEditor();
      await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));
      fireEvent.change(screen.getByLabelText("Data planejada (America/Sao_Paulo)"), {
        target: { value: "2026-08-01T09:00" },
      });

      await user.click(screen.getByRole("button", { name: "Remover data planejada: Enviar o relatório" }));

      expect(screen.getByLabelText("Data planejada (America/Sao_Paulo)")).toHaveValue("");
      expect(onEditChange).toHaveBeenLastCalledWith(null);
    });

    it("checking no-due clears and disables the due-date field and reveals a reason field", async () => {
      const user = userEvent.setup();
      const { onEditChange } = renderEditor();
      await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));

      await user.click(screen.getByRole("checkbox", { name: "Sem prazo definido: Enviar o relatório" }));

      expect(screen.getByLabelText("Data limite (America/Sao_Paulo)")).toHaveValue("");
      expect(screen.getByLabelText("Data limite (America/Sao_Paulo)")).toBeDisabled();
      expect(screen.getByLabelText("Motivo (opcional)")).toBeVisible();
      expect(onEditChange).toHaveBeenLastCalledWith({
        candidateIndex: 0,
        changes: { dueAt: null, intentionalNoDue: true },
      });
    });

    it("emits the canonical no-due reason once provided", async () => {
      const user = userEvent.setup();
      const { onEditChange } = renderEditor();
      await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));
      await user.click(screen.getByRole("checkbox", { name: "Sem prazo definido: Enviar o relatório" }));

      await user.type(screen.getByLabelText("Motivo (opcional)"), "Someday, not now");

      expect(onEditChange).toHaveBeenLastCalledWith({
        candidateIndex: 0,
        changes: { dueAt: null, intentionalNoDue: true, noDueReason: "Someday, not now" },
      });
    });

    it("unchecking no-due re-enables the due-date field and hides/clears the reason", async () => {
      const user = userEvent.setup();
      renderEditor();
      await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));
      const noDueToggle = screen.getByRole("checkbox", { name: "Sem prazo definido: Enviar o relatório" });
      await user.click(noDueToggle);
      await user.type(screen.getByLabelText("Motivo (opcional)"), "Someday");

      await user.click(noDueToggle);

      expect(screen.getByLabelText("Data limite (America/Sao_Paulo)")).not.toBeDisabled();
      expect(screen.queryByLabelText("Motivo (opcional)")).not.toBeInTheDocument();
    });

    it("resets planned date, priority, and no-due state back to unset", async () => {
      const user = userEvent.setup();
      const { onEditChange } = renderEditor();
      await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));
      fireEvent.change(screen.getByLabelText("Data planejada (America/Sao_Paulo)"), {
        target: { value: "2026-08-01T09:00" },
      });
      await user.selectOptions(screen.getByLabelText("Prioridade"), "high");

      await user.click(screen.getByRole("button", { name: "Restaurar sugestão: Enviar o relatório" }));

      expect(screen.getByLabelText("Data planejada (America/Sao_Paulo)")).toHaveValue("");
      expect(screen.getByLabelText("Prioridade")).toHaveValue("");
      expect(onEditChange).toHaveBeenLastCalledWith(null);
    });

    it("clears an existing suggested due date when no-due is checked, keeping the effective state consistent", async () => {
      const user = userEvent.setup();
      const candidateWithDueAt: ActionableCandidateView = {
        ...candidate,
        dueAt: "2026-07-21T17:30:00+00:00",
      };
      const { onEditChange } = renderEditor({ candidate: candidateWithDueAt });
      await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));

      await user.click(screen.getByRole("checkbox", { name: "Sem prazo definido: Enviar o relatório" }));

      expect(onEditChange).toHaveBeenLastCalledWith({
        candidateIndex: 0,
        changes: { dueAt: null, intentionalNoDue: true },
      });
    });
  });

  describe("editable-candidate analytics", () => {
    it("does not record an edit-started event merely from mounting or expanding", async () => {
      const user = userEvent.setup();
      renderEditor();

      await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));

      expect(recordCandidateEditStarted).not.toHaveBeenCalled();
    });

    it("does not record an edit-started event from a prop-driven rerender", () => {
      const { props, rerender } = renderEditor();

      rerender(<CandidateEditor {...props} timezone="America/Sao_Paulo" />);
      rerender(<CandidateEditor {...props} />);

      expect(recordCandidateEditStarted).not.toHaveBeenCalled();
    });

    it("does not record an edit-started event from a React Strict Mode double mount", () => {
      render(
        <StrictMode>
          <CandidateEditor
            candidate={candidate}
            entryId={entryId}
            locale="pt-BR"
            onEditChange={vi.fn()}
            selected
            timezone="America/Sao_Paulo"
          />
        </StrictMode>,
      );

      expect(recordCandidateEditStarted).not.toHaveBeenCalled();
    });

    it("records an edit-started event when the user actually changes a field", async () => {
      const user = userEvent.setup();
      renderEditor();
      await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));

      await user.type(screen.getByRole("textbox", { name: "Título" }), " assinado");

      expect(recordCandidateEditStarted).toHaveBeenCalledWith({
        candidateIndex: 0,
        entryId,
        locale: "pt-BR",
      });
    });

    it("records an edit-started event for an explicit clear action", async () => {
      const user = userEvent.setup();
      renderEditor();
      await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));

      await user.click(screen.getByRole("button", { name: "Remover descrição: Enviar o relatório" }));

      expect(recordCandidateEditStarted).toHaveBeenCalledWith({
        candidateIndex: 0,
        entryId,
        locale: "pt-BR",
      });
    });

    it("does not record a reset event for an explicit clear action", async () => {
      const user = userEvent.setup();
      renderEditor();
      await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));

      await user.click(screen.getByRole("button", { name: "Remover descrição: Enviar o relatório" }));
      await user.click(screen.getByRole("button", { name: "Remover prazo: Enviar o relatório" }));

      expect(recordCandidateEditReset).not.toHaveBeenCalled();
    });

    it("records a reset event with the canonical edited-field count before restoring", async () => {
      const user = userEvent.setup();
      renderEditor();
      await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));
      fireEvent.change(screen.getByRole("textbox", { name: "Título" }), {
        target: { value: "Enviar o relatório assinado" },
      });
      fireEvent.change(screen.getByRole("textbox", { name: "Descrição" }), {
        target: { value: "Incluir a última revisão" },
      });

      await user.click(screen.getByRole("button", { name: "Restaurar sugestão: Enviar o relatório" }));

      expect(recordCandidateEditReset).toHaveBeenCalledWith({
        editedFieldCount: 2,
        entryId,
        locale: "pt-BR",
      });
    });

    it("records a reset event with zero edited fields when nothing changed", async () => {
      const user = userEvent.setup();
      renderEditor();
      await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));

      await user.click(screen.getByRole("button", { name: "Restaurar sugestão: Enviar o relatório" }));

      expect(recordCandidateEditReset).toHaveBeenCalledWith({
        editedFieldCount: 0,
        entryId,
        locale: "pt-BR",
      });
    });
  });

  describe("owned relations (Slice 2C.3)", () => {
    const projectP1 = "11111111-1111-4111-8111-111111111111";
    const projectP2 = "22222222-2222-4222-8222-222222222222";
    const contextC1 = "33333333-3333-4333-8333-333333333333";
    const personU1 = "44444444-4444-4444-8444-444444444444";
    const personU2 = "55555555-5555-4555-8555-555555555555";
    const relationOptions = {
      projects: [{ id: projectP1, label: "Website relaunch" }, { id: projectP2, label: "Q3 planning" }],
      contexts: [{ id: contextC1, label: "Work" }],
      people: [{ id: personU1, label: "Alice" }, { id: personU2, label: "Bob" }],
    };

    it("does not render disabled clear controls when no owned relations exist", () => {
      renderEditor();

      expect(screen.queryByRole("button", { name: "Remover projetos: Enviar o relatório" })).not.toBeInTheDocument();
    });

    it("emits a project selection as a canonical edit", async () => {
      const user = userEvent.setup();
      const { onEditChange } = renderEditor({ relationOptions });
      await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));

      await user.selectOptions(screen.getByRole("listbox", { name: "Projetos" }), [projectP2]);

      expect(onEditChange).toHaveBeenLastCalledWith({
        candidateIndex: 0,
        changes: { projectIds: [projectP2] },
      });
    });

    it("emits a waiting-on person separately from the general people selection", async () => {
      const user = userEvent.setup();
      const { onEditChange } = renderEditor({ relationOptions });
      await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));

      await user.selectOptions(screen.getByRole("listbox", { name: "Pessoas" }), [personU1]);
      await user.selectOptions(screen.getByRole("listbox", { name: "Aguardando por" }), [personU2]);

      expect(onEditChange).toHaveBeenLastCalledWith({
        candidateIndex: 0,
        changes: { personIds: [personU1], waitingOnPersonIds: [personU2] },
      });
    });

    it("sorts multiple selected relation IDs canonically", async () => {
      const user = userEvent.setup();
      const { onEditChange } = renderEditor({ relationOptions });
      await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));

      await user.selectOptions(screen.getByRole("listbox", { name: "Projetos" }), [projectP2, projectP1]);

      expect(onEditChange).toHaveBeenLastCalledWith({
        candidateIndex: 0,
        changes: { projectIds: [projectP1, projectP2] },
      });
    });

    it("clears a relation selection via its dedicated clear control", async () => {
      const user = userEvent.setup();
      const { onEditChange } = renderEditor({ relationOptions });
      await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));
      await user.selectOptions(screen.getByRole("listbox", { name: "Contextos" }), [contextC1]);

      await user.click(screen.getByRole("button", { name: "Remover contextos: Enviar o relatório" }));

      expect(onEditChange).toHaveBeenLastCalledWith(null);
    });

    it("resets every relation selection when restoring the suggestion", async () => {
      const user = userEvent.setup();
      const { onEditChange } = renderEditor({ relationOptions });
      await user.click(screen.getByRole("button", { name: "Editar sugestão: Enviar o relatório" }));
      await user.selectOptions(screen.getByRole("listbox", { name: "Projetos" }), [projectP1]);

      await user.click(screen.getByRole("button", { name: "Restaurar sugestão: Enviar o relatório" }));

      expect(onEditChange).toHaveBeenLastCalledWith(null);
      expect(screen.getByRole("listbox", { name: "Projetos" })).toHaveDisplayValue([]);
    });
  });
});
