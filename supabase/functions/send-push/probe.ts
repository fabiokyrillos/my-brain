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
 * and without a subscription** — and, since run 1, with the controls that decide
 * whether the answer is about our token at all.
 *
 * ## What run 1 got right, and what it could not see
 *
 * Run 1 sent two requests — the real token and one with a corrupted signature —
 * and Apple answered `BadJwtToken` to both. That was read as "our VAPID is
 * rejected". It is *consistent* with that, and it is equally consistent with
 * something this probe had no way to distinguish: **a push service that answers
 * `BadJwtToken` to anything aimed at a resource it cannot find.** Both requests
 * named a fabricated path. A control that only ever varies the token cannot tell
 * you whether the token was read.
 *
 * Offline verification then made the ambiguity impossible to ignore. Our token
 * verifies against RFC 8292's own published vector's verifier, in a **different
 * runtime and a different crypto implementation** (Node/OpenSSL, not the Deno
 * WebCrypto that produced it): the header segment is byte-identical to the RFC's,
 * the claim set and its order match, `exp` is inside the 24-hour ceiling, the
 * signature is 64 raw bytes of `r ‖ s` rather than DER, and it verifies. A token
 * that is correct by the specification and rejected by the service is either a
 * service-specific rule the specification does not carry, or an answer that was
 * never about the token.
 *
 * ## The two controls that were missing
 *
 * - **`absent`** — the same request with **no `Authorization` header at all**. If
 *   the service answers what it answered the real token, its answer does not
 *   depend on our token and every other reading here is void.
 * - **`expired`** — a token that is provably well-formed and deliberately stale.
 *   If the service names the expiry, it is parsing claims, and its verdict on the
 *   real token is a verdict rather than a shrug.
 *
 * And one that splits the remaining space in half:
 *
 * - **`ephemeral`** — a freshly generated pair, correct audience, valid expiry,
 *   built by the same code. Rejected too? The fault is in what we BUILD.
 *   Accepted? The fault is the key we HOLD.
 *
 * ## What it still may not do
 *
 * It reaches no database, names no subscription, charges no strike and produces
 * no notification: it is handed a config and a `fetch` and nothing else, which is
 * structural rather than a promise. Every recipient key it uses is generated per
 * request and discarded. And it may not conclude anything its controls do not
 * support — `inconclusive` is the answer whenever they do not.
 */

/** Apple's public Web Push origin. A vendor's address, never a user's. */
export const APPLE_PUSH_ORIGIN = "https://web.push.apple.com";

/** The request shapes, each isolating exactly one variable. */
export const probeVariants = ["real", "corrupted", "absent", "ephemeral", "expired"] as const;
export type ProbeVariant = (typeof probeVariants)[number];

export type ProbeVerdict =
  /** Apple validates tokens on their own terms AND rejects what this code BUILDS. */
  | "construction_rejected"
  /** Apple validates tokens on their own terms AND rejects the key we HOLD. */
  | "configured_key_rejected"
  /** Rejected as VAPID, but the controls cannot say whether it is the key or the build. */
  | "vapid_rejected_cause_unresolved"
  /** The controls do not support any reading. The honest default. */
  | "inconclusive";

export type ProbeSignal =
  /** The unauthenticated request got the SAME answer: the answer is not about our token. */
  | "answer_does_not_depend_on_token"
  /** A deliberately stale token was named as stale: the service parses claims. */
  | "service_validates_claims"
  /** The service named an authentication failure for the REAL token. */
  | "real_rejected_as_vapid"
  /** ...and for a freshly generated, provably valid one too. */
  | "ephemeral_rejected_as_vapid"
  /** The service answered the real token by complaining about the RESOURCE. */
  | "real_answered_about_resource"
  /** The corrupted-signature control was not actually mutated. */
  | "mutation_not_applied"
  /** Nothing in the closed set was named by anything. */
  | "no_vapid_signal";

export type ProbeAnswer = Readonly<{ variant: ProbeVariant; status: number; reason: VendorReason }>;

export type VapidProbeReport = Readonly<{
  status: "vapid_probe";
  origin: string;
  answers: readonly ProbeAnswer[];
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

/**
 * A throwaway application-server pair, generated per call.
 *
 * It is a REAL VAPID identity that simply belongs to nobody: correct curve,
 * coherent halves, and a `k=` that matches what signed the token. It exists so
 * "is the token we build acceptable" can be asked without the answer depending
 * on which key the deployment happens to hold.
 */
async function ephemeralSenderKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return { publicKey: base64UrlEncode(raw), privateKey: jwk.d as string };
}

/** Twelve hours, the same lifetime the delivery path signs. */
const PROBE_VAPID_TTL_SECONDS = 12 * 60 * 60;
/** Comfortably stale, and still a well-formed token. */
const PROBE_EXPIRED_OFFSET_SECONDS = -3 * 60 * 60;

