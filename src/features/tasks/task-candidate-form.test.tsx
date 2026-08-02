import { render, screen, waitFor, within } from "@testing-library/react";
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
  code: "resolved",
  message: "Sugestões resolvidas.",
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

    const editors = screen.getAllByRole("group", { name: /^Sugestão:/ });
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

    const checkbox = screen.getByRole("checkbox", { name: /^Atualizar o relatório/ });
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
    await user.click(screen.getByRole("checkbox", { name: /^Atualizar o relatório/ }));

    await user.click(screen.getByRole("button", { name: "Resolver 1 sugestão" }));

    const data = submittedFormData(action);
    expect(data.getAll("candidateIndex")).toEqual(["1"]);
    expect(data.get("candidateResolutions")).toBe(
      '[{"candidateIndex":1,"disposition":"confirmed"}]',
    );
    expect(data.get("candidateEdits")).toBe('[{"candidateIndex":1,"changes":{"description":null}}]');
  });

  it("serializes unchanged selected candidates as an empty canonical edit array", async () => {
    const user = userEvent.setup();
    const action = actionReturning();
    renderForm({ action });

    await user.click(screen.getByRole("button", { name: "Resolver 2 sugestões" }));

    expect(submittedFormData(action).get("candidateResolutions")).toBe(
      '[{"candidateIndex":0,"disposition":"confirmed"},{"candidateIndex":1,"disposition":"confirmed"}]',
    );
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

    await user.click(screen.getByRole("button", { name: "Resolver 2 sugestões" }));

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

    await user.click(screen.getByRole("button", { name: "Resolver 2 sugestões" }));

    expect(submittedFormData(action).getAll("candidateEdits")).toEqual(["[]"]);
  });

  it("blocks submission while a selected editor has invalid local state", async () => {
    const user = userEvent.setup();
    const action = actionReturning();
    renderForm({ action });
    const editor = await expandEditor(user, "Atualizar o relatório");
    await user.clear(within(editor).getByLabelText("Título"));

    await user.click(screen.getByRole("button", { name: "Resolver 2 sugestões" }));

    // Awaited, not read synchronously. The sibling failure test below already
    // uses `findByText` for the same alert, and this one did not: it passed
    // whenever the validation state happened to flush inside the click's own
    // act() and failed when it did not, which it did once locally and once in
    // CI run 30177038383. Asserting the alert first also gives the component
    // every chance to have wrongly submitted before `action` is checked.
    expect(await screen.findByText("Revise as decisões e edições antes de continuar."))
      .toHaveAttribute("role", "alert");
    expect(action).not.toHaveBeenCalled();
  });

  it("retains edits after a recoverable action failure", async () => {
    const user = userEvent.setup();
    const action = actionReturning(recoverableErrorState);
    renderForm({ action });
    const editor = await expandEditor(user, "Atualizar o relatório");
    const title = within(editor).getByLabelText("Título");
    await user.clear(title);
    await user.type(title, "Relatório final");

    await user.click(screen.getByRole("button", { name: "Resolver 2 sugestões" }));

    expect(await screen.findByText("Não foi possível criar as tarefas.")).toHaveAttribute("role", "alert");
    expect(within(editor).getByLabelText("Título")).toHaveValue("Relatório final");
  });

  it("keeps one idempotency key for a same-payload retry and replaces it after a material payload change", async () => {
    const user = userEvent.setup();
    const action = actionReturning(recoverableErrorState);
    renderForm({ action });

    /*
     * Each click waits for the submit button to be enabled again first.
     *
     * `disabled={pending || selected.length === 0}` (`task-candidate-form.tsx:517`)
     * means a click issued while the previous action is still in flight lands on
     * a disabled button and is silently dropped — so the retry this case is about
     * never happens and `mock.calls[1]` is undefined. `user.click` flushes
     * microtasks, which settles the `useActionState` transition on a fast machine
     * and *usually* on a slow one; back-to-back clicks were therefore relying on
     * scheduling rather than on state. It passed for months and then failed three
     * CI runs in a row when an unrelated slice added test files and changed worker
     * load on a two-core runner.
     *
     * Waiting on the button's own enabled state asserts the precondition the
     * clicks always had, instead of hoping for it. Nothing about what the case
     * covers changes: the same key must be reused for a same-payload retry, and a
     * material payload change must replace it.
     */
    const submit = (name: string) => screen.getByRole("button", { name });

    await user.click(submit("Resolver 2 sugestões"));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(submit("Resolver 2 sugestões")).toBeEnabled());

    await user.click(submit("Resolver 2 sugestões"));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));

    const firstKey = submittedFormData(action, 0).get("operationKey");
    const retryKey = submittedFormData(action, 1).get("operationKey");
    expect(firstKey).toBe(operationKey);
    expect(retryKey).toBe(firstKey);

    await waitFor(() => expect(submit("Resolver 2 sugestões")).toBeEnabled());
    await user.click(screen.getByRole("checkbox", { name: /^Conversar com Maria/ }));
    await user.click(submit("Resolver 1 sugestão"));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(3));
    expect(submittedFormData(action, 2).get("operationKey")).not.toBe(firstKey);
  });

  it("keeps the confirmation acknowledgement and undo control after submitting", async () => {
    const action = actionReturning({ ...successState, message: "2 tarefas criadas.", undoId: "undo-id" });
    const user = userEvent.setup();
    renderForm({
      action,
      undoAction: vi.fn(async () => ({ status: "success" as const, message: "Criação desfeita." })),
    });

    await user.click(screen.getByRole("button", { name: "Resolver 2 sugestões" }));

    expect(await screen.findByRole("status")).toHaveTextContent("2 tarefas criadas.");
    expect(screen.getByRole("button", { name: "Desfazer decisões" })).toBeVisible();
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
    expect(screen.getByRole("button", { name: "Resolver 2 sugestões" })).toHaveAttribute("type", "submit");
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
    expect(screen.getByRole("button", { name: "Desfazer decisões" })).toBeInTheDocument();
  });

  it("shows an explicit empty state instead of an unusable form when no candidate is available", () => {
    renderForm({ candidates: [] });

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Resolver/ })).not.toBeInTheDocument();
    expect(screen.getByText("Nenhuma sugestão pendente.")).toBeInTheDocument();
  });

  it("never renders a raw AI extraction confidence score", () => {
    const { container } = renderForm();

    expect(container.querySelector(".confidence-pill")).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\d+%/);
  });

  it("offers four concise localized decisions for every selected candidate with confirmed as default", () => {
    renderForm({ locale: "en" });

    const decision = screen.getByRole("group", {
      name: "Decision for: Atualizar o relatório",
    });
    const radios = within(decision).getAllByRole("radio") as HTMLInputElement[];
    expect(radios).toHaveLength(4);
    expect(within(decision).getByRole("radio", { name: "Create task" })).toBeChecked();
    expect(within(decision).getByRole("radio", { name: "Reject suggestion" })).not.toBeChecked();
    expect(within(decision).getByRole("radio", { name: "Keep as record" })).not.toBeChecked();
    expect(within(decision).getByRole("radio", { name: "Dismiss suggestion" })).not.toBeChecked();
    expect(within(decision).getByText("Keeps it only in this entry's history.")).toBeVisible();
    expect(decision.textContent).not.toMatch(/confirmed|rejected|retained|dismissed|cancelled/i);
  });

  it("submits one mixed canonical batch and omits edits for a non-confirming decision", async () => {
    const user = userEvent.setup();
    const action = actionReturning();
    renderForm({ action });
    const firstEditor = await expandEditor(user, "Atualizar o relatório");
    await user.clear(within(firstEditor).getByLabelText("Título"));
    await user.type(within(firstEditor).getByLabelText("Título"), "Relatório final");
    const secondEditor = await expandEditor(user, "Conversar com Maria");
    await user.click(within(secondEditor).getByRole("button", { name: "Remover descrição: Conversar com Maria" }));

    const secondDecision = screen.getByRole("group", { name: "Decisão para: Conversar com Maria" });
    await user.click(within(secondDecision).getByRole("radio", { name: "Rejeitar sugestão" }));
    expect(within(secondEditor).getByRole("button", { name: "Editar sugestão: Conversar com Maria" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Resolver 2 sugestões" }));

    const data = submittedFormData(action);
    expect(data.get("candidateResolutions")).toBe(
      '[{"candidateIndex":0,"disposition":"confirmed"},{"candidateIndex":1,"disposition":"rejected"}]',
    );
    expect(data.get("candidateEdits")).toBe(
      '[{"candidateIndex":0,"changes":{"title":"Relatório final"}}]',
    );
    expect(action).toHaveBeenCalledOnce();
  });

  it("keeps an unselected pending candidate after partial success and reconciles removed state", async () => {
    const user = userEvent.setup();
    const action = actionReturning({
      ...successState,
      message: "1 sugestão resolvida. Nenhuma tarefa criada.",
      undoId: "undo-id",
    });
    const rendered = renderForm({ action });

    await user.click(screen.getByRole("checkbox", { name: /^Conversar com Maria/ }));
    await user.click(screen.getAllByRole("radio", { name: "Rejeitar sugestão" })[0]);
    await user.click(screen.getByRole("button", { name: "Resolver 1 sugestão" }));

    rendered.rerender(<TaskCandidateForm {...rendered.props} candidates={[candidates[1]]} />);

    expect(await screen.findByRole("status")).toHaveTextContent(
      "1 sugestão resolvida. Nenhuma tarefa criada.",
    );
    expect(screen.queryByText("Atualizar o relatório")).not.toBeInTheDocument();
    expect(screen.getAllByText("Conversar com Maria")[0]).toBeVisible();
    expect(screen.getByRole("checkbox", { name: /^Conversar com Maria/ })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Criar tarefa" })).toBeChecked();
  });

  // The form is what the entry detail route mounts for its "next actions", so
  // this is where a due date the editor cannot read either costs the owner one
  // field or costs them the whole page. Entry
  // bdf48c06-5ceb-4c27-a7c7-ddc901e366b2 lost the whole page.
  describe("a candidate whose due date the editor cannot read", () => {
    const endOfDayInstant = "2026-08-08T23:59:59-03:00";

    it("renders the batch when a candidate carries an instant with seconds", () => {
      renderForm({
        candidates: [{ ...candidates[0], dueAt: endOfDayInstant }, candidates[1]],
      });

      expect(editorFor("Atualizar o relatório")).toBeVisible();
      expect(editorFor("Conversar com Maria")).toBeVisible();
      // Once on the candidate card, once inside its editor — and both read the
      // owner's timezone, so they never disagree.
      const labels = screen.getAllByText(/^Prazo: .*23:59$/);
      expect(labels).toHaveLength(2);
      for (const label of labels) expect(label).toBeVisible();
    });

    it.each([
      ["a date-only value", "2026-08-08"],
      ["a local date-time without an offset", "2026-08-08T23:59:00"],
      ["a SQL-style timestamp", "2026-08-08 23:59:00+00"],
      ["a malformed offset", "2026-08-08T23:59:00+3:00"],
      ["an impossible date", "2026-02-30T10:00:00-03:00"],
    ])("renders the whole batch when one candidate carries %s", (_label, dueAt) => {
      renderForm({ candidates: [{ ...candidates[0], dueAt }, candidates[1]] });

      expect(editorFor("Atualizar o relatório")).toBeVisible();
      expect(editorFor("Conversar com Maria")).toBeVisible();
      expect(screen.getByText(
        "Não foi possível ler o prazo sugerido. Defina uma data se quiser um prazo.",
      )).toBeVisible();
      expect(screen.getByRole("button", { name: /^Resolver/ })).toBeVisible();
    });

    it("still resolves the batch around the unreadable field", async () => {
      const user = userEvent.setup();
      const { action } = renderForm({
        candidates: [{ ...candidates[0], dueAt: "2026-08-08" }, candidates[1]],
      });

      await user.click(screen.getByRole("button", { name: "Resolver 2 sugestões" }));

      await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
      expect(await screen.findByRole("status")).toHaveTextContent("Sugestões resolvidas.");
    });

    it("keeps a valid sibling due date working alongside an unreadable one", async () => {
      const user = userEvent.setup();
      renderForm({
        candidates: [
          { ...candidates[0], dueAt: "2026-08-08" },
          { ...candidates[1], dueAt: endOfDayInstant },
        ],
      });

      await expandEditor(user, "Conversar com Maria");

      expect(within(editorFor("Conversar com Maria"))
        .getByLabelText("Data limite (America/Sao_Paulo)"))
        .toHaveValue("2026-08-08T23:59");
    });
  });
});
