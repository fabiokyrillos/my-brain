import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { TaskCommandConsoleState } from "./console-state";
import { CommandConsole, TaskCommandResult, idleConsoleState } from "./command-console";
import { ConfirmDialog } from "./confirm-dialog";
import type { TaskCommandPreview } from "./preview";
import type { TaskDisambiguationView } from "./disambiguation";

/**
 * Slice 2E.7's accessibility gates.
 *
 * These exist in this shape because of a verified fact rather than a
 * preference: **jsdom 29.1.1 has no `showModal`, `show` or `close` on
 * `HTMLDialogElement.prototype`.** A native `<dialog>` would therefore make
 * 2E-A11Y-004 unassertable in the only accessibility gate CI runs, so the
 * dialog is hand-rolled and every behaviour `showModal()` would have supplied
 * is proven here instead.
 */

const TASK_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_TASK_ID = "44444444-4444-4444-8444-444444444444";

function preview(overrides: Partial<TaskCommandPreview> = {}): TaskCommandPreview {
  return {
    willMutate: false,
    disposition: "previewed",
    refusal: null,
    action: "complete_task",
    task: { taskId: TASK_ID, title: "Send the report", status: "todo" },
    deltas: [
      {
        field: "status",
        label: "Status",
        before: { kind: "text", text: "Not started" },
        after: { kind: "text", text: "Completed" },
        changed: true,
      },
    ],
    effects: [{ kind: "reminders_cancelled", text: "This task's scheduled reminders will be cancelled." }],
    canonicalPatch: {} as TaskCommandPreview["canonicalPatch"],
    reversible: true,
    undoWindowHours: 24,
    destructive: false,
    requiresConfirmation: false,
    oneStep: true,
    observedBefore: "2026-07-28T12:00:00.000Z",
    policyVersion: "2026-07-25.2",
    matchPolicyVersion: "2026-07-25.3",
    copy: {
      title: "Preview",
      description: "This is what would happen. Nothing has been applied yet.",
      notice: "Nothing has been applied yet. This is only a preview.",
      reversibility: "This can be undone.",
      undoWindow: "You can undo this for 24 hours.",
      gravity: null,
    },
    ...overrides,
  };
}

function state(overrides: Partial<TaskCommandConsoleState> = {}): TaskCommandConsoleState {
  return {
    ...idleConsoleState,
    status: "resolved",
    heading: "Preview",
    detail: "This is what would happen.",
    announcement: "Preview. This is what would happen.",
    session: JSON.stringify({ version: "x" }),
    preview: preview(),
    control: "apply",
    ...overrides,
  };
}

function disambiguation(kind: TaskDisambiguationView["kind"]): TaskDisambiguationView {
  const candidate = (taskId: string, title: string) => ({
    taskId,
    title,
    status: "todo",
    dueAt: null,
    plannedAt: null,
    projectNames: [],
    contextNames: [],
    score: 0.7,
    evidence: [
      { signal: "normalized_exact_title" as const, text: "The title matches what you said", distinguishing: false },
    ],
  });
  return {
    kind,
    candidates:
      kind === "confirm_one"
        ? [candidate(TASK_ID, "Send the invoice")]
        : [candidate(TASK_ID, "Send the invoice"), candidate(OTHER_TASK_ID, "Send the invoice to Acme")],
    overflowed: false,
    copy: { title: "Which one did you mean?", description: "I found more than one." },
  };
}

function renderResult(value: TaskCommandConsoleState, pending = false) {
  const formAction = vi.fn();
  const utils = render(
    <TaskCommandResult
      formAction={formAction}
      locale="en"
      origin="chat"
      pending={pending}
      state={value}
    />,
  );
  return { ...utils, formAction };
}

describe("2E-A11Y-003 — outcome changes are announced", () => {
  it("puts the outcome in a polite live region", () => {
    renderResult(state());
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveAttribute("aria-atomic", "true");
    expect(region).toHaveTextContent("Preview. This is what would happen.");
  });

  it("announces that a model call is in flight, and marks the region busy", () => {
    renderResult(state(), true);
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(region).toHaveTextContent("Reading your command.");
  });
});

describe("2E-A11Y-002 — focus is never lost", () => {
  it("moves focus to the result region after a round resolves", async () => {
    renderResult(state());
    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Command result" })).toHaveFocus();
    });
  });
});

