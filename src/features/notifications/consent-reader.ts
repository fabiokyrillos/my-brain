import "server-only";

/**
 * The owner-scoped read behind the notification settings surface.
 *
 * ## Why it assembles from two tables
 *
 * `2M-NOTIFY-004`'s three controls do not all live in the same place, and that
 * is deliberate rather than accidental. Type and frequency are **this
 * channel's** and live on `notification_consents`. Quiet hours and the daily
 * cap are **the whole product's** — `agent_preferences.quiet_start`,
 * `.quiet_end` and `.max_followups_per_day`, which the heartbeat has read since
 * `202607160007` — so slice 2M.4b's migration deliberately created no second
 * copy of them. A second copy is how a user sets quiet hours once and still
 * gets pushed at 03:00.
 *
 * So the surface reads both and presents one coherent picture, and
 * `resolveConsent` from slice 2M.4a is what turns the two rows into the
 * contract, **fail-closed in every field**.
 *
 * ## Absence is `unsupported`, never a default-on
 *
 * `2M-NOTIFY-002`. A missing consent row, an unreadable one, or a failed query
 * all resolve through `NO_CONSENT`. There is no path here that returns
 * something a caller could mistake for permission.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import { NO_CONSENT, resolveConsent, type NotificationConsent } from "./consent-contract";

/** `HH:MM:SS` from a `time` column, or `HH:MM`, narrowed to `HH:MM`. */
function toClockTime(value: unknown, fallback: string): string {
  return typeof value === "string" && /^\d{2}:\d{2}/.test(value) ? value.slice(0, 5) : fallback;
}

export async function readPushConsent(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<NotificationConsent> {
  const [consentResult, preferencesResult] = await Promise.all([
    supabase
      .from("notification_consents")
      .select("state,recorded_at,enabled_types,frequency")
      .eq("user_id", userId)
      .eq("channel", "push")
      .maybeSingle(),
    supabase
      .from("agent_preferences")
      .select("quiet_start,quiet_end,max_followups_per_day")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  // A failed read is not an excuse to guess. `NO_CONSENT` is `unsupported`
  // with an empty type list and a cap of zero, so an unreadable state produces
  // no delivery and no control.
  if (consentResult.error || consentResult.data === null) return NO_CONSENT;

  const preferences = preferencesResult.error ? null : preferencesResult.data;

  return resolveConsent({
    state: consentResult.data.state,
    recordedAt: consentResult.data.recorded_at,
    enabledTypes: consentResult.data.enabled_types,
    frequency: consentResult.data.frequency,
    quietStart: toClockTime(preferences?.quiet_start, "22:30"),
    quietEnd: toClockTime(preferences?.quiet_end, "07:00"),
    dailyCap: typeof preferences?.max_followups_per_day === "number"
      ? preferences.max_followups_per_day
      : 0,
  });
}

/**
 * The PUBLIC half of the VAPID pair, read from the server environment.
 *
 * Returns `null` when unset, and the surface renders an honest "not available"
 * rather than a control that would produce a subscription nothing can deliver
 * to. **The private half is never read here, never sent to a client, and is not
 * referenced anywhere in `src/`** — it exists only where the sender runs.
 */
export function readVapidPublicKey(): string | null {
  const value = process.env.VAPID_PUBLIC_KEY;
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}
