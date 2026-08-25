import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

import { NotificationRowActions } from "./notification-row-actions";
import { getNotificationActionCopy } from "./action-copy";
import { refusalMessage } from "./refusal-copy";
import type { NotificationSubject } from "./subject";
import { menuVerbsFor, primaryVerbFor, verbsForRow } from "./verbs";

/**
 * Every Server Action is INJECTED, not imported.
 *
 * The component takes its handlers as props for the same reason
 * `WorkItemActions` does: the action modules are `"use server"` and reach
 * `server-only`, which throws in a client bundle — and jsdom is a client
 * bundle. Injection makes the boundary a prop rather than a mocked path, and it
 * is what lets these tests assert **what was dispatched** rather than only what
 * rendered.
 */

const TASK: NotificationSubject = {
  noticeType: "task_overdue",
  subjectType: "task",
  subjectId: "3f7c1b52-0e2a-4d61-9f83-2b6a1c9d4e70",
};

const copy = getNotificationActionCopy("pt-BR");

function idleWorkState() {
  return {
    status: "idle" as const, taskId: null, action: null, title: null,
    heading: "", detail: "", announcement: "", refreshable: false, retryable: false, undo: null,
  };
}

function setup(options: {
  subject?: NotificationSubject | null;
  subjectStatus?: string | null;
  handlers?: Partial<{
    markAction: ReturnType<typeof vi.fn>;
    suppressAction: ReturnType<typeof vi.fn>;
    workAction: ReturnType<typeof vi.fn>;
    detailAction: ReturnType<typeof vi.fn>;
  }>;
} = {}) {
  const subject = options.subject === undefined ? TASK : options.subject;
  const subjectStatus = options.subjectStatus === undefined ? "todo" : options.subjectStatus;
  const verbs = verbsForRow({ subjectType: subject?.subjectType ?? null, subjectStatus });

  const markAction = options.handlers?.markAction ?? vi.fn(async () => {});
  const suppressAction =
    options.handlers?.suppressAction ??
    vi.fn(async () => ({ ok: true as const, suppressionId: "s1", undo: null, replaced: false }));
  const workAction =
    options.handlers?.workAction ??
    vi.fn(async () => ({
      ...idleWorkState(),
      status: "applied" as const,
      detail: "Tarefa concluída.",
      announcement: "Tarefa concluída.",
    }));
  const detailAction = options.handlers?.detailAction ?? vi.fn(async () => ({
    status: "idle" as const, action: null, heading: "", detail: "", reason: null,
    announcement: "", pending: null, refreshable: false, retryable: false, undo: null,
  }));
  const undoAction = vi.fn(async () => ({ status: "idle" as const, message: "", announcement: "" }));

  render(
    <NotificationRowActions
      detailAction={detailAction as never}
      locale="pt-BR"
      markAction={markAction as never}
      menuVerbs={menuVerbsFor(verbs)}
      notificationId="notice-1"
      primaryVerb={primaryVerbFor(verbs)}
      subject={subject}
      subjectLabel="Pagar o aluguel"
      suppressAction={suppressAction as never}
      undoAction={undoAction as never}
      workAction={workAction as never}
    />,
  );

  return { markAction, suppressAction, workAction, detailAction, undoAction };
}

/** The VISIBLE outcome, not the live region.
 *
 * Both carry the same sentence deliberately — one for the eye, one for a screen
 * reader — so a bare `getByText` matches twice. Reading the outcome element by
 * name keeps the assertions about what the owner SEES.
 */
function outcomeText(): string {
  return document.querySelector(".notification-row-outcome")?.textContent ?? "";
}

afterEach(cleanup);

describe("2S-ACT-001 / -002: one primary, one menu, and the primary follows the subject", () => {
  it("leads with the task verb for a live subject", () => {
    setup({ subjectStatus: "todo" });
    expect(screen.getByRole("button", { name: /Concluir tarefa: Pagar o aluguel/ })).toBeTruthy();
  });

  it("leads with a MESSAGE verb once the subject no longer admits the task verb", () => {
    setup({ subjectStatus: "completed" });
    expect(screen.queryByRole("button", { name: /Concluir tarefa/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Marcar aviso como lido/ })).toBeTruthy();
  });

  it("renders exactly one primary and one menu trigger at rest", () => {
    setup({ subjectStatus: "todo" });
    // The row's own controls, before the menu is opened: the primary plus the
    // trigger. Asserted against the RENDERED row, per `2S-ACT-002`.
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2);
    expect(screen.getByRole("button", { name: copy.menuLabel("Pagar o aluguel") })).toBeTruthy();
  });
});

