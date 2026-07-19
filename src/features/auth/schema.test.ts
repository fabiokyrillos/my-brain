import { describe, expect, it } from "vitest";
import {
  recoverySchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "./schema";

const strongPassword = "Brain!Foundation2026";

describe("authentication schemas", () => {
  it("normalizes a valid signup payload", () => {
    const result = signUpSchema.safeParse({
      displayName: "  Fabin  ",
      email: "  FABIN@EXAMPLE.COM ",
      password: strongPassword,
      passwordConfirmation: strongPassword,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.displayName).toBe("Fabin");
      expect(result.data.email).toBe("fabin@example.com");
    }
  });

  it.each([
    "short!A1",
    "alllowercase!2026",
    "ALLUPPERCASE!2026",
    "NoNumbers!Here",
    "NoSymbols2026Here",
  ])("rejects a weak signup password: %s", (password) => {
    expect(
      signUpSchema.safeParse({
        displayName: "Fabin",
        email: "fabin@example.com",
        password,
        passwordConfirmation: password,
      }).success,
    ).toBe(false);
  });

  it("rejects a signup whose password confirmation differs", () => {
    expect(
      signUpSchema.safeParse({
        displayName: "Fabin",
        email: "fabin@example.com",
        password: strongPassword,
        passwordConfirmation: `${strongPassword}!`,
      }).success,
    ).toBe(false);
  });

  it("rejects malformed names and email addresses", () => {
    expect(
      signUpSchema.safeParse({
        displayName: " ",
        email: "not-an-email",
        password: strongPassword,
        passwordConfirmation: strongPassword,
      }).success,
    ).toBe(false);
  });

  it("normalizes sign-in and recovery emails", () => {
    expect(
      signInSchema.parse({ email: " USER@EXAMPLE.COM ", password: strongPassword }),
    ).toEqual({ email: "user@example.com", password: strongPassword });
    expect(recoverySchema.parse({ email: " USER@EXAMPLE.COM " })).toEqual({
      email: "user@example.com",
    });
  });

  it("requires a strong matching password when resetting", () => {
    expect(
      resetPasswordSchema.safeParse({
        password: strongPassword,
        passwordConfirmation: strongPassword,
      }).success,
    ).toBe(true);
    expect(
      resetPasswordSchema.safeParse({
        password: strongPassword,
        passwordConfirmation: "Different!Password2026",
      }).success,
    ).toBe(false);
  });
});
