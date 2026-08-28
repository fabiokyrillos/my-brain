import {
  base64UrlDecode,
  base64UrlEncode,
  createVapidAuthorization,
  encryptPushPayload,
  type PushSubscriptionKeys,
  vapidKeyPairAgrees,
} from "../_shared/web-push.ts";
import {
  buildWirePayload,
  isNotificationLocale,
  isNotificationType,
  type NotificationLocale,
  type NotificationType,
} from "../_shared/notification-payload.ts";

/**
 * `2M-NOTIFY-005`, `-009`, `-010` and `-011` — the send, and everything it is
 * not allowed to decide for itself.
 *
 * ## The shape: this module obeys, the database decides
 *
 * Every governance control — consent, the muted type, the frequency, quiet
 * hours, deduplication, the 24-hour cooldown and the daily cap — is applied by
 * `public.begin_push_delivery` **before** this module learns whether it may
 * send. That is deliberate and it is the requirement: `2M-NOTIFY-005` forbids
 * inheriting the in-app controls "by assumption", and a control implemented here
 * in TypeScript would be a second copy that could disagree with the one the
 * heartbeat obeys. So the order of the six is asserted in one place, in SQL,
 * against the same `agent_preferences` columns the in-app path reads, and this
 * module cannot reach around it: there is no code path below that sends without
 * a `delivery_id` the database issued.
 *
 * ## What it holds, and what it therefore cannot leak
 *
 * A user id, a notification TYPE, a locale and a 64-character digest. It never
 * loads a task, a reminder, an entry or a person, so `2M-NOTIFY-006`'s content
 * prohibition is not enforced here by care — there is no content in this
 * process to be careless with. The payload comes from `buildWirePayload`, which
 * takes a type and a locale and has no parameter a title could arrive through.
 *
 * ## Fail closed, and say which
 *
 * A missing VAPID key, a missing service credential, an unparseable request and
 * an unknown type all refuse BEFORE `begin_push_delivery` is called, so a
 * misconfigured deployment records nothing rather than recording a refusal it
 * did not really evaluate. Once a delivery IS begun, every exit path finishes
 * it — the `finally`-shaped guarantee below — because a `pending` row that
 * nobody ever finishes holds its dedupe slot forever and silently blocks that
 * item from ever being delivered again.
 */

/**
 * The `sub` claim used when `VAPID_SUBJECT` is not configured.
 *
 * It lives here rather than in the entrypoint so a test can assert its category
 * **by importing it**. The alternative — reading `index.ts` from disk — would
 * need `--allow-read`, and the worker suite deliberately runs with no `--allow-*`
 * flags at all so it can never reach a network.
 *
 * `.invalid` is RFC 2606 reserved and guaranteed never to resolve, which makes
 * this default an address no push service can act on. That is deliberate as a
 * *placeholder* and wrong as a *deployed value*; `categoriseVapidSubject` is
 * what makes the difference visible instead of silent.
 */
export const DEFAULT_VAPID_SUBJECT = "mailto:ops@my-brain.invalid";

/** Twelve hours, the ceiling RFC 8292 puts on a VAPID token's lifetime is 24. */
const VAPID_TTL_SECONDS = 12 * 60 * 60;
/** How long the push service may hold the message for a device that is offline. */
const PUSH_TTL_SECONDS = 6 * 60 * 60;

/**
 * The hosts a subscription endpoint may point at.
 *
 * The database refuses the shapes that are never legitimate — loopback, private
 * ranges, dotless hosts — because those are stable and a migration should not
 * need to change when a browser vendor appears. The POSITIVE list belongs here,
 * where it costs a redeploy rather than a migration, and it is the tighter of
 * the two: this is the process that actually makes the request, so this is where
 * "we only ever talk to real push services" has to be true.
 */
const ALLOWED_PUSH_HOSTS: readonly RegExp[] = [
  /^([a-z0-9-]+\.)*push\.services\.mozilla\.com$/,
  /^([a-z0-9-]+\.)*googleapis\.com$/,
  /^([a-z0-9-]+\.)*notify\.windows\.com$/,
  /^([a-z0-9-]+\.)*push\.apple\.com$/,
  /^([a-z0-9-]+\.)*wns\.windows\.com$/,
];