describe("no task action for an absent, unreadable or foreign subject", () => {
  it("offers only message verbs when there is no subject at all", () => {
    setup({ subject: null, subjectStatus: null });
    expect(screen.queryByRole("button", { name: /tarefa/i })).toBeNull();
    expect(screen.getByRole("button", { name: /Marcar aviso como lido/ })).toBeTruthy();
  });

  it("offers no silencing verb either when there is no subject to silence", async () => {
    setup({ subject: null, subjectStatus: null });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: copy.menuLabel("Pagar o aluguel") }));
    expect(screen.queryByRole("button", { name: /Silenciar/ })).toBeNull();
  });
});

describe("2S-ACT-007: a pending action refuses a second submission of itself", () => {
  it("disables the control while the round is in flight", async () => {
    // Held on an object so TypeScript does not narrow the closure assignment to `never`.
    const gate: { release: (() => void) | null } = { release: null };
    const workAction = vi.fn(
      (): Promise<unknown> =>
        new Promise((resolve) => {
          gate.release = () =>
            resolve({ ...idleWorkState(), status: "applied", detail: "ok", announcement: "ok" });
        }),
    );
    setup({ handlers: { workAction: workAction as never } });
    const user = userEvent.setup();

    const primary = screen.getByRole("button", { name: /Concluir tarefa/ });
    await user.click(primary);

    // The control is disabled while pending, so a second click cannot dispatch.
    await waitFor(() => expect((primary as HTMLButtonElement).disabled).toBe(true));
    await user.click(primary).catch(() => {});
    expect(workAction).toHaveBeenCalledTimes(1);

    gate.release?.();
    await waitFor(() => expect(workAction).toHaveBeenCalledTimes(1));
  });
});

describe("2S-ACT-008: a failure preserves the row and its menu", () => {
  it("shows a useful sentence and leaves the controls in place", async () => {
    const workAction = vi.fn(async () => ({
      ...idleWorkState(),
      status: "failed" as const,
      detail: "",
      announcement: "",
    }));
    setup({ handlers: { workAction: workAction as never } });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Concluir tarefa/ }));

    await waitFor(() => expect(outcomeText()).toBe(refusalMessage("pt-BR", "failed")));
    // The row survives: primary and menu trigger are both still there.
    expect(screen.getByRole("button", { name: /Concluir tarefa/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: copy.menuLabel("Pagar o aluguel") })).toBeTruthy();
  });

  it("offers the reload a stale row needs, rather than a generic failure", async () => {
    const workAction = vi.fn(async () => ({
      ...idleWorkState(),
      status: "refused" as const,
      refreshable: true,
    }));
    setup({ handlers: { workAction: workAction as never } });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Concluir tarefa/ }));

    await waitFor(() => expect(outcomeText()).toBe(refusalMessage("pt-BR", "stale")));
  });

  it("renders nothing the database said, even when the action throws", async () => {
    const workAction = vi.fn(async () => {
      throw new Error('duplicate key value violates unique constraint "tasks_pkey" (23505)');
    });
    setup({ handlers: { workAction: workAction as never } });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Concluir tarefa/ }));

    await waitFor(() => expect(outcomeText()).toBe(refusalMessage("pt-BR", "failed")));
    expect(document.body.textContent).not.toContain("23505");
    expect(document.body.textContent).not.toContain("tasks_pkey");
    expect(document.body.textContent).not.toContain("constraint");
  });
});

