import "server-only";

/**
 * Life Brain C.3 (ADR-152) — what a record proposes for the agenda, and what of
 * it is already there.
 *
 * The candidates are read from the current reading's `raw_output` (no column,
 * `LIFE_DATA_MODEL.md` §3), each parsed on its own so one malformed candidate
 * never hides the others, and keep their index — the index is what the
 * confirmation names. A candidate that already became an event (in any status)
 * is no longer pending. Both reads are owner-scoped by RLS.
 */

import { eventCandidateSchema } from "@/lib/ai/extraction-schema";
import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type PendingEventCandidate = {
  readonly candidateIndex: number;
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string | null;
  readonly allDay: boolean;
  readonly location: string | null;
};

export type AgendaEvent = {
  readonly id: string;
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string | null;
  readonly allDay: boolean;
  readonly status: "confirmed" | "cancelled";
};

export type EntryEvents = {
  readonly pending: readonly PendingEventCandidate[];
  readonly onAgenda: readonly AgendaEvent[];
};

const NONE: EntryEvents = { pending: [], onAgenda: [] };

/** Pure: the candidates still to decide, given what became events. */
export function pendingEventCandidates(
  rawCandidates: unknown,
  decidedIndexes: ReadonlySet<number>,
): PendingEventCandidate[] {
  if (!Array.isArray(rawCandidates)) return [];
  return rawCandidates.flatMap((raw, candidateIndex) => {
    if (decidedIndexes.has(candidateIndex)) return [];
    const parsed = eventCandidateSchema.safeParse(raw);
    if (!parsed.success) return [];
    const { title, startsAt, endsAt, allDay, location } = parsed.data;
    return [{ candidateIndex, title, startsAt, endsAt, allDay, location }];
  });
}

export async function loadEntryEvents(
  supabase: SupabaseClient,
  input: { readonly entryId: string; readonly interpretationId: string },
): Promise<EntryEvents> {
  const [reading, events] = await Promise.all([
    supabase.from("entry_interpretations").select("raw_output").eq("id", input.interpretationId).eq("entry_id", input.entryId).maybeSingle(),
    supabase.from("events")
      .select("id,title,starts_at,ends_at,all_day,status,candidate_index,source_interpretation_id")
      .eq("source_entry_id", input.entryId)
      .order("starts_at", { ascending: true }),
  ]);
  if (reading.error || !reading.data || events.error) return NONE;

  const rows = events.data ?? [];
  const decided = new Set(
    rows
      .filter((row) => row.source_interpretation_id === input.interpretationId && row.candidate_index !== null)
      .map((row) => row.candidate_index as number),
  );
  const raw = reading.data.raw_output as { eventCandidates?: unknown } | null;
  return {
    pending: pendingEventCandidates(raw?.eventCandidates, decided),
    onAgenda: rows.map((row) => ({
      id: row.id,
      title: row.title,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      allDay: row.all_day,
      status: row.status === "cancelled" ? "cancelled" : "confirmed",
    })),
  };
}
