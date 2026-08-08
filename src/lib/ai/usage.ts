import type { SupabaseClient } from "@supabase/supabase-js";
import type { AIUsageDetails } from "./usage-details";

export type AIOperation =
  | "capture_extraction"
  | "semantic_search"
  | "chat"
  | "review"
  | "file_analysis"
  | "advanced_reasoning"
  | "background"
  // Phase 2E command parsing. Added to the table CHECK and to the
  // `record_ai_usage` guard by migration 202607250055 — recording it as `chat`
  // would have made the phase's spend unattributable.
  | "task_command"
  /**
   * Phase 2J slice 2J.4. Added to the table CHECK **and** to `record_ai_usage`'s
   * own guard by migration `202608080085` -- the constraint alone is not the
   * enforcement, and widening only one of them rejects every call at runtime.
   *
   * There is no audio-model pricing row and transcription is billed per audio
   * minute rather than per token, so these events land with `cost_status =
   * 'unpriced'` -- a state the function already models (ADR-096).
   */
  | "transcription";

export type AIUsageEvent = {
  operation: AIOperation;
  model: string;
  userId: string;
  usage: AIUsageDetails;
  sourceType?: string | null;
  sourceId?: string | null;
};

export function buildUsageRpcArgs(event: AIUsageEvent) {
  return {
    p_operation: event.operation,
    p_model: event.model,
    p_input_tokens: event.usage.inputTokens,
    p_cached_input_tokens: event.usage.cachedInputTokens,
    p_output_tokens: event.usage.outputTokens,
    p_reasoning_tokens: event.usage.reasoningTokens,
    p_provider_request_id: event.usage.providerRequestId,
    p_source_type: event.sourceType ?? null,
    p_source_id: event.sourceId ?? null,
    p_user_id: event.userId,
  };
}

export async function recordAIUsage(supabase: SupabaseClient, event: AIUsageEvent) {
  try {
    const { error } = await supabase.rpc("record_ai_usage", buildUsageRpcArgs(event));
    if (!error) return true;
    console.error("AI usage recording failed", {
      operation: event.operation,
      model: event.model,
      code: error.code,
    });
  } catch (error) {
    console.error("AI usage recording failed", {
      operation: event.operation,
      model: event.model,
      code: error instanceof Error ? error.name : "unknown_error",
    });
  }
  return false;
}
