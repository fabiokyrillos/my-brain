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

function countOrThrow(result, label) {
  if (result.error) {
    throw new Error(`${label} (${result.error.code ?? "unknown"}): ${result.error.message}`);
  }
  assert(typeof result.count === "number", `${label} did not return an exact count`);
  return result.count;
}

function trustPayload(score = 1, policy = "auto_apply") {
  const signals = {
    modelConfidence: score,
    candidateMargin: score,
    entityExactness: score,
    semanticSimilarity: score,
    dateClarity: score,
    contextConsistency: score,
    reversibility: 1,
    autonomyAllowed: 1,
    correctionHistoryAgreement: score,
  };
  const decision = { score, policy, signals, overrides: [], evidence: ["explicit_user_correction"] };
  return {
    summary: decision,
    concepts: decision,
    occurredAt: decision,
    extractedDates: decision,
    entities: decision,
  };
}

const credentials = getLinkedSupabaseCredentials();
const admin = createClient(credentials.url, credentials.serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const suffix = crypto.randomUUID();
const password = `Revisions-${crypto.randomUUID()}-Aa1!`;
const createdUsers = [];

async function createTestUser(index) {
  const result = await admin.auth.admin.createUser({
    email: `phase-2b-revisions-${index}-${suffix}@example.test`,
    password,
    email_confirm: true,
  });
  const user = dataOrThrow(result, `create revision test user ${index}`).user;
  assert(user, `Revision test user ${index} was not returned`);
  createdUsers.push(user.id);
  const client = createClient(credentials.url, credentials.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  dataOrThrow(await client.auth.signInWithPassword({ email: user.email, password }), `sign in revision test user ${index}`);
  return { client, user };
}

function extraction(summary, personName = "Marina") {
  return {
    language: "pt-BR",
    occurredAt: "2026-07-17T15:00:00.000Z",
    isRetroactive: false,
    summary,
    concepts: ["person_note"],
    contexts: [],
    organizations: [],
    projects: [],
    people: [{ name: personName, confidence: 0.81, evidence: personName, inferred: false }],
    taskCandidates: [],
    pendingQuestions: [],
    confidence: 0.81,
  };
}

function correctionPatch(summary, entityId, trust = trustPayload()) {
  return {
    summary,
    concepts: ["decision", "person_note"],
    occurredAt: "2026-07-16T18:00:00.000Z",
    extractedDates: [{ value: "2026-07-20", label: "prazo citado" }],
    entityLinks: [{ entityType: "person", entityId, mention: "Bia", confidence: 1 }],
    classifications: { summary: "fact", concepts: "interpretation", occurredAt: "fact", entities: "fact" },
    pendingQuestions: [],
    elementTrust: trust,
    recordOnly: false,
  };
}

try {
  const [{ client: first, user: firstUser }, { client: second, user: secondUser }] =
    await Promise.all([createTestUser(1), createTestUser(2)]);

  const contractProbe = await first.rpc("begin_entry_reprocessing", {
    p_entry_id: crypto.randomUUID(),
    p_operation_key: crypto.randomUUID(),
    p_lease_seconds: 300,
  });
  if (contractProbe.error?.code === "PGRST202") {
    throw new Error("Phase 2B reprocessing RPC is not deployed");
  }
  assert(contractProbe.error?.code === "P0002", "Phase 2B reprocessing contract probe returned an unexpected result");

  const ownedPerson = dataOrThrow(
    await first.from("people").insert({ user_id: firstUser.id, name: `Beatriz ${suffix}` }).select("id").single(),
    "create owned correction person",
  );
  const foreignPerson = dataOrThrow(
    await second.from("people").insert({ user_id: secondUser.id, name: `Foreign ${suffix}` }).select("id").single(),
    "create foreign correction person",
  );

  const entry = dataOrThrow(
    await first.from("entries").insert({
      user_id: firstUser.id,
      original_content: "Registro original imutável para a Fase 2B.",
      locale: "pt-BR",
      source: "web",
      status: "saved",
    }).select("id,original_content").single(),
    "create revision entry",
  );
  dataOrThrow(await first.rpc("persist_entry_interpretation", {
    p_entry_id: entry.id,
    p_extraction: extraction("Interpretação inicial."),
    p_model: "remote-smoke-model",
    p_strategy_version: "remote-smoke-v1",
    p_prompt_version: "remote-smoke-v1",
    p_input_tokens: 10,
    p_output_tokens: 10,
  }), "persist initial interpretation");

  const firstKey = crypto.randomUUID();
  const corrected = dataOrThrow(await first.rpc("correct_entry_interpretation", {
    p_entry_id: entry.id,
    p_expected_version: 1,
    p_patch: correctionPatch("Resumo corrigido pelo usuário.", ownedPerson.id),
    p_operation_key: firstKey,
    p_reason: "Pessoa e data corrigidas no smoke remoto.",
  }), "append first correction");
  assert(corrected.version === 2 && corrected.undo_id, "Correction did not append version 2 with undo");

  const repeated = dataOrThrow(await first.rpc("correct_entry_interpretation", {
    p_entry_id: entry.id,
    p_expected_version: 1,
    p_patch: correctionPatch("Resumo corrigido pelo usuário.", ownedPerson.id),
    p_operation_key: firstKey,
    p_reason: "Pessoa e data corrigidas no smoke remoto.",
  }), "repeat idempotent correction");
  assert(repeated.interpretation_id === corrected.interpretation_id && repeated.idempotent === true, "Repeated correction was not idempotent");

  const beforeConcurrent = corrected.version;
  const concurrent = await Promise.all([
    first.rpc("correct_entry_interpretation", {
      p_entry_id: entry.id,
      p_expected_version: beforeConcurrent,
      p_patch: correctionPatch("Correção concorrente A.", ownedPerson.id),
      p_operation_key: crypto.randomUUID(),
      p_reason: "Concorrência A",
    }),
    first.rpc("correct_entry_interpretation", {
      p_entry_id: entry.id,
      p_expected_version: beforeConcurrent,
      p_patch: correctionPatch("Correção concorrente B.", ownedPerson.id),
      p_operation_key: crypto.randomUUID(),
      p_reason: "Concorrência B",
    }),
  ]);
  assert(concurrent.filter((result) => !result.error).length === 1, "Concurrent corrections did not allow exactly one winner");
  assert(concurrent.filter((result) => result.error).length === 1, "Concurrent correction loser did not receive a conflict");

  const currentAfterConcurrent = dataOrThrow(
    await first.from("entry_interpretations").select("version").eq("entry_id", entry.id).order("version", { ascending: false }).limit(1).single(),
    "read current version after concurrency",
  );
  const rollbackCountBefore = countOrThrow(
    await first.from("entry_interpretations").select("id", { count: "exact", head: true }).eq("entry_id", entry.id),
    "count revisions before rollback test",
  );
  const mixedOwner = await first.rpc("correct_entry_interpretation", {
    p_entry_id: entry.id,
    p_expected_version: currentAfterConcurrent.version,
    p_patch: correctionPatch("Esta correção deve falhar.", foreignPerson.id),
    p_operation_key: crypto.randomUUID(),
    p_reason: "Fixture cross-user",
  });
  assert(mixedOwner.error, "A cross-user entity correction was accepted");
  const rollbackCountAfter = countOrThrow(
    await first.from("entry_interpretations").select("id", { count: "exact", head: true }).eq("entry_id", entry.id),
    "count revisions after rollback test",
  );
  assert(rollbackCountAfter === rollbackCountBefore, "Partial correction work survived a failed ownership validation");

  const latestBeforeUndo = dataOrThrow(
    await first.from("entry_interpretations").select("version").eq("entry_id", entry.id).order("version", { ascending: false }).limit(1).single(),
    "read latest version before undo fixture",
  );
  const undoable = dataOrThrow(await first.rpc("correct_entry_interpretation", {
    p_entry_id: entry.id,
    p_expected_version: latestBeforeUndo.version,
    p_patch: correctionPatch("Correção pronta para undo.", ownedPerson.id),
    p_operation_key: crypto.randomUUID(),
    p_reason: "Undo fixture",
  }), "create undoable correction");
  const undone = dataOrThrow(await first.rpc("undo_operation", { p_undo_id: undoable.undo_id }), "undo latest correction");
  assert(undone.undone === true && undone.interpretation_id, "Undo did not append a compensating interpretation");
  const repeatedUndo = dataOrThrow(await first.rpc("undo_operation", { p_undo_id: undoable.undo_id }), "repeat interpretation undo");
  assert(repeatedUndo.interpretation_id === undone.interpretation_id && repeatedUndo.idempotent === true, "Repeated undo was not idempotent");
  const foreignUndo = await second.rpc("undo_operation", { p_undo_id: undoable.undo_id });
  assert(foreignUndo.error, "Cross-user undo was accepted");

  const reprocessKey = crypto.randomUUID();
  const begun = dataOrThrow(await first.rpc("begin_entry_reprocessing", {
    p_entry_id: entry.id,
    p_operation_key: reprocessKey,
    p_lease_seconds: 300,
  }), "begin reprocessing");
  assert(begun.status === "reprocessing", "Reprocessing did not persist its lifecycle state");
  const competingBegin = await first.rpc("begin_entry_reprocessing", {
    p_entry_id: entry.id,
    p_operation_key: crypto.randomUUID(),
    p_lease_seconds: 300,
  });
  assert(competingBegin.error, "Concurrent reprocessing was accepted");

  const reprocessed = dataOrThrow(await first.rpc("persist_reprocessed_entry_interpretation", {
    p_entry_id: entry.id,
    p_operation_key: reprocessKey,
    p_extraction: extraction("Interpretação reprocessada.", `Beatriz ${suffix}`),
    p_model: "remote-smoke-model",
    p_strategy_version: "remote-smoke-v2",
    p_prompt_version: "remote-smoke-v2",
    p_input_tokens: 12,
    p_output_tokens: 8,
    p_element_trust: trustPayload(0.85, "apply_and_flag"),
  }), "complete reprocessing");
  assert(reprocessed.origin === "ai_reprocessed" && reprocessed.status !== "reprocessing", "Reprocessing did not append a new AI version");
  const repeatedReprocess = dataOrThrow(await first.rpc("persist_reprocessed_entry_interpretation", {
    p_entry_id: entry.id,
    p_operation_key: reprocessKey,
    p_extraction: extraction("Interpretação reprocessada.", `Beatriz ${suffix}`),
    p_model: "remote-smoke-model",
    p_strategy_version: "remote-smoke-v2",
    p_prompt_version: "remote-smoke-v2",
    p_input_tokens: 12,
    p_output_tokens: 8,
    p_element_trust: trustPayload(0.85, "apply_and_flag"),
  }), "repeat reprocessing completion");
  assert(repeatedReprocess.interpretation_id === reprocessed.interpretation_id && repeatedReprocess.idempotent === true, "Reprocessing completion was not idempotent");

  const failureKey = crypto.randomUUID();
  dataOrThrow(await first.rpc("begin_entry_reprocessing", { p_entry_id: entry.id, p_operation_key: failureKey, p_lease_seconds: 300 }), "begin failing reprocessing");
  const failed = dataOrThrow(await first.rpc("fail_entry_reprocessing", {
    p_entry_id: entry.id,
    p_operation_key: failureKey,
    p_error: `Provider failed\n${"sensitive-detail ".repeat(80)}`,
  }), "fail reprocessing");
  assert(failed.status === "recoverable_error", "Failed reprocessing did not become recoverable");
  const failedEntry = dataOrThrow(await first.from("entries").select("processing_error").eq("id", entry.id).single(), "read sanitized reprocessing failure");
  assert(failedEntry.processing_error.length <= 500 && !/[\r\n]/.test(failedEntry.processing_error), "Reprocessing error was not bounded and sanitized");

  dataOrThrow(await second.from("entity_aliases").insert({
    user_id: secondUser.id,
    entity_type: "person",
    entity_id: foreignPerson.id,
    alias: `Foreign alias ${suffix}`,
  }), "create foreign alias");
  const leakedAliases = dataOrThrow(await first.from("entity_aliases").select("id").eq("entity_id", foreignPerson.id), "check alias RLS");
  assert(leakedAliases.length === 0, "Entity alias RLS leaked another user's row");
  const crossOwnerAlias = await first.from("entity_aliases").insert({
    user_id: firstUser.id,
    entity_type: "person",
    entity_id: foreignPerson.id,
    alias: `Invalid alias ${suffix}`,
  });
  assert(crossOwnerAlias.error, "An alias was attached to another user's entity");

  const finalEntry = dataOrThrow(await first.from("entries").select("original_content,current_interpretation_id,status").eq("id", entry.id).single(), "read final revision entry");
  assert(finalEntry.original_content === entry.original_content, "The original entry changed during revisions");
  assert(finalEntry.current_interpretation_id, "The current interpretation pointer was not persisted");
  const audits = dataOrThrow(await first.from("audit_logs").select("action_type").eq("source_entry_id", entry.id), "read revision audit trail");
  const actionTypes = audits.map((audit) => audit.action_type);
  assert(actionTypes.includes("entry_interpretation_corrected"), "Correction audit is missing");
  assert(actionTypes.includes("entry_interpretation_correction_undone"), "Undo audit is missing");
  assert(actionTypes.includes("entry_reprocessed"), "Reprocessing audit is missing");

  console.log("Remote interpretation revision smoke passed: immutability, append-only correction, idempotency, concurrency, ownership, rollback, audit, undo, aliases, reprocessing, sanitization, RLS, and cleanup.");
} finally {
  for (const userId of createdUsers) {
    const cleanup = await admin.auth.admin.deleteUser(userId);
    if (cleanup.error) console.error(`Remote interpretation smoke cleanup failed (${cleanup.error.code ?? "unknown"})`);
  }
}
