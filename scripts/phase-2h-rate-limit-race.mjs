#!/usr/bin/env node
/**
 * `2H-RATE-004` — the limiter under GENUINE concurrency: N racers, ceiling M,
 * exactly M admitted, and the stored state holding exactly M.
 *
 * ## Why this exists beside the pgTAP suite
 *
 * `supabase/tests/phase_2h_rate_limiting.sql` proves the ceiling, the rolling
 * window, the recorded refusal, the fail-closed branch and the grants. It cannot
 * prove exactly-M admission, because pgTAP runs in one session and one
 * transaction: N "concurrent" claims there would serialise, agree with each
 * other, and say nothing about the advisory lock that makes the count meaningful.
 * A serial loop dressed as a race is the failure mode this file exists to avoid.
 *
 * So the racers are real: N separate PostgREST connections, therefore N separate
 * database backends, all claiming against one owner's window at once. If the
 * lock or the count is wrong, M+1 of them are admitted and the assertion below
 * fails.
 *
 * ## Both doors, not one
 *
 * The AI lane races `claim_rate_limit_slot_for_user` — the worker's door, which
 * background provider work uses (PRD §14.2 V-5). The upload lane races
 * `claim_rate_limit_slot` through **real authenticated sessions**, which is the
 * product's door. They funnel into one `private.consume_rate_limit_slot`, and
 * racing only one of them would leave the other's caller check unexercised.
 *
 * PRD §14.2 V-6 is why both lanes run against ordinary disposable accounts: a
 * control the owner is exempt from is a control nobody has exercised, and there
 * is no exemption path here to use even if one wanted to.
 *
 * ## Reading the stored state
 *
 * `rate_limit_events` is readable by no API role — deliberately, since a role
 * that could read or delete it could mint slots. The admitted-row count is
 * therefore read over the direct owner connection CI already provides for the
 * re-grant rehearsal (`LOCAL_DB_URL`). Counting the successful RPC replies alone
 * would prove what the function *said*, not what it *stored*, and 2H-RATE-004
 * asks for the second.
 *
 * ## What it costs and what it cleans up
 *
 * Two disposable accounts, deleted at the end. The limiter rows cascade with
 * them, and the cleanup is verified over the same connection rather than
 * assumed.
 *
 * Local stack only, deliberately: it creates accounts, and a hosted run would
 * put disposable users in a production auth table to prove a property the local
 * stack proves identically.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_ANON_KEY=... \
 *   LOCAL_DB_URL=... node scripts/phase-2h-rate-limit-race.mjs
 */

import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

/**
 * The signed ceilings (PRD §14.2 V-1/V-2), and racer counts comfortably above
 * them so the ceiling — not the racer count — is what stops admissions.
 */
const LANES = [
  { bucket: "ai", ceiling: 60, racers: 80, door: "worker" },
  { bucket: "upload", ceiling: 20, racers: 30, door: "session" },
];

/** One hour, as PRD §14.2 V-3 signs it. */
const WINDOW = "3600 seconds";

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
 * exercised — the lesson recorded as `control-must-not-be-exempt`, which this
 * repository has now paid for twice.
 */
export function assertRateLimitRaceEvidence(evidence) {
  const { bucket, ceiling, racers, admitted, refused, storedAdmitted, storedRefused, refusalNames } =
    evidence;

  assert(racers > ceiling, `${bucket}: the race must have more racers (${racers}) than the ceiling (${ceiling})`);
  assert(
    admitted === ceiling,
    `${bucket}: expected exactly ${ceiling} admissions from ${racers} racers, got ${admitted}`,
  );
  assert(
    admitted + refused === racers,
    `${bucket}: ${racers} racers produced ${admitted} admissions and ${refused} refusals — ${racers - admitted - refused} verdicts went missing`,
  );
  assert(
    storedAdmitted === ceiling,
    `${bucket}: the limiter SAID ${admitted} but STORED ${storedAdmitted} admitted rows`,
  );
  assert(
    storedRefused === refused,
    `${bucket}: ${refused} refusals were reported but ${storedRefused} were recorded — 2H-RATE-003 requires every refusal to be a recorded outcome`,
  );

  const expectedName = bucket === "ai" ? "RATE_LIMIT_AI" : "RATE_LIMIT_UPLOAD";
  assert(
    refusalNames.every((name) => name === expectedName),
    `${bucket}: a refusal used a name other than ${expectedName} — ${[...new Set(refusalNames)].join(", ")}`,
  );
  assert(
    !refusalNames.includes("RATE_LIMIT_STATE_UNAVAILABLE"),
    `${bucket}: a racer was refused because the limiter broke, not because the ceiling was reached — the run proves nothing`,
  );
  assert(
    evidence.uniqueSlotIds === admitted,
    `${bucket}: ${admitted} admissions shared ${evidence.uniqueSlotIds} slot ids — two callers were handed the same reservation`,
  );
  assert(
    evidence.overCeilingRefused === true,
    `${bucket}: one further claim after the race was ADMITTED — the ceiling stops applying once it is reached`,
  );
  assert(
    evidence.belowCeilingAdmitted === true,
    `${bucket}: a fresh owner below the ceiling was refused — the limiter refuses everything, which is not a limiter`,
  );
}

