import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PersonCandidateForm } from "./person-candidate-form";
import type { PersonCandidateActionState } from "./person-candidate-actions";

const candidates = [
  { candidateIndex: 0, originalName: "Giovanna (Gigi)", proposedName: "Giovanna (Gigi)", evidence: "pra Giovanna", confidence: 1 },
  { candidateIndex: 1, originalName: "Jaime", proposedName: "Jaime", evidence: "para Jaime", confidence: 0.9 },
];
const idle: PersonCandidateActionState = { status: "idle", message: "", undoId: null };

function renderForm(overrides: Partial<React.ComponentProps<typeof PersonCandidateForm>> = {}) {
  const action = overrides.action ?? vi.fn(async () => ({
    status: "success" as const,
    code: "resolved" as const,
    message: "Decisões salvas.",
    undoId: "undo-1",
    retryable: false,
  }));
  return {
    action,
    ...render(<PersonCandidateForm
      action={action}
      candidates={candidates}
      entryId="72f1f8af-8b90-4f1d-9916-ec6d983fd4c6"
      interpretationId="94f6c9d0-2f4e-4a2e-8f2c-9b2a3c4d5e6f"
      locale="pt-BR"
      operationKey="6118fb25-2f80-432a-aa96-0e76d924862e"
      initialState={idle}
      {...overrides}
    />),
  };
}

describe("PersonCandidateForm", () => {
  it("renders no form when there are no pending candidates", () => {
    renderForm({ candidates: [] });
    expect(screen.queryByRole("group", { name: "Pessoas mencionadas" })).not.toBeInTheDocument();
  });

  it("starts with no decision selected and keeps name editing disabled", () => {
    renderForm();
    expect(screen.getByRole("group", { name: "Pessoas mencionadas" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio").every((radio) => !(radio as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByLabelText("Nome para criar: Giovanna (Gigi)")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Salvar decisões sobre pessoas" })).toBeDisabled();
  });

  it("submits independent create and ignore decisions with an edited name", async () => {
    const user = userEvent.setup();
    const { action } = renderForm();
    const giovanna = screen.getByRole("group", { name: "Pessoa mencionada: Giovanna (Gigi)" });
    const jaime = screen.getByRole("group", { name: "Pessoa mencionada: Jaime" });

    await user.click(within(giovanna).getByRole("radio", { name: "Criar pessoa" }));
    const name = within(giovanna).getByLabelText("Nome para criar: Giovanna (Gigi)");
    await user.clear(name);
    await user.type(name, "Giovanna");
    await user.click(within(jaime).getByRole("radio", { name: "Ignorar menção" }));
    await user.click(screen.getByRole("button", { name: "Salvar decisões sobre pessoas" }));

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    const submitted = vi.mocked(action).mock.calls[0]?.[1] as FormData;
    expect(JSON.parse(String(submitted.get("resolutions")))).toEqual([
      { candidateIndex: 0, disposition: "confirmed", resolvedName: "Giovanna" },
      { candidateIndex: 1, disposition: "rejected" },
    ]);
  });

  it("uses English accessible copy", () => {
    renderForm({ locale: "en", candidates: [candidates[0]] });
    expect(screen.getByRole("group", { name: "People mentioned" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Create person" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Ignore mention" })).toBeInTheDocument();
  });
});