export type DeliveryRequest = Readonly<{
  userId: string;
  type: NotificationType;
  locale: NotificationLocale;
  dedupeHash: string;
}>;

/**
 * Why a single attempt did not land, as a CLOSED vocabulary.
 *
 * Added after a real iPhone reported `delivered=0, failed=1` and the function's
 * logs held nothing but boot and shutdown. Both failure paths — a non-2xx answer
 * and a thrown exception — appended to `failed` and said nothing, so a rejection
 * by Apple, a bad VAPID signature, a transport error and a malformed
 * subscription were all the same observation. That is the defect this vocabulary
 * exists to remove, and it was found on hardware because nothing here could have
 * found it.
 *
 * Every member is a constant chosen by this file. None is derived from the push
 * service's response body, from an exception message, or from anything belonging
 * to the user — so a category can be logged, returned and stored without any of
 * `2M-NOTIFY-006`'s prohibitions coming with it.
 */
export const deliveryFailureCategories = [
  // The push service answered, and the class of answer:
  "gone",              // 404/410 — the browser discarded the subscription
  "unauthorized",      // 401/403 — VAPID rejected: bad signature, `aud`, or `sub`
  "bad_request",       // 400 — the request itself was malformed
  "payload_too_large", // 413
  "rate_limited",      // 429
  "server_error",      // 5xx — the vendor is having a bad afternoon
  "unexpected_status", // any other non-2xx
  // The request never produced an answer:
  "host_not_allowed",       // refused before egress by the allowlist
  "subscription_malformed", // the stored keys are not usable
  "vapid_key_malformed",    // the configured key pair is not usable
  "network_error",          // DNS, TLS, timeout — fetch itself threw
  "unknown_error",          // anything else, and deliberately opaque
] as const;
export type DeliveryFailureCategory = (typeof deliveryFailureCategories)[number];

/**
 * WHY the push service refused, as a CLOSED vocabulary of the vendors' own
 * tokens — and never as their prose.
 *
 * Two hardware runs spent two of the owner's three strikes to learn the number
 * `403`, and `403` is where a rejected `sub`, a wrong `aud`, an unverifiable
 * signature, an unexpected key and a refused subscription all converge. The push
 * service knows which of those it was and says so, in a small JSON document, in
 * a field whose value comes from ITS OWN closed set — and this sender read the
 * status and threw the document away.
 *
 * So the document is read now, and it is read the only way it safely can be:
 * parsed as JSON, one named field taken, and that field's value admitted ONLY if
 * it matches a member of the list below by **exact equality**. Nothing is
 * extracted by scanning, because a scan over attacker-reachable text finds
 * whatever it was told to look for inside whatever else that text was carrying.
 * A body that is not JSON, is not an object, is too large to be a reason
 * document, or names something not on this list, collapses to `vendor_unknown`
 * and the body itself is discarded unread into the bargain.
 *
 * Every member is a constant chosen by THIS FILE. None is echoed from the wire —
 * the wire can only ever SELECT one of these — so a reason can be logged,
 * returned and stored without any of `2M-NOTIFY-006`'s prohibitions coming with
 * it, exactly as `deliveryFailureCategories` promises for the category.
 */
export const vendorReasons = [
  // Apple / APNs — the VAPID token itself.
  "BadJwtToken",
  "InvalidProviderToken",
  "ExpiredProviderToken",
  "MissingProviderToken",
  "TooManyProviderTokenUpdates",
  // Apple / APNs — the subscription, not the authentication.
  "BadSubscription",
  "BadDeviceToken",
  "Unregistered",
  "DeviceTokenNotForTopic",
  "TopicDisallowed",
  "BadTopic",
  "MissingTopic",
  // Apple / APNs — the request.
  "BadPath",
  "MethodNotAllowed",
  "PayloadEmpty",
  "PayloadTooLarge",
  "BadMessageId",
  "BadPriority",
  "BadExpirationDate",
  "BadCollapseId",
  "DuplicateHeaders",
  "InvalidPushType",
  "Forbidden",
  // Apple / APNs — load and lifecycle.
  "TooManyRequests",
  "IdleTimeout",
  "InternalServerError",
  "ServiceUnavailable",
  "Shutdown",
  // Ours, and deliberately last: these two are the only answers that are not a
  // vendor's word, and they are excluded from wire matching below so that a
  // service echoing one of them back cannot forge either.
  "vendor_unknown", // there was a body, and nothing on this list was in it
  "vendor_absent",  // there was no body at all
] as const;
export type VendorReason = (typeof vendorReasons)[number];

