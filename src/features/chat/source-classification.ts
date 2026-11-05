import { isAreaKind, type AreaKind } from "@/features/library/life-area-kinds";
import { needsAskForChatPrompt, toSensitivityLevel, UNREADABLE_LEVEL } from "@/features/sensitivity/contracts";

import type { SourceClassification } from "./sensitive-admission";

/**
 * Life Brain B.4 (ADR-155) — the classification and the area of each retrieved
 * entry and memory, read under the owner's session.
 *
 * - An entry carries its own `sensitivity`; a memory carries its own and, when
 *   it came from a record, `source_entry_id`, whose area it takes.
 * - The area is the one the record's **current** reading files it under (the
 *   C.4 rule): the `entry_entities` context link whose `interpretation_id` is
 *   the entry's `current_interpretation_id`, on a context of a life-area kind.
 * - The area is only looked up for `highly_sensitive` sources — the only ones
 *   the predicate asks it of.
 * - **Fail closed.** A source whose row could not be read is classified
 *   `highly_sensitive` with no area, so it enters only on an explicit ask.
 */

type Row = { readonly source_type: "entry" | "memory"; readonly source_id: string };

type Result = { data: unknown; error: unknown };
type Builder = PromiseLike<Result> & {
  select(columns: string): Builder;
  eq(column: string, value: unknown): Builder;
  in(column: string, values: readonly unknown[]): Builder;
};
export type ClassificationClient = { from(table: string): Builder };

export const FAIL_CLOSED: SourceClassification = { level: UNREADABLE_LEVEL, area: null };

export function sourceKey(type: string, id: string): string {
  return `${type}:${id}`;
}

export async function classifyKnowledgeSources(
  client: ClassificationClient,
  userId: string,
  rows: readonly Row[],
): Promise<ReadonlyMap<string, SourceClassification>> {
  const entryIds = [...new Set(rows.filter((row) => row.source_type === "entry").map((row) => row.source_id))];
  const memoryIds = [...new Set(rows.filter((row) => row.source_type === "memory").map((row) => row.source_id))];
  const out = new Map<string, SourceClassification>();

  const memories = memoryIds.length
    ? await client.from("memories").select("id,sensitivity,source_entry_id").eq("user_id", userId).in("id", memoryIds)
    : { data: [], error: null };
  const memoryRows = (memories.error ? [] : (memories.data ?? [])) as { id: string; sensitivity: string | null; source_entry_id: string | null }[];

  const lookupIds = [...new Set([...entryIds, ...memoryRows.map((row) => row.source_entry_id).filter((id): id is string => Boolean(id))])];
  const entries = lookupIds.length
    ? await client.from("entries").select("id,sensitivity,current_interpretation_id").eq("user_id", userId).in("id", lookupIds)
    : { data: [], error: null };
  const entryRows = (entries.error ? [] : (entries.data ?? [])) as { id: string; sensitivity: string | null; current_interpretation_id: string | null }[];
  const entryById = new Map(entryRows.map((row) => [row.id, row]));

  // Which entries need an area: the highly sensitive entries, and the source
  // entries of highly sensitive memories.
  const needArea = new Set<string>();
  for (const id of entryIds) {
    const row = entryById.get(id);
    if (row && needsAskForChatPrompt(toSensitivityLevel(row.sensitivity))) needArea.add(id);
  }
  for (const memory of memoryRows) {
    if (needsAskForChatPrompt(toSensitivityLevel(memory.sensitivity)) && memory.source_entry_id) needArea.add(memory.source_entry_id);
  }
  const areaOf = await readAreas(client, userId, [...needArea], entryById);

  for (const id of entryIds) {
    const row = entryById.get(id);
    out.set(sourceKey("entry", id), row ? { level: toSensitivityLevel(row.sensitivity), area: areaOf.get(id) ?? null } : FAIL_CLOSED);
  }
  const memoryById = new Map(memoryRows.map((row) => [row.id, row]));
  for (const id of memoryIds) {
    const row = memoryById.get(id);
    out.set(
      sourceKey("memory", id),
      row ? { level: toSensitivityLevel(row.sensitivity), area: row.source_entry_id ? (areaOf.get(row.source_entry_id) ?? null) : null } : FAIL_CLOSED,
    );
  }
  return out;
}

async function readAreas(
  client: ClassificationClient,
  userId: string,
  entryIds: readonly string[],
  entryById: ReadonlyMap<string, { current_interpretation_id: string | null }>,
): Promise<ReadonlyMap<string, AreaKind>> {
  if (entryIds.length === 0) return new Map();
  const links = await client
    .from("entry_entities")
    .select("entry_id,interpretation_id,entity_id")
    .eq("user_id", userId)
    .eq("entity_type", "context")
    .in("entry_id", entryIds);
  if (links.error) return new Map();
  const current = ((links.data ?? []) as { entry_id: string; interpretation_id: string; entity_id: string }[])
    .filter((link) => entryById.get(link.entry_id)?.current_interpretation_id === link.interpretation_id);
  const contextIds = [...new Set(current.map((link) => link.entity_id))];
  if (contextIds.length === 0) return new Map();
  const contexts = await client.from("contexts").select("id,kind").eq("user_id", userId).in("id", contextIds);
  if (contexts.error) return new Map();
  const kindOf = new Map(((contexts.data ?? []) as { id: string; kind: string }[]).map((row) => [row.id, row.kind]));
  const out = new Map<string, AreaKind>();
  for (const link of current) {
    const kind = kindOf.get(link.entity_id);
    if (isAreaKind(kind) && !out.has(link.entry_id)) out.set(link.entry_id, kind);
  }
  return out;
}
