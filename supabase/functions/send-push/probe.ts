import { base64UrlDecode, base64UrlEncode, createVapidAuthorization, encryptPushPayload } from "../_shared/web-push.ts";
import {
  isAllowedPushHost,
  readVendorReason,
  subscriptionRejectionReasons,
  vapidRejectionReasons,
  type SenderConfig,
  type VendorReason,
} from "./deliver.ts";

/**
 * Asks the push service what it thinks of our VAPID token, **without a device
 * and without a subscription**.
 *
 * ## Why this exists
 *
 * Two hardware runs answered `unauthorized` with `403`, and `403` is where a
 * rejected `sub`, a wrong `aud`, an unverifiable signature, an unexpected key
 * and a refused subscription all converge. Each run cost one of three strikes
 * against the owner's only subscription and left the next reading no less
 * ambiguous than the last. The question "is our authentication itself
 * acceptable?" is separable from "does THIS subscription accept THIS key", and
 * only the second one needs a real device.
 *
 * So this probe asks the first one against a **fabricated** resource on a real
 * push service's origin. It cannot reach the owner's subscription because it is
 * never given one, and it cannot charge a strike because it has no database
 * client to charge it with — `SenderConfig` and `fetch` are the whole of its
 * input, which is a structural guarantee rather than a promise.
 *
 * ## Why the negative control is not optional
 *
 * A `403` from a request whose token is fine and whose PATH is fabricated proves
 * nothing about the token. So the same request is sent twice: once with the real
 * authorization, once with the signature deliberately corrupted. If the service
 * answers the corrupted one differently, the probe can see the authentication
 * layer at all; if it answers both identically, the probe is blind and says so.
 *
 * The mutation is **verified rather than assumed**: the corrupted header is
 * compared to the real one and the probe reports `mutation: "not_applied"` and
 * refuses to conclude anything if they are equal. A control that silently failed
 * to mutate is a control that agrees with everything.
 *
 * ## What it may and may not conclude
 *
 * `vapid_rejected` is asserted **only** when the service names an authentication
 * failure from `vapidRejectionReasons` — its own word, from a closed set. Two
 * `403`s with no such word are **inconclusive**, not a verdict: that is exactly
 * the inference that has already been made twice on this residual without
 * evidence. Anything the fabricated path could have caused is recorded as
 * inconclusive too, however suggestive it looks.
 */

/** Apple's public Web Push origin. A vendor's address, never a user's. */
export const APPLE_PUSH_ORIGIN = "https://web.push.apple.com";

/** The one conclusive verdict, and the honest absence of one. */
export type ProbeVerdict = "vapid_rejected" | "inconclusive";

/**
 * A content-free reading of what the pair of answers looked like. Evidence the
 * owner can act on, deliberately kept apart from `verdict` so that suggestive
 * evidence can never be read as proof.
 */
export type ProbeSignal =
  /** The control's token was not actually mutated: the probe proves nothing. */
  | "mutation_not_applied"
  /** The service named an authentication failure for our REAL token. */
  | "real_rejected_as_vapid"
  /** The service answered our real token by complaining about the RESOURCE. */
  | "real_answered_about_resource"
  /** The service named an authentication failure for the CORRUPTED token only. */
  | "control_rejected_as_vapid"
  /** Neither answer named anything from the closed set. */
  | "no_vapid_signal";

export type ProbeAnswer = Readonly<{ status: number; reason: VendorReason }>;

export type VapidProbeReport = Readonly<{
  status: "vapid_probe";
  /** A push service's public origin. Never a subscription, never a path. */
  origin: string;
  real: ProbeAnswer;
  control: ProbeAnswer;
  mutation: "applied" | "not_applied";
  signals: readonly ProbeSignal[];
  verdict: ProbeVerdict;
}>;

export type ProbeRefusal = Readonly<{ status: "vapid_probe"; refused: string }>;

export type ProbeDependencies = Readonly<{
  config: SenderConfig;
  fetch: typeof fetch;
  nowSeconds: () => number;
  /** Injectable so the mutation control can prove the allowlist is load-bearing. */
  allowedHosts?: readonly RegExp[];
}>;

/**
 * Corrupts a VAPID `Authorization` header's SIGNATURE and nothing else.
 *
 * Flipping a bit inside the signature keeps the token structurally perfect — the
 * same header, the same claims, the same `k=` — so what the service rejects can
 * only be the signature. Corrupting the claims instead would change `aud` or
 * `exp` and test a different thing.
 *
 * Returns `null` when the header cannot be taken apart, which the caller reports
 * as `mutation: "not_applied"` rather than treating an unmutated header as a
 * control.
 */
