/**
 * `2I-LANG-004` / `2I-LANG-005` / `2I-TRUST-*` — behaviour, not structure.
 *
 * The structural claims (no write client, no dark tokens, tone icons exist)
 * live in `src/lib/closeout/phase-2i-experience-guard.test.ts`. These are the
 * ones only a render can make: what a user sees, what a screen reader is told,
 * and which controls exist.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConfirmationCard, SourceCard, SuggestionCard, UndoFeedback } from "./trust-components";
import { UniversalStateView } from "./universal-state";

describe("UniversalStateView — interpreting is the state this product needed", () => {
  it("says the content is already saved, in both locales", () => {
    const { unmount } = render(<UniversalStateView state="interpreting" locale="pt-BR" />);
    expect(screen.getByText("Suas palavras já estão salvas.")).toBeInTheDocument();
    unmount();

    render(<UniversalStateView state="interpreting" locale="en" />);
    expect(screen.getByText("Your words are already saved.")).toBeInTheDocument();
  });

  it("announces politely rather than interrupting", () => {
    render(<UniversalStateView state="interpreting" locale="pt-BR" />);
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveAttribute("data-content-safe", "true");
  });

  it("offers no retry, because there is nothing for the user to do yet", () => {
    render(<UniversalStateView state="interpreting" locale="pt-BR" onAction={vi.fn()} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("UniversalStateView — a failed interpretation is not a lost entry", () => {
  it("keeps the safety promise and offers a retry", () => {
    const onAction = vi.fn();
    render(<UniversalStateView state="interpretation_failed" locale="pt-BR" onAction={onAction} />);

    expect(screen.getByText("Nada do que você escreveu foi perdido.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});

describe("UniversalStateView — the terminal error is the control", () => {
  it("promises no safety and offers no retry even when handed one", () => {
    // Every other state claiming safety would be satisfied by a component that
    // always says yes. This is the case that proves it does not.
    render(<UniversalStateView state="error_terminal" locale="pt-BR" onAction={vi.fn()} />);

    expect(screen.getByRole("alert")).toHaveAttribute("data-content-safe", "false");
    expect(screen.queryByText(/salvas|perdido|alterado/)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("announces assertively, because the user cannot proceed", () => {
    render(<UniversalStateView state="error_terminal" locale="en" />);
    expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "assertive");
  });
});

describe("UniversalStateView — empty does not interrupt", () => {
  it("is not announced, because an empty list on arrival is not an event", () => {
    render(<UniversalStateView state="empty" locale="pt-BR" />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("still offers the action that would fill it", () => {
    const onAction = vi.fn();
    render(<UniversalStateView state="empty" locale="pt-BR" onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: "Capturar algo" }));
    expect(onAction).toHaveBeenCalled();
  });
});

describe("SuggestionCard — AI proposes, the user controls", () => {
  it("always offers dismiss beside confirm", () => {
    const onConfirm = vi.fn();
    const onDismiss = vi.fn();
    render(
      <SuggestionCard
        title="Criar tarefa"
        confirmLabel="Confirmar"
        dismissLabel="Descartar"
        onConfirm={onConfirm}
        onDismiss={onDismiss}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("ConfirmationCard — weight proportional to risk", () => {
  it("renders the consequence for a destructive action", () => {
    render(
      <ConfirmationCard
        destructive
        consequence="Isto apaga a tarefa e não pode ser desfeito."
        title="Apagar tarefa"
        confirmLabel="Apagar"
        cancelLabel="Cancelar"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Isto apaga a tarefa e não pode ser desfeito.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apagar" })).toHaveClass("ux-action-destructive");
  });

  it("does not dress a routine confirmation as destructive", () => {
    render(
      <ConfirmationCard
        title="Salvar"
        confirmLabel="Salvar"
        cancelLabel="Cancelar"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Salvar" })).not.toHaveClass("ux-action-destructive");
  });
});

describe("UndoFeedback — an undo that cannot work is worse than none", () => {
  it("offers undo when a handler exists", () => {
    const onUndo = vi.fn();
    render(<UndoFeedback message="Tarefa criada." undoLabel="Desfazer" onUndo={onUndo} />);
    fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    expect(onUndo).toHaveBeenCalled();
  });

  it("says so plainly when there is none, rather than disabling a control", () => {
    render(<UndoFeedback message="Enviado." noUndoNote="Não é possível desfazer." />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Não é possível desfazer.")).toBeInTheDocument();
  });
});

describe("SourceCard — type is text, never colour alone", () => {
  it("renders the type label and a real link", () => {
    render(
      <SourceCard
        kind="file"
        typeLabel="Arquivo"
        title="contrato.pdf"
        href="/pt-BR/app/files"
      />,
    );
    const link = screen.getByRole("link", { name: /contrato\.pdf/ });
    expect(link).toHaveAttribute("href", "/pt-BR/app/files");
    expect(screen.getByText("Arquivo")).toBeInTheDocument();
  });
});
