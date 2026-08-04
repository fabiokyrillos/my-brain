import { describe, expect, it } from "vitest";
import { authErrorMessage } from "./flow";
import { resolveConfiguredOrigin } from "./signup-policy";
import { locales } from "@/lib/preferences";

/**
 * SH-ORIGIN-001 — a deployment missing `APP_ORIGIN` must refuse, not crash.
 *
 * ## Why this test exists
 *
 * It was found in production, not in review. PR #82 replaced the request-`Origin`
 * read with a configured origin that **throws** when unset, and the Vercel
 * production deployment had no `APP_ORIGIN`. The result was that password
 * recovery returned a bare 500: the user saw "A server error occurred", and
 * nothing declared reached the operator.
 *
 * Refusing to guess an origin is the security property and it is unchanged.
 * Crashing was never part of it. The resolver still throws — that is the honest
 * signal for a caller that must decide — and `authOrigin()` in `actions.ts`
 * converts it into a declared error code so no mail is attempted and the reader
 * gets a sentence.
 */

describe("a missing APP_ORIGIN is a refusal, not a crash", () => {
  it("still throws from the resolver, so the caller must decide", () => {
    // The resolver is deliberately strict. Softening THIS would reintroduce
    // guessing; the graceful handling belongs at the call site.
    expect(() => resolveConfiguredOrigin(undefined, "production")).toThrow();
  });

  it("has a declared error code with copy in every locale", () => {
    for (const locale of locales) {
      const message = authErrorMessage("auth-misconfigured", locale);
      expect(message.trim()).not.toBe("");
      // Must not be the generic fallback: an operator-visible misconfiguration
      // that reads like every other failure is one nobody will act on.
      expect(message).not.toBe(authErrorMessage("some-unknown-code", locale));
    }
  });

  it("names no environment variable to the reader", () => {
    // The person reading it cannot fix it. Naming internals to someone who
    // cannot act on them is just a smaller stack trace.
    for (const locale of locales) {
      const message = authErrorMessage("auth-misconfigured", locale);
      expect(message).not.toContain("APP_ORIGIN");
      expect(message).not.toMatch(/[A-Z_]{6,}/);
    }
  });

  it("is distinguishable from an ordinary send failure", () => {
    for (const locale of locales) {
      expect(authErrorMessage("auth-misconfigured", locale)).not.toBe(
        authErrorMessage("recovery-failed", locale),
      );
    }
  });
});
