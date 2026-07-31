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
  /** The page's own framing, which the composer replaces three headers with. */
  readonly eyebrow: string;
  readonly title: (agent: string) => string;
  readonly description: string;
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
    eyebrow: "CONVERSA COM CONTEXTO",
    title: (agent) => `Fale com o ${agent}`,
    description:
      "Pergunte, mude uma tarefa ou diga o que quer guardar — no mesmo lugar. Você não precisa escolher o tipo antes de escrever.",
    inputLabel: (agent) => `O que você quer dizer ao ${agent}?`,
    inputPlaceholder:
      "ex.: o que combinei com Marina? · mude a prioridade da tarefa do relatório · lembre disso sempre",
    submit: "Enviar",
    pending: "Pensando…",
    submitHint: "Enter envia · Shift+Enter quebra a linha",
    pendingAnnouncement: "Interpretando o que você escreveu.",
    resultRegionLabel: (agent) => `Resposta do ${agent}`,
    echoLabel: "Você escreveu",
    memoryNextStep: "Criar essa memória em Memórias",
    knowledgeFailedHeading: "Não consegui responder agora",
    emptyHeading: "Escreva algo primeiro",
    emptyDetail: "O campo está vazio, então não há nada para interpretar.",
    tooLongHeading: "Texto longo demais",
    tooLongDetail: "O limite é de 12.000 caracteres. Encurte o texto e envie de novo.",
    unexpectedHeading: "Não foi possível concluir",
    unexpectedDetail: "Algo na solicitação não foi reconhecido. Tente enviar de novo.",
  },
  en: {
    eyebrow: "CONTEXTUAL CHAT",
    title: (agent) => `Talk to ${agent}`,
    description:
      "Ask, change a task, or say what you want kept — all in one place. You do not have to pick a type before you write.",
    inputLabel: (agent) => `What do you want to tell ${agent}?`,
    inputPlaceholder:
      "e.g. what did I agree with Marina? · change the priority of the report task · remember this always",
    submit: "Send",
    pending: "Thinking…",
    submitHint: "Enter sends · Shift+Enter adds a line",
    pendingAnnouncement: "Interpreting what you wrote.",
    resultRegionLabel: (agent) => `${agent}’s response`,
    echoLabel: "You wrote",
    memoryNextStep: "Create this memory in Memories",
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
