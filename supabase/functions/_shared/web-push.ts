/**
 * Web Push, from the two RFCs, with no dependency.
 *
 * `2M-NOTIFY-011` requires a sender that holds the VAPID private key only in the
 * server environment. This module is that sender's cryptography and nothing
 * else: it takes bytes and keys and returns bytes and a header. It does not
 * fetch, does not read the environment, does not know what a notification is,
 * and cannot reach a database.
 *
 * ## Why this is written out rather than imported
 *
 * `npm:web-push` is the obvious choice and it is the wrong one here. It is
 * built on Node's `crypto` module, and this runs in Deno on Supabase's Edge
 * Runtime, where npm interop for native crypto is exactly the class of thing
 * that works in a local `deno test` and fails on the deployed function. The
 * failure would surface at the owner's hardware checkpoint -- the single worst
 * place in this plan to discover a dependency problem -- and the diagnosis would
 * be "nothing arrives", which is indistinguishable from twenty other causes.
 *
 * Written against WebCrypto, every primitive is one the Edge Runtime and the
 * local test runner share, and the whole construction is checkable offline
 * against the RFCs' own published vectors. `web-push.test.ts` does exactly that:
 * RFC 8291 section 5's vector reproduced byte for byte, not a round trip that
 * would agree with itself while both halves used the same wrong info string.
 *
 * ## What each RFC contributes
 *
 * - **RFC 8291** — message encryption. The payload is encrypted TO THE BROWSER,
 *   with a key derived from the subscription's own `p256dh` and `auth`. The push
 *   service relays ciphertext it cannot read. This is why the content-free rule
 *   is a product decision rather than a transport one: the push service already
 *   cannot see the body, but its LOGS see the endpoint, and the notification
 *   itself lands on a lock screen.
 * - **RFC 8292** — VAPID. A signed JWT identifying this application to the push
 *   service. It is an ES256 signature over a fixed claim set, and the private
 *   key never leaves this process.
 */

const encoder = new TextEncoder();

/** RFC 8188's record size. One record is always enough for a payload this small. */
const RECORD_SIZE = 4096;
const P256_PUBLIC_KEY_BYTES = 65;
const SALT_BYTES = 16;
const AUTH_SECRET_BYTES = 16;

export type PushSubscriptionKeys = Readonly<{
  /** The subscription's public key, base64url, 65 raw bytes when decoded. */
  p256dh: string;
  /** The subscription's auth secret, base64url, 16 raw bytes when decoded. */
  auth: string;
}>;

export type SenderKeyPair = Readonly<{
  privateKey: CryptoKey;
  /** The raw 65-byte uncompressed point, needed verbatim in the KDF info. */
  publicKeyBytes: Uint8Array;
}>;

export function base64UrlDecode(value: string): Uint8Array {
  const normalised = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalised + "=".repeat((4 - (normalised.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * One HMAC-SHA256 block of HKDF-Expand.
 *
 * Written out rather than deriving through `crypto.subtle`'s HKDF because the
 * two derivations below use DIFFERENT salts in a specific order that RFC 8291
 * fixes -- the auth secret salts the first, the message salt the second -- and
 * expressing that as two explicit extract/expand steps is what makes the
 * sequence auditable against the RFC line by line. Every output here is 32 bytes
 * or fewer, so a single block is always sufficient.
 */
async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const imported = await crypto.subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", imported, data as BufferSource));
}

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const prk = await hmacSha256(salt, ikm);
  const block = await hmacSha256(prk, concat(info, Uint8Array.of(1)));
  return block.slice(0, length);
}

/** A fresh ephemeral P-256 pair. One per message, which is what makes the salt-plus-key pair unique. */
export async function generateSenderKeyPair(): Promise<SenderKeyPair> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const publicKeyBytes = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return { privateKey: pair.privateKey, publicKeyBytes };
}

/**
 * Rebuilds a sender pair from raw halves, so a test can pin the RFC's vector.
 *
 * Not used by the delivery path — production always generates a fresh pair —
 * but the RFC's vector is only checkable if the ephemeral key can be fixed, and
 * a construction that can only be tested with random inputs is a construction
 * that can only be round-tripped against itself.
 */
export async function importSenderKeyPair(
  privateKeyBytes: Uint8Array,
  publicKeyBytes: Uint8Array,
): Promise<SenderKeyPair> {
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      d: base64UrlEncode(privateKeyBytes),
      x: base64UrlEncode(publicKeyBytes.slice(1, 33)),
      y: base64UrlEncode(publicKeyBytes.slice(33, 65)),
      ext: true,
    },
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  return { privateKey, publicKeyBytes };
}

