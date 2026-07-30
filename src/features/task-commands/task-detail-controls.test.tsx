/**
 * Slice D2 — the task detail edit controls, as rendered.
 *
 * The properties under test are the ones a screenshot cannot show:
 *
 *   * a control's *shape* follows its policy — a bounded value cannot render as
 *     free text, and a relation cannot render as an input the user could type an
 *     id into,
 *   * the destructive verb's dialog opens **only after the server has issued a
 *     confirmation**, and the Confirm form carries the operation key and instant
 *     that confirmation was bound to (2E-DESTRUCTIVE-003),
 *   * one operation key per action, minted once, rotated on a terminal outcome
 *     and *not* rotated while a confirmation is outstanding (2F-SURFACE-006),
 *   * no client-minted uuid reaches the markup, which would be a hydration
 *     mismatch.
 */

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { idleTaskDetailCommandState, type TaskDetailCommandState } from "./detail-action-state";
import { getTaskDetailControlsCopy } from "./detail-controls-copy";
import { detailControlsFor } from "./detail-controls";
import {
  TaskDetailControls,
  type TaskDetailRelationOptions,
} from "./task-detail-controls";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => refresh() }) }));

afterEach(() => {
  cleanup();
  refresh.mockReset();
});

const TASK_ID = "33333333-3333-4333-8333-333333333333";
const TITLE = "Enviar a proposta da Aurora";
const OBSERVED = "2026-07-30T12:00:00.000Z";
const BOUNDS = { min: "2024-07-30", max: "2028-07-29" };
const ptBR = getTaskDetailControlsCopy("pt-BR");
const en = getTaskDetailControlsCopy("en");

const options: TaskDetailRelationOptions = {
  project: [{ id: "p1", label: "Aurora Participações" }],
  context: [{ id: "c1", label: "Trabalho" }],
  person: [{ id: "u1", label: "Marina Duarte" }],
};

const emptyOptions: TaskDetailRelationOptions = { project: [], context: [], person: [] };

function settled(overrides: Partial<TaskDetailCommandState> = {}): TaskDetailCommandState {
  return {
    ...idleTaskDetailCommandState,
    status: "applied",
    heading: "Pronto",
    detail: "A alteração foi aplicada.",
    announcement: "Pronto. A alteração foi aplicada.",
    ...overrides,
  };
}

type Submission = Record<string, string>;

/**
 * A handler recording every submission and answering with a queue of states.
 *
 * The queue rather than one fixed answer, because the cancellation flow is two
 * rounds and the second must see what the first returned.
 */
function handler(...answers: readonly TaskDetailCommandState[]) {
  const submissions: Submission[] = [];
  let index = 0;
  const action = vi.fn(async (_state: TaskDetailCommandState, formData: FormData) => {
    const entry: Submission = {};
    for (const [key, value] of formData.entries()) {
      if (typeof value === "string") entry[key] = value;
    }
    submissions.push(entry);
    const answer = answers[Math.min(index, answers.length - 1)] ?? settled();
    index += 1;
    return answer;
  });
  return { action, submissions };
}

function renderControls(
  status: string,
  answers: readonly TaskDetailCommandState[] = [settled()],
  overrides: { readonly locale?: "pt-BR" | "en"; readonly relations?: TaskDetailRelationOptions } = {},
) {
  const { action, submissions } = handler(...answers);
  render(
    <TaskDetailControls
      action={action}
      controls={detailControlsFor(status)}
      dateBounds={BOUNDS}
      locale={overrides.locale ?? "pt-BR"}
      relationOptions={overrides.relations ?? options}
      taskId={TASK_ID}
      title={TITLE}
    />,
  );
  return { action, submissions };
}

/** The form a control's submit button belongs to. */
function formFor(label: string): HTMLFormElement {
  const button = screen.getByRole("button", { name: label });
  const form = button.closest("form");
  if (form === null) throw new Error(`the control "${label}" is not inside a form`);
  return form;
}

/**
 * The form a labelled field belongs to.
 *
 * Every valued control shares one submit label, so the field is what identifies
 * the form — asking for the button by name would match all of them.
 */
function formForField(fieldLabel: string): HTMLFormElement {
  const field = screen.getByLabelText(fieldLabel);
  const form = field.closest("form");
  if (form === null) throw new Error(`the field "${fieldLabel}" is not inside a form`);
  return form;
}

