import type { Locale } from "@/lib/preferences";

import type { MemoryLifecycleState } from "./lifecycle";
import type { MemoryKind, MemorySensitivity } from "./schema";

/**
 * The Memories copy, as one typed record per locale (ADR-036).
 *
 * `satisfies Record<Locale, MemoryCopy>` makes a missing key or a missing locale
 * a compile error. That is what closes the two localization faults this surface
 * shipped with (UX-21): the page rendered `memory.kind.replaceAll("_", " ")` for
 * English readers — the raw database enum, spaced — and kept its ten Portuguese
 * kind labels in a module-scope `Record<string, string>` that had no English
 * counterpart at all.
 *
 * The explanatory sentences are part of the contract rather than page decoration.
 * UX-10 is that memories have no mental model: nothing in the product ever said
 * what a memory *is*, how it differs from a captured entry, or when the
 * assistant is allowed to use one. Those sentences live here so both locales say
 * the same thing and neither can drift.
 */

type MemoryCopy = {
  /** What this thing is, said once, where the owner first meets it. */
  readonly eyebrow: string;
  readonly title: string;
  readonly intro: string;
  readonly whatIsIt: string;
  readonly howItDiffers: string;
  /** When the assistant may use it — the honest version, matching the filter. */
  readonly retrievalActive: string;
  readonly retrievalArchived: string;
  readonly retrievalScheduled: string;

  readonly backToList: string;
  readonly detailLink: string;

  /**
   * `2P-MEMORY-001` … `-004` — the deliberate composer that replaced the
   * one-line field.
   *
   * `composeProvenanceNone` is the sentence that must never become "informed by
   * you". A memory written here carries `source_entry_id = null`, and the column
   * is `on delete set null`, so the list renders it `unsourced`. A composer
   * claiming owner-authorship would contradict the surface the memory lands on
   * — and would be inventing an origin the row cannot express.
   */
  readonly composeOpen: string;
  readonly composeTitle: string;
  readonly composeDescription: string;
  readonly composeFieldLabel: string;
  readonly composePlaceholder: string;
  readonly composeReviewStep: string;
  readonly composeReviewHeading: string;
  readonly composeBack: string;
  readonly composeSubmit: string;
  readonly composeCancel: string;
  readonly composeClose: string;
  /**
   * The discard question — slice 2R.3's second device checkpoint.
   *
   * The dialog can now be dismissed by tapping outside it, and this one holds a
   * sentence the owner wrote by hand. `ConfirmDialog` asks before losing it and
   * takes the words from here, having no locale of its own.
   */
  readonly composeDiscardPrompt: string;
  readonly composeDiscardConfirm: string;
  readonly composeDiscardResume: string;
  readonly composeEmpty: string;
  readonly composeProvenanceNone: string;
  readonly composeUndo: string;
  readonly composeUndoing: string;

  /** Lifecycle. */
  readonly states: Readonly<Record<MemoryLifecycleState, string>>;
  readonly archive: string;
  readonly archiving: string;
  readonly archived: string;
  readonly restore: string;
  readonly restoring: string;
  readonly restored: string;
  readonly archiveExplainer: string;
  /**
   * `2N-KNOWS-004` — three distinct freshness facts, not two.
   *
   * `recordedAt` is `created_at` and it is its own fact. The page previously
   * printed `valid_from ?? created_at` under `validFrom`, which made a memory
   * with no start date read as though it began the day it was typed. A memory
   * recorded in March can be in force from January; those are different
   * questions and each label now answers only its own.
   */
  readonly recordedAt: string;
  readonly validFrom: string;
  /** An absent start boundary, said as absent rather than filled in. */
  readonly validFromAlways: string;
  readonly validUntil: string;
  readonly validAlways: string;

  /**
   * The corrections band (`2N-CORRECT-002`, and the *histórico* half of the
   * memory workspace).
   *
   * Its own two strings rather than the project's, because both name the
   * subject and the trail's scope: a shared "neste projeto" would have appeared
   * under a memory. The heading is shared — one section, one name.
   */
  readonly changesExplainer: string;
  readonly changesEmpty: string;

  /** Provenance and relations. */
  readonly provenance: string;
  /*
   * `provenanceFromEntry`, `provenanceManual` and `provenanceUnknown` were
   * RETIRED by slice 2N.3 rather than left unused.
   *
   * Two of the three were false. "Criada por você" / "Created by you" was
   * printed whenever `source_entry_id` was null — but the column is
   * `on delete set null`, so that also covers a memory whose source entry the
   * owner deleted, and the string turned an absence into a positive claim
   * about where knowledge came from. "O registro de origem não existe mais"
   * was printed whenever the row did not come back, which under RLS also
   * covers a foreign or unreadable entry, and asserted the non-existence of a
   * record the page cannot see.
   *
   * The wording now comes from `src/features/provenance/copy.ts`, which the
   * person and project pages already share, and where `unsourced` is one arm
   * that says nothing about why. Deleted rather than deprecated: a copy string
   * that still exists is one a later surface can still render.
   */
  readonly relatedPerson: string;
  readonly relatedProject: string;
  readonly relatedNone: string;

  /** Classification. */
  readonly kindLabel: string;
  readonly kinds: Readonly<Record<MemoryKind, string>>;
  readonly sensitivityLabel: string;
  readonly sensitivities: Readonly<Record<MemorySensitivity, string>>;
  readonly importantLabel: string;
  readonly importantBadge: string;
  readonly importantExplainer: string;

  /** Editing. */
  readonly edit: string;
  readonly cancel: string;
  readonly save: string;
  readonly saving: string;
  readonly saved: string;
  readonly contentLabel: string;

  /** Failures, each one a distinct thing the owner can act on. */
  readonly invalidInput: string;
  readonly sessionExpired: string;
  readonly notFound: string;
  readonly saveFailed: string;
  readonly unknownRelation: string;

  /** Empty states. */
  readonly emptyTitle: string;
  readonly emptyBody: string;

  /** The confirmed-memory proposal (DEC-5). */
  readonly proposalHeading: string;
  readonly proposalDetail: string;
  readonly proposalConfirm: string;
  readonly proposalConfirming: string;
  readonly proposalDiscard: string;
  readonly proposalDiscarded: string;
  readonly proposalCreated: string;
  readonly proposalDuplicate: string;
  readonly proposalEmpty: string;
  readonly proposalView: string;
  /**
   * `2K-ACT-009` — the conversational undo, which archives (OD-2K-3).
   *
   * Every sentence here is asserted **negatively** in `undo.test.ts`, in both
   * locales: none of them may contain deletion wording. That is not stylistic.
   * The row survives, so a control that implied removal would be the one
   * outcome OD-2K-3 forbids by name, and "deleted" is the word a well-meaning
   * contributor reaches for when writing an undo.
   */
  readonly conversationalUndo: string;
  readonly conversationalUndoing: string;
  readonly conversationalUndone: string;
  readonly conversationalUndoNote: string;
  readonly conversationalRestore: string;
  readonly conversationalRestored: string;
};

