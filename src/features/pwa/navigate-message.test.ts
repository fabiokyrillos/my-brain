/**
 * The message a service worker sends an open page, and why it is re-validated.
 *
 * `public/sw.js` resolves a path from the notification and, when it cannot
 * navigate the page itself, hands that path to the page. The page then performs
 * the navigation — which makes the message an **untrusted boundary** in the
 * sense this repository means it, even though the sender is our own worker.
 *
 * Next's own documentation for `useRouter` states the stake plainly: *"You must
 * not send untrusted or unsanitized URLs to `router.push` or `router.replace`,
 * as this can open your site to cross-site scripting (XSS) vulnerabilities. For
 * example, `javascript:` URLs sent to `router.push` or `router.replace` will be
 * executed in the context of your page."* So the parser below is load-bearing,
 * not ceremony, and the refusals are asserted one by one.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { NAVIGATE_MESSAGE_TYPE, parseNavigateMessage } from "./navigate-message";

const REPO = path.join(__dirname, "..", "..", "..");
const WORKER = readFileSync(path.join(REPO, "public", "sw.js"), "utf8");

const ID = "3f1a9c22-5d41-4c0e-9b77-2a6d8e0f41bc";

describe("parseNavigateMessage accepts only a path inside the owner's app", () => {
  it("accepts the item paths the worker actually builds", () => {
    for (const destination of [
      `/pt-BR/app/work/${ID}`,
      `/pt-BR/app/reminders/${ID}`,
      "/pt-BR/app/reminders",
      "/en/app/notifications",
      "/en/app",
    ]) {
      expect(parseNavigateMessage({ type: NAVIGATE_MESSAGE_TYPE, destination })).toBe(destination);
    }
  });

  it("refuses a javascript: payload, which the framework warns executes on push", () => {
    expect(parseNavigateMessage({ type: NAVIGATE_MESSAGE_TYPE, destination: "javascript:alert(1)" })).toBeNull();
  });

  it("refuses another origin, however it is dressed", () => {
    for (const destination of [
      "https://evil.test/pt-BR/app",
      "//evil.test/pt-BR/app",
      "/\\evil.test/pt-BR/app",
      "mailto:someone@evil.test",
    ]) {
      expect(parseNavigateMessage({ type: NAVIGATE_MESSAGE_TYPE, destination })).toBeNull();
    }
  });

  it("refuses a route outside the authenticated tree", () => {
    for (const destination of ["/pt-BR/auth/login", "/pt-BR", "/app/reminders", "/zz-ZZ/app"]) {
      expect(parseNavigateMessage({ type: NAVIGATE_MESSAGE_TYPE, destination })).toBeNull();
    }
  });

  it("refuses a message that is not this message", () => {
    expect(parseNavigateMessage({ type: "something-else", destination: "/pt-BR/app" })).toBeNull();
    expect(parseNavigateMessage({ destination: "/pt-BR/app" })).toBeNull();
  });

  it("refuses a destination that is not a string, and a message that is not an object", () => {
    for (const destination of [7, null, undefined, {}, ["/pt-BR/app"]]) {
      expect(parseNavigateMessage({ type: NAVIGATE_MESSAGE_TYPE, destination })).toBeNull();
    }
    for (const data of [null, undefined, "navigate", 7, []]) {
      expect(parseNavigateMessage(data)).toBeNull();
    }
  });
});

describe("the worker and the page agree on the message", () => {
  /**
   * `public/sw.js` is a classic script in `public/`. It cannot import this
   * module, so the type string exists twice — and two copies of a contract
   * drift unless something fails when they disagree. This is that something.
   */
  it("spells the same type string in public/sw.js", () => {
    expect(WORKER, "public/sw.js no longer sends the type the page listens for")
      .toContain(`"${NAVIGATE_MESSAGE_TYPE}"`);
  });

  it("sends it from the handover helper, which the click handler calls", () => {
    const helper = WORKER.slice(WORKER.indexOf("function askOpenPageToNavigate"));
    expect(helper.slice(0, helper.indexOf("\n}")), "the type string left the handover helper")
      .toContain(NAVIGATE_MESSAGE_TYPE);
    const click = WORKER.slice(WORKER.indexOf('addEventListener("notificationclick"'));
    expect(click, "the click handler no longer hands the path over")
      .toContain("askOpenPageToNavigate(existing, destination)");
  });
});