function hidden(form: HTMLFormElement, name: string): string | null {
  const input = form.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  return input === null ? null : input.value;
}

describe("the controls follow the taxonomy, not a hand-written list", () => {
  it("offers exactly the actions the status admits, each named in the user's language", () => {
    renderControls("todo");
    for (const control of detailControlsFor("todo")) {
      const name = ptBR.actions[control.action];
      // A control with a value is labelled by its field and submits with the
      // shared verb; one with no value is the button itself.
      expect(screen.getByText(name, { exact: false })).toBeTruthy();
    }
  });

  it("offers only restoration on a cancelled task", () => {
    renderControls("cancelled");
    expect(screen.getByRole("button", { name: ptBR.actions.restore_task })).toBeTruthy();
    expect(screen.queryByRole("button", { name: ptBR.actions.cancel_task })).toBeNull();
  });

  it("offers a completed task only the two edits that stay truthful about it", () => {
    // `append_note` and `rename_task` are the two verbs whose `eligibleFrom`
    // includes `completed` — recording a fact about finished work, and correcting
    // what it was called. Everything that would *move* the task is absent,
    // including the destructive verb.
    renderControls("completed");
    expect(screen.getByLabelText(ptBR.fields.note)).toBeTruthy();
    expect(screen.getByLabelText(ptBR.fields.title)).toBeTruthy();
    expect(screen.queryByLabelText(ptBR.fields.dueAt)).toBeNull();
    expect(screen.queryByLabelText(ptBR.fields.priority)).toBeNull();
    expect(screen.queryByLabelText(ptBR.fields.projectRef)).toBeNull();
    expect(screen.queryByRole("button", { name: ptBR.actions.cancel_task })).toBeNull();
    expect(screen.queryByRole("button", { name: ptBR.actions.clear_due })).toBeNull();
  });

  it("renders the whole section in English when the locale is English", () => {
    renderControls("todo", [settled()], { locale: "en" });
    expect(screen.getByRole("heading", { name: en.sectionTitle })).toBeTruthy();
    expect(screen.getByLabelText(en.fields.title)).toBeTruthy();
    expect(screen.getByRole("button", { name: en.actions.cancel_task })).toBeTruthy();
  });
});

describe("a control's shape follows its policy", () => {
  it("renders a title as a single line bounded by the schema's own limit", () => {
    renderControls("todo");
    const input = screen.getByLabelText(ptBR.fields.title) as HTMLInputElement;
    expect(input.tagName).toBe("INPUT");
    expect(input.maxLength).toBe(240);
  });

  it("renders a note as long-form text bounded by the schema's own limit", () => {
    renderControls("todo");
    const note = screen.getByLabelText(ptBR.fields.note) as HTMLTextAreaElement;
    expect(note.tagName).toBe("TEXTAREA");
    expect(note.maxLength).toBe(2000);
  });

  it("renders the date verbs as pickers clamped to the lexicon's window", () => {
    renderControls("todo");
    for (const label of [ptBR.fields.dueAt, ptBR.fields.plannedAt]) {
      const input = screen.getByLabelText(label) as HTMLInputElement;
      // `type="date"` emits YYYY-MM-DD, the one shape `explicit_date` resolves —
      // and it resolves it in the caller's zone, so no instant is ever sent.
      expect(input.type).toBe("date");
      expect(input.min).toBe(BOUNDS.min);
      expect(input.max).toBe(BOUNDS.max);
    }
  });

  it("renders priority as a closed choice with nothing pre-selected", () => {
    renderControls("todo");
    const select = screen.getByLabelText(ptBR.fields.priority) as HTMLSelectElement;
    expect(select.tagName).toBe("SELECT");
    expect(select.value).toBe("");
    const values = [...select.options].map((option) => option.value).filter(Boolean);
    expect(values).toEqual(["low", "medium", "high", "urgent"]);
    // Localized, never the raw column value.
    expect([...select.options].map((option) => option.text)).toContain(ptBR.choices.urgent);
  });

  it("renders relations as pickers over the caller's own entities", () => {
    renderControls("todo");
    const select = screen.getByLabelText(ptBR.fields.projectRef) as HTMLSelectElement;
    expect(select.tagName).toBe("SELECT");
    // The **name** is the value, never the id: it is resolved by
    // `resolve_owned_entity_exact` in SQL, so ownership is proven in the
    // database rather than asserted by this form, and there is no path for the
    // UI to smuggle an id it was not given.
    const values = [...select.options].map((option) => option.value).filter(Boolean);
    expect(values).toEqual(["Aurora Participações"]);
    expect(values).not.toContain("p1");
  });

  it("states an empty relation list rather than offering a select that cannot be used", () => {
    renderControls("todo", [settled()], { relations: emptyOptions });
    expect(screen.getByText(ptBR.relationEmpty.project)).toBeTruthy();
    expect(screen.queryByLabelText(ptBR.fields.projectRef)).toBeNull();
  });

  it("renders the value-less verbs as a single button with no field", () => {
    renderControls("todo");
    const form = formFor(ptBR.actions.clear_due);
    expect(form.querySelector("input[name='value']")).toBeNull();
    expect(form.querySelector("select[name='value']")).toBeNull();
  });
});

