/**
 * `2M-NOTIFY-001`, `-002` and `-010` — what a notification consent **is**,
 * declared before anything can be sent under one.
 *
 * ## Governance first, delivery second, and why the order is the point
 *
 * The implementation plan splits this deliberately: slice 2M.4a ships the
 * governance and **may not begin 2M.4b until it is merged with CI green on its
 * merge SHA**. So this module declares the shape, the states, the transitions
 * and the absence rule — and there is no table behind it yet, no subscription,
 * no sender and no service-worker handler. Migration 2 models the persistence in
 * 2M.4b, and `phase-2m-push-boundary-guard.test.ts` fails the build if a push
 * artifact appears anywhere before then.
 *
 * That ordering is the same discipline `2M-METRICS-001` applies to telemetry —
 * *the migration that admits an event is deployed before the first producer
 * exists* — pointed at consent instead: **the rules that decide whether a
 * delivery is permitted exist, and are tested, before anything can deliver.** A
 * consent model written alongside its first sender is a consent model shaped by
 * what the sender found convenient.
 *
 * ## Absence is a decision, and the decision is "no"
 *
 * `2M-NOTIFY-002`: *"absence of a consent record means **no delivery**, never a
 * default-on."* `resolveConsent(undefined)` therefore returns a record in the
 * **`unsupported`** state with no permission, rather than `null` or a partially
 * filled object a caller could misread. There is no code path in this module
 * that returns "permitted" without a record saying so.
 *
 * ## The five states are distinguishable, not a boolean with extra words
 *
 * `2M-NOTIFY-010` requires `granted`, `denied`, `unsupported`, `revoked` and
 * `expired` to be five distinguishable states **with defined behaviour and
 * defined copy**. They differ in what the product may do next, which is the only
 * definition that matters:
 *
 * | state | may deliver | may ask again | what the user is told |
 * |---|---|---|---|
 * | `granted` | yes | no — it is already granted | how to revoke |
 * | `denied` | no | **no** — the browser refuses a second prompt from the page | how to change it in the browser |
 * | `unsupported` | no | no | that this browser cannot, and on iOS that it needs the installed app |
 * | `revoked` | no | yes — the user withdrew it and may re-grant | how to turn it back on |
 * | `expired` | no | yes — the subscription lapsed, not the intent | that it lapsed and can be renewed |
 *
 * `denied` and `revoked` are the pair a boolean would collapse, and collapsing
 * them produces the worst behaviour in the product: re-prompting a user whose
 * browser will never show the prompt again, forever, with no way to explain why
 * nothing happens.
 */

import {
  notificationChannels,
  notificationConsentStates,
  type NotificationChannel,
  type NotificationConsentState,
} from "@/features/product-analytics/contracts";

export { notificationChannels, notificationConsentStates };
export type { NotificationChannel, NotificationConsentState };

/**
 * The notification types a user may mute independently.
 *
 * Declared here rather than derived from the `notifications` table's `type`
 * column, because that column carries every row the product has ever written
 * and a mute list is a **product** vocabulary the user is shown. A closed set,
 * so a control can never offer a type nothing can produce.
 */
export const notificationTypes = ["reminder", "follow_up", "review", "digest"] as const;
export type NotificationType = (typeof notificationTypes)[number];

/**
 * How often a user is willing to be interrupted, as a closed set.
 *
 * `off` is a member and not the absence of a value: "I want none of these" is a
 * choice the user made, and modelling it as a missing frequency would make it
 * indistinguishable from a preference that was never read.
 */
export const notificationFrequencies = ["immediate", "daily_digest", "off"] as const;
export type NotificationFrequency = (typeof notificationFrequencies)[number];

/**
 * The consent record's declared shape.
 *
 * Everything a delivery decision needs and **nothing that identifies content**.
 * There is no title, no body, no task reference and no free-form column here,
 * and `2M-NOTIFY-007` makes that structural rather than customary: the type has
 * nowhere to put content, so a sender cannot smuggle any through the consent.
 */
export type NotificationConsent = Readonly<{
  channel: NotificationChannel;
  state: NotificationConsentState;
  /** When the state was last recorded. ISO instant, never a local string. */
  recordedAt: string | null;
  /** Types the user has NOT muted. An empty list is a valid, meaningful choice. */
  enabledTypes: readonly NotificationType[];
  frequency: NotificationFrequency;
  /** `HH:MM` in the user's own zone, or null when they declared none. */
  quietStart: string | null;
  quietEnd: string | null;
  /** The user's own ceiling on interruptions per local day. */
  dailyCap: number;
}>;

