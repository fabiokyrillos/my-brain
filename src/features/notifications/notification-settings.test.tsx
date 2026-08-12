import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { notificationConsentStates } from "@/features/product-analytics/contracts";

import { getNotificationSettingsCopy } from "./copy";

type ViewModule = { NotificationSettings?: (props: Record<string, unknown>) => React.ReactNode };

const modulePath = `./${"notification-settings"}.tsx`;
const view = await vi.importActual<ViewModule>(modulePath).catch(() => ({})) as ViewModule;

afterEach(cleanup);

const copy = getNotificationSettingsCopy("en");

function mount(state: string = "unsupported", locale = "en") {
  expect(view.NotificationSettings).toBeTypeOf("function");
  const NotificationSettings = view.NotificationSettings!;
  return render(<NotificationSettings locale={locale} state={state} />);
}

describe("2M-NOTIFY-003: the benefit is explained and nothing is asked", () => {
  it("explains what push would do and what it would not carry", () => {
    mount();
    expect(screen.getByText(copy.benefit)).toBeTruthy();
    expect(screen.getByText(copy.contentPromise)).toBeTruthy();
  });

  it("states that nothing will be asked until the user asks", () => {
    mount();
    expect(screen.getByText(copy.noPromptYet)).toBeTruthy();
  });

  it("offers no control at all, because none has a consumer yet", () => {
    // `R-24`. A switch here would change nothing until migration 2 exists, and a
    // control that changes nothing is what slice 2M.0's audit of the five inert
    // preferences was about.
    const { container } = mount();
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelectorAll("input")).toHaveLength(0);
    expect(container.querySelectorAll("select")).toHaveLength(0);
    expect(screen.getByText(copy.notAvailableYet)).toBeTruthy();
  });
});

describe("2M-NOTIFY-010: five states, five sentences, announced", () => {
  it("renders a distinct sentence for each state", () => {
    const seen = new Set<string>();
    for (const state of notificationConsentStates) {
      cleanup();
      mount(state);
      const node = screen.getByRole("status");
      expect(node.getAttribute("data-consent-state"), state).toBe(state);
      expect(node.textContent, state).toBe(copy.states[state]);
      seen.add(node.textContent ?? "");
    }
    expect(seen.size, "two states share a sentence").toBe(notificationConsentStates.length);
  });

  it("tells a denied user the app cannot ask again", () => {
    mount("denied");
    expect(screen.getByRole("status").textContent).toMatch(/cannot ask again/i);
  });

  it("tells an unsupported iOS user what the missing step is", () => {
    // The one actionable thing in the `unsupported` case, and a user would never
    // guess it: iOS only offers web push to an installed home-screen app.
    mount("unsupported");
    expect(screen.getByRole("status").textContent).toMatch(/home screen/i);
  });

  it("distinguishes revoked from denied in what it offers", () => {
    cleanup();
    mount("revoked");
    const revoked = screen.getByRole("status").textContent ?? "";
    cleanup();
    mount("denied");
    const denied = screen.getByRole("status").textContent ?? "";
    expect(revoked).not.toBe(denied);
    expect(revoked).toMatch(/allow it again/i);
  });
});

describe("2M-NOTIFY-008: content stays where it already is", () => {
  it("says the in-app rows remain the place with content", () => {
    mount();
    expect(screen.getByText(copy.inAppNote)).toBeTruthy();
  });
});

describe("i18n: both locales, no ternary in the component", () => {
  it("renders the Portuguese copy for pt-BR", () => {
    mount("granted", "pt-BR");
    expect(screen.getByText(getNotificationSettingsCopy("pt-BR").benefit)).toBeTruthy();
  });

  it("labels its region, so it appears in the page outline", () => {
    mount();
    expect(screen.getByRole("region", { name: copy.heading })).toBeTruthy();
  });
});
