import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import {
  deriveActivationProgress,
  type ActivationFactKey,
  type ActivationProgress,
  type ActivationReading,
} from "./contracts";

/**
 * The server-side derivation of `contracts.ts`'s five facts.
 *
 * ## Why every read is wrapped, and why they are independent
 *
 * `2O-ACTIVATION-003` says a read that failed is never rendered as a fact that
 * is false. That has two consequences this module exists to satisfy.
 *
 * **Each read is wrapped**, so a rejection becomes `{ ok: false }` rather than
 * an exception. A `Promise.all` over unwrapped reads loses the whole list to one
 * failure, and the caller would then have nothing to render but "not activated"
 * — the exact collapse the requirement forbids, arrived at from the other side.
 *
 * **Each read is independent.** One table being unreadable says nothing about
 * the other four, so four facts stay answerable and only the fifth is unknown.
 *
 * ## Why this does not call `loadCredentialMetadata`
 *
 * That function returns `ABSENT_CREDENTIAL` when the read errors — deliberately,
 * and correctly for a settings panel, because `BYOK-LIFECYCLE-001` gates AI
 * identically whether the credential is absent or unreadable. Here the two must
 * be told apart: "you have not configured a credential" is an instruction, and
 * giving it to an owner who has one is the product being confidently wrong.
 */

type Client = SupabaseClient<Database>;

/** Wraps a read so a rejection becomes the third value rather than an exception. */
async function reading(read: () => Promise<ActivationReading>): Promise<ActivationReading> {
  try {
    return await read();
  } catch {
    return { ok: false };
  }
}

/**
 * "Does this account own at least one row of `table`?"
 *
 * `select(...).limit(1)` rather than an exact count: existence is the question,
 * and a count over `entries` on a busy account pays for an answer nobody reads.
 * `eq("user_id", …)` is redundant with RLS and kept anyway — it is this
 * repository's convention, and it keeps the query correct if it is ever run by a
 * client whose scope is not the owner's.
 */
function ownsAnyRow(supabase: Client, table: "entries" | "entry_task_candidate_resolutions" | "tasks", userId: string) {
  return reading(async () => {
    const { data, error } = await supabase.from(table).select("user_id").eq("user_id", userId).limit(1);
    if (error) return { ok: false };
    return { ok: true, satisfied: (data ?? []).length > 0 };
  });
}

export async function loadActivationProgress(
  supabase: Client,
  userId: string,
): Promise<ActivationProgress> {
  const [localeAndTimezone, aiCredential, entryCaptured, interpretationReviewed, taskConfirmed] =
    await Promise.all([
      reading(async () => {
        const { data, error } = await supabase
          .from("profiles")
          .select("locale,timezone")
          .eq("user_id", userId)
          .maybeSingle();
        if (error) return { ok: false };
        // Both halves, because either alone leaves the product guessing: a
        // locale with no zone still renders every date in the wrong day.
        return { ok: true, satisfied: Boolean(data?.locale) && Boolean(data?.timezone) };
      }),
      reading(async () => {
        const { data, error } = await supabase
          .from("user_ai_credentials")
          .select("status")
          .eq("user_id", userId)
          .maybeSingle();
        if (error) return { ok: false };
        // `active` alone, matching BYOK's own gate. `invalid` and `removed` both
        // refuse every AI surface, so calling either "configured" would walk the
        // owner past the step that unblocks the product.
        return { ok: true, satisfied: data?.status === "active" };
      }),
      ownsAnyRow(supabase, "entries", userId),
      ownsAnyRow(supabase, "entry_task_candidate_resolutions", userId),
      ownsAnyRow(supabase, "tasks", userId),
    ]);

  return deriveActivationProgress({
    locale_and_timezone: localeAndTimezone,
    ai_credential: aiCredential,
    entry_captured: entryCaptured,
    interpretation_reviewed: interpretationReviewed,
    task_confirmed: taskConfirmed,
  } satisfies Record<ActivationFactKey, ActivationReading>);
}
