/**
 * Life Brain B.3 (`LB-B-007`, ADR-150) — the chat's retrieval call, with or
 * without a date window.
 *
 * A window goes to the four-argument `match_internal_knowledge` (LB-M3), which
 * applies it inside each arm of the union, before the bound. No window goes to
 * the two-argument one, exactly as before this slice.
 *
 * ## Why there is a fallback, and why it is this narrow
 *
 * The application deploys when its PR merges; the migration reaches the hosted
 * database when the owner authorizes it (LB-X-002). In between, the windowed
 * signature does not exist there, and PostgREST answers `PGRST202`. A chat that
 * failed every "o que fiz semana passada?" in that interval would be a
 * regression this slice caused, so that one code — and only that one — falls
 * back to the unwindowed retrieval, which is what the question got before.
 * Every other error is the caller's to raise, unchanged.
 */

import type { TemporalWindow } from "./temporal-window";

type RpcResult = { data: unknown; error: { code?: string } | null };

export type KnowledgeRpcClient = {
  rpc(name: "match_internal_knowledge", args: Record<string, unknown>): PromiseLike<RpcResult>;
};

export type KnowledgeRetrieval = {
  readonly matches: unknown;
  readonly matchError: { code?: string } | null;
  /** Whether the rows really are limited to the window (false after a fallback). */
  readonly windowed: boolean;
};

const SIGNATURE_MISSING = "PGRST202";

export async function retrieveKnowledge(
  client: KnowledgeRpcClient,
  input: { readonly embedding: unknown; readonly window: TemporalWindow | null; readonly count: number },
): Promise<KnowledgeRetrieval> {
  const unwindowed = async (): Promise<KnowledgeRetrieval> => {
    const { data, error } = await client.rpc("match_internal_knowledge", {
      p_query_embedding: input.embedding,
      p_match_count: input.count,
    });
    return { matches: data, matchError: error, windowed: false };
  };

  if (input.window === null) return unwindowed();

  const { data, error } = await client.rpc("match_internal_knowledge", {
    p_query_embedding: input.embedding,
    p_match_count: input.count,
    p_since: input.window.since,
    p_until: input.window.until,
  });
  if (error?.code === SIGNATURE_MISSING) return unwindowed();
  return { matches: data, matchError: error, windowed: true };
}
