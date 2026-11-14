/**
 * Life Brain E.1 (ADR-169) — the one line under each group on the phone's list
 * of groups: what the group is set to *now*, so the list answers "how is this
 * configured?" without opening anything.
 *
 * Pure and holding every word, so a test can read it with no database;
 * `summary-loader.ts` starts the three reads together.
 *
 * Appearance and Privacy have no stored value to summarise here — the theme is
 * per browser (`2O-PREF-013`) and privacy is actions, not settings — so their
 * line names what is inside, short enough for one line on a phone.
 */

import type { AutomationCategoryDecision } from "@/features/agent/automation-policy";
import type { CredentialStatus } from "@/features/byok/credential-view";
import type { SettingsFormValues } from "@/features/profile/settings-contracts";
import { getTimeZoneOptions } from "@/features/profile/timezones";
import type { Locale } from "@/lib/preferences";

import type { SettingsSection } from "./sections";

export type SettingsSummaryInput = Readonly<{
  values: Pick<SettingsFormValues, "agentName" | "timezone" | "quietStart" | "quietEnd" | "maxFollowupsPerDay">;
  automation: readonly Pick<AutomationCategoryDecision, "state" | "eligible">[];
  credential: CredentialStatus;
}>;

export type SettingsSummaries = Readonly<Record<SettingsSection, string>>;

/** The time zone's own name, without the cities and offset the select shows. */
function zoneName(locale: Locale, timezone: string): string {
  const option = getTimeZoneOptions(locale, timezone).find((entry) => entry.value === timezone);
  return (option?.label ?? timezone).split(" · ")[0];
}

/** A category acts alone only when the owner allowed it and calibration agrees. */
function actingAlone(automation: SettingsSummaryInput["automation"]): number {
  return automation.filter((entry) => entry.state === "automatic_when_eligible" && entry.eligible).length;
}

export function settingsSummaries(locale: Locale, input: SettingsSummaryInput): SettingsSummaries {
  const pt = locale === "pt-BR";
  const { values } = input;
  const acting = actingAlone(input.automation);
  const credential = {
    active: pt ? "Chave funcionando" : "Key working",
    invalid: pt ? "A chave parou de funcionar" : "The key stopped working",
    removed: pt ? "Sem chave" : "No key",
    absent: pt ? "Sem chave" : "No key",
  }[input.credential];

  return {
    general: [values.agentName, zoneName(locale, values.timezone), pt ? "Português" : "English"].join(" · "),
    day: pt
      ? `Silêncio ${values.quietStart}–${values.quietEnd} · até ${values.maxFollowupsPerDay} por dia`
      : `Quiet ${values.quietStart}–${values.quietEnd} · up to ${values.maxFollowupsPerDay} a day`,
    autonomy:
      acting === 0
        ? pt ? "Só sugere, em tudo" : "Only suggests, everywhere"
        : pt ? `Age sozinho em ${acting} ${acting === 1 ? "categoria" : "categorias"}` : `Acts alone in ${acting} ${acting === 1 ? "category" : "categories"}`,
    ai: credential,
    appearance: pt ? "Tema e instalar como app" : "Theme and installing as an app",
    privacy: pt ? "Baixar uma cópia, sessões, apagar a conta" : "Take a copy, sessions, delete the account",
  };
}
