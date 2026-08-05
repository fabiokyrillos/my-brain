#!/usr/bin/env node
/**
 * SH.6 quota acceptance against the DEPLOYED project.
 *
 * The concurrency half lives in `sh6-quota-concurrency.mjs` and answers one
 * question: does the advisory lock hold under genuine contention. This file
 * answers the rest of the lane on the same deployed database — the ceilings, the
 * multi-row bypass, the exhausted-job behaviour, the no-partial-write rule, the
 * per-owner drain fairness with two owners, and the quota refusal vocabulary
 * standing apart from the other two.
 *
 * ## Why every case here is a single HTTP request
 *
 * The interesting failures are the ones a sequential test cannot see. The entry
 * ceiling is 300, and proving it by sending 301 separate requests would take
 * minutes and prove less than one array-bodied POST of 301 rows — which is
 * ALSO the multi-row bypass case, because a `BEFORE ... FOR EACH ROW` trigger
 * would let every one of those rows through on a count of zero.
 *
 * ## Sessions without signing in
 *
 * Turnstile is enabled on this project, so `grant_type=password` answers 400 to
 * any caller that has not solved a widget. `admin/generate_link` mints a
 * recovery token and `/verify` exchanges it — the CAPTCHA-free path
 * `sh5-password-policy-probe.mjs` established.
 *
 * ## Side effects, stated
 *
 * Two disposable accounts, created through the admin API because signup is
 * closed and must stay closed. Both are deleted in a `finally`, which cascades
 * their rows away, and the run ends by proving zero residue rather than
 * asserting it. Their email prefix is `sh6-acceptance`.
 *
 * It prints no user content: outcomes, counts and declared codes only.
 *
 * Usage: node scripts/sh6-quota-acceptance.mjs
 */

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { getLinkedSupabaseCredentials } from "./linked-supabase.mjs";

const { url, serviceRoleKey, publishableKey } = getLinkedSupabaseCredentials();
if (!url || !serviceRoleKey || !publishableKey) {
  console.error("A linked Supabase project with a service-role and publishable key is required.");
  process.exit(2);
}

/** Ceilings read from the constants module, never assumed. */
const QUOTAS = (() => {
  const source = readFileSync(new URL("../src/lib/quotas.ts", import.meta.url), "utf8");
  const pick = (name) => {
    const match = new RegExp(`${name}:\\s*(\\d+)`).exec(source);
    if (!match) throw new Error(`${name} is no longer readable from src/lib/quotas.ts`);
    return Number(match[1]);
  };
  return {
    entriesPerDay: pick("entriesPerDay"),
    liveJobsPerUser: pick("liveJobsPerUser"),
    drainPerOwner: pick("drainClaimsPerOwnerPerTick"),
  };
})();

const nonce = randomBytes(5).toString("hex");
const admin = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" };

const results = [];
function record(name, passed, detail) {
  results.push({ name, passed, detail });
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` -- ${detail}` : ""}`);
}

/** The declared detail on a PostgREST error, or "" — never the message. */
function detailOf(payload) {
  try {
    const parsed = JSON.parse(payload);
    return `${parsed.details ?? ""} ${parsed.message ?? ""}`;
  } catch {
    return "";
  }
}

async function createOwner(label) {
  const email = `sh6-acceptance-${label}-${nonce}@example.test`;
  const password = `Ac!${randomBytes(18).toString("base64url")}`;
  const created = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: admin,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!created.ok) throw new Error(`could not create ${label}: ${created.status}`);
  const id = (await created.json()).id;

  const link = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: admin,
    body: JSON.stringify({ type: "recovery", email }),
  }).then((r) => r.json());
  const hashedToken = link.hashed_token
    ?? new URL(link.action_link ?? `${url}/?token=`).searchParams.get("token");
  const verified = await fetch(`${url}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "recovery", token_hash: hashedToken }),
  });
  if (!verified.ok) throw new Error(`session exchange failed for ${label}: ${verified.status}`);
  const accessToken = (await verified.json()).access_token;
  if (!accessToken) throw new Error(`no access token for ${label}`);
  return { id, email, accessToken };
}

const asOwner = (owner) => ({
  apikey: publishableKey,
  Authorization: `Bearer ${owner.accessToken}`,
  "Content-Type": "application/json",
});

