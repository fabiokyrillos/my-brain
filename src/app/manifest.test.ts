/**
 * The installed app's scope.
 *
 * Without a `scope` key the Web App Manifest specification says to assume the
 * directory of `start_url` — and with `start_url: "/pt-BR/app"` that directory
 * is `/pt-BR/`. iOS does not navigate outside an installed app's scope: it
 * hands the URL to an embedded browser with its own cookie store. So the whole
 * English product, and every path without a locale prefix, sat outside the
 * installed app and arrived there signed out.
 *
 * The owner met this on hardware: a notification tap went to the unprefixed
 * `/app/notifications`, opened in something that looked like a browser inside
 * the app, and asked for a password that the app itself still had.
 */

import { describe, expect, it } from "vitest";

import manifest from "./manifest";

describe("the installed app's scope", () => {
  it("is declared rather than inherited from start_url", () => {
    expect(manifest().scope).toBe("/");
  });

  it("contains both locales and the unprefixed destinations", () => {
    const { scope } = manifest();
    expect(typeof scope).toBe("string");
    for (const path of ["/pt-BR/app", "/en/app", "/app/reminders", "/app/notifications"]) {
      expect(path.startsWith(String(scope)), `${path} fell outside the scope`).toBe(true);
    }
  });

  it("keeps start_url inside its own scope", () => {
    const { scope, start_url: startUrl } = manifest();
    expect(typeof startUrl).toBe("string");
    expect(String(startUrl).startsWith(String(scope))).toBe(true);
  });
});
