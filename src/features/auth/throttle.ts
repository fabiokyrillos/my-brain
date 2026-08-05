import "server-only";

import { headers } from "next/headers";
import { hmacSha256, requireRateLimitPepper } from "@/lib/byok/crypto";
import { canonicalizeIp } from "@/lib/byok/ip";
import type { Bytes } from "@/lib/byok/envelope";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  AUTH_EVENT_CEILINGS,
  normalizeAuthIdentifier,
  type AuthEventKind,
  type AuthEventOutcome,
} from "./throttle-policy";

/**
 * The application half of the auth throttle (SH-THROTTLE-002/003/007).
 *
 * The mechanism is migration `202608040075`; ADR-080 records why it is reachable
 * by `anon` and why the ceilings arrive as parameters. This module is the only
 * thing that calls it.
 *
 * ## It never reaches for a privileged credential
 *
 * The Supabase client passed in is the ordinary session-scoped one — the same
 * `createClient()` every Server Action already uses. There is no service-role
 * client in this application and ADR-080 declines to add one: removing an
 * anonymous INSERT path by installing an RLS-bypassing key in the web tier is a
 * strictly worse trade, and it would make authentication depend on a new
 * production secret in exactly the way a missing `APP_ORIGIN` already broke
 * recovery once.
 *
 * ## The hashes are domain-separated from BYOK's
 *
 * Both features share `BYOK_RATE_LIMIT_PEPPER` and `canonicalizeIp`, so no new
 * production secret and no second canonicalization rule appear. But the HMAC
 * input carries an `auth:` tag (ADR-080 Decision 3), so an auth attempt's
 * `ip_hash` never equals the BYOK ledger's `ip_hash` for the same address —
 * otherwise anyone reading both tables could correlate a named BYOK user with
 * an anonymous auth attempt, which is the join the pepper exists to prevent.
 *
 * The pepper itself is read through `requireRateLimitPepper`, the crypto core's
 * sanctioned reader, exactly as `byok/actions.ts` does. Nothing here touches
 * `crypto.subtle` — `BYOK-GUARD-005` forbids keyed crypto outside the cores.
 */

