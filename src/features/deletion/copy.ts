import type { Locale } from "@/lib/preferences";

import type {
  ConsequenceKey,
  DeletableEntityType,
  DeletionOutcome,
  RetentionKind,
} from "./contracts";

/**
 * The deletion copy, as one typed record per locale (ADR-036, `2N-ACCESS-005`).
 *
 * `satisfies Record<Locale, DeletionCopy>` makes a missing key or a missing
 * locale a compile error, and the three nested records are exhaustive over
 * their own vocabularies — so a consequence the database starts counting, a
 * retention the server starts naming, or an outcome the action starts returning
 * cannot ship without a sentence in both languages.
 *
 * ## Why the consequence sentences are functions of a count
 *
 * Every one of them prints a number the database produced. `2N-CORRECT-010`
 * forbids estimates where the database can count, and the counterpart rule for
 * copy is that the sentence must not round, bucket or soften what it was given:
 * "3 relações serão removidas" and not "algumas relações". The singular and
 * plural forms are separate strings rather than one with a suffix, because
 * Portuguese and English disagree about more than the `s`.
 *
 * ## Why retention has its own vocabulary
 *
 * `2N-CORRECT-012`: if the product retains anything after a deletion it says so
 * **in the preview** and calls it retention, not removal. These four sentences
 * are the only place that promise is kept, and they are deliberately concrete —
 * "o arquivo continua na sua biblioteca" tells the owner something they can go
 * and check, where "alguns dados são mantidos" would not.
 *
 * ## The word this module may never use for an archive
 *
 * `2N-CORRECT-002` keeps archiving and removal distinct, and `memories/undo.ts`
 * already asserts, negatively and in both locales, that an archive is never
 * called a delete. This module is the other half of that rule: nothing here may
 * describe a deletion as archiving or withdrawal, because a removal that reads
 * as reversible is the same lie pointing the other way.
 */

type DeletionCopy = {
  /** The control that opens the flow, per subject. */
  readonly trigger: Readonly<Record<DeletableEntityType, string>>;
  readonly dialogTitle: Readonly<Record<DeletableEntityType, string>>;

  /** What the preview is, said before the numbers. */
  readonly previewIntro: string;
  readonly previewLoading: string;
  /** The honest empty state: nothing else is touched. */
  readonly nothingElseAffected: string;

  readonly consequenceHeading: string;
  readonly consequences: Readonly<Record<ConsequenceKey, (count: number) => string>>;

  readonly retentionHeading: string;
  readonly retention: Readonly<Record<RetentionKind, string>>;

  readonly undoAvailable: string;
  readonly undoWindow: string;
  readonly undoAction: string;

  readonly cancel: string;
  readonly confirm: string;
  readonly confirming: string;

  readonly outcomes: Readonly<Record<DeletionOutcome, string>>;
};

const ptBR: DeletionCopy = {
  trigger: {
    person: "Excluir esta pessoa",
    project: "Excluir este projeto",
    memory: "Excluir esta memória",
  },
  dialogTitle: {
    person: "Excluir esta pessoa?",
    project: "Excluir este projeto?",
    memory: "Excluir esta memória?",
  },

  previewIntro: "Antes de confirmar, veja exatamente o que será removido. Estes números vêm do banco de dados, não são estimativas.",
  previewLoading: "Levantando o que será afetado…",
  nothingElseAffected: "Nada mais é afetado. Nenhum vínculo, associação, tarefa, arquivo ou anotação depende deste registro.",

  consequenceHeading: "O que será removido",
  consequences: {
    relations: (n) => (n === 1 ? "1 relação com outra pessoa" : `${n} relações com outras pessoas`),
    projectLinks: (n) => (n === 1 ? "1 associação com projeto" : `${n} associações com projetos`),
    taskLinks: (n) => (n === 1 ? "1 tarefa vinculada ao projeto" : `${n} tarefas vinculadas ao projeto`),
    contextLinks: (n) => (n === 1 ? "1 vínculo com contexto" : `${n} vínculos com contextos`),
    taskAssignments: (n) => (n === 1 ? "1 atribuição em tarefa" : `${n} atribuições em tarefas`),
    tasksWaiting: (n) =>
      n === 1
        ? "1 tarefa que espera por esta pessoa ficará sem ninguém a aguardar"
        : `${n} tarefas que esperam por esta pessoa ficarão sem ninguém a aguardar`,
    linkedMemories: (n) =>
      n === 1
        ? "1 memória perderá este vínculo, mas o texto dela permanece"
        : `${n} memórias perderão este vínculo, mas os textos delas permanecem`,
    entryMentions: (n) => (n === 1 ? "1 menção em anotação" : `${n} menções em anotações`),
    aliases: (n) => (n === 1 ? "1 apelido" : `${n} apelidos`),
    tags: (n) => (n === 1 ? "1 etiqueta" : `${n} etiquetas`),
    linkedFiles: (n) => (n === 1 ? "1 vínculo com arquivo" : `${n} vínculos com arquivos`),
  },

  retentionHeading: "O que é mantido",
  retention: {
    audit_trail: "O histórico registra que você excluiu, quando — e não guarda o conteúdo excluído.",
    telemetry: "Um evento de uso sem conteúdo algum.",
    linked_files: "Os arquivos continuam na sua biblioteca. Só o vínculo com este registro é desfeito.",
    undo_snapshot_24h: "Uma cópia do que foi removido fica guardada por 24 horas — é ela que permite desfazer. Depois disso, a exclusão é definitiva.",
  },

  undoAvailable: "Você pode desfazer esta exclusão.",
  undoWindow: "O desfazer fica disponível por 24 horas.",
  undoAction: "Desfazer exclusão",

  cancel: "Cancelar",
  confirm: "Excluir definitivamente",
  confirming: "Excluindo…",

  outcomes: {
    deleted: "Excluído.",
    undone: "Exclusão desfeita. Tudo voltou como estava.",
    stale: "Algo mudou desde que você viu esta lista. Confira as consequências atualizadas antes de confirmar.",
    unconfirmed: "Esta confirmação não vale mais. Comece de novo para ver as consequências atuais.",
    unavailable: "Não foi possível abrir este registro.",
    failed: "Não foi possível concluir a exclusão. Nada foi removido.",
  },
} as const;

