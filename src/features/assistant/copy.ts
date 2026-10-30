/**
 * The composer's copy, as one typed record per locale.
 *
 * The canonical mechanism (ADR-036): `satisfies Record<Locale, AssistantCopy>`
 * makes a missing key or a missing locale a compile error, so English can never
 * silently receive Portuguese the way `chat/page.tsx`'s inline `pt ? … : …`
 * ternaries could.
 */

import type { Locale } from "@/lib/preferences";

type AssistantCopy = {
  /** The page's own framing — one compact header since Life Brain A.1. */
  readonly title: (agent: string) => string;
  readonly description: string;
  readonly recentTitle: string;
  readonly emptyTitle: (agent: string) => string;
  readonly emptyDescription: string;
  readonly startersLabel: string;
  /** Four life questions the empty surface offers; each seeds the composer. */
  readonly starters: readonly string[];
  readonly backToConversations: string;
  readonly speakerYou: string;
  readonly modelDetail: string;
  /** The single field. */
  readonly inputLabel: (agent: string) => string;
  readonly inputPlaceholder: string;
  readonly submit: string;
  readonly pending: string;
  readonly submitHint: string;
  readonly pendingAnnouncement: string;
  readonly resultRegionLabel: (agent: string) => string;
  /** What the user wrote, shown above an outcome that does not repeat it. */
  readonly echoLabel: string;
  /**
   * The proposed-memory route.
   *
   * Only the link label lives here. Slice G3 added the confirm-before-remember
   * step and moved the heading and the detail to `memories/copy.ts` —
   * `proposalHeading`, `proposalDetail`, `proposalEmpty` — so the memory
   * vocabulary sits with the feature that owns it. The two strings that used to
   * be here were left declared with no consumer for three slices, which is
   * UX-19's defect in miniature, and the journey that still asserted one of them
   * was red for the same three (UX-35). They are deleted rather than kept "in
   * case", so the type stops describing a surface that does not exist.
   */
  readonly memoryNextStep: string;
  /** The knowledge answer failed. */
  /**
   * The capture route's own words (2G-CAPTURE-001/002).
   *
   * `captureHeading`/`captureDetail` announce an entry — never a task — so the
   * object the turn produced is legible without opening it. The ambiguous pair
   * asks rather than guessing, and `captureFailedDetail` is the honest failure
   * that keeps the user's text visible in the echo so nothing is lost.
   *
   * The link to the entry itself used to live here as `captureNextStep`. It
   * moved in Phase 2K (`2K-CARD-007`): the route now renders a read-only
   * preview card for the entry, and the card grammar owns its own "open" label
   * so every card type says it the same way.
   */
  readonly captureHeading: string;
  readonly captureDetail: string;
  readonly captureAmbiguousHeading: string;
  readonly captureAmbiguousDetail: string;
  readonly captureFailedHeading: string;
  readonly captureFailedDetail: string;
  readonly knowledgeFailedHeading: string;
  /** Submission-level refusals. */
  readonly emptyHeading: string;
  readonly emptyDetail: string;
  readonly tooLongHeading: string;
  readonly tooLongDetail: string;
  readonly unexpectedHeading: string;
  readonly unexpectedDetail: string;
};

export const assistantCopy = {
  "pt-BR": {
    title: () => "Conversar",
    description: "Pergunte sobre o que você já registrou, mude uma tarefa ou diga o que quer guardar.",
    recentTitle: "Conversas recentes",
    emptyTitle: (agent) => `O ${agent} responde com o que você já registrou`,
    emptyDescription: "Comece por uma pergunta. Cada resposta diz de onde veio — e quando não há registro, diz isso também.",
    startersLabel: "Experimente",
    starters: [
      "Quando fui ao médico pela última vez?",
      "O que tenho essa semana?",
      "O que falei sobre a viagem?",
      "Quais exames estão pendentes?",
    ],
    backToConversations: "Conversas",
    speakerYou: "Você",
    modelDetail: "Modelo",
    inputLabel: (agent) => `O que você quer dizer ao ${agent}?`,
    inputPlaceholder: "Pergunte ou registre algo…",
    submit: "Enviar",
    pending: "Pensando…",
    submitHint: "Enter envia · Shift+Enter quebra a linha",
    pendingAnnouncement: "Lendo o que você escreveu.",
    resultRegionLabel: (agent) => `Resposta do ${agent}`,
    echoLabel: "Você escreveu",
    memoryNextStep: "Criar essa memória em Memórias",
    captureHeading: "Anotei isso para você",
    captureDetail: "Guardei o texto como uma entrada e comecei a interpretá-la.",
    captureAmbiguousHeading: "Uma nota ou uma tarefa?",
    captureAmbiguousDetail:
      "Você pediu para registrar e mencionou uma tarefa, e eu não quero escolher por você. Para uma nota, escreva sem a palavra “tarefa”; para uma tarefa, comece com “adicione uma tarefa…”.",
    captureFailedHeading: "Não consegui guardar isso",
    captureFailedDetail: "Nada foi salvo. Seu texto continua acima — tente enviar de novo.",
    knowledgeFailedHeading: "Não consegui responder agora",
    emptyHeading: "Escreva algo primeiro",
    emptyDetail: "O campo está vazio, então não há nada para interpretar.",
    tooLongHeading: "Texto longo demais",
    tooLongDetail: "O limite é de 12.000 caracteres. Encurte o texto e envie de novo.",
    unexpectedHeading: "Não foi possível concluir",
    unexpectedDetail: "Algo na solicitação não foi reconhecido. Tente enviar de novo.",
  },
  en: {
    title: () => "Talk",
    description: "Ask about what you have already recorded, change a task, or say what you want kept.",
    recentTitle: "Recent conversations",
    emptyTitle: (agent) => `${agent} answers from what you have recorded`,
    emptyDescription: "Start with a question. Every answer says where it came from — and when there is no record, it says that too.",
    startersLabel: "Try",
    starters: [
      "When did I last see the doctor?",
      "What do I have this week?",
      "What did I say about the trip?",
      "Which exams are still pending?",
    ],
    backToConversations: "Conversations",
    speakerYou: "You",
    modelDetail: "Model",
    inputLabel: (agent) => `What do you want to tell ${agent}?`,
    inputPlaceholder: "Ask or note something…",
    submit: "Send",
    pending: "Thinking…",
    submitHint: "Enter sends · Shift+Enter adds a line",
    pendingAnnouncement: "Reading what you wrote.",
    resultRegionLabel: (agent) => `${agent}’s response`,
    echoLabel: "You wrote",
    memoryNextStep: "Create this memory in Memories",
    captureHeading: "I noted that for you",
    captureDetail: "I kept your text as an entry and started interpreting it.",
    captureAmbiguousHeading: "A note or a task?",
    captureAmbiguousDetail:
      "You asked me to record something and mentioned a task, and I do not want to choose for you. For a note, write it without the word “task”; for a task, start with “add a task…”.",
    captureFailedHeading: "I could not save that",
    captureFailedDetail: "Nothing was stored. Your text is still above — try sending it again.",
    knowledgeFailedHeading: "I could not answer right now",
    emptyHeading: "Write something first",
    emptyDetail: "The field is empty, so there is nothing to interpret.",
    tooLongHeading: "That text is too long",
    tooLongDetail: "The limit is 12,000 characters. Shorten it and send again.",
    unexpectedHeading: "That could not be completed",
    unexpectedDetail: "Something in the request was not recognized. Try sending it again.",
  },
} satisfies Record<Locale, AssistantCopy>;

export function getAssistantCopy(locale: Locale): AssistantCopy {
  return assistantCopy[locale];
}
