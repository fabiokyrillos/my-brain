/**
 * The object-state vocabulary, for the surfaces that render another feature's
 * state as a badge (UX-21).
 *
 * The audit's finding was that raw database enums reach the screen as labels:
 * `{project.status}` on the project list, `{task.status}` on a person's page,
 * `{memory.kind}` beside a memory, `{file.status}` on Files. English users saw
 * `recurring info`; Portuguese users saw `active`. Slice G4 closed History's
 * share by giving History its own typed vocabulary, and G3 and G5 did the same
 * for Memories and Reminders — but each of those modules serves *its own*
 * feature, and the leftover sites are all cases of one feature rendering
 * another's state.
 *
 * This module is that shared vocabulary, and nothing else. It holds no
 * sentences, no page copy and no feature behaviour — only the closed sets a
 * database `check` constraint already defines, and one label per member per
 * locale. `Record<Union, string>` makes an unlabelled member a **type** error
 * rather than a runtime fallback, so a new enum value cannot ship as a raw
 * string the way these did.
 *
 * `replaceAll("_", " ")` is not localization and is deliberately absent.
 *
 * Where a vocabulary already had a typed home that ships (`memories/copy.ts`
 * for memory kinds, `history/copy.ts` for the History register), this module
 * does not replace it — `copy.drift.test.ts` asserts the overlapping labels stay
 * identical, so two homes can never mean two answers.
 */

import type { Locale } from "@/lib/preferences";

