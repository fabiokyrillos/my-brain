"use server";

/**
 * The first lifecycle Memories have ever had (UX-10), and the write half of the
 * confirmed-memory contract (DEC-5).
 *
 * Before this, `createRecord` inserted `{user_id, content, kind: 'fact',
 * confidence: 1}` and nothing about a memory could ever be changed again:
 * `kind`, `sensitivity`, `important`, `person_id`, `project_id`, `valid_from`
 * and `valid_until` all existed in `202607160006_chat_memory.sql:3-20` and were
 * unreachable from the UI. This module makes them editable **without adding a
 * column, an RPC, a grant or a migration** — `authenticated` already holds
 * `select, insert, update, delete` on `public.memories` under four own-row RLS
 * policies (`202607160006:69-79`), and Phase 2F's revocation deliberately
 * covered `tasks` and `reminders` only (`202607300063:90-92`).
 *
 * The posture is the one Slice F2 established for Projects and People:
 *
 * 1. **Ownership is proved twice.** RLS is the trust boundary; the `user_id`
 *    predicate on every statement is the belt to its braces.
 * 2. **The pre-state is read before the write, in the same ownership scope**, so
 *    the audit row can say what changed rather than only what it now is.
 * 3. **Every failure is a distinct, localized sentence**, because a cross-tenant
 *    relation and a vanished row are different things to do next.
 * 4. **Nothing is invented.** No column added, no relation created.
 *
 * One thing is deliberately *not* here: a delete. Archiving sets `valid_until`
 * and leaves the row intact, because a memory's provenance is the reason the
 * detail page exists and a physical delete would destroy it. `authenticated`
 * does hold `delete`, so this is a product decision rather than a limit — and it
 * is the decision, so there is no code path here that removes a row.
 */

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireUser } from "@/lib/auth/require-user";
import { resolveLocale, type Locale } from "@/lib/preferences";
import type { Database } from "@/lib/supabase/database.types";
import { requireSupabaseData } from "@/lib/supabase/result";

import { getMemoryCopy } from "./copy";
import {
  idleMemoryEditState,
  type MemoryEditState,
  type MemoryEditSubmission,
  type MemoryProposalState,
} from "./edit-state";
import { memoryLifecycleSchema, memoryProposalSchema, memoryUpdateSchema } from "./schema";
import { MEMORY_UNDO_TRANSITION } from "./undo";

type Client = SupabaseClient<Database>;

/** The columns an audit row compares. Read before, selected after, same shape. */
const AUDITED_COLUMNS = "content,kind,sensitivity,important,person_id,project_id,valid_from,valid_until";

/**
 * A composite-FK violation, told apart from every other write failure.
 *
 * `memories_person_owner_fk` and `memories_project_owner_fk`
 * (`202607170016:48-54`) reference `(user_id, id)`, so pointing a memory at
 * another tenant's person is refused by the database rather than by a check this
 * code could forget. Postgres reports it as `23503`; surfacing it as "pick one
 * that exists" is the truthful reading, since from the owner's side that row
 * does not exist.
 */
function isUnknownRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "23503") return true;
  return (error.message ?? "").includes("_owner_fk");
}

function failed(
  locale: Locale,
  key: "invalidInput" | "sessionExpired" | "notFound" | "saveFailed" | "unknownRelation",
  submitted: MemoryEditSubmission | null = null,
): MemoryEditState {
  return { status: "error", message: getMemoryCopy(locale)[key], submitted };
}

/**
 * The submitted fields, without React's own.
 *
 * A Server Action's `FormData` carries framework metadata under `$ACTION_*`
 * keys, and every schema here is `.strict()` — deliberately, so a forged control
 * is a rejection rather than a silent drop. Without this filter a strict schema
 * makes the form unusable.
 */
function submittedFields(formData: FormData): MemoryEditSubmission {
  return Object.fromEntries(
    Array.from(formData.entries())
      .filter(([key]) => !key.startsWith("$ACTION_"))
      .map(([key, value]) => [key, typeof value === "string" ? value : ""]),
  );
}

/**
 * Embed the memory's text so it can be retrieved.
 *
 * Best-effort by design, and imported lazily for the reason `createRecord`
 * already does it this way: `@/lib/ai` is `server-only` and pulls the provider
 * graph behind it, which no caller of a plain edit should pay for.
 *
 * A failure returns `undefined` — meaning *do not touch the stored vector* —
 * rather than `null`, which would blank it. The distinction matters on an edit:
 * a stale vector degrades recall for one memory, while a blanked one removes it
 * from retrieval entirely. Degraded recall is the recoverable failure, and the
 * content the model finally reads is always the current row, never the vector.
 */
