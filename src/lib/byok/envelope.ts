/**
 * The BYOK envelope format — the one definition both runtimes implement.
 *
 * This module is **pure and runtime-neutral**: no Node API, no Deno API, no
 * `server-only` guard, no I/O. It exists so the two crypto implementations share
 * a single description of the wire format rather than two descriptions that
 * agree today.
 *
 * ## The format
 *
 * ```
 * iv          12 random bytes  (96-bit, the AES-GCM nominal size)
 * ciphertext  n bytes
 * tag         16 bytes         (128-bit)
 * aad         user_id ‖ 0x1f ‖ key_version ‖ 0x1f ‖ provider
 * ```
 *
 * `iv` and `ciphertext‖tag` are stored separately and base64-encoded, matching
 * the two columns `user_ai_credentials` will carry.
 *
 * ## Why the AAD is composed here and nowhere else
 *
 * The additional authenticated data binds a ciphertext to the row it belongs to.
 * Decrypting user A's ciphertext under user B's AAD must **fail**, and that is
 * the property BYOK-CRYPTO's cross-user test asserts. It only holds if both
 * runtimes compose the AAD byte-identically — so composition lives in one
 * function, not in two implementations that were written from the same
 * paragraph.
 *
 * The separator is `0x1f` (ASCII unit separator), a byte that cannot appear in a
 * uuid, in an integer rendered as text, or in a provider slug. Joining with a
 * printable character would let `("ab", "c")` and `("a", "bc")` compose to the
 * same AAD — an ambiguity that is harmless until the day one of those fields
 * accepts a wider alphabet.
 */

/** 96 bits. The nominal GCM IV size, and the only one both runtimes agree is fast. */
export const IV_BYTES = 12;

/** 128 bits. The full GCM tag; truncating it weakens authentication. */
export const TAG_BYTES = 16;

/** AES-256. */
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

/**
 * The AAD bytes for one credential row.
 *
 * Deliberately not a template string handed to a per-runtime encoder: both
 * runtimes call *this*, so a change to the composition changes both or neither.
 */
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

/** Base64 for the two stored columns, without depending on `Buffer` or `Deno`. */
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

/**
 * The master key, decoded and length-checked.
 *
 * **Throws rather than falling back.** A process that starts with a malformed
 * key and discovers it at the first decryption would have already accepted
 * writes it cannot read back. BYOK-MASTER's startup validation calls this.
 */
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

/** What a stored credential row carries, minus the columns the database owns. */
export type Envelope = {
  /** base64 of the 12-byte IV. */
  readonly iv: string;
  /** base64 of ciphertext ‖ 16-byte tag. */
  readonly ciphertext: string;
  readonly keyVersion: number;
};
