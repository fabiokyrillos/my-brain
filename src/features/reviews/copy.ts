import type { ReviewTab } from "./review-periods";

/**
 * The review detail page's words, typed, in the `daily-cycle/copy.ts` shape that
 * `ENGINEERING_STANDARDS.md` names as the canonical mechanism — which is why
 * there is not a single locale ternary in `reviews/[reviewId]/page.tsx`.
 *
 * The sentences about **sources** are the ones that matter most, and they are
 * written to be true rather than reassuring. `summaries` carries no foreign key;
 * the provider's `citedSourceIds` are discarded at write time. So the page can
 * say what *kinds* of record the generator reads and over what span, and it must
 * not imply it knows which ones. `sourcesNotLinked` is that limit, stated to the
 * owner instead of hidden behind an empty list.
 */
export type ReviewDetailCopy = {
  readonly back: string;
  readonly generatedAt: (at: string) => string;
  readonly contentHeading: string;
  readonly contentEmpty: string;
  readonly sourcesHeading: string;
  readonly sourcesExplainer: string;
  readonly sourcesNotLinked: string;
  readonly periodLabel: string;
  readonly modelLabel: string;
  readonly modelUnknown: string;
  readonly kindLabel: string;
  readonly actionsHeading: string;
  readonly openPeriod: string;
  readonly openTab: (tab: ReviewTab) => string;
  readonly regenerateExplainer: string;
  readonly regenerateUnavailable: string;
};

const PT_BR: ReviewDetailCopy = {
  back: "Voltar para Revisões",
  generatedAt: (at) => `Gerada em ${at}`,
  contentHeading: "Conteúdo",
  contentEmpty: "Esta revisão foi gravada sem texto legível.",
  sourcesHeading: "Fontes",
  sourcesExplainer:
    "Esta revisão foi escrita a partir dos seus registros e das suas tarefas dentro do período abaixo. Nada fora da sua conta foi lido.",
  sourcesNotLinked:
    "Os registros individuais não ficam ligados à revisão: o texto é gravado sem as referências, então o Brain não pode apontar com certeza quais itens entraram nela. Use o período no calendário para ver o que existia na época.",
  periodLabel: "Período gravado",
  modelLabel: "Modelo",
  modelUnknown: "Não registrado",
  kindLabel: "Tipo",
  actionsHeading: "Ações",
  openPeriod: "Ver este período no calendário",
  openTab: (tab) => (tab === "day" ? "Ver revisões diárias" : tab === "week" ? "Ver revisões semanais" : "Ver revisões mensais"),
  regenerateExplainer:
    "Este período ainda está em andamento. Gerar de novo escreve uma revisão atualizada — nada além da revisão é alterado.",
  regenerateUnavailable:
    "Este período já passou. O Brain só gera revisões do período atual, então esta fica como está.",
};

const EN: ReviewDetailCopy = {
  back: "Back to Reviews",
  generatedAt: (at) => `Generated on ${at}`,
  contentHeading: "Content",
  contentEmpty: "This review was stored with no readable text.",
  sourcesHeading: "Sources",
  sourcesExplainer:
    "This review was written from your own records and tasks inside the period below. Nothing outside your account was read.",
  sourcesNotLinked:
    "Individual records are not linked to the review: the text is stored without its references, so Brain cannot say for certain which items went into it. Use the period in the calendar to see what existed at the time.",
  periodLabel: "Stored period",
  modelLabel: "Model",
  modelUnknown: "Not recorded",
  kindLabel: "Kind",
  actionsHeading: "Actions",
  openPeriod: "See this period in the calendar",
  openTab: (tab) => (tab === "day" ? "See daily reviews" : tab === "week" ? "See weekly reviews" : "See monthly reviews"),
  regenerateExplainer:
    "This period is still running. Generating again writes an updated review — nothing but the review changes.",
  regenerateUnavailable:
    "This period has passed. Brain only generates reviews for the current period, so this one stays as it is.",
};

export function getReviewDetailCopy(locale: string): ReviewDetailCopy {
  return locale === "en" ? EN : PT_BR;
}
