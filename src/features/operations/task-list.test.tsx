/**
 * The Work list as a Client Component — 2F-SURFACE-006, 009 and 010.
 *
 * 2F-SURFACE-010 makes accessibility part of *acceptance*, not of review: all
 * four buttons keyboard-operable, focus never dropped on an outcome, outcomes and
 * refusals announced through the existing live-region pattern, and the refresh
 * affordance keyboard-reachable and accessibly named. ADR-051 constrains those to
 * what jsdom can assert, and every one of them can be.
 *
 * The operation-key lifecycle is asserted here too, because it is only observable
 * from the component: the key is minted once per mount, scoped per (row, action),
 * carried on the FormData at submit time, **never rendered into markup**, and
 * rotated after every terminal outcome.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkItemView } from "@/features/daily-cycle/contracts";
import { TaskList, type WorkItemActionHandler } from "./task-list";
import { getWorkCopy } from "./copy";
import { idleWorkItemActionState, type WorkItemActionState } from "./work-action-state";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => refresh() }) }));

const TASK_ID = "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6";
const OTHER_TASK_ID = "8a2c1b90-1111-4111-8111-111111111111";

function workItem(overrides: Partial<WorkItemView> = {}): WorkItemView {
  return {
    taskId: TASK_ID,
    title: "Enviar proposta",
    description: null,
    dueAt: null,
    plannedAt: null,
    priority: null,
    intentionalNoDue: false,
    noDueReason: null,
    humanState: "not_started",
    origin: "user",
    availableActions: [{ id: "complete_task" }, { id: "wait_task" }],
    projects: [],
    contexts: [],
    people: [],
    waitingOnPeople: [],
    parent: null,
    dependsOn: [],
    // A manual task by default: no source entry, so no derivable classification
    // and nothing withheld. Rows that are meant to be masked say so explicitly.
    sensitivity: { kind: "undetermined" },
    ...overrides,
  } as WorkItemView;
}

function applied(partial: Partial<WorkItemActionState> = {}): WorkItemActionState {
  return {
    ...idleWorkItemActionState,
    status: "applied",
    taskId: TASK_ID,
    action: "complete_task",
    title: "Enviar proposta",
    heading: "Feito",
    detail: "A alteração foi aplicada.",
    announcement: "Feito. A alteração foi aplicada.",
    ...partial,
  };
}

function refused(): WorkItemActionState {
  return {
    ...idleWorkItemActionState,
    status: "refused",
    taskId: TASK_ID,
    action: "complete_task",
    heading: "Esta tarefa não está mais aqui",
    detail: "Atualize a lista para ver o estado atual.",
    announcement: "Esta tarefa não está mais aqui. Atualize a lista para ver o estado atual.",
    refreshable: true,
    retryable: true,
  };
}

function handler(result: WorkItemActionState = applied()) {
  const seen: FormData[] = [];
  const action = vi.fn(async (_state: WorkItemActionState, formData: FormData) => {
    seen.push(formData);
    return result;
  }) as unknown as WorkItemActionHandler;
  return { action, seen };
}

function renderList(props: Partial<Parameters<typeof TaskList>[0]> = {}, result?: WorkItemActionState) {
  const { action, seen } = handler(result);
  const view = render(
    <TaskList
      action={action}
      agentName="Brain"
      emptyHint="Nada por aqui"
      locale="pt-BR"
      tasks={[workItem()]}
      timezone="America/Sao_Paulo"
      {...props}
    />,
  );
  return { ...view, action, seen };
}

describe("2F-SURFACE-009 — availability follows taxonomy eligibility", () => {
  beforeEach(() => vi.clearAllMocks());

  it("offers reopen only on a completed row, and never alongside the active actions", () => {
    render(
      <TaskList
        action={handler().action}
        agentName="Brain"
        emptyHint="Nada"
        locale="en"
        tasks={[workItem({ humanState: "completed", availableActions: [{ id: "reopen_task" }] })]}
        timezone="UTC"
      />,
    );

    expect(screen.getByRole("button", { name: /Reopen/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Complete/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Wait/ })).not.toBeInTheDocument();
  });

  it("offers resume instead of wait once the row is waiting", () => {
    render(
      <TaskList
        action={handler().action}
        agentName="Brain"
        emptyHint="Nada"
        locale="en"
        tasks={[workItem({
          humanState: "waiting_on_someone",
          availableActions: [{ id: "complete_task" }, { id: "resume_task" }],
        })]}
        timezone="UTC"
      />,
    );

    expect(screen.getByRole("button", { name: /Resume/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Wait$/ })).not.toBeInTheDocument();
  });

  it("renders nothing for an action outside the Work vocabulary", () => {
    render(
      <TaskList
        action={handler().action}
        agentName="Brain"
        emptyHint="Nada"
        locale="en"
        tasks={[workItem({ availableActions: [{ id: "open_entry" }] as never })]}
        timezone="UTC"
      />,
    );

    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("localizes every button label in both locales", () => {
    const { rerender } = render(
      <TaskList action={handler().action} agentName="Brain" emptyHint="x" locale="pt-BR" tasks={[workItem()]} timezone="UTC" />,
    );
    expect(screen.getByRole("button", { name: /Concluir/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Aguardar/ })).toBeInTheDocument();

    rerender(
      <TaskList action={handler().action} agentName="Brain" emptyHint="x" locale="en" tasks={[workItem()]} timezone="UTC" />,
    );
    expect(screen.getByRole("button", { name: /Complete/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Wait/ })).toBeInTheDocument();
  });
});

describe("2F-SURFACE-006 — the operation key lifecycle", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is never rendered into markup", () => {
    const { container } = renderList();
    expect(container.querySelector('input[name="operationKey"]')).toBeNull();
  });

  it("is carried on the FormData at submit time", async () => {
    const user = userEvent.setup();
    const { seen } = renderList();

    await user.click(screen.getByRole("button", { name: /Concluir/ }));

    await waitFor(() => expect(seen).toHaveLength(1));
    const key = seen[0].get("operationKey");
    expect(typeof key).toBe("string");
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("carries the row's identity, action and rendered title alongside it", async () => {
    const user = userEvent.setup();
    const { seen } = renderList();

    await user.click(screen.getByRole("button", { name: /Aguardar/ }));

    await waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0].get("taskId")).toBe(TASK_ID);
    expect(seen[0].get("action")).toBe("wait_task");
    expect(seen[0].get("title")).toBe("Enviar proposta");
    expect(seen[0].get("locale")).toBe("pt-BR");
  });

  it("gives two actions on one row two different keys", async () => {
    const user = userEvent.setup();
    // Held idle so neither key rotates: this is about scoping, not rotation.
    const { seen } = renderList({}, idleWorkItemActionState);

    await user.click(screen.getByRole("button", { name: /Concluir/ }));
    await waitFor(() => expect(seen).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: /Aguardar/ }));
    await waitFor(() => expect(seen).toHaveLength(2));

    // One key under two request fingerprints is refused with
    // `2E_IDEMPOTENCY_MISMATCH` for a legitimate action.
    expect(seen[0].get("operationKey")).not.toBe(seen[1].get("operationKey"));
  });

  it("gives two rows two different keys for the same action", async () => {
    const user = userEvent.setup();
    const { action, seen } = handler(idleWorkItemActionState);
    render(
      <TaskList
        agentName="Brain"
        action={action}
        emptyHint="x"
        locale="pt-BR"
        tasks={[workItem(), workItem({ taskId: OTHER_TASK_ID, title: "Outra" })]}
        timezone="UTC"
      />,
    );

    const buttons = screen.getAllByRole("button", { name: /Concluir/ });
    await user.click(buttons[0]);
    await waitFor(() => expect(seen).toHaveLength(1));
    await user.click(buttons[1]);
    await waitFor(() => expect(seen).toHaveLength(2));

    expect(seen[0].get("operationKey")).not.toBe(seen[1].get("operationKey"));
  });

  it("reuses one key while the outcome is still idle, so a resubmit replays", async () => {
    const user = userEvent.setup();
    const { seen } = renderList({}, idleWorkItemActionState);

    const button = screen.getByRole("button", { name: /Concluir/ });
    await user.click(button);
    await waitFor(() => expect(seen).toHaveLength(1));
    await user.click(button);
    await waitFor(() => expect(seen).toHaveLength(2));

    expect(seen[1].get("operationKey")).toBe(seen[0].get("operationKey"));
  });

  it("rotates after an applied outcome", async () => {
    const user = userEvent.setup();
    const { seen } = renderList();

    const button = screen.getByRole("button", { name: /Concluir/ });
    await user.click(button);
    await waitFor(() => expect(seen).toHaveLength(1));
    await user.click(button);
    await waitFor(() => expect(seen).toHaveLength(2));

    expect(seen[1].get("operationKey")).not.toBe(seen[0].get("operationKey"));
  });

  it("rotates after a refusal too, which the QuickCapture pattern does not", async () => {
    const user = userEvent.setup();
    const { seen } = renderList({}, refused());

    const button = screen.getByRole("button", { name: /Concluir/ });
    await user.click(button);
    await waitFor(() => expect(seen).toHaveLength(1));
    await user.click(button);
    await waitFor(() => expect(seen).toHaveLength(2));

    // Safe because a refused apply raises inside `apply_task_command`, aborting
    // the transaction and rolling back the key reservation.
    expect(seen[1].get("operationKey")).not.toBe(seen[0].get("operationKey"));
  });
});

describe("2F-SURFACE-010 — keyboard, focus and announcements", () => {
  beforeEach(() => vi.clearAllMocks());

  it("submits every action from the keyboard with Enter", async () => {
    const user = userEvent.setup();
    const { seen } = renderList();

    await user.tab();
    expect(screen.getByRole("button", { name: /Concluir/ })).toHaveFocus();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0].get("action")).toBe("complete_task");
  });

  it("submits from the keyboard with Space as well", async () => {
    const user = userEvent.setup();
    const { seen } = renderList();

    await user.tab();
    await user.tab();
    expect(screen.getByRole("button", { name: /Aguardar/ })).toHaveFocus();
    await user.keyboard(" ");

    await waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0].get("action")).toBe("wait_task");
  });

  it("moves focus to the named result region rather than dropping it", async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByRole("button", { name: /Concluir/ }));

    const region = await screen.findByRole("region", { name: "Resultado da ação" });
    await waitFor(() => expect(region).toHaveFocus());
    expect(document.activeElement).not.toBe(document.body);
  });

  it("keeps focus on the page after a refusal too", async () => {
    const user = userEvent.setup();
    renderList({}, refused());

    await user.click(screen.getByRole("button", { name: /Concluir/ }));

    const region = await screen.findByRole("region", { name: "Resultado da ação" });
    await waitFor(() => expect(region).toHaveFocus());
  });

  it("announces the outcome through one polite live region", async () => {
    const user = userEvent.setup();
    renderList();

    const live = screen.getByRole("status");
    expect(live).toHaveAttribute("aria-live", "polite");
    expect(live).toHaveAttribute("aria-atomic", "true");

    await user.click(screen.getByRole("button", { name: /Concluir/ }));

    await waitFor(() => expect(live).toHaveTextContent("Feito. A alteração foi aplicada."));
  });

  it("announces a refusal in the same region", async () => {
    const user = userEvent.setup();
    renderList({}, refused());

    await user.click(screen.getByRole("button", { name: /Concluir/ }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Esta tarefa não está mais aqui"),
    );
  });

  it("renders the outcome heading, detail and the current title", async () => {
    const user = userEvent.setup();
    renderList({}, applied({ title: "Título atual" }));

    await user.click(screen.getByRole("button", { name: /Concluir/ }));

    const region = await screen.findByRole("region", { name: "Resultado da ação" });
    expect(within(region).getByText("Feito")).toBeInTheDocument();
    expect(within(region).getByText("Título atual")).toBeInTheDocument();
  });

  it("offers a keyboard-reachable, accessibly named refresh affordance on a refusal", async () => {
    const user = userEvent.setup();
    renderList({}, refused());

    await user.click(screen.getByRole("button", { name: /Concluir/ }));

    const refreshButton = await screen.findByRole("button", { name: "Atualizar lista" });
    refreshButton.focus();
    expect(refreshButton).toHaveFocus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("offers no refresh affordance on a successful apply", async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByRole("button", { name: /Concluir/ }));

    await screen.findByRole("region", { name: "Resultado da ação" });
    expect(screen.queryByRole("button", { name: "Atualizar lista" })).not.toBeInTheDocument();
  });

  it("names the refresh affordance in English too", async () => {
    const user = userEvent.setup();
    const { action } = handler(refused());
    render(
      <TaskList action={action} agentName="Brain" emptyHint="x" locale="en" tasks={[workItem()]} timezone="UTC" />,
    );

    await user.click(screen.getByRole("button", { name: /Complete/ }));

    expect(await screen.findByRole("button", { name: "Refresh list" })).toBeInTheDocument();
  });

  it("scopes the outcome to the row that produced it", async () => {
    const user = userEvent.setup();
    const { action } = handler();
    render(
      <TaskList
        agentName="Brain"
        action={action}
        emptyHint="x"
        locale="pt-BR"
        tasks={[workItem(), workItem({ taskId: OTHER_TASK_ID, title: "Outra" })]}
        timezone="UTC"
      />,
    );

    await user.click(screen.getAllByRole("button", { name: /Concluir/ })[0]);

    await waitFor(() =>
      expect(screen.getAllByRole("region", { name: "Resultado da ação" })).toHaveLength(1),
    );
  });
});

/* -------------------------------------------------------------------------- *
 * `2L-PRIVACY-001`, `-003`, `-004`, `-008` — the derived classification, on the
 * list.
 * -------------------------------------------------------------------------- */

