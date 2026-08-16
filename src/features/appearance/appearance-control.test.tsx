import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { locales, type Locale } from "@/lib/preferences";

import { AppearanceControl } from "./appearance-control";
import { APPEARANCE_ATTRIBUTE, APPEARANCE_STORAGE_KEY, appearanceChoices } from "./contracts";
import { getAppearanceCopy } from "./copy";

beforeEach(() => window.localStorage.clear());

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.documentElement.removeAttribute(APPEARANCE_ATTRIBUTE);
});

describe("`2O-PREF-013`: exactly three states, in both languages", () => {
  for (const locale of locales) {
    it(`offers follow-the-machine, light and dark (${locale})`, () => {
      render(<AppearanceControl locale={locale as Locale} />);
      const copy = getAppearanceCopy(locale as Locale);
      const radios = screen.getAllByRole("radio");
      expect(radios).toHaveLength(3);
      for (const choice of appearanceChoices) {
        expect(screen.getByRole("radio", { name: new RegExp(copy.options[choice].label, "i") })).toBeInTheDocument();
      }
    });
  }

  it("starts on follow-the-machine when nothing is stored", () => {
    render(<AppearanceControl locale="pt-BR" />);
    expect(screen.getByRole("radio", { name: /Seguir o aparelho/i })).toBeChecked();
  });

  it("starts on the stored choice, so the control never disagrees with the document", () => {
    /*
     * The pre-paint script has already applied the attribute by the time React
     * runs. A control whose initial state disagreed would show the wrong radio
     * and correct itself — the flash `2O-PREF-014` prevents, moved from the page
     * to the control. The initializer reads the same key through the same
     * parser, so they cannot disagree.
     */
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, "dark");
    render(<AppearanceControl locale="pt-BR" />);
    expect(screen.getByRole("radio", { name: /Escuro/i })).toBeChecked();
  });

  it("falls back to follow-the-machine when the stored value is junk", () => {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, '"><script>alert(1)</script>');
    render(<AppearanceControl locale="pt-BR" />);
    expect(screen.getByRole("radio", { name: /Seguir o aparelho/i })).toBeChecked();
    expect(document.documentElement.hasAttribute(APPEARANCE_ATTRIBUTE)).toBe(false);
  });
});

describe("`2O-PREF-014`: the choice applies at once and is held client-side", () => {
  it("writes the attribute and stores the value on a click", async () => {
    const user = userEvent.setup();
    render(<AppearanceControl locale="pt-BR" />);

    await user.click(screen.getByRole("radio", { name: /Escuro/i }));
    expect(document.documentElement.getAttribute(APPEARANCE_ATTRIBUTE)).toBe("dark");
    expect(window.localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe("dark");
  });

  it("removes the attribute when the reader goes back to the machine", async () => {
    const user = userEvent.setup();
    render(<AppearanceControl locale="pt-BR" />);

    await user.click(screen.getByRole("radio", { name: /Claro/i }));
    expect(document.documentElement.getAttribute(APPEARANCE_ATTRIBUTE)).toBe("light");
    await user.click(screen.getByRole("radio", { name: /Seguir o aparelho/i }));
    expect(document.documentElement.hasAttribute(APPEARANCE_ATTRIBUTE)).toBe(false);
    expect(window.localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe("system");
  });

  it("still applies the theme when storage refuses, rather than refusing with it", async () => {
    /*
     * Private mode and blocked site data throw on write. The choice has already
     * reached the document by then, and losing it on reload is the most this
     * product can honestly promise in a browser that stores nothing — strictly
     * better than declining to change the theme at all.
     */
    const user = userEvent.setup();
    render(<AppearanceControl locale="pt-BR" />);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    await user.click(screen.getByRole("radio", { name: /Escuro/i }));
    expect(document.documentElement.getAttribute(APPEARANCE_ATTRIBUTE)).toBe("dark");
    expect(screen.getByRole("radio", { name: /Escuro/i })).toBeChecked();
  });

  it("performs no server write of any kind", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const source = readFileSync(
      join(process.cwd(), "src/features/appearance/appearance-control.tsx"),
      "utf8",
    );
    // `OD-2O-2` **A** signed *no column and no migration*. A Server Action, an
    // RPC or a Supabase call here would be that decision being reversed by
    // implementation.
    expect(source).not.toMatch(/\.from\(|\.rpc\(|useActionState|"use server"|createClient/);
  });
});

describe("`2O-PREF-012` and `2O-PREF-015`: revisable, and never described as an account setting", () => {
  it("returns to every state with the same control", async () => {
    const user = userEvent.setup();
    render(<AppearanceControl locale="pt-BR" />);
    const copy = getAppearanceCopy("pt-BR");

    // Every state, from every other. Nothing here is one-way.
    for (const choice of [...appearanceChoices, ...appearanceChoices].reverse()) {
      const radio = screen.getByRole("radio", { name: new RegExp(copy.options[choice].label, "i") });
      await user.click(radio);
      expect(radio, choice).toBeChecked();
    }
  });

  it("says on the surface that it does not follow the account", () => {
    for (const locale of locales) {
      cleanup();
      render(<AppearanceControl locale={locale as Locale} />);
      const scope = getAppearanceCopy(locale as Locale).scope;
      expect(screen.getByText(scope)).toBeInTheDocument();
      // ADR-116 Decision 8's cost, in the reader's own language.
      expect(scope).toMatch(/navegador|browser/i);
    }
  });

  it("has no save button, because there is nothing to save", () => {
    render(<AppearanceControl locale="pt-BR" />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
