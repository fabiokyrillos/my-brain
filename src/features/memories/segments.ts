/**
 * Life Brain E.4 (ADR-172) — memories by segment, the way the owner's
 * reference (Claude's own memory) organises them: health, work, personality…
 *
 * Every memory lands in exactly one segment, derived from what the database
 * already holds — no column, so no migration:
 *
 * 1. the life area of the record it came from (`entry_entities` → a context
 *    whose `kind` is an area, which LB-M1's `link_entry_life_area` writes);
 * 2. otherwise its kind: `professional_context` is work;
 * 3. otherwise, a memory about one of your people (`person_id`, or kind
 *    `relationship`) is "Pessoas";
 * 4. otherwise preferences, habits, rules, restrictions and goals are
 *    "Sobre você" — the personality segment;
 * 5. everything else is "Outras".
 *
 * Pure: the caller reads the areas; this decides.
 */

import { LIFE_AREA_KINDS, type LifeAreaKind } from "@/features/vocabulary/copy";

export type SegmentArea = LifeAreaKind | "work";

export const MEMORY_SEGMENTS = [
  "self",
  "health",
  "family",
  "home",
  "finance",
  "work",
  "study",
  "travel",
  "leisure",
  "ideas",
  "people",
  "other",
] as const;

export type MemorySegment = (typeof MEMORY_SEGMENTS)[number];

const SELF_KINDS: ReadonlySet<string> = new Set(["preference", "habit", "rule", "restriction", "goal"]);
const AREA_KINDS: ReadonlySet<string> = new Set<string>([...LIFE_AREA_KINDS, "work"]);

export function isSegmentArea(value: unknown): value is SegmentArea {
  return typeof value === "string" && AREA_KINDS.has(value);
}

export type SegmentableMemory = Readonly<{
  kind: string;
  person_id: string | null;
  source_entry_id: string | null;
}>;

export function memorySegment(memory: SegmentableMemory, areaByEntry: ReadonlyMap<string, SegmentArea>): MemorySegment {
  const area = memory.source_entry_id === null ? undefined : areaByEntry.get(memory.source_entry_id);
  if (area !== undefined) return area;
  if (memory.kind === "professional_context") return "work";
  if (memory.person_id !== null || memory.kind === "relationship") return "people";
  if (SELF_KINDS.has(memory.kind)) return "self";
  return "other";
}

/**
 * One area per record: when a record is linked to several, the first in
 * segment order wins, so the choice never depends on row order.
 */
export function areaByEntry(rows: readonly { readonly entryId: string; readonly kind: string }[]): Map<string, SegmentArea> {
  const rank = (kind: SegmentArea) => MEMORY_SEGMENTS.indexOf(kind);
  const found = new Map<string, SegmentArea>();
  for (const row of rows) {
    if (!isSegmentArea(row.kind)) continue;
    const current = found.get(row.entryId);
    if (current === undefined || rank(row.kind) < rank(current)) found.set(row.entryId, row.kind);
  }
  return found;
}

/** The items, grouped in segment order, keeping their order inside a group; empty groups are left out. */
export function groupBySegment<T>(items: readonly T[], segmentOf: (item: T) => MemorySegment): { segment: MemorySegment; items: T[] }[] {
  const groups = new Map<MemorySegment, T[]>();
  for (const item of items) {
    const segment = segmentOf(item);
    const list = groups.get(segment);
    if (list) list.push(item);
    else groups.set(segment, [item]);
  }
  return MEMORY_SEGMENTS.filter((segment) => groups.has(segment)).map((segment) => ({ segment, items: groups.get(segment)! }));
}
