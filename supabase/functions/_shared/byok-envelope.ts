/**
 * The BYOK envelope format and crypto core, Deno half.
 *
 * ## Why this file duplicates `src/lib/byok/`
 *
 * `src/lib/byok/crypto.ts` imports `server-only`, which throws under Deno — the
 * same constraint that already forces `process-jobs/entry.ts` to carry its own
 * copy of the extraction prompt and schema. The repository's answer to that is
 * not "share the file" but **"prove the two agree"**: `extraction-parity.test.ts`
 * fails the build if the extraction contract drifts, and BYOK-ADAPTER-004 asks
 * for the same treatment here.
 *
 * So this is a deliberate duplicate, and the parity is mechanical in two places:
 *
 *   * `scripts/byok-crypto-interop.mjs` encrypts in one runtime and decrypts in
 *     the other, both directions, and is run in CI — the G-0.2 gate;
 *   * `byok-parity.test.ts` digests the format constants and the AAD composition
 *     from both files and fails if they diverge.
 *
 * Every constant and every byte of the composition below is intentionally
 * identical to `src/lib/byok/envelope.ts`. **If you change one, change both, and
 * the parity test is what will tell you that you did not.**
 */

export const IV_BYTES = 12;
export const TAG_BYTES = 16;
export const KEY_BYTES = 32;

/** ASCII unit separator — impossible in a uuid, an integer or a provider slug. */
const SEPARATOR = 0x1f;

/**
 * A view over a plain `ArrayBuffer`, not over `ArrayBufferLike`.
 *
 * Deno's WebCrypto typings require `BufferSource`, which excludes a
 * `Uint8Array` whose buffer might be a `SharedArrayBuffer`. Constructing over an
 * explicit `ArrayBuffer` narrows it, and the alias exists so both runtimes'
 * copies say so identically — the parity lock compares these files body for
 * body, so a fix applied to one and not the other fails the suite.
 */
export type Bytes = Uint8Array<ArrayBuffer>;

export type EnvelopeContext = {
  readonly userId: string;
  readonly keyVersion: number;
  readonly provider: string;
};

export type Envelope = {
  readonly iv: string;
  readonly ciphertext: string;
  readonly keyVersion: number;
};

/** Byte-identical to the Node composition, including the separator. */
export function composeAad(context: EnvelopeContext): Bytes {
  const encoder = new TextEncoder();
  const parts = [
    encoder.encode(context.userId),
    encoder.encode(String(context.keyVersion)),
    encoder.encode(context.provider),
  ];

  const length = parts.reduce((total, part) => total + part.length, 0) + (parts.length - 1);
  const aad = new Uint8Array(new ArrayBuffer(length));
  let offset = 0;
  parts.forEach((part, index) => {
    if (index > 0) aad[offset++] = SEPARATOR;
    aad.set(part, offset);
    offset += part.length;
  });
  return aad;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fromBase64(value: string): Bytes {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function decodeMasterKey(encoded: string | undefined, name = "BYOK_MASTER_KEY"): Bytes {
  if (!encoded) throw new Error(`${name} is not configured`);
  let bytes: Bytes;
  try {
    bytes = fromBase64(encoded);
  } catch {
    throw new Error(`${name} is not valid base64`);
  }
  if (bytes.length !== KEY_BYTES) {
    throw new Error(`${name} must decode to ${KEY_BYTES} bytes, got ${bytes.length}`);
  }
  return bytes;
}

export class CredentialUnreadableError extends Error {
  constructor() {
    super("credential_unreadable");
    this.name = "CredentialUnreadableError";
  }
}

async function importKey(master: Bytes): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", master, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptCredential(
  plaintext: string,
  master: Bytes,
  context: EnvelopeContext,
): Promise<Envelope> {
  const key = await importKey(master);
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(IV_BYTES)));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: composeAad(context), tagLength: 128 },
    key,
    new TextEncoder().encode(plaintext),
  );

  return {
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(sealed)),
    keyVersion: context.keyVersion,
  };
}

/**
 * Decrypt, or fail with one word.
 *
 * The total `catch` matches the Node half exactly: an authentication failure and
 * a malformed input are reported identically, so a caller learns the credential
 * could not be read and nothing about why.
 */
export async function decryptCredential(
  envelope: Envelope,
  master: Bytes,
  context: EnvelopeContext,
): Promise<string> {
  try {
    const key = await importKey(master);
    const opened = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: fromBase64(envelope.iv),
        additionalData: composeAad(context),
        tagLength: 128,
      },
      key,
      fromBase64(envelope.ciphertext),
    );
    return new TextDecoder().decode(opened);
  } catch {
    throw new CredentialUnreadableError();
  }
}

/** The startup check, Deno side. Fails to start; never falls back. */
export function requireMasterKey(): Bytes {
  return decodeMasterKey(Deno.env.get("BYOK_MASTER_KEY"), "BYOK_MASTER_KEY");
}

/**
 * The same check for the fingerprint pepper, Deno side.
 *
 * **A declared asymmetry, not drift.** The Node core also exports `hmacSha256`;
 * this one does not, because the worker never computes a fingerprint — that
 * happens once, at save time, on the Settings path. What the worker does need
 * is to refuse to start when the pepper is absent or malformed, because
 * BYOK-FINGERPRINT-001 makes the pepper subject to BYOK-MASTER-005
 * independently and "in both runtimes". Exporting an HMAC nothing here calls
 * would be a consumer-less contract, which this repository removes rather than
 * keeps. `src/lib/byok/parity.test.ts` asserts this asymmetry explicitly, so it
 * stays a decision rather than becoming a divergence nobody noticed.
 */
export function requireFingerprintPepper(): Bytes {
  return decodeMasterKey(Deno.env.get("BYOK_FINGERPRINT_PEPPER"), "BYOK_FINGERPRINT_PEPPER");
}
