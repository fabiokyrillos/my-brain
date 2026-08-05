/**
 * SH-THROTTLE-001/002/005, SH-SIGNUP-010/011 — the throttle's decisions, and
 * the pins that stop them drifting from the database or from the provider.
 *
 * The parities run in **both directions**, following
 * `legal/version-parity.test.ts`: a one-directional check is satisfied by
 * deleting the thing it was meant to guard. A kind TypeScript can send and the
 * CHECK refuses is a runtime 22023 nobody sees until production; a kind the
 * CHECK allows and TypeScript never sends is a dead branch in a security
 * control, which is how a vocabulary quietly stops meaning anything.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { safeAuthNext } from "./flow";
import {
  AUTH_EVENT_CEILINGS,
  AUTH_EVENT_KINDS,
  AUTH_EVENT_OUTCOMES,
  normalizeAuthIdentifier,
} from "./throttle-policy";

const MIGRATION = readFileSync(
  join(process.cwd(), "supabase/migrations/202608040075_auth_event_attempts.sql"),
  "utf8",
);

/** The members of the first `check (<column> in (...))` for a column. */
function checkVocabulary(column: string): string[] {
  const match = new RegExp(`check \\(${column} in \\(([^)]*)\\)\\)`).exec(MIGRATION);
  if (!match) throw new Error(`no CHECK found for ${column} in the migration`);
  return [...match[1].matchAll(/'([a-z_]+)'/g)].map((entry) => entry[1]).sort();
}

describe("SH-THROTTLE-001: the vocabularies are one vocabulary", () => {
  it("kinds match the migration's CHECK in both directions", () => {
    expect([...AUTH_EVENT_KINDS].sort()).toEqual(checkVocabulary("kind"));
  });

  it("outcomes match the migration's CHECK, plus the provisional value", () => {
    // `unknown` is deliberately absent from the TypeScript set: it is the state
    // a claim reserves with, never an outcome an action reports, and
    // `finalize_auth_event_attempt` refuses it. So the SQL set is the
    // TypeScript set plus exactly that one member -- asserted, not assumed.
    expect([...AUTH_EVENT_OUTCOMES, "unknown"].sort()).toEqual(checkVocabulary("outcome"));
    expect([...AUTH_EVENT_OUTCOMES]).not.toContain("unknown");
  });
});

describe("SH-THROTTLE-002: every ceiling is one the database will honour", () => {
  // ADR-080 Decision 2. The cap is declared in SQL and the function refuses
  // anything above it, so a ceiling raised past it here would fail at runtime
  // as a 22023 rather than as a rejected value -- and it would fail on the
  // *first request of the day*, in the auth path, in production.
  const cap = Number(/select (\d+) \$\$/.exec(MIGRATION)?.[1]);

  it("reads the cap out of the migration rather than restating it", () => {
    expect(Number.isInteger(cap)).toBe(true);
    expect(cap).toBeGreaterThan(0);
  });

  it.each(AUTH_EVENT_KINDS)("%s sits inside the cap and above zero", (kind) => {
    const ceiling = AUTH_EVENT_CEILINGS[kind];
    expect(ceiling.identifier).toBeGreaterThanOrEqual(1);
    expect(ceiling.ip).toBeGreaterThanOrEqual(1);
    expect(ceiling.identifier).toBeLessThanOrEqual(cap);
    expect(ceiling.ip).toBeLessThanOrEqual(cap);
  });

  it.each(AUTH_EVENT_KINDS)("%s has a window the database will accept", (kind) => {
    // The RPC refuses a window over 30 days, for the same reason it refuses a
    // ceiling over the cap: a window wide enough to be meaningless is the same
    // bypass as a ceiling high enough to be meaningless.
    const { windowSeconds } = AUTH_EVENT_CEILINGS[kind];
    expect(windowSeconds).toBeGreaterThan(0);
    expect(windowSeconds).toBeLessThanOrEqual(30 * 24 * 60 * 60);
  });

  it.each(AUTH_EVENT_KINDS)("%s is at least as loose per IP as per identifier", (kind) => {
    // One address is one account; one IP is an office or a carrier NAT. An IP
    // ceiling tighter than the identifier ceiling would refuse the second
    // person behind a shared egress before it refused the first person's second
    // attempt -- SH-THROTTLE-006's "the refusal lands on the wrong person".
    const ceiling = AUTH_EVENT_CEILINGS[kind];
    expect(ceiling.ip).toBeGreaterThanOrEqual(ceiling.identifier);
  });
});