/** The subset that names an AUTHENTICATION failure and therefore points at us. */
export const vapidRejectionReasons: readonly VendorReason[] = [
  "BadJwtToken",
  "InvalidProviderToken",
  "ExpiredProviderToken",
  "MissingProviderToken",
];

/** The subset that names the SUBSCRIPTION and therefore points at the device. */
export const subscriptionRejectionReasons: readonly VendorReason[] = [
  "BadSubscription",
  "BadDeviceToken",
  "Unregistered",
];

/** Larger than any reason document and far smaller than a page. */
const MAX_REASON_BODY_BYTES = 2048;

/** The two sentinels the wire may never select, so neither can be forged. */
const OURS: readonly string[] = ["vendor_unknown", "vendor_absent"];
const WIRE_REASONS: ReadonlySet<string> = new Set(
  vendorReasons.filter((reason) => !OURS.includes(reason)),
);

/**
 * The push service's own word for what it refused, or one of our two sentinels.
 *
 * Never throws and never returns anything it read. The body is consumed here and
 * goes no further: there is no path from this function's input to its output
 * except selection from `vendorReasons`.
 */
export async function readVendorReason(response: Response): Promise<VendorReason> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    // A body that cannot be read is not a body. Nothing to report and nothing
    // to leak.
    return "vendor_absent";
  }
  if (text.trim() === "") return "vendor_absent";
  // A reason document is small. Anything larger is a page, an error screen or
  // an intermediary's HTML, and is not parsed at all.
  if (text.length > MAX_REASON_BODY_BYTES) return "vendor_unknown";

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return "vendor_unknown";
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return "vendor_unknown";

  const record = parsed as Record<string, unknown>;
  // `reason` is Apple's field name; `error` is the one the other services use.
  // Only these two are consulted, and only an EXACT member of the closed set is
  // admitted, so a value that merely CONTAINS a known token is not one.
  for (const field of ["reason", "error"]) {
    const value = record[field];
    if (typeof value === "string" && WIRE_REASONS.has(value)) return value as VendorReason;
  }
  return "vendor_unknown";
}

/**
 * One content-free diagnostic line. `status` is present only when the push
 * service actually answered, which is itself the distinction that was missing;
 * `reason` is present only when it answered with a document, and is always one
 * of `vendorReasons`.
 */
export type DeliveryDiagnostic = Readonly<{
  category: DeliveryFailureCategory;
  status?: number;
  reason?: VendorReason;
}>;

export type DeliveryOutcome =
  | Readonly<{
    status: "sent";
    delivered: number;
    retired: number;
    /** Every attempt that did not land, whoever's fault it was. */
    failed: number;
    /**
     * How many of those were reported to the database as the DEVICE's failure,
     * and therefore cost a subscription one of its three strikes.
     *
     * It exists to be read at a hardware checkpoint. `failed: 1, deviceStrikes:
     * 0` is the whole statement that a run diagnosed something at no cost to the
     * owner's only device, and it is the response's own word for what the RPC
     * payload asserts in the tests.
     */
    deviceStrikes: number;
    /** Content-free, one entry per attempt that did not land. */
    diagnostics: readonly DeliveryDiagnostic[];
    /** The VAPID `sub`'s category — never the address. */
    subject: "operational" | "reserved" | "malformed";
  }>
  | Readonly<{ status: "suppressed"; reason: string }>
  | Readonly<{ status: "refused"; code: string }>;

type SubscriptionRow = Readonly<{ id: string; endpoint: string; p256dh: string; auth: string }>;

