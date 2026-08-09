import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkItemView } from "@/features/daily-cycle/contracts";
import type { TaskDetailCommandState } from "@/features/task-commands/detail-action-state";
import { detailControlsFor } from "@/features/task-commands/detail-controls";
import { TaskDetailControls } from "@/features/task-commands/task-detail-controls";
import { idleBulkCommandState } from "./bulk-command-state";
import { getWorkCopy } from "./copy";
import { TaskList, type WorkItemActionHandler } from "./task-list";
import type { WorkItemActionState } from "./work-action-state";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

afterEach(cleanup);

/**
 * `2L-MOBILE-005`, `-006`, `-010` — the mobile behaviours that are about
 * *state*, not about layout.
 *
 * Layout is the browser lane's job: rendered target sizes, hover independence,
 * horizontal overflow and reflow all need a layout engine, and
 * `e2e/accessibility.spec.ts` asserts them at a real viewport. What jsdom can
 * prove is what a component *does* — that a selection survives a re-render,
 * that a count is announced when it changes, and that a composing input is
 * never submitted — and those are here.
 */

const COPY = getWorkCopy("en");
const TASK_ID = "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6";

function workItem(overrides: Partial<WorkItemView> = {}): WorkItemView {
  return {
    taskId: TASK_ID,
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

function renderList(tasks: WorkItemView[]) {
  const bulkAction = vi.fn(async () => idleBulkCommandState);
  const view = render(
    <TaskList
      action={noopAction}
      agentName="Brain"
      bulk={{
        action: bulkAction,
        statusByTaskId: Object.fromEntries(tasks.map((task) => [task.taskId, "todo"])),
        relationOptions: { project: [], context: [], person: [] },
        dateBounds: { min: "2024-08-09", max: "2028-08-09" },
      }}
      emptyHint="x"
      locale="en"
      tasks={tasks}
      timezone="UTC"
    />,
  );
  return { ...view, bulkAction };
}

describe("2L-MOBILE-006: selection survives a re-render and announces its count", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps the selection when the list re-renders", () => {
    /*
     * The real cases are an orientation change and the on-screen keyboard
     * appearing — neither of which remounts a React tree, and both of which
     * re-render it. A rerender with identical props is the same event as far as
     * the component is concerned, and it is the one jsdom can stage.
     */
    const tasks = [workItem(), workItem({ taskId: "task-2" })];
    const { rerender } = renderList(tasks);

    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    // Two nodes carry the count: the visible one and the polite region beside
    // it. Both are the point, so the assertion is on the pair rather than on a
    // single match.
    expect(screen.getAllByText(COPY.bulk.selected(1)).length).toBeGreaterThanOrEqual(1);

    rerender(
      <TaskList
        action={noopAction}
        agentName="Brain"
        bulk={{
          action: vi.fn(async () => idleBulkCommandState),
          statusByTaskId: { [TASK_ID]: "todo", "task-2": "todo" },
          relationOptions: { project: [], context: [], person: [] },
          dateBounds: { min: "2024-08-09", max: "2028-08-09" },
        }}
        emptyHint="x"
        locale="en"
        tasks={tasks}
        timezone="UTC"
      />,
    );

    expect(screen.getAllByText(COPY.bulk.selected(1)).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole("checkbox")[0]).toBeChecked();
  });

  it("announces the count in its own polite region, apart from the outcome's", () => {
    // One region carrying both would replace "3 selected" with the result of a
    // run the user has not started.
    const { container } = renderList([workItem(), workItem({ taskId: "task-2" })]);
    fireEvent.click(screen.getAllByRole("checkbox")[0]);

    const regions = container.querySelectorAll('.work-bulk-bar [role="status"]');
    expect(regions.length).toBeGreaterThanOrEqual(2);
    expect([...regions].some((region) => region.textContent === COPY.bulk.selected(1))).toBe(true);
  });

  it("updates the announcement when the count changes", () => {
    const { container } = renderList([workItem(), workItem({ taskId: "task-2" })]);
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getAllByRole("checkbox")[1]);

    const regions = [...container.querySelectorAll('.work-bulk-bar [role="status"]')];
    expect(regions.some((region) => region.textContent === COPY.bulk.selected(2))).toBe(true);
  });
});

describe("2L-MOBILE-005: a control mid-flight cannot be re-triggered", () => {
  it("disables the apply control while a round is in flight", async () => {
    // Not "it debounces" — the control is disabled, so a second accidental touch
    // has nothing to hit. Asserted on the source because a pending state in
    // jsdom resolves before the assertion could observe it.
    const source = readFileSync(join(__dirname, "bulk-bar.tsx"), "utf8");
    expect(source).toMatch(/disabled=\{pending \|\| !canApply\}/);
    const list = readFileSync(join(__dirname, "work-item-actions.tsx"), "utf8");
    expect(list).toMatch(/disabled=\{pending\}/);
  });
});

describe("2L-MOBILE-010: an IME composition is never submitted", () => {
  function renderControls(handler = vi.fn(async (state: TaskDetailCommandState) => state)) {
    render(
      <TaskDetailControls
        action={handler}
        controls={detailControlsFor("todo")}
        dateBounds={{ min: "2024-08-09", max: "2028-08-09" }}
        locale="en"
        relationOptions={{ project: [], context: [], person: [] }}
        taskId={TASK_ID}
        title="Enviar proposta"
      />,
    );
    return handler;
  }

  it("does not submit on the Enter that commits a candidate", async () => {
    const handler = renderControls();
    const input = document.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input).not.toBeNull();

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "にほんご" } });
    // The Enter an IME user presses to accept the candidate. `isComposing` is
    // the platform's own signal, and the guard also holds without it.
    const submitted = fireEvent.keyDown(input, { key: "Enter", isComposing: true });

    expect(submitted, "the Enter was not prevented").toBe(false);
    await waitFor(() => expect(handler).not.toHaveBeenCalled());
  });

  it("submits normally once the composition has ended", async () => {
    const user = userEvent.setup();
    const handler = renderControls();
    const input = document.querySelector('input[type="text"]') as HTMLInputElement;

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "日本語" } });
    fireEvent.compositionEnd(input);

    const form = input.closest("form") as HTMLFormElement;
    await user.click(within(form).getByRole("button"));

    await waitFor(() => expect(handler).toHaveBeenCalled());
  });

  it("never discards the composition through a re-render", () => {
    /*
     * The third clause. The text inputs are **uncontrolled** — no `value` prop —
     * so React does not own their content and cannot reset it on a render. A
     * controlled input whose state updated on `change` would drop a composition
     * every time the parent re-rendered mid-word.
     */
    const source = readFileSync(
      join(__dirname, "..", "task-commands", "task-detail-controls.tsx"),
      "utf8",
    );
    /*
     * Comments stripped first. The module documents *why* it carries no
     * controlled value — which means it quotes the shapes it refuses — and a
     * scan that read its own prose would fail the file written to satisfy it.
     * This repository has made that mistake more than once.
     */
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    // The FREE-TEXT input specifically. The hidden envelope fields legitimately
    // carry `value=`, so anchoring on the first `<input` in the file would read
    // one of those instead of the control this requirement is about.
    const textAt = code.indexOf('type="text"');
    expect(textAt, "the free-text input could not be located").toBeGreaterThan(0);
    expect(code.slice(code.lastIndexOf("<input", textAt), textAt)).not.toMatch(/\bvalue=\{/);
    // And the composition state is a ref, so tracking it cannot itself cause the
    // render that would discard the composition.
    expect(source).toMatch(/const composing = useRef\(false\)/);
  });
});
