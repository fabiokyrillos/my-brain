"use server";

/**
 * `2M-NOTIFY-001`, `-004`, `-010` and `-011` — the four writes the notification
 * surface can make, and the authority behind each.
 *
 * ## Why the writes live here and the rules live next door
 *
 * `consent-contract.ts`, `governance.ts` and `payload.ts` shipped in slice
 * 2M.4a as **pure decision modules**: no client, no fetch, no writer, no
 * Server Action. That is still true, and `phase-2m-notification-boundary-guard.test.ts`
 * still asserts it file by file. This module is the delivery half the guard
 * always expected 2M.4b to add, and it is named in the guard's allowlist rather
 * than exempted by widening the directory scan — the same discipline the push
 * boundary guard uses.
 *
 * ## Nothing here decides anything
 *
 * Every authorization decision is the database's. These functions authenticate,
 * parse the untrusted input, call one validated `SECURITY DEFINER` RPC and map
 * the outcome to typed copy. There is no branch here that grants consent, and
 * no argument through which a caller could name another user: the RPCs take the
 * owner from `auth.uid()`, never from a parameter.
 *
 * ## No `service_role`, anywhere on this path
 *
 * `2M-NOTIFY-011` forbids a `service_role` client on a product path. Every call
 * below goes through the ordinary authenticated server client under RLS. The
 * only `service_role` in this slice is the leased worker's, which is a
 * background path and is not reachable from a browser.
 */

import { assertActiveAccount } from "@/lib/auth/require-user";
import { resolveLocale } from "@/lib/preferences";
import { createClient } from "@/lib/supabase/server";
import { recordProductEvent } from "@/features/product-analytics/server";

import { notificationConsentStates, type NotificationConsentState } from "./consent-contract";
import {
  notificationPreferencesSchema,
  pushSubscriptionSchema,
  reportableConsentStateSchema,
} from "./schema";

export type NotificationActionResult =
  | Readonly<{ ok: true; state: NotificationConsentState }>
  | Readonly<{ ok: false; code: "unauthenticated" | "invalid" | "failed" }>;

const FAILED: NotificationActionResult = Object.freeze({ ok: false, code: "failed" });
const INVALID: NotificationActionResult = Object.freeze({ ok: false, code: "invalid" });
const UNAUTHENTICATED: NotificationActionResult = Object.freeze({ ok: false, code: "unauthenticated" });

function isConsentState(value: unknown): value is NotificationConsentState {
  return typeof value === "string" && (notificationConsentStates as readonly string[]).includes(value);
}

/**
 * The locale arrives from the caller and is RESOLVED rather than trusted.
 *
 * `resolveLocale` falls back to the default for anything unrecognised, so a
 * caller cannot steer the lifecycle redirect to an arbitrary path by naming a
 * locale that does not exist.
 */
async function authenticate(localeInput: unknown) {
  const locale = resolveLocale(localeInput);
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  // The lifecycle gate every authenticated write in this repository runs after
  // establishing the user: a suspended or deleted account must not be able to
  // register a device it will keep being notified on.
  await assertActiveAccount(supabase, user.id, locale);
  return { supabase, locale };
}

/**
 * Records the consent transition, best-effort and **after** the domain write.
 *
 * Never before: `2M-METRICS-001`'s ordering is that a producer follows the
 * thing it describes, and an event recorded for a write that then failed is a
 * funnel reporting consent nobody gave.
 */
async function recordConsentChanged(
  locale: string,
  state: NotificationConsentState,
): Promise<void> {
  await recordProductEvent({
    name: "notification_consent_changed",
    /*
     * `server`, written as a LITERAL beside the event name and not behind a
     * constant.
     *
     * `phase-2m-telemetry-guard.test.ts` reads this statically to prove the
     * surface is one the deployed chain admits, and it cannot follow an
     * identifier. That guard exists because Phase 2K closed with every event
     * silently refused: the names were admitted and the SURFACE was not, inside
     * a `.catch(() => {})` that swallowed the refusal. A named constant here
     * would be tidier and would put this producer back outside what the guard
     * can see.
     *
     * The value is also the truthful one. There is no `notifications` surface in
     * the deployed vocabulary, and declaring one would be a vocabulary change —
     * migration 1's territory, already spent, and R-13 refuses this migration
     * carrying another's contents. Both notification events really are recorded
     * by the server, one from this Server Action and one from the leased worker.
     */
    surface: "server",
    locale,
    viewportClass: "unknown",
    appVersion: "server",
    properties: { channel: "push", state },
  }).catch(() => {});
}

