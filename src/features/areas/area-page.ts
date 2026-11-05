import "server-only";

import { toSensitivityLevel } from "@/features/sensitivity/contracts";
import { deriveTaskSensitivity, type TaskSensitivity } from "@/features/sensitivity/task-derivation";
import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Life Brain C.4 (ADR-154; PRD `LB-C-009`, `-010`) — what an area of life's page
 * reads: the records filed under it, its next events, and the people those
 * records name.
 *
 * ## "Filed under" means the CURRENT reading
 *
 * `entry_entities` holds one row per interpretation. A record re-read out of
 * Saúde still has the old reading's row, so membership is the link whose
 * `interpretation_id` is the entry's `current_interpretation_id` — the reading
 * the owner sees on the record. That is also what makes the count real
 * (`LB-C-009`): distinct records, not links.
 *
 * ## Bounded, and saying so
 *
 * The link read is bounded (`AREA_LINK_LIMIT`); when it fills, the page says
 * there is more rather than presenting a truncated history as the whole one.
 *
 * ## Sensitivity travels, the page decides
 *
 * A record carries its own `sensitivity`; an event derives its classification
 * from its source record (`deriveTaskSensitivity`, 2M-PRIVACY-004 — an
 * unreadable source is the most protective level). The page renders both
 * through `ProtectedContent surface="area"`.
 *
 * Every read is owner-scoped explicitly as well as by forced RLS.
 */

export const AREA_LINK_LIMIT = 400;
export const AREA_TIMELINE_LIMIT = 40;
export const AREA_EVENT_LIMIT = 10;
export const AREA_PREVIEW_CHARS = 180;
/** PostgREST puts `in.(…)` in the URL; ids are read in slices of this size. */
const ID_CHUNK = 80;

export type AreaRecord = {
  readonly id: string;
  readonly preview: string;
  readonly occurredAt: string;
  readonly sensitivity: TaskSensitivity;
};

export type AreaRecords =
  | { readonly status: "ok"; readonly records: readonly AreaRecord[]; readonly total: number; readonly bounded: boolean }
  | { readonly status: "failed" };

export type AreaEvent = {
  readonly id: string;
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string | null;
  readonly allDay: boolean;
  readonly sourceEntryId: string | null;
  readonly sensitivity: TaskSensitivity;
  /**
   * `LB-C-010` — for an event with a period, the area's records whose fact time
   * falls inside it ("what belongs to the trip"), by area and dates only, with
   * no link table.
   */
  readonly inPeriod: readonly AreaRecord[];
};

export type AreaEvents =
  | { readonly status: "ok"; readonly events: readonly AreaEvent[] }
  | { readonly status: "failed" };

export type AreaPerson = { readonly id: string; readonly name: string };

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

function previewOf(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > AREA_PREVIEW_CHARS ? `${flat.slice(0, AREA_PREVIEW_CHARS - 1).trimEnd()}…` : flat;
}

type EntryRow = {
  id: string;
  original_content: string;
  occurred_at: string;
  sensitivity: string | null;
  current_interpretation_id: string | null;
};

/**
 * The records currently filed under the area, newest fact first, and the
 * current interpretation ids that put them there (the people read needs them).
 */
export async function loadAreaRecords(
  supabase: SupabaseClient,
  userId: string,
  contextId: string,
): Promise<AreaRecords & { readonly interpretationIds?: readonly string[] }> {
  const links = await supabase
    .from("entry_entities")
    .select("entry_id,interpretation_id")
    .eq("user_id", userId)
    .eq("entity_type", "context")
    .eq("entity_id", contextId)
    .order("created_at", { ascending: false })
    .limit(AREA_LINK_LIMIT);
  if (links.error || !links.data) return { status: "failed" };

  const linkRows = links.data as readonly { entry_id: string; interpretation_id: string }[];
  const linkedBy = new Map<string, Set<string>>();
  for (const row of linkRows) {
    const set = linkedBy.get(row.entry_id) ?? new Set<string>();
    set.add(row.interpretation_id);
    linkedBy.set(row.entry_id, set);
  }
  const entryIds = [...linkedBy.keys()];
  if (entryIds.length === 0) return { status: "ok", records: [], total: 0, bounded: false, interpretationIds: [] };

  const entries: EntryRow[] = [];
  for (const slice of chunks(entryIds, ID_CHUNK)) {
    const result = await supabase
      .from("entries")
      .select("id,original_content,occurred_at,sensitivity,current_interpretation_id")
      .eq("user_id", userId)
      .in("id", slice);
    if (result.error || !result.data) return { status: "failed" };
    entries.push(...(result.data as EntryRow[]));
  }

  const current = entries
    .filter((entry) => entry.current_interpretation_id !== null
      && (linkedBy.get(entry.id)?.has(entry.current_interpretation_id) ?? false))
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || a.id.localeCompare(b.id));

  return {
    status: "ok",
    total: current.length,
    bounded: linkRows.length >= AREA_LINK_LIMIT,
    records: current.slice(0, AREA_TIMELINE_LIMIT).map((entry) => ({
      id: entry.id,
      preview: previewOf(entry.original_content),
      occurredAt: entry.occurred_at,
      // `toSensitivityLevel` fails closed on a value outside the vocabulary.
      sensitivity: { kind: "derived", level: toSensitivityLevel(entry.sensitivity) },
    })),
    interpretationIds: current.map((entry) => entry.current_interpretation_id as string),
  };
}

