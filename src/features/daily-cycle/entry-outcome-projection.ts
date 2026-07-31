import "server-only";

/**
 * What exists *because of* an entry (UX-04).
 *
 * The audit asked seven questions of `/app/inbox/[entryId]` and found one it
 * could not answer: **what was created?** Confirmed tasks appeared only as a
 * transient success message on the candidate form and vanished on the next
 * load; reminders and memories were never mentioned; and the people, projects
 * and contexts the interpretation detected sat inside `TechnicalDetails` — a
 * disclosure named for model ids and trust scores, not for the owner's own
 * relationships.
 *
 * Everything here is a **read** over rows that already exist. Each family hangs
 * off a plain foreign key back to the entry, so this needed no write contract,
 * no new column and no migration:
 *
 * | family   | table            | column               |
 * | -------- | ---------------- | -------------------- |
 * | task     | `tasks`          | `source_entry_id`    |
 * | reminder | `reminders`      | `entry_id`           |
 * | memory   | `memories`       | `source_entry_id`    |
 * | entity   | `entry_entities` | `entry_id`           |
 *
 * RLS is the only authorization here, as everywhere else: these are the
 * caller's own rows read through the caller's own client. The projection adds
 * no `user_id` filter of its own precisely so it cannot appear to be the
 * boundary — `docs/SECURITY.md` is explicit that the database is.
 */

import { entityTypeLabel, getVocabularyCopy, memoryKindLabel, taskStatusLabel } from "@/features/vocabulary/copy";
import { requireSupabaseData } from "@/lib/supabase/result";
import type { createClient } from "@/lib/supabase/server";

import type { EntryOutcomeGroup, EntryOutcomeItem, EntryOutcomeView } from "./contracts";
import type { DailyCycleLocale } from "./copy";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

const headings: Record<DailyCycleLocale, Record<"task" | "reminder" | "memory" | "entity", string>> = {
  "pt-BR": {
    task: "Tarefas criadas",
    reminder: "Lembretes agendados",
    memory: "Memórias guardadas",
    entity: "Pessoas, projetos e contextos reconhecidos",
  },
  en: {
    task: "Tasks created",
    reminder: "Reminders scheduled",
    memory: "Memories kept",
    entity: "People, projects and contexts recognized",
  },
};

const reminderStates: Record<DailyCycleLocale, Record<string, string>> = {
  "pt-BR": {
    scheduled: "Agendado",
    sent: "Entregue",
    cancelled: "Cancelado",
    snoozed: "Adiado",
  },
  en: {
    scheduled: "Scheduled",
    sent: "Delivered",
    cancelled: "Cancelled",
    snoozed: "Snoozed",
  },
};

/**
 * The route each family's rows can be inspected at, or `null` where none exists.
 *
 * **Amended by EGC.1.** This used to say organizations and contexts were "the
 * honest `null` case … a person and a project each have a detail page, an
 * organization and a context do not", and that was true when written: UX-20's
 * rule is that what looks actionable must be actionable, so both degraded to
 * plain text rather than link to a 404. EGC.1 gave both a route, so the honest
 * answer changed with the fact rather than because the plain text looked poor.
 *
 * The `null` return survives for a different reason than it was written for: an
 * `entry_entities` row can name an `entity_type` no route exists for, and that
 * unknown must still degrade to text rather than to a guessed URL.
 */
function entityHref(locale: string, entityType: string, entityId: string): string | null {
  if (entityType === "person") return `/${locale}/app/people/${entityId}`;
  if (entityType === "project") return `/${locale}/app/projects/${entityId}`;
  if (entityType === "organization") return `/${locale}/app/organizations/${entityId}`;
  if (entityType === "context") return `/${locale}/app/contexts/${entityId}`;
  return null;
}

