import { resolveLocale, type Locale } from "@/lib/preferences";

import type { AiRouteColumn, AiRouteDisposition } from "./contracts";

/**
 * Everything the AI configuration section says — `2O-AICONFIG-001` … `-008`.
 *
 * One typed module in both locales, which is the mechanism `UX-22` left behind
 * and `locale-ternary-guard.test.ts` enforces. A `Record` over the route
 * columns rather than a list, so a route added to the contract **fails to
 * compile** until someone writes what it is: the same guarantee
 * `capability-copy.ts` has, for the same reason.
 *
 * ## What this copy may not say
 *
 * No price and no projection (`R-2O-18`, `2O-COST-005`) — prices are provider
 * facts recorded at call time, and this surface describes routing rather than
 * spend. No claim that a route can be changed when it cannot: `uncontrolled`
 * and `unconsumed` each get their own sentence, and neither is softened into
 * "not yet available", which would promise a control nobody has authorized.
 */

export type AiRouteCopy = Readonly<{
  /** What the operation is, in the owner's words rather than the column's. */
  name: string;
  /** What the product does with it. Never a field list. */
  effect: string;
}>;

export type AiConfigCopy = Readonly<{
  title: string;
  intro: string;
  /** `2O-AICONFIG-002` — whose credential performs the calls, and what removing it does. */
  credential: string;
  /**
   * Two gated states, not one — and they are separate because collapsing them
   * makes the product lie.
   *
   * `CredentialStatus` has four members and only `active` performs calls. An
   * earlier version of this section rendered `credentialAbsent` for everything
   * that was not `active`, so an account whose key the **provider rejected** was
   * told *"no key configured"* — false, and false in the direction that sends
   * the reader to configure a key they already have instead of replacing one.
   *
   * `removed` and `absent` are genuinely the same fact to this surface: there is
   * no key. `invalid` is a different fact with a different action, so it gets
   * its own sentence and its own verb.
   */
  credentialAbsent: string;
  credentialRejected: string;
  credentialAbsentAction: string;
  credentialRejectedAction: string;
  /** `2O-AICONFIG-003` — the heading over the routing table. */
  routingTitle: string;
  routingIntro: string;
  routesLabel: string;
  /** One line per disposition, said where the route is. */
  dispositions: Readonly<Record<AiRouteDisposition, string>>;
  /** The column heading a screen reader reads for the model cell. */
  modelLabel: string;
  routes: Readonly<Record<AiRouteColumn, AiRouteCopy>>;
  /** `2O-COST-004` — what the active profile routes, stated before saving. */
  profileTitle: string;
  profileIntro: string;
}>;

