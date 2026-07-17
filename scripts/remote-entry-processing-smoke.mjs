import { createClient } from "@supabase/supabase-js";
import { getLinkedSupabaseCredentials } from "./linked-supabase.mjs";

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

function dataOrThrow(result, label) {
  if (result.error) {
    throw new Error(`${label} (${result.error.code ?? "unknown"}): ${result.error.message}`);
  }
  return result.data;
}

async function waitFor(check, label, timeoutMs, intervalMs = 250) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`${label} did not become true within ${timeoutMs}ms`);
}

const credentials = getLinkedSupabaseCredentials();
const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(credentials.url, credentials.serviceRoleKey, clientOptions);
const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const password = `EntryJobs-${crypto.randomUUID()}-Aa1!`;
const createdUsers = [];

async function createTestUser(index) {
  const user = dataOrThrow(
    await admin.auth.admin.createUser({
      email: `phase-2x-entry-jobs-${index}-${suffix}@example.test`,
      password,
      email_confirm: true,
    }),
    `create entry-processing test user ${index}`,
  ).user;
  assert(user, `Entry-processing test user ${index} was not returned`);
  createdUsers.push(user.id);

  const client = createClient(credentials.url, credentials.publishableKey, clientOptions);
  dataOrThrow(
    await client.auth.signInWithPassword({ email: user.email, password }),
    `sign in entry-processing test user ${index}`,
  );
  return { client, user };
}

