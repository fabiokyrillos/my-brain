import { decodeMasterKey, type Bytes } from "./byok-envelope.ts";

/**
 * The bounded two-key master-key rotation window, Deno half.
 *
 * ## Why this file duplicates `src/lib/byok/rotation.ts`
 *
 * The standing constraint: the Node copy is imported by `crypto.ts`, which
 * carries `server-only` and throws under Deno. The repository's answer is the
 * one it has used for the envelope, the secret and the extraction schema —
 * duplicate deliberately, then **prove the two agree**. The body-for-body lock
 * is in `src/lib/byok/rotation-parity.test.ts`.
 *
 * ## The one declared asymmetry
 *
 * Node reads `process.env`; this reads `Deno.env`. Everything else — the
 * window rules, the 30-day maximum, the version arithmetic, the single-candidate
 * selection — is intentionally identical, because a worker that disagreed with
 * the application about which key seals a row would strand exactly the credentials
 * a rotation exists to preserve.
 *
 * The reasoning for every rule lives in the Node copy and is not repeated here;
 * the parity test compares the executable bodies, not the prose.
 */

export const MAX_PREVIOUS_KEY_WINDOW_DAYS = 30;

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export type MasterKeyEnv = Readonly<Record<string, string | undefined>>;

export type MasterKeyRing = {
  readonly current: Bytes;
  readonly currentVersion: number;
  readonly previous: Bytes | null;
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
    throw new Error(
      `BYOK_PREVIOUS_MASTER_KEY_EXPIRES_AT is more than ${MAX_PREVIOUS_KEY_WINDOW_DAYS} days away`,
    );
  }
  return { open: true, reason: "open" };
}

export function resolveMasterKeyRing(env: MasterKeyEnv, now: Date): MasterKeyRing {
  const current = decodeMasterKey(env.BYOK_MASTER_KEY, "BYOK_MASTER_KEY");
  const currentVersion = parseCurrentVersion(env.BYOK_MASTER_KEY_VERSION);
  const previousRaw = env.BYOK_PREVIOUS_MASTER_KEY;

  if (previousRaw === undefined || previousRaw.trim() === "") {
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

export function keyForVersion(ring: MasterKeyRing, keyVersion: number): Bytes | null {
  if (keyVersion === ring.currentVersion) return ring.current;
  if (ring.previous !== null && keyVersion === ring.previousVersion) return ring.previous;
  return null;
}

/**
 * The worker's startup resolution. The declared asymmetry: `Deno.env`.
 *
 * The clock is read here rather than inside `resolveMasterKeyRing` for the same
 * reason as in the Node copy — the decision function stays pure and testable.
 */
export function requireMasterKeyRing(): MasterKeyRing {
  return resolveMasterKeyRing(
    {
      BYOK_MASTER_KEY: Deno.env.get("BYOK_MASTER_KEY"),
      BYOK_MASTER_KEY_VERSION: Deno.env.get("BYOK_MASTER_KEY_VERSION"),
      BYOK_PREVIOUS_MASTER_KEY: Deno.env.get("BYOK_PREVIOUS_MASTER_KEY"),
      BYOK_PREVIOUS_MASTER_KEY_EXPIRES_AT: Deno.env.get(
        "BYOK_PREVIOUS_MASTER_KEY_EXPIRES_AT",
      ),
    },
    new Date(),
  );
}