async function embedMemory(
  supabase: Client,
  userId: string,
  content: string,
  locale: Locale,
): Promise<{ embedding: number[]; embedding_model: string } | undefined> {
  try {
    const { getAIProvider } = await import("@/lib/ai");
    const { recordAIUsage } = await import("@/lib/ai/usage");
    const { openAiGate } = await import("@/lib/byok/gate");
    const { admitRateLimitedOperation } = await import("@/features/rate-limits/server");

    // BYOK gate. Embedding is already best-effort here — the memory is saved
    // either way and an embedding failure must never destroy it — so a missing
    // credential degrades exactly like a provider outage: no embedding, no
    // error, no provider call. Returning early rather than throwing keeps that
    // contract, and **no project key is consulted**, because none exists.
    const gate = await openAiGate(supabase, userId);
    if (!gate.ok) return undefined;

    // 2H-RATE-001, degrading exactly like the gate above. The memory is saved
    // either way, so a rate refusal returns `undefined` — "do not touch the
    // stored vector" — rather than failing the edit. An hourly pace ceiling must
    // never be able to stop somebody saving what they wrote.
    const admission = await admitRateLimitedOperation({
      client: supabase,
      bucket: "ai",
      locale,
      operation: "embed_text",
    });
    if (!admission.ok) return undefined;

    const preferencesResult = await supabase
      .from("agent_preferences")
      .select("embedding_model")
      .eq("user_id", userId)
      .maybeSingle();
    const preferences = requireSupabaseData(preferencesResult, "load embedding preference");
    const result = await getAIProvider({
      credential: gate.credential.secret,
      embeddingModel: preferences?.embedding_model ?? "text-embedding-3-small",
    }).embedText(content);
    await recordAIUsage(supabase, {
      operation: "semantic_search",
      model: result.model,
      userId,
      usage: result,
      sourceType: "memory",
    });
    return { embedding: result.embedding, embedding_model: result.model };
  } catch (error) {
    console.error("Memory embedding failed", error instanceof Error ? error.message : "unknown error");
    return undefined;
  }
}

/**
 * Write the audit row for a memory change.
 *
 * Part of the write, not a side effect of it: a change that succeeded without
 * one would be an edit with no record of who made it. Its own failure is logged
 * rather than surfaced, because the change *did* happen and telling the owner it
 * did not would be the larger lie.
 *
 * `reason` is English prose authored here, which is exactly the shape UX-28
 * records. It is written for the audit trail, and History must keep treating it
 * as such rather than rendering it at a pt-BR reader.
 */
async function audit(
  supabase: Client,
  userId: string,
  memoryId: string,
  actionType: string,
  before: unknown,
  after: unknown,
  reason: string,
): Promise<void> {
  const result = await supabase.from("audit_logs").insert({
    user_id: userId,
    action_type: actionType,
    entity_type: "memory",
    entity_id: memoryId,
    actor: "user",
    before_state: before as never,
    after_state: after as never,
    reason,
  });
  if (result.error) console.error("Memory audit failed", result.error.message);
}

function revalidateMemory(locale: Locale, memoryId: string | null): void {
  if (memoryId) revalidatePath(`/${locale}/app/memories/${memoryId}`);
  revalidatePath(`/${locale}/app/memories`);
}

