import { capabilityRegistry } from "@/features/shell/capabilities";
import { getCapabilitySummaryCopy } from "@/features/shell/capability-copy";
import type { Locale } from "@/lib/preferences";

/**
 * What a save actually changed, and what will now behave differently —
 * `2O-PREF-010`.
 *
 * ## The requirement's two halves, and why the second is the hard one
 *
 * *"Saving any preference states what changed and what will now behave
 * differently, **in the user's own words, not as a field list**."* Before this,
 * every save said *"Preferências salvas."* — which states neither half, and is
 * true of a save that changed nothing.
 *
 * A field list would have been the easy answer and is explicitly refused: *"tone,
 * quiet_start, weekly_review_day"* names the columns rather than the
 * consequences, and the person reading it did not choose a column.
 *
 * ## The effects are **not** written here
 *
 * They come from `capability-copy.ts` — the same sentences `CapabilitySummary`
 * renders as *what these preferences change*. That is the point rather than a
 * shortcut: the product already had to say what each capability does, in both
 * languages, and a second set of sentences for the save confirmation would be a
 * second thing to keep true. When they drifted, the one nobody was looking at
 * would be the one that lied.
 *
 * It also makes `capabilityRegistry` load-bearing a second way. `2O-PREF-008`
 * makes a control without a row a build failure; this makes a *changed* column
 * without a row silently unexplainable, which
 * `save-outcome.test.ts` asserts cannot happen for any column a control writes.
 *
 * ## Nothing changed is said, not hidden
 *
 * A save that changes nothing is an ordinary thing to do — open the page, look,
 * press the button. Reporting it as *"saved"* invites the reader to believe
 * something happened. It says so instead.
 */

/** `quietStart` → `quiet_start`. The payload speaks camelCase; the schema does not. */
export function toColumnName(field: string): string {
  return field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * The columns whose value the save actually altered.
 *
 * Compared as strings, deliberately: `weekly_review_day` is a number,
 * `important_reminder_override` a boolean, and the stored `time` columns arrive
 * as `HH:MM:SS` against an `HH:MM` payload. `String()` on both sides with the
 * time narrowed is the comparison that matches what the database will hold after
 * the write — a strict `!==` would report `"22:00"` against `"22:00:00"` as a
 * change on every single save.
 */
export function changedColumns(
  before: Readonly<Record<string, unknown>> | null,
  after: Readonly<Record<string, unknown>>,
): readonly string[] {
  if (before === null) return [];
  const changed: string[] = [];
  for (const [field, value] of Object.entries(after)) {
    const column = toColumnName(field);
    if (!(column in before)) continue;
    if (normalise(before[column]) !== normalise(value)) changed.push(column);
  }
  return changed;
}

function normalise(value: unknown): string {
  if (value === null || value === undefined) return "";
  // `22:00:00` and `22:00` are the same instant of the same preference.
  if (typeof value === "string" && /^\d{2}:\d{2}:\d{2}$/.test(value)) return value.slice(0, 5);
  return String(value);
}

/**
 * The capabilities those columns belong to, in the registry's own order.
 *
 * Only `visible` rows, because those are the ones with a sentence — an invisible
 * row has no copy by construction (`capability-copy.ts` is keyed by
 * `VisibleSettingsCapabilityKey`), and a save cannot change a preference that
 * has no control anyway.
 */
export function changedCapabilities(columns: readonly string[]): readonly string[] {
  const touched = new Set(columns);
  return capabilityRegistry
    .filter((capability) => capability.visible && capability.surface === "settings")
    .filter((capability) => capability.columns.some((column) => touched.has(column)))
    .map((capability) => capability.key);
}

export type SaveOutcomeCopy = Readonly<{ saved: string; unchanged: string }>;

const outcomeCopy: Record<Locale, SaveOutcomeCopy> = {
  "pt-BR": {
    saved: "Preferências salvas.",
    unchanged: "Nada mudou — as preferências já estavam assim.",
  },
  en: {
    saved: "Preferences saved.",
    unchanged: "Nothing changed — your preferences were already set this way.",
  },
};

/**
 * The sentence the form announces after a successful write.
 *
 * The registry's copy is reused verbatim, so what the save promises and what the
 * summary above it promises are the same words.
 */
export function describeSaveOutcome(
  locale: Locale,
  changed: readonly string[],
): string {
  if (changed.length === 0) return outcomeCopy[locale].unchanged;
  const copy = getCapabilitySummaryCopy(locale);
  const effects = changedCapabilities(changed)
    .map((key) => copy.entries[key as keyof typeof copy.entries]?.effect)
    .filter((effect): effect is string => Boolean(effect));
  /*
   * A changed column whose capability has no sentence falls back to the plain
   * confirmation rather than to silence. It should be unreachable — every
   * control is backed by a row (`2O-PREF-008`) and every visible row has copy —
   * and `save-outcome.test.ts` asserts it is, over the whole set of columns the
   * form writes. The fallback exists because "saved" is still true, and an empty
   * message would be worse than a plain one.
   */
  if (effects.length === 0) return outcomeCopy[locale].saved;
  return `${outcomeCopy[locale].saved} ${effects.join(" ")}`;
}
