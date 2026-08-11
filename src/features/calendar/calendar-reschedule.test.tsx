import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  idleTaskDetailCommandState,
  type TaskDetailCommandState,
} from "@/features/task-commands/detail-action-state";

import { CalendarItem } from "./calendar-item";
import { CalendarReschedule } from "./calendar-reschedule";
import { schedulingControlsFor } from "./calendar-scheduling";
import type { CalendarItemView } from "./calendar-contracts";
import { getCalendarCopy } from "./copy";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

/**
 * `2M-CAL-009`/`-010`, `2M-MOBILE-003`/`-004` — rescheduling from the calendar.
 *
 * ## What is deliberately not tested here
 *
 * Almost everything about the command itself. This surface adds no write path:
 * value refusals, the ±730-day bound, staleness, replay, confirmation issuance
 * and the outcome vocabulary are proved once where they live
 * (`detail-actions.test.ts`, `detail-controls.test.ts`,
 * `task-detail-controls.test.tsx`). Re-asserting them here would test the same
 * code twice and let a future divergence pass both — the same reasoning
 * `quick-edit.test.tsx` records for the Work list.
 *
 * What is tested is what this frame owns: that the controls are the derived
 * ones, that no non-scheduling verb can reach the grid, that a masked item is
 * still reschedulable without being revealed, and that the file adds no second
 * authority.
 */

const TASK_ID = "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6";
const BOUNDS = { min: "2024-08-11", max: "2028-08-11" };

function handler(result: TaskDetailCommandState = idleTaskDetailCommandState) {
  const seen: FormData[] = [];
  const action = vi.fn(async (_state: TaskDetailCommandState, formData: FormData) => {
    seen.push(formData);
    return result;
  });
  return { action, seen };
}

function renderReschedule(status = "todo", locale: "pt-BR" | "en" = "en") {
  const { action, seen } = handler();
  const view = render(
    <CalendarReschedule
      action={action}
      dateBounds={BOUNDS}
      locale={locale}
      target={{ taskId: TASK_ID, controls: schedulingControlsFor(status) }}
      title="Enviar proposta"
    />,
  );
  return { ...view, action, seen };
}

function item(overrides: Partial<CalendarItemView> = {}): CalendarItemView {
  return {
    id: "deadline:t1",
    lane: "deadline",
    commitment: "committed",
    at: "2026-08-15T18:00:00.000Z",
    date: "2026-08-15",
    title: "Entregar o relatório",
    sensitivity: { kind: "undetermined" },
    href: "/pt-BR/app/work/t1?from=abc",
    elapsed: false,
    reschedule: { taskId: TASK_ID, controls: schedulingControlsFor("todo") },
    ...overrides,
  };
}

describe("2M-CAL-009: the controls are the derived ones", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders exactly what the taxonomy admits for the status, and nothing else", () => {
    renderReschedule("todo");
    const expected = schedulingControlsFor("todo");
    expect(expected.length).toBeGreaterThan(0);
    expect(screen.getAllByRole("listitem")).toHaveLength(expected.length);
  });

  it("puts no non-scheduling verb on the grid", () => {
    const { container } = renderReschedule("todo");
    const actions = [...container.querySelectorAll('input[name="action"]')]
      .map((input) => (input as HTMLInputElement).value);
    expect(actions.length).toBeGreaterThan(0);
    for (const forbidden of ["rename_task", "append_note", "set_priority", "cancel_task", "assign_project"]) {
      expect(actions, `${forbidden} reached the calendar`).not.toContain(forbidden);
    }
  });

  it("offers no destructive verb at all, so no confirmation is ever minted here", () => {
    /*
     * `cancel_task` is the taxonomy's only destructive action and it changes no
     * date, so the derivation excludes it — which makes `T-2M`'s destructive
     * surface on the calendar **empty by construction** rather than by care.
     * Asserted on the rendered intents, because that is what a POST would carry.
     */
    const { container } = renderReschedule("todo");
    const intents = [...container.querySelectorAll('input[name="intent"]')]
      .map((input) => (input as HTMLInputElement).value);
    expect(intents.length).toBeGreaterThan(0);
    expect(new Set(intents)).toEqual(new Set(["apply"]));
  });

  it("says so rather than rendering an empty disclosure when nothing is admitted", () => {
    // `2M-CAL-011`'s empty-versus-failed distinction, one control down: a
    // disclosure that opens onto nothing reads as a surface that failed to load.
    renderReschedule("cancelled", "en");
    expect(screen.getByText(getCalendarCopy("en").reschedule.unavailable)).toBeTruthy();
    expect(document.querySelector("details")).toBeNull();
  });
});

