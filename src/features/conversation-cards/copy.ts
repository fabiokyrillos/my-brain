/**
 * The card grammar's copy, both locales, ADR-036.
 *
 * Every sentence here is one a user reads about *what happened to their own
 * data*, so two rules apply beyond translation:
 *
 * 1. **No state shares a sentence with another** (`2K-CARD-001`, T-2K-07). A
 *    flattened grammar is how an `expired` starts reading like a `done`.
 * 2. **Nothing counts what was withheld** (`2K-PRIVACY-002`). The central
 *    contract's doctrine is that a "3 hidden" affordance is an existence
 *    oracle wearing a helpful hat, and copy is where one would arrive.
 */

import type { Locale } from "@/lib/preferences";

import type { ConversationCardState, ConversationCardType } from "./contracts";

export const conversationCardsLocales = ["pt-BR", "en"] as const;
export type ConversationCardsLocale = (typeof conversationCardsLocales)[number];

export type ConversationCardsCopy = {
  readonly states: Record<ConversationCardState, string>;
  readonly types: Record<ConversationCardType, string>;
  /** What the surface says in place of masked content. Says nothing about it. */
  readonly masked: string;
  readonly reveal: string;
  readonly hide: string;
  readonly open: string;
  readonly readOnlyNote: string;
  readonly regionLabel: string;
  readonly reversal: {
    readonly undoWindow: (hours: number) => string;
    /** OD-2K-3: archived or withdrawn from use. Never "deleted". */
    readonly archival: string;
  };
  /**
   * `2K-CONT-004/006` — coming back.
   *
   * `note` is the sentence ADR-100 requires and the one easiest to get wrong.
   * It must read as **normal**, not as an error: the preview really was
   * recomputed, so asking again is the honest outcome rather than a fault. And
   * it must not describe a difference, because the handle carries nothing that
   * could reconstruct one — inventing one is what `2K-CONT-006` forbids.
   */
  readonly resumed: {
    readonly regionLabel: string;
    readonly note: string;
    readonly backToMessage: string;
  };
  /** The link back, rendered on the object the user went to look at. */
  readonly returnToConversation: string;
};

const COPY: Record<ConversationCardsLocale, ConversationCardsCopy> = {
  "pt-BR": {
    states: {
      pending: "Trabalhando nisso",
      previewed: "Encontrei isto",
      requires_confirmation: "Preciso da sua confirmação",
      accepted: "Feito",
      refused: "Não fiz isso",
      failed: "Não consegui concluir",
      undone: "Desfeito",
      expired: "Isto mudou desde que mostrei",
      no_change: "Nada mudou",
      unavailable: "Isto não está mais disponível para você",
    },
    types: {
      task: "Tarefa",
      memory: "Memória",
      entry: "Registro",
      person: "Pessoa",
      project: "Projeto",
      organization: "Organização",
      file: "Arquivo",
    },
    masked: "Conteúdo sensível, guardado.",
    reveal: "Mostrar mesmo assim",
    hide: "Esconder de novo",
    open: "Abrir",
    readOnlyNote: "Só leitura por aqui.",
    regionLabel: "Cartão da conversa",
    reversal: {
      undoWindow: (hours) => `Você pode desfazer por ${hours} horas.`,
      archival: "Desfazer aqui arquiva a memória e a tira de uso. Ela continua guardada.",
    },
    resumed: {
      regionLabel: "De volta à conversa",
      note: "Recalculei isto agora, então preciso que você confirme de novo. Nada foi feito enquanto você esteve fora.",
      backToMessage: "Voltar para onde você estava",
    },
    returnToConversation: "Voltar para a conversa",
  },
  en: {
    states: {
      pending: "Working on it",
      previewed: "Here is what I found",
      requires_confirmation: "I need you to confirm",
      accepted: "Done",
      refused: "I did not do that",
      failed: "I could not finish",
      undone: "Undone",
      expired: "This changed since I showed it",
      no_change: "Nothing changed",
      unavailable: "This is no longer available to you",
    },
    types: {
      task: "Task",
      memory: "Memory",
      entry: "Record",
      person: "Person",
      project: "Project",
      organization: "Organization",
      file: "File",
    },
    masked: "Sensitive content, kept back.",
    reveal: "Show it anyway",
    hide: "Hide it again",
    open: "Open",
    readOnlyNote: "Read-only here.",
    regionLabel: "Conversation card",
    reversal: {
      undoWindow: (hours) => `You can undo this for ${hours} hours.`,
      archival: "Undoing here archives the memory and withdraws it from use. It stays on file.",
    },
    resumed: {
      regionLabel: "Back in the conversation",
      note: "I worked this out again just now, so I need you to confirm it again. Nothing happened while you were away.",
      backToMessage: "Back to where you were",
    },
    returnToConversation: "Back to the conversation",
  },
};

export function getConversationCardsCopy(locale: Locale): ConversationCardsCopy {
  return COPY[locale === "en" ? "en" : "pt-BR"];
}
