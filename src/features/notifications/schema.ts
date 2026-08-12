/**
 * `2M-NOTIFY-011` — the untrusted boundary between a browser and the consent
 * state machine, validated before it reaches the database.
 *
 * The subscription's three fields arrive from `PushManager.subscribe()`, which
 * means they arrive from the *page* — and a page is a client. The database
 * validates them again (`register_push_subscription` refuses an empty or
 * non-https endpoint), and this validates them first, which is the repository's
 * standing rule that every untrusted boundary is parsed rather than trusted.
 *
 * Neither layer is redundant: this one produces a typed refusal the surface can
 * render in the user's language, and the database one holds even if a future
 * caller forgets this module exists.
 */

import { z } from "zod";

import { notificationFrequencies, notificationTypes } from "./consent-contract";

/**
 * The endpoint is a URL the *server* will later POST to, so an unvalidated one
 * is a request-forgery primitive with a user id attached. `https` only, and
 * bounded — the database's CHECK uses the same bounds.
 */
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().startsWith("https://").min(20).max(2048),
  p256dh: z.string().min(16).max(256),
  auth: z.string().min(8).max(256),
});

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

/**
 * The three states a *client* may report.
 *
 * `granted` is deliberately absent, and this is the same refusal the database
 * makes: consent is concluded from a real subscription, never asserted by a
 * caller. A schema that accepted `granted` here would let a page claim consent
 * it never obtained.
 */
export const reportableConsentStateSchema = z.enum(["denied", "unsupported", "expired"]);

/** `HH:MM`, the shape the settings form produces and `time` accepts. */
const quietTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido");

export const notificationPreferencesSchema = z.object({
  enabledTypes: z.array(z.enum(notificationTypes)),
  frequency: z.enum(notificationFrequencies),
  quietStart: quietTimeSchema,
  quietEnd: quietTimeSchema,
  // The bound is `agent_preferences.max_followups_per_day`'s own CHECK,
  // restated so this path cannot offer a value the column would refuse.
  dailyCap: z.number().int().min(0).max(20),
});

export type NotificationPreferencesInput = z.infer<typeof notificationPreferencesSchema>;
