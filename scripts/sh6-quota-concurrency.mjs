#!/usr/bin/env node
/**
 * SH-QUOTA-001/002 — the ceilings under GENUINE concurrency.
 *
 * ## Why this exists outside pgTAP
 *
 * A pgTAP file is one session. It can prove that the Nth insert succeeds and
 * the N+1th is refused **in sequence**, which is necessary and not the
 * interesting condition. The property that matters is the race: N requests
 * arriving at the boundary together must admit exactly the ceiling, and a
 * sequential test passes identically whether the advisory locks are there or
 * not.
 *
 * The naive implementation this guards against is "count, then decide, then
 * insert". Under READ COMMITTED every racer reads `ceiling - 1`, every racer
 * concludes it may proceed, and the ceiling is exceeded by however many arrived
 * together. `private.enforce_entry_quota` takes `pg_advisory_xact_lock` on the
 * owner's bucket and counts *after* the rows are in, inside the same
 * transaction — so a waiting racer counts a committed row rather than missing
 * it. This script is the only thing in the repository that can tell the two
 * designs apart.
 *
 * ## It runs against the deployed project, as `authenticated`
 *
 * Deliberately the same role and the same endpoint the Server Actions use, so
 * what is proven is the deployed path rather than a privileged imitation. It
 * inserts straight into PostgREST rather than through `capture_entry_async`,
 * which is the harder case: it is the path that bypasses the RPC entirely, and
 * the one a trigger has to hold on its own.
 *
 * ## Side effects, stated plainly
 *
 * It creates ONE disposable account (the SH-GD.3 pattern), writes entries under
 * it, and deletes the account at the end — which cascades the entries away. It
 * touches no real user's data and consumes no real user's allowance. If it is
 * interrupted, the disposable account survives and `scripts/sh-delete-015-
 * manifest.mjs` will list it; its email prefix is `sh6-quota-race`.
 *
 * It does NOT change any ceiling. The run is sized against the deployed value.
 *
 * Usage:
 *   node scripts/sh6-quota-concurrency.mjs           # against the linked project
 *   RACERS=24 node scripts/sh6-quota-concurrency.mjs
 */

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { getLinkedSupabaseCredentials } from "./linked-supabase.mjs";

const { url, serviceRoleKey, publishableKey } = getLinkedSupabaseCredentials();
if (!url || !serviceRoleKey || !publishableKey) {
  console.error("A linked Supabase project with a service-role and publishable key is required.");
  process.exit(2);
}

/**
 * The ceiling this run races against.
 *
 * Read out of the constants module rather than assumed, so the script cannot
 * quietly test a number the product no longer uses. It is read as text because
 * a plain node script cannot import a `.ts` module without a loader, and adding
 * a build step to a diagnostic is a worse trade than one regex.
 *
 * `liveJobsPerUser` is the smaller of the two racing ceilings and therefore the
 * cheap one: reaching the 300-entry boundary would need 300 rows to learn the
 * same fact about the same mechanism.
 */
const ceiling = (() => {
  const source = readFileSync(new URL("../src/lib/quotas.ts", import.meta.url), "utf8");
  const match = /liveJobsPerUser:\s*(\d+)/.exec(source);
  if (!match) throw new Error("liveJobsPerUser is no longer readable from src/lib/quotas.ts");
  return Number(match[1]);
})();

const RACERS = Number(process.env.RACERS ?? ceiling + 10);

const nonce = randomBytes(6).toString("hex");
const email = `sh6-quota-race-${nonce}@example.test`;
const password = `Qr!${randomBytes(18).toString("base64url")}`;

