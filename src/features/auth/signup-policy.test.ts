import { describe, expect, it } from "vitest";
import { readSignupGate, resolveConfiguredOrigin } from "./signup-policy";

/**
 * SH-SIGNUP-001 and SH-ORIGIN-001.
 *
 * Both functions are pure so that "everything that means closed" and
 * "production without a configured origin throws" can be tables rather than
 * claims in a comment — and so neither needs a running server to pin.
 */

describe("the signup gate defaults closed (SH-SIGNUP-001)", () => {
  it("is open for exactly one value", () => {
    expect(readSignupGate("true")).toEqual({ open: true });
  });

  // The whole point: a gate that opened on anything loosely truthy is a gate
  // that opens by accident. Every one of these is a value somebody could
  // plausibly type meaning "on".
  it.each([
    "TRUE",
    "True",
    " true",
    "true ",
    "1",
    "yes",
    "on",
    "enabled",
    "false",
    "0",
    "no",
    "off",
  ])("is closed for %o", (value) => {
    expect(readSignupGate(value).open).toBe(false);
  });

  it("is closed when unset, and says it was never configured", () => {
    expect(readSignupGate(undefined)).toEqual({ open: false, reason: "not_configured" });
  });

  it("is closed when blank, and says it was never configured", () => {
    expect(readSignupGate("   ")).toEqual({ open: false, reason: "not_configured" });
  });

  it("distinguishes an absent setting from a deliberate off", () => {
    // Not cosmetic: "nobody configured this" and "somebody turned it off" are
    // different operational facts, and the rollout gate reads the difference.
    // Asserting the whole object also proves the union stays discriminated —
    // an `open: true` carrying a reason would defeat the narrowing callers use.
    expect(readSignupGate("false")).toEqual({ open: false, reason: "explicitly_disabled" });
    expect(readSignupGate(undefined)).toEqual({ open: false, reason: "not_configured" });
  });
});

describe("the auth origin is configured, never derived from a request (SH-ORIGIN-001)", () => {
  it("uses the configured origin when set", () => {
    expect(resolveConfiguredOrigin("https://app.example.com", "production")).toBe(
      "https://app.example.com",
    );
  });

  it("keeps only the origin, discarding any path", () => {
    // A configured path would silently prefix every callback URL.
    expect(resolveConfiguredOrigin("https://app.example.com/some/path", "production")).toBe(
      "https://app.example.com",
    );
  });

  it("throws in production when unset, rather than guessing a host", () => {
    // Guessing puts a link to the wrong host inside a mail a real user opens.
    expect(() => resolveConfiguredOrigin(undefined, "production")).toThrow(/APP_ORIGIN is required/);
    expect(() => resolveConfiguredOrigin("  ", "production")).toThrow(/APP_ORIGIN is required/);
  });

  it("falls back to the documented dev origin outside production", () => {
    expect(resolveConfiguredOrigin(undefined, "development")).toBe("http://localhost:3000");
    expect(resolveConfiguredOrigin(undefined, "test")).toBe("http://localhost:3000");
  });

  it("refuses a non-https origin for a real host", () => {
    expect(() => resolveConfiguredOrigin("http://app.example.com", "production")).toThrow(
      /must be https/,
    );
  });

  it("allows http for localhost, which is the only unambiguous case", () => {
    expect(resolveConfiguredOrigin("http://localhost:3000", "development")).toBe(
      "http://localhost:3000",
    );
    expect(resolveConfiguredOrigin("http://127.0.0.1:3000", "development")).toBe(
      "http://127.0.0.1:3000",
    );
  });

  it("refuses a value that is not an absolute URL", () => {
    expect(() => resolveConfiguredOrigin("app.example.com", "production")).toThrow(/valid absolute/);
  });
});
