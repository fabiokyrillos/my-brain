import "server-only";
import { z } from "zod";
import { requireSupabaseData } from "@/lib/supabase/result";
import type { createClient } from "@/lib/supabase/server";
import {
  buildQuestionSuggestions,
  type QuestionSuggestion,
  type QuestionSuggestionLocale,
} from "./question-suggestions";

// Phase 2D Slice 2D.3 — read-only source and predicted-effect projection.
//
// Strictly non-mutating: it issues owner-scoped SELECTs only, calls no RPC,
// enqueues no job, writes no audit/undo row, and never touches the immutable
// interpretation. It returns bounded DTOs — never a raw database row and
// never raw interpretation JSON — so the client components receive only the
// approved fields. Question, reason, entry, and summary text stay untrusted
// display data, rendered through normal React text escaping.

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export const QUESTION_SOURCE_EXCERPT_MAX_LENGTH = 280;

export type QuestionSourceView = {
  questionId: string;
  entryId: string;
  question: string;
  reason: string;
  candidateIndex: number;
  entryExcerpt: string;
  entryExcerptTruncated: boolean;
  entryCreatedAt: string;
  entryOccurredAt: string;
  interpretationVersion: number;
  interpretationCreatedAt: string;
  interpretationSummary: string;
  isCurrent: boolean;
};

// The closed consequence taxonomy the PRD approves (`none`, `reinterpret`).
// `willMutate` is the literal `false`: the preview itself never mutates, and a
// `reinterpret` preview describes only what a later, separately authorized
// confirmation could apply — nothing is selectable or applied in this slice.
export type QuestionEffectPreview = {
  kind: "none" | "reinterpret";
  title: string;
  description: string;
  notice: string;
  willMutate: false;
};

export type QuestionPreview = {
  source: QuestionSourceView;
  effect: QuestionEffectPreview;
  suggestions: QuestionSuggestion[];
};

const effectCopy = {
  "pt-BR": {
    reinterpret: {
      title: "Se você confirmar a reinterpretação",
      description:
        "Este registro será reinterpretado usando a sua resposta, gerando uma nova revisão da interpretação. As interpretações anteriores continuam preservadas no histórico. Responder sem confirmar apenas registra a resposta.",
    },
    none: {
      title: "Nada mudaria",
      description:
        "A interpretação desta pergunta não é mais a atual, então nenhuma consequência pode ser aplicada.",
    },
    notice: "Nada foi aplicado ainda. Esta é apenas uma previsão.",
  },
  en: {
    reinterpret: {
      title: "If you confirm the reinterpretation",
      description:
        "This record will be re-interpreted using your answer, producing a new interpretation revision. Earlier interpretations stay preserved in history. Answering without confirming only records the answer.",
    },
    none: {
      title: "Nothing would change",
      description:
        "This question's interpretation is no longer the current one, so no consequence can be applied.",
    },
    notice: "Nothing has been applied yet. This is only a prediction.",
  },
} as const;

// Pure and deterministic: the preview depends only on whether the question's
// interpretation is still the entry's current one.
export function toQuestionEffectPreview(
  isCurrent: boolean,
  locale: QuestionSuggestionLocale,
): QuestionEffectPreview {
  const copy = effectCopy[locale] ?? effectCopy["pt-BR"];
  const kind = isCurrent ? "reinterpret" : "none";
  return {
    kind,
    title: copy[kind].title,
    description: copy[kind].description,
    notice: copy.notice,
    willMutate: false,
  };
}

// AI-produced interpretation JSON is untrusted stored content: parse it
// tolerantly, keep only the bounded `name`, and fall back to nothing rather
// than inventing an option.
const entityNamesSchema = z.array(z.object({ name: z.string() }));

function entityNames(value: unknown): string[] {
  const parsed = entityNamesSchema.safeParse(value);
  return parsed.success ? parsed.data.map((entity) => entity.name) : [];
}

function excerpt(value: unknown): { text: string; truncated: boolean } {
  const collapsed = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (collapsed.length <= QUESTION_SOURCE_EXCERPT_MAX_LENGTH) {
    return { text: collapsed, truncated: false };
  }
  return { text: collapsed.slice(0, QUESTION_SOURCE_EXCERPT_MAX_LENGTH), truncated: true };
}

const questionRowSchema = z.object({
  id: z.string(),
  entry_id: z.string(),
  interpretation_id: z.string(),
  candidate_index: z.number().int(),
  question: z.string(),
  reason: z.string(),
});

const entryRowSchema = z.object({
  id: z.string(),
  original_content: z.string(),
  created_at: z.string(),
  occurred_at: z.string(),
  current_interpretation_id: z.string().nullable(),
});

const interpretationRowSchema = z.object({
  id: z.string(),
  entry_id: z.string(),
  version: z.number().int(),
  summary: z.string(),
  created_at: z.string(),
  extracted_people: z.unknown(),
  extracted_projects: z.unknown(),
  extracted_organizations: z.unknown(),
  extracted_contexts: z.unknown(),
});

