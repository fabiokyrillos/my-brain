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
  readonly tasks: readonly RelationOption[];
};

// Bounded so a candidate editor never has to render or transmit an unbounded
// owned-entity list (Server Components load options; Client Components only
// ever receive plain {id,label} pairs, never raw rows).
export const RELATION_OPTION_LIMIT = 200;

type NamedRow = { id: string; name: string };
type TitledRow = { id: string; title: string };

export async function loadCandidateRelationOptions(
  supabase: SupabaseClient,
  userId: string,
): Promise<CandidateRelationOptions> {
  const [projectsResult, contextsResult, peopleResult, tasksResult] = await Promise.all([
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
    // Only active (non-cancelled) tasks are offered as parent/dependency
    // targets -- attaching a candidate to a cancelled task is never useful.
    supabase
      .from("tasks")
      .select("id,title")
      .eq("user_id", userId)
      .neq("status", "cancelled")
      .order("updated_at", { ascending: false })
      .limit(RELATION_OPTION_LIMIT),
  ]);

  const projects = (requireSupabaseData(projectsResult, "load owned project relation options") ?? []) as NamedRow[];
  const contexts = (requireSupabaseData(contextsResult, "load owned context relation options") ?? []) as NamedRow[];
  const people = (requireSupabaseData(peopleResult, "load owned people relation options") ?? []) as NamedRow[];
  const tasks = (requireSupabaseData(tasksResult, "load owned task graph options") ?? []) as TitledRow[];

  return Object.freeze({
    projects: Object.freeze(projects.map(toRelationOption)),
    contexts: Object.freeze(contexts.map(toRelationOption)),
    people: Object.freeze(people.map(toRelationOption)),
    tasks: Object.freeze(tasks.map(toTaskRelationOption)),
  });
}

function toRelationOption(row: NamedRow): RelationOption {
  return Object.freeze({ id: row.id, label: row.name });
}

function toTaskRelationOption(row: TitledRow): RelationOption {
  return Object.freeze({ id: row.id, label: row.title });
}
