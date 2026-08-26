/**
 * *Abrir*, proved against the five properties the owner named on 2026-08-25:
 *
 * 1. the change to read **finishes before** the navigation;
 * 2. a double press does **not** fire two writes;
 * 3. a failed write does **not** leave the control stuck loading;
 * 4. the destination is owner-scoped and **does not accept an arbitrary URL**;
 * 5. keyboard and focus stay correct.
 *
 * Each is asserted by observing the ORDER and the COUNT of what actually
 * happened, not by reading an attribute that describes an intention.
 */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

/** Every effect, in the order it really occurred. This is the whole method. */
const timeline: string[] = [];

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: () => {},
    push: (href: string) => {
      timeline.push(`push:${href}`);
    },
  }),
}));

import { getNotificationActionCopy } from "./action-copy";
import { isOwnerScopedDestination, NoticeOpenControl } from "./notice-open-control";
import { refusalMessage } from "./refusal-copy";

const HREF = "/pt-BR/app/work/3f7c1b52-0e2a-4d61-9f83-2b6a1c9d4e70";
const SUBJECT = "Pagar o aluguel";
const copy = getNotificationActionCopy("pt-BR");

afterEach(() => {
  cleanup();
  timeline.length = 0;
});

function setup(options: {
  alreadySeen?: boolean;
  /** Resolves when the caller says so, so the in-flight window is observable. */
  gate?: { release: (() => void) | null };
  fails?: boolean;
} = {}) {
  const { alreadySeen = false, gate, fails = false } = options;

  const markAction = vi.fn(async (payload: FormData) => {
    timeline.push(`write:start:${String(payload.get("status"))}`);
    if (gate) {
      await new Promise<void>((resolve) => {
        gate.release = () => {
          timeline.push("write:end");
          resolve();
        };
      });
    } else if (fails) {
      timeline.push("write:threw");
      throw new Error("the network went away");
    } else {
      timeline.push("write:end");
    }
  });

  render(
    <NoticeOpenControl
      alreadySeen={alreadySeen}
      href={HREF}
      locale="pt-BR"
      markAction={markAction as never}
      notificationId="notice-1"
      subjectLabel={SUBJECT}
    />,
  );
  return { markAction, button: screen.getByRole("button", { name: copy.openLabel(SUBJECT) }) };
}

describe("property 1: the change to read finishes before the navigation", () => {
  it("writes, waits for the write, and only then navigates", async () => {
    const { markAction } = setup();

    await userEvent.click(screen.getByRole("button", { name: copy.openLabel(SUBJECT) }));

    await waitFor(() => expect(timeline).toContain(`push:${HREF}`));
    /*
     * THE ORDER, not merely the presence of both. A control that fired the
     * write and navigated in the same tick would satisfy "both happened" and
     * still leave the owner on a new page with an unread notice behind them.
     */
    expect(timeline).toEqual(["write:start:read", "write:end", `push:${HREF}`]);
    expect(markAction).toHaveBeenCalledTimes(1);
    expect(markAction.mock.calls[0][0].get("status")).toBe("read");
  });

  it("does not navigate while the write is still in flight", async () => {
    const gate: { release: (() => void) | null } = { release: null };
    setup({ gate });

    await userEvent.click(screen.getByRole("button", { name: copy.openLabel(SUBJECT) }));
    await waitFor(() => expect(timeline).toContain("write:start:read"));

    // The window the previous test cannot see: the write has started and has
    // not finished, and nothing has navigated.
    expect(timeline).toEqual(["write:start:read"]);

    gate.release?.();
    await waitFor(() => expect(timeline).toContain(`push:${HREF}`));
    expect(timeline).toEqual(["write:start:read", "write:end", `push:${HREF}`]);
  });
});

describe("property 2: a double press does not fire two writes", () => {
  it("refuses the second press while the first round is in flight", async () => {
    const gate: { release: (() => void) | null } = { release: null };
    const { markAction, button } = setup({ gate });
    const user = userEvent.setup();

    await user.click(button);
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(true));

    // Forced, past the disabled attribute: `click()` on the element itself, and
    // a submit dispatched straight at the form. `2S-ACT-007`'s wording is that
    // the count is what proves this, never the attribute.
    button.click();
    (button.closest("form") as HTMLFormElement).requestSubmit?.();
    await user.click(button).catch(() => {});

    expect(markAction).toHaveBeenCalledTimes(1);

    gate.release?.();
    await waitFor(() => expect(timeline).toContain(`push:${HREF}`));
    expect(markAction).toHaveBeenCalledTimes(1);
    // One write, one navigation — no second round slipped through on settle.
    expect(timeline.filter((entry) => entry.startsWith("push:"))).toHaveLength(1);
  });
});

