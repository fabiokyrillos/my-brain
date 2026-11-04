/**
 * Life Brain B.2 — `LB-B-006`: tasks and reminders as knowledge sources.
 *
 * `match_internal_knowledge` reaches entries and memories by vector, and tasks
 * and reminders have no vector. So the knowledge answer could not see the one
 * row that answers "quais exames estão pendentes?": the task's status. This
 * adds them by **text**: the question's content words, matched against the
 * titles with `ilike`, owner-scoped, bounded, and never reading a cancelled
 * row. No migration and no new index — the `/app/search` surface already
 * matches titles this way (`search/contracts.ts` `buildOrFilter`).
 *
 * ## What the model is shown
 *
 * One plain sentence per row, in the owner's locale and zone: a task's title,
 * its state and its deadline or planned day; a reminder's title, its time and
 * its state. The state is the point — it is what the entry that created the
 * task cannot say.
 *
 * ## What it is never shown
 *
 * A task or reminder that Tarefas would withhold in place: its source entry is
 * the most protective level, or its source cannot be read (`deriveTaskSensitivity`
 * fails closed). That is the default scope `/app/search` applies (OD-1) as a
 * predicate, and here it is applied before the prompt is built, so a withheld
 * title never reaches the provider. A task typed straight into the list has no
 * source and is shown — the same partial coverage `2L-PRIVACY-004` states on
 * the list. If the classifications cannot be read at all, every row that has a
 * source is withheld. Slice B.4 owns the explicit "include sensitive" request.
 *
 * ## Citations
 *
 * Each row becomes a `ChatSource` the model may cite by id. The citation that
 * is stored carries no text: `resolve-sources.ts` resolves a cited task or
 * reminder content-free (ADR-146 for tasks; ADR-147 extends it to reminders).
 */

import { deriveTaskSensitivity, resolveTaskContent } from "@/features/sensitivity/task-derivation";
import { taskStatusLabel } from "@/features/vocabulary/copy";
import type { ChatSource } from "@/lib/ai/types";
import type { Locale } from "@/lib/preferences";

/** At most this many words of a question are searched. */
export const MAX_SEARCH_TERMS = 6;
/** At most this many rows per table reach the prompt. */
export const STRUCTURED_SOURCE_LIMIT = 6;

/*
 * Grammar, compared after accent removal. Words of three letters or fewer are
 * already dropped by length, so only the longer function words and the words
 * every question about one's own life carries ("ficou", "tenho", "pendente" is
 * NOT here: it is the word the owner uses for an open task).
 */
const STOPWORDS: ReadonlySet<string> = new Set([
  // pt-BR
  "quais", "qual", "quando", "onde", "aonde", "como", "quanto", "quantos", "quantas", "porque", "sera",
  "estao", "esta", "estou", "estava", "estive", "seria", "foram", "fora", "sendo", "tenho", "tinha", "tive", "temos",
  "ficou", "ficaram", "fica", "ainda", "agora", "hoje", "ontem", "depois", "antes", "sobre", "para", "pela", "pelo",
  "pelas", "pelos", "isso", "isto", "esse", "essa", "esses", "essas", "este", "estes", "estas", "aquele", "aquela",
  "minha", "minhas", "meus", "voce", "algo", "alguma", "algum", "algumas", "alguns", "coisa", "coisas", "muito",
  "muita", "mais", "menos", "tambem", "vez", "vezes", "ultima", "ultimo", "semana", "falei", "disse", "existe",
  "tarefa", "tarefas", "lembrete", "lembretes",
  // en
  "what", "when", "where", "which", "whom", "whose", "with", "about", "have", "does", "that", "this", "there",
  "their", "from", "still", "open", "last", "time", "week", "today", "were", "been", "being", "said", "tell",
  "into", "your", "mine", "anything", "something", "task", "tasks", "reminder", "reminders",
]);

function fold(word: string): string {
  return word.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/**
 * The content words of a question, as they are written (accents kept, since
 * `ilike` is accent-sensitive and the titles keep theirs), lowercased, with a
 * plural `-s` folded off so "exames" finds "Exame de sangue". Only letters and
 * digits survive, so no term can carry a PostgREST filter metacharacter.
 */
export function searchTermsFor(question: string): string[] {
  const terms: string[] = [];
  for (const raw of question.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 4) continue;
    if (STOPWORDS.has(fold(raw))) continue;
    const term = raw.length >= 5 && raw.endsWith("s") && !raw.endsWith("ss") ? raw.slice(0, -1) : raw;
    if (!terms.includes(term)) terms.push(term);
    if (terms.length === MAX_SEARCH_TERMS) break;
  }
  return terms;
}

type Result = { data: unknown[] | null; error: { message: string } | null };
type Builder = PromiseLike<Result> & {
  select(columns: string): Builder;
  or(filter: string): Builder;
  in(column: string, values: readonly string[]): Builder;
  neq(column: string, value: string): Builder;
  eq(column: string, value: string): Builder;
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): Builder;
  limit(count: number): Builder;
};
/**
 * The slice of the Supabase client this reads through. The request-scoped,
 * authenticated client satisfies it; forced RLS still decides what exists, and
 * every query is also scoped by `user_id` explicitly.
 */
export type StructuredSourceClient = { from(table: string): Builder };

type TaskRow = {
  id: string;
  title: string;
  status: string;
  due_at: string | null;
  planned_at: string | null;
  source_entry_id: string | null;
  created_at: string;
};
type ReminderRow = {
  id: string;
  title: string;
  remind_at: string;
  status: string;
  entry_id: string | null;
  created_at: string;
};

