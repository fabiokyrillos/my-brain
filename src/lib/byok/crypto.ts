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
import { resolveMasterKeyRing, type MasterKeyRing } from "./rotation";

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
 * HMAC-SHA256, for the credential fingerprint and for nothing else.
 *
 * It lives here rather than in `fingerprint.ts` because BYOK-CRYPTO-006 and
 * BYOK-GUARD-005 allow `crypto.subtle` in exactly **one** module per runtime.
 * `fingerprint.ts` therefore owns the vocabulary, the truncation and the
 * composition — the parts with no secret in them — and calls this for the one
 * primitive it needs. The pepper arrives as an argument for the same reason the
 * master key does: a module that finds its own secret can use one the caller
 * did not intend.
 */
export async function hmacSha256(pepper: Bytes, message: string): Promise<Bytes> {
  const key = await webcrypto.subtle.importKey(
    "raw",
    pepper,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await webcrypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return new Uint8Array(signature) as Bytes;
}

/**
 * What the startup checks read from.
 *
 * Deliberately **not** `NodeJS.ProcessEnv`: that type requires `NODE_ENV`, so a
 * test could not pass `{ BYOK_MASTER_KEY: "…" }` without also supplying fields
 * the check never looks at. Injecting an object is how absence and malformation
 * are exercised without mutating the real environment, which under a parallel
 * test runner is a shared mutable global.
 */
type SecretEnv = Readonly<Record<string, string | undefined>>;

/**
 * The startup check BYOK-MASTER requires, in the Node runtime.
 *
 * **Fails to start; never falls back.** A process that boots without a usable
 * master key would accept credential writes it can never read back, and the
 * owner would discover that at the moment they most needed the key.
 */
export function requireMasterKey(env: SecretEnv = process.env): Bytes {
  return decodeMasterKey(env.BYOK_MASTER_KEY, "BYOK_MASTER_KEY");
}

/**
 * The same check, widened to the bounded two-key rotation window.
 *
 * The clock is read **here** rather than inside `resolveMasterKeyRing`, so the
 * decision function stays pure and its boundary cases stay testable without
 * freezing time globally. With no window configured this returns exactly what
 * `requireMasterKey` would, so every existing caller keeps its behaviour.
 */
export function requireMasterKeyRing(env: SecretEnv = process.env): MasterKeyRing {
  return resolveMasterKeyRing(env, new Date());
}

/**
 * The same check for the fingerprint pepper.
 *
 * BYOK-FINGERPRINT-001 makes the pepper **a separate secret** subject to
 * BYOK-MASTER-001…005 independently, so it is validated exactly as strictly and
 * fails exactly as hard. Deriving it from the master key would mean one
 * compromise yielded both the ability to decrypt and the ability to correlate
 * fingerprints across users, so nothing here derives anything.
 *
 * The same 32-byte shape as the master key, deliberately: it is HMAC-SHA256's
 * block-optimal key length, and one generation command for both secrets is one
 * fewer way for an operator to produce a weak value.
 */
export function requireFingerprintPepper(env: SecretEnv = process.env): Bytes {
  return decodeMasterKey(env.BYOK_FINGERPRINT_PEPPER, "BYOK_FINGERPRINT_PEPPER");
}

/**
 * The same check for the rate-limit pepper — the **third** independent secret
 * (`ADR-070`, `BYOK-SCHEMA-011`).
 *
 * It is never `BYOK_MASTER_KEY` and never `BYOK_FINGERPRINT_PEPPER`, and the
 * reason is sharper here than for the other pair: this pepper is touched on
 * **every** validation attempt, including the failed and throttled ones an
 * attacker generates. It is the most widely handled of the three, so coupling it
 * to the ability to decrypt credentials would be the worst pairing available.
 *
 * Three secrets, three capabilities, and no single compromise that yields two.
 */
export function requireRateLimitPepper(env: SecretEnv = process.env): Bytes {
  return decodeMasterKey(env.BYOK_RATE_LIMIT_PEPPER, "BYOK_RATE_LIMIT_PEPPER");
}
