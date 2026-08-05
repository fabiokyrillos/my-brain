/**
 * The auth throttle's decisions, as pure functions (SH-THROTTLE-002/003/005,
 * SH-SIGNUP-011).
 *
 * Deliberately **without** `server-only`, and separate from the module that
 * hashes and calls the RPC: the same separation `signup-policy.ts` already uses.
 * The ceilings and the identifier normalization are decisions worth testing
 * without a database or a request, and nothing here reads configuration, so
 * importing it can never leak one.
 *
 * The mechanism lives in migration `202608040075`; ADR-080 records why the
 * ceilings are here rather than in that migration's DDL.
 */

/** The closed `kind` set of `auth_event_attempts`. Must match the CHECK. */
export const AUTH_EVENT_KINDS = [
  "signup",
  "signin_failure",
  "recovery",
  "resend",
] as const;

export type AuthEventKind = (typeof AUTH_EVENT_KINDS)[number];

/** The closed `outcome` set, minus the provisional `unknown` a claim reserves with. */
export const AUTH_EVENT_OUTCOMES = [
  "succeeded",
  "refused",
  "throttled",
  "provider_error",
] as const;

export type AuthEventOutcome = (typeof AUTH_EVENT_OUTCOMES)[number];

export type AuthEventCeiling = {
  /** Attempts per identifier per window. */
  readonly identifier: number;
  /** Attempts per client address per window. */
  readonly ip: number;
  /** The window, in seconds — passed to the RPC as an interval. */
  readonly windowSeconds: number;
  /**
   * True when the number is still waiting on a hosted readback rather than
   * settled. Rendered nowhere; it exists so the pending state is a property of
   * the data instead of a comment somebody has to notice.
   */
  readonly provisional?: true;
};

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

/**
 * The ceilings.
 *
 * ## Why the IP ceiling is looser than the identifier ceiling everywhere
 *
 * One address is one account; one IP is a university, an office or a carrier
 * NAT. A per-IP ceiling tight enough to stop a determined attacker is tight
 * enough to lock out everyone behind a shared egress, and SH-THROTTLE-006's
 * whole concern is refusals that land on the wrong person. So the identifier
 * ceiling does the precise work and the IP ceiling is a blunt backstop against
 * volume.
 *
 * ## Why these sit below the provider's
 *
 * SH-THROTTLE-005: the application's refusal must fire *first*, because it is
 * the one with uniform copy (SH-SIGNUP-011). If GoTrue's limit fires first the
 * caller gets the provider's error class, which differs between an address that
 * exists and one that does not — the exact distinction the uniform copy exists
 * to erase. The stable provider ceilings read back on 2026-08-04 were
 * `rate_limit_verify` and `rate_limit_otp` at 30 per 5 minutes per IP and
 * `rate_limit_token_refresh` at 150; every ceiling below is far under those.
 */
export const AUTH_EVENT_CEILINGS: Readonly<Record<AuthEventKind, AuthEventCeiling>> = {
  signup: { identifier: 3, ip: 10, windowSeconds: DAY },

  // Not an email path, so the mail budget does not bind it. Tighter per
  // identifier than the rest because this is the one kind where the attempts
  // are guesses at a password rather than requests for a message.
  signin_failure: { identifier: 10, ip: 30, windowSeconds: HOUR },

  recovery: { identifier: 3, ip: 10, windowSeconds: DAY },

  /**
   * **PROVISIONAL — pending the post-SMTP hosted readback.**
   *
   * The binding provider ceiling for anything that sends mail is
   * `rate_limit_email_sent`, read back on 2026-08-04 as **2 per hour**. That is
   * the *default Supabase SMTP* value: it exists because no custom sender is
   * configured, and it changes the day Resend lands.
   *
   * So this number is not frozen against it. `2` is chosen to sit at the
   * current ceiling rather than below it — a resend surface that refuses before
   * the provider would, on a limit that is about to change, is a self-inflicted
   * outage. When SMTP is configured, re-run the readback and revisit this and
   * `recovery` together; ADR-080 records that obligation, and nothing in the
   * database has to change to honour it, because the ceiling is a parameter.
   */
  resend: { identifier: 2, ip: 8, windowSeconds: HOUR, provisional: true },
};

/**
 * The identifier a ceiling counts, before it is hashed.
 *
 * ## Why this is not just `toLowerCase()`
 *
 * A ceiling counts buckets, and a bucket is only a ceiling if the same subject
 * always lands in it. `User@Example.com` and `user@example.com` are one
 * mailbox to every provider and two buckets to a naive hash — so an attacker
 * gets a fresh allowance per spelling, and the ceiling counts nothing. This is
 * the same failure `canonicalizeIp` exists to prevent on the address side, and
 * it is stated as part of the contract for the same reason.
 *
 * Domain case is folded and surrounding whitespace is dropped, which is safe
 * for every address. The local part is folded too: it is case-sensitive in the
 * RFC, but no mainstream provider treats it that way, and the failure
 * directions are asymmetric — folding merges two spellings of one real mailbox
 * into one bucket (correct for a throttle), while not folding hands an attacker
 * an unlimited supply of buckets for a single victim.
 *
 * It deliberately does **not** strip dots or `+tags`. Those are Gmail
 * conventions, not standards, and applying them universally would merge
 * genuinely distinct mailboxes at other providers into one bucket — throttling
 * strangers against each other. The residual is recorded rather than papered
 * over: a Gmail user can obtain fresh buckets with `+tags`, bounded by the IP
 * ceiling, and SH-SIGNUP-013's disposable-address posture is where that is
 * revisited with data.
 */
export function normalizeAuthIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

export type ThrottleDecision =
  | { readonly allowed: true; readonly attemptId: string }
  | { readonly allowed: false };

/**
 * SH-SIGNUP-011 — the outcome an action reports, given what the provider said.
 *
 * ## The rule this encodes
 *
 * Register, recover and resend must be **enumeration-uniform**: the same
 * outcome copy and the same response class whether the address exists or not.
 * That is mostly true already, because GoTrue's own recovery and signup paths
 * are uniform — but it stops being true at the edges, and the edges are the
 * whole point:
 *
 * - A **rate-limit** error from the provider is only reachable when a mail was
 *   actually attempted, so surfacing it distinguishes "throttled because the
 *   address exists" from "throttled". The throttle is therefore consulted
 *   *before* the provider (SH-THROTTLE-003) and its refusal is one shared code
 *   for both branches.
 * - A **provider error** of any other kind is reported as the same generic
 *   failure for both branches rather than forwarded.
 *
 * ## What this does NOT claim
 *
 * Timing. A request that reaches the provider takes longer than one the
 * throttle refuses, and an existing address may take longer inside the provider
 * than an unknown one. SH-SIGNUP-011 requires that residual to be *measured
 * once and recorded*, not argued away, and it has not been measured yet.
 */
export function uniformOutcome(
  providerFailed: boolean,
  fallback: "signup-failed" | "recovery-failed",
): { readonly code: string | null; readonly outcome: AuthEventOutcome } {
  if (!providerFailed) return { code: null, outcome: "succeeded" };
  return { code: fallback, outcome: "provider_error" };
}