const copy = {
  "pt-BR": {
    eyebrow: "CONHECIMENTO DURADOURO",
    title: "Memórias",
    intro: "O que continua valendo depois que a conversa acaba.",
    whatIsIt:
      "Uma memória é um fato ou preferência sua que permanece verdadeiro ao longo do tempo, guardado para que você não precise repetir.",
    howItDiffers:
      "Um registro conta o que aconteceu num momento. Uma memória diz o que continua valendo — por isso ela é consultada em toda conversa, e um registro não.",
    retrievalActive: "Em vigor: pode ser usada nas respostas agora.",
    retrievalArchived: "Arquivada: não é mais usada nas respostas.",
    retrievalScheduled: "Programada: só passa a ser usada na data de início.",

    backToList: "Memórias",
    detailLink: "Abrir memória",

    composeOpen: "Nova memória",
    composeTitle: "Nova memória",
    composeDescription:
      "Uma memória é um fato ou preferência sua que continua valendo com o tempo — por isso ela é consultada em toda conversa. Se for algo que aconteceu num momento só, registre como um registro, não como memória.",
    composeFieldLabel: "O que deve continuar valendo",
    composePlaceholder: "Ex.: prefiro reuniões pela manhã e no máximo de 30 minutos.",
    composeReviewStep: "Revisar",
    composeReviewHeading: "É isto que vou guardar:",
    composeBack: "Voltar e editar",
    composeSubmit: "Guardar memória",
    composeCancel: "Cancelar",
    composeClose: "Fechar",
    composeDiscardPrompt: "Descartar esta memória? O que você escreveu será perdido.",
    composeDiscardConfirm: "Descartar",
    composeDiscardResume: "Continuar editando",
    composeEmpty: "Escreva a memória antes de revisar.",
    composeProvenanceNone: "Sem registro de origem: esta memória não veio de uma captura.",
    composeUndo: "Desfazer",
    composeUndoing: "Desfazendo…",

    states: { scheduled: "Programada", active: "Em vigor", archived: "Arquivada" },
    archive: "Arquivar",
    archiving: "Arquivando…",
    archived: "Memória arquivada.",
    restore: "Reativar",
    restoring: "Reativando…",
    restored: "Memória reativada.",
    archiveExplainer:
      "Arquivar encerra a validade e tira a memória das respostas. Nada é apagado: o texto e a origem continuam aqui.",
    recordedAt: "Registrada em",
    validFrom: "Vale desde",
    validFromAlways: "Sem data de início",
    // Neutral tense on purpose. The same row is rendered for a memory that is
    // still in force, and "Valeu até" would state in the past tense something
    // that is currently true.
    validUntil: "Vale até",
    validAlways: "Sem prazo",
    changesExplainer: "Vem do registro de alterações: correções e arquivamentos desta memória. O texto anterior não é reescrito.",
    changesEmpty: "Nenhuma alteração registrada nesta memória ainda.",

    provenance: "Origem",
    relatedPerson: "Pessoa",
    relatedProject: "Projeto",
    relatedNone: "Nenhum",

    kindLabel: "Tipo",
    kinds: {
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
    sensitivityLabel: "Sensibilidade",
    sensitivities: { normal: "Normal", private: "Privada", highly_sensitive: "Muito sensível" },
    importantLabel: "Marcar como importante",
    importantBadge: "Importante",
    importantExplainer: "Memórias importantes aparecem primeiro nesta lista.",

    edit: "Editar",
    cancel: "Cancelar",
    save: "Salvar",
    saving: "Salvando…",
    saved: "Alterações salvas.",
    contentLabel: "Memória",

    invalidInput: "Revise os campos.",
    sessionExpired: "Sua sessão expirou.",
    notFound: "Esta memória não existe mais.",
    saveFailed: "Não foi possível salvar agora.",
    unknownRelation: "Escolha uma pessoa ou projeto que existe.",

    emptyTitle: "Nenhuma memória ainda",
    emptyBody: "Escreva algo que deve continuar valendo, ou peça ao assistente para lembrar.",

    proposalHeading: "Quer que eu guarde isto?",
    proposalDetail: "Nada foi salvo ainda. Revise o texto e o tipo antes de confirmar.",
    proposalConfirm: "Guardar memória",
    proposalConfirming: "Guardando…",
    proposalDiscard: "Descartar",
    proposalDiscarded: "Nada foi guardado.",
    proposalCreated: "Memória guardada.",
    proposalDuplicate: "Você já tem essa memória.",
    proposalEmpty: "Diga o que eu devo lembrar.",
    proposalView: "Ver memória",
    conversationalUndo: "Arquivar essa memória",
    conversationalUndoing: "Arquivando…",
    conversationalUndone: "Memória arquivada. Ela saiu de uso e continua guardada no seu histórico.",
    conversationalUndoNote: "Arquivar tira a memória de uso: o Brain deixa de usá-la nas respostas, e o registro continua lá.",
    conversationalRestore: "Voltar a usar essa memória",
    conversationalRestored: "Memória de volta em uso.",
  },
  en: {
    eyebrow: "LASTING KNOWLEDGE",
    title: "Memories",
    intro: "What stays true after the conversation ends.",
    whatIsIt:
      "A memory is a fact or preference of yours that stays true over time, kept so you never have to repeat it.",
    howItDiffers:
      "A record says what happened at a moment. A memory says what still holds — which is why it is consulted in every conversation, and a record is not.",
    retrievalActive: "In force: can be used in answers now.",
    retrievalArchived: "Archived: no longer used in answers.",
    retrievalScheduled: "Scheduled: only used from its start date.",

    backToList: "Memories",
    detailLink: "Open memory",

    composeOpen: "New memory",
    composeTitle: "New memory",
    composeDescription:
      "A memory is a fact or preference of yours that stays true over time — which is why it is consulted in every conversation. If it happened once and is over, record it as a record, not as a memory.",
    composeFieldLabel: "What should stay true",
    composePlaceholder: "e.g. I prefer meetings in the morning and no longer than 30 minutes.",
    composeReviewStep: "Review",
    composeReviewHeading: "This is what I will keep:",
    composeBack: "Back and edit",
    composeSubmit: "Keep this memory",
    composeCancel: "Cancel",
    composeClose: "Close",
    composeDiscardPrompt: "Discard this memory? What you wrote will be lost.",
    composeDiscardConfirm: "Discard",
    composeDiscardResume: "Keep editing",
    composeEmpty: "Write the memory before reviewing.",
    composeProvenanceNone: "No source record: this memory did not come from a capture.",
    composeUndo: "Undo",
    composeUndoing: "Undoing…",

    states: { scheduled: "Scheduled", active: "In force", archived: "Archived" },
    archive: "Archive",
    archiving: "Archiving…",
    archived: "Memory archived.",
    restore: "Reactivate",
    restoring: "Reactivating…",
    restored: "Memory reactivated.",
    archiveExplainer:
      "Archiving ends the validity and takes the memory out of answers. Nothing is deleted: the text and its origin stay here.",
    recordedAt: "Recorded on",
    validFrom: "Valid from",
    validFromAlways: "No start date",
    // Neutral tense: this row also renders for a memory still in force, where
    // "Was valid until" would put a currently-true fact in the past.
    validUntil: "Valid until",
    validAlways: "No end date",
    changesExplainer: "From the recorded changes: corrections and archivings of this memory. The earlier text is not rewritten.",
    changesEmpty: "No change has been recorded on this memory yet.",

    provenance: "Origin",
    relatedPerson: "Person",
    relatedProject: "Project",
    relatedNone: "None",

    kindLabel: "Type",
    kinds: {
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
    sensitivityLabel: "Sensitivity",
    sensitivities: { normal: "Normal", private: "Private", highly_sensitive: "Highly sensitive" },
    importantLabel: "Mark as important",
    importantBadge: "Important",
    importantExplainer: "Important memories appear first in this list.",

    edit: "Edit",
    cancel: "Cancel",
    save: "Save",
    saving: "Saving…",
    saved: "Changes saved.",
    contentLabel: "Memory",

    invalidInput: "Review the fields.",
    sessionExpired: "Your session expired.",
    notFound: "This memory no longer exists.",
    saveFailed: "We could not save right now.",
    unknownRelation: "Pick a person or project that exists.",

    emptyTitle: "No memories yet",
    emptyBody: "Write something that should keep holding, or ask the assistant to remember it.",

    proposalHeading: "Want me to keep this?",
    proposalDetail: "Nothing has been saved yet. Check the text and type before confirming.",
    proposalConfirm: "Keep memory",
    proposalConfirming: "Keeping…",
    proposalDiscard: "Discard",
    proposalDiscarded: "Nothing was kept.",
    proposalCreated: "Memory kept.",
    proposalDuplicate: "You already have that memory.",
    proposalEmpty: "Tell me what to remember.",
    proposalView: "View memory",
    conversationalUndo: "Archive that memory",
    conversationalUndoing: "Archiving…",
    conversationalUndone: "Memory archived. It is out of use and still on file in your history.",
    conversationalUndoNote: "Archiving withdraws the memory from use: the Brain stops drawing on it in answers, and the record stays.",
    conversationalRestore: "Put that memory back in use",
    conversationalRestored: "Memory back in use.",
  },
} satisfies Record<Locale, MemoryCopy>;

export function getMemoryCopy(locale: Locale): MemoryCopy {
  return copy[locale];
}
