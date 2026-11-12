import type { SupabaseClient } from "@supabase/supabase-js";

import { presentationFor, toSensitivityLevel } from "@/features/sensitivity/contracts";

import { AREA_KINDS } from "./life-area-kinds";

/**
 * Life Brain D.2 — Pessoas, grouped by area of life (ADR-166).
 *
 * The owner asked for people "mais organizadas ou categorizadas" (T3) and the
 * brief said to propose a grouping, not invent one. The product already knows
 * which area each record is filed under (C.1) and which people each record
 * names (`entry_entities`), so a person's area is the area **their own records**
 * put them in most often — plus any direct `person_contexts` link to an area.
 *
 * - Only a record's **current** reading counts, as on the area page (C.4).
 * - A record counts only if the area page would show it in the clear
 *   (`presentationFor("area", …)`, failing closed on an unreadable level):
 *   filing someone under "Saúde" because of a record the product masks would
 *   say on this list what the record itself withholds.
 * - A tie goes to the area whose name sorts first, so the same data always
 *   groups the same way. People with no area are the last group.
 *
 * Grouping is per page (50 people), in the list's own order inside each group.
 * A read that fails yields `null`, and the page shows the plain list.
 */

export type GroupedPerson = { readonly id: string; readonly name: string };
export type PeopleArea = { readonly id: string; readonly name: string; readonly kind: string };
export type PeopleAreaMentions = {
  readonly areas: readonly PeopleArea[];
  readonly mentions: readonly { readonly personId: string; readonly areaId: string }[];
};
export type PeopleGroup<T extends GroupedPerson> = {
  readonly area: PeopleArea | null;
  readonly people: readonly T[];
};

export function groupPeopleByArea<T extends GroupedPerson>(
  people: readonly T[],
  data: PeopleAreaMentions | null,
): readonly PeopleGroup<T>[] {
  if (data === null) return [{ area: null, people: [...people] }];
  const areaById = new Map(data.areas.map((area) => [area.id, area]));
  const counts = new Map<string, Map<string, number>>();
  for (const { personId, areaId } of data.mentions) {
    if (!areaById.has(areaId)) continue;
    const perPerson = counts.get(personId) ?? new Map<string, number>();
    perPerson.set(areaId, (perPerson.get(areaId) ?? 0) + 1);
    counts.set(personId, perPerson);
  }

  const groups = new Map<string | null, T[]>();
  for (const candidate of people) {
    const perPerson = counts.get(candidate.id);
    let best: PeopleArea | null = null;
    let bestCount = 0;
    for (const [areaId, count] of perPerson ?? []) {
      const area = areaById.get(areaId)!;
      if (count > bestCount || (count === bestCount && best !== null && area.name.localeCompare(best.name) < 0)) {
        best = area;
        bestCount = count;
      }
    }
    const key = best?.id ?? null;
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }

  const named = [...groups.entries()]
    .filter(([key]) => key !== null)
    .map(([key, members]) => ({ area: areaById.get(key as string)!, people: members }))
    .sort((a, b) => (b.people.length - a.people.length) || a.area.name.localeCompare(b.area.name));
  const none = groups.get(null);
  return none ? [...named, { area: null, people: none }] : named;
}

const CHUNK = 100;

function chunks<T>(values: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < values.length; index += CHUNK) out.push(values.slice(index, index + CHUNK));
  return out;
}

/** The area mentions for `personIds`, owner-scoped; `null` when any read fails. */
export async function loadPeopleAreaMentions(
  supabase: SupabaseClient,
  userId: string,
  personIds: readonly string[],
): Promise<PeopleAreaMentions | null> {
  if (personIds.length === 0) return { areas: [], mentions: [] };

  const personLinks: { entity_id: string; entry_id: string; interpretation_id: string }[] = [];
  for (const slice of chunks(personIds)) {
    const result = await supabase
      .from("entry_entities")
      .select("entity_id,entry_id,interpretation_id")
      .eq("user_id", userId)
      .eq("entity_type", "person")
      .in("entity_id", slice)
      .limit(2000);
    if (result.error || !result.data) return null;
    personLinks.push(...(result.data as typeof personLinks));
  }

  const entryIds = [...new Set(personLinks.map((link) => link.entry_id))];
  const current = new Map<string, string>();
  for (const slice of chunks(entryIds)) {
    const result = await supabase
      .from("entries")
      .select("id,current_interpretation_id,sensitivity")
      .eq("user_id", userId)
      .in("id", slice);
    if (result.error || !result.data) return null;
    for (const row of result.data as { id: string; current_interpretation_id: string | null; sensitivity: string | null }[]) {
      const clear = presentationFor("area", toSensitivityLevel(row.sensitivity)).outcome === "show";
      if (row.current_interpretation_id && clear) current.set(row.id, row.current_interpretation_id);
    }
  }
  const live = personLinks.filter((link) => current.get(link.entry_id) === link.interpretation_id);

  const interpretationIds = [...new Set(live.map((link) => link.interpretation_id))];
  const contextByInterpretation = new Map<string, string[]>();
  for (const slice of chunks(interpretationIds)) {
    const result = await supabase
      .from("entry_entities")
      .select("interpretation_id,entity_id")
      .eq("user_id", userId)
      .eq("entity_type", "context")
      .in("interpretation_id", slice)
      .limit(2000);
    if (result.error || !result.data) return null;
    for (const row of result.data as { interpretation_id: string; entity_id: string }[]) {
      contextByInterpretation.set(row.interpretation_id, [...(contextByInterpretation.get(row.interpretation_id) ?? []), row.entity_id]);
    }
  }

  const direct: { person_id: string; context_id: string }[] = [];
  for (const slice of chunks(personIds)) {
    const result = await supabase
      .from("person_contexts")
      .select("person_id,context_id")
      .eq("user_id", userId)
      .in("person_id", slice)
      .is("valid_until", null)
      .limit(1000);
    if (result.error || !result.data) return null;
    direct.push(...(result.data as typeof direct));
  }

  const candidates: { personId: string; areaId: string }[] = [
    ...live.flatMap((link) => (contextByInterpretation.get(link.interpretation_id) ?? []).map((areaId) => ({ personId: link.entity_id, areaId }))),
    ...direct.map((row) => ({ personId: row.person_id, areaId: row.context_id })),
  ];
  const contextIds = [...new Set(candidates.map((mention) => mention.areaId))];
  const areas: PeopleArea[] = [];
  for (const slice of chunks(contextIds)) {
    const result = await supabase
      .from("contexts")
      .select("id,name,kind")
      .eq("user_id", userId)
      .in("id", slice)
      .in("kind", [...AREA_KINDS]);
    if (result.error || !result.data) return null;
    areas.push(...(result.data as PeopleArea[]));
  }
  const areaIds = new Set(areas.map((area) => area.id));
  return { areas, mentions: candidates.filter((mention) => areaIds.has(mention.areaId)) };
}
