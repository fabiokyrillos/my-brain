import "server-only";

/**
 * `2K-PRIVACY-004`, `2K-SRC-004` — the render-time re-read.
 *
 * ## What this replaces
 *
 * The thread used to render a stored 220-character excerpt. That copy could not
 * be kept in step with the row it quoted: reclassify the entry, archive the
 * memory, edit its text, and the excerpt was unchanged and still in the clear.
 * OD-2K-2 removed the copy, so the source has to be **read again, now**.
 *
 * ## Why the classification cannot go stale
 *
 * Because it is never stored. Every render asks the row for its current
 * `sensitivity` and hands it to the central contract through
 * `readOnlyPreviewCard`, which fails **closed** on an unreadable value. A source
 * reclassified after the answer was written is therefore masked on the next
 * view **by construction** — there is no second copy that could disagree.
 *
 * ## Bounded, and batched
 *
 * One query per source **table**, never one per source. The thread renders at
 * most 200 messages and a message carries at most 20 references, so an
 * unbatched implementation would be a fan-out the plan names as its stopping
 * condition. The fix for latency is more batching; it is never falling back to
 * the stored copy, which no longer exists.
 *
 * ## Lifecycle is part of readability
 *
 * An archived memory renders **unavailable**, not in the clear. Since Phase 2N
 * slice 2N.3 (`202608130093`, migration M1) `match_internal_knowledge` refuses
 * to *retrieve* one at all, applying the validity window ahead of its own
 * bound; this module shares `isMemoryInForce` with that SQL predicate and with
 * the badge the owner reads, so none of the three can disagree about what "in
 * force" means.
 *
 * This check is **not** redundant with that one, and it is the reason the two
 * are separate concerns rather than one. Retrieval decides what may be used to
 * answer a NEW question. This decides what a message ALREADY ANSWERED may still
 * show — and a memory archived after that answer was written was legitimately
 * retrieved at the time. Only a render-time read can catch it.
 */

import { isMemoryInForce } from "@/features/memories/lifecycle";
import { SENSITIVITY_LEVELS } from "@/features/sensitivity/contracts";
import { deriveTaskSensitivity, isDerivedLevel } from "@/features/sensitivity/task-derivation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { Locale } from "@/lib/preferences";

import { readOnlyPreviewCard, unavailableCard, type ConversationCard } from "@/features/conversation-cards/contracts";

import type { ParsedCitations, PersistedSourceReference, SupportKind } from "./contracts";

/**
 * What a cited task or reminder says about time, beyond its title (ADR-190):
 * a task's deadline (and whether it has passed or the task is done), a
 * reminder's hour. `null` when the row carries none.
 */
export type SourceWhen =
  | { readonly kind: "due"; readonly at: string }
  | { readonly kind: "overdue"; readonly at: string }
  | { readonly kind: "planned"; readonly at: string }
  | { readonly kind: "done" }
  | { readonly kind: "remind"; readonly at: string };

export type ResolvedSource = {
  readonly key: string;
  readonly support: SupportKind;
  /** Already carrying the current classification; the renderer only draws it. */
  readonly card: ConversationCard;
  /**
   * `2K-SRC-004` — when the evidence is from.
   *
   * `occurred_at` for an entry, `valid_from ?? created_at` for a memory —
   * exactly what `match_internal_knowledge` reports, so the freshness the user
   * reads is the freshness retrieval ranked on. `null` when the row does not
   * carry one, and **absent rather than fabricated**: a made-up date on a
   * source is the preview's first lie in a different costume.
   */
  readonly occurredAt: string | null;
  /** Tasks and reminders only. Absent on every other kind. */
  readonly when?: SourceWhen | null;
};

function entryHref(locale: Locale, id: string) {
  return `/${locale}/app/inbox/${id}`;
}

function memoryHref(locale: Locale, id: string) {
  return `/${locale}/app/memories/${id}`;
}

function taskHref(locale: Locale, id: string) {
  return `/${locale}/app/work/${id}`;
}

function reminderHref(locale: Locale, id: string) {
  return `/${locale}/app/reminders/${id}`;
}

/*
 * ADR-190 (reverses ADR-146 Decision 1 on the owner's authorization): a cited
 * task or reminder is read with its title, state and time — the columns the
 * agenda and knowledge answers already read (`chat/structured-sources.ts`) —
 * so its card can say what it is. Its classification is derived from its
 * source entry by the one function Tarefas uses (`deriveTaskSensitivity`), and
 * the card masks what the conversation surface masks.
 */
