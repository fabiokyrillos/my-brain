import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkItemView } from "@/features/daily-cycle/contracts";
import { idleBulkCommandState, type BulkCommandState } from "./bulk-command-state";
import { summariseBulk } from "./bulk-result";
import { getWorkCopy } from "./copy";
import { TaskList, type WorkItemActionHandler } from "./task-list";
import type { WorkItemActionState } from "./work-action-state";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

/**
 * `2L-BULK-001…003`, `-005`, `-009`, `-012`, and `2L-PRIVACY-008` — selection,
 * preview and result, as the user meets them.
 *
 * The rules themselves are proved in the pure modules; what only this level can
 * prove is that the surface obeys them: that selection is an explicit act per
 * item, that the preview is on screen at the moment Apply is reachable, that a
 * refusal at the ceiling is *stated* rather than silently truncating, and that a
 * protected task can be selected and operated on without being revealed.
 */

const COPY = getWorkCopy("en");

function workItem(overrides: Partial<WorkItemView> = {}): WorkItemView {
  return {
    taskId: "task-1",
    title: "Enviar proposta",
    intentionalNoDue: false,
    humanState: "not_started",
    origin: "user",
    availableActions: [],
    projects: [],
    contexts: [],
    people: [],
    waitingOnPeople: [],
    sensitivity: { kind: "undetermined" },
    ...overrides,
  } as WorkItemView;
}

const noopAction = (async (state: WorkItemActionState) => state) as unknown as WorkItemActionHandler;

function renderList(options: {
  tasks: WorkItemView[];
  statuses?: Record<string, string>;
  bulkResult?: BulkCommandState;
} ) {
  const seen: FormData[] = [];
  const bulkAction = vi.fn(async (_state: BulkCommandState, formData: FormData) => {
    seen.push(formData);
    return options.bulkResult ?? idleBulkCommandState;
  });
  const statusByTaskId = options.statuses
    ?? Object.fromEntries(options.tasks.map((task) => [task.taskId, "todo"]));

  const view = render(
    <TaskList
      action={noopAction}
      agentName="Brain"
      bulk={{
        action: bulkAction,
        undoAction: async () => ({ status: "undone", message: "Undone.", announcement: "Undone." }),
        statusByTaskId,
        relationOptions: { project: [], context: [], person: [] },
        dateBounds: { min: "2024-08-09", max: "2028-08-09" },
      }}
      emptyHint="x"
      locale="en"
      tasks={options.tasks}
      timezone="UTC"
    />,
  );
  return { ...view, bulkAction, seen };
}

describe("selection is an explicit act on each item", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders one checkbox per row, named by the item it selects", () => {
    // `2L-ACCESS-003`: controls that differ only by row must be distinguishable.
    renderList({
      tasks: [workItem(), workItem({ taskId: "task-2", title: "Ligar para a Marina" })],
    });

    expect(screen.getByRole("checkbox", { name: COPY.bulk.selectRow("Enviar proposta") })).toBeVisible();
    expect(screen.getByRole("checkbox", { name: COPY.bulk.selectRow("Ligar para a Marina") })).toBeVisible();
  });

  it("shows nothing until something is selected", () => {
    renderList({ tasks: [workItem()] });
    expect(screen.queryByRole("region", { name: COPY.bulk.resultRegionLabel })).toBeNull();
    expect(screen.queryByRole("button", { name: COPY.bulk.apply })).toBeNull();
  });

  it("counts what is selected and can be dismissed without applying", async () => {
    const user = userEvent.setup();
    const { bulkAction } = renderList({ tasks: [workItem(), workItem({ taskId: "task-2" })] });

    await user.click(screen.getAllByRole("checkbox")[0]);
    expect(screen.getByText(COPY.bulk.selected(1))).toBeVisible();

    await user.click(screen.getByRole("button", { name: COPY.bulk.clear }));
    expect(screen.queryByText(COPY.bulk.selected(1))).toBeNull();
    expect(bulkAction).not.toHaveBeenCalled();
  });

  it("selects only the rows on this page", async () => {
    const user = userEvent.setup();
    renderList({ tasks: [workItem(), workItem({ taskId: "task-2" })] });

    await user.click(screen.getByRole("button", { name: COPY.bulk.selectAllShown }));

    expect(screen.getByText(COPY.bulk.selected(2))).toBeVisible();
  });

  it("states the bound before it is reached", async () => {
    const user = userEvent.setup();
    renderList({ tasks: [workItem()] });

    await user.click(screen.getAllByRole("checkbox")[0]);

    expect(screen.getByText(COPY.bulk.ceilingHint(50))).toBeVisible();
  });
});