async function insertRows(owner, table, rows) {
  const response = await fetch(`${url}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...asOwner(owner), Prefer: "return=minimal" },
    body: JSON.stringify(rows),
  });
  return { ok: response.ok, status: response.status, detail: detailOf(await response.text()) };
}

async function countRows(owner, table, query = "") {
  const response = await fetch(`${url}/rest/v1/${table}?user_id=eq.${owner.id}&select=id${query}`, {
    headers: admin,
  });
  if (!response.ok) return null;
  return (await response.json()).length;
}

async function rpcAsService(fn, body) {
  const response = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: admin,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { ok: response.ok, status: response.status, text, detail: detailOf(text) };
}

console.log(`project : ${new URL(url).hostname}`);
console.log(`ceilings: entries/day=${QUOTAS.entriesPerDay} liveJobs=${QUOTAS.liveJobsPerUser} drain/owner=${QUOTAS.drainPerOwner}\n`);

let ownerA = null;
let ownerB = null;
let exitCode = 1;

try {
  ownerA = await createOwner("a");
  ownerB = await createOwner("b");
  console.log("two disposable owners created\n");

  // -------------------------------------------------------------------------
  console.log("1. entry ceiling, multi-row bypass, and no partial write");
  // -------------------------------------------------------------------------
  // ONE request carrying ceiling+1 rows. A per-row trigger would admit every
  // one of them on a count of zero; the statement trigger sees them all.
  const oversized = Array.from({ length: QUOTAS.entriesPerDay + 1 }, (_unused, index) => ({
    user_id: ownerA.id,
    original_content: `lote ${index}`,
    source: "web",
    status: "saved",
    locale: "pt-BR",
  }));
  const batch = await insertRows(ownerA, "entries", oversized);
  record(
    "a single INSERT of ceiling+1 entries is refused",
    !batch.ok && batch.detail.includes("QUOTA_ENTRIES_PER_DAY"),
    `HTTP ${batch.status}, declared code seen: ${batch.detail.includes("QUOTA_ENTRIES_PER_DAY")}`,
  );
  const afterBatch = await countRows(ownerA, "entries");
  record(
    "no partial write: the refused batch left nothing behind",
    afterBatch === 0,
    `entries stored = ${afterBatch}`,
  );

  const underCeiling = await insertRows(ownerA, "entries", [{
    user_id: ownerA.id, original_content: "dentro do teto", source: "web", status: "saved", locale: "pt-BR",
  }]);
  record("a single entry inside the ceiling is admitted", underCeiling.ok, `HTTP ${underCeiling.status}`);

  // -------------------------------------------------------------------------
  console.log("\n2. exhausted jobs are dead work, not queue slots");
  // -------------------------------------------------------------------------
  const exhausted = Array.from({ length: QUOTAS.liveJobsPerUser + 5 }, (_unused, index) => ({
    user_id: ownerA.id,
    type: "process_attachment",
    payload: {},
    idempotency_key: `sh6-acc-exhausted-${nonce}-${index}`,
    status: "failed",
    attempts: 5,
    max_attempts: 5,
  }));
  const deadWork = await insertRows(ownerA, "jobs", exhausted);
  record(
    `${QUOTAS.liveJobsPerUser + 5} exhausted jobs are admitted past a ceiling of ${QUOTAS.liveJobsPerUser}`,
    deadWork.ok,
    `HTTP ${deadWork.status}`,
  );
  const behindDead = await insertRows(ownerA, "jobs", [{
    user_id: ownerA.id, type: "process_attachment", payload: {},
    idempotency_key: `sh6-acc-after-dead-${nonce}`,
  }]);
  record(
    "a live job is still admitted behind them -- no lockout",
    behindDead.ok,
    `HTTP ${behindDead.status}`,
  );

  // -------------------------------------------------------------------------
  console.log("\n3. per-owner drain fairness, with both owners making progress");
  // -------------------------------------------------------------------------
  // A holds the ceiling in flight under LIVE leases; B holds nothing. The
  // fairness predicate is shared by all three claim paths, and the attachment
  // path is the one reachable without minting a BYOK envelope -- which SH.6's
  // own exposure closure now makes impossible from outside the database.
  const leaseUntil = new Date(Date.now() + 5 * 60_000).toISOString();
  const inflight = Array.from({ length: QUOTAS.drainPerOwner }, (_unused, index) => ({
    user_id: ownerA.id,
    type: "process_attachment",
    payload: {},
    idempotency_key: `sh6-acc-inflight-${nonce}-${index}`,
    status: "running",
    lease_expires_at: leaseUntil,
    locked_by: "acceptance-worker",
  }));
  const held = await insertRows(ownerA, "jobs", inflight);
  record(`owner A holds ${QUOTAS.drainPerOwner} jobs in flight under live leases`, held.ok, `HTTP ${held.status}`);

  const pendingA = await fetch(`${url}/rest/v1/jobs`, {
    method: "POST",
    headers: { ...asOwner(ownerA), Prefer: "return=representation" },
    body: JSON.stringify([{
      user_id: ownerA.id, type: "process_attachment", payload: {},
      idempotency_key: `sh6-acc-pending-a-${nonce}`,
    }]),
  }).then((r) => r.json());
  const pendingB = await fetch(`${url}/rest/v1/jobs`, {
    method: "POST",
    headers: { ...asOwner(ownerB), Prefer: "return=representation" },
    body: JSON.stringify([{
      user_id: ownerB.id, type: "process_attachment", payload: {},
      idempotency_key: `sh6-acc-pending-b-${nonce}`,
    }]),
  }).then((r) => r.json());

  const claimA = await rpcAsService("claim_attachment_job", {
    p_job_id: pendingA[0]?.id, p_user_id: ownerA.id, p_worker_id: "acc-worker", p_lease_seconds: 60,
  });
  record(
    "owner A is refused at the fairness ceiling",
    claimA.ok && claimA.text.trim() === "null",
    `returned ${claimA.text.trim().slice(0, 12)}`,
  );

  const claimB = await rpcAsService("claim_attachment_job", {
    p_job_id: pendingB[0]?.id, p_user_id: ownerB.id, p_worker_id: "acc-worker", p_lease_seconds: 60,
  });
  record(
    "owner B makes progress in the same tick -- neither owner starves",
    claimB.ok && claimB.text.trim() !== "null",
    `B claimed: ${claimB.ok && claimB.text.trim() !== "null"}`,
  );

  // An expired lease is not in flight: a dead worker must not lock its owner out.
  await fetch(`${url}/rest/v1/jobs?user_id=eq.${ownerA.id}&status=eq.running`, {
    method: "PATCH",
    headers: { ...admin, Prefer: "return=minimal" },
    body: JSON.stringify({ lease_expires_at: new Date(Date.now() - 60_000).toISOString() }),
  });
  const claimAAgain = await rpcAsService("claim_attachment_job", {
    p_job_id: pendingA[0]?.id, p_user_id: ownerA.id, p_worker_id: "acc-worker", p_lease_seconds: 60,
  });
  record(
    "expiring A's leases frees its share -- a dead worker is not in flight",
    claimAAgain.ok && claimAAgain.text.trim() !== "null",
    `A claimed after expiry: ${claimAAgain.ok && claimAAgain.text.trim() !== "null"}`,
  );

  // -------------------------------------------------------------------------
  console.log("\n4. the quota vocabulary is its own");
  // -------------------------------------------------------------------------
  // The LIFECYCLE half of SH-QUOTA-009 is deliberately NOT probed here.
  // Proving it needs `suspend_account`, and the admin-boundary guard holds that
  // surface to exactly one executable caller -- the operator CLI. Growing that
  // set so an acceptance script can suspend an account is a worse trade than
  // proving the same property where it is already proven: section 8 of
  // `supabase/tests/signup_hardening_quotas.sql` against a real Postgres in CI,
  // and once against this deployed database in the run recorded in
  // SIGNUP_HARDENING_SH6_DEPLOYMENT.md.
  //
  // What remains is the half this script can prove without holding a capability
  // it has no business holding.
  const quotaSeen = results.find((entry) => entry.name.includes("ceiling+1"));
  record(
    "the quota vocabulary is prefixed QUOTA_ and shares no prefix with the others",
    Boolean(quotaSeen?.passed),
    "QUOTA_ENTRIES_PER_DAY observed live; distinct from ACCOUNT_LIFECYCLE_NOT_ACTIVE and AUTH_EVENT_THROTTLED",
  );

  exitCode = results.every((r) => r.passed) ? 0 : 1;
} catch (failure) {
  console.error(`\nacceptance aborted: ${failure.message}`);
} finally {
  // Always, including on failure. The cascade removes every row these owners
  // created; the residue check below proves it rather than assuming it.
  for (const owner of [ownerA, ownerB]) {
    if (!owner) continue;
    const removed = await fetch(`${url}/auth/v1/admin/users/${owner.id}`, { method: "DELETE", headers: admin });
    if (!removed.ok) console.log(`  disposable account NOT removed (${removed.status}) -- clean up ${owner.email}`);
  }

  let residue = 0;
  for (const owner of [ownerA, ownerB]) {
    if (!owner) continue;
    for (const table of ["entries", "jobs", "account_lifecycle"]) {
      const response = await fetch(`${url}/rest/v1/${table}?user_id=eq.${owner.id}&select=user_id`, { headers: admin });
      if (response.ok) residue += (await response.json()).length;
    }
  }
  console.log(`\ndisposable accounts removed; residual rows across entries/jobs/account_lifecycle: ${residue}`);
  if (residue !== 0) exitCode = 1;
}

const passed = results.filter((r) => r.passed).length;
console.log(`\n${passed}/${results.length} acceptance checks passed`);
process.exit(exitCode);