export function corruptVapidSignature(authorization: string): string | null {
  const match = /^vapid t=([^.]+\.[^.]+)\.([A-Za-z0-9_-]+), k=(.+)$/.exec(authorization);
  if (match === null) return null;
  const [, signingInput, signature, key] = match;
  let bytes: Uint8Array;
  try {
    bytes = base64UrlDecode(signature);
  } catch {
    return null;
  }
  if (bytes.length === 0) return null;
  const flipped = new Uint8Array(bytes);
  // The last byte of `s`, so the pair stays a well-formed 64-byte `r ‖ s` and
  // only its arithmetic is wrong.
  flipped[flipped.length - 1] = flipped[flipped.length - 1] ^ 0x01;
  const rebuilt = `vapid t=${signingInput}.${base64UrlEncode(flipped)}, k=${key}`;
  // The mutation is asserted here, at the only place that can see both values.
  return rebuilt === authorization ? null : rebuilt;
}

/** A fabricated resource on a real origin. Random, ephemeral, and nobody's. */
function fabricatedEndpoint(origin: string): string {
  return `${origin}/${base64UrlEncode(crypto.getRandomValues(new Uint8Array(24)))}`;
}

/**
 * A recipient that exists only for the length of this call.
 *
 * The body has to be a real `aes128gcm` record or the service may reject the
 * REQUEST before it ever considers the token — so it is encrypted to a P-256
 * pair generated here and never stored, never returned and never logged. Nobody
 * can decrypt it, including us, one line after this function returns.
 */
async function ephemeralRecipient(): Promise<{ p256dh: string; auth: string }> {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return {
    p256dh: base64UrlEncode(raw),
    auth: base64UrlEncode(crypto.getRandomValues(new Uint8Array(16))),
  };
}

/** Twelve hours, the same lifetime the delivery path signs. */
const PROBE_VAPID_TTL_SECONDS = 12 * 60 * 60;

export async function probeVapid(dependencies: ProbeDependencies): Promise<VapidProbeReport | ProbeRefusal> {
  const { config, nowSeconds } = dependencies;
  const origin = APPLE_PUSH_ORIGIN;

  // The same allowlist the delivery path obeys. A probe is still egress.
  if (!isAllowedPushHost(origin, dependencies.allowedHosts)) {
    return Object.freeze({ status: "vapid_probe" as const, refused: "host_not_allowed" });
  }

  const endpoint = fabricatedEndpoint(origin);

  let authorization: string;
  try {
    authorization = await createVapidAuthorization({
      endpoint,
      publicKey: config.vapidPublicKey,
      privateKey: config.vapidPrivateKey,
      subject: config.vapidSubject,
      expiresAtSeconds: nowSeconds() + PROBE_VAPID_TTL_SECONDS,
    });
  } catch {
    return Object.freeze({ status: "vapid_probe" as const, refused: "vapid_key_malformed" });
  }

  const corrupted = corruptVapidSignature(authorization);

  let body: Uint8Array;
  try {
    body = await encryptPushPayload({
      // A fixed, meaningless byte string. There is no parameter on this path a
      // title, a task or a person could arrive through.
      plaintext: new TextEncoder().encode("{}"),
      keys: await ephemeralRecipient(),
    });
  } catch {
    return Object.freeze({ status: "vapid_probe" as const, refused: "probe_payload_failed" });
  }

  const ask = async (header: string): Promise<ProbeAnswer> => {
    try {
      const response = await dependencies.fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: header,
          "Content-Encoding": "aes128gcm",
          "Content-Type": "application/octet-stream",
          TTL: "0",
        },
        body: body as BodyInit,
      });
      return Object.freeze({ status: response.status, reason: await readVendorReason(response) });
    } catch {
      // Status `0` is not a status any service returns, which is what makes it
      // usable as "the request never produced an answer" without inventing a
      // category the rest of the sender does not have.
      return Object.freeze({ status: 0, reason: "vendor_absent" as VendorReason });
    }
  };

  const real = await ask(authorization);
  const control = corrupted === null ? real : await ask(corrupted);

  const signals: ProbeSignal[] = [];
  if (corrupted === null) signals.push("mutation_not_applied");
  if (vapidRejectionReasons.includes(real.reason)) signals.push("real_rejected_as_vapid");
  if (subscriptionRejectionReasons.includes(real.reason)) signals.push("real_answered_about_resource");
  if (corrupted !== null && vapidRejectionReasons.includes(control.reason)) {
    signals.push("control_rejected_as_vapid");
  }
  if (signals.length === 0) signals.push("no_vapid_signal");

  /*
   * The single conclusive reading, and everything else is `inconclusive`.
   *
   * Two `403`s do NOT establish "our VAPID is rejected" — a fabricated path can
   * produce a `403` on its own, and inferring a cause from a status is the
   * mistake this whole residual is made of. The service has to NAME an
   * authentication failure, in its own closed vocabulary, about our REAL token,
   * with a control that actually mutated.
   */
  const verdict: ProbeVerdict =
    corrupted !== null && vapidRejectionReasons.includes(real.reason) ? "vapid_rejected" : "inconclusive";

  return Object.freeze({
    status: "vapid_probe" as const,
    origin,
    real,
    control,
    mutation: corrupted === null ? ("not_applied" as const) : ("applied" as const),
    signals: Object.freeze(signals),
    verdict,
  });
}