/**
 * RFC 8291 section 3.4 — the encrypted body, `aes128gcm` content coding.
 *
 * Returns the complete request body: the RFC 8188 header (salt, record size,
 * key id length, the sender's public key) followed by one AES-128-GCM record.
 * The plaintext is padded with the single delimiter byte `0x02`, which marks
 * the last record.
 */
export async function encryptPushPayload(input: {
  readonly plaintext: Uint8Array;
  readonly keys: PushSubscriptionKeys;
  readonly sender?: SenderKeyPair;
  readonly salt?: Uint8Array;
}): Promise<Uint8Array> {
  const userAgentPublicKeyBytes = base64UrlDecode(input.keys.p256dh);
  const authSecret = base64UrlDecode(input.keys.auth);
  if (userAgentPublicKeyBytes.length !== P256_PUBLIC_KEY_BYTES) {
    throw new Error("subscription_key_invalid");
  }
  if (authSecret.length !== AUTH_SECRET_BYTES) throw new Error("subscription_auth_invalid");

  const sender = input.sender ?? (await generateSenderKeyPair());
  const salt = input.salt ?? crypto.getRandomValues(new Uint8Array(SALT_BYTES));

  const userAgentPublicKey = await crypto.subtle.importKey(
    "raw",
    userAgentPublicKeyBytes as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: userAgentPublicKey },
      sender.privateKey,
      256,
    ),
  );

  // The first derivation is keyed by the AUTH SECRET, and its info binds both
  // public keys. Binding them is what stops a relayed ciphertext being replayed
  // toward a different subscription: the key only exists for this pair.
  const keyInfo = concat(
    encoder.encode("WebPush: info"),
    Uint8Array.of(0),
    userAgentPublicKeyBytes,
    sender.publicKeyBytes,
  );
  const inputKeyingMaterial = await hkdf(authSecret, sharedSecret, keyInfo, 32);

  const contentEncryptionKey = await hkdf(
    salt,
    inputKeyingMaterial,
    concat(encoder.encode("Content-Encoding: aes128gcm"), Uint8Array.of(0)),
    16,
  );
  const nonce = await hkdf(
    salt,
    inputKeyingMaterial,
    concat(encoder.encode("Content-Encoding: nonce"), Uint8Array.of(0)),
    12,
  );

  const aesKey = await crypto.subtle.importKey(
    "raw",
    contentEncryptionKey as BufferSource,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce as BufferSource, tagLength: 128 },
      aesKey,
      concat(input.plaintext, Uint8Array.of(2)) as BufferSource,
    ),
  );

  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, RECORD_SIZE, false);
  return concat(
    salt,
    recordSize,
    Uint8Array.of(sender.publicKeyBytes.length),
    sender.publicKeyBytes,
    ciphertext,
  );
}

/**
 * RFC 8292 — the `Authorization` header value.
 *
 * `aud` is the ORIGIN of the endpoint and never the full URL: the path of a
 * push endpoint is the subscription identifier, and signing it into a token
 * would put a per-user secret into a header that transits intermediaries.
 */
export async function createVapidAuthorization(input: {
  readonly endpoint: string;
  readonly publicKey: string;
  readonly privateKey: string;
  readonly subject: string;
  /** Seconds since the epoch. Passed in so the token is deterministic under test. */
  readonly expiresAtSeconds: number;
}): Promise<string> {
  const audience = new URL(input.endpoint).origin;
  const publicKeyBytes = base64UrlDecode(input.publicKey);
  if (publicKeyBytes.length !== P256_PUBLIC_KEY_BYTES) throw new Error("vapid_public_key_invalid");
  const privateKeyBytes = base64UrlDecode(input.privateKey);
  if (privateKeyBytes.length !== 32) throw new Error("vapid_private_key_invalid");

  const signingKey = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      d: base64UrlEncode(privateKeyBytes),
      x: base64UrlEncode(publicKeyBytes.slice(1, 33)),
      y: base64UrlEncode(publicKeyBytes.slice(33, 65)),
      ext: true,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const header = base64UrlEncode(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = base64UrlEncode(
    encoder.encode(JSON.stringify({ aud: audience, exp: input.expiresAtSeconds, sub: input.subject })),
  );
  const signingInput = `${header}.${claims}`;
  // WebCrypto's ECDSA output is already the raw `r || s` pair JWS requires; a
  // DER-wrapped signature here would be silently rejected by the push service.
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      signingKey,
      encoder.encode(signingInput) as BufferSource,
    ),
  );
  return `vapid t=${signingInput}.${base64UrlEncode(signature)}, k=${input.publicKey}`;
}