export async function updateMemory(
  _previous: MemoryEditState,
  formData: FormData,
): Promise<MemoryEditState> {
  // Resolved first and independently: the validation failure below happens
  // before the schema succeeds and still has to be localized (ADR-036).
  const locale = resolveLocale(formData.get("locale"));

  const fields = submittedFields(formData);
  const parsed = memoryUpdateSchema.safeParse(fields);
  if (!parsed.success) return failed(locale, "invalidInput", fields);
  const { memoryId, content, kind, sensitivity, important, personId, projectId } = parsed.data;

  const { supabase, user } = await requireUser(parsed.data.locale);

  const before = await supabase
    .from("memories")
    .select(AUDITED_COLUMNS)
    .eq("id", memoryId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (before.error) return failed(locale, "saveFailed");
  if (!before.data) return failed(locale, "notFound");

  // Re-embed only when the text actually changed. An edit that only re-files a
  // memory under a different kind has the same meaning and should not spend a
  // provider call — or risk replacing a good vector on a flaky one.
  const reEmbedded = before.data.content === content
    ? undefined
    : await embedMemory(supabase, user.id, content, parsed.data.locale);

  const { data: after, error } = await supabase
    .from("memories")
    .update({
      content,
      kind,
      sensitivity,
      important,
      person_id: personId,
      project_id: projectId,
      updated_at: new Date().toISOString(),
      ...(reEmbedded ?? {}),
    })
    .eq("id", memoryId)
    .eq("user_id", user.id)
    .select(AUDITED_COLUMNS)
    .maybeSingle();

  if (error) return failed(locale, isUnknownRelation(error) ? "unknownRelation" : "saveFailed", fields);
  // A row that passed the pre-read and matched nothing here was removed in
  // between. Reported as gone rather than as a generic failure.
  if (!after) return failed(locale, "notFound");

  await audit(supabase, user.id, memoryId, "update_memory", before.data, after, "Owner edited the memory from its detail page");

  revalidateMemory(parsed.data.locale, memoryId);
  return { status: "success", message: getMemoryCopy(locale).saved, submitted: null };
}

/**
 * Archive or reactivate — the two named transitions, and no third.
 *
 * The owner is choosing "this stopped being true", not authoring a timestamp.
 * Letting the client post an arbitrary `valid_until` would make the audit row's
 * meaning depend on input nobody validated, so the instant is stamped here.
 */
export async function setMemoryLifecycle(
  _previous: MemoryEditState,
  formData: FormData,
): Promise<MemoryEditState> {
  const locale = resolveLocale(formData.get("locale"));

  const parsed = memoryLifecycleSchema.safeParse(submittedFields(formData));
  if (!parsed.success) return failed(locale, "invalidInput");
  const { memoryId, transition } = parsed.data;

  const { supabase, user } = await requireUser(parsed.data.locale);

  const before = await supabase
    .from("memories")
    .select(AUDITED_COLUMNS)
    .eq("id", memoryId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (before.error) return failed(locale, "saveFailed");
  if (!before.data) return failed(locale, "notFound");

  const validUntil = transition === "archive" ? new Date().toISOString() : null;
  const { data: after, error } = await supabase
    .from("memories")
    .update({ valid_until: validUntil, updated_at: new Date().toISOString() })
    .eq("id", memoryId)
    .eq("user_id", user.id)
    .select(AUDITED_COLUMNS)
    .maybeSingle();

  if (error) return failed(locale, "saveFailed");
  if (!after) return failed(locale, "notFound");

  await audit(
    supabase,
    user.id,
    memoryId,
    transition === "archive" ? "archive_memory" : "restore_memory",
    before.data,
    after,
    transition === "archive"
      ? "Owner archived the memory, ending its validity"
      : "Owner reactivated the memory, clearing its end date",
  );

  revalidateMemory(parsed.data.locale, memoryId);
  const copy = getMemoryCopy(locale);
  return {
    status: "success",
    message: transition === "archive" ? copy.archived : copy.restored,
    submitted: null,
  };
}

/**
 * Persist a memory the composer proposed and the owner confirmed (DEC-5).
 *
 * The confirmation *is* the authorization, and this is the only path from the
 * composer to `public.memories`. Three properties make that safe to say:
 *
 * 1. **Nothing reaches here unconfirmed.** The composer's memory branch renders
 *    a proposal and persists nothing; this action runs only from the confirm
 *    control on that proposal.
 * 2. **The payload is re-validated, not trusted.** A proposal produced it, but
 *    the submission is a form post like any other and is parsed by the same
 *    strict schema.
 * 3. **No model decided anything.** Detection and normalization are
 *    deterministic (`memory-intent.ts`, `memory-proposal.ts`), so this is the
 *    owner's own words stored at their own instruction — not an AI→domain write,
 *    and it needs no new contract to authorize one.
 *
 * `source_entry_id` stays null: a memory born in conversation has no originating
 * entry, and naming a provenance that does not exist would be worse than the
 * detail page saying plainly that the owner created it.
 */
export async function createProposedMemory(
  _previous: MemoryProposalState,
  formData: FormData,
): Promise<MemoryProposalState> {
  const locale = resolveLocale(formData.get("locale"));
  const copy = getMemoryCopy(locale);

  const parsed = memoryProposalSchema.safeParse(submittedFields(formData));
  if (!parsed.success) return { status: "error", message: copy.proposalEmpty, memoryId: null };
  const { content, kind } = parsed.data;

  const { supabase, user } = await requireUser(parsed.data.locale);

  // Idempotency, without a column to enforce it. A double-submit — an
  // impatient second click, a resubmitted form — must not leave the owner with
  // the same sentence stored twice, and `memories` has no unique index to lean
  // on. Matching on exact content within the owner's own rows is the narrowest
  // rule that cannot merge two genuinely different memories, and it makes the
  // second submission report the first one's row rather than a failure.
  const existing = await supabase
    .from("memories")
    .select("id")
    .eq("user_id", user.id)
    .eq("content", content)
    .limit(1)
    .maybeSingle();
  if (existing.error) return { status: "error", message: copy.saveFailed, memoryId: null };
  if (existing.data) {
    return { status: "duplicate", message: copy.proposalDuplicate, memoryId: existing.data.id };
  }

  const embedded = await embedMemory(supabase, user.id, content, parsed.data.locale);

  const { data: created, error } = await supabase
    .from("memories")
    .insert({
      user_id: user.id,
      content,
      kind,
      // `confidence` is not offered to the owner and is not rendered anywhere
      // this slice touches (UX-10): a hand-written memory is not a probabilistic
      // claim, and showing "100%" beside it invited a reading the number could
      // never support. The column keeps its default for the extraction path that
      // does populate it meaningfully.
      ...(embedded ?? {}),
    })
    .select("id")
    .maybeSingle();

  if (error || !created) return { status: "error", message: copy.saveFailed, memoryId: null };

  await audit(
    supabase,
    user.id,
    created.id,
    "create_memory",
    null,
    { content, kind },
    // The one expression `origin` reaches. Two callers write identically and
    // the trail must not claim the assistant proposed a sentence the owner
    // typed on the memories page.
    parsed.data.origin === "memories"
      ? "Owner wrote a memory from the memories page"
      : "Owner confirmed a memory proposed by the assistant composer",
  );

  revalidateMemory(parsed.data.locale, created.id);
  return { status: "success", message: copy.proposalCreated, memoryId: created.id };
}

/**
 * `2K-ACT-008` / `2K-ACT-009` — undo a memory from the conversation that
 * created it, by **archiving** it (OD-2K-3).
 *
 * ## This delegates; it does not implement
 *
 * The whole body below is a translation between two state shapes. The write,
 * the ownership predicate, the audit row with its before and after states and
 * the revalidation all belong to `setMemoryLifecycle`, which already exists and
 * is already the product's answer to "this stopped being true". A second write
 * path here would be a second place the transition is decided, and it would
 * need its own ownership proof — which is exactly the shape of defect this
 * repository has paid for before.
 *
 * ## Why no migration
 *
 * OD-2K-C's ceiling is one migration, destined for telemetry. Registering a
 * handler in `undo_operation` would spend it, and the archive transition
 * already gives a truthful undo without one. So this reuses it and the budget
 * stays where it was.
 *
 * ## What it does not do
 *
 * It does not delete, and there is no branch here that could: the transition is
 * `MEMORY_UNDO_TRANSITION`, a constant, and `memoryLifecycleSchema` admits only
 * `archive` and `restore`. The disclosure is `copy.conversationalUndone`, which
 * is asserted in both locales to contain no deletion wording.
 */
export async function undoProposedMemory(
  _previous: MemoryProposalState,
  formData: FormData,
): Promise<MemoryProposalState> {
  const locale = resolveLocale(formData.get("locale"));
  const copy = getMemoryCopy(locale);
  const memoryId = formData.get("memoryId");
  if (typeof memoryId !== "string" || memoryId === "") {
    return { status: "error", message: copy.saveFailed, memoryId: null };
  }

  // `restore` is reachable only as the undo of the undo, and only because
  // `setMemoryLifecycle` implements it as the audited, owner-scoped inverse
  // (`memoryUndoIsReversible`). Anything else falls back to the archive, so a
  // tampered value cannot become a third transition.
  const requested = formData.get("transition") === "restore"
    ? "restore"
    : MEMORY_UNDO_TRANSITION;

  const request = new FormData();
  request.set("memoryId", memoryId);
  request.set("transition", requested);
  request.set("locale", locale);

  const result = await setMemoryLifecycle(idleMemoryEditState, request);
  if (result.status !== "success") {
    return { status: "error", message: result.message, memoryId };
  }
  return {
    status: "success",
    message: requested === "restore" ? copy.conversationalRestored : copy.conversationalUndone,
    memoryId,
  };
}