/** The digest the `^[0-9a-f]{64}$` CHECK accepts, and nothing else. */
function toHex(bytes: Bytes): string {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

export async function hashAuthIdentifier(value: string, pepper: Bytes): Promise<string> {
  return toHex(await hmacSha256(pepper, `auth:identifier:${normalizeAuthIdentifier(value)}`));
}

export async function hashAuthIp(
  value: string | null | undefined,
  pepper: Bytes,
): Promise<string> {
  return toHex(await hmacSha256(pepper, `auth:ip:${canonicalizeIp(value)}`));
}

/**
 * The client address, from the proxy header the deployment actually sets.
 *
 * The **first** hop is taken, not the last: `X-Forwarded-For` is appended to by
 * every proxy in the chain, so the last entry is the nearest proxy — throttling
 * on it would put every caller in one bucket. A client can forge the first entry,
 * and that is tolerable here for the reason `canonicalizeIp` already documents:
 * a forged value buys a fresh bucket, which is the same thing a real second
 * address buys, and the per-identifier ceiling is the one that does the precise
 * work. Returning `null` rather than inventing a value keeps the RPC's nullable
 * contract meaningful — "no address was available" is a real state.
 */
export async function clientIpFromRequest(): Promise<string | null> {
  const store = await headers();
  const forwarded = store.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return store.get("x-real-ip") ?? null;
}

export type ThrottleAdmission =
  | { readonly admitted: true; readonly attemptId: string }
  /** The ceiling refused this attempt. Uniform copy, per SH-SIGNUP-011. */
  | { readonly admitted: false; readonly reason: "throttled" }
  /** The throttle could not be consulted. Fail closed — see below. */
  | { readonly admitted: false; readonly reason: "unavailable" };

/** The declared detail `claim_auth_event_slot` raises when a ceiling refuses. */
const THROTTLED_DETAIL = "AUTH_EVENT_THROTTLED";

type AuthClient = SupabaseClient<Database>;

/**
 * Reserves one attempt, or refuses.
 *
 * ## Why an unreachable throttle refuses instead of proceeding
 *
 * The tempting behaviour is to let the request through when the RPC errors, so
 * a transient fault never blocks a login. That is the wrong direction for this
 * particular control. A throttle that fails open is one an attacker can *choose*
 * to disable by inducing errors, and when it is off nothing says so — T-14
 * (signup flood), T-15 (email bombing) and T-16 (recovery abuse) all become
 * unbounded silently. An outage is loud and bounded; a silent hole is neither.
 *
 * So an unreachable throttle produces `unavailable`, which the actions render as
 * their own declared code — distinct from a credential failure, from a ceiling
 * refusal and from a CAPTCHA failure, because those four are different facts and
 * SH-COPY-004 requires the refusals to be told apart.
 */
export async function admitAuthEvent(
  supabase: AuthClient,
  kind: AuthEventKind,
  identifier: string | null,
): Promise<ThrottleAdmission> {
  const ceiling = AUTH_EVENT_CEILINGS[kind];
  try {
    const pepper = requireRateLimitPepper();
    const [identifierHash, ipHash] = await Promise.all([
      identifier === null ? Promise.resolve(null) : hashAuthIdentifier(identifier, pepper),
      clientIpFromRequest().then((ip) => (ip === null ? null : hashAuthIp(ip, pepper))),
    ]);

    /*
     * One narrowly-scoped assertion, because the generated type is wrong here
     * and the value is right.
     *
     * `supabase gen types` marks every argument without a SQL DEFAULT as
     * non-null. Both hashes are genuinely nullable — the migration documents
     * "no address was available" as a real state, the columns are nullable, and
     * the function branches on `is not null` before it validates shape.
     *
     * Passing `undefined` instead is not an escape: PostgREST would omit the
     * argument entirely, and a function with no DEFAULT for it would then not
     * match the call at all. So the null has to travel, and the assertion is on
     * the argument object rather than on the call, so the return type stays
     * checked.
     */
    const args = {
      p_kind: kind,
      p_identifier_hash: identifierHash,
      p_ip_hash: ipHash,
      p_identifier_ceiling: ceiling.identifier,
      p_ip_ceiling: ceiling.ip,
      p_window: `${ceiling.windowSeconds} seconds`,
    };
    const { data, error } = await supabase.rpc(
      "claim_auth_event_slot",
      args as Database["public"]["Functions"]["claim_auth_event_slot"]["Args"],
    );

    if (error) {
      // The ceiling firing is a normal outcome, not a fault. It is told apart by
      // the declared detail rather than by the message, so provider prose can
      // change without turning a throttle into an outage.
      const throttled = `${error.details ?? ""}${error.message ?? ""}`.includes(THROTTLED_DETAIL);
      if (throttled) return { admitted: false, reason: "throttled" };
      // Deliberately not forwarded: an RPC error message can name a function, a
      // column or an argument, and none of that belongs in an auth response.
      console.error("auth throttle unavailable", { kind, code: error.code });
      return { admitted: false, reason: "unavailable" };
    }

    if (typeof data !== "string") {
      console.error("auth throttle returned no attempt id", { kind });
      return { admitted: false, reason: "unavailable" };
    }
    return { admitted: true, attemptId: data };
  } catch (cause) {
    // A missing pepper lands here, and it is a deployment fault of exactly the
    // `APP_ORIGIN` shape: refuse honestly rather than proceed unthrottled.
    console.error("auth throttle could not be consulted", {
      kind,
      cause: cause instanceof Error ? cause.name : "unknown",
    });
    return { admitted: false, reason: "unavailable" };
  }
}

/**
 * Records how the reserved attempt ended.
 *
 * Failure here is swallowed on purpose, and it is the one place in this module
 * where that is right: the slot is already reserved and already counts, so a
 * failed finalize leaves the row at its provisional `unknown` — which still
 * counts against the ceiling. The failure direction is toward *more* throttling,
 * never less, so there is nothing to protect by surfacing it to the caller.
 */
export async function finalizeAuthEvent(
  supabase: AuthClient,
  attemptId: string,
  outcome: AuthEventOutcome,
): Promise<void> {
  const { error } = await supabase.rpc("finalize_auth_event_attempt", {
    p_attempt_id: attemptId,
    p_outcome: outcome,
  });
  if (error) console.error("auth attempt finalize failed", { code: error.code });
}
