import { describe, expect, it } from "vitest";
import { signUpSchema, resetPasswordSchema } from "./schema";
import { APPLICATION_PASSWORD_POLICY, INTENDED_HOSTED_AUTH } from "./hosted-auth-posture";

/**
 * SH-SIGNUP-007 — the application policy and the hosted policy are one policy.
 *
 * ## The gap this closes
 *
 * Until 2026-08-05 the hosted policy was six characters with no class
 * requirement while `schema.ts` demanded twelve across four classes. That was
 * not a cosmetic divergence: Zod guards the Server Actions, and the Server
 * Actions are not the only door. An authenticated caller reaching
 * `PUT /auth/v1/user` through PostgREST is validated by GoTrue alone, so a
 * six-character password was reachable by anyone willing to skip the form —
 * and the product would have reported nothing unusual.
 *
 * The hosted side is now `12`, verified behaviourally
 * (`scripts/sh5-password-policy-probe.mjs`: a password the old policy accepted
 * is refused `422 weak_password`, a compliant one is accepted, and the refusal
 * survives a retry after a successful change).
 *
 * ## Why the parity runs in both directions
 *
 * Raising Zod without raising the hosted policy re-opens the direct-API door.
 * Raising the hosted policy without raising Zod moves the refusal from a
 * localized message on the form to a provider error the user cannot read. Both
 * are regressions, so both directions fail here.
 *
 * The class requirement itself is asserted against the SCHEMA's behaviour
 * rather than against a copy of its regexes — a test that restates the
 * implementation passes when the implementation is wrong.
 */

const VALID = "Sh5-Parity-Aa1!xyz";

/** Builds a signup payload that varies only in the password. */
const signUpWith = (password: string) => ({
  displayName: "Parity Probe",
  email: "parity@example.test",
  password,
  passwordConfirmation: password,
  acceptedPolicies: "on" as const,
});

describe("SH-SIGNUP-007: one policy, stated twice and asserted equal", () => {
  it("the hosted minimum equals the application minimum", () => {
    expect(INTENDED_HOSTED_AUTH.password_min_length).toBe(
      APPLICATION_PASSWORD_POLICY.minLength,
    );
  });

  it("the schema enforces exactly the declared minimum, not one either side", () => {
    const short = "Aa1!".padEnd(APPLICATION_PASSWORD_POLICY.minLength - 1, "x");
    const exact = "Aa1!".padEnd(APPLICATION_PASSWORD_POLICY.minLength, "x");

    expect(short.length).toBe(APPLICATION_PASSWORD_POLICY.minLength - 1);
    expect(signUpSchema.safeParse(signUpWith(short)).success).toBe(false);
    expect(signUpSchema.safeParse(signUpWith(exact)).success).toBe(true);
  });

  it("the schema requires all four character classes", () => {
    // One case per missing class, each otherwise long enough and valid, so a
    // failure names the class that stopped being required.
    const missing = {
      lowercase: "ABCDEFGH1234!@#$",
      uppercase: "abcdefgh1234!@#$",
      digit: "abcdEFGH!@#$%^&*",
      symbol: "abcdEFGH12345678",
    };
    for (const [className, password] of Object.entries(missing)) {
      expect(password.length).toBeGreaterThanOrEqual(APPLICATION_PASSWORD_POLICY.minLength);
      expect(
        signUpSchema.safeParse(signUpWith(password)).success,
        `a password with no ${className} must be refused`,
      ).toBe(false);
    }
    expect(signUpSchema.safeParse(signUpWith(VALID)).success).toBe(true);
  });

  it("counts the classes the declaration claims", () => {
    // The constant says four. If someone drops a class from the schema, the
    // loop above fails; if someone edits the constant instead, this does.
    expect(APPLICATION_PASSWORD_POLICY.requiredClasses).toBe(4);
  });

  it("the reset surface enforces the same policy as signup", () => {
    // A weaker reset path would be the same direct-API hole in a different
    // shape: the account whose password is being changed is already the
    // attacker's target.
    const short = "Aa1!".padEnd(APPLICATION_PASSWORD_POLICY.minLength - 1, "x");
    expect(
      resetPasswordSchema.safeParse({ password: short, passwordConfirmation: short }).success,
    ).toBe(false);
    expect(
      resetPasswordSchema.safeParse({ password: VALID, passwordConfirmation: VALID }).success,
    ).toBe(true);
  });

  it("keeps a maximum, so the policy cannot be used to post an unbounded field", () => {
    const huge = `${VALID}${"x".repeat(APPLICATION_PASSWORD_POLICY.maxLength)}`;
    expect(signUpSchema.safeParse(signUpWith(huge)).success).toBe(false);
  });
});
