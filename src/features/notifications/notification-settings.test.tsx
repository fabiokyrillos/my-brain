import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { notificationConsentStates } from "@/features/product-analytics/contracts";

import { getNotificationSettingsCopy } from "./copy";
import { NotificationSettings } from "./notification-settings";

/**
 * The Server Action module is mocked, and that is the correct boundary rather
 * than a convenience.
 *
 * `actions.ts` is `"use server"` and imports the Supabase server client, which
 * imports `server-only` — a module whose entire job is to throw when a client
 * bundle reaches it. In jsdom the whole component tree is a client bundle, so
 * importing the real module fails at import time and takes the file with it.
 *
 * The predecessor test dodged this with a computed `vi.importActual` path and a
 * `.catch(() => ({}))`, and that shape is worse than it looks: when the import
 * failed the fallback was `{}`, every assertion was skipped, and the suite
 * reported green while testing nothing. This repository has already paid for one
 * of those. Mocking the module names the boundary instead — the actions have
 * their own tests, and what is under test here is what the surface RENDERS.
 */
vi.mock("./actions", () => ({
  registerPushSubscription: vi.fn(),
  revokePushConsent: vi.fn(),
  reportPushConsentState: vi.fn(),
  updateNotificationPreferences: vi.fn(),
}));

/**
 * The governance surface, retargeted from 2M.4a's contract to 2M.4b's.
 *
 * ## What changed, and why the old assertions were right when they were written
 *
 * Slice 2M.4a shipped this surface with **no controls at all**, and its tests
 * asserted exactly that: zero buttons, zero inputs, zero selects. That was not a
 * placeholder — it was `R-24` being obeyed. A control whose value nothing reads
 * is the defect slice 2M.0's audit of five inert scheduling preferences was
 * about, and 2M.4a had no consent record behind it, so a switch would have
 * changed nothing.
 *
 * 2M.4b built the consumer. `begin_push_delivery` now reads every one of these
 * values before it sends, so the controls have earned their existence and the
 * old assertion has become false in the direction the plan intended. Retargeted
 * rather than deleted: the same requirement, `R-24`, is still what is being
 * tested — the tests below assert that a control appears **only** where
 * something reads it, which is why the no-key and non-granted cases still assert
 * an absence.
 *
 * ## The prompt is still asserted absent at render
 *
 * `2M-NOTIFY-003` survives 2M.4b unchanged: the browser prompt may be raised
 * only after an explicit user action. Rendering is not an action, so the test
 * below fails the build if `Notification.requestPermission` is reached during a
 * render of any state.
 */

const copy = getNotificationSettingsCopy("en");

/** A real 65-byte P-256 point, base64url — what `decodeVapidPublicKey` accepts. */
const PUSH_PUBLIC_KEY =
  "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";

type Overrides = Partial<React.ComponentProps<typeof NotificationSettings>>;

function mount(overrides: Overrides = {}) {
  return render(
    <NotificationSettings
      locale="en"
      state="unsupported"
      pushPublicKey={PUSH_PUBLIC_KEY}
      enabledTypes={["reminder", "follow_up", "review", "digest"]}
      frequency="immediate"
      quietStart="22:30"
      quietEnd="07:00"
      dailyCap={3}
      {...overrides}
    />,
  );
}

const requestPermission = vi.fn();

beforeEach(() => {
  requestPermission.mockReset();
  vi.stubGlobal("Notification", { requestPermission, permission: "default" });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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

  it("raises no browser prompt while merely rendering, in any state", () => {
    // The requirement's actual claim. A prompt on load is the failure mode
    // `2M-NOTIFY-003` exists for, and a denial is sticky and often unrecoverable
    // without the user digging through browser settings (T-07) — so this is the
    // one assertion in the file that must survive every future redesign.
    for (const state of notificationConsentStates) {
      cleanup();
      mount({ state });
      expect(requestPermission, state).not.toHaveBeenCalled();
    }
  });

  it("puts the benefit and the content promise ABOVE the control that prompts", () => {
    // "only after the benefit has been explained on that same surface" is an
    // ordering claim, so it is asserted as one rather than by both being
    // present somewhere on the page.
    const { container } = mount({ state: "unsupported" });
    const text = container.textContent ?? "";
    const button = screen.getByRole("button").textContent ?? "";
    expect(text.indexOf(copy.benefit)).toBeLessThan(text.indexOf(button));
    expect(text.indexOf(copy.contentPromise)).toBeLessThan(text.indexOf(button));
  });
});

