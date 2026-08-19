/** The automation section's copy — typed, both locales, no inline ternary. */

import type { Locale } from "@/lib/preferences";

import type {
  AutomationCategory,
  AutomationDecisionReason,
  AutomationPolicyState,
} from "./automation-policy";

export type AutomationCopy = Readonly<{
  title: string;
  intro: string;
  /** Said once, above the list, and it is the honest headline of this slice. */
  posture: string;
  listLabel: string;
  categories: Readonly<Record<AutomationCategory, { name: string; risk: string }>>;
  states: Readonly<Record<AutomationPolicyState, string>>;
  stateHelp: Readonly<Record<AutomationPolicyState, string>>;
  /** Why automation is refused, in the owner's words rather than the enum's. */
  reasons: Readonly<Record<AutomationDecisionReason, string>>;
  stateLabel: string;
  save: string;
  evidenceLabel: string;
  reviewed: string;
  approved: string;
  corrected: string;
  rejected: string;
  undone: string;
  precision: string;
  required: string;
  noProducer: string;
  noEvidence: string;
  shortfall: (missing: number) => string;
  historyLabel: string;
  undo: string;
  /** How a change reads in the history: from one state to another. */
  changedFrom: string;

  /* ---- Slice 2P.5 -------------------------------------------------------- */

  /**
   * `2P-SETTINGS-007`. Both actions used to `throw`, which replaced the whole
   * page with the error boundary; they now return a state and the row renders
   * it. The sentences are specific because the two failures call for different
   * responses from the owner.
   */
  saveFailed: string;
  saveSucceeded: string;
  undoFailed: string;
  /** `55P03` — the category moved since the change was recorded. */
  undoStale: string;
  undoSucceeded: string;

  /**
   * The signed contract, said once above the list.
   *
   * Slice 2P.4 shipped these numbers calling them a proposal. The owner signed
   * them, so the surface stops hedging — and says in the same breath that
   * signing a threshold enabled nothing.
   */
  thresholdsSigned: string;

  /** Freshness, per category, in the owner's terms rather than the schema's. */
  freshnessLabel: string;
  freshnessRequirement: (recent: number, windowDays: number, newestDays: number) => string;
  freshnessRecent: (recent: number) => string;
  freshnessNewest: (isoDate: string) => string;
  freshnessNone: string;
  /** The undo block, stated as the separate blocking rule it is. */
  undoBlockLabel: string;
  undoBlockActive: (window: number) => string;
  undoBlockClear: string;
}>;