const ptBR: AiConfigCopy = {
  title: "Onde a IA é usada",
  intro:
    "Estas são todas as operações deste produto que chamam um modelo. Nenhuma outra parte do aplicativo faz isso, e esta página não chama nenhum modelo para se desenhar.",
  credential:
    "Todas as chamadas abaixo usam a sua própria chave da OpenAI e são cobradas na sua conta da OpenAI. Remover a chave interrompe todas elas: nada passa a ser interpretado por outro caminho.",
  credentialAbsent:
    "Nenhuma chave configurada. Enquanto isso, nenhuma das operações abaixo acontece — seus registros continuam sendo salvos e ficam aguardando interpretação.",
  credentialRejected:
    "Sua chave foi recusada pelo provedor. Enquanto isso, nenhuma das operações abaixo acontece — seus registros continuam sendo salvos e ficam aguardando interpretação.",
  credentialAbsentAction: "Configurar a chave",
  credentialRejectedAction: "Substituir a chave",
  routingTitle: "Qual operação usa qual modelo",
  routingIntro:
    "Esta lista é lida do roteamento que o produto realmente usa, e não de uma segunda tabela mantida à parte.",
  routesLabel: "Operações e modelos",
  dispositions: {
    controlled: "Você escolhe o modelo nas preferências acima.",
    uncontrolled:
      "Este modelo é usado de verdade e não tem controle. É uma decisão registrada, não um esquecimento: mudar o modelo de embedding invalidaria as buscas já indexadas.",
    unconsumed:
      "Nada no produto lê esta preferência hoje, então ela não recebe controle — um controle que não muda nada seria uma promessa falsa.",
  },
  modelLabel: "Modelo",
  routes: {
    chat_model: {
      name: "Conversa",
      effect: "Responde no chat usando os seus próprios registros como fonte.",
    },
    extraction_model: {
      name: "Interpretação de registros",
      effect: "Lê o que você capturou e propõe tarefas, pessoas, projetos e datas.",
    },
    review_model: {
      name: "Revisões e resumos",
      effect: "Gera uma revisão quando você pede — nada é gerado por horário.",
    },
    file_model: {
      name: "Análise de arquivos",
      effect: "Lê imagens, PDFs, documentos e planilhas que você envia.",
    },
    embedding_model: {
      name: "Busca semântica",
      effect: "Transforma registros e memórias em vetores para que o chat encontre o que é relevante.",
    },
    reasoning_model: {
      name: "Raciocínio avançado",
      effect: "Reservado no banco de dados e nunca chamado.",
    },
    background_model: {
      name: "Rotinas internas",
      effect: "Reservado no banco de dados e nunca chamado.",
    },
  },
  profileTitle: "O que o perfil escolhido roteia",
  profileIntro:
    "O perfil selecionado acima define os modelos abaixo. Isto é o que será salvo — os valores mudam assim que você troca de perfil, antes de salvar.",
};

const en: AiConfigCopy = {
  title: "Where AI is used",
  intro:
    "These are every operation in this product that calls a model. No other part of the app does, and this page calls no model to render itself.",
  credential:
    "Every call below uses your own OpenAI key and is billed to your OpenAI account. Removing the key stops all of them: nothing falls back to another path.",
  credentialAbsent:
    "No key configured. Until there is one, none of the operations below happens — your records are still saved and wait for interpretation.",
  credentialRejected:
    "Your key was rejected by the provider. Until that is fixed, none of the operations below happens — your records are still saved and wait for interpretation.",
  credentialAbsentAction: "Configure the key",
  credentialRejectedAction: "Replace the key",
  routingTitle: "Which operation uses which model",
  routingIntro:
    "This list is read from the routing the product actually uses, not from a second table kept alongside it.",
  routesLabel: "Operations and models",
  dispositions: {
    controlled: "You choose the model in the preferences above.",
    uncontrolled:
      "This model is genuinely used and has no control. That is a recorded decision rather than an oversight: changing the embedding model would invalidate everything already indexed.",
    unconsumed:
      "Nothing in the product reads this preference today, so it gets no control — a control that changes nothing would be a false promise.",
  },
  modelLabel: "Model",
  routes: {
    chat_model: {
      name: "Conversation",
      effect: "Answers in chat using your own records as the source.",
    },
    extraction_model: {
      name: "Record interpretation",
      effect: "Reads what you captured and proposes tasks, people, projects and dates.",
    },
    review_model: {
      name: "Reviews and summaries",
      effect: "Generates a review when you ask — nothing is generated on a schedule.",
    },
    file_model: {
      name: "File analysis",
      effect: "Reads images, PDFs, documents and spreadsheets you upload.",
    },
    embedding_model: {
      name: "Semantic search",
      effect: "Turns records and memories into vectors so chat can find what is relevant.",
    },
    reasoning_model: {
      name: "Advanced reasoning",
      effect: "Reserved in the database and never called.",
    },
    background_model: {
      name: "Background routines",
      effect: "Reserved in the database and never called.",
    },
  },
  profileTitle: "What the chosen profile routes",
  profileIntro:
    "The profile selected above decides the models below. This is what will be saved — the values change as soon as you switch profiles, before you save.",
};

export const aiConfigCopy: Record<Locale, AiConfigCopy> = { "pt-BR": ptBR, en };

export function getAiConfigCopy(locale: unknown): AiConfigCopy {
  return aiConfigCopy[resolveLocale(locale)];
}
