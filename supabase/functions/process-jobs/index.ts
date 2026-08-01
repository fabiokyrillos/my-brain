import { createClient } from "npm:@supabase/supabase-js@2";
import {
  requireFingerprintPepper,
  requireMasterKey,
} from "../_shared/byok-envelope.ts";
import { isSupportedJobType, processClaimedJob, runEntryDispatchDrain } from "./dispatch.ts";

const JOB_LEASE_SECONDS = 300;

/**
 * `BYOK-ADAPTER-005` — the worker holds no process-wide provider key.
 *
 * What used to be here was `Deno.env.get("OPENAI_API_KEY")` and a 503 when it
 * was absent, and that one read was the reason every job in the queue ran on the
 * project's credential regardless of who owned it. It is gone, and with it the
 * only Deno path to a shared key: each handler now resolves the **job owner's**
 * credential through `resolveJobCredential`, at execution time.
 *
 * ## What replaced the missing-key branch
 *
 * The startup check below, which is a different question with a different
 * answer. The worker no longer needs a provider key to run — it needs the
 * **master key**, without which no user's credential can be decrypted and every
 * job would fail identically. `BYOK-MASTER-005` says the runtime refuses to
 * start rather than degrade, so this is evaluated once at module scope and
 * every request is refused with a declared code until it is fixed.
 *
 * The pepper is checked alongside it for the reason `byok-envelope.ts` records:
 * it is subject to the same requirement independently, and a worker that booted
 * without it would only discover the gap on the first save-path deployment that
 * needed it.
 */
const workerConfigurationError: string | null = (() => {
  try {
    requireMasterKey();
    requireFingerprintPepper();
    return null;
  } catch {
    // The message names the variable, which is safe, but nothing here echoes a
    // value — the code below is the whole diagnostic.
    return "worker_not_configured";
  }
})();

Deno.serve(async (request) => {
  if (request.method !== "POST")
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  if (workerConfigurationError) {
    console.error("Worker refused to serve", { code: workerConfigurationError });
    return Response.json(
      { error: "Server is not configured", code: workerConfigurationError },
      { status: 503 },
    );
  }
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const service = createClient(url, serviceRole, { auth: { persistSession: false } });
  const body = await request.json().catch(() => ({}));

  // Unattended scheduled dispatch: secret-authenticated, no end-user
  // session. Drains eligible interpret_entry jobs across all owners.
  // Attachments are unaffected — they keep their existing direct,
  // per-upload invocation below.
  const dispatchSecret = Deno.env.get("WORKER_DISPATCH_SECRET");
  if (body.mode === "dispatch") {
    if (!dispatchSecret || request.headers.get("x-dispatch-secret") !== dispatchSecret) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const summary = await runEntryDispatchDrain(service);
    return Response.json({ ok: true, mode: "dispatch", ...summary });
  }

  // Direct invocation: authenticated end-user session, unchanged request
  // contract ({ jobId }) for both attachment and entry jobs.
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer "))
    return Response.json({ error: "Unauthorized", code: "missing_bearer" }, { status: 401 });
  const {
    data: { user },
    error: userError,
  } = await service.auth.getUser(authorization.slice("Bearer ".length));
  if (!user) {
    console.error("Access token validation failed", {
      status: userError?.status,
      code: userError?.code,
    });
    return Response.json({ error: "Unauthorized", code: "invalid_access_token" }, { status: 401 });
  }

  const jobId = typeof body.jobId === "string" ? body.jobId : "";
  const { data: jobRow, error: jobLookupError } = await service
    .from("jobs")
    .select("type")
    .eq("id", jobId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (jobLookupError || !jobRow || !isSupportedJobType(jobRow.type))
    return Response.json({ error: "Job is not available" }, { status: 409 });

  const workerId = `process-jobs:${crypto.randomUUID()}`;
  const claimRpc = jobRow.type === "process_attachment" ? "claim_attachment_job" : "claim_entry_interpretation_job";
  const { data: claimedJob, error: claimError } = await service.rpc(claimRpc, {
    p_job_id: jobId,
    p_user_id: user.id,
    p_worker_id: workerId,
    p_lease_seconds: JOB_LEASE_SECONDS,
  });
  if (claimError) {
    console.error("Job claim failed", { jobId, code: claimError.code });
    return Response.json({ error: "Job is not available" }, { status: 409 });
  }
  if (!claimedJob) return Response.json({ error: "Job is not available" }, { status: 409 });

  // The claimed row carries its own `user_id`, and that is the only owner any
  // handler below is allowed to act on. `user.id` above authorised *this
  // request*; it never selects a credential — see `resolveJobCredential`.
  return processClaimedJob(service, jobRow.type, claimedJob, workerId);
});