try {
  const [{ client: first, user: firstUser }, { client: second }] = await Promise.all([
    createTestUser(1),
    createTestUser(2),
  ]);

  const captureKey = `remote-entry-capture:${suffix}`;
  const capture = dataOrThrow(
    await first.rpc("capture_entry_async", {
      p_original_content: "Remote entry-processing capture fixture",
      p_locale: "en",
      p_source: "web",
      p_idempotency_key: captureKey,
    }),
    "capture entry atomically",
  );
  assert(capture.status === "saved" && capture.replayed === false && capture.entry_id, "Capture did not return a sanitized saved receipt");

  const initialJob = dataOrThrow(
    await first
      .from("jobs")
      .select("id,type,status,payload")
      .eq("idempotency_key", `entry-capture:${captureKey}`)
      .single(),
    "read initial entry-processing job",
  );
  assert(initialJob.type === "interpret_entry" && initialJob.status === "pending", "Capture did not enqueue one pending interpretation job");
  assert(
    Object.keys(initialJob.payload).sort().join(",") === "entry_id,mode"
      && initialJob.payload.entry_id === capture.entry_id
      && initialJob.payload.mode === "initial",
    "Initial job payload exposed more than the entry identifier and mode",
  );
  assert(!JSON.stringify(initialJob.payload).includes("Remote entry-processing capture fixture"), "Initial job payload retained captured content");

  const replay = dataOrThrow(
    await first.rpc("capture_entry_async", {
      p_original_content: "Remote entry-processing capture fixture",
      p_locale: "en",
      p_source: "web",
      p_idempotency_key: captureKey,
    }),
    "replay atomic capture",
  );
  assert(replay.replayed === true && replay.entry_id === capture.entry_id, "Capture idempotency did not return the original receipt");

  const userClaim = await first.rpc("claim_entry_interpretation_job", {
    p_job_id: initialJob.id,
    p_user_id: firstUser.id,
    p_worker_id: "remote-entry-user",
    p_lease_seconds: 120,
  });
  assert(userClaim.error?.code === "42501", "An authenticated user could claim an entry job");

  const competingClaims = await Promise.all([
    admin.rpc("claim_entry_interpretation_job", {
      p_job_id: initialJob.id,
      p_user_id: firstUser.id,
      p_worker_id: "remote-entry-worker-a",
      p_lease_seconds: 120,
    }),
    admin.rpc("claim_entry_interpretation_job", {
      p_job_id: initialJob.id,
      p_user_id: firstUser.id,
      p_worker_id: "remote-entry-worker-b",
      p_lease_seconds: 120,
    }),
  ]);
  const claimed = competingClaims
    .map((result, index) => ({
      value: dataOrThrow(result, `claim initial entry job ${index + 1}`),
      workerId: `remote-entry-worker-${index === 0 ? "a" : "b"}`,
    }))
    .filter((result) => result.value !== null);
  assert(claimed.length === 1, "Concurrent entry-job claims did not produce one lease owner");

  const activeWorker = claimed[0].workerId;
  const staleWorker = activeWorker === "remote-entry-worker-a" ? "remote-entry-worker-b" : "remote-entry-worker-a";
  const staleCompletion = dataOrThrow(
    await admin.rpc("complete_job", {
      p_job_id: initialJob.id,
      p_worker_id: staleWorker,
      p_result: { stale: true },
    }),
    "attempt stale entry job completion",
  );
  assert(staleCompletion === null, "A stale worker completed an entry job lease");

  const failed = dataOrThrow(
    await admin.rpc("fail_job", {
      p_job_id: initialJob.id,
      p_worker_id: activeWorker,
      p_error: "remote entry-processing retry fixture",
      p_base_delay_seconds: 1,
    }),
    "fail active entry job",
  );
  assert(failed.status === "failed" && failed.next_attempt_at, "A failed entry job did not retain retry state");
  const noFutureClaim = dataOrThrow(
    await admin.rpc("claim_next_entry_interpretation_job", {
      p_worker_id: "remote-entry-worker-next",
      p_lease_seconds: 120,
    }),
    "claim entry job before retry is eligible",
  );
  assert(noFutureClaim === null, "A future retry became eligible too early");

  const retried = await waitFor(
    async () => dataOrThrow(
      await admin.rpc("claim_next_entry_interpretation_job", {
        p_worker_id: "remote-entry-worker-next",
        p_lease_seconds: 30,
      }),
      "claim next eligible entry job",
    ),
    "entry retry eligibility",
    5_000,
  );
  assert(retried?.id === initialJob.id && retried.status === "running", "Next-entry claim did not select the eligible entry job");

  const reaped = await waitFor(
    async () => {
      const result = dataOrThrow(
        await admin.rpc("reap_expired_jobs", { p_limit: 100 }),
        "reap expired entry job",
      );
      return Number(result.requeued) >= 1 ? result : null;
    },
    "expired entry lease recovery",
    35_000,
    1_000,
  );
  assert(Number(reaped.requeued) >= 1, "The existing reaper did not recover an expired entry lease");
  const reclaimed = dataOrThrow(
    await admin.rpc("claim_next_entry_interpretation_job", {
      p_worker_id: "remote-entry-worker-after-reap",
      p_lease_seconds: 120,
    }),
    "reclaim reaped entry job",
  );
  assert(reclaimed?.id === initialJob.id && reclaimed.status === "running", "A reaped entry job could not be reclaimed");
  dataOrThrow(
    await admin.rpc("complete_job", {
      p_job_id: initialJob.id,
      p_worker_id: "remote-entry-worker-after-reap",
      p_result: { completed_by_smoke: true },
    }),
    "complete reclaimed entry job",
  );

  const entryBeforeReprocess = dataOrThrow(
    await first.from("entries").select("id,status,current_interpretation_id").eq("id", capture.entry_id).single(),
    "read entry before reprocessing enqueue",
  );
  const operationKey = `remote-entry-reprocess:${suffix}`;
  const reprocess = dataOrThrow(
    await first.rpc("enqueue_entry_reprocessing", {
      p_entry_id: capture.entry_id,
      p_operation_key: operationKey,
    }),
    "enqueue entry reprocessing",
  );
  assert(reprocess.status === "queued" && reprocess.replayed === false, "Reprocessing did not return a sanitized queued receipt");
  const reprocessReplay = dataOrThrow(
    await first.rpc("enqueue_entry_reprocessing", {
      p_entry_id: capture.entry_id,
      p_operation_key: operationKey,
    }),
    "replay entry reprocessing",
  );
  assert(reprocessReplay.replayed === true, "Reprocessing idempotency was not explicit");

  const reprocessJob = dataOrThrow(
    await first
      .from("jobs")
      .select("id,type,status,payload")
      .eq("idempotency_key", `entry-reprocess:${capture.entry_id}:${operationKey}`)
      .single(),
    "read reprocessing job",
  );
  assert(
    reprocessJob.type === "interpret_entry"
      && reprocessJob.status === "pending"
      && reprocessJob.payload.entry_id === capture.entry_id
      && reprocessJob.payload.mode === "reprocess"
      && reprocessJob.payload.operation_key === operationKey,
    "Reprocessing job did not keep the bounded payload contract",
  );
  const entryAfterReprocess = dataOrThrow(
    await first.from("entries").select("id,status,current_interpretation_id").eq("id", capture.entry_id).single(),
    "read entry after reprocessing enqueue",
  );
  assert(
    entryAfterReprocess.status === entryBeforeReprocess.status
      && entryAfterReprocess.current_interpretation_id === entryBeforeReprocess.current_interpretation_id,
    "Reprocessing enqueue mutated the current entry interpretation state",
  );

  const duplicateActiveReprocess = await first.rpc("enqueue_entry_reprocessing", {
    p_entry_id: capture.entry_id,
    p_operation_key: `remote-entry-reprocess-other:${suffix}`,
  });
  assert(duplicateActiveReprocess.error?.code === "55P03", "A second active entry job was accepted");
  const crossUserReprocess = await second.rpc("enqueue_entry_reprocessing", {
    p_entry_id: capture.entry_id,
    p_operation_key: `remote-entry-reprocess-cross-user:${suffix}`,
  });
  assert(crossUserReprocess.error?.code === "P0002", "Cross-user reprocessing disclosed or accepted another user's entry");

  console.log("Remote entry-processing smoke passed: atomic capture, bounded payloads, idempotency, ownership, exclusive leases, retries, stale-worker protection, recovery, and reprocessing isolation.");
} finally {
  await Promise.all(createdUsers.map(async (userId) => {
    const cleanup = await admin.auth.admin.deleteUser(userId);
    if (cleanup.error) console.error(`Could not remove entry-processing test user ${userId}: ${cleanup.error.code ?? "unknown"}`);
  }));
}