function indexById<Row extends { id: string }>(rows: readonly Row[]): Map<string, Row> {
  return new Map(rows.map((row) => [row.id, row]));
}

function parseRows<Schema extends z.ZodType>(schema: Schema, rows: unknown): z.infer<Schema>[] {
  if (!Array.isArray(rows)) return [];
  const parsed: z.infer<Schema>[] = [];
  for (const row of rows) {
    const result = schema.safeParse(row);
    if (result.success) parsed.push(result.data);
  }
  return parsed;
}

/**
 * Loads bounded, owner-scoped source + predicted-effect + deterministic
 * suggestion projections for the given pending questions.
 *
 * A question is projected only when the caller owns the question, its entry,
 * and its interpretation, and the interpretation genuinely belongs to that
 * entry. Anything else is silently absent from the map — a cross-owner or
 * missing question is indistinguishable.
 */
export async function loadQuestionPreviews(
  supabase: SupabaseClient,
  userId: string,
  questionIds: readonly string[],
  locale: QuestionSuggestionLocale,
): Promise<Map<string, QuestionPreview>> {
  const previews = new Map<string, QuestionPreview>();
  const uniqueQuestionIds = [...new Set(questionIds)];
  if (uniqueQuestionIds.length === 0) return previews;

  const questionResult = await supabase
    .from("pending_questions")
    .select("id,entry_id,interpretation_id,candidate_index,question,reason")
    .eq("user_id", userId)
    .in("id", uniqueQuestionIds);
  const questions = parseRows(
    questionRowSchema,
    requireSupabaseData(questionResult, "load pending question sources"),
  );
  if (questions.length === 0) return previews;

  const entryIds = [...new Set(questions.map((question) => question.entry_id))];
  const interpretationIds = [...new Set(questions.map((question) => question.interpretation_id))];

  const [entryResult, interpretationResult] = await Promise.all([
    supabase
      .from("entries")
      .select("id,original_content,created_at,occurred_at,current_interpretation_id")
      .eq("user_id", userId)
      .in("id", entryIds),
    supabase
      .from("entry_interpretations")
      .select(
        "id,entry_id,version,summary,created_at,extracted_people,extracted_projects,extracted_organizations,extracted_contexts",
      )
      .eq("user_id", userId)
      .in("id", interpretationIds),
  ]);

  const entries = indexById(
    parseRows(entryRowSchema, requireSupabaseData(entryResult, "load question source entries")),
  );
  const interpretations = indexById(
    parseRows(
      interpretationRowSchema,
      requireSupabaseData(interpretationResult, "load question source interpretations"),
    ),
  );

  for (const question of questions) {
    const entry = entries.get(question.entry_id);
    const interpretation = interpretations.get(question.interpretation_id);
    if (!entry || !interpretation) continue;
    // Provenance consistency: the question's interpretation must belong to the
    // question's own entry.
    if (interpretation.entry_id !== entry.id) continue;

    const entryExcerpt = excerpt(entry.original_content);
    const summaryExcerpt = excerpt(interpretation.summary);
    const isCurrent = entry.current_interpretation_id === interpretation.id;

    previews.set(question.id, {
      source: {
        questionId: question.id,
        entryId: entry.id,
        question: question.question,
        reason: question.reason,
        candidateIndex: question.candidate_index,
        entryExcerpt: entryExcerpt.text,
        entryExcerptTruncated: entryExcerpt.truncated,
        entryCreatedAt: entry.created_at,
        entryOccurredAt: entry.occurred_at,
        interpretationVersion: interpretation.version,
        interpretationCreatedAt: interpretation.created_at,
        interpretationSummary: summaryExcerpt.text,
        isCurrent,
      },
      effect: toQuestionEffectPreview(isCurrent, locale),
      suggestions: buildQuestionSuggestions({
        question: question.question,
        locale,
        people: entityNames(interpretation.extracted_people),
        projects: entityNames(interpretation.extracted_projects),
        organizations: entityNames(interpretation.extracted_organizations),
        contexts: entityNames(interpretation.extracted_contexts),
      }),
    });
  }

  return previews;
}

/**
 * Server-owned re-derivation of the deterministic options for one question.
 * The Server Action uses this to authenticate suggestion provenance: a client
 * can never forge "answered from a suggestion" because the options are
 * regenerated here, from owned data, and compared against the submitted answer.
 */
export async function loadQuestionSuggestions(
  supabase: SupabaseClient,
  userId: string,
  questionId: string,
  locale: QuestionSuggestionLocale,
): Promise<QuestionSuggestion[]> {
  const previews = await loadQuestionPreviews(supabase, userId, [questionId], locale);
  return previews.get(questionId)?.suggestions ?? [];
}