describe("what each control submits", () => {
  it("carries the task id, the locale, the title hint and the action", async () => {
    const user = userEvent.setup();
    const { submissions } = renderControls("todo");

    await user.type(screen.getByLabelText(ptBR.fields.title), "Novo título");
    await user.click(within(formForField(ptBR.fields.title)).getByRole("button"));

    await waitFor(() => expect(submissions).toHaveLength(1));
    expect(submissions[0]).toMatchObject({
      intent: "apply",
      taskId: TASK_ID,
      locale: "pt-BR",
      title: TITLE,
      action: "rename_task",
      value: "Novo título",
    });
  });

  it("mints an operation key at submit time and never renders one into markup", async () => {
    const user = userEvent.setup();
    const { submissions } = renderControls("todo");

    // A hidden input holding a client-minted uuid would not match the value the
    // server rendered, and React would report a hydration mismatch.
    expect(hidden(formFor(ptBR.actions.clear_due), "operationKey")).toBeNull();

    await user.click(screen.getByRole("button", { name: ptBR.actions.clear_due }));
    await waitFor(() => expect(submissions).toHaveLength(1));
    expect(submissions[0].operationKey).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("sends the destructive verb to the confirmation route, never to the direct one", async () => {
    const user = userEvent.setup();
    const { submissions } = renderControls("todo", [
      settled({ status: "awaiting_confirmation", pending: { action: "cancel_task", operationKey: "k", observedBefore: OBSERVED, title: TITLE } }),
    ]);

    await user.click(screen.getByRole("button", { name: ptBR.actions.cancel_task }));
    await waitFor(() => expect(submissions).toHaveLength(1));
    expect(submissions[0]).toMatchObject({ intent: "request_cancel", action: "cancel_task" });
  });

  it("rotates the key after a terminal outcome, so a second edit is a new request", async () => {
    const user = userEvent.setup();
    const { submissions } = renderControls("todo", [settled(), settled()]);

    await user.click(screen.getByRole("button", { name: ptBR.actions.clear_due }));
    await waitFor(() => expect(submissions).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: ptBR.actions.clear_due }));
    await waitFor(() => expect(submissions).toHaveLength(2));

    // Two different values submitted under one key are refused with
    // `2E_IDEMPOTENCY_MISMATCH`, which the user can neither see nor act on.
    expect(submissions[0].operationKey).not.toBe(submissions[1].operationKey);
  });
});