const admin = (path, init = {}) =>
  fetch(`${url}${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

console.log(`project : ${new URL(url).hostname}`);
console.log(`ceiling : ${ceiling} live jobs per user`);
console.log(`racers  : ${RACERS} simultaneous inserts by one owner\n`);

// ---------------------------------------------------------------------------
// The disposable owner. Created through the admin API because signup is closed
// and stays closed -- this script must never be a reason to open it.
// ---------------------------------------------------------------------------

const created = await admin("/auth/v1/admin/users", {
  method: "POST",
  body: JSON.stringify({ email, password, email_confirm: true }),
});
if (!created.ok) {
  console.error(`could not create the disposable account: ${created.status}`);
  process.exit(1);
}
const userId = (await created.json()).id;

let exitCode = 1;
try {
  // A session WITHOUT signing in, because a password grant needs a CAPTCHA
  // token: SH.5 enabled Turnstile on this project, so `grant_type=password`
  // answers 400 to any caller that has not solved a widget. `generate_link`
  // mints a recovery token and `/verify` exchanges it, which is the same
  // CAPTCHA-free path `sh5-password-policy-probe.mjs` established.
  //
  // `hashed_token` with `token_hash` -- NOT `token` + `email`, which is the
  // raw-OTP shape and answers `otp_expired` for a hash it cannot match.
  const link = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "recovery", email }),
  }).then((r) => r.json());

  const hashedToken = link.hashed_token
    ?? new URL(link.action_link ?? `${url}/?token=`).searchParams.get("token");
  const verified = await fetch(`${url}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "recovery", token_hash: hashedToken }),
  });
  if (!verified.ok) throw new Error(`session exchange failed: ${verified.status}`);
  const accessToken = (await verified.json()).access_token;
  if (!accessToken) throw new Error("session exchange returned no access token");

  async function insertJob(index) {
    const started = Date.now();
    const response = await fetch(`${url}/rest/v1/jobs`, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        user_id: userId,
        type: "process_attachment",
        payload: {},
        idempotency_key: `sh6-race-${nonce}-${index}`,
      }),
    });
    const body = response.ok ? "" : await response.text();
    return {
      ms: Date.now() - started,
      admitted: response.ok,
      refused: body.includes("QUOTA_LIVE_JOBS"),
      status: response.status,
      body,
    };
  }

  // The whole point: fired together, not awaited in turn.
  const results = await Promise.all(
    Array.from({ length: RACERS }, (_unused, index) => insertJob(index)),
  );

  const admitted = results.filter((entry) => entry.admitted).length;
  const refused = results.filter((entry) => entry.refused).length;
  const other = results.filter((entry) => !entry.admitted && !entry.refused);

  console.log(`admitted : ${admitted}`);
  console.log(`refused  : ${refused}`);
  if (other.length) {
    console.log(`unexpected: ${other.length}`);
    for (const entry of other.slice(0, 3)) {
      console.log(`   ${entry.status} ${entry.body.slice(0, 160)}`);
    }
  }

  const spread = results.map((entry) => entry.ms).sort((a, b) => a - b);
  console.log(`latency  : ${spread[0]}ms .. ${spread[spread.length - 1]}ms`);

  // The stored truth, not the responses: what matters is how many rows exist.
  const stored = await admin(
    `/rest/v1/jobs?user_id=eq.${userId}&status=in.(pending,running,failed)&select=id`,
    { headers: { Prefer: "count=exact" } },
  );
  const liveRows = (await stored.json()).length;

  const exact = admitted === ceiling && liveRows === ceiling;
  const accounted = admitted + refused === RACERS;

  console.log(`\nlive rows in the database: ${liveRows}`);
  console.log(
    `\n${exact ? "PASS" : "FAIL"}  exactly ${ceiling} admitted (got ${admitted}, stored ${liveRows})` +
      `\n${accounted ? "PASS" : "FAIL"}  every racer got a declared answer` +
      `\n\n${
        exact
          ? "The ceiling held under a genuine race. Over-admission here would mean the\n" +
            "advisory lock is not serializing the count for one owner -- a sequential\n" +
            "test passes either way, which is why this script exists."
          : "OVER-ADMISSION. The ceiling was exceeded by a concurrent burst; the trigger\n" +
            "is not serializing the count-and-insert for one owner."
      }`,
  );

  exitCode = exact && accounted ? 0 : 1;
} finally {
  // Always, including on failure: an interrupted run must not leave an account
  // behind for SH-DELETE-015 to find later.
  const removed = await admin(`/auth/v1/admin/users/${userId}`, { method: "DELETE" });
  console.log(`\ndisposable account removed: ${removed.ok ? "yes" : `NO (${removed.status})`}`);
  if (!removed.ok) console.log(`   clean up ${email} by hand`);
}

process.exit(exitCode);