/**
 * The state a caller gets when there is no record at all.
 *
 * **`unsupported`, not `denied`.** The user has not refused anything — the
 * product simply has no basis to deliver, which is what `unsupported` means for
 * a channel that has not been established. Recording it as `denied` would tell
 * the user they said no when they were never asked.
 */
export const NO_CONSENT: NotificationConsent = Object.freeze({
  channel: "push",
  state: "unsupported",
  recordedAt: null,
  enabledTypes: Object.freeze([]),
  frequency: "off",
  quietStart: null,
  quietEnd: null,
  dailyCap: 0,
});

/** Whether a value is one of the four declared types. */
export function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === "string" && (notificationTypes as readonly string[]).includes(value);
}

export function isNotificationFrequency(value: unknown): value is NotificationFrequency {
  return typeof value === "string" && (notificationFrequencies as readonly string[]).includes(value);
}

export function isNotificationConsentState(value: unknown): value is NotificationConsentState {
  return typeof value === "string" && (notificationConsentStates as readonly string[]).includes(value);
}

/**
 * Narrows an unvalidated row into the contract, **fail-closed**.
 *
 * Every unrecognised value resolves toward *less* delivery, never more: an
 * unreadable state becomes `unsupported`, an unreadable frequency becomes `off`,
 * an unreadable type list becomes empty, and an unreadable cap becomes zero. The
 * direction is the whole point — a fail-open parser here would deliver to
 * somebody whose consent could not be read, which is the one outcome
 * `2M-NOTIFY-002` forbids by name.
 */
export function resolveConsent(row: unknown): NotificationConsent {
  if (typeof row !== "object" || row === null) return NO_CONSENT;
  const candidate = row as Record<string, unknown>;

  const state = isNotificationConsentState(candidate.state) ? candidate.state : "unsupported";
  const types = Array.isArray(candidate.enabledTypes)
    ? candidate.enabledTypes.filter(isNotificationType)
    : [];
  const cap = typeof candidate.dailyCap === "number" && Number.isInteger(candidate.dailyCap) && candidate.dailyCap >= 0
    ? candidate.dailyCap
    : 0;
  const time = (value: unknown) =>
    typeof value === "string" && /^\d{2}:\d{2}(:\d{2})?$/.test(value) ? value.slice(0, 5) : null;

  return Object.freeze({
    channel: "push",
    state,
    recordedAt: typeof candidate.recordedAt === "string" ? candidate.recordedAt : null,
    enabledTypes: Object.freeze([...new Set(types)]),
    frequency: isNotificationFrequency(candidate.frequency) ? candidate.frequency : "off",
    quietStart: time(candidate.quietStart),
    quietEnd: time(candidate.quietEnd),
    dailyCap: cap,
  });
}

/**
 * Whether this state permits a delivery **at all**, before any other control.
 *
 * Exactly one of the five does. Written as an explicit list rather than
 * `state !== "denied"` so that a sixth state added later is refused by default:
 * a new state is not permitted to deliver until somebody decides it is.
 */
export function consentPermitsDelivery(state: NotificationConsentState): boolean {
  return state === "granted";
}

/**
 * Whether the product may raise the browser's permission prompt for this state.
 *
 * `2M-NOTIFY-003` bounds *where* and *when* a prompt may be raised; this bounds
 * *whether*. `denied` is false because the browser will not show the prompt
 * again from the page — asking would be a control whose only possible outcome is
 * nothing happening, which is `2F-SURFACE-009` in another domain.
 */
export function mayRequestPermission(state: NotificationConsentState): boolean {
  return state === "revoked" || state === "expired" || state === "unsupported";
}

/**
 * The state a revocation produces, and the one thing it must not produce.
 *
 * `2M-NOTIFY-001` requires revocation to *"take effect without a further
 * step"*, so this is a total function with no failure mode: whatever the record
 * said, the answer is `revoked`, immediately. It never returns `denied` —
 * withdrawing consent is not the browser refusing, and the difference decides
 * whether the user can ever turn it back on.
 */
export function revoke(consent: NotificationConsent, at: string): NotificationConsent {
  return Object.freeze({
    ...consent,
    state: "revoked",
    recordedAt: at,
    /*
     * The types and the frequency are **left as they were**, deliberately.
     * A user who revokes and later re-grants has not asked to lose the
     * preferences they set, and clearing them here would make revocation
     * destructive — which would in turn make it something people hesitate to
     * do, which is the opposite of "takes effect without a further step".
     */
  });
}
