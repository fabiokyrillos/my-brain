import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { idleTaskDetailCommandState, type TaskDetailCommandState } from "@/features/task-commands/detail-action-state";
import { detailControlsFor } from "@/features/task-commands/detail-controls";
import { getWorkCopy } from "./copy";
import { QuickEdit } from "./quick-edit";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

/**
 * `2L-EDIT-001` … `2L-EDIT-006`, `2L-EDIT-010` — editing a task from the list.
 *
 * ## What is deliberately *not* tested here
 *
 * Almost everything. Quick edit adds no command path: it mounts the controls
 * the task detail already renders, against the Server Action the task detail
 * already calls, which resolves through `list_task_command_candidates` and
 * applies through `apply_task_command`. Value refusals, staleness, replay,
 * confirmation issuance and outcome copy are proved once, where they live
 * (`detail-actions.test.ts`, `detail-controls.test.ts`,
 * `task-detail-controls.test.tsx`) — re-asserting them here would test the
 * same code twice and let a future divergence pass both.
 *
 * What is this component's own is therefore what is tested: that the controls
 * are the derived ones, that the destructive verb cannot apply from a row, and
 * that the frame does not break the surface it is embedded in.
 */

const TASK_ID = "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6";

function handler(result: TaskDetailCommandState = idleTaskDetailCommandState) {
  const seen: FormData[] = [];
  const action = vi.fn(async (_state: TaskDetailCommandState, formData: FormData) => {
    seen.push(formData);
    return result;
  });
  return { action, seen };
}

function renderQuickEdit(status = "todo", locale: "pt-BR" | "en" = "en") {
  const { action, seen } = handler();
  const view = render(
    <QuickEdit
      action={action}
      controls={detailControlsFor(status)}
      dateBounds={{ min: "2024-08-09", max: "2028-08-09" }}
      locale={locale}
      taskId={TASK_ID}
      title="Enviar proposta"
      relationOptions={{ project: [], context: [], person: [] }}
    />,
  );
  return { ...view, action, seen };
}

describe("QuickEdit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("offers exactly the controls the taxonomy derives for the row's status", () => {
    // `2L-EDIT-001`: derived, never hand-written. The assertion compares the
    // rendered control count against `detailControlsFor` rather than against a
    // number, so a taxonomy change moves both together or fails.
    renderQuickEdit("todo");
    const expected = detailControlsFor("todo");
    expect(expected.length).toBeGreaterThan(0);
    expect(screen.getAllByRole("listitem")).toHaveLength(expected.length);
  });

  it("offers a different set for a completed row, because the taxonomy does", () => {
    renderQuickEdit("completed");
    expect(screen.getAllByRole("listitem")).toHaveLength(detailControlsFor("completed").length);
  });

  it("never renders a heading inside a list row", () => {
    // `2L-ACCESS-002`. The task detail renders these under an `<h2>`; a row is
    // already inside the list's own structure, and a heading here would put an
    // `<h2>` per task into the document outline.
    const { container } = renderQuickEdit();
    expect(container.querySelector("h1, h2, h3, h4, h5, h6")).toBeNull();
  });

  it("starts closed, and names what it opens", () => {
    renderQuickEdit("todo", "en");
    const summary = screen.getByText(getWorkCopy("en").quickEdit.summary);
    expect(summary.closest("details")).not.toHaveAttribute("open");
  });

  it("submits through the injected action, carrying the row's identity", async () => {
    const user = userEvent.setup();
    const { seen } = renderQuickEdit("todo", "en");

    await user.click(screen.getByText(getWorkCopy("en").quickEdit.summary));
    const submit = screen.getAllByRole("button")[0];
    await user.click(submit);

    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    expect(seen[0].get("taskId")).toBe(TASK_ID);
    expect(seen[0].get("locale")).toBe("en");
    expect(typeof seen[0].get("operationKey")).toBe("string");
  });

  it("sends the destructive verb to a confirmation rather than applying it", async () => {
    // `2L-EDIT-010`. `cancel_task` is the taxonomy's only destructive action;
    // from a quick-edit control it must submit `request_cancel`, which issues a
    // server-side confirmation against the row the server itself resolved.
    const user = userEvent.setup();
    const { seen } = renderQuickEdit("todo", "en");
    await user.click(screen.getByText(getWorkCopy("en").quickEdit.summary));

    const destructive = detailControlsFor("todo").filter((control) => control.destructive);
    expect(destructive.map((control) => control.action)).toEqual(["cancel_task"]);

    const forms = document.querySelectorAll("form");
    const intents = [...forms].map(
      (form) => (form.querySelector('input[name="intent"]') as HTMLInputElement | null)?.value,
    );
    expect(intents).toContain("request_cancel");
    // And nothing destructive is reachable on the `apply` intent.
    const destructiveForm = [...forms].find(
      (form) => (form.querySelector('input[name="action"]') as HTMLInputElement | null)?.value === "cancel_task",
    );
    expect(
      (destructiveForm?.querySelector('input[name="intent"]') as HTMLInputElement | null)?.value,
    ).toBe("request_cancel");
    expect(seen).toHaveLength(0);
  });

  it("adds no write path of its own", () => {
    // `2L-EDIT-002`. The component holds no client, calls no RPC and imports no
    // Server Action — the action arrives as a prop, the way every other Work
    // control receives one.
    const source = readFileSync(join(__dirname, "quick-edit.tsx"), "utf8");
    expect(source).not.toMatch(/\.rpc\(|from\s+["']@\/lib\/supabase|use server/);
  });
});
