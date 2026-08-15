/** Dados e IA copy — typed, both locales, no inline ternary. */

import type { Locale } from "@/lib/preferences";

import type { TransparencyLens } from "./contracts";

export type TransparencyCopy = {
  /** The section's name, wherever it is announced. */
  readonly title: string;
  /** The strip's accessible name. */
  readonly lensesLabel: string;
  /** One word per view, as the tab. */
  readonly lenses: Readonly<Record<TransparencyLens, string>>;
  /** One sentence per view, for the Settings section that reaches them. */
  readonly descriptions: Readonly<Record<TransparencyLens, string>>;
  /** Said once above the three, in Settings. */
  readonly intro: string;
  /** The link back to the centre from a surface that is inside it. */
  readonly backToSettings: string;
  /** Offered beside a failure, which is how Processamento is meant to be reached. */
  readonly openProcessing: string;
};

const copy: Record<Locale, TransparencyCopy> = {
  "pt-BR": {
    title: "Dados e IA",
    lensesLabel: "Dados e IA",
    lenses: {
      // "Atividade" rather than "Histórico": the surface answers *o que
      // aconteceu*, and "histórico" is also what the memory pages call their own
      // trail. One word per concept.
      history: "Atividade",
      costs: "Custos",
      // `02-arquitetura-e-rotas.md`: *"Jobs" deixa de ser conceito de usuário*.
      // The route is untouched; only the word the product says changed.
      jobs: "Processamento",
    },
    descriptions: {
      history: "Quem fez o quê, quando e sobre qual objeto.",
      costs: "Quanto cada operação consumiu, por modelo e por função.",
      jobs: "O que ainda está sendo processado, e o que falhou.",
    },
    intro:
      "Tudo o que o Brain fez com os seus dados fica aqui. Nada é resumido: são os registros reais.",
    backToSettings: "Ajustes",
    openProcessing: "Ver processamento",
  },
  en: {
    title: "Data & AI",
    lensesLabel: "Data & AI",
    lenses: {
      history: "Activity",
      costs: "Costs",
      jobs: "Processing",
    },
    descriptions: {
      history: "Who did what, when, and to which object.",
      costs: "What each operation consumed, by model and by function.",
      jobs: "What is still being processed, and what failed.",
    },
    intro:
      "Everything the Brain did with your data lives here. Nothing is summarised: these are the real records.",
    backToSettings: "Settings",
    openProcessing: "See processing",
  },
};

export function getTransparencyCopy(locale: Locale): TransparencyCopy {
  return copy[locale] ?? copy["pt-BR"];
}
