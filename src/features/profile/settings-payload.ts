import type { ProfileInput } from "./schema";

export function buildSettingsPayload(input: ProfileInput) {
  const { displayName, locale, timezone, ...preferences } = input;
  return {
    profile: { displayName, locale, timezone },
    preferences,
  };
}
