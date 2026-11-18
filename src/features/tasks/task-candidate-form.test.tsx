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

/** The row that asks about one suggestion: the question, its answers, its editor. */
function rowFor(title: string) {
  return screen.getByRole("group", { name: `Decisão para: ${title}` });
}

function answer(title: string, name: string) {
  return within(rowFor(title)).getByRole("button", { name });
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

const createAll = () => screen.getByRole("button", { name: "Criar as 2 tarefas" });

describe("TaskCandidateForm", () => {
  it("asks one question per suggestion, with its answers beside it and the rarer ones at rest hidden", () => {
    renderForm();

    const rows = document.querySelectorAll(".task-candidate-decision-card");
    expect(rows).toHaveLength(2);

    const row = rowFor("Atualizar o relatório");
    expect(within(row).getByText("Criar a tarefa “Atualizar o relatório”?")).toBeVisible();
    expect(row.querySelector(":scope > .task-candidate-question")).not.toBeNull();
    expect([...row.querySelectorAll(":scope > .task-candidate-meta")].map((meta) => meta.textContent))
      .toEqual(["Revisar o rascunho", expect.stringMatching(/^Prazo: /)]);
    expect(within(row).getByRole("button", { name: "Criar tarefa" })).toBeEnabled();
    expect(within(row).getByRole("button", { name: "Ignorar" })).toBeEnabled();
    expect(within(row).getByRole("button", { name: "Mais opções" })).toHaveAttribute("aria-expanded", "false");
    expect(within(row).queryByRole("button", { name: "Rejeitar sugestão" })).toBeNull();
    expect(within(row).queryByRole("button", { name: "Manter como registro" })).toBeNull();
  });

  it("renders no checkbox, no radio and no separate submit: an answer is a tap", () => {
    const { container } = renderForm();

    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /Resolver/ })).toBeNull();
    expect(container.querySelector("button[type='submit']")).toBeNull();
    // Nothing is `variant="primary"`: a record can suggest several tasks.
    expect(container.querySelector(".ui-button--primary")).toBeNull();
  });

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

  it("writes exactly one resolution per tap, in the envelope the batch form sent", async () => {
    const user = userEvent.setup();
    const action = actionReturning();
    renderForm({ action });

    await user.click(answer("Conversar com Maria", "Criar tarefa"));

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    const data = submittedFormData(action);
    expect(data.getAll("candidateIndex")).toEqual(["1"]);
    expect(data.get("candidateResolutions")).toBe(
      '[{"candidateIndex":1,"disposition":"confirmed"}]',
    );
    expect(data.get("candidateEdits")).toBe("[]");
    expect(data.get("entryId")).toBe(entryId);
    expect(data.get("interpretationId")).toBe(interpretationId);
    expect(data.get("locale")).toBe("pt-BR");
    expect(data.get("operationKey")).toBe(operationKey);
    // The Server Action reads these fields and no others; none was added.
    expect([...new Set(data.keys())].sort()).toEqual([
      "candidateEdits",
      "candidateIndex",
      "candidateResolutions",
      "entryId",
      "interpretationId",
      "locale",
      "operationKey",
    ]);
  });

  it("creates with this candidate's edit only, and names the edited title in the question first", async () => {
    const user = userEvent.setup();
    const action = actionReturning();
    renderForm({ action });
    const firstEditor = await expandEditor(user, "Atualizar o relatório");
    await user.clear(within(firstEditor).getByLabelText("Título"));
    await user.type(within(firstEditor).getByLabelText("Título"), "Relatório final");
    const secondEditor = await expandEditor(user, "Conversar com Maria");
    await user.click(within(secondEditor).getByRole("button", { name: "Remover descrição: Conversar com Maria" }));

    expect(within(rowFor("Atualizar o relatório")).getByText("Criar a tarefa “Relatório final”?")).toBeVisible();
    await user.click(answer("Atualizar o relatório", "Criar tarefa"));

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    const data = submittedFormData(action);
    expect(data.getAll("candidateIndex")).toEqual(["0"]);
    expect(data.get("candidateResolutions")).toBe(
      '[{"candidateIndex":0,"disposition":"confirmed"}]',
    );
    // The sibling's retained edit is not part of this decision.
    expect(data.get("candidateEdits")).toBe(
      '[{"candidateIndex":0,"changes":{"title":"Relatório final"}}]',
    );
  });

  it("ignores a suggestion as dismissed and sends no edits, even when it was edited", async () => {
    const user = userEvent.setup();
    const action = actionReturning();
    renderForm({ action });
    const editor = await expandEditor(user, "Atualizar o relatório");
    await user.clear(within(editor).getByLabelText("Título"));
    await user.type(within(editor).getByLabelText("Título"), "Relatório final");

    await user.click(answer("Atualizar o relatório", "Ignorar"));

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    const data = submittedFormData(action);
    expect(data.getAll("candidateIndex")).toEqual(["0"]);
    expect(data.get("candidateResolutions")).toBe(
      '[{"candidateIndex":0,"disposition":"dismissed"}]',
    );
    expect(data.get("candidateEdits")).toBe("[]");
  });

  it.each([
    ["Rejeitar sugestão", "rejected", "Marca a sugestão como incorreta ou inadequada."],
    ["Manter como registro", "retained", "Mantém somente no histórico desta entrada."],
  ])("reveals “%s” under Mais opções and writes it as %s", async (label, disposition, help) => {
    const user = userEvent.setup();
    const action = actionReturning();
    renderForm({ action });
    const row = rowFor("Conversar com Maria");
    const more = within(row).getByRole("button", { name: "Mais opções" });
    const panel = document.getElementById(more.getAttribute("aria-controls") ?? "");
    expect(panel).not.toBeNull();
    expect(panel).not.toBeVisible();

    await user.click(more);

    expect(more).toHaveAttribute("aria-expanded", "true");
    expect(panel).toBeVisible();
    expect(within(row).getByText(help)).toBeVisible();
    // Opening one row's options leaves the other row at rest.
    expect(within(rowFor("Atualizar o relatório")).queryByRole("button", { name: label })).toBeNull();
    await user.click(within(row).getByRole("button", { name: label }));

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    const data = submittedFormData(action);
    expect(data.getAll("candidateIndex")).toEqual(["1"]);
    expect(data.get("candidateResolutions")).toBe(
      `[{"candidateIndex":1,"disposition":"${disposition}"}]`,
    );
    expect(data.get("candidateEdits")).toBe("[]");
  });

  it("offers to create every suggestion at once only when there is more than one", () => {
    const { unmount } = renderForm();
    expect(createAll()).toHaveAttribute("type", "button");
    unmount();

    renderForm({ candidates: [candidates[0]] });
    expect(screen.queryByRole("button", { name: /^Criar as / })).toBeNull();
    expect(answer("Atualizar o relatório", "Criar tarefa")).toBeEnabled();
  });

  it("serializes unchanged candidates as an empty canonical edit array when creating them all", async () => {
    const user = userEvent.setup();
    const action = actionReturning();
    renderForm({ action });

    await user.click(createAll());

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(submittedFormData(action).getAll("candidateIndex")).toEqual(["0", "1"]);
    expect(submittedFormData(action).get("candidateResolutions")).toBe(
      '[{"candidateIndex":0,"disposition":"confirmed"},{"candidateIndex":1,"disposition":"confirmed"}]',
    );
    expect(submittedFormData(action).get("candidateEdits")).toBe("[]");
  });

  it("creates them all in one request, edits by ascending candidate index with canonical field order", async () => {
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

    await user.click(createAll());

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(submittedFormData(action).get("candidateResolutions")).toBe(
      '[{"candidateIndex":0,"disposition":"confirmed"},{"candidateIndex":1,"disposition":"confirmed"}]',
    );
    expect(submittedFormData(action).get("candidateEdits")).toBe(
      '[{"candidateIndex":0,"changes":{"title":"Relatório final","dueAt":null}},{"candidateIndex":1,"changes":{"description":"Nova descrição"}}]',
    );
  });

  // The reason the batch control exists: a pair linked to each other can only
  // be created by one request.
  describe("a suggestion whose edit names a sibling suggestion as its parent", () => {
    async function linkFirstToSecond(user: ReturnType<typeof userEvent.setup>) {
      const editor = await expandEditor(user, "Atualizar o relatório");
      await user.selectOptions(
        within(editor).getByRole("combobox", { name: "Tarefa-mãe" }),
        ["candidate:1"],
      );
    }

    it("is not sent alone: the owner is pointed at the control that creates both", async () => {
      const user = userEvent.setup();
      const action = actionReturning();
      renderForm({ action });
      await linkFirstToSecond(user);

      await user.click(answer("Atualizar o relatório", "Criar tarefa"));

      expect(await screen.findByText(
        "Esta tarefa está ligada a outra sugestão desta lista. Use “Criar as 2 tarefas” para criá-las juntas.",
      )).toHaveAttribute("role", "alert");
      expect(action).not.toHaveBeenCalled();
      // The edit that caused it is still there to act on.
      expect(within(editorFor("Atualizar o relatório")).getByRole("combobox", { name: "Tarefa-mãe" }))
        .toHaveValue("candidate:1");
    });

    it("is created together with its sibling by the batch control", async () => {
      const user = userEvent.setup();
      const action = actionReturning();
      renderForm({ action });
      await linkFirstToSecond(user);

      await user.click(createAll());

      await waitFor(() => expect(action).toHaveBeenCalledOnce());
      expect(submittedFormData(action).getAll("candidateIndex")).toEqual(["0", "1"]);
      expect(submittedFormData(action).get("candidateEdits")).toBe(
        '[{"candidateIndex":0,"changes":{"parentRef":{"type":"candidateIndex","value":1}}}]',
      );
    });

    it("does not stop the owner from ignoring it", async () => {
      const user = userEvent.setup();
      const action = actionReturning();
      renderForm({ action });
      await linkFirstToSecond(user);

      await user.click(answer("Atualizar o relatório", "Ignorar"));

      await waitFor(() => expect(action).toHaveBeenCalledOnce());
      expect(submittedFormData(action).get("candidateEdits")).toBe("[]");
    });
  });

  it("blocks creation while that candidate's editor has invalid local state, and only creation", async () => {
    const user = userEvent.setup();
    const action = actionReturning();
    renderForm({ action });
    const editor = await expandEditor(user, "Atualizar o relatório");
    await user.clear(within(editor).getByLabelText("Título"));

    // The state is what blocks, so it is awaited rather than read on the same
    // tick the editor reported it.
    await waitFor(() => expect(answer("Atualizar o relatório", "Criar tarefa")).toBeDisabled());
    expect(createAll()).toBeDisabled();
    expect(answer("Atualizar o relatório", "Ignorar")).toBeEnabled();
    expect(answer("Conversar com Maria", "Criar tarefa")).toBeEnabled();

    await user.click(answer("Atualizar o relatório", "Criar tarefa"));
    await user.click(createAll());
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

    await user.click(answer("Atualizar o relatório", "Criar tarefa"));

    const alert = await screen.findByText("Não foi possível criar as tarefas.");
    expect(alert).toHaveAttribute("role", "alert");
    expect(alert).toHaveAttribute("id", "candidate-form-error");
    expect(within(editor).getByLabelText("Título")).toHaveValue("Relatório final");
    expect(rowFor("Atualizar o relatório")).toBeVisible();
  });

  it("keeps one idempotency key for a same-payload retry and replaces it after a material payload change", async () => {
    const user = userEvent.setup();
    const action = actionReturning(recoverableErrorState);
    renderForm({ action });

    /*
     * Each click waits for the control to be enabled again first.
     *
     * Every answer is `disabled` while a request is in flight, so a click issued
     * before the previous action settles lands on a disabled button and is
     * silently dropped — the retry this case is about would never happen and
     * `mock.calls[1]` would be undefined. `user.click` flushes microtasks, which
     * settles the `useActionState` transition on a fast machine and *usually* on
     * a slow one; back-to-back clicks relied on scheduling rather than on state,
     * and failed three CI runs in a row on a two-core runner.
     *
     * Waiting on the button's own enabled state asserts the precondition the
     * clicks always had. What the case covers is unchanged: the same key must be
     * reused for a same-payload retry, and a material payload change — here, a
     * different answer to the same suggestion — must replace it.
     */
    const create = () => answer("Atualizar o relatório", "Criar tarefa");

    await user.click(create());
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(create()).toBeEnabled());

    await user.click(create());
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));

    const firstKey = submittedFormData(action, 0).get("operationKey");
    const retryKey = submittedFormData(action, 1).get("operationKey");
    expect(firstKey).toBe(operationKey);
    expect(retryKey).toBe(firstKey);

    await waitFor(() => expect(create()).toBeEnabled());
    await user.click(answer("Atualizar o relatório", "Ignorar"));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(3));
    expect(submittedFormData(action, 2).get("operationKey")).not.toBe(firstKey);
  });

  it("uses a new idempotency key for the next decision once one has been written", async () => {
    const user = userEvent.setup();
    const action = actionReturning();
    renderForm({ action });

    await user.click(answer("Atualizar o relatório", "Ignorar"));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(answer("Conversar com Maria", "Criar tarefa")).toBeEnabled());
    await user.click(answer("Conversar com Maria", "Criar tarefa"));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));

    expect(submittedFormData(action, 0).get("operationKey")).toBe(operationKey);
    expect(submittedFormData(action, 1).get("operationKey")).not.toBe(operationKey);
  });

  it("keeps the confirmation acknowledgement and undo control after a tap", async () => {
    const action = actionReturning({ ...successState, message: "2 tarefas criadas.", undoId: "undo-id" });
    const user = userEvent.setup();
    renderForm({
      action,
      undoAction: vi.fn(async () => ({ status: "success" as const, message: "Criação desfeita." })),
    });

    await user.click(createAll());

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

  it("submits each candidate's own key rather than its position in an already-filtered list", async () => {
    const user = userEvent.setup();
    const action = actionReturning();
    const preFiltered: ActionableCandidateView[] = [
      { key: "1", title: "Conversar com Maria" },
      { key: "2", title: "Enviar contrato" },
    ];
    renderForm({ action, candidates: preFiltered });

    await user.click(answer("Enviar contrato", "Criar tarefa"));

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(submittedFormData(action).getAll("candidateIndex")).toEqual(["2"]);
    expect(submittedFormData(action).get("candidateResolutions")).toBe(
      '[{"candidateIndex":2,"disposition":"confirmed"}]',
    );
  });

  it("announces confirmed tasks and exposes undo when available", () => {
    renderForm({
      initialState: { ...successState, message: "2 tarefas criadas.", undoId: "undo-id" },
      undoAction: vi.fn(async () => ({ status: "success" as const, message: "Criação desfeita." })),
    });

    expect(screen.getByRole("status")).toHaveTextContent("2 tarefas criadas.");
    expect(screen.getByRole("button", { name: "Desfazer decisões" })).toBeInTheDocument();
  });

  it("shows an explicit empty state instead of unusable controls when no candidate is available", () => {
    renderForm({ candidates: [] });

    expect(screen.queryByRole("button", { name: "Criar tarefa" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Criar as / })).not.toBeInTheDocument();
    expect(screen.getByText("Nenhuma sugestão pendente.")).toBeInTheDocument();
  });

  it("never renders a raw AI extraction confidence score", () => {
    const { container } = renderForm();

    expect(container.querySelector(".confidence-pill")).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\d+%/);
  });

  it("offers the same answers in concise English, without leaking a stored disposition name", async () => {
    const user = userEvent.setup();
    renderForm({ locale: "en" });

    const row = screen.getByRole("group", { name: "Decision for: Atualizar o relatório" });
    expect(within(row).getByText("Create the task “Atualizar o relatório”?")).toBeVisible();
    expect(within(row).getByText(/^Due: /, { selector: ".task-candidate-meta" })).toBeVisible();
    expect(within(row).getByRole("button", { name: "Create task" })).toBeEnabled();
    expect(within(row).getByRole("button", { name: "Ignore" })).toBeEnabled();
    await user.click(within(row).getByRole("button", { name: "More options" }));
    expect(within(row).getByRole("button", { name: "Reject suggestion" })).toBeVisible();
    expect(within(row).getByRole("button", { name: "Keep as record" })).toBeVisible();
    expect(within(row).getByText("Keeps it only in this entry's history.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Create all 2 tasks" })).toBeVisible();
    const answers = [...row.querySelectorAll(".task-candidate-actions, .task-candidate-more")]
      .map((element) => element.textContent)
      .join(" ");
    expect(answers).not.toMatch(/confirmed|rejected|retained|dismissed|cancelled/i);
  });

  it("keeps the other pending candidate after one is resolved and reconciles removed state", async () => {
    const user = userEvent.setup();
    const action = actionReturning({
      ...successState,
      message: "1 sugestão resolvida. Nenhuma tarefa criada.",
      undoId: "undo-id",
    });
    const rendered = renderForm({ action });
    const secondEditor = await expandEditor(user, "Conversar com Maria");
    await user.clear(within(secondEditor).getByLabelText("Descrição"));
    await user.type(within(secondEditor).getByLabelText("Descrição"), "Nova descrição");

    await user.click(within(rowFor("Atualizar o relatório")).getByRole("button", { name: "Mais opções" }));
    await user.click(answer("Atualizar o relatório", "Rejeitar sugestão"));

    // Gone at once, before the server's refreshed list arrives…
    expect(await screen.findByRole("status")).toHaveTextContent(
      "1 sugestão resolvida. Nenhuma tarefa criada.",
    );
    expect(screen.queryByRole("group", { name: "Decisão para: Atualizar o relatório" })).toBeNull();

    // …and still gone, with the other row untouched, once it does.
    rendered.rerender(<TaskCandidateForm {...rendered.props} candidates={[candidates[1]]} />);

    expect(screen.getByRole("status")).toHaveTextContent("1 sugestão resolvida. Nenhuma tarefa criada.");
    expect(screen.queryByText(/Atualizar o relatório/)).not.toBeInTheDocument();
    expect(rowFor("Conversar com Maria")).toBeVisible();
    expect(answer("Conversar com Maria", "Criar tarefa")).toBeEnabled();
    expect(within(editorFor("Conversar com Maria")).getByLabelText("Descrição")).toHaveValue("Nova descrição");
    // One suggestion left: there is nothing to batch.
    expect(screen.queryByRole("button", { name: /^Criar as / })).toBeNull();
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
      // Once on the candidate row, once inside its editor — and both read the
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
      // The row claims no due date it could not read.
      expect(rowFor("Atualizar o relatório").querySelectorAll(":scope > .task-candidate-meta"))
        .toHaveLength(1);
      expect(answer("Atualizar o relatório", "Criar tarefa")).toBeEnabled();
      expect(createAll()).toBeEnabled();
    });

    it("still resolves the batch around the unreadable field", async () => {
      const user = userEvent.setup();
      const { action } = renderForm({
        candidates: [{ ...candidates[0], dueAt: "2026-08-08" }, candidates[1]],
      });

      await user.click(createAll());

      await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
      expect(await screen.findByRole("status")).toHaveTextContent("Sugestões resolvidas.");
    });

    it("still creates the one candidate that carries the unreadable field", async () => {
      const user = userEvent.setup();
      const { action } = renderForm({
        candidates: [{ ...candidates[0], dueAt: "2026-08-08" }, candidates[1]],
      });

      await user.click(answer("Atualizar o relatório", "Criar tarefa"));

      await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
      expect(submittedFormData(action).get("candidateEdits")).toBe("[]");
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
