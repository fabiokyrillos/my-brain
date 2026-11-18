/**
 * Custos copy — typed, both locales, no inline ternary.
 *
 * The page answers one question, *quanto gastei?*, so most of what used to be
 * said around the number is gone: the eyebrow, the sentence under the title,
 * the badge, the profile's description and the uppercase kickers over every
 * panel. What remains is the vocabulary of the figures themselves.
 */

import type { Locale } from "@/lib/preferences";

export type CostsCopy = {
  readonly title: string;
  readonly summaryLabel: string;
  readonly periods: { readonly month: string; readonly today: string; readonly allTime: string };
  readonly calls: (count: string) => string;
  /**
   * The one caption under the figure: what kind of number it is, who the
   * authority is, and the zone its periods were computed in (`2O-COST-006`).
   */
  readonly estimate: (timezone: string) => string;
  readonly unreadable: { readonly title: string; readonly body: string };
  readonly unpriced: (count: number) => string;
  readonly empty: {
    readonly title: string;
    readonly body: (agentName: string) => string;
    readonly action: string;
  };
  readonly byOperation: string;
  readonly byModel: string;
  /** The breakdowns cover the whole ledger, not the month above them. */
  readonly sinceStart: string;
  readonly tokensInOut: (input: string, output: string) => string;
  readonly recent: {
    readonly title: string;
    readonly unreadable: string;
    readonly unpriced: string;
    readonly tokens: (count: string) => string;
    readonly cached: (count: string) => string;
  };
  readonly pricing: {
    readonly title: string;
    readonly unit: string;
    readonly unreadable: string;
    readonly line: (input: string, cached: string, output: string) => string;
    /** How the figure is computed, and what it leaves to the provider's invoice. */
    readonly method: string;
  };
  readonly profile: {
    readonly label: string;
    readonly names: Readonly<Record<string, string>>;
  };
  readonly operations: Readonly<Record<string, string>>;
};

const copy: Record<Locale, CostsCopy> = {
  "pt-BR": {
    title: "Custos de IA",
    summaryLabel: "Resumo de custos",
    periods: { month: "Este mês", today: "Hoje", allTime: "Desde o início" },
    calls: (count) => `${count} chamadas`,
    estimate: (timezone) =>
      `Estimativa pelos tokens da API; a fatura da OpenAI é a referência. Períodos no fuso da sua conta (${timezone}).`,
    unreadable: {
      title: "Não foi possível ler o total.",
      body: "O resumo não foi calculado. Isto não significa custo zero.",
    },
    unpriced: (count) =>
      count === 1
        ? "1 chamada sem preço: o modelo ainda não está no catálogo, e o total não a inclui."
        : `${count} chamadas sem preço: o modelo ainda não está no catálogo, e o total não as inclui.`,
    empty: {
      title: "Nenhum custo registrado ainda",
      body: (agentName) =>
        `Quando o ${agentName} interpretar uma captura, responder no chat ou analisar um arquivo, o consumo aparecerá aqui.`,
      action: "Fazer uma captura",
    },
    byOperation: "Por função",
    byModel: "Por modelo",
    sinceStart: "desde o início",
    tokensInOut: (input, output) => `${input} tokens de entrada, ${output} de saída`,
    recent: {
      title: "Últimas chamadas",
      unreadable:
        "Não foi possível ler as últimas chamadas. A lista está vazia por falha de leitura, não por ausência de consumo.",
      unpriced: "Sem preço",
      tokens: (count) => `${count} tokens`,
      cached: (count) => `${count} em cache`,
    },
    pricing: {
      title: "Preços aplicados",
      unit: "Por 1 milhão de tokens",
      unreadable: "Não foi possível ler o catálogo de preços. Nenhum preço foi inventado para preencher a lacuna.",
      line: (input, cached, output) => `entrada ${input} · cache ${cached} · saída ${output}`,
      method:
        "O custo é calculado com os tokens retornados pela API e o preço padrão congelado em cada chamada. A fatura da OpenAI continua sendo a autoridade contábil para créditos, impostos, priority processing, cache writes e outros ajustes da organização.",
    },
    profile: {
      label: "Perfil de IA",
      names: {
        quality: "Qualidade máxima",
        balanced: "Equilibrado",
        economy: "Econômico",
        custom: "Personalizado",
      },
    },
    operations: {
      capture_extraction: "Captura e organização",
      semantic_search: "Busca semântica",
      chat: "Chat principal",
      review: "Revisões e resumos",
      file_analysis: "Análise de arquivos",
      advanced_reasoning: "Raciocínio avançado",
      background: "Rotinas internas",
      task_command: "Comandos de tarefa",
    },
  },
  en: {
    title: "AI costs",
    summaryLabel: "Cost summary",
    periods: { month: "This month", today: "Today", allTime: "All time" },
    calls: (count) => `${count} calls`,
    estimate: (timezone) =>
      `Estimated from API tokens; the OpenAI invoice is the reference. Periods in your account's zone (${timezone}).`,
    unreadable: {
      title: "The total could not be read.",
      body: "The summary was not computed. This does not mean zero cost.",
    },
    unpriced: (count) =>
      count === 1
        ? "1 unpriced call: its model is not in the catalog yet, and the total leaves it out."
        : `${count} unpriced calls: their model is not in the catalog yet, and the total leaves them out.`,
    empty: {
      title: "No recorded cost yet",
      body: (agentName) =>
        `When ${agentName} interprets a capture, answers in chat, or analyzes a file, usage will appear here.`,
      action: "Capture something",
    },
    byOperation: "By function",
    byModel: "By model",
    sinceStart: "all time",
    tokensInOut: (input, output) => `${input} input tokens, ${output} output`,
    recent: {
      title: "Recent calls",
      unreadable: "Recent calls could not be read. The list is empty because the read failed, not because nothing was used.",
      unpriced: "Unpriced",
      tokens: (count) => `${count} tokens`,
      cached: (count) => `${count} cached`,
    },
    pricing: {
      title: "Applied prices",
      unit: "Per 1 million tokens",
      unreadable: "The pricing catalog could not be read. No price was invented to fill the gap.",
      line: (input, cached, output) => `input ${input} · cache ${cached} · output ${output}`,
      method:
        "Cost is calculated from API-returned tokens and the standard price snapshotted on each call. The OpenAI invoice remains the accounting authority for credits, taxes, priority processing, cache writes, and other organization adjustments.",
    },
    profile: {
      label: "AI profile",
      names: {
        quality: "Maximum quality",
        balanced: "Balanced",
        economy: "Economy",
        custom: "Custom",
      },
    },
    operations: {
      capture_extraction: "Capture and organization",
      semantic_search: "Semantic search",
      chat: "Main chat",
      review: "Reviews and summaries",
      file_analysis: "File analysis",
      advanced_reasoning: "Advanced reasoning",
      background: "Background routines",
      task_command: "Task commands",
    },
  },
};

export function getCostsCopy(locale: Locale): CostsCopy {
  return copy[locale] ?? copy["pt-BR"];
}