describe("property 3: a failed write does not leave the control stuck loading", () => {
  it("settles, re-enables the control, says why, and does NOT navigate", async () => {
    const { button, markAction } = setup({ fails: true });

    await userEvent.click(button);

    // The pending state ends.
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    // The reason is shown, from the closed set — nothing from the exception.
    expect(await screen.findByText(refusalMessage("pt-BR", "failed"))).toBeTruthy();
    expect(screen.getByText(refusalMessage("pt-BR", "failed")).textContent)
      .not.toContain("network went away");
    // And the owner is still here.
    expect(timeline.some((entry) => entry.startsWith("push:"))).toBe(false);

    // A retry is possible, which is what "not stuck" has to mean.
    await userEvent.click(button);
    expect(markAction).toHaveBeenCalledTimes(2);
  });
});

describe("property 4: the destination is owner-scoped and refuses an arbitrary URL", () => {
  const REFUSED = [
    "https://evil.example/pt-BR/app/work/1",
    "http://localhost:3000/pt-BR/app",
    "//evil.example/pt-BR/app",
    "/\\evil.example/pt-BR/app",
    "javascript:alert(1)",
    "mailto:someone@example.test",
    "/pt-BR/auth/login",
    "/pt-BR/legal/terms",
    "/app/work/1",
    "/fr-FR/app/work/1",
    "app/work/1",
    "",
  ];

  it("accepts the two shapes the heartbeat actually writes", () => {
    // Proved FIRST, so what follows is not a predicate that refuses everything.
    expect(isOwnerScopedDestination("/pt-BR/app/work/3f7c1b52")).toBe(true);
    expect(isOwnerScopedDestination("/en/app/reminders")).toBe(true);
  });

  for (const candidate of REFUSED) {
    it(`refuses ${JSON.stringify(candidate)}`, () => {
      expect(isOwnerScopedDestination(candidate)).toBe(false);
    });
  }

  it("refuses null and undefined without throwing", () => {
    expect(isOwnerScopedDestination(null)).toBe(false);
    expect(isOwnerScopedDestination(undefined)).toBe(false);
  });
});

describe("property 5: keyboard and focus stay correct", () => {
  it("is reachable by Tab and activated by Enter", async () => {
    const { markAction, button } = setup();
    const user = userEvent.setup();

    await user.tab();
    expect(document.activeElement).toBe(button);

    await user.keyboard("{Enter}");
    await waitFor(() => expect(markAction).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(timeline).toContain(`push:${HREF}`));
  });

  it("is activated by Space, and focus stays on it while the round runs", async () => {
    const gate: { release: (() => void) | null } = { release: null };
    const { markAction, button } = setup({ gate });
    const user = userEvent.setup();

    await user.tab();
    await user.keyboard(" ");
    await waitFor(() => expect(markAction).toHaveBeenCalledTimes(1));

    /*
     * A disabled button loses focus to the body in some browsers, which would
     * drop a keyboard reader out of the row entirely. Asserted rather than
     * assumed, because it is the kind of thing that only shows up on a keyboard.
     */
    expect(document.activeElement).toBe(button);

    gate.release?.();
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    expect(document.activeElement).toBe(button);
  });

  it("announces its refusal through a region that existed before it", async () => {
    const { button } = setup({ fails: true });
    const region = screen.getByRole("status");
    expect(region.textContent).toBe("");

    await userEvent.click(button);

    await waitFor(() => expect(region.textContent).toBe(refusalMessage("pt-BR", "failed")));
    // The same node — not a second one that appeared with the message.
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});

describe("a notice already seen is opened without a write", () => {
  it("navigates and writes nothing", async () => {
    const { markAction } = setup({ alreadySeen: true });

    await userEvent.click(screen.getByRole("button", { name: copy.openLabel(SUBJECT) }));

    await waitFor(() => expect(timeline).toContain(`push:${HREF}`));
    expect(markAction).not.toHaveBeenCalled();
    expect(timeline).toEqual([`push:${HREF}`]);
  });
});
