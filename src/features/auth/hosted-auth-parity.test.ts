import { describe, expect, it } from "vitest";
import {
  DEVELOPMENT_ORIGIN,
  INTENDED_HOSTED_AUTH,
  PRODUCTION_ORIGIN,
  redirectAllowList,
} from "./hosted-auth-posture";
import * as script from "../../../scripts/hosted-auth-config.mjs";

/**
 * SH-GD.1 — the two statements of the intended hosted posture may not drift.
 *
 * `hosted-auth-posture.ts` is the application-side truth, generated from
 * `buildAuthCallbackUrl` so the allow list cannot disagree with the URLs the
 * Server Actions actually ask the provider to redirect to.
 * `scripts/hosted-auth-config.mjs` restates it in plain JavaScript because a
 * node script cannot import TypeScript.
 *
 * Same arrangement as `extraction-parity.test.ts` and `version-parity.test.ts`:
 * duplication is allowed, drift is not. The failure this prevents is a hosted
 * allow list that no longer contains the callback URL the product sends, which
 * only shows up as a broken link inside a real email.
 */

describe("hosted auth posture parity (SH-GD.1)", () => {
  it("agrees on both origins", () => {
    expect(script.PRODUCTION_ORIGIN).toBe(PRODUCTION_ORIGIN);
    expect(script.DEVELOPMENT_ORIGIN).toBe(DEVELOPMENT_ORIGIN);
  });

  it("generates an identical redirect allow list", () => {
    expect(script.redirectAllowList()).toEqual(redirectAllowList());
  });

  it("declares an identical intended configuration", () => {
    expect(script.INTENDED_HOSTED_AUTH).toEqual({ ...INTENDED_HOSTED_AUTH });
  });
});

describe("the redirect allow list is bounded (SH-ORIGIN-001)", () => {
  const list = redirectAllowList();

  it("contains no wildcard", () => {
    // "Do not add a broad wildcard merely for convenience." Every entry is an
    // exact URL, so the list can only ever permit what it enumerates.
    for (const entry of list) {
      expect(entry).not.toContain("*");
    }
  });

  it("contains only the production origin and localhost", () => {
    for (const entry of list) {
      const origin = new URL(entry).origin;
      expect([PRODUCTION_ORIGIN, DEVELOPMENT_ORIGIN]).toContain(origin);
    }
  });

  it("admits no preview deployment host", () => {
    // A Vercel preview URL in the production allow list would let any branch
    // deployment receive a real auth token.
    for (const entry of list) {
      expect(entry).not.toMatch(/-git-|vercel\.app.*-[a-z0-9]{9}/);
    }
  });

  it("covers every locale and every post-auth destination", () => {
    for (const locale of ["pt-BR", "en"]) {
      expect(list.some((u) => u.includes(`/${locale}/auth/callback`))).toBe(true);
      expect(list.some((u) => u.includes(encodeURIComponent(`/${locale}/app`)))).toBe(true);
      expect(list.some((u) => u.includes(encodeURIComponent(`/${locale}/auth/reset`)))).toBe(true);
    }
  });

  it("emits both the bare callback and the next-bearing forms", () => {
    // Providers differ on whether the query string participates in matching.
    // An over-narrow list fails only inside a real email, so both are listed;
    // every entry is exact, so the extra ones widen nothing.
    expect(list).toContain(`${PRODUCTION_ORIGIN}/pt-BR/auth/callback`);
    expect(list.some((u) => u.startsWith(`${PRODUCTION_ORIGIN}/pt-BR/auth/callback?next=`))).toBe(
      true,
    );
  });

  it("keeps the production origin https", () => {
    expect(PRODUCTION_ORIGIN.startsWith("https://")).toBe(true);
  });
});

describe("the intended posture keeps signup shut", () => {
  it("disables registration while keeping the email provider enabled", () => {
    // The distinction the CI failure taught: disabling the provider breaks
    // sign-IN. Registration is closed by disable_signup, globally.
    expect(INTENDED_HOSTED_AUTH.disable_signup).toBe(true);
    expect(INTENDED_HOSTED_AUTH.external_email_enabled).toBe(true);
  });

  it("keeps email confirmation required and anonymous sign-ins off", () => {
    expect(INTENDED_HOSTED_AUTH.mailer_autoconfirm).toBe(false);
    expect(INTENDED_HOSTED_AUTH.external_anonymous_users_enabled).toBe(false);
  });

  it("asserts an opinion about only a small, reviewable set of fields", () => {
    // The live readback returns 242 fields. Naming more than the initiative has
    // decided is how a targeted update becomes a whole-file push by degrees.
    expect(Object.keys(INTENDED_HOSTED_AUTH).length).toBeLessThanOrEqual(8);
  });
});
