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
    noProducer: "Ainda não existe um fluxo de revisão para esta categoria, então não há como reunir evidência.",
    noEvidence: "Nenhum exemplo revisado ainda.",
    shortfall: (missing) => `Faltam ${missing} exemplos revisados.`,
    historyLabel: "Cada mudança de política fica registrada e pode ser desfeita.",
    undo: "Desfazer",
    changedFrom: "de",
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
    noProducer: "No review flow exists for this category yet, so there is no way to gather evidence.",
    noEvidence: "No reviewed examples yet.",
    shortfall: (missing) => `${missing} more reviewed examples needed.`,
    historyLabel: "Every policy change is recorded and can be undone.",
    undo: "Undo",
    changedFrom: "from",
  },
};

export function getAutomationCopy(locale: Locale): AutomationCopy {
  return copy[locale];
}
