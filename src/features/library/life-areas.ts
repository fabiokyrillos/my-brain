import "server-only";

import { LIFE_AREAS } from "@/lib/ai/extraction-schema";
import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Life Brain A.5 — the life areas Memória opens with.
 *
 * An area is a `contexts` row whose `kind` is one of the areas the reading
 * files records under (C.1, ADR-148: the eight LB-M1 kinds plus `work`). The
 * worker creates one on demand the first time a record lands in it, so the
 * owner sees **their** areas — the ones that exist — not nine empty doors.
 *
 * - **Order is the product's, not the alphabet's**: `LIFE_AREAS` (Saúde,
 *   Família, Casa, Finanças, Viagens, Trabalho, Estudos, Lazer, Ideias), then
 *   by name within an area the owner made twice.
 * - **No count.** `entry_entities` holds a row per interpretation, so a head
 *   count would count re-readings, and a number that is not the number of
 *   records is worse than none. The door says the area exists; its page says
 *   what is in it (C.4's timeline).
 * - **A failed read is its own state**, never "no areas yet" — the overview's
 *   rule for every domain (`recentUnavailable`).
 *
 * Owner-scoped by the request's authenticated client under forced RLS. An area
 * name is a structural identifier, like a project's (ADR-110 Decision 2), so it
 * renders unmasked.
 */
export const AREA_KINDS = LIFE_AREAS.filter((kind) => kind !== "other");
export type AreaKind = (typeof AREA_KINDS)[number];

/** Bound on what one overview render reads; the contexts lens lists the rest. */
export const LIFE_AREA_LIMIT = 24;

export type LifeAreaDoor = {
  readonly id: string;
  readonly name: string;
  readonly kind: AreaKind;
};

export type LifeAreasResult =
  | { readonly status: "ok"; readonly areas: readonly LifeAreaDoor[]; readonly bounded: boolean }
  | { readonly status: "failed" };

function isAreaKind(value: unknown): value is AreaKind {
  return typeof value === "string" && (AREA_KINDS as readonly string[]).includes(value);
}

export async function loadLifeAreas(supabase: SupabaseClient): Promise<LifeAreasResult> {
  const { data, error } = await supabase
    .from("contexts")
    .select("id,name,kind")
    .in("kind", [...AREA_KINDS])
    .order("name", { ascending: true })
    .limit(LIFE_AREA_LIMIT + 1);
  if (error || !data) return { status: "failed" };

  const rows = (data as readonly { id: string; name: string; kind: string }[])
    .filter((row): row is { id: string; name: string; kind: AreaKind } => isAreaKind(row.kind));
  const order = new Map(AREA_KINDS.map((kind, index) => [kind, index]));
  const areas = [...rows]
    .sort((a, b) => (order.get(a.kind)! - order.get(b.kind)!) || a.name.localeCompare(b.name))
    .slice(0, LIFE_AREA_LIMIT)
    .map(({ id, name, kind }) => ({ id, name, kind }));
  return { status: "ok", areas, bounded: rows.length > LIFE_AREA_LIMIT };
}