/**
 * `2M-NOTIFY-011` — the browser produced a real subscription, so consent is
 * `granted`. This is the only path to `granted`, by design.
 */
export async function registerPushSubscription(input: unknown, locale?: unknown): Promise<NotificationActionResult> {
  const parsed = pushSubscriptionSchema.safeParse(input);
  if (!parsed.success) return INVALID;

  const session = await authenticate(locale);
  if (!session) return UNAUTHENTICATED;

  const { error } = await session.supabase.rpc("register_push_subscription", {
    p_endpoint: parsed.data.endpoint,
    p_p256dh: parsed.data.p256dh,
    p_auth: parsed.data.auth,
  });
  // A `22023` is the database refusing the same thing the schema refuses; it is
  // reported as invalid rather than as a failure so the surface can say which.
  if (error) return error.code === "22023" ? INVALID : FAILED;

  await recordConsentChanged(session.locale, "granted");
  return Object.freeze({ ok: true, state: "granted" });
}

/**
 * `2M-NOTIFY-001` — revocation "takes effect without a further step".
 *
 * One RPC, one transaction: the consent and every subscription are marked
 * together, because a revocation that left a subscription active would be one
 * the sender could still deliver against (T-09).
 */
export async function revokePushConsent(locale?: unknown): Promise<NotificationActionResult> {
  const session = await authenticate(locale);
  if (!session) return UNAUTHENTICATED;

  const { error } = await session.supabase.rpc("revoke_push_consent");
  if (error) return FAILED;

  await recordConsentChanged(session.locale, "revoked");
  return Object.freeze({ ok: true, state: "revoked" });
}

/**
 * The three states only the browser can observe — `denied`, `unsupported`,
 * `expired`. `granted` is refused by the schema and again by the RPC.
 */
export async function reportPushConsentState(input: unknown, locale?: unknown): Promise<NotificationActionResult> {
  const parsed = reportableConsentStateSchema.safeParse(input);
  if (!parsed.success) return INVALID;

  const session = await authenticate(locale);
  if (!session) return UNAUTHENTICATED;

  const { error } = await session.supabase.rpc("record_push_consent_state", {
    p_state: parsed.data,
  });
  if (error) return error.code === "22023" ? INVALID : FAILED;

  await recordConsentChanged(session.locale, parsed.data);
  return Object.freeze({ ok: true, state: parsed.data });
}

/**
 * `2M-NOTIFY-004` — the per-type, per-frequency and quiet-period controls.
 *
 * Type and frequency are this channel's and go to the consent record; quiet
 * hours and the daily cap go to `agent_preferences`, where the heartbeat has
 * always read them. That split is the reason this slice's migration carries no
 * quiet-hours column: one promise, one pair of columns, and no second source of
 * truth that could disagree with the one the in-app path obeys.
 */
export async function updateNotificationPreferences(input: unknown, locale?: unknown): Promise<NotificationActionResult> {
  const parsed = notificationPreferencesSchema.safeParse(input);
  if (!parsed.success) return INVALID;

  const session = await authenticate(locale);
  if (!session) return UNAUTHENTICATED;

  const { error } = await session.supabase.rpc("update_notification_preferences", {
    p_enabled_types: parsed.data.enabledTypes,
    p_frequency: parsed.data.frequency,
    p_quiet_start: parsed.data.quietStart,
    p_quiet_end: parsed.data.quietEnd,
    p_daily_cap: parsed.data.dailyCap,
  });
  if (error) return error.code === "22023" ? INVALID : FAILED;

  // Deliberately NOT a `notification_consent_changed`: the consent state did
  // not change. Recording one here would inflate the funnel's consent
  // transitions with events that are preference edits.
  const { data } = await session.supabase
    .from("notification_consents")
    .select("state")
    .eq("channel", "push")
    .maybeSingle();

  return Object.freeze({
    ok: true,
    state: isConsentState(data?.state) ? data.state : "unsupported",
  });
}
