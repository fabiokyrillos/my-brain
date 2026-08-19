import { describe, expect, it } from "vitest";

import {
  DEFAULT_SETTINGS_SECTION,
  SETTINGS_REVALIDATION_PATHS,
  SETTINGS_SECTIONS,
  isSettingsSection,
  settingsSectionFromPath,
  settingsSectionHref,
} from "./sections";

describe("the eight sections `2P-SETTINGS-001` names", () => {
  it("declares exactly the eight, in the signed reading order", () => {
    expect(SETTINGS_SECTIONS).toEqual([
      "general",
      "assistant",
      "ai",
      "planning",
      "notifications",
      "privacy",
      "appearance",
      "account",
    ]);
  });

  it("ends on Conta, which is the way out rather than a preference", () => {
    expect(SETTINGS_SECTIONS[SETTINGS_SECTIONS.length - 1]).toBe("account");
  });

  it("recognises its own members and nothing else", () => {
    for (const section of SETTINGS_SECTIONS) expect(isSettingsSection(section)).toBe(true);
    expect(isSettingsSection("automation")).toBe(false);
    expect(isSettingsSection("General")).toBe(false);
    expect(isSettingsSection(undefined)).toBe(false);
  });
});

describe("every section has a stable deep link — `2P-SETTINGS-002`", () => {
  it("gives each section one href, and they are all distinct", () => {
    const hrefs = SETTINGS_SECTIONS.map((section) => settingsSectionHref("pt-BR", section));
    expect(new Set(hrefs).size).toBe(SETTINGS_SECTIONS.length);
  });

  it("renders Geral at the parent route rather than redirecting to a child", () => {
    // A redirect would trap the back button: leaving `/settings/general`
    // backwards lands on `/settings`, which sends you forward again.
    expect(settingsSectionHref("pt-BR", "general")).toBe("/pt-BR/app/settings");
    expect(settingsSectionHref("en", "general")).toBe("/en/app/settings");
  });

  it("puts every other section under the one dynamic segment", () => {
    expect(settingsSectionHref("pt-BR", "assistant")).toBe("/pt-BR/app/settings/assistant");
    expect(settingsSectionHref("en", "notifications")).toBe("/en/app/settings/notifications");
    expect(settingsSectionHref("pt-BR", "account")).toBe("/pt-BR/app/settings/account");
  });

  it("carries the locale into every href, so no section escapes the segment", () => {
    for (const section of SETTINGS_SECTIONS) {
      expect(settingsSectionHref("en", section).startsWith("/en/app/settings")).toBe(true);
      expect(settingsSectionHref("pt-BR", section).startsWith("/pt-BR/app/settings")).toBe(true);
    }
  });
});

describe("a URL resolves back to its section", () => {
  it("round-trips every section through its own href", () => {
    for (const locale of ["pt-BR", "en"] as const) {
      for (const section of SETTINGS_SECTIONS) {
        expect(settingsSectionFromPath(settingsSectionHref(locale, section))).toBe(section);
      }
    }
  });

  it("accepts the guessable `/settings/general` as well as the canonical parent", () => {
    expect(settingsSectionFromPath("/pt-BR/app/settings/general")).toBe("general");
    expect(settingsSectionFromPath("/pt-BR/app/settings")).toBe(DEFAULT_SETTINGS_SECTION);
    expect(settingsSectionFromPath("/pt-BR/app/settings/")).toBe(DEFAULT_SETTINGS_SECTION);
  });

  it("survives a query string and a fragment, so a deep link still resolves", () => {
    expect(settingsSectionFromPath("/en/app/settings/privacy?from=bell")).toBe("privacy");
    expect(settingsSectionFromPath("/en/app/settings/privacy#census")).toBe("privacy");
  });

  it("refuses a slug that is not a section, and everything outside the route", () => {
    expect(settingsSectionFromPath("/pt-BR/app/settings/automation")).toBeNull();
    expect(settingsSectionFromPath("/pt-BR/app/settings/assistant/extra")).toBeNull();
    expect(settingsSectionFromPath("/pt-BR/app/notifications")).toBeNull();
    expect(settingsSectionFromPath("/fr/app/settings")).toBeNull();
    expect(settingsSectionFromPath("")).toBeNull();
  });
});

describe("revalidation names the route pattern, never the resolved path", () => {
  /**
   * Slice 2P.4 measured the difference against the deployed app: with the
   * resolved path, the client's refresh request is sent and the server answers
   * it with the previous render, because `/app/settings` lives under a dynamic
   * `[locale]` segment. The Next documentation states the rule — a path
   * containing a dynamic segment requires the `type` parameter.
   */
  it("carries both patterns, and both are patterns", () => {
    expect(SETTINGS_REVALIDATION_PATHS).toEqual([
      "/[locale]/app/settings",
      "/[locale]/app/settings/[section]",
    ]);
    for (const path of SETTINGS_REVALIDATION_PATHS) {
      expect(path, "a resolved locale leaked into a revalidation path").toContain("[locale]");
      expect(path).not.toMatch(/\/pt-BR\/|\/en\//);
    }
  });

  it("covers both route files, so no section is left uninvalidated", () => {
    // The parent renders Geral; the dynamic segment renders the other seven.
    // Two files, two patterns — a section list here would be a third place to
    // keep in step with the route tree.
    expect(SETTINGS_REVALIDATION_PATHS).toHaveLength(2);
    expect(SETTINGS_REVALIDATION_PATHS[1].endsWith("/[section]")).toBe(true);
  });
});
