import { createClient } from "@supabase/supabase-js";
import { getLinkedSupabaseCredentials } from "./linked-supabase.mjs";

const credentials = getLinkedSupabaseCredentials();
const admin = createClient(credentials.url, credentials.serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const marker = `person-candidate-${crypto.randomUUID()}`;
const password = `PersonCandidate!${crypto.randomUUID()}A7`;
const users = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function data(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.code ?? "unknown"} ${result.error.message}`);
  return result.data;
}
async function owner(index) {
  const email = `codex-person-candidate-${index}-${marker}@example.com`;
  const created = data(await admin.auth.admin.createUser({ email, password, email_confirm: true }), `create owner ${index}`).user;
  users.push(created.id);
  const client = createClient(credentials.url, credentials.publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
  data(await client.auth.signInWithPassword({ email, password }), `sign in owner ${index}`);
  return { client, user: created };
}
function extraction() {
  return {
    language: "pt-BR", occurredAt: new Date().toISOString(), isRetroactive: false,
    summary: "Enviar o relatório para Giovanna enquanto Jaime está de férias.", concepts: ["task"],
    contexts: [], organizations: [], projects: [],
    people: [
      { name: `Jaime ${marker}`, evidence: "para Jaime", confidence: 1, inferred: false },
      { name: `Giovanna ${marker}`, evidence: "para Giovanna", confidence: 1, inferred: false },
      { name: `Ignorada ${marker}`, evidence: "menção de teste", confidence: 1, inferred: false },
    ],
    taskCandidates: [], pendingQuestions: [], confidence: 1,
  };
}

try {
  const first = await owner(1);
  const second = await owner(2);
  const probe = await first.client.rpc("resolve_entry_person_candidates", {
    p_entry_id: crypto.randomUUID(), p_expected_interpretation_id: crypto.randomUUID(),
    p_resolutions: [{ candidateIndex: 0, disposition: "rejected" }], p_operation_key: crypto.randomUUID(),
  });
  if (probe.error?.code === "PGRST202") throw new Error("Migration 202608160095 is not deployed");

  const jaime = data(await first.client.from("people").insert({ user_id: first.user.id, name: `Jaime ${marker}` }).select("id").single(), "seed existing Jaime");
  const entry = data(await first.client.from("entries").insert({
    user_id: first.user.id, original_content: `Fixture ${marker}`, source: "web", locale: "pt-BR", status: "saved",
  }).select("id").single(), "seed entry");
  data(await first.client.rpc("persist_entry_interpretation", {
    p_entry_id: entry.id, p_extraction: extraction(), p_model: "remote-person-candidate-smoke",
    p_strategy_version: "person-candidate-v1", p_prompt_version: "person-candidate-v1", p_input_tokens: 1, p_output_tokens: 1,
  }), "persist interpretation");
  const current = data(await first.client.from("entries").select("current_interpretation_id").eq("id", entry.id).single(), "read current interpretation");
  assert(current.current_interpretation_id, "current interpretation was not stored");

  const operationKey = crypto.randomUUID();
  const resolved = data(await first.client.rpc("resolve_entry_person_candidates", {
    p_entry_id: entry.id,
    p_expected_interpretation_id: current.current_interpretation_id,
    p_operation_key: operationKey,
    p_resolutions: [
      { candidateIndex: 1, disposition: "confirmed", resolvedName: `Giovanna ${marker}` },
      { candidateIndex: 2, disposition: "rejected" },
    ],
  }), "resolve missing people");
  assert(resolved.results?.[0]?.outcome === "created", "unmatched Giovanna was not created");
  assert(resolved.results?.[1]?.outcome === "ignored", "ignored mention was not rejected");
  assert(resolved.undoId, "resolution did not return undo");

  const replay = data(await first.client.rpc("resolve_entry_person_candidates", {
    p_entry_id: entry.id, p_expected_interpretation_id: current.current_interpretation_id, p_operation_key: operationKey,
    p_resolutions: [
      { candidateIndex: 1, disposition: "confirmed", resolvedName: `Giovanna ${marker}` },
      { candidateIndex: 2, disposition: "rejected" },
    ],
  }), "idempotent replay");
  assert(replay.idempotent === true && replay.undoId === resolved.undoId, "replay changed the result");

  const crossOwner = await second.client.rpc("resolve_entry_person_candidates", {
    p_entry_id: entry.id, p_expected_interpretation_id: current.current_interpretation_id,
    p_operation_key: crypto.randomUUID(), p_resolutions: [{ candidateIndex: 1, disposition: "confirmed" }],
  });
  assert(crossOwner.error?.code === "P0002", "cross-owner entry was not hidden");

  data(await first.client.rpc("undo_operation", { p_undo_id: resolved.undoId }), "undo person resolution");
  const remaining = data(await first.client.from("people").select("id,name").ilike("name", `%${marker}%`), "read people after undo");
  assert(remaining.length === 1 && remaining[0].id === jaime.id, "undo did not preserve only the preexisting person");
  const resolutions = data(await first.client.from("entry_person_candidate_resolutions").select("candidate_index").eq("entry_id", entry.id), "read resolutions after undo");
  assert(resolutions.length === 0, "undo left candidate resolutions behind");
  console.log("person candidate remote smoke: PASS");
} finally {
  for (const userId of users.reverse()) {
    const removed = await admin.auth.admin.deleteUser(userId);
    if (removed.error) console.error(`cleanup failed for ${userId}: ${removed.error.message}`);
  }
}
