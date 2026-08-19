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
    /**
     * `BYOK-CAPTURE-002`. Offered only when the account actually holds entries in
     * this state — a chip that always yields nothing is a control that lies, and
     * the attention queue's own filter row already follows that rule.
     */
    readonly awaitingAi: string;
    readonly all: string;
    /** Names the chip group for assistive technology. */
    readonly label: string;
  };
  readonly states: { readonly recordOnly: string };
  /**
   * Slice 2P.5. Perguntas, as a view OF Registros rather than as a destination
   * Hoje advertises.
   *
   * `capabilities.ts`'s census records Perguntas as one of the two things `Mais`
   * was the only mobile route to, and it names this exact fix: *"the handoff
   * makes Perguntas a view of Registros rather than a destination Hoje
   * advertises, and adding a permanent control to the cockpit to make this
   * census true would be arranging the product around its own bookkeeping."*
   *
   * Registros is a bar slot, so this puts Perguntas one tap from the bar — which
   * is what retiring `Mais` needed. Unconditional, because a link that appears
   * only once there is something to see is not a path: you cannot answer a
   * question from a page you cannot open.
   */
  readonly questionsLink: string;
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
    readonly awaitingAi: string;
  };
  /**
   * The banner the **needs-you** view raises when entries are waiting on a key.
   *
   * It sits on that view rather than only on its own because needs-you is where
   * the owner lands, and the whole point of the state is that nothing will move
   * until they act. `{count}` is substituted at the surface.
   */
  readonly awaitingAiNotice: {
    readonly one: string;
    readonly many: string;
    readonly seeThem: string;
    readonly configure: string;
  };
  /**
   * An empty **page** of a view that has more pages.
   *
   * Deliberately not one of the sentences above. Those are categorical — "no
   * failures, nothing was left behind" — and a page emptied by the post-filter
   * while later pages hold matches would make them false.
   */
  readonly emptyPage: { readonly title: string; readonly body: string };
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
      awaitingAi: "Sem chave de IA",
      all: "Tudo",
      label: "Visões de Registros",
    },
    states: { recordOnly: "Só registro" },
    questionsLink: "Ver perguntas pendentes",
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
      awaitingAi: "Nenhum registro esperando por uma chave de IA.",
    },
    awaitingAiNotice: {
      one: "1 registro foi salvo sem ser interpretado, por falta de chave de IA.",
      many: "{count} registros foram salvos sem ser interpretados, por falta de chave de IA.",
      seeThem: "Ver esses registros",
      configure: "Configurar a chave",
    },
    emptyPage: {
      title: "Nada desta visão nesta página",
      body: "Há mais registros adiante. Continue para a próxima página.",
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
      awaitingAi: "No AI key",
      all: "All",
      label: "Record views",
    },
    states: { recordOnly: "Record only" },
    questionsLink: "See pending questions",
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
      awaitingAi: "No record is waiting for an AI key.",
    },
    awaitingAiNotice: {
      one: "1 record was saved without being interpreted, for want of an AI key.",
      many: "{count} records were saved without being interpreted, for want of an AI key.",
      seeThem: "See those records",
      configure: "Configure the key",
    },
    emptyPage: {
      title: "Nothing from this view on this page",
      body: "There are more records ahead. Continue to the next page.",
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