const copy: Record<Locale, AutomationCopy> = {
  "pt-BR": {
    title: "Automação por categoria",
    intro:
      "O agente pode agir sozinho apenas onde você autorizar e apenas depois de acertar o suficiente nos exemplos que você mesmo revisou.",
    posture:
      "Hoje nenhuma categoria age sozinha. Isso é o estado seguro, não uma falha: sem calibração suficiente o agente sugere e espera por você.",
    listLabel: "Categorias e suas políticas",
    categories: {
      task: { name: "Tarefas", risk: "Reversível: uma tarefa criada por engano é cancelada e desfeita." },
      person: { name: "Pessoas", risk: "Uma pessoa duplicada divide o seu histórico e não há como fundir." },
      project: { name: "Projetos", risk: "Um projeto duplicado se espalha pelas associações." },
      organization: { name: "Empresas", risk: "Nomes de empresa colidem entre contextos e separam vínculos." },
      memory: { name: "Memórias", risk: "Uma memória é duradoura por definição e entra nas buscas." },
      relation: { name: "Relações", risk: "Uma relação afirmada por engano vira um fato seu que você não disse." },
    },
    states: {
      disabled: "Desativada",
      suggest_only: "Apenas sugerir",
      automatic_when_eligible: "Automática quando elegível",
    },
    stateHelp: {
      disabled: "O agente não automatiza nesta categoria e nem avalia se poderia.",
      suggest_only: "O agente sugere e espera a sua decisão. É assim que o produto funciona hoje.",
      automatic_when_eligible:
        "Armar não é autorizar: o agente só agirá sozinho enquanto a calibração se sustentar, e volta a esperar se ela cair.",
    },
    reasons: {
      automation_disabled_by_owner: "Você desativou esta categoria.",
      suggest_only_by_owner: "Configurada para apenas sugerir.",
      insufficient_calibration: "Ainda não há exemplos revisados suficientes para confiar nesta categoria.",
      blocked_by_recent_undo: "Você desfez uma decisão recente aqui, então a automação está suspensa.",
      automatic: "Agindo sozinho, e você pode desligar a qualquer momento.",
    },
    stateLabel: "Política",
    save: "Salvar política",
    evidenceLabel: "Evidência revisada por você",
    reviewed: "revisados",
    approved: "aceitos",
    corrected: "corrigidos",
    rejected: "rejeitados",
    undone: "desfeitos",
    precision: "acerto",
    required: "necessário",
    /*
      The sentence has to say that WAITING CHANGES NOTHING here, not just that
      the count is zero. A zero beside the other five reads as "not enough yet",
      which is a promise that time will fix it — and for these four it will not,
      because nothing produces evidence at all. ADR-123's second 2026-08-19
      amendment records the four as named remainders for exactly this reason.
    */
    noProducer:
      "Ainda não existe um fluxo de revisão para esta categoria, então nada é acumulado — esperar não muda isso. Fica registrado como pendência do produto.",
    noEvidence: "Nenhum exemplo revisado ainda.",
    shortfall: (missing) => `Faltam ${missing} exemplos revisados.`,
    historyLabel: "Cada mudança de política fica registrada e pode ser desfeita.",
    undo: "Desfazer",
    changedFrom: "de",
    saveFailed: "Não foi possível salvar esta política. Nada mudou — tente novamente.",
    saveSucceeded: "Política salva. Você pode desfazer abaixo.",
    undoFailed: "Não foi possível desfazer. Nada mudou.",
    undoStale:
      "A política desta categoria mudou depois desta alteração, então desfazer foi recusado para não sobrescrever a decisão mais recente.",
    undoSucceeded: "Política restaurada.",
    thresholdsSigned:
      "Os mínimos abaixo estão assinados por você. Assinar um mínimo não ativa nada: a categoria só age sozinha quando você a arma e a medição realmente o alcança.",
    freshnessLabel: "Atualidade",
    freshnessRequirement: (recent, windowDays, newestDays) =>
      `Exige ${recent} exemplos revisados nos últimos ${windowDays} dias, com o mais recente há no máximo ${newestDays} dias.`,
    freshnessRecent: (recent) => `${recent} nos últimos 90 dias`,
    freshnessNewest: (isoDate) => `Mais recente: ${isoDate}`,
    freshnessNone: "Sem exemplos recentes.",
    undoBlockLabel: "Bloqueio por desfazer",
    undoBlockActive: (window) =>
      `Você desfez algo nas ${window} observações mais recentes, então esta categoria está suspensa até que saiam da janela.`,
    undoBlockClear: "Nenhum desfazer recente.",
  },
  en: {
    title: "Automation by category",
    intro:
      "The agent may act on its own only where you allow it, and only after it has been right often enough on the examples you reviewed yourself.",
    posture:
      "No category acts on its own today. That is the safe state, not a fault: without enough calibration the agent suggests and waits for you.",
    listLabel: "Categories and their policies",
    categories: {
      task: { name: "Tasks", risk: "Reversible: a task created by mistake is cancelled and undone." },
      person: { name: "People", risk: "A duplicated person splits your history, and there is no merge." },
      project: { name: "Projects", risk: "A duplicated project spreads through its associations." },
      organization: { name: "Companies", risk: "Company names collide across contexts and split affiliations." },
      memory: { name: "Memories", risk: "A memory is durable by definition and enters retrieval." },
      relation: { name: "Relations", risk: "A relation asserted by mistake becomes a fact of yours you never stated." },
    },
    states: {
      disabled: "Disabled",
      suggest_only: "Suggest only",
      automatic_when_eligible: "Automatic when eligible",
    },
    stateHelp: {
      disabled: "The agent does not automate this category and does not even evaluate whether it could.",
      suggest_only: "The agent suggests and waits for your decision. This is how the product works today.",
      automatic_when_eligible:
        "Arming is not authorizing: the agent acts on its own only while the calibration holds, and goes back to waiting if it drops.",
    },
    reasons: {
      automation_disabled_by_owner: "You switched this category off.",
      suggest_only_by_owner: "Set to suggest only.",
      insufficient_calibration: "There are not yet enough reviewed examples to trust this category.",
      blocked_by_recent_undo: "You undid a recent decision here, so automation is suspended.",
      automatic: "Acting on its own, and you can switch it off at any moment.",
    },
    stateLabel: "Policy",
    save: "Save policy",
    evidenceLabel: "Evidence you reviewed",
    reviewed: "reviewed",
    approved: "accepted",
    corrected: "corrected",
    rejected: "rejected",
    undone: "undone",
    precision: "accuracy",
    required: "required",
    noProducer:
      "No review flow exists for this category yet, so nothing accumulates — waiting will not change that. It is recorded as an open gap in the product.",
    noEvidence: "No reviewed examples yet.",
    shortfall: (missing) => `${missing} more reviewed examples needed.`,
    historyLabel: "Every policy change is recorded and can be undone.",
    undo: "Undo",
    changedFrom: "from",
    saveFailed: "Could not save this policy. Nothing changed — try again.",
    saveSucceeded: "Policy saved. You can undo it below.",
    undoFailed: "Could not undo. Nothing changed.",
    undoStale:
      "This category's policy moved after that change, so the undo was refused rather than overwriting the newer decision.",
    undoSucceeded: "Policy restored.",
    thresholdsSigned:
      "The minimums below are signed by you. Signing a minimum enables nothing: a category acts on its own only once you arm it and the measurement genuinely reaches it.",
    freshnessLabel: "Freshness",
    freshnessRequirement: (recent, windowDays, newestDays) =>
      `Requires ${recent} reviewed examples in the last ${windowDays} days, the newest no more than ${newestDays} days old.`,
    freshnessRecent: (recent) => `${recent} in the last 90 days`,
    freshnessNewest: (isoDate) => `Newest: ${isoDate}`,
    freshnessNone: "No recent examples.",
    undoBlockLabel: "Undo block",
    undoBlockActive: (window) =>
      `You undid something within the ${window} most recent observations, so this category is suspended until they leave the window.`,
    undoBlockClear: "No recent undo.",
  },
};

export function getAutomationCopy(locale: Locale): AutomationCopy {
  return copy[locale];
}
