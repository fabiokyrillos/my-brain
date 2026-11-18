/**
 * Hoje's greeting: which part of the day it is for the owner, and what to call
 * them.
 *
 * ## Why this is its own module
 *
 * The greeting used to be the literal "Boa tarde." — the owner's recording
 * shows it at 23:47. Fixing that needs two decisions, and both are rules rather
 * than rendering: *which hour is it, where the owner is* and *is this string a
 * name a person would want to be greeted by*. `home-view.tsx` renders under
 * jsdom with no clock and no zone, and it must stay that way, so both rules live
 * here as pure functions the dashboard calls and the view only reads.
 *
 * ## The zone is the owner's, never the host's
 *
 * `LDC-HOME-001` is the same defect one line up: a day label built from the
 * server's clock named a different day than the list under it for three hours
 * every evening. A greeting computed in the host's zone would say "Bom dia" to
 * someone reading at 23:47. So the instant and the zone are both parameters,
 * and a zone this product will not compute a day in (`isSupportedTimeZone`)
 * produces **no answer** rather than a plausible wrong one.
 */

import { isSupportedTimeZone } from "@/lib/time/local-day";

export const PARTS_OF_DAY = ["morning", "afternoon", "evening"] as const;
export type PartOfDay = (typeof PARTS_OF_DAY)[number];

/** First hour of the morning. 00:00–04:59 is still the night before. */
const MORNING_STARTS_AT = 5;
const AFTERNOON_STARTS_AT = 12;
const EVENING_STARTS_AT = 18;

/**
 * What the view model carries. `partOfDay` is `null` when the hour could not be
 * read in the owner's zone, and `name` is `null` when there is nothing fit to
 * greet by; the copy module has a sentence for every combination.
 */
export type HomeGreeting = {
  readonly partOfDay: PartOfDay | null;
  readonly name: string | null;
};

/**
 * The part of the day `instant` falls in, on the wall clock of `timeZone`.
 *
 * 05:00–11:59 morning, 12:00–17:59 afternoon, 18:00–04:59 evening.
 *
 * Returns `null` — never throws — for a zone the product does not support or an
 * instant that is not one. The caller then greets without naming a part of the
 * day, which is the only honest thing left to say.
 */
export function partOfDayIn(instant: Date, timeZone: string): PartOfDay | null {
  if (!isSupportedTimeZone(timeZone)) return null;
  if (!Number.isFinite(instant.getTime())) return null;

  // `h23` so midnight is 0 and never 24; the default cycle for `en-US` would
  // answer 12 for both noon and midnight.
  const hourPart = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(instant)
    .find((part) => part.type === "hour");
  const hour = Number(hourPart?.value);
  if (!Number.isInteger(hour)) return null;

  if (hour >= MORNING_STARTS_AT && hour < AFTERNOON_STARTS_AT) return "morning";
  if (hour >= AFTERNOON_STARTS_AT && hour < EVENING_STARTS_AT) return "afternoon";
  return "evening";
}

/** The longest name the heading will carry. A cap, so a pasted paragraph cannot become the `<h1>`. */
export const GREETING_NAME_MAX_LENGTH = 40;

/**
 * Values that sit in `display_name` and are not a name.
 *
 * `profile/actions.ts` falls back to "Usuário" when the auth metadata has no
 * name, and saving Settings then stores that word; `account-copy.ts` renders
 * "Sua conta"/"Your account" in the same gap. Greeting someone as "Bom dia,
 * Usuário." tells them the product does not know who they are while pretending
 * that it does.
 */
const PLACEHOLDER_NAMES = new Set(["usuário", "usuario", "user", "sua conta", "your account"]);

/**
 * The name to greet by, or `null` when there is none worth using.
 *
 * The **first word** of the display name: "Fábio Kyrillos" is greeted as
 * "Fábio". `null` for anything that is not a string, for an empty or
 * whitespace-only value, for a known placeholder, and for anything containing
 * "@" — an e-mail address in the page's heading would put a credential-adjacent
 * identifier into every screenshot of Hoje, which is the reason
 * `account-identity.ts` refuses to render one too.
 *
 * The result is plain text for React to escape; nothing here produces markup.
 */
export function greetingName(displayName: unknown): string | null {
  if (typeof displayName !== "string") return null;
  const trimmed = displayName.trim();
  if (trimmed === "") return null;
  if (trimmed.includes("@")) return null;
  if (PLACEHOLDER_NAMES.has(trimmed.toLocaleLowerCase("pt-BR"))) return null;

  const first = trimmed.split(/\s+/u)[0] ?? "";
  // By code point, so the cap cannot cut a surrogate pair in half.
  const capped = Array.from(first).slice(0, GREETING_NAME_MAX_LENGTH).join("");
  return capped === "" ? null : capped;
}
