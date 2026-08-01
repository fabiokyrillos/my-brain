import "server-only";

import { webcrypto } from "node:crypto";

import {
  composeAad,
  decodeMasterKey,
  fromBase64,
  IV_BYTES,
  toBase64,
  type Bytes,
  type Envelope,
  type EnvelopeContext,
} from "./envelope";

/**
 * The Node half of the BYOK crypto core.
 *
 * ## Why WebCrypto rather than `node:crypto`'s classic API
 *
 * The Deno half has only WebCrypto. Using `createCipheriv` here would give two
 * implementations with two failure vocabularies, two tag-handling conventions
 * (`node:crypto` splits the tag off explicitly; WebCrypto appends it) and two
 * chances to disagree about AAD. `node:crypto` exposes the same WebCrypto that
 * Deno has, so both halves call the identical API against the identical format
 * — and the interop proof in `scripts/byok-crypto-interop.mjs` demonstrates it
 * rather than asserting it.
 *
 * ## What this module refuses to do
 *
 * It does not read the environment, and it does not log. The master key arrives
 * as an argument, so a caller cannot accidentally encrypt under a key this
 * module found for itself; and no branch here interpolates a key, a plaintext
 * or a ciphertext into a message. A decryption failure is one word —
 * `credential_unreadable` — with no byte echo, because the difference between
 * "wrong key", "wrong user" and "corrupt row" is information an attacker would
 * like and an owner cannot act on.
 *
 * `server-only` is load-bearing: this module must never reach a client bundle.
 */

export class CredentialUnreadableError extends Error {
  constructor() {
    super("credential_unreadable");
    this.name = "CredentialUnreadableError";
  }
}

async function importKey(master: Bytes): Promise<CryptoKey> {
  return webcrypto.subtle.importKey("raw", master, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/**
 * Encrypt one credential.
 *
 * A fresh random IV every time — never derived, never a counter. Two encryptions
 * of the same key under the same master key must produce different ciphertexts,
 * and that is asserted rather than assumed.
 */
export async function encryptCredential(
  plaintext: string,
  master: Bytes,
  context: EnvelopeContext,
): Promise<Envelope> {
  const key = await importKey(master);
  const iv = webcrypto.getRandomValues(new Uint8Array(new ArrayBuffer(IV_BYTES)));
  const sealed = await webcrypto.subtle.encrypt(
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
 * Decrypt one credential, or fail with a single word.
 *
 * The `catch` is deliberately total. WebCrypto reports an authentication failure
 * and a malformed input the same way on purpose, and this preserves that: a
 * caller learns the credential could not be read, and nothing about why.
 */
export async function decryptCredential(
  envelope: Envelope,
  master: Bytes,
  context: EnvelopeContext,
): Promise<string> {
  try {
    const key = await importKey(master);
    const opened = await webcrypto.subtle.decrypt(
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

/**
 * The startup check BYOK-MASTER requires, in the Node runtime.
 *
 * **Fails to start; never falls back.** A process that boots without a usable
 * master key would accept credential writes it can never read back, and the
 * owner would discover that at the moment they most needed the key.
 */
export function requireMasterKey(env: NodeJS.ProcessEnv = process.env): Bytes {
  return decodeMasterKey(env.BYOK_MASTER_KEY, "BYOK_MASTER_KEY");
}
