import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ONBOARDING_DISMISSAL_COOKIE,
  ONBOARDING_DISMISSAL_MAX_AGE,
  ONBOARDING_DISMISSED_VALUE,
  dismissalCookieOptions,
  isDismissedValue,
} from "./dismissal";

/**
 * `2O-ONBOARD-010`, and the boundary rule it inherits.
 *
 * A cookie is whatever the client sends, so this is a validated untrusted
 * boundary in the sense `docs/ENGINEERING_STANDARDS.md` means. It recognises
 * one value rather than sanitising a family of them, which is the shape
 * `safeReturnPath` took in slice 2O.1 for the same reason: a recogniser has one
 * accepting path and a sanitiser has as many as its author thought of.
 */

describe("only one value means dismissed", () => {
  it("accepts exactly the declared value", () => {
    expect(isDismissedValue(ONBOARDING_DISMISSED_VALUE)).toBe(true);
  });

  it("refuses everything else, including the things a lenient parser would take", () => {
    const refused = [
      undefined,
      null,
      "",
      " ",
      "true",
      "1",
      "yes",
      "DISMISSED",
      "Dismissed",
      " dismissed",
      "dismissed ",
      "dismissed=1",
      "dismissed;path=/",
      '"dismissed"',
      "dismissedx",
      "xdismissed",
    ];
    for (const value of refused) {
      expect(isDismissedValue(value), `${JSON.stringify(value)} was accepted`).toBe(false);
    }
  });

  it("fails toward offering the path rather than toward hiding it", () => {
    // The direction is the decision. An offer shown to somebody who dismissed
    // it is noise; an offer withheld from somebody who never dismissed it is a
    // capability that silently disappeared.
    expect(isDismissedValue("corrupted")).toBe(false);
  });
});

describe("the cookie is scoped so nothing in the browser can forge or read it", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is http-only, same-site and site-wide", () => {
    const options = dismissalCookieOptions();
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
    expect(options.maxAge).toBe(ONBOARDING_DISMISSAL_MAX_AGE);
  });

  it("is secure in production and reachable over plain HTTP everywhere else", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(dismissalCookieOptions().secure).toBe(true);
    vi.stubEnv("NODE_ENV", "test");
    expect(dismissalCookieOptions().secure).toBe(false);
  });

  it("carries a name that cannot collide with the session cookies", () => {
    expect(ONBOARDING_DISMISSAL_COOKIE.startsWith("sb-")).toBe(false);
    expect(ONBOARDING_DISMISSAL_COOKIE).toMatch(/^[a-z0-9_]+$/);
  });
});
