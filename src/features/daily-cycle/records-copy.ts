import type { DailyCycleLocale } from "./copy";

/**
 * Registros' own copy, as a typed feature module.
 *
 * The engineering standards make a typed `copy.ts` the canonical mechanism for
 * new user-facing text (ADR-036), and UX-22's rule is that a slice leaves no
 * more inline locale ternaries than it found. The queue's column headers, its
 * view names and its one-line proposals are all new copy, so none of them is a
 * `pt ? … : …` in the component.
 */
export type RecordsCopy = {
  readonly columns: {
    readonly state: string;
    readonly record: string;
    readonly proposal: string;
    readonly when: string;
  };
  readonly views: {
    readonly needsYou: string;
    readonly organizing: string;
    readonly failed: string;
    readonly recordOnly: string;
    readonly all: string;
    /** Names the chip group for assistive technology. */
    readonly label: string;
  };
  readonly states: { readonly recordOnly: string };
  /** One line saying what is at stake, per row. Never blank. */
  readonly proposals: {
    readonly question: string;
    readonly candidates: string;
    readonly review: string;
    readonly inconsistent: string;
    readonly failed: string;
    readonly noCredential: string;
    readonly organizing: string;
    readonly nothing: string;
    readonly done: string;
    readonly saved: string;
  };
  readonly emptyByView: {
    readonly organizing: string;
    readonly failed: string;
    readonly recordOnly: string;
  };
  /** The queue's own subtitle under the heading, per view. */
  readonly lead: {
    readonly needsYou: string;
    readonly all: string;
  };
};

export const recordsCopy = {
  "pt-BR": {
    columns: { state: "estado", record: "registro", proposal: "o que o Brain propõe", when: "quando" },
    views: {
      needsYou: "Precisa de você",
      organizing: "Organizando",
      failed: "Falhas",
      recordOnly: "Só registro",
      all: "Tudo",
      label: "Visões de Registros",
    },
    states: { recordOnly: "Só registro" },
    proposals: {
      question: "1 pergunta pendente",
      candidates: "sugestões aguardando sua decisão",
      review: "interpretação para revisar",
      inconsistent: "inconsistência preservada para revisão",
      failed: "não foi possível organizar · texto intacto",
      noCredential: "sem chave de IA configurada",
      organizing: "lendo agora",
      nothing: "nada a fazer",
      done: "organizado",
      saved: "salvo",
    },
    emptyByView: {
      organizing: "Nada está sendo organizado agora.",
      failed: "Nenhuma falha. Nada ficou pelo caminho.",
      recordOnly: "Nenhum registro sem ação até agora.",
    },
    lead: {
      needsYou: "Nada aqui virou tarefa, memória ou lembrete ainda.",
      all: "Tudo que você entregou ao Brain, com o original sempre preservado.",
    },
  },
  en: {
    columns: { state: "state", record: "record", proposal: "what Brain proposes", when: "when" },
    views: {
      needsYou: "Needs you",
      organizing: "Organizing",
      failed: "Failures",
      recordOnly: "Record only",
      all: "All",
      label: "Record views",
    },
    states: { recordOnly: "Record only" },
    proposals: {
      question: "1 pending question",
      candidates: "suggestions waiting on your decision",
      review: "interpretation to review",
      inconsistent: "inconsistency kept for review",
      failed: "couldn't organize · text intact",
      noCredential: "no AI key configured",
      organizing: "reading now",
      nothing: "nothing to do",
      done: "organized",
      saved: "saved",
    },
    emptyByView: {
      organizing: "Nothing is being organized right now.",
      failed: "No failures. Nothing was left behind.",
      recordOnly: "No record without an action so far.",
    },
    lead: {
      needsYou: "Nothing here has become a task, memory or reminder yet.",
      all: "Everything you handed to Brain, with the original always preserved.",
    },
  },
} as const satisfies Record<DailyCycleLocale, RecordsCopy>;

export function getRecordsCopy(locale: DailyCycleLocale): RecordsCopy {
  return recordsCopy[locale];
}