type TaskRow = {
  id: string;
  title: string | null;
  status: string | null;
  due_at: string | null;
  planned_at: string | null;
  source_entry_id: string | null;
  created_at: string | null;
};
type ReminderRow = {
  id: string;
  title: string | null;
  status: string | null;
  remind_at: string | null;
  entry_id: string | null;
  created_at: string | null;
};

/**
 * Resolves every reference on one message.
 *
 * Order is preserved: the answer cited them in an order, and re-sorting by
 * whatever the database returned would quietly change what the user reads.
 */
export async function resolveSources(
  supabase: SupabaseClient<Database>,
  userId: string,
  citations: ParsedCitations,
  locale: Locale,
  now: Date = new Date(),
): Promise<readonly ResolvedSource[]> {
  const references = citations.sources;
  if (references.length === 0) return [];

  const entryIds = references.filter((r) => r.type === "entry").map((r) => r.sourceId);
  const memoryIds = references.filter((r) => r.type === "memory").map((r) => r.sourceId);
  const taskIds = references.filter((r) => r.type === "task").map((r) => r.sourceId);
  const reminderIds = references.filter((r) => r.type === "reminder").map((r) => r.sourceId);

  const [entries, memories, tasks, reminders] = await Promise.all([
    entryIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase
        .from("entries")
        .select("id,original_content,sensitivity,occurred_at")
        .eq("user_id", userId)
        .in("id", entryIds),
    memoryIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase
        .from("memories")
        .select("id,content,sensitivity,valid_from,valid_until,created_at")
        .eq("user_id", userId)
        .in("id", memoryIds),
    // Title, state and time — see the task branch in `resolveOne` (ADR-190).
    taskIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase
        .from("tasks")
        .select("id,title,status,due_at,planned_at,source_entry_id,created_at")
        .eq("user_id", userId)
        .in("id", taskIds),
    // The same for a reminder: its title, state and hour (ADR-190).
    reminderIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase
        .from("reminders")
        .select("id,title,status,remind_at,entry_id,created_at")
        .eq("user_id", userId)
        .in("id", reminderIds),
  ]);

  type EntryRow = { id: string; original_content: string; sensitivity: string | null; occurred_at: string | null };
  type MemoryRow = {
    id: string;
    content: string;
    sensitivity: string | null;
    valid_from: string | null;
    valid_until: string | null;
    created_at: string | null;
  };

  // A failed read is **not** an empty read. Both produce `unavailable`, which is
  // the honest outcome: the surface cannot say anything about a row it could
  // not look at, and it must not distinguish "gone" from "unreadable".
  const entryById = new Map<string, EntryRow>(
    entries.error ? [] : ((entries.data ?? []) as EntryRow[]).map((row) => [row.id, row]),
  );
  const memoryById = new Map<string, MemoryRow>(
    memories.error ? [] : ((memories.data ?? []) as MemoryRow[]).map((row) => [row.id, row]),
  );

  const taskById = new Map<string, TaskRow>(
    tasks.error ? [] : ((tasks.data ?? []) as TaskRow[]).map((row) => [row.id, row]),
  );

  const reminderById = new Map<string, ReminderRow>(
    reminders.error ? [] : ((reminders.data ?? []) as ReminderRow[]).map((row) => [row.id, row]),
  );

  // The classifications of the entries tasks and reminders came from, owner
  // scoped. An id this does not return derives the most protective level, and a
  // failed read returns none of them — the rule Tarefas applies.
  const sourceEntryIds = [...new Set([
    ...[...taskById.values()].map((row) => row.source_entry_id),
    ...[...reminderById.values()].map((row) => row.entry_id),
  ].filter((id): id is string => typeof id === "string" && id !== ""))];
  const levels = new Map<string, string | null>();
  if (sourceEntryIds.length > 0) {
    const read = await supabase.from("entries").select("id,sensitivity").eq("user_id", userId).in("id", sourceEntryIds);
    if (!read.error) {
      for (const row of (read.data ?? []) as Array<{ id: string; sensitivity: string | null }>) {
        levels.set(row.id, row.sensitivity);
      }
    }
  }

  return references.map((reference) => resolveOne(reference, locale, now, entryById, memoryById, taskById, reminderById, levels));
}

/*
 * The level a cited task or reminder's card carries. A row typed straight into
 * the list has no source entry and nothing to derive from; Tarefas shows it,
 * so its card carries the least protective level of the closed vocabulary.
 */
function levelFor(sourceEntryId: string | null, levels: ReadonlyMap<string, string | null>): string {
  const derived = deriveTaskSensitivity(sourceEntryId, levels);
  return isDerivedLevel(derived) ? derived.level : SENSITIVITY_LEVELS[0];
}