describe("2S-ACT-010: confirmation is asked only for the verb that really loses something", () => {
  it("asks before dismissing, and names what is lost", async () => {
    const { markAction } = setup();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: copy.menuLabel("Pagar o aluguel") }));
    await user.click(screen.getByRole("button", { name: /Descartar aviso/ }));

    expect(screen.getByText(copy.confirmQuestion.dismiss as string)).toBeTruthy();
    // Nothing was dispatched by opening the question.
    expect(markAction).not.toHaveBeenCalled();
  });

  it("leaves everything unchanged when the question is cancelled", async () => {
    const { markAction } = setup();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: copy.menuLabel("Pagar o aluguel") }));
    await user.click(screen.getByRole("button", { name: /Descartar aviso/ }));
    await user.click(screen.getByRole("button", { name: copy.cancelAction }));

    expect(markAction).not.toHaveBeenCalled();
    expect(screen.queryByText(copy.confirmQuestion.dismiss as string)).toBeNull();
  });

  it("does NOT ask before marking read, because nothing is lost", async () => {
    const { markAction } = setup();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: copy.menuLabel("Pagar o aluguel") }));
    await user.click(screen.getByRole("button", { name: /Marcar aviso como lido/ }));

    await waitFor(() => expect(markAction).toHaveBeenCalledTimes(1));
    const submitted = markAction.mock.calls[0][0] as FormData;
    expect(submitted.get("status")).toBe("read");
  });
});

describe("2S-ANSWER-001: dismissal reaches the writer with the value it never sent before", () => {
  it("dispatches status=dismissed once the question is answered", async () => {
    const { markAction } = setup();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: copy.menuLabel("Pagar o aluguel") }));
    await user.click(screen.getByRole("button", { name: /Descartar aviso/ }));
    await user.click(screen.getByRole("button", { name: copy.confirmAction }));

    await waitFor(() => expect(markAction).toHaveBeenCalledTimes(1));
    const submitted = markAction.mock.calls[0][0] as FormData;
    expect(submitted.get("status")).toBe("dismissed");
    expect(submitted.get("notificationId")).toBe("notice-1");
  });
});

describe("2S-ACT-009: undo appears only where a real one came back", () => {
  it("offers no undo for a message disposition", async () => {
    setup();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: copy.menuLabel("Pagar o aluguel") }));
    await user.click(screen.getByRole("button", { name: /Marcar aviso como lido/ }));

    await waitFor(() => expect(outcomeText()).toBe(copy.applied.mark_read));
    expect(screen.queryByRole("button", { name: /desfazer/i })).toBeNull();
  });

  it("offers undo when the database returned a real offer", async () => {
    const workAction = vi.fn(async () => ({
      ...idleWorkState(),
      status: "applied" as const,
      detail: "Tarefa concluída.",
      announcement: "Tarefa concluída.",
      undo: { undoId: "u-1", expiresAt: new Date(Date.now() + 600000).toISOString() },
    }));
    setup({ handlers: { workAction: workAction as never } });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Concluir tarefa/ }));

    await waitFor(() => expect(outcomeText()).toBe("Tarefa concluída."));
    expect(screen.queryByRole("button", { name: /desfazer/i })).toBeTruthy();
  });
});

describe("the silencing verbs preserve the RPC's named refusals as useful sentences", () => {
  it("renders the specific sentence, and never the code", async () => {
    const suppressAction = vi.fn(async () => ({ ok: false as const, code: "SUPPRESSION_REASON_MISSING" }));
    setup({ handlers: { suppressAction: suppressAction as never } });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: copy.menuLabel("Pagar o aluguel") }));
    await user.click(screen.getByRole("button", { name: /Silenciar este assunto/ }));
    await user.click(screen.getByRole("button", { name: copy.applyAction }));

    await waitFor(() => expect(outcomeText()).toBe(refusalMessage("pt-BR", "SUPPRESSION_REASON_MISSING")));
    expect(document.body.textContent).not.toContain("SUPPRESSION_");
  });

  it("distinguishes the three scope/instant refusals rather than collapsing them", async () => {
    const suppressAction = vi.fn(async () => ({ ok: false as const, code: "SUPPRESSION_PAST_DATED" }));
    setup({ handlers: { suppressAction: suppressAction as never } });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: copy.menuLabel("Pagar o aluguel") }));
    await user.click(screen.getByRole("button", { name: /Silenciar este assunto/ }));
    await user.click(screen.getByRole("button", { name: copy.applyAction }));

    await waitFor(() => expect(outcomeText()).toBe(refusalMessage("pt-BR", "SUPPRESSION_PAST_DATED")));
    expect(outcomeText()).not.toBe(refusalMessage("pt-BR", "SUPPRESSION_UNBOUNDED"));
  });

  it("dispatches the subject it was given, never one it invented", async () => {
    const suppressAction = vi.fn(async () => ({
      ok: true as const, suppressionId: "s1", undo: null, replaced: false,
    }));
    setup({ handlers: { suppressAction: suppressAction as never } });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: copy.menuLabel("Pagar o aluguel") }));
    await user.click(screen.getByRole("button", { name: /Silenciar este assunto/ }));
    await user.click(screen.getByRole("button", { name: copy.applyAction }));

    await waitFor(() => expect(suppressAction).toHaveBeenCalledTimes(1));
    const [input] = suppressAction.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(input.entityId).toBe(TASK.subjectId);
    expect(input.entityType).toBe("task");
    expect(input.scope).toBe("forever");
    // `forever` must not carry an instant — the RPC refuses that as
    // SUPPRESSION_MALFORMED, and the surface must not send one.
    expect(input.suppressedUntil).toBeUndefined();
  });
});