/** `public.tasks.status` — `202607160003:111`. */
export const TASK_STATUSES = [
  "inbox",
  "todo",
  "in_progress",
  "waiting",
  "blocked",
  "deferred",
  "completed",
  "cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** `public.projects.status` — `202607160003:28`. Shares only `completed` with tasks. */
export const PROJECT_STATUSES = ["active", "paused", "completed", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** `public.contexts.kind` — `202607160003:6`. */
export const CONTEXT_KINDS = ["work", "personal", "custom"] as const;
export type ContextKind = (typeof CONTEXT_KINDS)[number];

/** `public.memories.kind` — mirrors `memories/schema.ts`, asserted by the drift test. */
export const MEMORY_KINDS = [
  "preference",
  "relationship",
  "responsibility",
  "rule",
  "recurring_info",
  "professional_context",
  "habit",
  "restriction",
  "goal",
  "fact",
] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

/** `public.attachments.status` — `202607160007:107`. */
export const ATTACHMENT_STATUSES = ["uploaded", "processing", "ready", "failed"] as const;
export type AttachmentStatus = (typeof ATTACHMENT_STATUSES)[number];

/** `public.jobs.status` — `202607160007:133`. */
export const JOB_STATUSES = ["pending", "running", "completed", "failed", "cancelled"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/**
 * `public.jobs.type` has **no** `check` constraint — it is open text by design,
 * so a new worker can be added without a migration. The two types that exist
 * today are named here; anything else falls back to the raw value, which is the
 * one place in the product where that is the correct answer rather than a
 * defect. See `JOB_TYPE_FALLBACK` and the note on `/app/jobs` in the ledger.
 */
export const KNOWN_JOB_TYPES = ["process_attachment", "interpret_entry"] as const;
export type KnownJobType = (typeof KNOWN_JOB_TYPES)[number];

/** `public.entry_entities.entity_type` — `202607160003:93`. */
export const ENTITY_TYPES = ["context", "organization", "project", "person"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export type VocabularyCopy = {
  readonly taskStatuses: Readonly<Record<TaskStatus, string>>;
  readonly projectStatuses: Readonly<Record<ProjectStatus, string>>;
  readonly contextKinds: Readonly<Record<ContextKind, string>>;
  readonly memoryKinds: Readonly<Record<MemoryKind, string>>;
  readonly attachmentStatuses: Readonly<Record<AttachmentStatus, string>>;
  readonly jobStatuses: Readonly<Record<JobStatus, string>>;
  readonly jobTypes: Readonly<Record<KnownJobType, string>>;
  readonly entityTypes: Readonly<Record<EntityType, string>>;
  /**
   * What to render when a stored value is outside its own `check` constraint.
   *
   * That is a data fault rather than a display case, and it should not be able
   * to happen — but if it does, the owner should read a sentence, not the byte
   * that broke. Showing the raw value "just this once" is how UX-21 started.
   */
  readonly unknownState: string;
};

const ptBR: VocabularyCopy = {
  taskStatuses: {
    inbox: "Caixa de entrada",
    todo: "A fazer",
    in_progress: "Em andamento",
    waiting: "Aguardando",
    blocked: "Bloqueada",
    deferred: "Adiada",
    completed: "Concluída",
    cancelled: "Cancelada",
  },
  projectStatuses: {
    active: "Ativo",
    paused: "Pausado",
    completed: "Concluído",
    archived: "Arquivado",
  },
  contextKinds: {
    work: "Trabalho",
    personal: "Pessoal",
    custom: "Personalizado",
  },
  memoryKinds: {
    preference: "Preferência",
    relationship: "Relacionamento",
    responsibility: "Responsabilidade",
    rule: "Regra",
    recurring_info: "Informação recorrente",
    professional_context: "Contexto profissional",
    habit: "Hábito",
    restriction: "Restrição",
    goal: "Objetivo",
    fact: "Fato",
  },
  attachmentStatuses: {
    uploaded: "Enviado",
    processing: "Processando",
    ready: "Pronto",
    failed: "Falhou",
  },
  jobStatuses: {
    pending: "Na fila",
    running: "Em execução",
    completed: "Concluído",
    failed: "Falhou",
    cancelled: "Cancelado",
  },
  jobTypes: {
    process_attachment: "Processar arquivo",
    interpret_entry: "Interpretar registro",
  },
  entityTypes: {
    context: "Contexto",
    organization: "Empresa",
    project: "Projeto",
    person: "Pessoa",
  },
  unknownState: "Situação desconhecida",
};

const en: VocabularyCopy = {
  taskStatuses: {
    inbox: "Inbox",
    todo: "To do",
    in_progress: "In progress",
    waiting: "Waiting",
    blocked: "Blocked",
    deferred: "Deferred",
    completed: "Completed",
    cancelled: "Cancelled",
  },
  projectStatuses: {
    active: "Active",
    paused: "Paused",
    completed: "Completed",
    archived: "Archived",
  },
  contextKinds: {
    work: "Work",
    personal: "Personal",
    custom: "Custom",
  },
  memoryKinds: {
    preference: "Preference",
    relationship: "Relationship",
    responsibility: "Responsibility",
    rule: "Rule",
    recurring_info: "Recurring information",
    professional_context: "Professional context",
    habit: "Habit",
    restriction: "Restriction",
    goal: "Goal",
    fact: "Fact",
  },
  attachmentStatuses: {
    uploaded: "Uploaded",
    processing: "Processing",
    ready: "Ready",
    failed: "Failed",
  },
  jobStatuses: {
    pending: "Queued",
    running: "Running",
    completed: "Completed",
    failed: "Failed",
    cancelled: "Cancelled",
  },
  jobTypes: {
    process_attachment: "Process file",
    interpret_entry: "Interpret record",
  },
  entityTypes: {
    context: "Context",
    organization: "Company",
    project: "Project",
    person: "Person",
  },
  unknownState: "Unknown state",
};

export function getVocabularyCopy(locale: Locale): VocabularyCopy {
  return locale === "pt-BR" ? ptBR : en;
}

/**
 * The label, or `null` when the stored value is outside the closed set.
 *
 * A caller that gets `null` must decide what to show — these never invent a
 * label and never fall back to the raw value on their own, because that is the
 * behaviour UX-21 was raised about. The one deliberate exception is
 * `jobTypeLabel`, whose column has no constraint to be outside of.
 */
function lookup<T extends string>(
  members: readonly T[],
  labels: Readonly<Record<T, string>>,
  value: string,
): string | null {
  return (members as readonly string[]).includes(value) ? labels[value as T] : null;
}

export function taskStatusLabel(locale: Locale, value: string): string | null {
  return lookup(TASK_STATUSES, getVocabularyCopy(locale).taskStatuses, value);
}

export function projectStatusLabel(locale: Locale, value: string): string | null {
  return lookup(PROJECT_STATUSES, getVocabularyCopy(locale).projectStatuses, value);
}

export function contextKindLabel(locale: Locale, value: string): string | null {
  return lookup(CONTEXT_KINDS, getVocabularyCopy(locale).contextKinds, value);
}

export function memoryKindLabel(locale: Locale, value: string): string | null {
  return lookup(MEMORY_KINDS, getVocabularyCopy(locale).memoryKinds, value);
}

export function attachmentStatusLabel(locale: Locale, value: string): string | null {
  return lookup(ATTACHMENT_STATUSES, getVocabularyCopy(locale).attachmentStatuses, value);
}

export function jobStatusLabel(locale: Locale, value: string): string | null {
  return lookup(JOB_STATUSES, getVocabularyCopy(locale).jobStatuses, value);
}

export function entityTypeLabel(locale: Locale, value: string): string | null {
  return lookup(ENTITY_TYPES, getVocabularyCopy(locale).entityTypes, value);
}

/**
 * The job type, or the raw value when a worker exists that this module has not
 * been taught about. `/app/jobs` is a private technical queue and says so in its
 * own subtitle; showing an unknown worker's identifier there is more useful than
 * hiding it behind "Outro", and the column has no constraint that would let a
 * type system prevent it.
 */
export function jobTypeLabel(locale: Locale, value: string): string {
  return lookup(KNOWN_JOB_TYPES, getVocabularyCopy(locale).jobTypes, value) ?? value;
}
