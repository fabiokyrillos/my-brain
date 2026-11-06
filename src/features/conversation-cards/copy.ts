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
import type { SuggestionCategory } from "./suggestions";

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
  /**
   * `2K-SUGG-003/004` — the suggestions that replaced one hard-coded example.
   *
   * The sentence is built **here**, from a category and a name the derivation
   * kept apart. The module never produces a string, so there is no rendered
   * sentence anywhere that a telemetry event could log whole.
   *
   * ## One function per category, and why three of them ignore the name
   *
   * Life Brain B.7 turns two categories into eight. A `Record` keyed by the
   * closed vocabulary makes a new category a **compile error here** until
   * somebody writes both locales for it, which is the only way a derivation and
   * its copy stay in step.
   *
   * `birthday_soon`, `open_question` and `unreviewed_entry` receive the name and
   * do not use it. That is deliberate rather than lazy: the owner's own wording
   * was *"tem algum aniversário próximo?"* — a question about the shape of the
   * week, not about a person — and a record's first 240 characters make a poor
   * chip. The derivation still consults their classification and still drops a
   * withheld row, because the suggestion's **presence** would report that such a
   * row exists even when its sentence names nobody (`2K-PRIVACY-002`).
   *
   * ## `fill`, which is the sentence that changed meaning
   *
   * These were text, on purpose: a control that submitted a question would put
   * words in the owner's mouth. On 5 November 2026 the owner asked for the other
   * half of that — *"para eu clicar, e já preencher isso embaixo. Mas lembre que
   * é preencher, não enviar."* `fill` is what the control announces, and the
   * principle is unchanged: filling is not sending, and the send button is still
   * theirs to press.
   */
  readonly suggestions: {
    readonly label: string;
    /** The accessible name of one chip: it fills the field, it does not ask. */
    readonly fill: (question: string) => string;
    readonly byCategory: Readonly<Record<SuggestionCategory, (name: string) => string>>;
  };
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
      reminder: "Lembrete",
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
    suggestions: {
      label: "Você pode me perguntar",
      fill: (question) => `Escrever no campo: ${question}`,
      byCategory: {
        overdue_task: (name) => `O prazo de ${name} já passou. O que eu faço?`,
        due_today: (name) => `${name} é para hoje. Por onde eu começo?`,
        reminder_soon: (name) => `O que eu preciso saber sobre ${name}?`,
        birthday_soon: () => "Tem algum aniversário próximo?",
        open_question: () => "Qual pergunta ficou em aberto?",
        unreviewed_entry: () => "O que eu registrei e ainda não revisei?",
        person: (name) => `O que ficou pendente com ${name}?`,
        project: (name) => `Como está ${name}?`,
      },
    },
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
      reminder: "Reminder",
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
    suggestions: {
      label: "You can ask me",
      fill: (question) => `Put in the field: ${question}`,
      byCategory: {
        overdue_task: (name) => `${name} is past its date. What do I do?`,
        due_today: (name) => `${name} is due today. Where do I start?`,
        reminder_soon: (name) => `What do I need to know about ${name}?`,
        birthday_soon: () => "Is there a birthday coming up?",
        open_question: () => "Which question is still open?",
        unreviewed_entry: () => "What have I recorded and not reviewed yet?",
        person: (name) => `What is still open with ${name}?`,
        project: (name) => `How is ${name} going?`,
      },
    },
  },
};

export function getConversationCardsCopy(locale: Locale): ConversationCardsCopy {
  return COPY[locale === "en" ? "en" : "pt-BR"];
}