describe("the live region exists before the result does", () => {
  it("renders the status region on first paint, empty", () => {
    setup();
    const region = document.querySelector('[role="status"]');
    expect(region, "a region mounted with its text is a region nobody announces").not.toBeNull();
    expect(region?.textContent).toBe("");
  });
});

describe("accessibility contract: one announceable source, announced once", () => {
  it("has EXACTLY ONE announceable region in the row", () => {
    /*
     * The first version had two nodes carrying the same sentence: an `sr-only`
     * `role="status"` and a separate visible paragraph. That did not produce
     * two announcements — the paragraph had no role and no `aria-live` — but it
     * did put the same text in the accessibility tree twice. They are one node
     * now, and this is the assertion that keeps them one.
     */
    setup();
    const live = document.querySelectorAll('[aria-live], [role="status"], [role="alert"], [role="log"]');
    expect(live).toHaveLength(1);
  });

  it("keeps the response visible — the live region IS the visible message", () => {
    setup();
    const region = document.querySelector('[role="status"]');
    expect(region?.className).toContain("notification-row-outcome");
    // Not the screen-reader-only treatment: this is the sentence the eye reads.
    expect(region?.className).not.toContain("sr-only");
  });

  it("renders the region before any result exists, and empty", () => {
    setup();
    const region = document.querySelector('[role="status"]');
    expect(region).not.toBeNull();
    expect(region?.textContent).toBe("");
  });

  it("never carries the same text in a second announceable node", async () => {
    const { markAction } = setup();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: copy.menuLabel("Pagar o aluguel") }));
    await user.click(screen.getByRole("button", { name: /Marcar aviso como lido/ }));
    await waitFor(() => expect(outcomeText()).toBe(copy.applied.mark_read));

    expect(markAction).toHaveBeenCalledTimes(1);
    // The sentence appears exactly once in the whole row.
    const occurrences = screen.getAllByText(copy.applied.mark_read);
    expect(occurrences).toHaveLength(1);
  });

  it("announces pending while in flight, and never announces success early", async () => {
    const gate: { release: (() => void) | null } = { release: null };
    const workAction = vi.fn(
      (): Promise<unknown> =>
        new Promise((resolve) => {
          gate.release = () =>
            resolve({ ...idleWorkState(), status: "applied", detail: "Tarefa concluída.", announcement: "x" });
        }),
    );
    setup({ handlers: { workAction: workAction as never } });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Concluir tarefa/ }));

    const region = document.querySelector('[role="status"]');
    await waitFor(() => expect(region?.getAttribute("aria-busy")).toBe("true"));
    expect(region?.textContent).toBe(copy.pendingAnnouncement);
    // The success sentence is NOT present yet.
    expect(region?.textContent).not.toBe("Tarefa concluída.");

    gate.release?.();
    await waitFor(() => expect(outcomeText()).toBe("Tarefa concluída."));
    expect(region?.getAttribute("aria-busy")).toBe("false");
  });

  it("REPLACES the previous announcement when a second action runs", async () => {
    const suppressAction = vi.fn(async () => ({ ok: false as const, code: "SUPPRESSION_REASON_MISSING" }));
    setup({ handlers: { suppressAction: suppressAction as never } });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: copy.menuLabel("Pagar o aluguel") }));
    await user.click(screen.getByRole("button", { name: /Silenciar este assunto/ }));
    await user.click(screen.getByRole("button", { name: copy.applyAction }));
    await waitFor(() =>
      expect(outcomeText()).toBe(refusalMessage("pt-BR", "SUPPRESSION_REASON_MISSING")),
    );

    // A second, different round: the region holds the NEW sentence only.
    await user.click(screen.getByRole("button", { name: /Concluir tarefa/ }));
    await waitFor(() => expect(outcomeText()).toBe("Tarefa concluída."));
    expect(document.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(screen.queryByText(refusalMessage("pt-BR", "SUPPRESSION_REASON_MISSING"))).toBeNull();
  });

  it("does not move focus when a round settles", async () => {
    setup();
    const user = userEvent.setup();
    const primary = screen.getByRole("button", { name: /Concluir tarefa/ });

    await user.click(primary);
    await waitFor(() => expect(outcomeText()).toBe("Tarefa concluída."));

    // Focus stays where the owner left it, rather than jumping to the outcome.
    expect(document.activeElement).toBe(primary);
  });
});