describe("2L-BULK-005: the preview is on screen when Apply is", () => {
  beforeEach(() => vi.clearAllMocks());

  it("states what would change and what would not", async () => {
    const user = userEvent.setup();
    renderList({
      tasks: [workItem(), workItem({ taskId: "task-2" })],
      statuses: { "task-1": "todo", "task-2": "completed" },
    });

    await user.click(screen.getByRole("button", { name: COPY.bulk.selectAllShown }));
    await user.selectOptions(screen.getByLabelText(COPY.bulk.chooseOperation), "set_priority");

    // `set_priority` is eligible from active statuses only, so the completed row
    // is refused — and the preview says so before anything is applied.
    expect(screen.getByText(COPY.bulk.previewCounts(1, 1))).toBeVisible();
    expect(screen.getByText(COPY.bulk.reasons.ineligible_status)).toBeVisible();
  });

  it("says so, and disables Apply, when nothing would change", async () => {
    const user = userEvent.setup();
    renderList({ tasks: [workItem()], statuses: { "task-1": "completed" } });

    await user.click(screen.getAllByRole("checkbox")[0]);
    await user.selectOptions(screen.getByLabelText(COPY.bulk.chooseOperation), "set_priority");

    expect(screen.getByText(COPY.bulk.previewNothing)).toBeVisible();
    expect(screen.getByRole("button", { name: COPY.bulk.apply })).toBeDisabled();
  });

  it("keeps Apply disabled until a value is chosen", async () => {
    const user = userEvent.setup();
    renderList({ tasks: [workItem()] });

    await user.click(screen.getAllByRole("checkbox")[0]);
    await user.selectOptions(screen.getByLabelText(COPY.bulk.chooseOperation), "set_priority");
    expect(screen.getByRole("button", { name: COPY.bulk.apply })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText(COPY.bulk.chooseValue), "high");
    expect(screen.getByRole("button", { name: COPY.bulk.apply })).toBeEnabled();
  });

  it("offers only the derived bulk-eligible operations", async () => {
    const user = userEvent.setup();
    renderList({ tasks: [workItem()] });
    await user.click(screen.getAllByRole("checkbox")[0]);

    const chooser = screen.getByLabelText(COPY.bulk.chooseOperation) as HTMLSelectElement;
    const values = [...chooser.options].map((option) => option.value);
    expect(values).not.toContain("cancel_task");
    expect(values).not.toContain("rename_task");
    expect(values).toContain("set_priority");
  });

  it("submits only the eligible subset, one key per item", async () => {
    const user = userEvent.setup();
    const { seen } = renderList({
      tasks: [workItem(), workItem({ taskId: "task-2" })],
      statuses: { "task-1": "todo", "task-2": "completed" },
    });

    await user.click(screen.getByRole("button", { name: COPY.bulk.selectAllShown }));
    await user.selectOptions(screen.getByLabelText(COPY.bulk.chooseOperation), "set_priority");
    await user.selectOptions(screen.getByLabelText(COPY.bulk.chooseValue), "high");
    await user.click(screen.getByRole("button", { name: COPY.bulk.apply }));

    await waitFor(() => expect(seen).toHaveLength(1));
    const items = JSON.parse(String(seen[0].get("items"))) as { taskId: string; operationKey: string }[];
    expect(items.map((item) => item.taskId)).toEqual(["task-1"]);
    expect(items[0].operationKey).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("2L-BULK-009/012: the result tells the truth", () => {
  beforeEach(() => vi.clearAllMocks());

  const partial: BulkCommandState = {
    status: "settled",
    action: "set_priority",
    message: COPY.bulk.partial(1, 1),
    announcement: COPY.bulk.partial(1, 1),
    summary: summariseBulk([
      { taskId: "task-1", outcome: "applied", undo: { undoId: "9f1c2f2e-1111-4111-8111-111111111111", expiresAt: "2099-01-01T00:00:00.000Z" } },
      { taskId: "task-2", outcome: "refused", reason: "ineligible" },
    ]),
  };

  async function runBulk() {
    const user = userEvent.setup();
    const view = renderList({ tasks: [workItem(), workItem({ taskId: "task-2" })], bulkResult: partial });
    await user.click(screen.getByRole("button", { name: COPY.bulk.selectAllShown }));
    await user.selectOptions(screen.getByLabelText(COPY.bulk.chooseOperation), "set_priority");
    await user.selectOptions(screen.getByLabelText(COPY.bulk.chooseValue), "high");
    await user.click(screen.getByRole("button", { name: COPY.bulk.apply }));
    return view;
  }

  it("names counts on both sides", async () => {
    await runBulk();
    const region = await screen.findByRole("region", { name: COPY.bulk.resultRegionLabel });
    expect(within(region).getByText(COPY.bulk.partial(1, 1))).toBeVisible();
  });

  it("says why each item did not apply", async () => {
    await runBulk();
    const region = await screen.findByRole("region", { name: COPY.bulk.resultRegionLabel });
    expect(within(region).getByText(COPY.bulk.itemReasons.ineligible)).toBeVisible();
  });

  it("offers undo for the applied item only", async () => {
    await runBulk();
    const region = await screen.findByRole("region", { name: COPY.bulk.resultRegionLabel });
    expect(within(region).getAllByRole("button", { name: COPY.undo.label })).toHaveLength(1);
  });

  it("announces once, in a polite live region", async () => {
    const { container } = await runBulk();
    await waitFor(() => {
      const live = container.querySelector('.work-bulk-bar [role="status"]');
      expect(live).toHaveAttribute("aria-live", "polite");
      expect(live).toHaveTextContent(COPY.bulk.partial(1, 1));
    });
  });
});

describe("2L-PRIVACY-008: a masked item is selectable without being revealed", () => {
  beforeEach(() => vi.clearAllMocks());

  it("names the checkbox by the protected stub rather than by the withheld title", async () => {
    const user = userEvent.setup();
    renderList({
      tasks: [workItem({
        title: "Contrato Aurora",
        sensitivity: { kind: "derived", level: "highly_sensitive" },
      })],
    });

    const checkbox = screen.getByRole("checkbox", {
      name: COPY.bulk.selectRow(COPY.protected.label),
    });
    await user.click(checkbox);

    expect(screen.getByText(COPY.bulk.selected(1))).toBeVisible();
    expect(screen.queryByText("Contrato Aurora")).toBeNull();
  });
});