export async function probeVapid(dependencies: ProbeDependencies): Promise<VapidProbeReport | ProbeRefusal> {
  const { config, nowSeconds } = dependencies;
  const origin = APPLE_PUSH_ORIGIN;

  // The same allowlist the delivery path obeys. A probe is still egress.
  if (!isAllowedPushHost(origin, dependencies.allowedHosts)) {
    return Object.freeze({ status: "vapid_probe" as const, refused: "host_not_allowed" });
  }

  const endpoint = fabricatedEndpoint(origin);

  let real: string;
  try {
    real = await createVapidAuthorization({
      endpoint,
      publicKey: config.vapidPublicKey,
      privateKey: config.vapidPrivateKey,
      subject: config.vapidSubject,
      expiresAtSeconds: nowSeconds() + PROBE_VAPID_TTL_SECONDS,
    });
  } catch {
    return Object.freeze({ status: "vapid_probe" as const, refused: "vapid_key_malformed" });
  }

  const corrupted = corruptVapidSignature(real);

  // Both fresh-key variants use the SAME subject as the deployment, so the only
  // thing that differs between `real` and `ephemeral` is which key signed.
  const fresh = await ephemeralSenderKeys();
  const withFreshKey = (expiresAtSeconds: number) =>
    createVapidAuthorization({
      endpoint,
      publicKey: fresh.publicKey,
      privateKey: fresh.privateKey,
      subject: config.vapidSubject,
      expiresAtSeconds,
    });

  let ephemeral: string;
  let expired: string;
  try {
    ephemeral = await withFreshKey(nowSeconds() + PROBE_VAPID_TTL_SECONDS);
    expired = await withFreshKey(nowSeconds() + PROBE_EXPIRED_OFFSET_SECONDS);
  } catch {
    return Object.freeze({ status: "vapid_probe" as const, refused: "probe_key_failed" });
  }

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

  const ask = async (variant: ProbeVariant, header: string | null): Promise<ProbeAnswer> => {
    const headers: Record<string, string> = {
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "0",
    };
    // `absent` is the control that decides whether any of the others mean
    // anything, so it must differ from `real` in EXACTLY one way: no header.
    if (header !== null) headers.Authorization = header;
    try {
      const response = await dependencies.fetch(endpoint, { method: "POST", headers, body: body as BodyInit });
      return Object.freeze({ variant, status: response.status, reason: await readVendorReason(response) });
    } catch {
      // Status `0` is not a status any service returns, which is what makes it
      // usable as "the request never produced an answer" without inventing a
      // category the rest of the sender does not have.
      return Object.freeze({ variant, status: 0, reason: "vendor_absent" as VendorReason });
    }
  };

  const answers: ProbeAnswer[] = [];
  answers.push(await ask("real", real));
  if (corrupted !== null) answers.push(await ask("corrupted", corrupted));
  answers.push(await ask("absent", null));
  answers.push(await ask("ephemeral", ephemeral));
  answers.push(await ask("expired", expired));

  const of = (variant: ProbeVariant) => answers.find((answer) => answer.variant === variant);
  const realAnswer = of("real")!;
  const absentAnswer = of("absent")!;
  const ephemeralAnswer = of("ephemeral")!;
  const expiredAnswer = of("expired")!;

  const signals: ProbeSignal[] = [];
  if (corrupted === null) signals.push("mutation_not_applied");

  // THE control. If an unauthenticated request draws the same answer, the answer
  // is about the fabricated resource and nothing below is evidence about a token.
  const answerIsAboutTheToken =
    !(absentAnswer.status === realAnswer.status && absentAnswer.reason === realAnswer.reason);
  if (!answerIsAboutTheToken) signals.push("answer_does_not_depend_on_token");

  // A stale token NAMED as stale proves the service reads claims rather than
  // pattern-matching a failure.
  const claimsAreRead = expiredAnswer.reason === "ExpiredProviderToken";
  if (claimsAreRead) signals.push("service_validates_claims");

  if (vapidRejectionReasons.includes(realAnswer.reason)) signals.push("real_rejected_as_vapid");
  if (vapidRejectionReasons.includes(ephemeralAnswer.reason)) signals.push("ephemeral_rejected_as_vapid");
  if (subscriptionRejectionReasons.includes(realAnswer.reason)) signals.push("real_answered_about_resource");
  if (signals.length === 0) signals.push("no_vapid_signal");

  /*
   * The decision procedure, and it refuses far more often than it concludes.
   *
   * Nothing is read as a verdict about our token unless the `absent` control
   * shows the service's answer depends on the token at all, and unless the
   * mutation control actually mutated. With both of those, a rejection of the
   * REAL token separates into two repairs by whether a freshly generated,
   * provably valid identity is rejected the same way.
   */
  let verdict: ProbeVerdict = "inconclusive";
  if (answerIsAboutTheToken && corrupted !== null && vapidRejectionReasons.includes(realAnswer.reason)) {
    if (vapidRejectionReasons.includes(ephemeralAnswer.reason)) verdict = "construction_rejected";
    else if (subscriptionRejectionReasons.includes(ephemeralAnswer.reason)) verdict = "configured_key_rejected";
    else verdict = "vapid_rejected_cause_unresolved";
  }

  return Object.freeze({
    status: "vapid_probe" as const,
    origin,
    answers: Object.freeze(answers),
    mutation: corrupted === null ? ("not_applied" as const) : ("applied" as const),
    signals: Object.freeze(signals),
    verdict,
  });
}
