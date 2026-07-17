import { getAIProvider } from "@/lib/ai";
import type { EntryExtraction } from "@/lib/ai/extraction-schema";
import { recordAIUsage } from "@/lib/ai/usage";
import { defaultAgentPreferences } from "@/lib/preferences";
import type { createClient } from "@/lib/supabase/server";
import { requireSupabaseData } from "@/lib/supabase/result";
import { rankEntityCandidates, type EntityCandidate, type EntityType } from "./entity-resolution";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
type NamedEntity = { id: string; name: string; user_id: string; organization_id?: string | null };

function formatKnownContext(groups: Array<[string, NamedEntity[] | null]>) {
  return groups
    .filter(([, items]) => items && items.length > 0)
    .map(([label, items]) => `${label}: ${items?.map((item) => item.name).join(", ")}`)
    .join("\n");
}

async function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Entry extraction timed out.")), milliseconds);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function buildCandidates(input: {
  rows: NamedEntity[];
  type: EntityType;
  aliases: Array<{ entity_id: string; alias: string; valid_from: string | null; valid_to: string | null }>;
  history: Map<string, number>;
}): EntityCandidate[] {
  return input.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    type: input.type,
    name: row.name,
    aliases: input.aliases
      .filter((alias) => alias.entity_id === row.id)
      .map((alias) => ({ value: alias.alias, validFrom: alias.valid_from, validTo: alias.valid_to })),
    historicalMatches: input.history.get(`${input.type}:${row.id}`) ?? 0,
    organizationId: row.organization_id ?? null,
  }));
}

function resolveExtractionEntities(input: {
  extraction: EntryExtraction;
  userId: string;
  candidates: EntityCandidate[];
}) {
  const groups: Array<[EntityType, EntryExtraction["people"]]> = [
    ["context", input.extraction.contexts],
    ["organization", input.extraction.organizations],
    ["project", input.extraction.projects],
    ["person", input.extraction.people],
  ];
  return groups.flatMap(([type, mentions]) => mentions.map((mention) => {
    const ranked = rankEntityCandidates({
      query: mention.name,
      type,
      userId: input.userId,
      candidates: input.candidates,
      occurredAt: input.extraction.occurredAt,
    });
    return {
      query: mention.name,
      topScore: ranked.candidates[0]?.score ?? 0,
      margin: ranked.margin,
      ambiguous: ranked.ambiguous,
      evidence: [...(ranked.candidates[0]?.evidence ?? []), "candidate_set_bounded_50"],
    };
  }));
}

export async function extractEntryForUser(input: {
  supabase: SupabaseClient;
  userId: string;
  entryId: string;
  content: string;
  locale: "pt-BR" | "en";
}) {
  const [profileResult, preferencesResult, contextsResult, organizationsResult, projectsResult, peopleResult, aliasesResult, historyResult, correctionsResult] = await Promise.all([
    input.supabase.from("profiles").select("timezone").eq("user_id", input.userId).maybeSingle(),
    input.supabase.from("agent_preferences").select("extraction_model,embedding_model").eq("user_id", input.userId).maybeSingle(),
    input.supabase.from("contexts").select("id,name,user_id").order("updated_at", { ascending: false }).limit(50),
    input.supabase.from("organizations").select("id,name,user_id").order("updated_at", { ascending: false }).limit(50),
    input.supabase.from("projects").select("id,name,user_id").eq("status", "active").order("updated_at", { ascending: false }).limit(50),
    input.supabase.from("people").select("id,name,user_id,organization_id").order("updated_at", { ascending: false }).limit(50),
    input.supabase.from("entity_aliases").select("entity_type,entity_id,alias,valid_from,valid_to").eq("user_id", input.userId).limit(200),
    input.supabase.from("entry_entities").select("entity_type,entity_id").eq("user_id", input.userId).limit(500),
    input.supabase.from("entry_interpretations").select("id", { count: "exact", head: true }).eq("entry_id", input.entryId).eq("origin", "user_corrected"),
  ]);
  const profile = requireSupabaseData(profileResult, "load interpretation profile");
  const preferences = requireSupabaseData(preferencesResult, "load interpretation preferences");
  const contexts = requireSupabaseData(contextsResult, "load interpretation contexts") ?? [];
  const organizations = requireSupabaseData(organizationsResult, "load interpretation organizations") ?? [];
  const projects = requireSupabaseData(projectsResult, "load interpretation projects") ?? [];
  const people = requireSupabaseData(peopleResult, "load interpretation people") ?? [];
  const aliases = requireSupabaseData(aliasesResult, "load entity aliases") ?? [];
  const historyRows = requireSupabaseData(historyResult, "load entity resolution history") ?? [];
  if (correctionsResult.error) throw correctionsResult.error;

  const provider = getAIProvider({
    model: preferences?.extraction_model ?? "gpt-5.6-luna",
    embeddingModel: preferences?.embedding_model ?? "text-embedding-3-small",
  });
  const result = await withTimeout(provider.extractEntry({
    content: input.content,
    locale: input.locale,
    timezone: profile?.timezone ?? defaultAgentPreferences.timezone,
    currentTime: new Date().toISOString(),
    knownContext: formatKnownContext([
      ["Contexts", contexts],
      ["Organizations", organizations],
      ["Projects", projects],
      ["People", people],
    ]),
  }), 120_000);

  await recordAIUsage(input.supabase, {
    operation: "capture_extraction",
    model: result.model,
    userId: input.userId,
    usage: result,
    sourceType: "entry",
    sourceId: input.entryId,
  });

  const history = new Map<string, number>();
  historyRows.forEach((row) => {
    const key = `${row.entity_type}:${row.entity_id}`;
    history.set(key, (history.get(key) ?? 0) + 1);
  });
  const candidates = [
    ...buildCandidates({ rows: contexts, type: "context", aliases: aliases.filter((alias) => alias.entity_type === "context"), history }),
    ...buildCandidates({ rows: organizations, type: "organization", aliases: aliases.filter((alias) => alias.entity_type === "organization"), history }),
    ...buildCandidates({ rows: projects, type: "project", aliases: aliases.filter((alias) => alias.entity_type === "project"), history }),
    ...buildCandidates({ rows: people, type: "person", aliases: aliases.filter((alias) => alias.entity_type === "person"), history }),
  ];
  return {
    result,
    provider,
    entityResolutions: resolveExtractionEntities({ extraction: result.extraction, userId: input.userId, candidates }),
    priorCorrectionAgreement: Math.min(1, (correctionsResult.count ?? 0) / 5),
  };
}

export async function persistEntryEmbedding(input: {
  supabase: SupabaseClient;
  userId: string;
  entryId: string;
  content: string;
  summary: string;
  provider: ReturnType<typeof getAIProvider>;
}) {
  const embeddingContent = `${input.summary}\n\n${input.content}`;
  const embedded = await input.provider.embedText(embeddingContent);
  await recordAIUsage(input.supabase, {
    operation: "semantic_search",
    model: embedded.model,
    userId: input.userId,
    usage: embedded,
    sourceType: "entry",
    sourceId: input.entryId,
  });
  const { error } = await input.supabase.from("entry_embeddings").upsert({
    user_id: input.userId,
    entry_id: input.entryId,
    content: embeddingContent,
    embedding: embedded.embedding,
    model: embedded.model,
    input_tokens: embedded.inputTokens,
  }, { onConflict: "entry_id" });
  if (error) throw error;
}
