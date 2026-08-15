import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { getLegalDocument } from "@/features/legal/documents";
import { legalDocumentPath } from "@/features/legal/versions";

import { ENTRY_CLAIM_ORDER, getEntryCopy } from "./copy";
import { EntryPage } from "./entry-page";

const LOCALES = ["pt-BR", "en"] as const;

describe("2O-ENTRY-002: four claims, in both locales, and no fifth", () => {
  it.each(LOCALES)("renders exactly the four declared claims in %s", (locale) => {
    render(<EntryPage locale={locale} signupOpen={false} />);
    const copy = getEntryCopy(locale);
    const list = within(screen.getByRole("region", { name: copy.claimsLabel })).getAllByRole("listitem");

    expect(list).toHaveLength(4);
    expect(list.map((item) => item.textContent)).toEqual(
      ENTRY_CLAIM_ORDER.map((claim) => copy.claims[claim]),
    );
  });

  it("is non-vacuous: four is really the declared number", () => {
    expect(ENTRY_CLAIM_ORDER).toHaveLength(4);
    expect(new Set(ENTRY_CLAIM_ORDER).size).toBe(4);
  });

  it.each(LOCALES)("reaches both policy documents from %s", (locale) => {
    render(<EntryPage locale={locale} signupOpen={false} />);
    for (const document of ["terms", "privacy"] as const) {
      const link = screen.getByRole("link", { name: getLegalDocument(locale, document).title });
      expect(link.getAttribute("href")).toBe(legalDocumentPath(locale, document));
    }
  });
});

describe("2O-ENTRY-003: no availability claim while the door is shut", () => {
  it.each(LOCALES)("offers no registration control in %s", (locale) => {
    const { container } = render(<EntryPage locale={locale} signupOpen={false} />);

    // No link to the register route, and no field that could collect an address.
    expect(container.querySelector('a[href*="/auth/register"]')).toBeNull();
    expect(container.querySelector("input")).toBeNull();
    expect(container.querySelector("form")).toBeNull();

    // The corpus really rendered, so the absences above mean something.
    expect(screen.getByRole("heading", { level: 1, name: getEntryCopy(locale).tagline })).toBeTruthy();
  });

  it.each(LOCALES)("states the closed door as a fact, with no waiting list, in %s", (locale) => {
    render(<EntryPage locale={locale} signupOpen={false} />);
    const notice = getEntryCopy(locale).closedNotice;
    expect(screen.getByText(notice)).toBeTruthy();
    // A promise of a future opening would be an availability claim by the back
    // door. The notice may state what is true now and nothing about when.
    expect(notice).not.toMatch(/\b(em breve|soon|logo|shortly|aguarde|wait list|waitlist)\b/i);
  });

  it.each(LOCALES)("says nothing about being closed when it is open, in %s", (locale) => {
    render(<EntryPage locale={locale} signupOpen />);
    expect(screen.queryByText(getEntryCopy(locale).closedNotice)).toBeNull();
  });

  it.each(LOCALES)("keeps sign-in reachable in %s, because it is not a registration", (locale) => {
    render(<EntryPage locale={locale} signupOpen={false} />);
    const link = screen.getByRole("link", { name: getEntryCopy(locale).signIn });
    expect(link.getAttribute("href")).toBe(`/${locale}/auth/login`);
  });
});

describe("2O-ENTRY-001: the page tells the truth about its own language", () => {
  it.each(LOCALES)("declares lang=%s on the element that knows the locale", (locale) => {
    const { container } = render(<EntryPage locale={locale} signupOpen={false} />);
    // The root layout hardcodes `<html lang="pt-BR">`, so this is the first
    // element that can be right. `app-shell.tsx` does the same for the app.
    expect(container.querySelector(`[lang="${locale}"]`)).not.toBeNull();
  });

  it("renders one locale's copy and not the other's", () => {
    render(<EntryPage locale="en" signupOpen={false} />);
    expect(screen.queryByText(getEntryCopy("pt-BR").tagline)).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: getEntryCopy("en").tagline })).toBeTruthy();
  });
});