type RpcClient = {
  rpc(name: string, payload: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
};

export type SenderConfig = Readonly<{
  vapidPublicKey: string;
  vapidPrivateKey: string;
  vapidSubject: string;
}>;

export type SenderDependencies = Readonly<{
  client: RpcClient;
  config: SenderConfig;
  fetch: typeof fetch;
  /** Injected so a test is not a clock reading. Seconds since the epoch. */
  nowSeconds: () => number;
  /** Host allowlist, injectable so the mutation control can prove it is load-bearing. */
  allowedHosts?: readonly RegExp[];
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEDUPE_HASH = /^[0-9a-f]{64}$/;

/**
 * Parses the request rather than trusting it.
 *
 * The caller is secret-authenticated, which authorises the REQUEST; it does not
 * make the body well-formed. `2M-NOTIFY-006` is enforced structurally here too:
 * there is no field in this type a caller could put text into, so a caller that
 * wanted to smuggle a title has nowhere to put it, and any extra key is
 * discarded rather than forwarded.
 */
export function parseDeliveryRequest(input: unknown): DeliveryRequest | null {
  if (input === null || typeof input !== "object") return null;
  const source = input as Record<string, unknown>;
  const userId = typeof source.userId === "string" && UUID.test(source.userId) ? source.userId : null;
  const dedupeHash = typeof source.dedupeHash === "string" && DEDUPE_HASH.test(source.dedupeHash)
    ? source.dedupeHash
    : null;
  if (userId === null || dedupeHash === null) return null;
  if (!isNotificationType(source.type) || !isNotificationLocale(source.locale)) return null;
  return Object.freeze({ userId, type: source.type, locale: source.locale, dedupeHash });
}

export function isAllowedPushHost(endpoint: string, allowed: readonly RegExp[] = ALLOWED_PUSH_HOSTS): boolean {
  let host: string;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:") return false;
    host = url.hostname.toLowerCase();
  } catch {
    return false;
  }
  return allowed.some((pattern) => pattern.test(host));
}

/**
 * Whether the configured VAPID `sub` is an address a push service could
 * actually use — as a CATEGORY, never as the address.
 *
 * RFC 8292 says `sub` is a `mailto:` or `https:` URI the push service operator
 * can contact you at, and Apple is documented as strict about it. This
 * deployment's DEFAULT is `mailto:ops@my-brain.invalid`, and `.invalid` is
 * RFC 2606 reserved and guaranteed never to resolve — so it is exactly the kind
 * of value a strict service is entitled to reject with 401/403, which is
 * indistinguishable from every other rejection until something says so.
 *
 * This is OBSERVATION, not a fix and not a guess about the cause. It returns a
 * three-value category so one hardware run can answer both "what did the push
 * service say" and "was our subject even usable", instead of needing two.
 */
export function categoriseVapidSubject(subject: string): "operational" | "reserved" | "malformed" {
  const mailto = /^mailto:[^@\s]+@([A-Za-z0-9.-]+)$/.exec(subject);
  let host: string | null = mailto ? mailto[1] : null;
  if (host === null && /^https:\/\//.test(subject)) {
    try {
      host = new URL(subject).hostname;
    } catch {
      host = null;
    }
  }
  if (host === null) return "malformed";
  // RFC 2606 / RFC 6761 reserved names, which no push service can reach.
  if (/\.(invalid|test|example|localhost|local)$/i.test(host)) return "reserved";
  if (/^example\.(com|net|org)$/i.test(host)) return "reserved";
  if (!host.includes(".")) return "malformed";
  return "operational";
}

/**
 * What the deployment's VAPID configuration IS, as categories — never as values.
 *
 * Hardware run 1 answered `unauthorized` with HTTP 403, which narrows the fault
 * to VAPID authentication and no further: a rejected `sub`, a wrong `aud`, a
 * signature the service could not verify and a key it was not expecting all
 * arrive as the same status. The `subject` half was already answerable from
 * here. The rest was not, and asking it cost a real push — one of three strikes
 * against the owner's only subscription, and an ambiguous NEXT reading.
 *
 * This is that question, asked offline.
 */
export type SenderConfigurationReport = Readonly<{
  subject: "operational" | "reserved" | "malformed";
  /**
   * Which FORM the `sub` takes — never the address.
   *
   * RFC 8292 admits `mailto:` and `https:` alike, and `categoriseVapidSubject`
   * therefore answers `operational` for both. That is correct about the RFC and
   * useless for telling the two apart, and "Apple is stricter than the RFC about
   * one of the two forms" is an unexcluded hypothesis that a scheme — a word
   * from a two-member set, carrying no address, no host and no user — is enough
   * to test. Adding it costs nothing and removes a reason to ask the device.
   */
  subjectScheme: "mailto" | "https" | "other";
  /**
   * `not_canonical` is its own answer because `k=` carries the configured TEXT.
   * A value that decodes to a real point but is padded, or re-encoded by some
   * tool along the way, produces a header parameter no service will match
   * against the subscription — while every length and shape check passes.
   */
  publicKey: "p256_point" | "not_canonical" | "malformed";
  privateKey: "p256_scalar" | "malformed";
  pair: "consistent" | "mismatched" | "unusable";
}>;

/**
 * Reads the configuration and reports on it. Touches no database, contacts no
 * push service, and cannot reach a subscription — so it may be run as often as
 * an owner likes, at no cost to a device.
 */
export async function inspectSenderConfiguration(
  config: SenderConfig,
): Promise<SenderConfigurationReport> {
  let publicKey: SenderConfigurationReport["publicKey"] = "malformed";
  try {
    const bytes = base64UrlDecode(config.vapidPublicKey);
    if (bytes.length === 65) {
      publicKey = base64UrlEncode(bytes) === config.vapidPublicKey ? "p256_point" : "not_canonical";
    }
  } catch {
    // Stays `malformed`: text that is not base64 is not a key.
  }

  let privateKey: SenderConfigurationReport["privateKey"] = "malformed";
  try {
    if (base64UrlDecode(config.vapidPrivateKey).length === 32) privateKey = "p256_scalar";
  } catch {
    // Stays `malformed`.
  }

  let pair: SenderConfigurationReport["pair"] = "unusable";
  if (publicKey !== "malformed" && privateKey !== "malformed") {
    try {
      pair = (await vapidKeyPairAgrees({
        publicKey: config.vapidPublicKey,
        privateKey: config.vapidPrivateKey,
      }))
        ? "consistent"
        : "mismatched";
    } catch {
      // A right-sized value that is off the curve. Not a pair, and not a
      // rotation either.
      pair = "unusable";
    }
  }

  return Object.freeze({
    subject: categoriseVapidSubject(config.vapidSubject),
    subjectScheme: categoriseVapidSubjectScheme(config.vapidSubject),
    publicKey,
    privateKey,
    pair,
  });
}

/** The `sub`'s scheme as a word from a closed set. Reads no host and no address. */
export function categoriseVapidSubjectScheme(subject: string): "mailto" | "https" | "other" {
  if (/^mailto:/i.test(subject)) return "mailto";
  if (/^https:\/\//i.test(subject)) return "https";
  return "other";
}

/**
 * A non-2xx status to a category. Status codes are the push service's, not the
 * user's, and carry nothing about who or what was being delivered.
 */
export function categoriseStatus(status: number): DeliveryFailureCategory {
  if (status === 404 || status === 410) return "gone";
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 400) return "bad_request";
  if (status === 413) return "payload_too_large";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server_error";
  return "unexpected_status";
}

/**
 * A thrown value to a category, **without ever reading its message into the
 * output**.
 *
 * The only messages consulted are the closed set this repository's own crypto
 * module throws, compared by exact equality. Everything else collapses to
 * `network_error` (fetch rejects with a `TypeError` for DNS, TLS and timeout) or
 * to `unknown_error`, which is deliberately opaque: a push service's exception
 * text is third-party data, and interpolating it into a log is exactly how an
 * endpoint or a token ends up somewhere it was promised not to be.
 */
export function categoriseThrown(error: unknown): DeliveryFailureCategory {
  const message = error instanceof Error ? error.message : "";
  if (message === "subscription_key_invalid" || message === "subscription_auth_invalid") {
    return "subscription_malformed";
  }
  if (message === "vapid_public_key_invalid" || message === "vapid_private_key_invalid") {
    return "vapid_key_malformed";
  }
  if (error instanceof TypeError) return "network_error";
  return "unknown_error";
}

function readSubscriptions(value: unknown): SubscriptionRow[] {
  if (!Array.isArray(value)) return [];
  const rows: SubscriptionRow[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.endpoint !== "string") continue;
    if (typeof row.p256dh !== "string" || typeof row.auth !== "string") continue;
    rows.push({ id: row.id, endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth });
  }
  return rows;
}