function formatInstant(iso: string | null, locale: DailyCycleLocale, timezone: string): string | null {
  if (iso === null) return null;
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

export type EntryOutcomeProjectionInput = {
  readonly entryId: string;
  readonly locale: DailyCycleLocale;
  readonly timezone: string;
  readonly tasks: readonly { id: string; title: string; status: string; due_at: string | null }[];
  readonly reminders: readonly { id: string; title: string; status: string; remind_at: string }[];
  readonly memories: readonly { id: string; content: string; kind: string }[];
  readonly entities: readonly { entity_id: string; entity_type: string; mention: string; name: string | null }[];
};

export function toEntryOutcomeView(input: EntryOutcomeProjectionInput): EntryOutcomeView {
  const { locale, timezone } = input;
  const vocabulary = getVocabularyCopy(locale);
  const heading = headings[locale];

  const tasks: EntryOutcomeItem[] = input.tasks.map((task) => {
    const status = taskStatusLabel(locale, task.status) ?? vocabulary.unknownState;
    const due = formatInstant(task.due_at, locale, timezone);
    return {
      key: `task:${task.id}`,
      family: "task" as const,
      title: task.title,
      detail: due === null ? status : `${status} · ${due}`,
      href: `/${locale}/app/work/${task.id}`,
    };
  });

  const reminders: EntryOutcomeItem[] = input.reminders.map((reminder) => {
    const state = reminderStates[locale][reminder.status] ?? vocabulary.unknownState;
    const at = formatInstant(reminder.remind_at, locale, timezone);
    return {
      key: `reminder:${reminder.id}`,
      family: "reminder" as const,
      title: reminder.title,
      detail: at === null ? state : `${state} · ${at}`,
      // Reminders have a list, not a detail page. Linking to the list is a real
      // destination; inventing `/app/reminders/[id]` would not be.
      href: `/${locale}/app/reminders`,
    };
  });

  const memories: EntryOutcomeItem[] = input.memories.map((memory) => ({
    key: `memory:${memory.id}`,
    family: "memory" as const,
    title: memory.content,
    detail: memoryKindLabel(locale, memory.kind) ?? vocabulary.unknownState,
    href: `/${locale}/app/memories/${memory.id}`,
  }));

  const entities: EntryOutcomeItem[] = input.entities.map((entity) => ({
    key: `entity:${entity.entity_type}:${entity.entity_id}`,
    family: "entity" as const,
    // The stored name when the row still exists, and the mention the
    // interpretation matched on when it does not — never an empty row.
    title: entity.name ?? entity.mention,
    detail: entityTypeLabel(locale, entity.entity_type) ?? vocabulary.unknownState,
    href: entity.name === null ? null : entityHref(locale, entity.entity_type, entity.entity_id),
  }));

  const groups: EntryOutcomeGroup[] = (
    [
      { family: "task" as const, heading: heading.task, items: tasks },
      { family: "reminder" as const, heading: heading.reminder, items: reminders },
      { family: "memory" as const, heading: heading.memory, items: memories },
      { family: "entity" as const, heading: heading.entity, items: entities },
    ]
  ).filter((group) => group.items.length > 0);

  return {
    entryId: input.entryId,
    groups,
    isEmpty: groups.length === 0,
  };
}

export async function loadEntryOutcomeProjection(
  supabase: SupabaseClient,
  {
    entryId,
    locale,
    timezone,
  }: { entryId: string; locale: DailyCycleLocale; timezone: string },
): Promise<EntryOutcomeView> {
  const [taskResult, reminderResult, memoryResult, entityResult] = await Promise.all([
    supabase
      .from("tasks")
      .select("id,title,status,due_at,created_at")
      .eq("source_entry_id", entryId)
      .order("created_at", { ascending: true })
      .limit(50),
    supabase
      .from("reminders")
      .select("id,title,status,remind_at")
      .eq("entry_id", entryId)
      .order("remind_at", { ascending: true })
      .limit(50),
    supabase
      .from("memories")
      .select("id,content,kind,created_at")
      .eq("source_entry_id", entryId)
      .order("created_at", { ascending: true })
      .limit(50),
    supabase
      .from("entry_entities")
      .select("entity_id,entity_type,mention,created_at")
      .eq("entry_id", entryId)
      .order("created_at", { ascending: true })
      .limit(50),
  ]);

  const tasks = requireSupabaseData(taskResult, "load entry outcome tasks") ?? [];
  const reminders = requireSupabaseData(reminderResult, "load entry outcome reminders") ?? [];
  const memories = requireSupabaseData(memoryResult, "load entry outcome memories") ?? [];
  const links = requireSupabaseData(entityResult, "load entry outcome entities") ?? [];

  /**
   * `entry_entities` is polymorphic — one row can point at a person, a project,
   * an organization or a context — so the name lives in four different tables
   * and there is no join that fetches it. Each type is read once, only when the
   * entry actually mentions it, and a missing row leaves `name` null so the item
   * degrades to its mention rather than to a link that 404s.
   */
  const byType = new Map<string, string[]>();
  for (const link of links) {
    const ids = byType.get(link.entity_type) ?? [];
    ids.push(link.entity_id);
    byType.set(link.entity_type, ids);
  }

  const tables: Record<string, "people" | "projects" | "organizations" | "contexts"> = {
    person: "people",
    project: "projects",
    organization: "organizations",
    context: "contexts",
  };

  const nameEntries = await Promise.all(
    [...byType.entries()].map(async ([entityType, ids]) => {
      const table = tables[entityType];
      if (table === undefined) return [] as [string, string][];
      const result = await supabase.from(table).select("id,name").in("id", ids);
      const rows = requireSupabaseData(result, `load entry outcome ${table}`) ?? [];
      return rows.map((row) => [`${entityType}:${row.id}`, row.name] as [string, string]);
    }),
  );
  const names = new Map(nameEntries.flat());

  return toEntryOutcomeView({
    entryId,
    locale,
    timezone,
    tasks,
    reminders,
    memories,
    entities: links.map((link) => ({
      entity_id: link.entity_id,
      entity_type: link.entity_type,
      mention: link.mention,
      name: names.get(`${link.entity_type}:${link.entity_id}`) ?? null,
    })),
  });
}