/**
 * The area's confirmed events that have not ended, soonest first, each with the
 * area's records inside its period.
 */
export async function loadAreaEvents(
  supabase: SupabaseClient,
  userId: string,
  contextId: string,
  now: Date,
  records: readonly AreaRecord[],
): Promise<AreaEvents> {
  const nowIso = now.toISOString();
  const result = await supabase
    .from("events")
    .select("id,title,starts_at,ends_at,all_day,source_entry_id")
    .eq("user_id", userId)
    .eq("context_id", contextId)
    .eq("status", "confirmed")
    .or(`starts_at.gte.${nowIso},ends_at.gte.${nowIso}`)
    .order("starts_at", { ascending: true })
    .limit(AREA_EVENT_LIMIT);
  if (result.error || !result.data) return { status: "failed" };

  const rows = result.data as readonly {
    id: string; title: string; starts_at: string; ends_at: string | null; all_day: boolean; source_entry_id: string | null;
  }[];
  const sourceIds = [...new Set(rows.map((row) => row.source_entry_id).filter((id): id is string => Boolean(id)))];
  const levels = new Map<string, string | null>();
  if (sourceIds.length) {
    const sources = await supabase.from("entries").select("id,sensitivity").eq("user_id", userId).in("id", sourceIds);
    // Fail closed: an unread source resolves to the most protective level.
    for (const row of (sources.error ? [] : (sources.data ?? [])) as { id: string; sensitivity: string | null }[]) {
      levels.set(row.id, row.sensitivity);
    }
  }

  return {
    status: "ok",
    events: rows.map((row) => ({
      id: row.id,
      title: row.title,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      allDay: row.all_day,
      sourceEntryId: row.source_entry_id,
      sensitivity: deriveTaskSensitivity(row.source_entry_id, levels),
      inPeriod: row.ends_at === null
        ? []
        : records.filter((record) => record.id !== row.source_entry_id
          && record.occurredAt >= row.starts_at && record.occurredAt <= row.ends_at!),
    })),
  };
}

/**
 * The people the area's current readings name, alongside the people linked to
 * the area directly (`person_contexts`). Names are structural identifiers
 * (ADR-110 Decision 2).
 */
export async function loadAreaPeople(
  supabase: SupabaseClient,
  userId: string,
  contextId: string,
  interpretationIds: readonly string[],
): Promise<readonly AreaPerson[] | null> {
  const ids = new Set<string>();
  const direct = await supabase
    .from("person_contexts")
    .select("person_id")
    .eq("user_id", userId)
    .eq("context_id", contextId)
    .is("valid_until", null)
    .limit(100);
  if (direct.error) return null;
  for (const row of (direct.data ?? []) as { person_id: string }[]) ids.add(row.person_id);

  for (const slice of chunks(interpretationIds, ID_CHUNK)) {
    const mentioned = await supabase
      .from("entry_entities")
      .select("entity_id")
      .eq("user_id", userId)
      .eq("entity_type", "person")
      .in("interpretation_id", slice)
      .limit(200);
    if (mentioned.error) return null;
    for (const row of (mentioned.data ?? []) as { entity_id: string }[]) ids.add(row.entity_id);
  }
  if (ids.size === 0) return [];

  const people: AreaPerson[] = [];
  for (const slice of chunks([...ids], ID_CHUNK)) {
    const result = await supabase.from("people").select("id,name").eq("user_id", userId).in("id", slice);
    if (result.error) return null;
    people.push(...((result.data ?? []) as AreaPerson[]));
  }
  return people.sort((a, b) => a.name.localeCompare(b.name));
}

export type AreaTask = {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly sensitivity: TaskSensitivity;
};

/** What is still open in the area: linked tasks not completed or cancelled. */
export const CLOSED_TASK_STATUSES = ["completed", "cancelled"] as const;

