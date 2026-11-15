import { describe, expect, it } from "vitest";

import {
  DEFAULT_SETTINGS_SECTION,
  SETTINGS_REVALIDATION_PATHS,
  LEGACY_SETTINGS_SECTIONS,
  SETTINGS_SECTIONS,
  isSettingsSection,
  legacySettingsTarget,
  settingsGroupHref,
  settingsSectionFromPath,
  settingsSectionHref,
} from "./sections";

describe("the six groups Life Brain E.1 names (ADR-169)", () => {
  it("declares exactly the six, in the approved reading order", () => {
    expect(SETTINGS_SECTIONS).toEqual(["general", "day", "autonomy", "ai", "appearance", "privacy"]);
  });

  it("ends on Privacidade e conta, which is the way out rather than a preference", () => {
    expect(SETTINGS_SECTIONS[SETTINGS_SECTIONS.length - 1]).toBe("privacy");
  });

  it("recognises its own members and nothing else", () => {
    for (const section of SETTINGS_SECTIONS) expect(isSettingsSection(section)).toBe(true);
    expect(isSettingsSection("automation")).toBe(false);
    expect(isSettingsSection("assistant")).toBe(false);
    expect(isSettingsSection("General")).toBe(false);
    expect(isSettingsSection(undefined)).toBe(false);
  });
});

describe("every 2P.5 slug still lands somewhere — `2P-SETTINGS-002`", () => {
  it("maps each retired slug to the group that absorbed it", () => {
    expect(LEGACY_SETTINGS_SECTIONS).toEqual({
      assistant: "general",
      planning: "day",
      notifications: "day",
      account: "privacy",
    });
  });

  it("maps every retired slug to a real group, and no group to itself", () => {
    for (const [slug, group] of Object.entries(LEGACY_SETTINGS_SECTIONS)) {
      expect(isSettingsSection(group)).toBe(true);
      expect(isSettingsSection(slug)).toBe(false);
    }
  });

  it("resolves only retired slugs, never a group or an inherited key", () => {
    expect(legacySettingsTarget("notifications")).toBe("day");
    expect(legacySettingsTarget("general")).toBeNull();
    expect(legacySettingsTarget("toString")).toBeNull();
    expect(legacySettingsTarget(undefined)).toBeNull();
  });

  it("marks the group a retired URL redirects to while it redirects", () => {
    expect(settingsSectionFromPath("/pt-BR/app/settings/account")).toBe("privacy");
    expect(settingsSectionFromPath("/en/app/settings/planning")).toBe("day");
  });
});

describe("the phone's list of groups opens each group", () => {
  it("opens the default group by its explicit slug, since `/app/settings` is the list", () => {
    expect(settingsGroupHref("pt-BR", "general")).toBe("/pt-BR/app/settings/general");
    expect(settingsSectionFromPath(settingsGroupHref("pt-BR", "general"))).toBe("general");
  });

  it("opens every other group at its canonical href", () => {
    for (const section of SETTINGS_SECTIONS.filter((entry) => entry !== "general")) {
      expect(settingsGroupHref("en", section)).toBe(settingsSectionHref("en", section));
    }
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
    expect(settingsSectionHref("pt-BR", "day")).toBe("/pt-BR/app/settings/day");
    expect(settingsSectionHref("en", "autonomy")).toBe("/en/app/settings/autonomy");
    expect(settingsSectionHref("pt-BR", "privacy")).toBe("/pt-BR/app/settings/privacy");
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
    expect(settingsSectionFromPath("/pt-BR/app/settings/day/extra")).toBeNull();
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