describe("R-24: a control appears only where something reads it", () => {
  it("offers no control at all when the deployment has no VAPID public key", () => {
    /*
     * The state the owner's environment was in until the key was set. A button
     * here would raise a prompt whose grant produces a subscription nothing can
     * ever deliver to — consent the product cannot honour — so the surface says
     * so instead.
     */
    const { container } = mount({ pushPublicKey: null });
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelectorAll("input")).toHaveLength(0);
    expect(screen.getByText(copy.notAvailableYet)).toBeTruthy();
  });

  it("offers the enable control once a key is configured", () => {
    // The positive control for the assertion above: without it, that test would
    // also pass against a surface that renders no control under any condition.
    mount({ state: "unsupported" });
    expect(screen.getByRole("button").textContent).toBe(copy.enableAction);
  });

  it("renders no preference control until consent is granted", () => {
    // Type, frequency, quiet hours and the cap are read by `begin_push_delivery`
    // AFTER it has checked consent, so under any other state they are controls
    // whose value nothing reaches.
    for (const state of ["unsupported", "denied", "revoked", "expired"] as const) {
      cleanup();
      const { container } = mount({ state });
      expect(container.querySelectorAll("input"), state).toHaveLength(0);
      expect(container.querySelectorAll("fieldset"), state).toHaveLength(0);
    }
  });

  it("renders every preference control under a granted consent", () => {
    const { container } = mount({ state: "granted" });
    expect(container.querySelectorAll('input[name="notificationType"]')).toHaveLength(4);
    expect(container.querySelectorAll('input[name="notificationFrequency"]')).toHaveLength(3);
    expect(container.querySelector('input[name="quietStart"]')?.getAttribute("value")).toBe("22:30");
    expect(container.querySelector('input[name="quietEnd"]')?.getAttribute("value")).toBe("07:00");
    expect(container.querySelector('input[name="dailyCap"]')?.getAttribute("value")).toBe("3");
    expect(screen.getByText(copy.disableAction)).toBeTruthy();
  });

  it("bounds the daily cap control to the column's own range", () => {
    // `agent_preferences.max_followups_per_day` is a smallint checked 0..20, and
    // the control must not offer a value the database would refuse.
    const { container } = mount({ state: "granted" });
    const cap = container.querySelector('input[name="dailyCap"]');
    expect(cap?.getAttribute("min")).toBe("0");
    expect(cap?.getAttribute("max")).toBe("20");
  });

  it("reflects the persisted types rather than defaulting them on", () => {
    // A surface that showed everything checked regardless would be a default-on
    // by rendering, and the user's muted types would silently reappear.
    const { container } = mount({ state: "granted", enabledTypes: ["reminder"] });
    const checked = [...container.querySelectorAll<HTMLInputElement>('input[name="notificationType"]')]
      .filter((input) => input.checked)
      .map((input) => input.value);
    expect(checked).toEqual(["reminder"]);
  });
});

describe("2M-NOTIFY-010: five states, five sentences, announced", () => {
  it("renders a distinct sentence for each state", () => {
    const seen = new Set<string>();
    for (const state of notificationConsentStates) {
      cleanup();
      mount({ state });
      const node = screen.getAllByRole("status")[0];
      expect(node.getAttribute("data-consent-state"), state).toBe(state);
      expect(node.textContent, state).toBe(copy.states[state]);
      seen.add(node.textContent ?? "");
    }
    expect(seen.size, "two states share a sentence").toBe(notificationConsentStates.length);
  });

  it("tells a denied user the app cannot ask again, and offers no way to try", () => {
    mount({ state: "denied" });
    expect(screen.getAllByRole("status")[0].textContent).toMatch(/cannot ask again/i);
    // The browser will not prompt again, so an enabled button would be a control
    // that cannot do what it says.
    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(true);
  });

  it("tells an unsupported iOS user what the missing step is", () => {
    // The one actionable thing in the `unsupported` case, and a user would never
    // guess it: iOS only offers web push to an installed home-screen app.
    mount({ state: "unsupported" });
    expect(screen.getAllByRole("status")[0].textContent).toMatch(/home screen/i);
  });

  it("distinguishes revoked from denied in what it offers", () => {
    mount({ state: "revoked" });
    const revoked = screen.getAllByRole("status")[0].textContent ?? "";
    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(false);
    cleanup();
    mount({ state: "denied" });
    const denied = screen.getAllByRole("status")[0].textContent ?? "";
    expect(revoked).not.toBe(denied);
    expect(revoked).toMatch(/allow it again/i);
  });
});

describe("2M-NOTIFY-008: content stays where it already is", () => {
  it("says the in-app rows remain the place with content", () => {
    mount();
    expect(screen.getByText(copy.inAppNote)).toBeTruthy();
  });

  it("renders no record title, count or date anywhere on the surface", () => {
    // The structural half. This surface governs notifications; it must not
    // become a second place that shows what they are about.
    const { container } = mount({ state: "granted" });
    expect(container.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe("i18n: both locales, no ternary in the component", () => {
  it("renders the Portuguese copy for pt-BR", () => {
    mount({ locale: "pt-BR", state: "granted" });
    const portuguese = getNotificationSettingsCopy("pt-BR");
    expect(screen.getByText(portuguese.benefit)).toBeTruthy();
    expect(screen.getByText(portuguese.disableAction)).toBeTruthy();
  });

  it("labels its region, so it appears in the page outline", () => {
    mount();
    expect(screen.getByRole("region", { name: copy.heading })).toBeTruthy();
  });

  it("gives every preference group a legend a screen reader can announce", () => {
    // `2M-ACCESS-004`. A fieldset without a legend is a group a screen-reader
    // user reaches with no idea what it groups.
    const { container } = mount({ state: "granted" });
    const legends = [...container.querySelectorAll("fieldset")].map(
      (fieldset) => fieldset.querySelector("legend")?.textContent,
    );
    expect(legends).toEqual([copy.typesHeading, copy.frequencyHeading, copy.quietHeading]);
  });
});
