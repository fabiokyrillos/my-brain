import { describe, expect, it } from "vitest";

import { entryDestination } from "./destination";

describe("2O-ENTRY-004: a signed-in visitor arrives in the application", () => {
  it("uses the locale stored on the account", () => {
    expect(entryDestination({ authenticated: true, storedLocale: "en" })).toBe("/en/app");
    expect(entryDestination({ authenticated: true, storedLocale: "pt-BR" })).toBe("/pt-BR/app");
  });

  it("goes straight to the application, with no step in between", () => {
    // "With no extra navigation step". Landing on the public page and being told
    // what the product is would be that step.
    expect(entryDestination({ authenticated: true, storedLocale: "en" })).toMatch(/\/app$/);
  });

  it("falls back to pt-BR when nothing is stored", () => {
    for (const stored of [null, undefined, ""]) {
      expect(entryDestination({ authenticated: true, storedLocale: stored })).toBe("/pt-BR/app");
    }
  });

  it("refuses a stored value that is not a locale, rather than putting it in a path", () => {
    // `profiles.locale` is a text column and this value becomes a path segment.
    for (const hostile of ["../../etc", "en-US", "fr", "pt-BR/app", "%2e%2e"]) {
      expect(entryDestination({ authenticated: true, storedLocale: hostile })).toBe("/pt-BR/app");
    }
  });
});

describe("2O-ENTRY-001: an unauthenticated visitor gets the public page in their language", () => {
  it("negotiates from the header", () => {
    expect(entryDestination({ authenticated: false, acceptLanguage: "en-GB,en;q=0.9" })).toBe("/en");
    expect(entryDestination({ authenticated: false, acceptLanguage: "pt-BR" })).toBe("/pt-BR");
  });

  it("falls back to pt-BR only when the header says nothing it understands", () => {
    expect(entryDestination({ authenticated: false, acceptLanguage: null })).toBe("/pt-BR");
    expect(entryDestination({ authenticated: false, acceptLanguage: "ja" })).toBe("/pt-BR");
  });

  it("never sends an unauthenticated visitor into the application", () => {
    // The old behaviour, asserted as gone: `redirect("/pt-BR/app")` sent every
    // visitor to a route the proxy then bounced to a login form.
    for (const header of ["en", "pt-BR", null, "de"]) {
      expect(entryDestination({ authenticated: false, acceptLanguage: header })).not.toMatch(/\/app/);
    }
  });

  it("only ever produces one of the two known destinations", () => {
    // The return value becomes a redirect target. Nothing derived from a header
    // may reach it except through the closed locale union.
    const produced = new Set(
      ["en", "pt", "de", "*", "", "en;q=0", "x".repeat(300), null, undefined].map((header) =>
        entryDestination({ authenticated: false, acceptLanguage: header }),
      ),
    );
    expect([...produced].sort()).toEqual(["/en", "/pt-BR"]);
  });
});
