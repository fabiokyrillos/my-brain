import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { openAiGate } from "@/lib/byok/gate";
import { getAIProvider } from "@/lib/ai";
import { SUGGESTION_PICK_PROMPT_VERSION } from "@/lib/ai/suggestion-pick-schema";
import { recordAIUsage } from "@/lib/ai/usage";
import type { Locale } from "@/lib/preferences";
import type { Database } from "@/lib/supabase/database.types";

import {
  MAX_SUGGESTIONS,
  SUGGESTION_CATEGORIES,
  type ConversationSuggestion,
  type SuggestionPick,
} from "./suggestions";

/**
 * Life Brain B.8 (ADR-163) — the model picks today's conversation suggestions.
 *
 * ## What the model can and cannot do
 *
 * It receives the candidates `suggestionCandidates` offers, the same rows under
 * the same sensitivity rule the date derivation reads, and answers with
 * positions in that list. Positions become `{category, id}` pairs here, and
 * those pairs are all the cache holds. The sentence a chip shows is still built
 * from `copy.byCategory` and the row's own current name at render time, so the
 * model chooses among the owner's own things and cannot write a word the owner
 * sees (`2K-SUGG-005` holds by construction).
 *
 * ## Why the page never waits for this
 *
 * Conversar renders the derived suggestions first. This runs from a Server
 * Action the page fires once after it loads, when today has no cached pick.
 * The next visit the same day reads the cache.
 *
 * ## Every failure looks like the date rules
 *
 * No key, a refused or rate-limited provider, an unparseable answer: the owner
 * sees the derived suggestions and no message. A failed call still writes an
 * empty pick for the day, so a provider that is down is asked once a day, not
 * once a visit. A missing key writes nothing, because there was no call.
 */

const pickSchema = z.object({
  category: z.enum(SUGGESTION_CATEGORIES),
  // The same pattern the database writer checks; zod 4's `uuid()` also
  // demands a version nibble, which would make the two gates disagree.
  id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
});
const storedPicksSchema = z.array(pickSchema).max(MAX_SUGGESTIONS);

/**
 * Today's cached pick; `null` when today has none yet; `undefined` when the
 * cache cannot be read at all. An empty array is a real answer: the model chose
 * nothing, or the day's one attempt failed.
 *
 * `undefined` is its own state for one reason: a cache that cannot be read
 * cannot be written either (a deployment ahead of `202611090109`, a database
 * fault), and asking the model then would ask it on every visit, since no
 * answer could ever be stored. Unreadable means no call.
 */
export async function readTodaysPicks(
  supabase: SupabaseClient<Database>,
  localDay: string,
): Promise<readonly SuggestionPick[] | null | undefined> {
  const { data, error } = await supabase
    .from("conversation_suggestion_picks")
    .select("local_day, picks")
    .maybeSingle();
  if (error) return undefined;
  if (!data || data.local_day !== localDay) return null;
  const parsed = storedPicksSchema.safeParse(data.picks);
  return parsed.success ? parsed.data : [];
}

export type PickOutcome =
  | "nothing_to_choose"
  | "cache_unavailable"
  | "already_picked"
  | "no_key"
  | "picked"
  | "failed";

/**
 * Asks the model once for today, unless today already has an answer.
 *
 * `candidates` must come from `suggestionCandidates` on rows read under the
 * caller's RLS; a client never supplies them.
 */
export async function pickTodaysSuggestions(input: {
  readonly supabase: SupabaseClient<Database>;
  readonly userId: string;
  readonly locale: Locale;
  readonly localDay: string;
  readonly candidates: readonly ConversationSuggestion[];
}): Promise<PickOutcome> {
  const { supabase, userId, locale, localDay, candidates } = input;
  // Three or fewer candidates leave nothing to choose: the derivation already
  // shows them all, so a call would only cost.
  if (candidates.length <= MAX_SUGGESTIONS) return "nothing_to_choose";
  const cached = await readTodaysPicks(supabase, localDay);
  if (cached === undefined) return "cache_unavailable";
  if (cached !== null) return "already_picked";

  const gate = await openAiGate(supabase, userId);
  if (!gate.ok) return "no_key";

  const preferences = await supabase
    .from("agent_preferences")
    .select("background_model")
    .eq("user_id", userId)
    .maybeSingle();
  const model = preferences.data?.background_model ?? "gpt-5-mini";

  try {
    const provider = getAIProvider({ credential: gate.credential.secret, model });
    const answer = await provider.pickSuggestions({
      locale,
      localDay,
      candidates: candidates.map((candidate) => ({ kind: candidate.category, label: candidate.name })),
    });
    // The ledger first, before the domain write, as every AI call in the product.
    await recordAIUsage(supabase, {
      operation: "background",
      model: answer.model,
      userId,
      usage: answer,
      // `ai_usage_events.source_type` admits five values and none of them is
      // "suggestions"; the operation `background` is what attributes this spend.
      sourceType: null,
      sourceId: null,
    });
    const picks = answer.indexes
      .map((index) => candidates[index])
      .filter((candidate): candidate is ConversationSuggestion => candidate !== undefined)
      .map((candidate) => ({ category: candidate.category, id: candidate.id }));
    await recordPicks(supabase, localDay, picks, answer.model);
    return "picked";
  } catch {
    await recordPicks(supabase, localDay, [], model);
    return "failed";
  }
}

async function recordPicks(
  supabase: SupabaseClient<Database>,
  localDay: string,
  picks: readonly SuggestionPick[],
  model: string,
): Promise<void> {
  // Best effort: a cache that failed to write costs one more call tomorrow at
  // worst, never a broken page.
  await supabase.rpc("record_conversation_suggestion_picks", {
    p_local_day: localDay,
    p_picks: picks.map((pick) => ({ category: pick.category, id: pick.id })),
    p_model: model,
    p_prompt_version: SUGGESTION_PICK_PROMPT_VERSION,
  });
}