/**
 * Records which control refused, and never what was not sent.
 *
 * `2M-METRICS-001`'s producer for `notification_suppressed`. The properties are
 * exactly the two the deployed validator admits — `channel` and `reason` — and
 * the reason is the database's own, passed through rather than re-derived here:
 * a second mapping from control to name is a second thing that can disagree with
 * the ledger it is describing.
 *
 * Best-effort by construction. A telemetry failure must never turn a correct
 * suppression into an error, because the suppression already happened and the
 * user's quiet hours were already honoured.
 */
export async function recordSuppression(
  client: RpcClient,
  input: Readonly<{ userId: string; locale: string; reason: string; dedupeHash: string }>,
): Promise<boolean> {
  try {
    // Idempotency scoped to the owner, the reason and the ITEM, so a retry of
    // the same refusal is one event and two different refusals are two.
    const scope = new TextEncoder().encode(
      ["notification_suppressed", input.userId, input.reason, input.dedupeHash].join(""),
    );
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", scope)).slice(0, 16);
    digest[6] = (digest[6] & 0x0f) | 0x50;
    digest[8] = (digest[8] & 0x3f) | 0x80;
    const hex = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
    const idempotencyKey =
      `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;

    const { error } = await client.rpc("record_product_event_for_user", {
      p_user_id: input.userId,
      p_event_name: "notification_suppressed",
      // `server` rather than a `notifications` surface: declaring a new surface
      // is a vocabulary change, which is migration 1's territory and already
      // spent. It is also the truthful one — this really is recorded by the
      // server, from a leased worker with no browsing surface at all.
      p_surface: "server",
      p_locale: input.locale,
      p_viewport_class: "unknown",
      p_app_version: "worker",
      p_properties: { channel: "push", reason: input.reason },
      p_subject_type: null,
      p_subject_id: null,
      p_session_id: null,
      p_idempotency_key: idempotencyKey,
      p_is_synthetic: false,
    });
    if (error) {
      console.warn("[send-push] suppression event rejected", { code: error.code ?? "unknown" });
      return false;
    }
    return true;
  } catch {
    console.warn("[send-push] suppression event unavailable");
    return false;
  }
}

/**
 * The whole delivery, from the database's permission to the push service's
 * answer and back to the database's ledger.
 */
export async function deliverPush(
  request: DeliveryRequest,
  dependencies: SenderDependencies,
): Promise<DeliveryOutcome> {
  const { client, config, nowSeconds } = dependencies;
  const allowedHosts = dependencies.allowedHosts ?? ALLOWED_PUSH_HOSTS;

  // The payload is built BEFORE the delivery is begun. An unknown type must not
  // consume the dedupe slot and then fail to produce anything to send.
  const payload = buildWirePayload(request.type, request.locale);
  if (payload === null) return Object.freeze({ status: "refused", code: "payload_unavailable" });

  // The subject's CATEGORY, once per delivery, never its value.
  //
  // This used to WARN and send anyway, and that was the wrong shape for a
  // module whose header promises to fail closed. It is now measured rather than
  // suspected: against Apple's own Web Push endpoint, with a valid signature and
  // everything else held fixed, a `sub` on a reserved TLD draws
  // `403 BadJwtToken` while the SAME request with a real-TLD address gets past
  // authentication — for `mailto:` and `https:` alike, so the scheme is not what
  // decides it. `.invalid`, `.example`, `.localhost` and `.test` were each
  // rejected; `.com` was not.
  //
  // So a non-operational subject is not a warning. It is a request no push
  // service can authenticate, and sending it spends the dedupe slot and an
  // attempt on something that cannot succeed. Refusing here — BEFORE
  // `begin_push_delivery`, beside the key-pair check and for exactly the same
  // reason — is what this module already promised for a missing VAPID key.
  const subjectCategory = categoriseVapidSubject(config.vapidSubject);
  if (subjectCategory !== "operational") {
    console.error("[send-push] the VAPID subject is not an address a push service will accept", {
      subject: subjectCategory,
    });
    return Object.freeze({ status: "refused", code: "vapid_subject_unusable" });
  }

  // The last configuration check, and it happens BEFORE anything is begun.
  //
  // This module's header promises that a missing VAPID key refuses before
  // `begin_push_delivery`, "so a misconfigured deployment records nothing rather
  // than recording a refusal it did not really evaluate". A pair whose halves do
  // not belong together is a missing VAPID key in the only sense that matters —
  // no push service can authenticate it — and it was the one shape that slipped
  // through, because both halves are individually well-formed and this runtime
  // signs with `d` without ever consulting `x`/`y`.
  //
  // Refusing here rather than inside the loop is the point: the loop would spend
  // the dedupe slot, spend an attempt, and charge the DEVICE a strike for a
  // fault that is entirely ours. Three strikes retire a subscription, and the
  // owner has one.
  try {
    if (!await vapidKeyPairAgrees({
      publicKey: config.vapidPublicKey,
      privateKey: config.vapidPrivateKey,
    })) {
      console.error("[send-push] the configured VAPID pair does not authenticate");
      return Object.freeze({ status: "refused", code: "vapid_pair_mismatch" });
    }
  } catch {
    console.error("[send-push] the configured VAPID pair is not usable");
    return Object.freeze({ status: "refused", code: "vapid_key_malformed" });
  }

  const begun = await client.rpc("begin_push_delivery", {
    p_user_id: request.userId,
    p_type: request.type,
    p_dedupe_hash: request.dedupeHash,
  });
  if (begun.error) {
    console.error("[send-push] begin refused", { code: begun.error.code ?? "unknown" });
    return Object.freeze({ status: "refused", code: "begin_failed" });
  }

  const decision = (begun.data ?? {}) as Record<string, unknown>;
  if (decision.permitted !== true) {
    const reason = typeof decision.reason === "string" ? decision.reason : "not_consented";
    await recordSuppression(client, {
      userId: request.userId,
      locale: request.locale,
      reason,
      dedupeHash: request.dedupeHash,
    });
    return Object.freeze({ status: "suppressed", reason });
  }

  const deliveryId = typeof decision.delivery_id === "string" ? decision.delivery_id : null;
  const subscriptions = readSubscriptions(decision.subscriptions);
  if (deliveryId === null) {
    // Permitted with no id is not a state the database can produce, so reaching
    // here means the contract changed underneath this function. Refusing is the
    // only safe reading: sending without a ledger row would be an unauditable
    // delivery, which `2M-NOTIFY-009` forbids outright.
    console.error("[send-push] permitted without a delivery id");
    return Object.freeze({ status: "refused", code: "delivery_id_missing" });
  }

  const authorizationCache = new Map<string, string>();
  const gone: string[] = [];
  /** Reported to the database, and therefore charged to the device. */
  const failed: string[] = [];
  /**
   * NOT reported to the database, and therefore charged to nobody.
   *
   * A 401/403 is the push service saying it could not authenticate US. This
   * module already said so — "a rejected signature is our configuration being
   * wrong rather than the user's browser having discarded anything" — and then
   * charged the device anyway, because `finish_push_delivery` increments
   * `push_subscriptions.failure_count` for every id in
   * `p_failed_subscription_ids`, and the third strike sets `state = 'expired'`
   * and takes the consent out with the last device.
   *
   * Retirement was exactly 404/410 and that was correct; it was simply not the
   * only way this table retires a subscription. The owner's only device stood at
   * two strikes with `last_delivered_at` still null when that was found — one
   * more diagnostic run and there would have been nothing left to diagnose with.
   *
   * The delivery ROW still finishes as `failed` and still spends its own
   * `attempts`, so the message's retry ceiling is untouched. It is only the
   * DEVICE that stops paying for our configuration.
   */
  const unauthenticated: string[] = [];
  const diagnostics: DeliveryDiagnostic[] = [];
  let delivered = 0;

  /**
   * The single place a failure is recorded, so no path can add to `failed`
   * without also saying why. The previous version had two that did exactly
   * that, and an iPhone found it.
   */
  const note = (category: DeliveryFailureCategory, status?: number, reason?: VendorReason): void => {
    const line: DeliveryDiagnostic = {
      category,
      ...(status === undefined ? {} : { status }),
      ...(reason === undefined ? {} : { reason }),
    };
    diagnostics.push(line);
    // The log line carries the category, the status and the vendor's own closed
    // token, and NOTHING else — no endpoint, no subscription id, no owner, no
    // key, no payload, and no response body: `reason` is selected from
    // `vendorReasons` rather than read off the wire. `2M-NOTIFY-006` applies to
    // a log exactly as it applies to a push.
    console.error("[send-push] attempt failed", line);
  };

  for (const subscription of subscriptions) {
    // The last line before egress. The database already refused the shapes that
    // are never legitimate; this refuses everything that is not a push service
    // we actually know, and it refuses WITHOUT retiring the subscription --
    // a host we stopped recognising is our list being out of date, not the
    // user's browser having discarded anything.
    if (!isAllowedPushHost(subscription.endpoint, allowedHosts)) {
      note("host_not_allowed");
      failed.push(subscription.id);
      continue;
    }

    try {
      const origin = new URL(subscription.endpoint).origin;
      let authorization = authorizationCache.get(origin);
      if (authorization === undefined) {
        authorization = await createVapidAuthorization({
          endpoint: subscription.endpoint,
          publicKey: config.vapidPublicKey,
          privateKey: config.vapidPrivateKey,
          subject: config.vapidSubject,
          expiresAtSeconds: nowSeconds() + VAPID_TTL_SECONDS,
        });
        authorizationCache.set(origin, authorization);
      }

      const keys: PushSubscriptionKeys = { p256dh: subscription.p256dh, auth: subscription.auth };
      const body = await encryptPushPayload({
        plaintext: new TextEncoder().encode(JSON.stringify(payload)),
        keys,
      });

      const response = await dependencies.fetch(subscription.endpoint, {
        method: "POST",
        headers: {
          Authorization: authorization,
          "Content-Encoding": "aes128gcm",
          "Content-Type": "application/octet-stream",
          TTL: String(PUSH_TTL_SECONDS),
        },
        body: body as BodyInit,
      });

      if (response.ok) {
        delivered += 1;
      } else if (response.status === 404 || response.status === 410) {
        // The browser threw this subscription away. Retiring it is the required
        // outcome and retrying it can never succeed.
        //
        // RETIREMENT IS STILL EXACTLY 404/410 AND NOTHING ELSE. The diagnostic
        // vocabulary is wider than the retirement rule on purpose: a 401 now has
        // its own name so it can be SEEN, and it must still not retire a device,
        // because a rejected signature is our configuration being wrong rather
        // than the user's browser having discarded anything.
        note("gone", response.status, await readVendorReason(response));
        gone.push(subscription.id);
      } else {
        const category = categoriseStatus(response.status);
        note(category, response.status, await readVendorReason(response));
        // The one exemption, and it is exactly `unauthorized`. Everything else
        // — 400, 413, 429, 5xx, an unexpected status — is still the device's
        // strike, because `2M-NOTIFY-010`'s per-device ceiling is what stops a
        // subscription that fails every time from being retried forever.
        if (category === "unauthorized") unauthenticated.push(subscription.id);
        else failed.push(subscription.id);
      }
    } catch (error) {
      // A malformed subscription key, a DNS failure or a transport error. One
      // device's failure never aborts the loop: a second device that would have
      // received this must not be punished for the first one's state.
      note(categoriseThrown(error));
      failed.push(subscription.id);
    }
  }

  // Every path that began a delivery finishes it. A `pending` row nobody
  // finishes holds its dedupe slot forever, and the user's reminder is then
  // silently undeliverable for good.
  const finished = await client.rpc("finish_push_delivery", {
    p_delivery_id: deliveryId,
    p_outcome: delivered > 0 ? "delivered" : "failed",
    p_gone_subscription_ids: gone,
    p_failed_subscription_ids: failed,
  });
  if (finished.error) {
    console.error("[send-push] finish failed", { code: finished.error.code ?? "unknown" });
  }

  // The diagnostics travel back in the RESPONSE as well as to the log, because
  // the manual trigger is how the owner runs the hardware proof: a run that
  // answered `delivered=0, failed=1` and nothing else is what made an iPhone
  // failure undiagnosable in the first place.
  return Object.freeze({
    status: "sent",
    delivered,
    retired: gone.length,
    // Every attempt that did not land is still visible as a failure. Exempting
    // the DEVICE from a strike must never quietly exempt the RUN from saying it
    // failed — that would turn a diagnostic improvement into a success claim.
    failed: failed.length + unauthenticated.length,
    deviceStrikes: failed.length,
    diagnostics: Object.freeze(diagnostics.map((entry) => Object.freeze(entry))),
    subject: subjectCategory,
  });
}
