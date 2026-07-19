import { createClient } from "npm:@supabase/supabase-js@2";
import { isSupportedJobType, processClaimedJob, runEntryDispatchDrain } from "./dispatch.ts";

const JOB_LEASE_SECONDS = 300;

Deno.serve(async (request) => {
  if (request.method !== "POST")
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey)
    return Response.json(
      { error: "Server is not configured", code: "missing_openai_key" },
      { status: 503 },
    );
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
    const summary = await runEntryDispatchDrain(service, openaiKey);
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

  return processClaimedJob(service, openaiKey, jobRow.type, claimedJob, workerId);
});
