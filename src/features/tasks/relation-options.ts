import "server-only";
import { requireSupabaseData } from "@/lib/supabase/result";
import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type RelationOption = {
  readonly id: string;
  readonly label: string;
};

export type CandidateRelationOptions = {
  readonly projects: readonly RelationOption[];
  readonly contexts: readonly RelationOption[];
  readonly people: readonly RelationOption[];
};

// Bounded so a candidate editor never has to render or transmit an unbounded
// owned-entity list (Server Components load options; Client Components only
// ever receive plain {id,label} pairs, never raw rows).
export const RELATION_OPTION_LIMIT = 200;

type NamedRow = { id: string; name: string };

export async function loadCandidateRelationOptions(
  supabase: SupabaseClient,
  userId: string,
): Promise<CandidateRelationOptions> {
  const [projectsResult, contextsResult, peopleResult] = await Promise.all([
    supabase
      .from("projects")
      .select("id,name")
      .eq("user_id", userId)
      .order("name", { ascending: true })
      .limit(RELATION_OPTION_LIMIT),
    supabase
      .from("contexts")
      .select("id,name")
      .eq("user_id", userId)
      .order("name", { ascending: true })
      .limit(RELATION_OPTION_LIMIT),
    supabase
      .from("people")
      .select("id,name")
      .eq("user_id", userId)
      .order("name", { ascending: true })
      .limit(RELATION_OPTION_LIMIT),
  ]);

  const projects = (requireSupabaseData(projectsResult, "load owned project relation options") ?? []) as NamedRow[];
  const contexts = (requireSupabaseData(contextsResult, "load owned context relation options") ?? []) as NamedRow[];
  const people = (requireSupabaseData(peopleResult, "load owned people relation options") ?? []) as NamedRow[];

  return Object.freeze({
    projects: Object.freeze(projects.map(toRelationOption)),
    contexts: Object.freeze(contexts.map(toRelationOption)),
    people: Object.freeze(people.map(toRelationOption)),
  });
}

function toRelationOption(row: NamedRow): RelationOption {
  return Object.freeze({ id: row.id, label: row.name });
}