function runEvidenceValidatorSelfTest() {
  const valid = {
    bucket: "ai",
    ceiling: 60,
    racers: 80,
    admitted: 60,
    refused: 20,
    storedAdmitted: 60,
    storedRefused: 20,
    refusalNames: Array.from({ length: 20 }, () => "RATE_LIMIT_AI"),
    uniqueSlotIds: 60,
    overCeilingRefused: true,
    belowCeilingAdmitted: true,
  };
  assertRateLimitRaceEvidence(valid);

  const mutations = [
    // The defect this whole script exists to detect: the lock did not hold.
    (evidence) => {
      evidence.admitted = 61;
      evidence.refused = 19;
    },
    // The store disagrees with the answer — a limiter that says no and writes yes.
    (evidence) => {
      evidence.storedAdmitted = 61;
    },
    // Refusals reported but not recorded (2H-RATE-003).
    (evidence) => {
      evidence.storedRefused = 0;
    },
    // Verdicts lost: a racer neither admitted nor refused.
    (evidence) => {
      evidence.refused = 19;
    },
    // The refusal came from a broken limiter, so the ceiling was never tested.
    (evidence) => {
      evidence.refusalNames[0] = "RATE_LIMIT_STATE_UNAVAILABLE";
    },
    // Two admissions handed the same reservation.
    (evidence) => {
      evidence.uniqueSlotIds = 59;
    },
    // The ceiling stopped applying once reached.
    (evidence) => {
      evidence.overCeilingRefused = false;
    },
    // The control: a limiter that refuses everybody would otherwise pass.
    (evidence) => {
      evidence.belowCeilingAdmitted = false;
    },
    // A race with no more racers than the ceiling proves nothing at all.
    (evidence) => {
      evidence.racers = 60;
      evidence.refused = 0;
    },
  ];

  for (const mutate of mutations) {
    const invalid = structuredClone(valid);
    mutate(invalid);
    let rejected = false;
    try {
      assertRateLimitRaceEvidence(invalid);
    } catch {
      rejected = true;
    }
    assert(rejected, "The race validator accepted evidence of an over-admission or a silent refusal");
  }

  console.log(`rate-limit race validator self-test passed (${mutations.length} mutations rejected)`);
}