describe("accessibility contract: the compact menu closes and gives focus back", () => {
  /*
   * The panel's focus contract is asserted below, and the MENU's was not —
   * which is the half a reader meets first. It has two ways out and both must
   * put focus back where it came from, because the control that opened the menu
   * is the only thing still on screen once the menu is gone.
   */
  it("closes on Escape and returns focus to its trigger", async () => {
    setup();
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: copy.menuLabel("Pagar o aluguel") });

    await user.click(trigger);
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    /*
     * TAB INTO THE MENU FIRST, and the reason is a control that did not fail.
     *
     * Without this the reader is still standing on the trigger when Escape
     * arrives, so `document.activeElement === trigger` is true whether or not
     * the component gives focus back — and a mutation that deleted the
     * `focus()` call passed. Focus has to LEAVE before "returns focus" means
     * anything.
     */
    await user.tab();
    expect(document.activeElement, "focus never entered the menu").not.toBe(trigger);
    expect(screen.getByRole("menu").contains(document.activeElement)).toBe(true);

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("closes on a second press of the trigger, which is the other way out", async () => {
    // The control that can fail: a menu that only Escape could close would pass
    // the test above and still leave a pointer user with one way in and none out.
    setup();
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: copy.menuLabel("Pagar o aluguel") });
    await user.click(trigger);
    expect(screen.getByRole("menu")).toBeTruthy();
    await user.click(trigger);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("accessibility contract: the dismissal question holds focus and gives it back", () => {
  it("moves focus into the question when it opens", async () => {
    setup();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: copy.menuLabel("Pagar o aluguel") }));
    await user.click(screen.getByRole("button", { name: /Descartar aviso/ }));

    await waitFor(() => {
      const panel = document.querySelector(".notification-verb-panel");
      expect(panel?.contains(document.activeElement)).toBe(true);
    });
  });

  it("keeps Tab inside the question", async () => {
    setup();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: copy.menuLabel("Pagar o aluguel") }));
    await user.click(screen.getByRole("button", { name: /Descartar aviso/ }));
    const panel = document.querySelector(".notification-verb-panel");
    await waitFor(() => expect(panel?.contains(document.activeElement)).toBe(true));

    // Round the whole cycle: focus must never leave the panel.
    for (let step = 0; step < 6; step += 1) {
      await user.tab();
      expect(panel?.contains(document.activeElement), `escaped on tab ${step}`).toBe(true);
    }
  });

  it("returns focus to the menu trigger when cancelled", async () => {
    setup();
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: copy.menuLabel("Pagar o aluguel") });

    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: /Descartar aviso/ }));
    await user.click(screen.getByRole("button", { name: copy.cancelAction }));

    // Back on the trigger — NOT on the menu item, which no longer exists.
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("returns focus to the menu trigger when Escape closes the question", async () => {
    setup();
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: copy.menuLabel("Pagar o aluguel") });

    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: /Descartar aviso/ }));
    await waitFor(() => {
      expect(document.querySelector(".notification-verb-panel")).not.toBeNull();
    });
    await user.keyboard("{Escape}");

    expect(document.querySelector(".notification-verb-panel")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
