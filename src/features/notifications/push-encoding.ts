/**
 * The one piece of the browser subscription flow that is pure, and therefore
 * the one piece that can be proved without a browser.
 *
 * `PushManager.subscribe()` takes `applicationServerKey` as raw bytes, while a
 * VAPID public key travels as base64url text. The conversion is four lines and
 * has a well-known failure mode: base64url uses `-` and `_` where base64 uses
 * `+` and `/`, and it omits the padding. Feeding base64url straight to `atob`
 * either throws or — worse — silently decodes to different bytes, and the
 * symptom is a subscription the push service rejects much later, from a
 * different layer, with an unrelated-looking error.
 *
 * So it is extracted here, with its own tests, rather than living inline in a
 * component where it could only be exercised by a real browser.
 *
 * **This is the PUBLIC half of the VAPID pair and only ever the public half.**
 * The private key exists solely as a server environment secret; nothing in this
 * directory can read it, and `2M-NOTIFY-011` makes that a requirement rather
 * than a convention.
 */

/** Base64url alphabet plus optional `=` padding, and nothing else. */
const BASE64URL = /^[A-Za-z0-9_-]+=*$/;

/**
 * Decodes a base64url VAPID public key into the bytes `subscribe()` wants.
 *
 * Returns `null` rather than throwing for anything unreadable: an unset or
 * malformed key is a **configuration** state the surface must be able to
 * render honestly ("not available on this device yet"), not an exception that
 * takes the settings page down.
 */
export function decodeVapidPublicKey(key: string | null | undefined): Uint8Array | null {
  if (typeof key !== "string") return null;
  const trimmed = key.trim();
  // An applicationServerKey is a P-256 point: 65 bytes, 87 base64url
  // characters. The length check is what turns "somebody set the variable to
  // the word `changeme`" into a refusal here rather than a push-service error
  // three layers away.
  if (trimmed.length < 80 || trimmed.length > 100 || !BASE64URL.test(trimmed)) return null;

  const padded = trimmed.padEnd(Math.ceil(trimmed.length / 4) * 4, "=");
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");

  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    return null;
  }
  if (binary.length !== 65) return null;

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/**
 * Narrows a `PushSubscription`'s JSON into the three fields the Server Action
 * accepts, returning `null` when any is missing.
 *
 * The browser's own type says these keys are optional, and they genuinely can
 * be absent on a subscription that failed halfway. Sending a half-built one
 * would store a subscription that can never receive anything, which the user
 * would experience as consent that silently does nothing.
 */
export function readSubscriptionFields(
  subscription: { toJSON(): { endpoint?: string; keys?: Record<string, string> } },
): Readonly<{ endpoint: string; p256dh: string; auth: string }> | null {
  const json = subscription.toJSON();
  const endpoint = json.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (typeof endpoint !== "string" || typeof p256dh !== "string" || typeof auth !== "string") {
    return null;
  }
  if (endpoint === "" || p256dh === "" || auth === "") return null;
  return Object.freeze({ endpoint, p256dh, auth });
}