/** A scalar read over the direct owner connection. */
function readScalar(databaseUrl, sql) {
  const output = execFileSync("psql", [databaseUrl, "-At", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return output.trim();
}

function storedCount(databaseUrl, userId, bucket, outcome) {
  return Number(
    readScalar(
      databaseUrl,
      `select count(*) from public.rate_limit_events where user_id = '${userId}' and bucket = '${bucket}' and outcome = '${outcome}'`,
    ),
  );
}

async function raceLane(context, lane) {
  const { url, serviceRoleKey, anonKey, databaseUrl, admin, clientOptions, suffix } = context;

  const password = `Phase2H3-${crypto.randomUUID()}-Aa1!`;
  const created = dataOrThrow(
    await admin.auth.admin.createUser({
      email: `phase-2h3-rate-race-${lane.bucket}-${suffix}@example.test`,
      password,
      email_confirm: true,
    }),
    `create the disposable ${lane.bucket} race account`,
  );
  assert(created.user, "Auth did not return the disposable race account");
  const userId = created.user.id;

  // A second account that never races, used only as the below-ceiling control
  // at the end. Without it, a limiter that had simply started refusing
  // everything would satisfy every other assertion in this lane.
  const control = dataOrThrow(
    await admin.auth.admin.createUser({
      email: `phase-2h3-rate-control-${lane.bucket}-${suffix}@example.test`,
      password,
      email_confirm: true,
    }),
    `create the disposable ${lane.bucket} control account`,
  );
  assert(control.user, "Auth did not return the disposable control account");

  /** One claim, through the door this lane exists to exercise. */
  let claimOnce;
  if (lane.door === "worker") {
    // Separate clients, so the racers do not share a connection and quietly
    // serialise inside one agent.
    const workers = Array.from({ length: lane.racers }, () => createClient(url, serviceRoleKey, clientOptions));
    claimOnce = (index, forUser = userId) =>
      workers[index % workers.length]
        .rpc("claim_rate_limit_slot_for_user", {
          p_user_id: forUser,
          p_bucket: lane.bucket,
          p_ceiling: lane.ceiling,
          p_window: WINDOW,
        })
        .then((result) => dataOrThrow(result, `worker racer ${index}`)[0]);
  } else {
    // Real sessions, so the `auth.uid()` door is the one under test. Each racer
    // gets its own client holding the same owner's token — N connections, one
    // window, which is exactly the shape a person with several tabs produces.
    //
    // Signed in ONCE and the token fanned out, rather than N sign-ins: GoTrue
    // applies its own per-IP ceilings to the token endpoint, and a race that
    // tripped those would fail for a reason that has nothing to do with the
    // limiter under test. What the lane needs is N connections, not N logins.
    const tokenFor = async (account, label) => {
      const client = createClient(url, anonKey, clientOptions);
      const session = dataOrThrow(
        await client.auth.signInWithPassword({ email: account.email, password }),
        `sign in ${label}`,
      );
      assert(session.session?.access_token, `${label} produced no access token`);
      return session.session.access_token;
    };

    const authorized = (token) => createClient(url, anonKey, {
      ...clientOptions,
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const racerToken = await tokenFor(created.user, "the racing owner");
    const sessions = Array.from({ length: lane.racers }, () => authorized(racerToken));
    const controlClient = authorized(await tokenFor(control.user, "the below-ceiling control"));

    claimOnce = (index, forUser = userId) =>
      (forUser === userId ? sessions[index % sessions.length] : controlClient)
        .rpc("claim_rate_limit_slot", {
          p_bucket: lane.bucket,
          p_ceiling: lane.ceiling,
          p_window: WINDOW,
        })
        .then((result) => dataOrThrow(result, `session racer ${index}`)[0]);
  }

  const verdicts = await Promise.all(
    Array.from({ length: lane.racers }, (_unused, index) => claimOnce(index)),
  );

  const admittedVerdicts = verdicts.filter((verdict) => verdict?.admitted === true);
  const refusedVerdicts = verdicts.filter((verdict) => verdict?.admitted === false);

  // One further claim, after the dust settles. A ceiling that stops applying
  // once reached is not a ceiling.
  const overCeiling = await claimOnce(0);

  // The control: a different owner, below the ceiling, must still be admitted.
  const belowCeiling = await claimOnce(0, control.user.id);

  const evidence = {
    bucket: lane.bucket,
    ceiling: lane.ceiling,
    racers: lane.racers,
    admitted: admittedVerdicts.length,
    refused: refusedVerdicts.length,
    storedAdmitted: storedCount(databaseUrl, userId, lane.bucket, "admitted"),
    // The over-ceiling claim adds one more recorded refusal, so the stored
    // total is compared against the race's refusals plus that one.
    storedRefused: storedCount(databaseUrl, userId, lane.bucket, "refused") - 1,
    refusalNames: refusedVerdicts.map((verdict) => verdict.refusal),
    uniqueSlotIds: new Set(admittedVerdicts.map((verdict) => verdict.slot_id)).size,
    overCeilingRefused: overCeiling?.admitted === false,
    belowCeilingAdmitted: belowCeiling?.admitted === true,
  };

  assertRateLimitRaceEvidence(evidence);

  console.log(
    `${lane.bucket}: ${lane.racers} concurrent racers through the ${lane.door} door against a ceiling of `
      + `${lane.ceiling} — exactly ${evidence.admitted} admitted, ${evidence.refused} refused by name, `
      + `and the limiter stored exactly ${evidence.storedAdmitted} admitted rows.`,
  );

  return [userId, control.user.id];
}

async function runRateLimitRace() {
  const url = requiredEnvironmentValue("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requiredEnvironmentValue("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = requiredEnvironmentValue("SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  // Required rather than optional. An optional store read is a store read that
  // is silently skipped on the day it would have caught something.
  const databaseUrl = requiredEnvironmentValue("LOCAL_DB_URL", "DATABASE_URL");

  const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } };
  const admin = createClient(url, serviceRoleKey, clientOptions);
  const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const context = { url, serviceRoleKey, anonKey, databaseUrl, admin, clientOptions, suffix };
  const disposable = [];

  try {
    for (const lane of LANES) {
      disposable.push(...(await raceLane(context, lane)));
    }
  } finally {
    let residue = 0;
    for (const userId of disposable) {
      const removed = await admin.auth.admin.deleteUser(userId);
      if (removed.error) residue += 1;
    }
    assert(residue === 0, `${residue} disposable race account(s) could not be removed`);

    if (disposable.length > 0) {
      // Verified rather than assumed: the limiter rows cascade with the account,
      // so nothing this run wrote may survive it.
      const survivors = Number(
        readScalar(
          databaseUrl,
          `select count(*) from public.rate_limit_events where user_id in (${
            disposable.map((id) => `'${id}'`).join(", ")
          })`,
        ),
      );
      assert(survivors === 0, `${survivors} limiter row(s) survived the disposable accounts`);
      console.log(`cleanup verified: 0 limiter rows remain for ${disposable.length} disposable accounts`);
    }
  }
}

runEvidenceValidatorSelfTest();
await runRateLimitRace();
