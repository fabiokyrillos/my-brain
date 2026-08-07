import { RATE_LIMIT_WINDOW_INTERVAL, rateLimitCeiling } from "@/lib/rate-limits";
import { readRateLimitVerdict, type RateLimitBucket, type RateLimitVerdict } from "./refusal";

/**
 * The one place the application asks the database for a slot — `2H-RATE-001`,
 * `2H-RATE-002`, `2H-RATE-005`.
 *
 * ## Why the ceiling is passed and not defaulted
 *
 * ADR-080's discipline. `claim_rate_limit_slot` takes the ceiling and the window
 * as **required** arguments with no default anywhere in its signature, so the
 * numbers a running system uses are readable in the call rather than buried in
 * DDL. They come from `RATE_LIMITS`, which `rate-limits-parity.test.ts` pins to
 * PRD §14.2 and to the migration's seed in both directions.
 *
 * ## Why this module is not `server-only`
 *
 * `error-sink.ts`'s reasoning, unchanged: the caller passes the client in, this
 * module holds no credential and reads no environment variable, and the
 * behaviour that matters — that an unreadable limiter refuses rather than
 * admits — is only provable by *running* it against a stub client. Vitest runs
 * under `jsdom`, where `server-only` throws at import, so the guard would buy
 * nothing and cost the one assertion `2H-RATE-005` asks for.
 *
 * ## Fail-closed is a property of this function, not only of the SQL
 *
 * The database refuses when its own state is unreadable. This function refuses
 * when the *database* is unreachable, when the row shape is wrong, and when the
 * refusal string is one it does not recognise. Between them, the only path that
 * ends in `admitted: true` is one where a well-formed row said so.
 */
/**
 * The narrowest shape this module needs, rather than `Pick<SupabaseClient,
 * "rpc">`.
 *
 * A real client's `rpc` returns a `PostgrestFilterBuilder`, which is a thenable
 * resolving to `{ data, error }` — so a real client satisfies this and a test
 * stub can too, without the `as never` an over-wide parameter type would force
 * on every call site in the suite. The behaviour under test here is what happens
 * to malformed and absent responses, and a cast that erased the type would erase
 * exactly the thing being tested.
 */
export type RateLimitRpcClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

export async function claimRateLimitSlot(
  client: RateLimitRpcClient,
  bucket: RateLimitBucket,
): Promise<RateLimitVerdict> {
  try {
    const { data, error } = await client.rpc("claim_rate_limit_slot", {
      p_bucket: bucket,
      p_ceiling: rateLimitCeiling(bucket),
      p_window: RATE_LIMIT_WINDOW_INTERVAL,
    });
    return readRateLimitVerdict(error, data);
  } catch {
    // A throw is not an admission. This is the same rule as the branch above,
    // covering the transport that never produced a response at all.
    return { admitted: false, refusal: "RATE_LIMIT_STATE_UNAVAILABLE", slotId: null };
  }
}
