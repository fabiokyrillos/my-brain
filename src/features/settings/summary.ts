/**
 * Life Brain E.1 (ADR-169) — the one line under each group on the list of
 * groups: what the group is set to *now*, so the list answers "how is this
 * configured?" without opening anything.
 *
 * Pure, so a test can read it with no database; `summary-loader.ts` starts the
 * three reads together. The words are `copy.ts`'s (`summaries`, `profiles`,
 * `language`) since the Editorial calmo pass (ADR-180), which also added the
 * cost-and-quality profile to the AI line — from the same `values` read, no
 * new query.
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

import { getSettingsCopy } from "./copy";
import type { SettingsSection } from "./sections";

export type SettingsSummaryInput = Readonly<{
  values: Pick<SettingsFormValues, "agentName" | "timezone" | "quietStart" | "quietEnd" | "maxFollowupsPerDay" | "aiProfile">;
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
  const copy = getSettingsCopy(locale);
  const { values } = input;
  const acting = actingAlone(input.automation);
  const credential = copy.summaries.credential[input.credential];
  // The profile decides nothing without a working key, so it is only named beside one.
  const ai = input.credential === "active" ? `${credential} · ${copy.profiles[values.aiProfile]}` : credential;

  return {
    general: [values.agentName, zoneName(locale, values.timezone), copy.language.name].join(" · "),
    day: copy.summaries.day(values.quietStart, values.quietEnd, values.maxFollowupsPerDay),
    autonomy: acting === 0 ? copy.summaries.autonomyNone : copy.summaries.autonomySome(acting),
    ai,
    appearance: copy.summaries.appearance,
    privacy: copy.summaries.privacy,
  };
}
