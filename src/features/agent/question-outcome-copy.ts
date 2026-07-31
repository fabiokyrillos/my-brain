import type { Locale } from "@/lib/preferences";

import type { QuestionDisposition } from "./question-visibility";

/**
 * The outcome surface's copy, as one typed record per locale (ADR-036).
 *
 * Every sentence here answers one of the four questions UX-11 found
 * unanswered: what you said, what it changed, whether anything is still
 * waiting on you, and where it is recorded.
 *
 * `{agent}` is substituted by `withAgentName` (UX-06), so the assistant is
 * named by whatever the owner calls it.
 */

type QuestionOutcomeCopy = {
  readonly openTab: string;
  readonly resolvedTab: string;
  readonly resolvedTitle: string;
  readonly resolvedIntro: string;
  readonly emptyTitle: string;
  readonly emptyBody: string;
  readonly youAnswered: string;
  readonly dispositions: Readonly<Record<QuestionDisposition, string>>;
  readonly effectReinterpreted: string;
  readonly effectRecorded: string;
  readonly effectDismissed: string;
  readonly effectDeferred: string;
  readonly stillWaiting: string;
  readonly nothingWaiting: string;
  readonly openEntry: string;
  readonly answeredOn: string;
  readonly returnsOn: string;
};

const copy = {
  "pt-BR": {
    openTab: "Abertas",
    resolvedTab: "Resolvidas",
    resolvedTitle: "Perguntas resolvidas",
    resolvedIntro:
      "O que você respondeu, o que mudou por causa disso e onde ficou registrado.",
    emptyTitle: "Nada resolvido ainda",
    emptyBody:
      "Quando você responder, adiar ou descartar uma pergunta, ela aparece aqui com o que mudou.",
    youAnswered: "Você respondeu",
    dispositions: {
      answered: "Respondida",
      dismissed: "Descartada",
      deferred: "Adiada",
    },
    effectReinterpreted:
      "O {agent} reinterpretou o registro com a sua resposta. A interpretação anterior continua no histórico.",
    effectRecorded:
      "Sua resposta ficou registrada no registro. O {agent} não reinterpretou nada — você não pediu isso.",
    effectDismissed: "A pergunta foi descartada. Nada no registro mudou.",
    effectDeferred: "A pergunta volta para a fila na data abaixo. Nada mudou até lá.",
    stillWaiting: "Ainda precisa de você: confirme as tarefas sugeridas no registro.",
    nothingWaiting: "Nada mais precisa de você nesta pergunta.",
    openEntry: "Ver o registro",
    answeredOn: "respondida em",
    returnsOn: "volta em",
  },
  en: {
    openTab: "Open",
    resolvedTab: "Resolved",
    resolvedTitle: "Resolved questions",
    resolvedIntro: "What you answered, what changed because of it, and where it is recorded.",
    emptyTitle: "Nothing resolved yet",
    emptyBody:
      "Once you answer, defer, or dismiss a question, it appears here with what changed.",
    youAnswered: "You answered",
    dispositions: {
      answered: "Answered",
      dismissed: "Dismissed",
      deferred: "Deferred",
    },
    effectReinterpreted:
      "{agent} re-read the record with your answer. The previous interpretation is still in the history.",
    effectRecorded:
      "Your answer is recorded on the entry. {agent} did not re-read anything — you did not ask it to.",
    effectDismissed: "The question was dismissed. Nothing on the record changed.",
    effectDeferred: "The question returns to the queue on the date below. Nothing changes until then.",
    stillWaiting: "Still needs you: confirm the suggested tasks on the record.",
    nothingWaiting: "Nothing else needs you on this question.",
    openEntry: "Open the record",
    answeredOn: "answered on",
    returnsOn: "returns on",
  },
} satisfies Record<Locale, QuestionOutcomeCopy>;

export function getQuestionOutcomeCopy(locale: Locale): QuestionOutcomeCopy {
  return copy[locale];
}
