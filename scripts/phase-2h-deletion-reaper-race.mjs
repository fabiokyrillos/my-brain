#!/usr/bin/env node
/**
 * 2H-RECOVER-001/002/003 under GENUINE concurrency: N reapers, M stuck
 * accounts, every account claimed exactly once.
 *
 * ## Why this exists beside the pgTAP suite
 *
 * `supabase/tests/phase_2h_deletion_recovery.sql` proves the bound, the
 * backoff, the terminal classification and the grants. It cannot prove
 * exactly-once claiming, because pgTAP runs in one session and one
 * transaction: two "concurrent" claims there would serialise, agree with each
 * other, and prove nothing about `FOR UPDATE ... SKIP LOCKED`. A serial loop
 * dressed as a race is the failure mode this file exists to avoid.
 *
 * So the racers here are real: N separate PostgREST connections, therefore N
 * separate database backends, all calling `claim_stalled_account_deletions`
 * with a limit large enough that any one of them could take the entire
 * population. If the lease or the row lock is wrong, two reapers invoke the
 * deletion executor for the same account and the union below contains a
 * duplicate.
 *
 * ## What it costs and what it cleans up
 *
 * It creates M disposable accounts, drives them to `deleting` through the
 * sanctioned operator RPC, races, and then deletes them. Cleanup is verified
 * rather than assumed, and a failure to clean up fails the script.
 *
 * Runs against the LOCAL stack in CI's database job. It is deliberately not
 * pointed at the hosted project: it creates accounts, and a hosted run would
 * put disposable users in a production auth table to prove a property the
 * local stack proves identically.
 *
 * Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/phase-2h-deletion-reaper-race.mjs
 */

import { createClient } from "@supabase/supabase-js";

const ACCOUNTS = 8;
const REAPERS = 6;
/** Each racer may take everything: the limit must not be what serialises them. */
const CLAIM_LIMIT = ACCOUNTS + 2;
const MAX_ATTEMPTS = 5;
/**
 * One millisecond, so every seeded row is due the instant it is created.
 *
 * The signed threshold is fifteen minutes (PHASE_2H_PRD.md sec. 14.1) and this
 * script is not overriding it: the ceilings are REQUIRED arguments precisely so
 * a test can choose its own without a production default moving. What is under
 * test here is the claim's exactly-once property, not the threshold's value,
 * which the pgTAP suite asserts exactly.
 */
const RETRY_INTERVAL = "00:00:00.001";
const BACKOFF_CAP = "00:01:00";
const LEASE = "00:05:00";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function dataOrThrow(result, label) {
  if (result.error) {
    throw new Error(`${label} (${result.error.code ?? "unknown"}): ${result.error.message}`);
  }
  return result.data;
}

function requiredEnvironmentValue(...names) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  throw new Error(`Missing required environment value: ${names.join(" or ")}`);
}

/**
 * The verdict, separated from the run so it can be mutation-tested below.
 *
 * A validator that only ever sees passing evidence is a validator nobody has
 * exercised -- the lesson recorded as `control-must-not-be-exempt`.
 */
export function assertReaperRaceEvidence(evidence) {
  const claimed = evidence.claims.map((claim) => claim.user_id);
  const unique = new Set(claimed);

  assert(
    claimed.length === unique.size,
    `Two reapers claimed the same account: ${claimed.length} claims for ${unique.size} accounts`,
  );
  assert(
    unique.size === evidence.seeded.length,
    `Expected every one of ${evidence.seeded.length} stuck accounts to be claimed, got ${unique.size}`,
  );
  assert(
    evidence.seeded.every((id) => unique.has(id)),
    "A seeded account was never claimed by any reaper",
  );
  assert(
    evidence.claims.every((claim) => claim.attempt_count === 1),
    "An account was handed out at an attempt count other than its first",
  );
  assert(
    new Set(evidence.claims.map((claim) => claim.claim_token)).size === evidence.claims.length,
    "Two claims shared a lease token",
  );
  assert(
    evidence.secondPassClaims === 0,
    `A second pass claimed ${evidence.secondPassClaims} rows that are all under a live lease`,
  );
}

