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
    await admin.rpc("claim_entry_interpretation_job", {
      p_job_id: initialJob.id,
      p_user_id: firstUser.id,
      p_worker_id: "remote-entry-worker-next",
      p_lease_seconds: 120,
    }),
    "claim entry job before retry is eligible",
  );
  assert(noFutureClaim === null, "A future retry became eligible too early");

  const retried = await waitFor(
    async () => dataOrThrow(
      await admin.rpc("claim_entry_interpretation_job", {
        p_job_id: initialJob.id,
        p_user_id: firstUser.id,
        p_worker_id: "remote-entry-worker-next",
        p_lease_seconds: 30,
      }),
      "claim next eligible entry job",
    ),
    "entry retry eligibility",
    5_000,
  );
  assert(retried?.id === initialJob.id && retried.status === "running", "Next-entry claim did not select the eligible entry job");

  dataOrThrow(
    await admin
      .from("jobs")
      .update({ lease_expires_at: "1970-01-01T00:00:00.000Z" })
      .eq("id", initialJob.id)
      .eq("user_id", firstUser.id)
      .eq("locked_by", "remote-entry-worker-next"),
    "expire the disposable entry lease",
  );

  const runningJobs = dataOrThrow(
    await admin.from("jobs").select("id,lease_expires_at").eq("status", "running"),
    "preflight running jobs before entry reaper",
  );
  assert(
    runningJobs.length === 1 && runningJobs[0].id === initialJob.id,
    "Entry reaper preflight found an unrelated running job; refusing to mutate the shared queue",
  );
  assert(Date.parse(runningJobs[0].lease_expires_at) <= Date.now(), "The disposable entry lease was not expired before reaping");

  const reaped = dataOrThrow(
    await admin.rpc("reap_expired_jobs", { p_limit: 1 }),
    "reap the disposable expired entry job",
  );
  assert(Number(reaped.requeued) === 1 && Number(reaped.exhausted) === 0, "The existing reaper did not recover only the disposable expired entry lease");
  const reclaimed = dataOrThrow(
    await admin.rpc("claim_entry_interpretation_job", {
      p_job_id: initialJob.id,
      p_user_id: firstUser.id,
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

  // Slice 2X.4: the deployed worker actually processes interpret_entry jobs
  // end to end, both by direct authenticated invocation and by the
  // unattended secret-authenticated dispatch drain.
  const workerCaptureKey = `remote-entry-worker-initial:${suffix}`;
  const workerCapture = dataOrThrow(
    await first.rpc("capture_entry_async", {
      p_original_content: "Remote worker fixture: buy milk tomorrow and follow up with Alice about the roadmap.",
      p_locale: "en",
      p_source: "web",
      p_idempotency_key: workerCaptureKey,
    }),
    "capture entry for direct worker invocation",
  );
  const workerInitialJob = dataOrThrow(
    await first
      .from("jobs")
      .select("id")
      .eq("idempotency_key", `entry-capture:${workerCaptureKey}`)
      .single(),
    "read initial job for direct worker invocation",
  );
  const directInvoke = await first.functions.invoke("process-jobs", {
    body: { jobId: workerInitialJob.id },
  });
  assert(!directInvoke.error, `Direct worker invocation failed: ${directInvoke.error?.message ?? "unknown"}`);
  assert(directInvoke.data?.ok === true && directInvoke.data?.mode === "initial", "Direct worker invocation did not report a completed initial run");

  const interpretedEntry = dataOrThrow(
    await first.from("entries").select("status,current_interpretation_id").eq("id", workerCapture.entry_id).single(),
    "read entry after direct worker invocation",
  );
  assert(
    !["saved", "interpreting", "reprocessing"].includes(interpretedEntry.status) && interpretedEntry.current_interpretation_id,
    "Direct worker invocation did not persist an interpretation",
  );
  const persistedInterpretation = dataOrThrow(
    await first
      .from("entry_interpretations")
      .select("origin,strategy_version,prompt_version")
      .eq("id", interpretedEntry.current_interpretation_id)
      .single(),
    "read interpretation persisted by the worker",
  );
  assert(persistedInterpretation.origin === "ai_generated", "Worker-persisted interpretation did not use the shared extraction origin");
  assert(persistedInterpretation.strategy_version === "entry-extraction-v1", "Worker used a different extraction strategy version than the synchronous pipeline");
  const workerUsage = dataOrThrow(
    await first.from("ai_usage_events").select("id").eq("operation", "capture_extraction").eq("source_id", workerCapture.entry_id),
    "read AI usage recorded by the worker",
  );
  assert(workerUsage.length >= 1, "Worker did not record AI usage for the shared ledger");

  const initialWorkerEvents = dataOrThrow(
    await first
      .from("product_events")
      .select("id,event_name,properties,idempotency_key,subject_id")
      .eq("event_name", "capture_processing_completed")
      .eq("subject_id", workerCapture.entry_id),
    "read completion event recorded by the deployed worker",
  );
  const expectedInitialOutcome = interpretedEntry.status === "completed" ? "ready" : "needs_attention";
  assert(initialWorkerEvents.length === 1, "The deployed worker did not record exactly one initial completion event");
  assert(initialWorkerEvents[0].properties?.processingMode === "initial", "The initial worker event has the wrong processing mode");
  assert(initialWorkerEvents[0].properties?.outcome === expectedInitialOutcome, "The initial worker event does not reflect the persisted entry state");

  const duplicateInitialInvoke = await first.functions.invoke("process-jobs", {
    body: { jobId: workerInitialJob.id },
  });
  assert(duplicateInitialInvoke.error, "A completed worker job was unexpectedly processed twice");
  const eventsAfterDuplicateInvoke = dataOrThrow(
    await first
      .from("product_events")
      .select("id,idempotency_key")
      .eq("event_name", "capture_processing_completed")
      .eq("subject_id", workerCapture.entry_id),
    "verify worker completion-event idempotency",
  );
  assert(
    eventsAfterDuplicateInvoke.length === 1
      && eventsAfterDuplicateInvoke[0].id === initialWorkerEvents[0].id
      && eventsAfterDuplicateInvoke[0].idempotency_key === initialWorkerEvents[0].idempotency_key,
    "Re-invoking the same completed job introduced a duplicate product event",
  );

  const workerReprocessKey = `remote-entry-worker-reprocess:${suffix}`;
  const workerReprocess = dataOrThrow(
    await first.rpc("enqueue_entry_reprocessing", {
      p_entry_id: workerCapture.entry_id,
      p_operation_key: workerReprocessKey,
    }),
    "enqueue reprocessing for direct worker invocation",
  );
  assert(workerReprocess.replayed === false, "Reprocessing enqueue for the worker fixture was unexpectedly replayed");
  const workerReprocessJob = dataOrThrow(
    await first
      .from("jobs")
      .select("id")
      .eq("idempotency_key", `entry-reprocess:${workerCapture.entry_id}:${workerReprocessKey}`)
      .single(),
    "read reprocessing job for direct worker invocation",
  );
  const reprocessInvoke = await first.functions.invoke("process-jobs", {
    body: { jobId: workerReprocessJob.id },
  });
  assert(!reprocessInvoke.error, `Direct worker reprocess invocation failed: ${reprocessInvoke.error?.message ?? "unknown"}`);
  assert(reprocessInvoke.data?.ok === true && reprocessInvoke.data?.mode === "reprocess", "Direct worker invocation did not report a completed reprocess run");
  const reprocessedEntry = dataOrThrow(
    await first.from("entries").select("current_interpretation_id").eq("id", workerCapture.entry_id).single(),
    "read entry after direct worker reprocess invocation",
  );
  assert(reprocessedEntry.current_interpretation_id !== interpretedEntry.current_interpretation_id, "Reprocessing did not append a new current interpretation");
  const reprocessedInterpretation = dataOrThrow(
    await first
      .from("entry_interpretations")
      .select("origin,element_confidence")
      .eq("id", reprocessedEntry.current_interpretation_id)
      .single(),
    "read interpretation persisted by the worker reprocess run",
  );
  assert(reprocessedInterpretation.origin === "ai_reprocessed", "Worker reprocess did not append an ai_reprocessed revision");
  assert(Object.keys(reprocessedInterpretation.element_confidence ?? {}).length > 0, "Worker reprocess did not persist computed element trust");

  const completedWorkerEvents = dataOrThrow(
    await first
      .from("product_events")
      .select("id,properties,idempotency_key")
      .eq("event_name", "capture_processing_completed")
      .eq("subject_id", workerCapture.entry_id),
    "read initial and reprocess completion events",
  );
  assert(completedWorkerEvents.length === 2, "Initial and reprocess attempts did not produce exactly two completion events");
  assert(
    completedWorkerEvents.some((event) => event.properties?.processingMode === "initial")
      && completedWorkerEvents.some((event) => event.properties?.processingMode === "reprocess"),
    "Worker completion events are not scoped to their processing mode",
  );
  assert(new Set(completedWorkerEvents.map((event) => event.idempotency_key)).size === 2, "Distinct worker jobs reused one product-event idempotency key");

  const unauthorizedDispatch = await admin.functions.invoke("process-jobs", {
    body: { mode: "dispatch" },
    headers: { "x-dispatch-secret": "wrong-secret" },
  });
  assert(unauthorizedDispatch.error, "A wrong dispatch secret was accepted");

  const drainCaptureKey = `remote-entry-worker-drain:${suffix}`;
  const drainCapture = dataOrThrow(
    await first.rpc("capture_entry_async", {
      p_original_content: "Remote worker fixture for the unattended dispatch drain.",
      p_locale: "en",
      p_source: "web",
      p_idempotency_key: drainCaptureKey,
    }),
    "capture entry for dispatch-drain invocation",
  );

  console.log("Verifying the existing scheduled dispatch drain without manually draining the shared queue.");

  const drainedEntry = await waitFor(
    async () => {
      const row = dataOrThrow(
        await first.from("entries").select("status,current_interpretation_id").eq("id", drainCapture.entry_id).single(),
        "read entry after dispatch-drain invocation",
      );
      if (["recoverable_error", "terminal_error"].includes(row.status)) {
        throw new Error(`The unattended dispatch drain failed its fixture entry with status ${row.status}`);
      }
      return ["completed", "partially_processed", "awaiting_review"].includes(row.status) ? row : null;
    },
    "dispatch-drain entry processing",
    240_000,
    1_000,
  );
  assert(drainedEntry.current_interpretation_id, "The unattended dispatch drain did not persist a current interpretation");

  const drainedJob = dataOrThrow(
    await first
      .from("jobs")
      .select("id,status,attempts")
      .eq("idempotency_key", `entry-capture:${drainCaptureKey}`)
      .single(),
    "read dispatch-drain fixture job",
  );
  assert(drainedJob.status === "completed" && drainedJob.attempts >= 1, "The unattended dispatch drain did not persist job completion");

  const drainedEvents = dataOrThrow(
    await first
      .from("product_events")
      .select("id,idempotency_key,properties")
      .eq("event_name", "capture_processing_completed")
      .eq("subject_id", drainCapture.entry_id),
    "read dispatch-drain completion event",
  );
  assert(drainedEvents.length === 1, "The unattended dispatch drain did not emit exactly one completion event");
  assert(drainedEvents[0].properties?.processingMode === "initial", "The unattended dispatch completion event used the wrong processing mode");
  const expectedDrainOutcome = drainedEntry.status === "completed" ? "ready" : "needs_attention";
  assert(drainedEvents[0].properties?.outcome === expectedDrainOutcome, "The unattended dispatch completion event did not match the persisted entry outcome");

  console.log("Remote entry-processing smoke passed: atomic capture, bounded payloads, idempotency, ownership, exclusive leases, retries, stale-worker protection, recovery, reprocessing isolation, direct worker invocation (initial and reprocess), and unattended dispatch drain.");
} finally {
  await Promise.all(createdUsers.map(async (userId) => {
    const cleanup = await admin.auth.admin.deleteUser(userId);
    if (cleanup.error) {
      console.error(`Could not remove entry-processing test user ${userId}: ${cleanup.error.code ?? "unknown"}`);
      process.exitCode = 1;
    }
  }));
}
