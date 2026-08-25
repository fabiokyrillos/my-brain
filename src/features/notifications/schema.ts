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

/**
 * `2S-SILENCE-007` — the shape the silencing controls submit, and **nothing
 * more than a shape.**
 *
 * ## Why this is deliberately weak
 *
 * The Server Action that consumes it is an **adapter** to
 * `public.suppress_notification_subject`, which is the authority. It must not
 * carry a rule of its own, and must not duplicate the RPC's semantics or its
 * ownership check.
 *
 * A first draft of this schema did exactly that — `reason` bounded to 1..400,
 * `scope` as an enum, `entityType` as an enum — each one restating a CHECK the
 * table already enforces. Two problems, and the second is the one that matters:
 *
 * 1. **Two validators for one contract disagree the moment either moves.** The
 *    400 here and the `char_length(btrim(reason)) between 1 and 400` there are
 *    one truth written twice, which this repository has already paid for.
 * 2. **It actively made the product worse.** The RPC refuses by NAME —
 *    `SUPPRESSION_REASON_MISSING`, `SUPPRESSION_SCOPE_UNSUPPORTED`,
 *    `SUPPRESSION_UNBOUNDED`, `SUPPRESSION_PAST_DATED`,
 *    `SUPPRESSION_MALFORMED` — so the owner gets a sentence about the thing they
 *    did. A schema that rejected those inputs first would have converted every
 *    one of them into an undifferentiated `invalid`, throwing away the exact
 *    distinction slice 2S.1 built six separate refusals to provide.
 *
 * So this checks only what the adapter itself needs to assemble the call: that
 * the fields are present and are strings. **Every judgement about whether a
 * suppression is legitimate belongs to the RPC**, including ownership, which
 * nothing on this side can prove anyway.
 */
export const suppressSubjectSchema = z.object({
  entityType: z.string(),
  entityId: z.string(),
  scope: z.string(),
  suppressedUntil: z.string().optional(),
  noticeType: z.string().optional(),
  reason: z.string(),
});

export type SuppressSubjectInput = z.infer<typeof suppressSubjectSchema>;