describe("TaskList: withheld content (OD-2L-1 option B)", () => {
  const secret = { kind: "derived", level: "highly_sensitive" } as const;

  function renderTasks(tasks: WorkItemView[], locale: "pt-BR" | "en" = "en") {
    const { action } = handler();
    return render(
      <TaskList action={action} agentName="Brain" emptyHint="x" locale={locale} tasks={tasks} timezone="UTC" />,
    );
  }

  it("withholds the title and the description of a task whose source is protected", () => {
    renderTasks([workItem({ title: "Contrato Aurora", description: "Cláusula 7", sensitivity: secret })]);

    expect(screen.queryByText("Contrato Aurora")).toBeNull();
    expect(screen.queryByText("Cláusula 7")).toBeNull();
    expect(screen.getByText(getWorkCopy("en").protected.label)).toBeVisible();
  });

  it("shows an ordinary and a manual task in the clear", () => {
    renderTasks([
      workItem({ title: "Ordinary", sensitivity: { kind: "derived", level: "normal" } }),
      workItem({ taskId: OTHER_TASK_ID, title: "Manual", sensitivity: { kind: "undetermined" } }),
    ]);

    expect(screen.getByText("Ordinary")).toBeVisible();
    expect(screen.getByText("Manual")).toBeVisible();
    expect(screen.queryByText(getWorkCopy("en").protected.label)).toBeNull();
  });

  it("keeps the masked row in the list, with its state, its dates and its actions", () => {
    // `2L-PRIVACY-003`/`-008`. The row survives so the count stays truthful, and
    // the task stays operable without revealing what it says.
    renderTasks([workItem({ title: "Contrato Aurora", sensitivity: secret })]);

    expect(screen.getByRole("button", { name: /Complete/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /Wait/ })).toBeVisible();
    expect(screen.getByText("Not started")).toBeVisible();
  });

  it("reveals one masked row without revealing another", async () => {
    const user = userEvent.setup();
    renderTasks([
      workItem({ title: "First secret", sensitivity: secret }),
      workItem({ taskId: OTHER_TASK_ID, title: "Second secret", sensitivity: secret }),
    ]);

    await user.click(screen.getAllByRole("button", { name: getWorkCopy("en").protected.reveal })[0]);

    expect(screen.getByText("First secret")).toBeVisible();
    expect(screen.queryByText("Second secret")).toBeNull();
  });

  it("keeps a masked row openable", () => {
    renderTasks([
      workItem({
        title: "Contrato Aurora",
        sensitivity: secret,
        availableActions: [{ id: "open_task", href: "/en/app/work/task-1" }],
      }),
    ]);

    expect(screen.getByRole("link", { name: getWorkCopy("en").protected.label }))
      .toHaveAttribute("href", "/en/app/work/task-1");
  });

  it("states the partial coverage rather than implying every task is protected", () => {
    // `2L-PRIVACY-004`. Option B covers tasks that came from a note and nothing
    // else, and a surface that said nothing would let a user assume otherwise.
    renderTasks([workItem({ title: "Contrato Aurora", sensitivity: secret })]);

    expect(screen.getByText(getWorkCopy("en").protected.partialCoverage)).toBeInTheDocument();
  });

  it("does not decide anything itself: the rule comes from the shared component", () => {
    // `2L-PRIVACY-007`, structurally. The list may not test a level of its own;
    // `sensitivity-boundary.test.ts` proves the negative repository-wide and
    // this pins the positive for this file.
    const source = readFileSync(join(__dirname, "task-list.tsx"), "utf8");
    expect(source).toMatch(/ProtectedContent/);
    expect(source).not.toMatch(/highly_sensitive|presentationFor|resolveContent/);
  });
});
