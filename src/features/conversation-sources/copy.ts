/**
 * The source block's copy, both locales, ADR-036.
 *
 * Three of these sentences are the phase's actual product change, so they are
 * worth reading carefully:
 *
 * - `insufficient` is the one the product could never say. Before 2K.4 an
 *   answer with no personal evidence rendered **identically** to one with
 *   plenty, because the renderer only drew the block when `citations.length >
 *   0`. The parent PRD's own principle is that *silence is also a result*.
 * - `reach` makes the limit legible instead of hiding it. Retrieval covers
 *   entries and memories; the product used to imply it looked everywhere.
 *   Saying so costs nothing and teaches the shape of the system.
 * - `legacyUnknown` is what an old row gets. It says **less**, deliberately:
 *   those rows never recorded what retrieval found, and claiming either answer
 *   for them would be an invention.
 */

import type { Locale } from "@/lib/preferences";

import type { SupportKind } from "./contracts";

export const conversationSourcesLocales = ["pt-BR", "en"] as const;
export type ConversationSourcesLocale = (typeof conversationSourcesLocales)[number];

export type ConversationSourcesCopy = {
  readonly title: string;
  readonly supportKinds: Record<SupportKind, string>;
  /** `2K-SRC-006`. Names the two source types, and nothing wider. */
  readonly reach: string;
  /** `2K-SRC-005`. The honest "I had nothing". */
  readonly insufficient: string;
  /** An old row, which recorded neither reach nor evidence state. */
  readonly legacyUnknown: string;
  readonly freshnessLabel: string;
  /** A row with no date. Absent, never fabricated. */
  readonly freshnessUnknown: string;
  /**
   * `2K-EXPL-001` … `2K-EXPL-007` — how the answer was reached.
   *
   * Every sentence here is **bounded**: it may say *that* something was left
   * out and never *how much*. A count is what `search` is forbidden to show,
   * and a rate is a count over repeated queries — so the copy carries no
   * placeholder a number could ever be interpolated into.
   *
   * `interpretationNoEffect` is the honest half of `2K-EXPL-007`: correcting
   * the **source** works and always has; flagging the **interpretation** has no
   * domain behind it this phase, and saying so is better than a control that
   * records nothing.
   */
  readonly explanation: {
    readonly summary: string;
    readonly weakMatches: string;
    readonly archivedMemories: string;
    readonly correctSourceTitle: string;
    readonly correctSource: string;
    readonly interpretationNoEffect: string;
  };
};

const COPY: Record<ConversationSourcesLocale, ConversationSourcesCopy> = {
  "pt-BR": {
    title: "O que eu usei",
    supportKinds: {
      direct_record: "Você escreveu isto",
      product_state: "O que eu guardo como verdadeiro",
      inference: "Conclusão minha, a partir do que está acima",
    },
    reach: "Procurei nos seus registros e nas suas memórias — só nesses dois lugares.",
    insufficient:
      "Não encontrei nada seu sobre isso. O que respondi acima não vem dos seus registros nem das suas memórias.",
    legacyUnknown: "Esta resposta é de antes de eu passar a anotar onde procurei.",
    freshnessLabel: "De",
    freshnessUnknown: "Sem data",
    explanation: {
      summary: "Como cheguei aqui",
      weakMatches: "Encontrei outras coisas suas, mas nenhuma perto o bastante do que você perguntou — deixei todas de fora.",
      archivedMemories: "Algumas memórias suas combinavam, mas você as arquivou, então não usei nenhuma delas.",
      correctSourceTitle: "Se algo aqui está errado",
      correctSource: "Abra a fonte acima e corrija ou arquive lá. É isso que muda as próximas respostas.",
      interpretationNoEffect: "Ainda não dá para me dizer que eu entendi errado: eu não teria onde guardar isso, e um botão que não faz nada seria pior do que dizer isso claramente.",
    },
  },
  en: {
    title: "What I used",
    supportKinds: {
      direct_record: "You wrote this",
      product_state: "What I keep as true",
      inference: "My own conclusion, from what is above",
    },
    reach: "I looked in your records and your memories — those two places only.",
    insufficient:
      "I found nothing of yours about this. What I answered above does not come from your records or your memories.",
    legacyUnknown: "This answer predates my keeping track of where I looked.",
    freshnessLabel: "From",
    freshnessUnknown: "No date",
    explanation: {
      summary: "How I got here",
      weakMatches: "I found other things of yours, but none close enough to what you asked — I left them all out.",
      archivedMemories: "Some of your memories matched, but you archived them, so I used none of them.",
      correctSourceTitle: "If something here is wrong",
      correctSource: "Open the source above and fix or archive it there. That is what changes future answers.",
      interpretationNoEffect: "You cannot yet tell me I read it wrong: I would have nowhere to keep that, and a button that does nothing would be worse than saying so plainly.",
    },
  },
};

export function getConversationSourcesCopy(locale: Locale): ConversationSourcesCopy {
  return COPY[locale === "en" ? "en" : "pt-BR"];
}