describe("2E-A11Y-004 — the destructive confirmation dialog", () => {
  function destructive() {
    return state({
      control: "confirm",
      heading: "Confirm before applying",
      preview: preview({
        disposition: "matched_requires_confirmation",
        action: "cancel_task",
        destructive: true,
        requiresConfirmation: true,
        oneStep: false,
        copy: {
          ...preview().copy,
          title: "Confirm before applying",
          gravity: "This action is destructive.",
        },
      }),
    });
  }

  it("exposes a dialog role with an accessible name and description", async () => {
    const user = userEvent.setup();
    renderResult(destructive());
    await user.click(screen.getByRole("button", { name: "Yes, cancel this task" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Confirm this cancellation");
    expect(dialog).toHaveAccessibleDescription("This action is destructive.");
  });

  it("moves focus into the dialog when it opens", async () => {
    const user = userEvent.setup();
    renderResult(destructive());
    await user.click(screen.getByRole("button", { name: "Yes, cancel this task" }));

    const dialog = screen.getByRole("dialog");
    await waitFor(() => {
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    });
  });

  it("closes on Escape and returns focus to the control that opened it", async () => {
    const user = userEvent.setup();
    renderResult(destructive());
    const opener = screen.getByRole("button", { name: "Yes, cancel this task" });
    await user.click(opener);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("keeps Tab inside the dialog, which is what showModal would have done", async () => {
    const user = userEvent.setup();
    renderResult(destructive());
    await user.click(screen.getByRole("button", { name: "Yes, cancel this task" }));

    const dialog = screen.getByRole("dialog");
    const controls = within(dialog).getAllByRole("button");
    expect(controls.length).toBeGreaterThan(1);

    // Tab from the last control cycles to the first rather than escaping to the
    // page behind, which nothing here can inert because nothing called
    // `showModal()`.
    controls[controls.length - 1].focus();
    await user.tab();
    expect(controls[0]).toHaveFocus();

    controls[0].focus();
    await user.tab({ shift: true });
    expect(controls[controls.length - 1]).toHaveFocus();
  });

  it("is closed by default, so a destructive dialog never opens itself", () => {
    renderResult(destructive());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("2E-MATCH-012 — an unsure single match is not a list of one", () => {
  it("renders confirm-this-one without a radiogroup", () => {
    renderResult(state({ control: "choose", preview: null, disambiguation: disambiguation("confirm_one") }));
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use this one" })).toBeInTheDocument();
  });

  it("renders competing candidates as a radiogroup with an explicit submit", async () => {
    const user = userEvent.setup();
    const { formAction } = renderResult(
      state({ control: "choose", preview: null, disambiguation: disambiguation("list") }),
    );

    const group = screen.getByRole("radiogroup");
    const radios = within(group).getAllByRole("radio");
    expect(radios).toHaveLength(2);

    // Browsing with the keyboard must not fire a round trip per keypress.
    radios[0].focus();
    await user.keyboard("{ArrowDown}");
    expect(formAction).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Use this one" })).toBeInTheDocument();
  });
});

describe("the presentation table", () => {
  it("titles a ready preview from the disposition, which has no outcome row", () => {
    // `previewed` is a `TASK_COMMAND_PREVIEW_DISPOSITIONS` member deliberately
    // excluded from `TASK_COMMAND_OUTCOMES`, so it has no `copy.outcomes` key
    // and must be titled from `copy.dispositions` — which is what
    // `preview.copy` already carries.
    renderResult(state());
    expect(screen.getByRole("heading", { name: "Preview" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument();
  });

  it("discloses the linked effects, the reversibility and the window", () => {
    renderResult(state());
    expect(screen.getByText("This task's scheduled reminders will be cancelled.")).toBeInTheDocument();
    expect(screen.getByText("This can be undone.")).toBeInTheDocument();
    expect(screen.getByText("You can undo this for 24 hours.")).toBeInTheDocument();
  });

  it("offers no Apply control for a no-change preview", () => {
    renderResult(
      state({
        control: "none",
        terminal: true,
        preview: preview({ disposition: "no_change", oneStep: false }),
      }),
    );
    expect(screen.queryByRole("button", { name: "Apply" })).not.toBeInTheDocument();
  });

  it("renders the undo affordance only when the outcome carries one", () => {
    renderResult(state({ control: "none", preview: null, undo: { undoId: TASK_ID, label: "Undo" } }));
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();

    renderResult(state({ control: "none", preview: null, undo: null }));
    expect(screen.getAllByRole("button", { name: "Undo" })).toHaveLength(1);
  });
});

describe("the console shell", () => {
  it("labels its input and keeps the surface keyboard reachable", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async () => idleConsoleState);
    render(<CommandConsole action={action} locale="en" origin="work" />);

    const input = screen.getByLabelText("What changed?");
    await user.click(input);
    await user.keyboard("mark the report as done");
    expect(input).toHaveValue("mark the report as done");
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });

  it("renders identically whichever surface it is mounted on", () => {
    const action = vi.fn(async () => idleConsoleState);
    const chat = render(<CommandConsole action={action} locale="en" origin="chat" />);
    const chatHtml = chat.container.innerHTML.replaceAll('value="chat"', 'value="ORIGIN"');
    chat.unmount();

    const work = render(<CommandConsole action={action} locale="en" origin="work" />);
    const workHtml = work.container.innerHTML.replaceAll('value="work"', 'value="ORIGIN"');

    // Epic 2E-G: "the command surface behaves identically in Chat and the task
    // surfaces". The origin is a telemetry category, not a behaviour switch.
    expect(chatHtml).toBe(workHtml);
  });

  it("renders Portuguese copy without a locale ternary in the component", () => {
    const action = vi.fn(async () => idleConsoleState);
    render(<CommandConsole action={action} locale="pt-BR" origin="chat" />);
    expect(screen.getByText("Mude uma tarefa com suas palavras")).toBeInTheDocument();
    expect(screen.getByLabelText("O que mudou?")).toBeInTheDocument();
  });
});

describe("the dialog in isolation", () => {
  it("renders nothing when closed", () => {
    render(
      <ConfirmDialog
        cancelLabel="Keep the task"
        description="d"
        discard={null}
        onClose={vi.fn()}
        open={false}
        title="t"
      >
        <button type="button">Confirm</button>
      </ConfirmDialog>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes through its own cancel control", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <ConfirmDialog
        cancelLabel="Keep the task"
        description="d"
        discard={null}
        onClose={onClose}
        open
        title="t"
      >
        <button type="button">Confirm</button>
      </ConfirmDialog>,
    );
    await user.click(screen.getByRole("button", { name: "Keep the task" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
