import "server-only";

import { hmacSha256 } from "./crypto";
import type { Bytes } from "./envelope";

/**
 * The credential fingerprint — the one thing about a user's API key the product
 * is allowed to remember and show.
 *
 * ## What it is for
 *
 * Two questions the product must answer without decrypting anything, and
 * without ever holding a substring of the key:
 *
 *   * "which key is configured?" — so Settings can say something more useful
 *     than *configured*;
 *   * "is this the same key again?" — so a rotation can tell a genuine
 *     replacement from a re-paste of the value that just failed.
 *
 * ## Why not the last four characters
 *
 * Because the tail of an OpenAI key **is the entropy**, and it is the part a
 * screenshot, a support transcript or a shared terminal most reliably captures.
 * BYOK-FINGERPRINT-003 forbids persisting or displaying any substring of the
 * key, including the tail, and this module holds no code path that could.
 * `hmacSha256` is one-way, and the six hex characters it is truncated to are
 * derived from the whole key under a secret pepper — so they identify a key to
 * someone who already has it and say nothing to someone who does not.
 *
 * ## Why the pepper, and why it is not the master key
 *
 * Without a secret, `HMAC` degenerates to a plain hash and anyone holding a
 * database copy could confirm a guessed key by recomputing six characters. The
 * pepper is a **separate** secret from `BYOK_MASTER_KEY` (BYOK-FINGERPRINT-001)
 * so that a fingerprint leak can never assist decryption, and a master-key
 * compromise does not additionally hand over the ability to correlate
 * fingerprints across users.
 *
 * ## The stored shape
 *
 * `<prefix>:<6 lowercase hex>` — e.g. `sk-proj:a3f9c1`, rendered for humans as
 * `sk-proj · a3f9c1`. The prefix is stored rather than recomputed because
 * recomputing it would require the key, which is exactly what is unavailable.
 * `user_ai_credentials.fingerprint` carries the composed value under a CHECK
 * that pins this vocabulary in the database, so an unknown prefix cannot be
 * written even by a caller that skipped this module.
 */

/**
 * BYOK-FINGERPRINT-004 — a **closed** allowlist, never a slice of arbitrary
 * input.
 *
 * Order matters: `sk-proj` is tested before `sk`, because every `sk-proj-…` key
 * also starts with `sk-`. Longest match first is the whole reason this is an
 * ordered list rather than a set.
 *
 * The literal strings are duplicated in migration `202608010065`'s CHECK
 * constraint on purpose — one in TypeScript, one in Postgres — and
 * `fingerprint.test.ts` asserts the two agree by reading the migration, so the
 * duplication cannot drift.
 */
export const FINGERPRINT_PREFIXES = ["sk-proj", "sk"] as const;

/** The fallback. A key shaped like nothing known is still fingerprintable. */
export const UNKNOWN_PREFIX = "unknown";

export type FingerprintPrefix = (typeof FINGERPRINT_PREFIXES)[number] | typeof UNKNOWN_PREFIX;

/** How many hex characters of the HMAC survive. */
export const FINGERPRINT_HEX_LENGTH = 6;

/**
 * Classify a key into the closed vocabulary.
 *
 * Deliberately total: every input maps to a member of the vocabulary, and no
 * input can produce anything else. There is no branch here that returns part of
 * `apiKey`.
 */
export function classifyPrefix(apiKey: string): FingerprintPrefix {
  for (const prefix of FINGERPRINT_PREFIXES) {
    if (apiKey.startsWith(`${prefix}-`)) return prefix;
  }
  return UNKNOWN_PREFIX;
}

function toHex(bytes: Bytes): string {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

/**
 * The stored fingerprint for one key.
 *
 * Takes the pepper as an argument rather than reading it: the only sanctioned
 * reader of `BYOK_FINGERPRINT_PEPPER` is `requireFingerprintPepper` in the
 * crypto core, and BYOK-GUARD-005 asserts that no other module reads it.
 */
export async function computeFingerprint(apiKey: string, pepper: Bytes): Promise<string> {
  const digest = await hmacSha256(pepper, apiKey);
  return `${classifyPrefix(apiKey)}:${toHex(digest).slice(0, FINGERPRINT_HEX_LENGTH)}`;
}

/**
 * The display form. Separated from storage so the stored value stays a stable,
 * machine-comparable token while the rendered one can carry typography.
 *
 * It parses rather than trusts: a stored value that does not match the closed
 * shape is rendered as `unknown` instead of being echoed into the page, so a row
 * written past the CHECK constraint still cannot put arbitrary text on screen.
 */
export function formatFingerprint(stored: string): string {
  const match = /^(sk-proj|sk|unknown):([0-9a-f]{6})$/.exec(stored);
  if (!match) return UNKNOWN_PREFIX;
  return `${match[1]} · ${match[2]}`;
}