export async function loadAreaOpenTasks(
  supabase: SupabaseClient,
  userId: string,
  contextId: string,
): Promise<readonly AreaTask[] | null> {
  const links = await supabase.from("task_contexts").select("task_id").eq("user_id", userId).eq("context_id", contextId).limit(200);
  if (links.error) return null;
  const taskIds = [...new Set(((links.data ?? []) as { task_id: string }[]).map((row) => row.task_id))];
  if (taskIds.length === 0) return [];

  const tasks: { id: string; title: string; status: string; source_entry_id: string | null }[] = [];
  for (const slice of chunks(taskIds, ID_CHUNK)) {
    const result = await supabase
      .from("tasks")
      .select("id,title,status,source_entry_id")
      .eq("user_id", userId)
      .in("id", slice)
      .not("status", "in", `(${CLOSED_TASK_STATUSES.join(",")})`);
    if (result.error) return null;
    tasks.push(...((result.data ?? []) as typeof tasks));
  }

  const sourceIds = [...new Set(tasks.map((task) => task.source_entry_id).filter((id): id is string => Boolean(id)))];
  const levels = new Map<string, string | null>();
  for (const slice of chunks(sourceIds, ID_CHUNK)) {
    const sources = await supabase.from("entries").select("id,sensitivity").eq("user_id", userId).in("id", slice);
    for (const row of (sources.error ? [] : (sources.data ?? [])) as { id: string; sensitivity: string | null }[]) {
      levels.set(row.id, row.sensitivity);
    }
  }
  return tasks
    .map((task) => ({ id: task.id, title: task.title, status: task.status, sensitivity: deriveTaskSensitivity(task.source_entry_id, levels) }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * `LB-C-009` — how many records each area holds, by the same rule as the
 * timeline (the CURRENT reading links it), for Memória's area doors.
 *
 * One bounded read of the links for every area at once; when it fills, each
 * count is reported as "at least". `null` means the read failed, never zero.
 */
export const AREA_COUNT_LINK_LIMIT = 1000;

export type AreaCount = { readonly count: number; readonly atLeast: boolean };

export async function loadAreaCounts(
  supabase: SupabaseClient,
  userId: string,
  areaIds: readonly string[],
): Promise<ReadonlyMap<string, AreaCount> | null> {
  if (areaIds.length === 0) return new Map();
  const links = await supabase
    .from("entry_entities")
    .select("entity_id,entry_id,interpretation_id")
    .eq("user_id", userId)
    .eq("entity_type", "context")
    .in("entity_id", [...areaIds])
    .limit(AREA_COUNT_LINK_LIMIT);
  if (links.error || !links.data) return null;
  const rows = links.data as readonly { entity_id: string; entry_id: string; interpretation_id: string }[];
  const bounded = rows.length >= AREA_COUNT_LINK_LIMIT;

  const entryIds = [...new Set(rows.map((row) => row.entry_id))];
  const currentOf = new Map<string, string | null>();
  for (const slice of chunks(entryIds, ID_CHUNK)) {
    const result = await supabase.from("entries").select("id,current_interpretation_id").eq("user_id", userId).in("id", slice);
    if (result.error || !result.data) return null;
    for (const row of result.data as { id: string; current_interpretation_id: string | null }[]) {
      currentOf.set(row.id, row.current_interpretation_id);
    }
  }

  const members = new Map<string, Set<string>>();
  for (const row of rows) {
    if (currentOf.get(row.entry_id) !== row.interpretation_id) continue;
    const set = members.get(row.entity_id) ?? new Set<string>();
    set.add(row.entry_id);
    members.set(row.entity_id, set);
  }
  return new Map(areaIds.map((id) => [id, { count: members.get(id)?.size ?? 0, atLeast: bounded }]));
}

/**
 * `LB-C-011` — Ideias as a lens of Memória: the records whose CURRENT reading
 * carries the `idea` concept, newest first. A filter, not a table.
 */
export const IDEAS_LIMIT = 5;
const IDEAS_SCAN = 60;

export type IdeasResult =
  | { readonly status: "ok"; readonly records: readonly AreaRecord[] }
  | { readonly status: "failed" };

export async function loadIdeas(supabase: SupabaseClient, userId: string): Promise<IdeasResult> {
  const readings = await supabase
    .from("entry_interpretations")
    .select("id,entry_id")
    .eq("user_id", userId)
    .contains("concepts", ["idea"])
    .order("created_at", { ascending: false })
    .limit(IDEAS_SCAN);
  if (readings.error || !readings.data) return { status: "failed" };
  const rows = readings.data as readonly { id: string; entry_id: string }[];
  const entryIds = [...new Set(rows.map((row) => row.entry_id))];
  if (entryIds.length === 0) return { status: "ok", records: [] };

  const ideaReadings = new Set(rows.map((row) => row.id));
  const entries: EntryRow[] = [];
  for (const slice of chunks(entryIds, ID_CHUNK)) {
    const result = await supabase
      .from("entries")
      .select("id,original_content,occurred_at,sensitivity,current_interpretation_id")
      .eq("user_id", userId)
      .in("id", slice);
    if (result.error || !result.data) return { status: "failed" };
    entries.push(...(result.data as EntryRow[]));
  }
  return {
    status: "ok",
    records: entries
      .filter((entry) => entry.current_interpretation_id !== null && ideaReadings.has(entry.current_interpretation_id))
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || a.id.localeCompare(b.id))
      .slice(0, IDEAS_LIMIT)
      .map((entry) => ({
        id: entry.id,
        preview: previewOf(entry.original_content),
        occurredAt: entry.occurred_at,
        sensitivity: { kind: "derived", level: toSensitivityLevel(entry.sensitivity) },
      })),
  };
}