function runEvidenceValidatorSelfTest() {
  const seeded = ["a", "b", "c"];
  const valid = {
    seeded,
    claims: [
      { user_id: "a", claim_token: "t1", attempt_count: 1 },
      { user_id: "b", claim_token: "t2", attempt_count: 1 },
      { user_id: "c", claim_token: "t3", attempt_count: 1 },
    ],
    secondPassClaims: 0,
  };
  assertReaperRaceEvidence(valid);

  const mutations = [
    // The defect this whole script exists to detect.
    (evidence) => evidence.claims.push({ user_id: "a", claim_token: "t4", attempt_count: 1 }),
    // A row nobody picked up -- a reaper that quietly drops work.
    (evidence) => evidence.claims.pop(),
    // A lease reissued rather than a new one minted.
    (evidence) => {
      evidence.claims[1].claim_token = "t1";
    },
    // An account handed out mid-backoff at a spent attempt count.
    (evidence) => {
      evidence.claims[0].attempt_count = 2;
    },
    // The lease failing to hide its row from the next pass.
    (evidence) => {
      evidence.secondPassClaims = 1;
    },
  ];

  for (const mutate of mutations) {
    const invalid = structuredClone(valid);
    mutate(invalid);
    let rejected = false;
    try {
      assertReaperRaceEvidence(invalid);
    } catch {
      rejected = true;
    }
    assert(rejected, "The race validator accepted evidence of a double claim or a dropped row");
  }

  console.log("reaper race validator self-test passed (5 mutations rejected)");
}

async function runReaperRace() {
  const url = requiredEnvironmentValue("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requiredEnvironmentValue("SUPABASE_SERVICE_ROLE_KEY");
  const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } };
  const admin = createClient(url, serviceRoleKey, clientOptions);
  const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const seeded = [];

  try {
    for (let index = 0; index < ACCOUNTS; index += 1) {
      const created = dataOrThrow(
        await admin.auth.admin.createUser({
          email: `phase-2h1-reaper-race-${suffix}-${index}@example.test`,
          password: `Phase2H1-${crypto.randomUUID()}-Aa1!`,
          email_confirm: true,
        }),
        `create disposable race account ${index}`,
      );
      assert(created.user, "Auth did not return the disposable race account");
      seeded.push(created.user.id);

      // The sanctioned operator path into `deleting` (SH-ADMIN-003). Using it
      // rather than a direct table write is the point: the recovery row is
      // seeded by the lifecycle trigger, so this also proves the trigger fires
      // for the operator's route and not only for the user's.
      dataOrThrow(
        await admin.rpc("begin_account_deletion_admin", {
          p_user_id: created.user.id,
          p_reason_code: "operator_deletion_start",
        }),
        `drive account ${index} to deleting`,
      );
    }

    // Separate clients, so the racers do not share a connection and quietly
    // serialise inside one agent.
    const reapers = Array.from(
      { length: REAPERS },
      () => createClient(url, serviceRoleKey, clientOptions),
    );

    const rounds = await Promise.all(
      reapers.map((reaper, index) =>
        reaper
          .rpc("claim_stalled_account_deletions", {
            p_limit: CLAIM_LIMIT,
            p_max_attempts: MAX_ATTEMPTS,
            p_retry_interval: RETRY_INTERVAL,
            p_backoff_cap: BACKOFF_CAP,
            p_lease: LEASE,
          })
          .then((result) => dataOrThrow(result, `reaper ${index} claim`))
      ),
    );

    const claims = rounds.flat().filter((row) => seeded.includes(row.user_id));

    // The control: every seeded row now sits under a live lease, so a further
    // pass must find nothing. Without it, a claim function that returned rows
    // without locking them would still pass every assertion above.
    const secondPass = dataOrThrow(
      await admin.rpc("claim_stalled_account_deletions", {
        p_limit: CLAIM_LIMIT,
        p_max_attempts: MAX_ATTEMPTS,
        p_retry_interval: RETRY_INTERVAL,
        p_backoff_cap: BACKOFF_CAP,
        p_lease: LEASE,
      }),
      "second-pass claim",
    );

    const evidence = {
      seeded,
      claims,
      secondPassClaims: secondPass.filter((row) => seeded.includes(row.user_id)).length,
    };
    assertReaperRaceEvidence(evidence);

    console.log(
      `${REAPERS} concurrent reapers claimed ${claims.length} of ${ACCOUNTS} stuck accounts, `
        + "each exactly once, with distinct lease tokens; the second pass claimed 0.",
    );
  } finally {
    let residue = 0;
    for (const userId of seeded) {
      const removed = await admin.auth.admin.deleteUser(userId);
      if (removed.error) residue += 1;
    }
    assert(residue === 0, `${residue} disposable race account(s) could not be removed`);

    // Verified rather than assumed: the recovery rows cascade with the account,
    // so the operator read must not mention any of them.
    const remaining = dataOrThrow(
      await admin.rpc("operator_stalled_deletions", { p_limit: 500 }),
      "read back the operator projection after cleanup",
    );
    const leftover = remaining.filter((row) => seeded.includes(row.user_id));
    assert(leftover.length === 0, `${leftover.length} disposable account(s) survived cleanup`);
    console.log(`cleanup verified: 0 of ${ACCOUNTS} disposable accounts remain`);
  }
}

runEvidenceValidatorSelfTest();
await runReaperRace();