function taskWhen(row: TaskRow, now: Date): SourceWhen | null {
  if (row.status === "done") return { kind: "done" };
  if (row.due_at) {
    return new Date(row.due_at).getTime() < now.getTime() ? { kind: "overdue", at: row.due_at } : { kind: "due", at: row.due_at };
  }
  if (row.planned_at) return { kind: "planned", at: row.planned_at };
  return null;
}

function resolveOne(
  reference: PersistedSourceReference,
  locale: Locale,
  now: Date,
  entryById: Map<string, { id: string; original_content: string; sensitivity: string | null; occurred_at: string | null }>,
  memoryById: Map<string, {
    id: string;
    content: string;
    sensitivity: string | null;
    valid_from: string | null;
    valid_until: string | null;
    created_at: string | null;
  }>,
  taskById: Map<string, TaskRow>,
  reminderById: Map<string, ReminderRow>,
  levels: ReadonlyMap<string, string | null>,
): ResolvedSource {
  const base = { key: reference.id, support: reference.support };

  if (reference.type === "entry") {
    const row = entryById.get(reference.sourceId);
    if (!row) return { ...base, card: unavailableCard("entry"), occurredAt: null };
    return {
      ...base,
      card: readOnlyPreviewCard({
        cardType: "entry",
        objectId: row.id,
        snippet: row.original_content,
        sensitivity: row.sensitivity,
        href: entryHref(locale, row.id),
      }),
      occurredAt: row.occurred_at,
    };
  }

  /*
   * `OD-2Q-1` widened the vocabulary to `entry | memory | task`, and this branch
   * is what stops that widening from breaking this resolver **silently**: a
   * `task` reference is answered from `tasks`, never looked up in `memories`
   * (the `2Q-FOUNDATION-003` defect).
   *
   * ADR-146 resolved a cited task content-free; ADR-190 reverses that on the
   * owner's authorization, so the card under an answer can say *which* task it
   * is. The title is the snippet; the classification is derived from the
   * task's source entry by `deriveTaskSensitivity`, so the card masks exactly
   * what the conversation surface masks. The review page keeps its own
   * content-free resolver (`OD-2Q-5` option C) — this changes chat only.
   *
   * A task that is gone, foreign or unreadable gets the same `unavailable`
   * shape a deleted entry gets, with no branch telling the three apart.
   */
  if (reference.type === "task") {
    const row = taskById.get(reference.sourceId);
    if (!row) return { ...base, card: unavailableCard("task"), occurredAt: null };
    return {
      ...base,
      card: readOnlyPreviewCard({
        cardType: "task",
        objectId: row.id,
        snippet: row.title,
        sensitivity: levelFor(row.source_entry_id, levels),
        href: taskHref(locale, row.id),
      }),
      occurredAt: row.created_at,
      when: taskWhen(row, now),
    };
  }

  /*
   * Life Brain B.2 (`LB-B-006`, ADR-147). A cited reminder, on the task's terms
   * (ADR-190): its title, its hour, a link to its page, and the same
   * `unavailable` shape for gone, foreign or unreadable.
   */
  if (reference.type === "reminder") {
    const row = reminderById.get(reference.sourceId);
    if (!row) return { ...base, card: unavailableCard("reminder"), occurredAt: null };
    return {
      ...base,
      card: readOnlyPreviewCard({
        cardType: "reminder",
        objectId: row.id,
        snippet: row.title,
        sensitivity: levelFor(row.entry_id, levels),
        href: reminderHref(locale, row.id),
      }),
      occurredAt: row.created_at,
      when: row.remind_at ? { kind: "remind", at: row.remind_at } : null,
    };
  }

  const row = memoryById.get(reference.sourceId);
  if (!row) return { ...base, card: unavailableCard("memory"), occurredAt: null };
  // An archived memory is unreadable *as a source*, and says so with the same
  // shape a deleted one uses. Anything else would let a memory the owner
  // withdrew keep appearing under an answer that used it.
  if (!isMemoryInForce({ valid_from: row.valid_from, valid_until: row.valid_until }, now)) {
    return { ...base, card: unavailableCard("memory"), occurredAt: null };
  }
  return {
    ...base,
    card: readOnlyPreviewCard({
      cardType: "memory",
      objectId: row.id,
      snippet: row.content,
      sensitivity: row.sensitivity,
      href: memoryHref(locale, row.id),
    }),
    occurredAt: row.valid_from ?? row.created_at,
  };
}