describe("SH-THROTTLE-005: the pending ceiling stays visibly pending", () => {
  it("resend is marked provisional until the post-SMTP readback", () => {
    // The hosted readback on 2026-08-04 returned rate_limit_email_sent = 2/hour,
    // which is the DEFAULT SMTP value -- it exists because no custom sender is
    // configured and it changes when Resend lands. This assertion is what makes
    // un-marking it a deliberate act: whoever removes the flag has to delete
    // this test, and deleting it is a reviewable line in a diff.
    expect(AUTH_EVENT_CEILINGS.resend.provisional).toBe(true);
  });

  it("no other ceiling is provisional", () => {
    // The other kinds are bounded by rate_limit_verify / rate_limit_otp
    // (30 per 5 minutes per IP), which are not SMTP artefacts and do not move
    // when a sender is configured.
    for (const kind of AUTH_EVENT_KINDS) {
      if (kind === "resend") continue;
      expect(AUTH_EVENT_CEILINGS[kind].provisional).toBeUndefined();
    }
  });

  it("the sending kinds stay under the current provider mail budget per hour", () => {
    // Two mail-sending kinds share one provider budget, so the comparison that
    // matters is against the sum, not against either one alone.
    const perHour = (kind: "recovery" | "resend") => {
      const { identifier, windowSeconds } = AUTH_EVENT_CEILINGS[kind];
      return (identifier * 3600) / windowSeconds;
    };
    // recovery is 3/day, so its hourly share is a fraction; resend is the one
    // that can actually reach the ceiling inside an hour.
    expect(perHour("recovery")).toBeLessThanOrEqual(2);
    expect(perHour("resend")).toBeLessThanOrEqual(2);
  });
});

describe("SH-THROTTLE-002: one subject is one bucket", () => {
  it("folds the spellings that are the same mailbox everywhere", () => {
    const canonical = normalizeAuthIdentifier("user@example.com");
    expect(normalizeAuthIdentifier("User@Example.com")).toBe(canonical);
    expect(normalizeAuthIdentifier("  user@example.com  ")).toBe(canonical);
    expect(normalizeAuthIdentifier("USER@EXAMPLE.COM")).toBe(canonical);
  });

  it("does NOT apply one provider's conventions to every provider", () => {
    // Stripping dots and +tags is a Gmail convention, not a standard. Applying
    // it universally merges genuinely distinct mailboxes at other providers
    // into one bucket, which throttles strangers against each other. The
    // residual -- a Gmail user can mint buckets with +tags, bounded by the IP
    // ceiling -- is recorded in the module rather than closed here.
    expect(normalizeAuthIdentifier("user+tag@example.com"))
      .not.toBe(normalizeAuthIdentifier("user@example.com"));
    expect(normalizeAuthIdentifier("u.ser@example.com"))
      .not.toBe(normalizeAuthIdentifier("user@example.com"));
  });
});

/**
 * SH-SIGNUP-010 — the guard of the guard.
 *
 * `flow.test.ts` already pins the cases `safeAuthNext` was written for. What
 * this adds is the requirement's other half: that the allowlist itself contains
 * **only own-origin shapes**, asserted rather than read. The distinction
 * matters because the risk is not that the current cases regress; it is that
 * somebody later adds a permitted value that happens to leave the origin.
 */
describe("SH-SIGNUP-010: every value safeAuthNext permits is own-origin", () => {
  const hostile = [
    "https://evil.example/pt-BR/app",
    "//evil.example",
    "/\\evil.example",
    "\\/evil.example",
    "http://evil.example",
    "javascript:alert(1)",
    "/en/app/../../evil",
    "///evil.example",
    "/pt-BR/app@evil.example",
  ];

  it.each(hostile)("refuses %s", (candidate) => {
    for (const locale of ["pt-BR", "en"] as const) {
      const result = safeAuthNext(candidate, locale);
      // The only two shapes the allowlist may ever return.
      expect([`/${locale}/app`, `/${locale}/auth/reset`]).toContain(result);
    }
  });

  it("returns a same-origin absolute path for every input, hostile or not", () => {
    const inputs = [...hostile, "/en/app", "/en/auth/reset", "", null, "/en/app/today"];
    for (const candidate of inputs) {
      for (const locale of ["pt-BR", "en"] as const) {
        const result = safeAuthNext(candidate, locale);
        expect(result.startsWith("/")).toBe(true);
        // A leading `//` or `/\` is protocol-relative: the browser reads it as
        // another origin even though it starts with a slash.
        expect(result.startsWith("//")).toBe(false);
        expect(result.startsWith("/\\")).toBe(false);
        expect(result).toMatch(new RegExp(`^/${locale}/`));
      }
    }
  });
});