const en: DeletionCopy = {
  trigger: {
    person: "Delete this person",
    project: "Delete this project",
    memory: "Delete this memory",
  },
  dialogTitle: {
    person: "Delete this person?",
    project: "Delete this project?",
    memory: "Delete this memory?",
  },

  previewIntro: "Before you confirm, here is exactly what will be removed. These numbers come from the database — they are not estimates.",
  previewLoading: "Working out what this affects…",
  nothingElseAffected: "Nothing else is affected. No link, association, task, file or note depends on this record.",

  consequenceHeading: "What will be removed",
  consequences: {
    relations: (n) => (n === 1 ? "1 relationship with another person" : `${n} relationships with other people`),
    projectLinks: (n) => (n === 1 ? "1 project association" : `${n} project associations`),
    taskLinks: (n) => (n === 1 ? "1 task linked to the project" : `${n} tasks linked to the project`),
    contextLinks: (n) => (n === 1 ? "1 context link" : `${n} context links`),
    taskAssignments: (n) => (n === 1 ? "1 task assignment" : `${n} task assignments`),
    tasksWaiting: (n) =>
      n === 1
        ? "1 task waiting on this person will be left waiting on nobody"
        : `${n} tasks waiting on this person will be left waiting on nobody`,
    linkedMemories: (n) =>
      n === 1
        ? "1 memory will lose this link, but its text stays"
        : `${n} memories will lose this link, but their text stays`,
    entryMentions: (n) => (n === 1 ? "1 mention in a note" : `${n} mentions in notes`),
    aliases: (n) => (n === 1 ? "1 nickname" : `${n} nicknames`),
    tags: (n) => (n === 1 ? "1 tag" : `${n} tags`),
    linkedFiles: (n) => (n === 1 ? "1 file link" : `${n} file links`),
  },

  retentionHeading: "What is kept",
  retention: {
    audit_trail: "History records that you deleted it, and when — and keeps none of the deleted content.",
    telemetry: "A usage event carrying no content at all.",
    linked_files: "Files stay in your library. Only the link to this record is undone.",
    undo_snapshot_24h: "A copy of what was removed is held for 24 hours — that is what makes undo possible. After that, the deletion is permanent.",
  },

  undoAvailable: "You can undo this deletion.",
  undoWindow: "Undo stays available for 24 hours.",
  undoAction: "Undo deletion",

  cancel: "Cancel",
  confirm: "Delete permanently",
  confirming: "Deleting…",

  outcomes: {
    deleted: "Deleted.",
    undone: "Deletion undone. Everything is back as it was.",
    stale: "Something changed since you saw this list. Check the updated consequences before confirming.",
    unconfirmed: "This confirmation is no longer valid. Start again to see the current consequences.",
    unavailable: "That record could not be opened.",
    failed: "The deletion could not be completed. Nothing was removed.",
  },
} as const;

const DELETION_COPY = { "pt-BR": ptBR, en } satisfies Record<Locale, DeletionCopy>;

export function getDeletionCopy(locale: Locale): DeletionCopy {
  return DELETION_COPY[locale];
}

export type { DeletionCopy };
