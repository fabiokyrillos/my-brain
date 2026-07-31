import "server-only";

import type { createClient } from "@/lib/supabase/server";

// The two filters and the disposition vocabulary live together in
// `question-visibility.ts`, because they are only correct as a pair: between
// them they must cover every `pending_questions` state exactly once.
import {
  resolvedPendingQuestionFilter,
  toQuestionDisposition,
  type QuestionDisposition,
} from "./question-visibility";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * What happened after the owner answered (UX-11).
 *
 * The finding is not that the after-state is missing — it is **fully recorded
 * and never shown**. `pending_questions` has stored `answer`, `answered_at` and
 * `status` since `202607160007`, and `resolve_pending_question_v3` writes two
 * distinguishable audit rows. The queue simply filtered the row out
 * (`actionablePendingQuestionFilter`) and the user watched their answer vanish.
 *
 * So this is a **projection over existing rows**. Nothing here writes, and
 * `resolve_pending_question_v3` is consumed unchanged.
 */

export type QuestionOutcomeView = {
  readonly questionId: string;
  readonly question: string;
  readonly reason: string;
  readonly disposition: QuestionDisposition;
  /** What the owner actually wrote. `null` for a dismissal or a deferral. */
  readonly answer: string | null;
  readonly answeredAt: string | null;
  readonly deferredUntil: string | null;
  /** Where the decision is permanently recorded, and where it took effect. */
  readonly entryId: string;
  /**
   * Whether the answer re-ran the interpretation.
   *
   * Read from the audit row the RPC writes *only when a consequence was
   * applied* (`question_consequence_confirmed`), rather than inferred from the
   * answer's presence — a plain answer with `consequence: "none"` changes the
   * record and does not re-interpret it, and telling the owner otherwise would
   * describe work that never happened.
   */
  readonly reinterpreted: boolean;
};

type QuestionRow = {
  id: string;
  question: string;
  reason: string;
  status: string;
  answer: string | null;
  answered_at: string | null;
  snoozed_until: string | null;
  entry_id: string;
};

/**
 * Resolved questions for one page, with what each one changed.
 *
 * The audit read is a second query rather than a join because `audit_logs` is
 * append-only and owner-scoped by RLS, and because a failure to read it must
 * not cost the owner the outcome list: on error every row simply reports
 * `reinterpreted: false`, which is the truthful reading when this process
 * cannot say otherwise.
 */
export async function loadResolvedQuestions(
  supabase: SupabaseClient,
  { from, to }: { readonly from: number; readonly to: number },
): Promise<readonly QuestionOutcomeView[]> {
  const { data, error } = await supabase
    .from("pending_questions")
    .select("id,question,reason,status,answer,answered_at,snoozed_until,entry_id")
    .or(resolvedPendingQuestionFilter())
    .order("answered_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (error || !data) return [];
  const rows = data as QuestionRow[];
  if (rows.length === 0) return [];

  const confirmed = await supabase
    .from("audit_logs")
    .select("entity_id")
    .eq("entity_type", "pending_question")
    .eq("action_type", "question_consequence_confirmed")
    .in("entity_id", rows.map((row) => row.id));

  const reinterpretedIds = new Set(
    (confirmed.data ?? []).map((row) => (row as { entity_id: string }).entity_id),
  );

  return rows.map((row) => ({
    questionId: row.id,
    question: row.question,
    reason: row.reason,
    disposition: toQuestionDisposition(row.status),
    answer: row.answer,
    answeredAt: row.answered_at,
    deferredUntil: row.status === "snoozed" ? row.snoozed_until : null,
    entryId: row.entry_id,
    reinterpreted: reinterpretedIds.has(row.id),
  }));
}
