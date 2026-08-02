import { decodeMasterKey, type Bytes } from "./envelope";

/**
 * The bounded two-key master-key rotation window — BYOK.6's last code
 * deliverable, and the only rotation shape `BYOK_INCIDENT_RUNBOOK.md` §2a
 * describes as correct for hygiene rather than for compromise.
 *
 * ## The whole idea in one paragraph
 *
 * Rotating a master key cannot be atomic: rows sealed under the old key exist
 * until something re-seals them. So there is a **window** in which two keys are
 * meaningful — the current one, which encrypts every new write, and the
 * previous one, which is **read-only** and temporary. `key_version` says which
 * key sealed a row, so the reader *knows* which key to use and never has to
 * guess. When every row has been re-sealed, the previous key is removed and the
 * window closes.
 *
 * ## Why `key_version` decides, and nothing else
 *
 * The tempting implementation tries the current key and falls back to the
 * previous one on failure. That is a **decryption oracle**: the number of keys
 * tried is observable in timing, and "it opened under the old key" is a fact an
 * attacker would like. `BYOK-CRYPTO-005` forbids a decryption failure from
 * naming its cause for exactly this reason. Here the row states its own
 * version, one key is selected, and a failure is one word — so a row sealed
 * under a key nobody holds fails identically to a corrupt row.
 *
 * This also means the window is **not** a trial-decrypt path that could be left
 * switched on by accident: with no previous key configured, a row at the
 * previous version is simply unreadable, exactly as it would be with no window
 * at all.
 *
 * ## What is deliberately absent
 *
 * **A third key.** Two names are read and no more. An n-key ring turns "which
 * rows are still old" into an unanswerable question and makes the window
 * unbounded in practice, which is the failure `ADR-069` exists to prevent.
 *
 * **A default expiry.** A window with no declared end is a permanent one. The
 * previous key is accepted only alongside an explicit expiry instant, and only
 * while that instant is both in the future and no more than
 * {@link MAX_PREVIOUS_KEY_WINDOW_DAYS} days out.
 *
 * **Any awareness of plaintext.** Nothing here decrypts, encrypts, logs or
 * accepts a credential. It answers one question — *which key material applies
 * to this row* — and the callers do the rest.
 */

/** `BYOK-ROTATION-004`. A window longer than this is not bounded, it is a habit. */
export const MAX_PREVIOUS_KEY_WINDOW_DAYS = 30;

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export type MasterKeyEnv = Readonly<Record<string, string | undefined>>;

/**
 * The resolved key material for a rotation window.
 *
 * `previous` is present only when a previous key **and** a valid, unexpired
 * expiry are both configured. A configured key with an expired window resolves
 * to `previous: null` rather than to an error: the window closing is a normal
 * event, and it must not take the runtime down.
 */
export type MasterKeyRing = {
  readonly current: Bytes;
  readonly currentVersion: number;
  readonly previous: Bytes | null;
  /** The version `previous` seals, or `null` when there is no previous key. */
  readonly previousVersion: number | null;
  readonly previousExpiresAt: string | null;
};

export const CURRENT_KEY_VERSION_DEFAULT = 1;

function parseCurrentVersion(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return CURRENT_KEY_VERSION_DEFAULT;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("BYOK_MASTER_KEY_VERSION must be a positive integer");
  }
  return value;
}

/**
 * Whether the declared window is still open, given the instant to judge it
 * against.
 *
 * `now` is a parameter rather than a call to the clock so this stays pure and
 * so the boundary cases are testable without freezing time globally.
 */
export function previousKeyWindowState(
  expiresAt: string | undefined,
  now: Date,
): { readonly open: boolean; readonly reason: "open" | "absent" | "expired" | "too-long" } {
  if (expiresAt === undefined || expiresAt.trim() === "") {
    return { open: false, reason: "absent" };
  }

  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) {
    throw new Error("BYOK_PREVIOUS_MASTER_KEY_EXPIRES_AT is not a valid instant");
  }

  const remaining = expiry.getTime() - now.getTime();
  if (remaining <= 0) return { open: false, reason: "expired" };
  if (remaining > MAX_PREVIOUS_KEY_WINDOW_DAYS * MILLISECONDS_PER_DAY) {
    // Refused rather than truncated. Silently shortening an operator's declared
    // window would make the runtime disagree with the runbook about when the
    // old key stops working, which is the one fact a rotation needs everyone to
    // share.
    throw new Error(
      `BYOK_PREVIOUS_MASTER_KEY_EXPIRES_AT is more than ${MAX_PREVIOUS_KEY_WINDOW_DAYS} days away`,
    );
  }
  return { open: true, reason: "open" };
}

