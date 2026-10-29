/**
 * The page half of the notification tap.
 *
 * On 2026-10-29 an authorized push was delivered to the owner's iPhone with the
 * app already open, and the tap *focused the app without going anywhere*. The
 * worker had resolved the right path; `WindowClient.navigate()` rejected, and
 * the fallback focused the window and discarded the path. This component is the
 * other side of the repair: the worker hands the path over, and the page
 * navigates.
 *
 * The listener is asserted through the real `navigator.serviceWorker` seam
 * rather than by calling the handler directly, because the defect being fixed
 * was precisely a handoff that nothing exercised end to end.
 */

import { render, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pushed: string[] = [];
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: (href: string) => pushed.push(href) }) }));

import { NAVIGATE_MESSAGE_TYPE } from "./navigate-message";
import { NavigateOnNotificationTap } from "./navigate-on-notification-tap";

const ID = "3f1a9c22-5d41-4c0e-9b77-2a6d8e0f41bc";

/** jsdom has no service worker container, so the seam is fabricated. */
function installContainer() {
  const listeners = new Map<string, EventListener>();
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      addEventListener: (type: string, listener: EventListener) => listeners.set(type, listener),
      removeEventListener: (type: string, listener: EventListener) => {
        if (listeners.get(type) === listener) listeners.delete(type);
      },
    },
  });
  return listeners;
}

let listeners: Map<string, EventListener>;

beforeEach(() => {
  pushed.length = 0;
  listeners = installContainer();
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator as unknown as Record<string, unknown>, "serviceWorker");
});

function deliver(data: unknown) {
  const listener = listeners.get("message");
  expect(listener, "the component never subscribed to the worker").toBeTypeOf("function");
  listener!({ data } as unknown as Event);
}

describe("NavigateOnNotificationTap", () => {
  it("navigates to the item the worker named", () => {
    render(<NavigateOnNotificationTap />);
    deliver({ type: NAVIGATE_MESSAGE_TYPE, destination: `/pt-BR/app/work/${ID}` });
    expect(pushed).toEqual([`/pt-BR/app/work/${ID}`]);
  });

  it("navigates for a reminder with no task, the other branch", () => {
    render(<NavigateOnNotificationTap />);
    deliver({ type: NAVIGATE_MESSAGE_TYPE, destination: `/pt-BR/app/reminders/${ID}` });
    expect(pushed).toEqual([`/pt-BR/app/reminders/${ID}`]);
  });

  it("navigates nowhere for a destination outside the owner's app", () => {
    render(<NavigateOnNotificationTap />);
    for (const destination of ["javascript:alert(1)", "https://evil.test", "//evil.test", "/pt-BR/auth/login"]) {
      deliver({ type: NAVIGATE_MESSAGE_TYPE, destination });
    }
    expect(pushed, "a refused destination must not reach the router").toEqual([]);
  });

  it("ignores a message that is not this message", () => {
    render(<NavigateOnNotificationTap />);
    deliver({ type: "other", destination: "/pt-BR/app" });
    deliver("navigate");
    deliver(null);
    expect(pushed).toEqual([]);
  });

  it("unsubscribes on unmount, so a remounted page does not navigate twice", () => {
    const view = render(<NavigateOnNotificationTap />);
    view.unmount();
    expect(listeners.has("message"), "the listener outlived the component").toBe(false);
  });

  it("renders nothing", () => {
    const { container } = render(<NavigateOnNotificationTap />);
    expect(container.innerHTML).toBe("");
  });

  it("does not throw where the browser has no service worker at all", () => {
    Reflect.deleteProperty(navigator as unknown as Record<string, unknown>, "serviceWorker");
    expect(() => render(<NavigateOnNotificationTap />)).not.toThrow();
  });
});
