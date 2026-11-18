import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getNotificationSettingsCopy } from "./copy";
import { updateNotificationPreferences } from "./actions";
import { PushControls } from "./push-controls";

/**
 * `NOTIFY-CONSENT-STATE-IS-SERVER-ONLY` — the defect lived in the RENDER, which
 * is why the pure module's tests are not enough on their own.
 *
 * `device-reconciliation.test.ts` proves the decision. This file proves the
 * wiring: that the component reads the device at all, and that the verdict
 * reaches the screen. The original defect was one ternary —
 * `state === "granted" ? disable : enable` — so a surface whose decision
 * function was perfect would still have lied.
 *
 * The Server Action module is mocked for the reason
 * `notification-settings.test.tsx` states at length: `actions.ts` is
 * `"use server"` and reaches `server-only`, which throws inside a client
 * bundle, and jsdom is a client bundle. The actions have their own tests.
 */
vi.mock("./actions", () => ({
  registerPushSubscription: vi.fn(),
  revokePushConsent: vi.fn(),
  reportPushConsentState: vi.fn(),
  updateNotificationPreferences: vi.fn(),
}));

const copy = getNotificationSettingsCopy("en");

/** A real 65-byte P-256 point, base64url — what `decodeVapidPublicKey` accepts. */
const PUSH_PUBLIC_KEY =
  "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";

const askedForPermission = vi.fn();
let readSubscription: () => Promise<unknown>;

/**
 * jsdom has no Push API, so the component's own availability check would refuse
 * before reading anything. These stubs are what make the device facts readable
 * at all — and they are deliberately the ONLY thing standing in for a browser:
 * the subscription reader is swapped per test, nothing else is.
 */