describe("2E-DESTRUCTIVE-003 — the dialog opens only after confirmation was issued", () => {
  const pending = settled({
    status: "awaiting_confirmation",
    heading: ptBR.confirm.pendingHeading,
    detail: ptBR.confirm.pendingDetail,
    pending: {
      action: "cancel_task",
      operationKey: "aaaaaaaa-1111-4111-8111-111111111111",
      observedBefore: OBSERVED,
      title: TITLE,
    },
  });

  it("shows no dialog before the destructive control has been used", () => {
    renderControls("todo");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the dialog on the state the server returned, naming the task", async () => {
    const user = userEvent.setup();
    renderControls("todo", [pending]);

    await user.click(screen.getByRole("button", { name: ptBR.actions.cancel_task }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(ptBR.confirm.title)).toBeTruthy();
    expect(within(dialog).getByText(TITLE)).toBeTruthy();
  });

  it("carries the issued operation key and instant back on Confirm", async () => {
    const user = userEvent.setup();
    const { submissions } = renderControls("todo", [pending, settled()]);

    await user.click(screen.getByRole("button", { name: ptBR.actions.cancel_task }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: ptBR.confirm.submit }));

    await waitFor(() => expect(submissions).toHaveLength(2));
    expect(submissions[1]).toMatchObject({
      intent: "confirm_cancel",
      action: "cancel_task",
      observedBefore: OBSERVED,
    });
    // The same key both halves, because the confirmation is stored against
    // `(user, operation key)` and the apply resolves it by the same pair.
    expect(submissions[1].operationKey).toBe(submissions[0].operationKey);
  });

  it("closes the dialog and shows the outcome once the cancellation is applied", async () => {
    const user = userEvent.setup();
    renderControls("todo", [pending, settled({ heading: "Pronto" })]);

    await user.click(screen.getByRole("button", { name: ptBR.actions.cancel_task }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: ptBR.confirm.submit }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("region", { name: ptBR.resultRegionLabel })).toBeTruthy();
  });

  it("moves focus into the dialog and returns it on Escape (2E-A11Y-002/004)", async () => {
    const user = userEvent.setup();
    renderControls("todo", [pending]);

    const opener = screen.getByRole("button", { name: ptBR.actions.cancel_task });
    await user.click(opener);
    const dialog = await screen.findByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(opener);
  });

  it("abandons the issued confirmation on dismissal, submitting nothing", async () => {
    const user = userEvent.setup();
    const { submissions } = renderControls("todo", [pending]);

    await user.click(screen.getByRole("button", { name: ptBR.actions.cancel_task }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: ptBR.confirm.cancel }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // Dismissing is not an outcome: nothing was written and nothing is claimed.
    expect(submissions).toHaveLength(1);
    expect(screen.queryByRole("region", { name: ptBR.resultRegionLabel })).toBeNull();
  });

  it("asks again as a new request after a dismissal, not against the abandoned observation", async () => {
    const user = userEvent.setup();
    const { submissions } = renderControls("todo", [pending, pending]);

    await user.click(screen.getByRole("button", { name: ptBR.actions.cancel_task }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: ptBR.confirm.cancel }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await user.click(screen.getByRole("button", { name: ptBR.actions.cancel_task }));
    await waitFor(() => expect(submissions).toHaveLength(2));
    // Re-issuing under the abandoned key would be idempotent, and therefore
    // bound to the observation the user already walked away from.
    expect(submissions[1].operationKey).not.toBe(submissions[0].operationKey);
    // And the prompt is offered again rather than staying suppressed.
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });
});

describe("what the user is told", () => {
  it("keeps one polite live region, announcing the outcome once it settles", async () => {
    const user = userEvent.setup();
    renderControls("todo", [settled({ announcement: "Pronto. A alteração foi aplicada." })]);

    const region = screen.getByRole("status");
    expect(region.getAttribute("aria-live")).toBe("polite");

    await user.click(screen.getByRole("button", { name: ptBR.actions.clear_due }));
    await waitFor(() => expect(region.textContent).toContain("A alteração foi aplicada."));
  });

  it("renders the declared reason beside the outcome, and moves focus to it", async () => {
    const user = userEvent.setup();
    renderControls("todo", [
      settled({ status: "refused", heading: "Não deu", detail: "Nada mudou.", reason: ptBR.valueRefusals.date_out_of_range }),
    ]);

    await user.click(screen.getByRole("button", { name: ptBR.actions.clear_due }));
    const result = await screen.findByRole("region", { name: ptBR.resultRegionLabel });
    expect(within(result).getByText(ptBR.valueRefusals.date_out_of_range)).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(result));
  });

  it("offers a reload only when the refusal is one reloading can resolve", async () => {
    const user = userEvent.setup();
    renderControls("todo", [settled({ status: "refused", refreshable: true })]);

    await user.click(screen.getByRole("button", { name: ptBR.actions.clear_due }));
    const reload = await screen.findByRole("button", { name: ptBR.refresh });
    await user.click(reload);
    expect(refresh).toHaveBeenCalled();
  });

  it("shows no result region while a confirmation is outstanding", async () => {
    const user = userEvent.setup();
    renderControls("todo", [
      settled({
        status: "awaiting_confirmation",
        pending: { action: "cancel_task", operationKey: "k", observedBefore: OBSERVED, title: TITLE },
      }),
    ]);

    await user.click(screen.getByRole("button", { name: ptBR.actions.cancel_task }));
    await screen.findByRole("dialog");
    // The dialog *is* the message. A second one behind it would tell the user
    // something settled when nothing has.
    expect(screen.queryByRole("region", { name: ptBR.resultRegionLabel })).toBeNull();
  });
});
