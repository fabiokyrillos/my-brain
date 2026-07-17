import { createClient } from "@supabase/supabase-js";
import { getLinkedSupabaseCredentials } from "./linked-supabase.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function dataOrThrow(result, label) {
  if (result.error) {
    throw new Error(`${label} (${result.error.code ?? "unknown"}): ${result.error.message}`);
  }
  return result.data;
}

const credentials = getLinkedSupabaseCredentials();
const admin = createClient(credentials.url, credentials.serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const suffix = crypto.randomUUID();
const password = `Jobs-${crypto.randomUUID()}-Aa1!`;
const createdUsers = [];

async function createTestUser(index) {
  const result = await admin.auth.admin.createUser({
    email: `phase-2a-jobs-${index}-${suffix}@example.test`,
    password,
    email_confirm: true,
  });
  const user = dataOrThrow(result, `create job test user ${index}`).user;
  assert(user, `Job test user ${index} was not returned`);
  createdUsers.push(user.id);

  const client = createClient(credentials.url, credentials.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  dataOrThrow(
    await client.auth.signInWithPassword({ email: user.email, password }),
    `sign in job test user ${index}`,
  );
  return { client, user };
}

try {
  const [{ client: first, user: firstUser }, { client: second, user: secondUser }] =
    await Promise.all([createTestUser(1), createTestUser(2)]);

  const completionJob = dataOrThrow(
    await first
      .from("jobs")
      .insert({
        user_id: firstUser.id,
        type: "process_attachment",
        payload: { attachment_id: crypto.randomUUID() },
        max_attempts: 2,
        idempotency_key: `phase-2a-completion:${suffix}`,
      })
      .select("id")
      .single(),
    "create leased completion job",
  );

  const competingClaims = (await Promise.all([
    admin.rpc("claim_attachment_job", {
      p_job_id: completionJob.id,
      p_user_id: firstUser.id,
      p_worker_id: "remote-worker-a",
      p_lease_seconds: 120,
    }),
    admin.rpc("claim_attachment_job", {
      p_job_id: completionJob.id,
      p_user_id: firstUser.id,
      p_worker_id: "remote-worker-b",
      p_lease_seconds: 120,
    }),
  ])).map((result, index) => dataOrThrow(result, `claim completion job ${index + 1}`));
  const claimed = competingClaims
    .map((value, index) => ({ value, workerId: `remote-worker-${index === 0 ? "a" : "b"}` }))
    .filter((item) => item.value !== null);
  assert(claimed.length === 1, "Concurrent workers did not produce exactly one lease owner");

  const activeWorker = claimed[0].workerId;
  const staleWorker = activeWorker === "remote-worker-a" ? "remote-worker-b" : "remote-worker-a";
  const staleCompletion = dataOrThrow(
    await admin.rpc("complete_job", {
      p_job_id: completionJob.id,
      p_worker_id: staleWorker,
      p_result: { stale: true },
    }),
    "attempt stale job completion",
  );
  assert(staleCompletion === null, "A stale worker completed another worker's lease");

  const completed = dataOrThrow(
    await admin.rpc("complete_job", {
      p_job_id: completionJob.id,
      p_worker_id: activeWorker,
      p_result: { ok: true },
    }),
    "complete active job lease",
  );
  assert(completed?.status === "completed", "The active worker could not complete its lease");

  const recoveryJob = dataOrThrow(
    await first
      .from("jobs")
      .insert({
        user_id: firstUser.id,
        type: "process_attachment",
        payload: { attachment_id: crypto.randomUUID() },
        max_attempts: 2,
        idempotency_key: `phase-2a-recovery:${suffix}`,
      })
      .select("id")
      .single(),
    "create expired recovery job",
  );
  dataOrThrow(
    await admin.rpc("claim_attachment_job", {
      p_job_id: recoveryJob.id,
      p_user_id: firstUser.id,
      p_worker_id: "remote-worker-expired",
      p_lease_seconds: 120,
    }),
    "claim recovery job",
  );
  dataOrThrow(
    await admin
      .from("jobs")
      .update({ lease_expires_at: new Date(Date.now() - 1_000).toISOString() })
      .eq("id", recoveryJob.id),
    "expire recovery lease",
  );
  const reaped = dataOrThrow(
    await admin.rpc("reap_expired_jobs", { p_limit: 100 }),
    "reap expired job",
  );
  assert(Number(reaped.requeued) >= 1, "Expired recoverable job was not requeued");

  const reclaimed = dataOrThrow(
    await admin.rpc("claim_attachment_job", {
      p_job_id: recoveryJob.id,
      p_user_id: firstUser.id,
      p_worker_id: "remote-worker-retry",
      p_lease_seconds: 120,
    }),
    "reclaim recovered job",
  );
  assert(reclaimed?.attempts === 2, "Recovered job did not advance its bounded attempt count");

  const longError = `Provider failed\n${"sensitive-detail ".repeat(80)}`;
  const exhausted = dataOrThrow(
    await admin.rpc("fail_job", {
      p_job_id: recoveryJob.id,
      p_worker_id: "remote-worker-retry",
      p_error: longError,
      p_base_delay_seconds: 60,
    }),
    "exhaust recovered job",
  );
  assert(exhausted?.status === "exhausted" && exhausted.failed_at, "Attempt exhaustion was not terminal");
  assert(exhausted.error.length <= 500 && !/[\r\n]/.test(exhausted.error), "Persisted job error was not bounded and sanitized");

  const ownJobs = dataOrThrow(
    await first.from("jobs").select("id,status,locked_by,lease_expires_at"),
    "read own jobs",
  );
  const foreignJobs = dataOrThrow(
    await second.from("jobs").select("id").eq("id", recoveryJob.id),
    "read isolated jobs",
  );
  assert(ownJobs.length === 2, "The owner cannot inspect both job outcomes");
  assert(foreignJobs.length === 0, "Job RLS leaked a row to another user");

  const metrics = dataOrThrow(
    await admin.rpc("get_job_queue_metrics"),
    "read queue metrics",
  );
  assert(Number(metrics.completed) >= 1 && Number(metrics.exhausted) >= 1, "Queue metrics omitted terminal states");

  const crossOwnerClaim = dataOrThrow(
    await admin.rpc("claim_attachment_job", {
      p_job_id: recoveryJob.id,
      p_user_id: secondUser.id,
      p_worker_id: "remote-worker-cross-owner",
      p_lease_seconds: 120,
    }),
    "attempt cross-owner claim",
  );
  assert(crossOwnerClaim === null, "A worker claimed a job through the wrong owner");

  console.log("Remote job reliability smoke passed: exclusive lease, stale-worker denial, recovery, exhaustion, sanitization, metrics, and RLS.");
} finally {
  for (const userId of createdUsers) {
    const cleanup = await admin.auth.admin.deleteUser(userId);
    if (cleanup.error) {
      console.error(`Remote job smoke cleanup failed (${cleanup.error.code ?? "unknown"})`);
    }
  }
}