beforeEach(() => {
  readSubscription = () => Promise.resolve(null);
  askedForPermission.mockClear();

  Object.defineProperty(window, "PushManager", { value: class {}, configurable: true });
  Object.defineProperty(window, "Notification", {
    value: { permission: "granted", requestPermission: askedForPermission },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(navigator, "serviceWorker", {
    value: {
      ready: Promise.resolve({
        pushManager: { getSubscription: () => readSubscription() },
      }),
    },
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function mount(state: "granted" | "revoked" = "granted") {
  return render(
    <PushControls
      locale="en"
      state={state}
      pushPublicKey={PUSH_PUBLIC_KEY}
      enabledTypes={["reminder"]}
      frequency="immediate"
      quietStart="22:00"
      quietEnd="07:00"
      dailyCap={3}
    />,
  );
}

describe("a granted consent is reconciled against the device", () => {
  it("offers the repair when the device holds no subscription", async () => {
    /*
     * THE REGRESSION, in the shape it was reported. Account consent granted,
     * browser permission still granted, and nothing subscribed on this device —
     * which is what the owner's reinstalled phone looked like on 2026-10-27.
     *
     * Before this change the surface rendered exactly one control, "Turn off
     * alerts on this device", and said nothing else. It asserted that alerts
     * were working while nothing could arrive.
     */
    mount();

    expect(await screen.findByText(copy.deviceSilent)).toBeTruthy();
    expect(screen.getByRole("button", { name: copy.deviceSilentAction })).toBeTruthy();

    // The old control stays reachable: the consent really is granted, and
    // turning the feature off entirely is still a thing the user may want.
    expect(screen.getByRole("button", { name: copy.disableAction })).toBeTruthy();
  });

  it("says nothing and offers no repair when the device really is subscribed", async () => {
    readSubscription = () => Promise.resolve({ endpoint: "https://example.test/x" });
    mount();

    // Awaited through the control that is present, so the assertion below runs
    // AFTER the effect settled rather than before it — the difference between
    // proving an absence and racing it.
    expect(await screen.findByRole("button", { name: copy.disableAction })).toBeTruthy();
    expect(screen.queryByText(copy.deviceSilent)).toBeNull();
    expect(screen.queryByText(copy.deviceBlocked)).toBeNull();
    expect(screen.queryByRole("button", { name: copy.deviceSilentAction })).toBeNull();
  });

  it("explains a blocked browser and offers no button it cannot honour", async () => {
    // `R-24`: a click here would resolve to `denied` again, so the sentence
    // points at the browser's own settings and no control is rendered.
    Object.defineProperty(window, "Notification", {
      value: { permission: "denied", requestPermission: askedForPermission },
      configurable: true,
      writable: true,
    });
    mount();

    expect(await screen.findByText(copy.deviceBlocked)).toBeTruthy();
    expect(screen.queryByRole("button", { name: copy.deviceSilentAction })).toBeNull();
    expect(screen.queryByText(copy.deviceSilent)).toBeNull();
  });

  it("claims nothing before the device has been read", () => {
    /*
     * Synchronous assertion on the FIRST paint, deliberately not awaited. The
     * reconciliation has not resolved yet, so neither sentence may be on screen:
     * a repair notice flashed at someone whose device is fine is its own defect,
     * and the optimistic claim is the one being fixed.
     */
    mount();
    expect(screen.queryByText(copy.deviceSilent)).toBeNull();
    expect(screen.queryByText(copy.deviceBlocked)).toBeNull();
  });
});

describe("2M-NOTIFY-003 survives the reconciliation", () => {
  it("asks the browser for nothing during a render", async () => {
    /*
     * The property this change had to not break. Reading
     * `Notification.permission` and the existing subscription raises no prompt;
     * requesting permission does, and may only follow a click. The effect now
     * runs on mount, so this assertion is what keeps that distinction real
     * rather than stated.
     */
    mount();
    expect(await screen.findByText(copy.deviceSilent)).toBeTruthy();
    expect(askedForPermission).not.toHaveBeenCalled();
  });

  it("asks for nothing on a non-granted consent either", async () => {
    mount("revoked");
    expect(await screen.findByRole("button", { name: copy.enableAction })).toBeTruthy();
    // A non-granted consent is already honest, so the device notice stays absent
    // and the existing enable control is what the user sees.
    expect(screen.queryByText(copy.deviceSilent)).toBeNull();
    expect(askedForPermission).not.toHaveBeenCalled();
  });
});

describe("the preferences are one row that opens in place (Editorial calmo, ADR-180)", () => {
  it("states the stored values on the closed row and keeps the controls off screen", () => {
    mount();
    const row = document.querySelector(".push-preferences-fact") as HTMLDetailsElement;
    const summary = row.querySelector("summary")!;
    expect(summary.textContent).toContain(copy.types.reminder);
    expect(summary.textContent).toContain(copy.frequencies.immediate);
    expect(summary.textContent).toContain("22:00");
    expect(summary.textContent).toContain("07:00");
    expect(summary.textContent).toContain("3");
    expect(screen.getByRole("button", { name: copy.savePreferences })).not.toBeVisible();
    row.open = true;
    expect(screen.getByRole("button", { name: copy.savePreferences })).toBeVisible();
  });

  it("is absent without a granted consent, like the controls it holds", () => {
    mount("revoked");
    expect(document.querySelector(".push-preferences-fact")).toBeNull();
  });

  it("sends the same five values, and reports the save beside the save", async () => {
    vi.mocked(updateNotificationPreferences).mockResolvedValue({ ok: true, state: "granted" } as never);
    mount();
    const row = document.querySelector(".push-preferences-fact") as HTMLDetailsElement;
    row.open = true;
    fireEvent.click(screen.getByLabelText(copy.types.review));
    // An unsaved draft is not what the row claims is in force.
    expect(row.querySelector("summary")!.textContent).not.toContain(copy.types.review);
    fireEvent.click(screen.getByRole("button", { name: copy.savePreferences }));

    const notice = await screen.findByText(copy.saved);
    expect(row.querySelector(".setting-fact-editor")!.contains(notice)).toBe(true);
    expect(updateNotificationPreferences).toHaveBeenCalledWith(
      { enabledTypes: ["reminder", "review"], frequency: "immediate", quietStart: "22:00", quietEnd: "07:00", dailyCap: 3 },
      "en",
    );
    expect(row.querySelector("summary")!.textContent).toContain(copy.types.review);
  });

  it("keeps a failed save's message beside the save, and the row's claim unchanged", async () => {
    vi.mocked(updateNotificationPreferences).mockResolvedValue({ ok: false } as never);
    mount();
    const row = document.querySelector(".push-preferences-fact") as HTMLDetailsElement;
    row.open = true;
    fireEvent.click(screen.getByLabelText(copy.types.review));
    fireEvent.click(screen.getByRole("button", { name: copy.savePreferences }));
    const notice = await screen.findByText(copy.saveFailed);
    expect(row.querySelector(".setting-fact-editor")!.contains(notice)).toBe(true);
    expect(row.querySelector("summary")!.textContent).not.toContain(copy.types.review);
  });
});