describe("2M-CAL-010 / 2M-MOBILE-004: it happens where the user is", () => {
  beforeEach(() => vi.clearAllMocks());

  it("starts closed and names what it opens", () => {
    renderReschedule("todo", "en");
    const summary = screen.getByText(getCalendarCopy("en").reschedule.summary);
    expect(summary.closest("details")).not.toHaveAttribute("open");
  });

  it("submits through the injected action, carrying the task's identity", async () => {
    const user = userEvent.setup();
    const { seen } = renderReschedule("todo", "en");

    await user.click(screen.getByText(getCalendarCopy("en").reschedule.summary));
    await user.click(screen.getAllByRole("button")[0]);

    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    expect(seen[0].get("taskId")).toBe(TASK_ID);
    expect(seen[0].get("locale")).toBe("en");
    // The operation key is minted per action by the shared component, which is
    // what makes a replay `2E_IDEMPOTENCY_MISMATCH` rather than a second write.
    expect(typeof seen[0].get("operationKey")).toBe("string");
  });

  /**
   * The defect the deployment journey found, in the half that belongs here.
   *
   * A successful reschedule moves the task off the day being viewed, so the
   * revalidated calendar unmounts this component — and an outcome rendered
   * *inside* it would go with it. So it renders none, and `CalendarView`
   * records the answer by wrapping the action. See `calendar-outcome.tsx`.
   */
  it("renders no outcome region of its own, because it may not outlive one", async () => {
    const user = userEvent.setup();
    const outcome: TaskDetailCommandState = {
      ...idleTaskDetailCommandState,
      status: "applied",
      action: "reschedule_due",
      heading: "Prazo alterado",
      detail: "O prazo agora é 20 de agosto.",
    };
    const action = vi.fn(async () => outcome);
    render(
      <CalendarReschedule
        action={action}
        dateBounds={BOUNDS}
        locale="pt-BR"
        target={{ taskId: TASK_ID, controls: schedulingControlsFor("todo") }}
        title="Enviar proposta"
      />,
    );

    await user.click(screen.getByText(getCalendarCopy("pt-BR").reschedule.summary));
    await user.click(screen.getAllByRole("button")[0]);

    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(screen.queryByRole("region", { name: "Resultado da alteração" })).toBeNull();
  });

  it("renders both locales from the typed record", () => {
    for (const locale of ["pt-BR", "en"] as const) {
      const { unmount } = renderReschedule("todo", locale);
      expect(screen.getByText(getCalendarCopy(locale).reschedule.summary)).toBeTruthy();
      unmount();
    }
  });
});

describe("2M-PRIVACY-001: masking withholds words, not the ability to move a date", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps the controls available on a highly sensitive item without revealing it", () => {
    const { action } = handler();
    const { container } = render(
      <CalendarItem
        dateBounds={BOUNDS}
        item={item({ sensitivity: { kind: "derived", level: "highly_sensitive" } })}
        locale="en"
        rescheduleAction={action}
        timezone="America/Sao_Paulo"
      />,
    );
    // The title is withheld …
    expect(container.textContent).not.toContain("Entregar o relatório");
    // … and the date controls are still there. A mask that removed them would
    // make a privacy setting into a capability gate.
    expect(container.querySelector("details.calendar-reschedule")).not.toBeNull();
  });

  it("never renders the title inside the controls, masked or not", () => {
    // The title travels to the *server* as a resolution hint and must not reach
    // the DOM through this path — it is already rendered, once, by
    // `ProtectedContent`, which is the only thing allowed to decide.
    const { container } = renderReschedule("todo");
    const controls = container.querySelector(".task-detail-controls");
    expect(controls?.textContent).not.toContain("Enviar proposta");
  });
});

describe("2M-CAL-009: no second authority", () => {
  const source = readFileSync(join(__dirname, "calendar-reschedule.tsx"), "utf8");

  it("holds no client, calls no RPC and declares no Server Action", () => {
    expect(source).not.toMatch(/\.rpc\(|from\s+["']@\/lib\/supabase|use server/);
  });

  it("carries no gesture handler, including one added in preparation", () => {
    // `2M-MOBILE-003`, OD-2M-6 A. Asserted here as well as in the no-gesture
    // guard, because this is the file a drag would be written into.
    expect(source).not.toMatch(/onDrag|onDrop|onTouch|onPointer|onSwipe|draggable/);
  });

  it("names no task command verb of its own", () => {
    // The whole point of `calendar-scheduling.ts`: a verb spelled here would be
    // a second copy of taxonomy knowledge in the component that renders it.
    for (const verb of ["reschedule_due", "set_planned", "clear_due", "clear_planned"]) {
      expect(source, `${verb} is spelled in the component`).not.toContain(`"${verb}"`);
    }
  });
});