const REMINDER_STATES: Record<Locale, Record<string, string>> = {
  "pt-BR": { scheduled: "agendado", sent: "avisado", snoozed: "adiado" },
  en: { scheduled: "scheduled", sent: "sent", snoozed: "snoozed" },
};

const SENTENCES: Record<Locale, {
  task: (title: string, state: string, when: string) => string;
  due: (date: string) => string;
  planned: (date: string) => string;
  noDue: string;
  reminder: (title: string, when: string, state: string) => string;
}> = {
  "pt-BR": {
    task: (title, state, when) => `Tarefa: ${title}. Situação: ${state}. ${when}`,
    due: (date) => `Prazo: ${date}.`,
    planned: (date) => `Planejada para: ${date}.`,
    noDue: "Sem prazo.",
    reminder: (title, when, state) => `Lembrete: ${title}. Quando: ${when}. Situação: ${state}.`,
  },
  en: {
    task: (title, state, when) => `Task: ${title}. State: ${state}. ${when}`,
    due: (date) => `Due: ${date}.`,
    planned: (date) => `Planned for: ${date}.`,
    noDue: "No deadline.",
    reminder: (title, when, state) => `Reminder: ${title}. When: ${when}. State: ${state}.`,
  },
};

function day(iso: string, locale: Locale, timezone: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "short", timeZone: timezone }).format(new Date(iso));
}

function moment(iso: string, locale: Locale, timezone: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short", timeZone: timezone }).format(new Date(iso));
}

function taskSentence(row: TaskRow, locale: Locale, timezone: string): string {
  const copy = SENTENCES[locale];
  const state = (taskStatusLabel(locale, row.status) ?? row.status).toLowerCase();
  const when = row.due_at
    ? copy.due(day(row.due_at, locale, timezone))
    : row.planned_at
      ? copy.planned(day(row.planned_at, locale, timezone))
      : copy.noDue;
  return copy.task(row.title, state, when);
}

function reminderSentence(row: ReminderRow, locale: Locale, timezone: string): string {
  const state = REMINDER_STATES[locale][row.status] ?? row.status;
  return SENTENCES[locale].reminder(row.title, moment(row.remind_at, locale, timezone), state);
}

export type StructuredSources = {
  readonly sources: ChatSource[];
  /** Rows matched and withheld because their source is protected or unreadable. */
  readonly withheld: number;
  /** Tables whose read failed; their rows are simply absent. */
  readonly failed: ReadonlyArray<"tasks" | "reminders">;
};

export async function loadStructuredSources(
  client: StructuredSourceClient,
  input: { readonly userId: string; readonly question: string; readonly locale: Locale; readonly timezone: string },
): Promise<StructuredSources> {
  const terms = searchTermsFor(input.question);
  if (terms.length === 0) return { sources: [], withheld: 0, failed: [] };
  const filter = terms.map((term) => `title.ilike.*${term}*`).join(",");

  const [tasksResult, remindersResult] = await Promise.all([
    client
      .from("tasks")
      .select("id,title,status,due_at,planned_at,source_entry_id,created_at")
      .eq("user_id", input.userId)
      .neq("status", "cancelled")
      .or(filter)
      .order("created_at", { ascending: false })
      .limit(STRUCTURED_SOURCE_LIMIT),
    client
      .from("reminders")
      .select("id,title,remind_at,status,entry_id,created_at")
      .eq("user_id", input.userId)
      .neq("status", "cancelled")
      .or(filter)
      .order("remind_at", { ascending: false })
      .limit(STRUCTURED_SOURCE_LIMIT),
  ]);

  const failed: Array<"tasks" | "reminders"> = [];
  if (tasksResult.error) failed.push("tasks");
  if (remindersResult.error) failed.push("reminders");
  const tasks = (tasksResult.error ? [] : (tasksResult.data ?? [])) as TaskRow[];
  const reminders = (remindersResult.error ? [] : (remindersResult.data ?? [])) as ReminderRow[];

  const sourceIds = [...new Set([
    ...tasks.map((row) => row.source_entry_id),
    ...reminders.map((row) => row.entry_id),
  ].filter((id): id is string => typeof id === "string"))];

  // Owner-scoped classification read. An id it does not return derives the most
  // protective level, and a failed read returns none of them.
  const levels = new Map<string, string | null>();
  if (sourceIds.length > 0) {
    const entries = await client.from("entries").select("id,sensitivity").eq("user_id", input.userId).in("id", sourceIds);
    if (!entries.error) {
      for (const row of (entries.data ?? []) as Array<{ id: string; sensitivity: string | null }>) {
        levels.set(row.id, row.sensitivity);
      }
    }
  }
  // The Work surface's own rule (`resolveTaskContent`): what Tarefas would
  // withhold in place is what the prompt never receives. Asked of the contract,
  // never of a level, so this file names no classification
  // (`sensitivity-boundary.test.ts`).
  const sendable = (sourceEntryId: string | null, key: string) =>
    !resolveTaskContent(deriveTaskSensitivity(sourceEntryId, levels), key).masked;

  let withheld = 0;
  const sources: ChatSource[] = [];
  for (const row of tasks) {
    if (!sendable(row.source_entry_id, row.id)) { withheld += 1; continue; }
    sources.push({
      id: `task:${row.id}`,
      type: "task",
      content: taskSentence(row, input.locale, input.timezone),
      occurredAt: row.due_at ?? row.planned_at ?? row.created_at,
      similarity: null,
    });
  }
  for (const row of reminders) {
    if (!sendable(row.entry_id, row.id)) { withheld += 1; continue; }
    sources.push({
      id: `reminder:${row.id}`,
      type: "reminder",
      content: reminderSentence(row, input.locale, input.timezone),
      occurredAt: row.remind_at,
      similarity: null,
    });
  }
  return { sources, withheld, failed };
}
