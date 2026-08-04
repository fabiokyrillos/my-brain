/**
 * SH-LEGAL-007 — consent is refused server-side, and removing the checkbox in
 * the browser does not bypass it.
 *
 * The assertion is about the **schema**, deliberately: the schema is what the
 * Server Action parses, so proving the schema rejects an absent field proves
 * the action rejects a submission with the input deleted — which is exactly the
 * attack, and is not something a rendering test could show.
 */

import { describe, expect, it } from "vitest";
import { signUpSchema } from "./schema";
import { authErrorMessage } from "./flow";

const valid = {
  displayName: "Alguém",
  email: "someone@example.test",
  password: "Senha-Forte-12345!",
  passwordConfirmation: "Senha-Forte-12345!",
  acceptedPolicies: "on",
};

describe("SH-LEGAL-007: the signup consent control", () => {
  it("accepts a submission with the box ticked", () => {
    expect(signUpSchema.safeParse(valid).success).toBe(true);
  });

  it("refuses a submission with the field absent -- an unticked box sends nothing", () => {
    const withoutConsent: Record<string, string> = { ...valid };
    delete withoutConsent.acceptedPolicies;
    const result = signUpSchema.safeParse(withoutConsent);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "acceptedPolicies")).toBe(true);
    }
  });

  it("refuses a forged value -- only the checkbox's own value counts", () => {
    for (const forged of ["off", "false", "true", "1", ""]) {
      expect(signUpSchema.safeParse({ ...valid, acceptedPolicies: forged }).success).toBe(false);
    }
  });

  it("the refusal is told apart from a malformed field", () => {
    // Both are parse failures; the action distinguishes them by issue path, so
    // the user is told which of the two actually happened.
    const missingConsent = signUpSchema.safeParse({ ...valid, acceptedPolicies: undefined });
    const missingName = signUpSchema.safeParse({ ...valid, displayName: "" });
    expect(missingConsent.success).toBe(false);
    expect(missingName.success).toBe(false);
    if (!missingConsent.success && !missingName.success) {
      const consentPaths = missingConsent.error.issues.map((issue) => issue.path[0]);
      const namePaths = missingName.error.issues.map((issue) => issue.path[0]);
      expect(consentPaths).toContain("acceptedPolicies");
      expect(namePaths).not.toContain("acceptedPolicies");
    }
  });

  it("the consent refusal has its own localized message in both locales", () => {
    const pt = authErrorMessage("consent-required", "pt-BR");
    const en = authErrorMessage("consent-required", "en");
    expect(pt).not.toBe(en);
    for (const message of [pt, en]) {
      expect(message.trim()).not.toBe("");
      // Not the generic fallback: an honest refusal names what was not accepted.
      expect(message.toLowerCase()).toMatch(/termos|terms/);
    }
  });
});