/**
 * The key ring, validated at startup.
 *
 * **Fails to start; never falls back.** A malformed *current* key is the
 * existing `BYOK-MASTER-005` rule. A malformed *previous* key is treated
 * identically on purpose: an operator who pasted a broken previous key has a
 * rotation that will silently strand every old row, and discovering that when
 * the window closes is the worst possible time.
 */
export function resolveMasterKeyRing(env: MasterKeyEnv, now: Date): MasterKeyRing {
  const current = decodeMasterKey(env.BYOK_MASTER_KEY, "BYOK_MASTER_KEY");
  const currentVersion = parseCurrentVersion(env.BYOK_MASTER_KEY_VERSION);
  const previousRaw = env.BYOK_PREVIOUS_MASTER_KEY;

  if (previousRaw === undefined || previousRaw.trim() === "") {
    // An expiry with no key is a misconfiguration worth naming: it means an
    // operator believes a window is open when nothing can read the old rows.
    if (env.BYOK_PREVIOUS_MASTER_KEY_EXPIRES_AT) {
      throw new Error(
        "BYOK_PREVIOUS_MASTER_KEY_EXPIRES_AT is set without BYOK_PREVIOUS_MASTER_KEY",
      );
    }
    return {
      current,
      currentVersion,
      previous: null,
      previousVersion: null,
      previousExpiresAt: null,
    };
  }

  // Validated even when the window has closed: a broken value must be reported
  // while an operator is still looking at the rotation, not months later.
  const previous = decodeMasterKey(previousRaw, "BYOK_PREVIOUS_MASTER_KEY");
  const window = previousKeyWindowState(env.BYOK_PREVIOUS_MASTER_KEY_EXPIRES_AT, now);

  if (currentVersion < 2) {
    throw new Error("BYOK_PREVIOUS_MASTER_KEY requires BYOK_MASTER_KEY_VERSION of at least 2");
  }

  if (!window.open) {
    return {
      current,
      currentVersion,
      previous: null,
      previousVersion: null,
      previousExpiresAt: env.BYOK_PREVIOUS_MASTER_KEY_EXPIRES_AT ?? null,
    };
  }

  return {
    current,
    currentVersion,
    previous,
    previousVersion: currentVersion - 1,
    previousExpiresAt: env.BYOK_PREVIOUS_MASTER_KEY_EXPIRES_AT ?? null,
  };
}

/**
 * The one key that may open a row at `keyVersion`, or `null`.
 *
 * Exactly one candidate is ever returned. There is no list, no ordering and no
 * "try the next one" — that is what keeps this from being an oracle.
 */
export function keyForVersion(ring: MasterKeyRing, keyVersion: number): Bytes | null {
  if (keyVersion === ring.currentVersion) return ring.current;
  if (ring.previous !== null && keyVersion === ring.previousVersion) return ring.previous;
  return null;
}

/**
 * How far a rotation has got. `remaining === 0` is the only completion signal,
 * and it is a count rather than a flag so "finished" cannot be asserted by a
 * caller that never looked.
 */
export type RotationProgress = {
  readonly currentVersion: number;
  readonly atCurrentVersion: number;
  readonly atPreviousVersion: number;
  readonly unreadable: number;
  readonly remaining: number;
  readonly complete: boolean;
};

export function summarizeRotation(
  rows: ReadonlyArray<{ readonly key_version: number | null }>,
  ring: MasterKeyRing,
): RotationProgress {
  let atCurrentVersion = 0;
  let atPreviousVersion = 0;
  let unreadable = 0;

  for (const row of rows) {
    if (row.key_version === ring.currentVersion) atCurrentVersion += 1;
    else if (ring.previousVersion !== null && row.key_version === ring.previousVersion) {
      atPreviousVersion += 1;
    } else unreadable += 1;
  }

  const remaining = atPreviousVersion + unreadable;
  return {
    currentVersion: ring.currentVersion,
    atCurrentVersion,
    atPreviousVersion,
    unreadable,
    remaining,
    // A row nobody can read still counts as remaining: it is not re-sealed, and
    // reporting the rotation complete while such a row exists would hide the
    // one case an operator most needs to see before dropping the old key.
    complete: remaining === 0,
  };
}
