import { describe, expect, it } from "vitest";

import { SETTINGS_SECTIONS } from "./sections";
import { settingsSummaries, type SettingsSummaryInput } from "./summary";

const base: SettingsSummaryInput = {
  values: {
    agentName: "Michael",
    timezone: "America/Sao_Paulo",
    quietStart: "22:00",
    quietEnd: "07:00",
    maxFollowupsPerDay: 3,
    aiProfile: "quality",
  },
  automation: [
    { state: "suggest_only", eligible: false },
    { state: "disabled", eligible: false },
  ],
  credential: "active",
};

describe("the line under each group says what it is set to now (Life Brain E.1)", () => {
  it("has a line for every group, in both locales", () => {
    for (const locale of ["pt-BR", "en"] as const) {
      const summaries = settingsSummaries(locale, base);
      for (const section of SETTINGS_SECTIONS) expect(summaries[section].length).toBeGreaterThan(0);
    }
  });

  it("names the assistant, the time zone without its cities, and the language", () => {
    const line = settingsSummaries("pt-BR", base).general;
    expect(line.startsWith("Michael · ")).toBe(true);
    expect(line).not.toContain("UTC");
    expect(line.endsWith(" · Português")).toBe(true);
    expect(settingsSummaries("en", base).general.endsWith(" · English")).toBe(true);
  });

  it("states the quiet period and the daily cap", () => {
    expect(settingsSummaries("pt-BR", base).day).toBe("Silêncio das 22:00 às 07:00 · até 3 por dia");
    expect(settingsSummaries("en", base).day).toBe("Quiet from 22:00 to 07:00 · up to 3 a day");
  });

  it("says it only suggests until a category is both allowed and eligible", () => {
    expect(settingsSummaries("pt-BR", base).autonomy).toBe("Só sugere, em tudo");
    const allowedNotEligible = { ...base, automation: [{ state: "automatic_when_eligible", eligible: false }] } as const;
    expect(settingsSummaries("pt-BR", allowedNotEligible).autonomy).toBe("Só sugere, em tudo");
    const acting = { ...base, automation: [{ state: "automatic_when_eligible", eligible: true }] } as const;
    expect(settingsSummaries("pt-BR", acting).autonomy).toBe("Age sozinho em 1 categoria");
  });

  it("reports the key's state without naming anything about the key", () => {
    // Editorial calmo: a working key is named with the profile it serves; no key, no profile.
    expect(settingsSummaries("pt-BR", base).ai).toBe("Chave funcionando · Qualidade máxima");
    expect(settingsSummaries("en", { ...base, values: { ...base.values, aiProfile: "economy" } }).ai).toBe("Key working · Economy");
    expect(settingsSummaries("pt-BR", { ...base, credential: "absent" }).ai).toBe("Sem chave");
    expect(settingsSummaries("pt-BR", { ...base, credential: "invalid" }).ai).toBe("A chave parou de funcionar");
  });
});
