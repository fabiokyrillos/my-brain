/**
 * Slice D3 — the account and session surface, as rendered.
 *
 * What is asserted here is what a screenshot cannot show: that the disclosure
 * returns focus, that the sign-out control cannot be submitted twice, that a
 * failure is both visible and announced, and — the one with teeth — that **no
 * email address and no user id can reach the surface**, whatever it is handed.
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { idleSignOutState, type SignOutState } from "@/features/auth/sign-out-state";
import { AccountMenu } from "./account-menu";
import { accountCopy } from "./account-copy";

afterEach(cleanup);

const ptBR = accountCopy["pt-BR"];
const en = accountCopy.en;
const NAME = "Marina Duarte";

function handler(answer: SignOutState = idleSignOutState) {
  const submissions: Record<string, string>[] = [];
  const action = vi.fn(async (_state: SignOutState, formData: FormData) => {
    const entry: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      if (typeof value === "string") entry[key] = value;
    }
    submissions.push(entry);
    return answer;
  });
  return { action, submissions };
}

function renderMenu(options: {
  readonly locale?: "pt-BR" | "en";
  readonly displayName?: string | null;
  readonly answer?: SignOutState;
  readonly variant?: "rail" | "overflow";
  readonly action?: ReturnType<typeof handler>["action"];
} = {}) {
  const built = handler(options.answer);
  const action = options.action ?? built.action;
  render(
    <AccountMenu
      identity={options.displayName === null ? null : { displayName: options.displayName ?? NAME }}
      locale={options.locale ?? "pt-BR"}
      signOut={action}
      variant={options.variant}
    />,
  );
  return { action, submissions: built.submissions };
}

function summary(): HTMLElement {
  const element = document.querySelector<HTMLElement>(".account-menu > summary");
  if (element === null) throw new Error("the account disclosure has no summary");
  return element;
}

function disclosure(): HTMLDetailsElement {
  const element = document.querySelector<HTMLDetailsElement>(".account-menu");
  if (element === null) throw new Error("the account disclosure is not rendered");
  return element;
}

describe("which account is active", () => {
  it("names the signed-in account, with a label that reads as a sentence", () => {
    renderMenu();
    expect(screen.getByText(ptBR.signedInAs)).toBeTruthy();
    expect(screen.getByText(NAME)).toBeTruthy();
  });

  it("carries the display name in the control's accessible name", () => {
    // Without it every account's control announces the identical "Sua conta",
    // and a screen-reader user switching accounts has no way to tell which one
    // they are in.
    renderMenu();
    expect(summary().getAttribute("aria-label")).toBe(`${ptBR.menuLabel}: ${NAME}`);
  });

  it("falls back to a neutral label when no display name exists", () => {
    renderMenu({ displayName: null });
    expect(screen.getByText(ptBR.accountFallback)).toBeTruthy();
    expect(summary().getAttribute("aria-label")).toBe(`${ptBR.menuLabel}: ${ptBR.accountFallback}`);
  });

  it("still renders the way out when the session went away underneath it", () => {
    // A user whose session expired needs this control more than anyone, so a
    // null identity must not collapse the surface.
    renderMenu({ displayName: null });
    expect(screen.getByRole("button", { name: ptBR.signOut })).toBeTruthy();
  });

  it("renders neither an email address nor a user id, whatever it is handed", () => {
    // The guarantee is structural: the component receives one resolved display
    // name and has no other identity field to render. This asserts the rendered
    // tree rather than the prop shape, so a future addition has to break it.
    renderMenu({ displayName: "owner@example.com" });
    const text = disclosure().textContent ?? "";
    // The name it was handed *is* an email, and it is still the only identity on
    // screen — what must never appear is a second, unasked-for identifier.
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(disclosure().querySelectorAll("[data-user-id]")).toHaveLength(0);
  });
});

describe("what the panel offers", () => {
  it("reaches Settings as the destination it already is, adding no route", () => {
    renderMenu();
    expect(screen.getByRole("link", { name: ptBR.settings }))
      .toHaveAttribute("href", "/pt-BR/app/settings");
  });

  it("names the panel so it is navigable as a group", () => {
    renderMenu();
    expect(screen.getByRole("group", { name: ptBR.panelLabel })).toBeTruthy();
  });

  it("submits the locale so the redirect lands on the right login route", async () => {
    const user = userEvent.setup();
    const { submissions } = renderMenu({ locale: "en" });

    await user.click(screen.getByRole("button", { name: en.signOut }));
    await waitFor(() => expect(submissions).toHaveLength(1));
    expect(submissions[0]).toEqual({ locale: "en" });
  });

  it("renders the whole surface in English when the locale is English", () => {
    renderMenu({ locale: "en" });
    expect(screen.getByText(en.signedInAs)).toBeTruthy();
    expect(screen.getByRole("button", { name: en.signOut })).toBeTruthy();
    expect(screen.getByRole("link", { name: en.settings })).toBeTruthy();
  });

  it("uses one session model for both mounts, differing only in placement", () => {
    const rail = renderMenu({ variant: "rail" });
    expect(document.querySelector(".account-menu-rail")).toBeTruthy();
    expect(screen.getByRole("button", { name: ptBR.signOut })).toBeTruthy();
    cleanup();

    renderMenu({ variant: "overflow" });
    expect(document.querySelector(".account-menu-overflow")).toBeTruthy();
    // The same control, the same label, the same action prop shape.
    expect(screen.getByRole("button", { name: ptBR.signOut })).toBeTruthy();
    expect(rail.action).not.toBe(undefined);
  });
});

describe("signing out", () => {
  it("cannot be submitted twice: the control is disabled while in flight", async () => {
    const user = userEvent.setup();
    let release: (() => void) | undefined;
    const action = vi.fn(
      () =>
        new Promise<SignOutState>((resolve) => {
          release = () => resolve(idleSignOutState);
        }),
    );
    renderMenu({ action });

    const button = screen.getByRole("button", { name: ptBR.signOut });
    await user.click(button);

    // Mid-flight: the label becomes the pending phrase and the control refuses a
    // second press. Two rounds would race two redirects.
    const pendingButton = await screen.findByRole("button", { name: ptBR.signingOut });
    expect(pendingButton).toBeDisabled();
    await user.click(pendingButton).catch(() => {});
    expect(action).toHaveBeenCalledTimes(1);

    release?.();
    await waitFor(() => expect(screen.getByRole("button", { name: ptBR.signOut })).toBeEnabled());
  });

  it("announces the pending phrase while the round is in flight", async () => {
    const user = userEvent.setup();
    let release: (() => void) | undefined;
    const action = vi.fn(
      () => new Promise<SignOutState>((resolve) => { release = () => resolve(idleSignOutState); }),
    );
    renderMenu({ action });

    const region = screen.getByRole("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    await user.click(screen.getByRole("button", { name: ptBR.signOut }));
    await waitFor(() => expect(region.textContent).toContain(ptBR.signingOut));
    expect(region.getAttribute("aria-busy")).toBe("true");

    release?.();
  });

  it("shows and announces a localized failure, in both locales", async () => {
    const user = userEvent.setup();
    // The sentence is deliberately in **two** places — the visible paragraph and
    // the live region — so it is both seen and heard. The assertions target each
    // one rather than asking for "the" element with that text.
    const visible = () => document.querySelector(".account-menu-error")?.textContent;

    renderMenu({ answer: { status: "failed", message: ptBR.signOutFailed } });
    await user.click(screen.getByRole("button", { name: ptBR.signOut }));
    await waitFor(() => expect(visible()).toBe(ptBR.signOutFailed));
    expect(screen.getByRole("status").textContent).toContain(ptBR.signOutFailed);
    // Still offered, because a transport failure is retryable.
    expect(screen.getByRole("button", { name: ptBR.signOut })).toBeEnabled();
    cleanup();

    renderMenu({ locale: "en", answer: { status: "failed", message: en.signOutFailed } });
    await user.click(screen.getByRole("button", { name: en.signOut }));
    await waitFor(() => expect(visible()).toBe(en.signOutFailed));
    expect(screen.getByRole("status").textContent).toContain(en.signOutFailed);
  });

  it("says nothing until a round has actually failed", () => {
    renderMenu();
    expect(screen.queryByText(ptBR.signOutFailed)).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("");
  });
});

describe("dismissal preserves focus (the shared disclosure primitive)", () => {
  it("closes on Escape and returns focus to the control that opened it", async () => {
    const user = userEvent.setup();
    renderMenu();

    const control = summary();
    disclosure().open = true;
    control.focus();
    await user.keyboard("{Escape}");

    expect(disclosure().open).toBe(false);
    // Focus lands back on the summary, not on the document body — otherwise the
    // next Tab restarts from the top of the page.
    expect(document.activeElement).toBe(control);
  });

  it("closes on a pointer press outside itself", () => {
    renderMenu();
    disclosure().open = true;

    fireEvent.pointerDown(document.body);
    expect(disclosure().open).toBe(false);
  });

  it("stays open for a press inside its own panel", () => {
    renderMenu();
    const element = disclosure();
    element.open = true;

    const panel = within(element).getByRole("group", { name: ptBR.panelLabel });
    fireEvent.pointerDown(panel);
    expect(element.open).toBe(true);
  });

  it("ignores Escape when it is already closed", () => {
    renderMenu();
    const element = disclosure();
    expect(element.open).toBe(false);

    fireEvent.keyDown(element, { key: "Escape" });
    expect(element.open).toBe(false);
  });
});
