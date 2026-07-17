import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  InterpretationRevisionEditor,
  type CorrectionAction,
  type ReprocessAction,
  type UndoCorrectionAction,
} from "./revision-editor";

const correctionAction = vi.fn(async () => ({ status: "success" as const, message: "Revisão salva." })) as CorrectionAction;
const undoAction = vi.fn(async () => ({ status: "success" as const, message: "Correção desfeita." })) as UndoCorrectionAction;
const reprocessAction = vi.fn(async () => ({ status: "success" as const, message: "Entrada reinterpretada." })) as ReprocessAction;

afterEach(cleanup);

const props = {
  correctionAction,
  undoAction,
  reprocessAction,
  entryId: "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6",
  locale: "pt-BR" as const,
  canUndo: true,
  current: {
    version: 2,
    summary: "Resumo original",
    concepts: ["person_note" as const],
    occurredAt: "2026-07-17T14:00:00.000Z",
    extractedDates: [{ value: "2026-07-18", label: "prazo" }],
    entityLinks: [{ entityType: "person" as const, entityId: "ea9f441a-aa22-47bc-b8e7-cfe2209f5987", mention: "Marina", confidence: 0.91 }],
    classifications: { summary: "fact" as const, concepts: "interpretation" as const, occurredAt: "fact" as const, entities: "inference" as const },
    pendingQuestions: [{ question: "Qual projeto?", reason: "Projeto ambíguo", confidence: 0.52 }],
  },
  entityOptions: [
    { entityType: "person" as const, entityId: "ea9f441a-aa22-47bc-b8e7-cfe2209f5987", name: "Marina" },
    { entityType: "project" as const, entityId: "13f705ed-b92f-4e49-a35b-9931f820c054", name: "Atlas" },
  ],
};

describe("InterpretationRevisionEditor", () => {
  it("keeps the current interpretation read-only until correction is requested", () => {
    render(<InterpretationRevisionEditor {...props} />);

    expect(screen.getByText("Resumo original")).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Resumo" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Corrigir interpretação" }));

    expect(screen.getByRole("textbox", { name: "Resumo" })).toHaveValue("Resumo original");
    expect(screen.getByRole("checkbox", { name: /Nota sobre pessoa/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Marina/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Atlas/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Manter pergunta: Qual projeto/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Somente registrar, sem executar ações derivadas" })).not.toBeChecked();
    expect(screen.getByRole("textbox", { name: "Motivo da correção" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar nova versão" })).toHaveAttribute("type", "submit");
  });

  it("supports dates, classifications, cancellation, undo, and bounded reprocessing controls", () => {
    render(<InterpretationRevisionEditor {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Corrigir interpretação" }));

    expect(screen.getByLabelText("Data identificada 1")).toHaveValue("2026-07-18");
    fireEvent.click(screen.getByRole("button", { name: "Adicionar data" }));
    expect(screen.getByLabelText("Data identificada 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Classificação do resumo")).toHaveValue("fact");

    fireEvent.click(screen.getByRole("button", { name: "Cancelar correção" }));
    expect(screen.queryByRole("textbox", { name: "Resumo" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Desfazer última correção" })).toHaveAttribute("type", "submit");
    expect(screen.getByRole("button", { name: "Reinterpretar entrada" })).toHaveAttribute("type", "submit");
  });
});
