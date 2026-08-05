#!/usr/bin/env node
/**
 * SH-THROTTLE-002 — the ceiling under GENUINE concurrency.
 *
 * ## Why this exists outside pgTAP
 *
 * A pgTAP file is one session. It can prove that the Nth call succeeds and the
 * N+1th is refused **in sequence**, which is a necessary condition and not the
 * interesting one. The property that matters is the race: two requests arriving
 * at the boundary together must admit exactly one, and a sequential test passes
 * identically whether the advisory locks are there or not.
 *
 * The naive implementation this guards against is "count, then decide, then
 * insert". Under READ COMMITTED both racers read `ceiling - 1`, both conclude
 * they may proceed, and the ceiling is exceeded by however many arrived
 * together. `claim_auth_event_slot` takes two `pg_advisory_xact_lock`s in a
 * fixed order and inserts inside the same transaction that counted; this script
 * is the only thing in the repository that can tell the two designs apart.
 *
 * ## It runs against the deployed project, as `anon`
 *
 * Deliberately the same role and the same endpoint the Server Actions use, so
 * what is proven is the deployed path rather than a privileged imitation.
 *
 * ## Side effects, stated
 *
 * It writes real rows into `public.auth_event_attempts` under hashes derived
 * from a random nonce, so it touches no real identifier and no real address and
 * cannot consume a real person's allowance. The rows expire under the ordinary
 * 30-day sweep; nothing here deletes anything, and no client role could.
 *
 * Usage:
 *   node scripts/sh5-throttle-concurrency.mjs            # against the linked project
 *   CEILING=4 RACERS=12 node scripts/sh5-throttle-concurrency.mjs
 */

import { readFileSync } from "node:fs";
import { randomBytes, createHmac } from "node:crypto";

const REPO = new URL("..", import.meta.url);

function readEnvFile() {
  try {
    return Object.fromEntries(
      readFileSync(new URL(".env.local", REPO), "utf8")
        .split(/\r?\n/)
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const index = line.indexOf("=");
          return [
            line.slice(0, index).trim(),
            line.slice(index + 1).trim().replace(/^["']|["']$/g, ""),
          ];
        }),
    );
  } catch {
    return {};
  }
}

const env = { ...readEnvFile(), ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !anon) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and an anon/publishable key are required.");
  process.exit(2);
}

const CEILING = Number(env.CEILING ?? 3);
const RACERS = Number(env.RACERS ?? 10);
const KIND = "signup";

/**
 * A hash shaped like the real one but derived from a nonce.
 *
 * The pepper is irrelevant here — nothing verifies it — and using a random one
 * guarantees the bucket is fresh, so a previous run can never make this one look
 * throttled for the wrong reason.
 */
const nonce = randomBytes(16).toString("hex");
const digest = (label) =>
  createHmac("sha256", randomBytes(32)).update(`${label}:${nonce}`).digest("hex");

const identifierHash = digest("identifier");
const ipHash = digest("ip");

async function claim() {
  const started = Date.now();
  const response = await fetch(`${url}/rest/v1/rpc/claim_auth_event_slot`, {
    method: "POST",
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      p_kind: KIND,
      p_identifier_hash: identifierHash,
      // Null so the IP ceiling can never be the thing that refuses; this test is
      // about the identifier boundary and must not pass for the other reason.
      p_ip_hash: null,
      p_identifier_ceiling: CEILING,
      p_ip_ceiling: CEILING,
      p_window: "1 day",
    }),
  });
  const body = await response.text();
  return {
    status: response.status,
    ms: Date.now() - started,
    throttled: body.includes("AUTH_EVENT_THROTTLED"),
    admitted: response.ok,
    body,
  };
}

console.log(`project : ${new URL(url).hostname}`);
console.log(`ceiling : ${CEILING}`);
console.log(`racers  : ${RACERS} simultaneous claims on one fresh bucket\n`);

// The whole point: fired together, not awaited in turn.
const results = await Promise.all(Array.from({ length: RACERS }, () => claim()));

const admitted = results.filter((r) => r.admitted).length;
const throttled = results.filter((r) => r.throttled).length;
const other = results.filter((r) => !r.admitted && !r.throttled);

console.log(`admitted  : ${admitted}`);
console.log(`throttled : ${throttled}`);
if (other.length) {
  console.log(`unexpected: ${other.length}`);
  for (const entry of other.slice(0, 3)) console.log(`   ${entry.status} ${entry.body.slice(0, 160)}`);
}

const spread = results.map((r) => r.ms).sort((a, b) => a - b);
console.log(`latency   : ${spread[0]}ms .. ${spread[spread.length - 1]}ms`);

const exact = admitted === CEILING;
const accounted = admitted + throttled === RACERS;

console.log(
  `\n${exact ? "PASS" : "FAIL"}  exactly ${CEILING} admitted (got ${admitted})` +
    `\n${accounted ? "PASS" : "FAIL"}  every racer got a declared answer` +
    `\n\n${
      exact
        ? "The ceiling held under a genuine race. Over-admission here would mean the\n" +
          "advisory locks are not doing what the migration claims -- a sequential test\n" +
          "passes either way, which is why this script exists."
        : "OVER-ADMISSION. The ceiling was exceeded by a concurrent burst; the claim is\n" +
          "not serializing the count-and-insert for one bucket."
    }`,
);

process.exit(exact && accounted ? 0 : 1);
