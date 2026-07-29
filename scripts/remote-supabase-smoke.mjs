import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { getLinkedSupabaseCredentials } from "./linked-supabase.mjs";

if (process.argv.includes("--phase-2x")) {
  const suites = [
    ["test:remote:jobs", "Phase 2A job reliability"],
    ["test:remote:interpretations", "Phase 2B interpretation revisions"],
    ["test:remote:product-events", "Phase 2X product events"],
    ["test:remote:entry-processing", "Phase 2X entry processing"],
    ["test:remote:daily-cycle", "Phase 2X daily cycle"],
    ["test:remote", "complete Supabase baseline"],
    ["test:remote:2x:cleanup", "Phase 2X residual-data cleanup"],
  ];

  for (const [script, label] of suites) {
    console.log(`\n[remote:2x] ${label} (${script})`);
    const command = process.platform === "win32" ? process.env.ComSpec : "npm";
    const args = process.platform === "win32"
      ? ["/d", "/s", "/c", `npm run ${script}`]
      : ["run", script];
    const result = spawnSync(command, args, { stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }

  console.log("\nPhase 2X aggregate remote gate passed: jobs, interpretations, product events, entry processing, daily cycle, complete Supabase baseline, and residual-data cleanup.");
  process.exit(0);
}

if (process.argv.includes("--phase-2c")) {
  // Deterministic, disposable-fixture suites only. The daily-cycle smoke is intentionally
  // excluded from this fail-fast aggregate: its needs-attention section claims an
  // `interpret_entry` job, which races the unattended per-minute pg_cron drain on the
  // shared queue and is therefore not deterministic under back-to-back aggregate timing.
  // It remains available standalone (`npm run test:remote:daily-cycle`) and inside the
  // Phase 2X aggregate. The 2C disposition/convergence contract is covered deterministically
  // by the confirmation smoke's v5 disposition, partial-confirmation, and undo cases.
  const suites = [
    ["test:remote:2c:confirmation", "Phase 2C editable candidate confirmation (v2–v6)"],
    ["test:remote:product-events", "Phase 2C candidate analytics product events"],
    ["test:remote:2c:cleanup", "Phase 2C residual-data cleanup"],
  ];

  for (const [script, label] of suites) {
    console.log(`\n[remote:2c] ${label} (${script})`);
    const command = process.platform === "win32" ? process.env.ComSpec : "npm";
    const args = process.platform === "win32"
      ? ["/d", "/s", "/c", `npm run ${script}`]
      : ["run", script];
    const result = spawnSync(command, args, { stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }

  console.log("\nPhase 2C aggregate remote gate passed: editable candidate confirmation (v2–v6), candidate analytics product events, and residual-data cleanup.");
  process.exit(0);
}

if (process.argv.includes("--phase-2d")) {
  // Deterministic, disposable-fixture suites only. The daily-cycle smoke is intentionally
  // excluded from this fail-fast aggregate for the same reason it is excluded from the
  // Phase 2C aggregate: its needs-attention section claims an `interpret_entry` job, which
  // races the unattended per-minute pg_cron drain on the shared queue and is therefore not
  // deterministic under back-to-back aggregate timing. The Phase 2D question-resolution,
  // question-preview, and question-reinterpretation smokes create their own disposable
  // entries/interpretations/questions and never claim the shared queue, so they are
  // deterministic; the product-events smoke re-verifies the content-free analytics contract.
  const suites = [
    ["test:remote:2d:resolution", "Phase 2D question resolution (v1/v2 answer + dispositions)"],
    ["test:remote:2d:preview", "Phase 2D suggested answers and source/effect preview"],
    ["test:remote:2d:reinterpretation", "Phase 2D reinterpretation consequence (v3)"],
    ["test:remote:product-events", "Phase 2D content-free resolution analytics"],
    ["test:remote:2d:cleanup", "Phase 2D residual-data cleanup"],
  ];

  for (const [script, label] of suites) {
    console.log(`\n[remote:2d] ${label} (${script})`);
    const command = process.platform === "win32" ? process.env.ComSpec : "npm";
    const args = process.platform === "win32"
      ? ["/d", "/s", "/c", `npm run ${script}`]
      : ["run", script];
    const result = spawnSync(command, args, { stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }

  console.log("\nPhase 2D aggregate remote gate passed: question resolution (v1/v2), suggested-answer/preview, reinterpretation (v3), content-free resolution analytics, and residual-data cleanup.");
  process.exit(0);
}

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

function dataOrThrow(result, label) {
  if (result.error) throw new Error(`${label} (${result.error.code ?? "unknown"})`);
  return result.data;
}

const credentials = getLinkedSupabaseCredentials();
const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(credentials.url, credentials.serviceRoleKey, clientOptions);
const publicApiKey = credentials.publishableKey;
const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const password = `Sprint-1.5-${crypto.randomUUID()}!`;
const createdUsers = [];
const uploadedPaths = [];

async function createTestUser(index) {
  const result = await admin.auth.admin.createUser({
    email: `sprint-1-5-${index}-${suffix}@example.test`,
    password,
    email_confirm: true,
  });
  const user = dataOrThrow(result, `create test user ${index}`).user;
  assert(user, `Test user ${index} was not returned`);
  createdUsers.push(user.id);

  const client = createClient(credentials.url, publicApiKey, clientOptions);
  dataOrThrow(
    await client.auth.signInWithPassword({ email: user.email, password }),
    `sign in test user ${index}`,
  );
  return { client, user };
}

function settingsPayload(maxFollowupsPerDay) {
  return {
    p_profile: { displayName: "Remote smoke", locale: "en", timezone: "America/New_York" },
    p_preferences: {
      agentName: "Brain",
      followUpIntensity: "balanced",
      dailyReviewTime: "22:00",
      personality: "direct",
      tone: "informal",
      autonomyLevel: "autonomous",
      weeklyReviewDay: 5,
      weeklyReviewTime: "19:00",
      planningDay: 1,
      planningTime: "08:00",
      quietStart: "00:00",
      quietEnd: "23:59",
      importantReminderOverride: true,
      maxFollowupsPerDay,
      responseDetail: "short",
      aiProvider: "openai",
      aiProfile: "quality",
      chatModel: "gpt-5.6-terra",
      extractionModel: "gpt-5.6-luna",
      reasoningModel: "gpt-5.6-terra",
      reviewModel: "gpt-5.6-terra",
      fileModel: "gpt-5.6-luna",
      backgroundModel: "gpt-5-mini",
      embeddingModel: "text-embedding-3-small",
      privacyDefault: "normal",
    },
  };
}

try {
  const [{ client: first, user: firstUser }, { client: second, user: secondUser }] = await Promise.all([
    createTestUser(1),
    createTestUser(2),
  ]);

  dataOrThrow(await first.rpc("save_profile_settings", settingsPayload(0)), "save atomic settings");

  const ownUsageRequest = `smoke-own-${suffix}`;
  dataOrThrow(await first.rpc("record_ai_usage", {
    p_operation: "chat",
    p_model: "gpt-5.6-terra",
    p_input_tokens: 1000,
    p_cached_input_tokens: 200,
    p_output_tokens: 100,
    p_reasoning_tokens: 20,
    p_provider_request_id: ownUsageRequest,
    p_source_type: "conversation",
    p_source_id: null,
    p_user_id: firstUser.id,
  }), "record own AI usage");

  // Phase 2E, migration 202607250055. CI proves the widened operation CHECK
  // against a chain applied from an empty database; only this reaches the
  // linked project, where the constraint already existed and was swapped in
  // place. Without it the swap has no verification path at all, because
  // `src/lib/ai/usage.ts` swallows a ledger failure into a console line.
  const commandUsageRequest = `smoke-command-${suffix}`;
  dataOrThrow(await first.rpc("record_ai_usage", {
    p_operation: "task_command",
    p_model: "gpt-5.6-luna",
    p_input_tokens: 900,
    p_cached_input_tokens: 0,
    p_output_tokens: 120,
    p_reasoning_tokens: 0,
    p_provider_request_id: commandUsageRequest,
    // Parse time has no persisted subject: no task is selected yet, by
    // construction. `'task'` stays refused until Phase 2F (PRD §22).
    p_source_type: null,
    p_source_id: null,
    p_user_id: firstUser.id,
  }), "record command-parsing AI usage");

  const commandSource = await first.rpc("record_ai_usage", {
    p_operation: "task_command",
    p_model: "gpt-5.6-luna",
    p_input_tokens: 1,
    p_cached_input_tokens: 0,
    p_output_tokens: 1,
    p_reasoning_tokens: 0,
    p_provider_request_id: `smoke-command-source-${suffix}`,
    p_source_type: "task",
    p_source_id: null,
    p_user_id: firstUser.id,
  });
  assert(commandSource.error?.code === "22023", "Source type 'task' was not refused");

  const crossUsage = await first.rpc("record_ai_usage", {
    p_operation: "chat",
    p_model: "gpt-5.6-terra",
    p_input_tokens: 1,
    p_cached_input_tokens: 0,
    p_output_tokens: 1,
    p_reasoning_tokens: 0,
    p_provider_request_id: `smoke-cross-${suffix}`,
    p_source_type: "conversation",
    p_source_id: null,
    p_user_id: secondUser.id,
  });
  assert(crossUsage.error?.code === "42501", "Cross-user usage recording was not denied");

  dataOrThrow(await second.rpc("record_ai_usage", {
    p_operation: "chat",
    p_model: "gpt-5-mini",
    p_input_tokens: 10,
    p_cached_input_tokens: 0,
    p_output_tokens: 5,
    p_reasoning_tokens: 0,
    p_provider_request_id: `smoke-second-${suffix}`,
    p_source_type: "conversation",
    p_source_id: null,
    p_user_id: secondUser.id,
  }), "record second user AI usage");

  const visibleUsage = dataOrThrow(
    await first.from("ai_usage_events").select("user_id,provider_request_id"),
    "read isolated AI usage",
  );
  // The ownership invariant and the fixture count are asserted separately, and
  // that separation is the point of this block. They were one condition, and
  // its message named only the first, so a stale count reported itself as
  // "AI usage RLS leaked another user row" — the most alarming sentence in this
  // script — while RLS was working perfectly. Splitting them means a fixture
  // change can never again be read as a security failure.
  //
  // `first` legitimately records TWO events above: `ownUsageRequest` and
  // `commandUsageRequest`. The two attempts after them are supposed to be
  // refused (`22023` for the disallowed source type, `42501` for the cross-user
  // write) and therefore write nothing, and `second` records one row that must
  // stay invisible here.
  const foreignUsage = visibleUsage.filter((row) => row.user_id !== firstUser.id);
  assert(
    foreignUsage.length === 0,
    `AI usage RLS leaked ${foreignUsage.length} row(s) owned by another user`,
  );
  assert(
    !visibleUsage.some((row) => row.provider_request_id === `smoke-second-${suffix}`),
    "AI usage RLS exposed the second user's own recorded event",
  );

  // The count stays exact rather than lower-bounded. Both owners are created
  // fresh for every run, so these rows are precisely what this script wrote —
  // there is no incidental environment data to tolerate, and `>= 1` would hide
  // both a lost fixture and a duplicated one.
  assert(
    visibleUsage.length === 2,
    `Expected the 2 AI usage events this run records for the first user, saw ${visibleUsage.length}`,
  );
  assert(
    visibleUsage.map((row) => row.provider_request_id).sort().join(",")
      === [ownUsageRequest, commandUsageRequest].sort().join(","),
    "The visible AI usage events are not the two this run recorded for the first user",
  );

  const summary = dataOrThrow(
    await first.rpc("get_ai_cost_summary", { p_timezone: "America/New_York" }),
    "aggregate AI costs",
  );
  // The same stale-fixture defect as the block above, one assertion later, from
  // the same origin: `5099f81` wrote both expectations when `first` recorded a
  // single usage event, and `6c4a907` added the second without updating either.
  //
  // Split for the same reason, so the failure names its own cause. The counts
  // and the money are different questions, and a drift in one should not be
  // reported in the language of the other.
  //
  // The expected total is derived, not observed. `202607160015:167-172` bills
  //   (input - cached) * input_price + cached * cached_price + output * output_price
  // with reasoning tokens unbilled and the long-context multipliers inactive
  // (both fixtures sit far under the 272,000-token threshold):
  //
  //   gpt-5.6-terra  1000/200/100/20 -> 800*2500 + 200*250 + 100*15000 = 3,550,000
  //   gpt-5.6-luna    900/0/120/0    -> 900*1000 +   0*100 + 120*6000  = 1,620,000
  //                                                              total = 5,170,000
  //
  // The terra figure is the value this assertion carried when it was written for
  // one event, which is what makes the derivation self-checking rather than a
  // number copied out of a failing run.
  assert(
    summary.allTimeCalls === 2,
    `Expected the 2 AI usage events this run records, aggregate counted ${summary.allTimeCalls}`,
  );
  assert(
    summary.allTimeCostNanoUsd === 5_170_000,
    `Expected the exact aggregate cost of the 2 fixture events (5,170,000 nanoUSD), got ${summary.allTimeCostNanoUsd}`,
  );

  // Phase 2F Slice 2F.4 (2F-TESTMIG-006). This row is seeded through the
  // service-role `admin` client because `202607300063` revoked `insert` on
  // `public.tasks` from `authenticated`.
  //
  // READ THIS BEFORE TOUCHING IT: the task is not a spare fixture. It is the
  // subject of the cross-owner composite-FK denial immediately below, which is a
  // Phase-1 ownership invariant with nothing to do with Phase 2F. Deleting the
  // "broken" insert would leave that assertion unreachable while the suite
  // stayed green. It is re-pointed, never removed, and `user_id` is still
  // `firstUser.id` so the relationship's owner is unchanged.
  //
  // `public.task_projects` was NOT revoked, so the insert that must fail is
  // still issued by `first`'s own end-user client and still fails for exactly
  // the original reason: the composite `(user_id, project_id)` foreign key
  // refuses a project belonging to someone else.
  const task = dataOrThrow(
    await admin.from("tasks").insert({ user_id: firstUser.id, title: "Ownership smoke task" }).select("id").single(),
    "create owned task",
  );
  const foreignProject = dataOrThrow(
    await second.from("projects").insert({ user_id: secondUser.id, name: "Foreign smoke project" }).select("id").single(),
    "create foreign project",
  );
  const crossRelationship = await first.from("task_projects").insert({
    user_id: firstUser.id,
    task_id: task.id,
    project_id: foreignProject.id,
  });
  assert(crossRelationship.error?.code === "23503", "Cross-user relationship ownership was not denied");

  // The compensating evidence 2F-REVOKE-004 names, added here because the
  // revocation genuinely destroyed something and the replacement should be real
  // rather than implied. **Write-side RLS on `public.tasks` is no longer
  // reachable from any client role** — the grant check refuses before a policy
  // is consulted — so `tasks_insert_own`/`_update_own`/`_delete_own` cannot be
  // exercised from here, or from anywhere else a user can reach.
  //
  // What remains provable is read-side RLS, and it is asserted in both
  // directions so it cannot pass vacuously: the owner must SEE the row (a zero
  // count would satisfy the isolation half while proving nothing), and the other
  // owner must NOT.
  const ownerReadsOwnTask = dataOrThrow(
    await first.from("tasks").select("id").eq("id", task.id),
    "read own task",
  );
  assert(ownerReadsOwnTask.length === 1, "Owner could not read their own task, so the isolation check below would be vacuous");
  const strangerReadsForeignTask = dataOrThrow(
    await second.from("tasks").select("id").eq("id", task.id),
    "read another owner's task",
  );
  assert(strangerReadsForeignTask.length === 0, "Task RLS leaked another user's row on the read side");

  const audit = dataOrThrow(
    await first.from("audit_logs").insert({
      user_id: firstUser.id,
      action_type: "remote_smoke",
      entity_type: "test",
      actor: "user",
      reason: "Verify append-only RLS",
    }).select("id").single(),
    "insert audit row",
  );
  const auditMutation = await first.from("audit_logs").update({ reason: "must fail" }).eq("id", audit.id);
  assert(Boolean(auditMutation.error), "Append-only audit row accepted an update");

  const reminder = dataOrThrow(
    await first.from("reminders").insert({
      user_id: firstUser.id,
      title: "Lossless heartbeat smoke",
      remind_at: new Date(Date.now() - 60_000).toISOString(),
      important: true,
    }).select("id").single(),
    "create due reminder",
  );
  dataOrThrow(await first.rpc("request_heartbeat"), "run capped heartbeat");
  const cappedReminder = dataOrThrow(
    await first.from("reminders").select("status").eq("id", reminder.id).single(),
    "read capped reminder",
  );
  assert(cappedReminder.status === "scheduled", "Daily cap discarded an undelivered reminder");

  dataOrThrow(await first.rpc("save_profile_settings", settingsPayload(3)), "raise heartbeat cap");
  const heartbeat = dataOrThrow(await first.rpc("request_heartbeat"), "run deliverable heartbeat");
  assert(heartbeat.notifications_created >= 1, "Heartbeat did not deliver preserved work");
  const delivered = dataOrThrow(
    await first.from("notifications").select("title,action_url").eq("body", "Lossless heartbeat smoke").single(),
    "read delivered notification",
  );
  assert(delivered.title === "Important reminder" && delivered.action_url === "/en/app/reminders", "Heartbeat locale was not respected");

  const storagePath = `${firstUser.id}/${crypto.randomUUID()}-remote-smoke.txt`;
  dataOrThrow(
    await first.storage.from("user-files").upload(
      storagePath,
      new Blob(["Sprint 1.5 remote smoke file. No action is requested by this content."], { type: "text/plain" }),
      { contentType: "text/plain", upsert: false },
    ),
    "upload worker smoke file",
  );
  uploadedPaths.push(storagePath);
  const attachment = dataOrThrow(
    await first.from("attachments").insert({
      user_id: firstUser.id,
      storage_path: storagePath,
      original_name: "remote-smoke.txt",
      mime_type: "text/plain",
      size_bytes: 70,
      status: "uploaded",
    }).select("id").single(),
    "create worker smoke attachment",
  );
  const job = dataOrThrow(
    await first.from("jobs").insert({
      user_id: firstUser.id,
      type: "process_attachment",
      payload: { attachment_id: attachment.id },
      idempotency_key: `remote-smoke:${attachment.id}`,
    }).select("id").single(),
    "create worker smoke job",
  );
  dataOrThrow(
    await first.functions.invoke("process-jobs", { body: { jobId: job.id } }),
    "invoke deployed process-jobs worker",
  );
  const workerState = dataOrThrow(
    await first.from("attachments").select("status").eq("id", attachment.id).single(),
    "read worker attachment state",
  );
  const jobState = dataOrThrow(
    await first.from("jobs").select("status").eq("id", job.id).single(),
    "read worker job state",
  );
  const fileUsage = dataOrThrow(
    await first.from("ai_usage_events").select("id").eq("operation", "file_analysis").eq("source_id", attachment.id),
    "read file analysis ledger",
  );
  assert(workerState.status === "ready" && jobState.status === "completed" && fileUsage.length === 1, "Deployed worker did not finish atomically");

  console.log("Remote Supabase smoke passed: auth, atomic settings, RLS, ownership, heartbeat, AI ledger, aggregation, and deployed file worker.");
} finally {
  if (uploadedPaths.length > 0) {
    const storageCleanup = await admin.storage.from("user-files").remove(uploadedPaths);
    if (storageCleanup.error) {
      console.error(`Remote smoke storage cleanup failed (${storageCleanup.error.code ?? "unknown"})`);
      process.exitCode = 1;
    }
  }
  for (const userId of createdUsers) {
    const cleanup = await admin.auth.admin.deleteUser(userId);
    if (cleanup.error) {
      console.error(`Remote smoke cleanup failed (${cleanup.error.code ?? "unknown"})`);
      process.exitCode = 1;
    }
  }
}
