import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

function dataOrThrow(result, label) {
  if (result.error) throw new Error(`${label} (${result.error.code ?? "unknown"})`);
  return result.data;
}

function apiKeyValue(key) {
  return key.api_key ?? key.key ?? key.value;
}

const projectRef = readFileSync(new URL("../supabase/.temp/project-ref", import.meta.url), "utf8").trim();
assert(/^[a-z0-9]{20}$/.test(projectRef), "Linked project reference is invalid");
const npx = process.platform === "win32" ? process.env.ComSpec : "npx";
const keyArguments = process.platform === "win32"
  ? ["/d", "/s", "/c", `npx supabase projects api-keys --project-ref ${projectRef} --output json`]
  : ["supabase", "projects", "api-keys", "--project-ref", projectRef, "--output", "json"];
const keyOutput = execFileSync(
  npx,
  keyArguments,
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
);
const keys = JSON.parse(keyOutput);
const serviceKey = keys.find((key) => key.name === "service_role") ?? keys.find((key) => key.type === "secret");
const publicKey = keys.find((key) => key.name === "anon") ?? keys.find((key) => key.type === "publishable");
assert(serviceKey && publicKey, "Project API keys are unavailable");

const url = `https://${projectRef}.supabase.co`;
const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(url, apiKeyValue(serviceKey), clientOptions);
const publicApiKey = apiKeyValue(publicKey);
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

  const client = createClient(url, publicApiKey, clientOptions);
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
  assert(visibleUsage.length === 1 && visibleUsage.every((row) => row.user_id === firstUser.id), "AI usage RLS leaked another user row");

  const summary = dataOrThrow(
    await first.rpc("get_ai_cost_summary", { p_timezone: "America/New_York" }),
    "aggregate AI costs",
  );
  assert(summary.allTimeCalls === 1 && summary.allTimeCostNanoUsd === 3_550_000, "Remote cost aggregate is inconsistent");

  const task = dataOrThrow(
    await first.from("tasks").insert({ user_id: firstUser.id, title: "Ownership smoke task" }).select("id").single(),
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
    if (storageCleanup.error) console.error(`Remote smoke storage cleanup failed (${storageCleanup.error.code ?? "unknown"})`);
  }
  for (const userId of createdUsers) {
    const cleanup = await admin.auth.admin.deleteUser(userId);
    if (cleanup.error) console.error(`Remote smoke cleanup failed (${cleanup.error.code ?? "unknown"})`);
  }
}
