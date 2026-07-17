import { describe, expect, it } from "vitest";
import {
  authErrorMessage,
  authProviderErrorCode,
  buildAuthCallbackUrl,
  isAuthSessionContinuation,
  safeAuthNext,
} from "./flow";

describe("authentication flow helpers", () => {
  it("builds a localized PKCE callback URL with a safe continuation", () => {
    expect(
      buildAuthCallbackUrl("https://brain.example", "pt-BR", "/pt-BR/auth/reset"),
    ).toBe(
      "https://brain.example/pt-BR/auth/callback?next=%2Fpt-BR%2Fauth%2Freset",
    );
  });

  it("accepts only same-locale internal callback destinations", () => {
    expect(safeAuthNext("/en/app", "en")).toBe("/en/app");
    expect(safeAuthNext("/en/auth/reset", "en")).toBe("/en/auth/reset");
    expect(safeAuthNext("https://evil.example", "en")).toBe("/en/app");
    expect(safeAuthNext("//evil.example", "en")).toBe("/en/app");
    expect(safeAuthNext("/pt-BR/app", "en")).toBe("/en/app");
  });

  it("maps stable error codes without exposing provider messages", () => {
    expect(authErrorMessage("invalid-form", "pt-BR")).toMatch(/campos/i);
    expect(authErrorMessage("signup-failed", "en")).toMatch(/account/i);
    expect(authErrorMessage("provider stack trace", "pt-BR")).toMatch(/tente novamente/i);
  });

  it("classifies provider email throttling without exposing provider details", () => {
    expect(
      authProviderErrorCode(
        { code: "over_email_send_rate_limit", message: "provider details" },
        "signup-failed",
      ),
    ).toBe("email-rate-limited");
    expect(
      authProviderErrorCode(
        { code: "unexpected_provider_error" },
        "recovery-failed",
      ),
    ).toBe("recovery-failed");
    expect(authErrorMessage("email-rate-limited", "pt-BR")).toMatch(/aguarde/i);
  });

  it("keeps only callback and password reset available to an authenticated auth session", () => {
    expect(isAuthSessionContinuation("/pt-BR/auth/callback", "pt-BR")).toBe(true);
    expect(isAuthSessionContinuation("/pt-BR/auth/reset", "pt-BR")).toBe(true);
    expect(isAuthSessionContinuation("/pt-BR/auth/login", "pt-BR")).toBe(false);
    expect(isAuthSessionContinuation("/en/auth/reset", "pt-BR")).toBe(false);
  });
});
