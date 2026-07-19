import type { SupabaseClient } from "@supabase/supabase-js";
import type { AIUsageDetails } from "./usage-details";

export type AIOperation =
  | "capture_extraction"
  | "semantic_search"
  | "chat"
  | "review"
  | "file_analysis"
  | "advanced_reasoning"
  | "background";

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
