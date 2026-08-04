/**
 * The Terms of Service and Privacy Policy drafts — SH-LEGAL-001/002/003/013.
 *
 * Product documents written from **repository truth**, not from a template: the
 * claims below are the ones `SIGNUP_HARDENING_FINDINGS.md`, the BYOK security
 * definition and the schema actually support. Where the repository cannot know
 * a fact — who operates the service, under whose law — the text carries a
 * visibly unfilled placeholder rather than a plausible guess
 * (`placeholders.ts`).
 *
 * The retention section is **generated** from `retention.ts` rather than
 * written here, because a policy and a schedule written twice drift, and the
 * failure mode is a document telling somebody their data is deleted while
 * nothing deletes it (T-31).
 *
 * Both documents carry the professional-review banner (SH-LEGAL-013). Removing
 * it is a named owner action in the rollout gate, not an edit somebody makes
 * because the drafts look finished.
 */

import type { Locale } from "@/lib/preferences";
import { renderPlaceholder } from "./placeholders";
import {
  hasUnenforcedWindow,
  RETENTION_SCHEDULE,
  retentionLine,
} from "./retention";
import { POLICY_VERSIONS, type PolicyDocument } from "./versions";

export type LegalSection = {
  readonly heading: string;
  readonly paragraphs: readonly string[];
};

export type LegalDocumentContent = {
  readonly kind: PolicyDocument;
  readonly title: string;
  readonly version: string;
  readonly versionLabel: string;
  readonly reviewBanner: string;
  readonly sections: readonly LegalSection[];
};

const chrome: Record<Locale, { versionLabel: (version: string) => string; reviewBanner: string }> = {
  "pt-BR": {
    versionLabel: (version) => `Versão ${version} — rascunho de pré-lançamento.`,
    reviewBanner:
      "Este documento é um rascunho e exige revisão jurídica profissional antes de qualquer lançamento comercial. Ele descreve com honestidade o que o sistema faz hoje, mas não substitui aconselhamento jurídico.",
  },
  en: {
    versionLabel: (version) => `Version ${version} — pre-launch draft.`,
    reviewBanner:
      "This document is a draft and requires professional legal review before any commercial launch. It honestly describes what the system does today, but it is not legal advice.",
  },
};

function retentionParagraphs(locale: Locale): readonly string[] {
  const lines = RETENTION_SCHEDULE.map((entry) => retentionLine(locale, entry));
  const intro =
    locale === "pt-BR"
      ? "Cada classe de dado tem uma regra declarada:"
      : "Each class of data has a declared rule:";
  const warning =
    locale === "pt-BR"
      ? "Aviso honesto: nesta versão de pré-lançamento, as remoções automáticas por prazo ainda não estão em execução, com exceção das tentativas de validação de chave. Os prazos acima são a política declarada; até que as rotinas entrem em operação, dados dessas classes podem permanecer armazenados por mais tempo do que o prazo indicado."
      : "Honest notice: in this pre-launch version the automated time-based removals are not yet running, with the exception of key validation attempts. The windows above are the declared policy; until those routines are in operation, data in those classes may remain stored for longer than the stated window.";

  return hasUnenforcedWindow() ? [intro, ...lines, warning] : [intro, ...lines];
}

function terms(locale: Locale): readonly LegalSection[] {
  if (locale === "pt-BR") {
    return [
      {
        heading: "1. O que é este serviço",
        paragraphs: [
          "O My Brain é um agente contextual pessoal em fase de pré-lançamento. Ele captura textos que você escreve, extrai uma interpretação estruturada com apoio de inteligência artificial e oferece busca, conversa, lembretes e análise de arquivos sobre o seu próprio conteúdo.",
          "O serviço é fornecido no estado em que se encontra. Ele está em desenvolvimento ativo, funcionalidades podem mudar ou ser removidas, e não há promessa de disponibilidade contínua nem de preservação de dados além do que esta política e a Política de Privacidade descrevem.",
        ],
      },
      {
        heading: "2. Quem pode usar",
        paragraphs: [
          "Você precisa ter capacidade civil para aceitar estes termos e usar a conta apenas em seu próprio nome. Uma conta pertence a uma pessoa; credenciais não devem ser compartilhadas.",
          `O serviço é operado por ${renderPlaceholder(locale, "OPERATOR_ENTITY")}.`,
        ],
      },
      {
        heading: "3. Sua conta, e como ela termina",
        paragraphs: [
          "Você pode excluir a sua conta a qualquer momento pela própria aplicação. A exclusão é irreversível a partir do momento em que a remoção começa: o conteúdo, os arquivos e os registros associados são apagados, e o que permanece está enumerado na Política de Privacidade.",
          "O operador pode suspender uma conta administrativamente. Uma conta suspensa continua existindo e os dados permanecem intactos, mas nenhuma ação de produto é aceita enquanto durar a suspensão. Toda suspensão e toda reativação são registradas com autor, motivo e horário.",
          "O operador também pode iniciar a exclusão de uma conta administrativamente. Isso congela a conta; a remoção efetiva depende de execução a partir da própria sessão do titular.",
        ],
      },
      {
        heading: "4. Uso aceitável",
        paragraphs: [
          "Não use o serviço para atividade ilegal, para processar conteúdo que você não tem o direito de processar, para tentar acessar dados de outra conta, ou para contornar limites técnicos e de uso.",
          "Violações podem levar à suspensão da conta. O motivo é registrado em um conjunto fechado de códigos e a superfície de conta suspensa mostra apenas o rótulo público correspondente.",
        ],
      },
      {
        heading: "5. Sua chave de provedor de IA, e os custos dela",
        paragraphs: [
          "O processamento por inteligência artificial usa a sua própria chave de provedor, fornecida por você e guardada criptografada. As chamadas ao provedor são faturadas na sua conta junto ao provedor, não na do operador.",
          "Você é responsável por esses custos, pelos limites e pelo saldo da sua conta no provedor. Se a chave for removida, ficar inválida ou o saldo acabar, o produto registra suas entradas mas não as processa.",
        ],
      },
      {
        heading: "6. Os valores exibidos são estimativas",
        paragraphs: [
          "As páginas de custo mostram estimativas calculadas a partir de um retrato de preços registrado no momento de cada chamada e da contagem de tokens informada pelo provedor. Elas servem para acompanhamento e não são fatura. A cobrança real é a do seu provedor.",
        ],
      },
      {
        heading: "7. Sem garantias",
        paragraphs: [
          "Durante o pré-lançamento o serviço é oferecido sem garantia de adequação a qualquer finalidade específica, sem garantia de disponibilidade e sem compromisso de suporte. Interpretações produzidas por inteligência artificial podem estar erradas; confira antes de agir sobre elas.",
        ],
      },
      {
        heading: "8. Mudanças nestes termos",
        paragraphs: [
          "Cada documento tem uma versão. Quando a versão muda, o aceite é solicitado novamente na sua próxima sessão, e o acesso ao produto continua depois que o novo aceite é registrado. Recusar é um caminho real: você pode sair da conta ou excluí-la.",
        ],
      },
      {
        heading: "9. Legislação e foro",
        paragraphs: [
          `Aplica-se ${renderPlaceholder(locale, "GOVERNING_LAW")}, com foro em ${renderPlaceholder(locale, "JURISDICTION")}.`,
        ],
      },
      {
        heading: "10. Contato",
        paragraphs: [`Para qualquer assunto relativo a estes termos: ${renderPlaceholder(locale, "OPERATOR_CONTACT")}.`],
      },
    ];
  }

  return [
    {
      heading: "1. What this service is",
      paragraphs: [
        "My Brain is a personal contextual agent in pre-launch. It captures text you write, extracts a structured interpretation with the help of artificial intelligence, and offers search, chat, reminders and file analysis over your own content.",
        "The service is provided as is. It is under active development, features may change or be removed, and there is no promise of continuous availability or of data preservation beyond what these terms and the Privacy Policy describe.",
      ],
    },
    {
      heading: "2. Who may use it",
      paragraphs: [
        "You must have the legal capacity to accept these terms, and you must use the account in your own name. An account belongs to one person; credentials are not to be shared.",
        `The service is operated by ${renderPlaceholder(locale, "OPERATOR_ENTITY")}.`,
      ],
    },
    {
      heading: "3. Your account, and how it ends",
      paragraphs: [
        "You may delete your account at any time from within the application. Deletion is irreversible from the moment removal begins: your content, files and associated records are erased, and what remains is enumerated in the Privacy Policy.",
        "The operator may suspend an account administratively. A suspended account still exists and its data remains intact, but no product action is accepted while the suspension lasts. Every suspension and reactivation is recorded with actor, reason and time.",
        "The operator may also start an account deletion administratively. That freezes the account; the actual removal runs from the account holder's own session.",
      ],
    },
    {
      heading: "4. Acceptable use",
      paragraphs: [
        "Do not use the service for unlawful activity, to process content you have no right to process, to attempt to reach another account's data, or to circumvent technical and usage limits.",
        "Violations may lead to suspension. The reason is recorded from a closed set of codes, and the suspended-account surface shows only the corresponding public label.",
      ],
    },
    {
      heading: "5. Your AI provider key, and its costs",
      paragraphs: [
        "AI processing uses your own provider key, supplied by you and stored encrypted. Calls to the provider are billed to your account with that provider, not to the operator's.",
        "You are responsible for those costs, for the limits and for the balance of your provider account. If the key is removed, becomes invalid, or the balance runs out, the product still records your entries but does not process them.",
      ],
    },
    {
      heading: "6. Displayed amounts are estimates",
      paragraphs: [
        "The cost pages show estimates computed from a price snapshot recorded at the time of each call and from the token counts the provider reports. They exist for tracking and are not an invoice. The real charge is your provider's.",
      ],
    },
    {
      heading: "7. No warranties",
      paragraphs: [
        "During pre-launch the service is offered without warranty of fitness for any particular purpose, without an availability guarantee and without a support commitment. Interpretations produced by artificial intelligence can be wrong; check them before acting on them.",
      ],
    },
    {
      heading: "8. Changes to these terms",
      paragraphs: [
        "Each document carries a version. When the version changes, acceptance is requested again on your next session, and product access resumes once the new acceptance is recorded. Declining is a real path: you may sign out or delete the account.",
      ],
    },
    {
      heading: "9. Governing law and forum",
      paragraphs: [
        `${renderPlaceholder(locale, "GOVERNING_LAW")} applies, with the forum at ${renderPlaceholder(locale, "JURISDICTION")}.`,
      ],
    },
    {
      heading: "10. Contact",
      paragraphs: [`For anything concerning these terms: ${renderPlaceholder(locale, "OPERATOR_CONTACT")}.`],
    },
  ];
}

function privacy(locale: Locale): readonly LegalSection[] {
  if (locale === "pt-BR") {
    return [
      {
        heading: "1. Quem é responsável",
        paragraphs: [
          `O responsável pelo tratamento é ${renderPlaceholder(locale, "OPERATOR_ENTITY")}, que pode ser contatado em ${renderPlaceholder(locale, "OPERATOR_CONTACT")}.`,
        ],
      },
      {
        heading: "2. O que é armazenado",
        paragraphs: [
          "Os textos que você captura e o conteúdo original de cada registro; as interpretações estruturadas e suas versões; tarefas, pessoas, projetos, organizações, contextos, etiquetas e as relações entre eles; perguntas pendentes e suas resoluções; conversas de chat; memórias; lembretes e notificações; arquivos enviados e o texto extraído deles; a trilha de auditoria; e o registro de consumo de inteligência artificial.",
          "Também são armazenados dados de conta: e-mail, nome de exibição, preferências, fuso horário e idioma. A senha é guardada e verificada pelo provedor de autenticação, nunca por esta aplicação.",
        ],
      },
      {
        heading: "3. Processamento por terceiro, e o que sai daqui",
        paragraphs: [
          "O processamento por inteligência artificial é feito pela OpenAI, um processador externo. O conteúdo do seu registro, o conteúdo extraído dos seus arquivos e o texto das suas conversas são enviados a ela para produzir interpretações, respostas e representações vetoriais.",
          "Para analisar um arquivo, o sistema gera uma URL assinada e temporária do arquivo e a entrega ao provedor. A URL expira; enquanto vale, quem a tiver alcança o arquivo.",
          "A chave de provedor é sua: ela é guardada criptografada, decifrada no servidor apenas no momento de cada chamada, e nunca é devolvida para leitura — nem para você. O que a interface mostra é uma impressão digital curta, não a chave.",
          "O processamento é assíncrono: capturar um registro retorna imediatamente e a interpretação acontece depois, em segundo plano.",
        ],
      },
      {
        heading: "4. Por quanto tempo",
        paragraphs: retentionParagraphs(locale),
      },
      {
        heading: "5. O que a exclusão remove, e o que ela mantém",
        paragraphs: [
          "A exclusão da conta remove as linhas de todas as tabelas que pertencem a você e os arquivos armazenados sob o seu prefixo. A verificação de resíduo é executada sobre a lista de tabelas lida do próprio banco no momento da exclusão, e a remoção para em vez de forçar diante de qualquer coisa que não consiga classificar.",
          "Permanece um único registro, sem qualquer identificador seu: um identificador de evento opaco, os horários de cada etapa, o desfecho, as contagens de objetos, bytes e linhas removidos, e um resumo criptográfico da sessão que pediu a exclusão. Não há nele identificador de usuário, e-mail nem nome. Ele existe para que uma exclusão possa ser auditada sem reidentificar a pessoa que ela apagou.",
          "Registros de consumo de IA de outras contas permanecem, e não fazem referência a nada da conta excluída.",
        ],
      },
      {
        heading: "6. Suspensão",
        paragraphs: [
          "Uma conta suspensa não pode agir no produto, mas nada é apagado: as contagens de linhas permanecem idênticas ao longo de um ciclo de suspensão e reativação. Lembretes que vencerem durante a suspensão não são entregues depois; eles continuam na sua lista.",
        ],
      },
      {
        heading: "7. Segurança",
        paragraphs: [
          "O isolamento entre contas é imposto no banco de dados por políticas de linha, e não apenas na aplicação. Ações automáticas são auditáveis. O balde de arquivos é privado e o acesso se dá por URLs assinadas de curta duração.",
          "Nesta versão de pré-lançamento não há verificação antimalware sobre arquivos enviados; os controles compensatórios são a lista fechada de tipos aceitos, o limite de tamanho e o balde privado.",
        ],
      },
      {
        heading: "8. Mudanças nesta política",
        paragraphs: [
          "Esta política tem uma versão. Quando a versão muda, o aceite é pedido de novo na sua próxima sessão. O registro do aceite fica no servidor; limpar o navegador não altera nada quanto a isso.",
        ],
      },
    ];
  }

  return [
    {
      heading: "1. Who is responsible",
      paragraphs: [
        `The controller is ${renderPlaceholder(locale, "OPERATOR_ENTITY")}, reachable at ${renderPlaceholder(locale, "OPERATOR_CONTACT")}.`,
      ],
    },
    {
      heading: "2. What is stored",
      paragraphs: [
        "The text you capture and each record's original content; structured interpretations and their versions; tasks, people, projects, organizations, contexts, tags and the relationships between them; pending questions and their resolutions; chat conversations; memories; reminders and notifications; uploaded files and the text extracted from them; the audit trail; and the AI usage ledger.",
        "Account data is also stored: email, display name, preferences, timezone and language. Your password is stored and verified by the authentication provider, never by this application.",
      ],
    },
    {
      heading: "3. Third-party processing, and what leaves here",
      paragraphs: [
        "AI processing is performed by OpenAI, an external processor. Your record's content, the content extracted from your files and the text of your conversations are sent to it to produce interpretations, answers and vector representations.",
        "To analyse a file, the system generates a temporary signed URL for that file and hands it to the provider. The URL expires; while it is valid, whoever holds it can reach the file.",
        "The provider key is yours: it is stored encrypted, decrypted server-side only at the moment of each call, and never returned for reading — not even to you. What the interface shows is a short fingerprint, not the key.",
        "Processing is asynchronous: capturing a record returns immediately and interpretation happens afterwards, in the background.",
      ],
    },
    {
      heading: "4. For how long",
      paragraphs: retentionParagraphs(locale),
    },
    {
      heading: "5. What deletion removes, and what it keeps",
      paragraphs: [
        "Deleting your account removes the rows in every table that belongs to you and the files stored under your prefix. The residue check runs over the table list read from the database itself at deletion time, and removal stops rather than forces when it meets anything it cannot classify.",
        "One record remains, carrying no identifier of yours: an opaque event id, the timestamps of each step, the outcome, the counts of objects, bytes and rows removed, and a cryptographic digest of the session that requested the deletion. It contains no user id, no email and no name. It exists so a deletion can be audited without re-identifying the person it erased.",
        "AI usage records belonging to other accounts remain, and reference nothing of the deleted account.",
      ],
    },
    {
      heading: "6. Suspension",
      paragraphs: [
        "A suspended account cannot act in the product, but nothing is erased: row counts stay identical across a suspend-and-reactivate cycle. Reminders that come due during the suspension are not delivered afterwards; they stay in your list.",
      ],
    },
    {
      heading: "7. Security",
      paragraphs: [
        "Isolation between accounts is enforced in the database by row-level policies, not only in the application. Automatic actions are auditable. The file bucket is private and access is through short-lived signed URLs.",
        "In this pre-launch version there is no anti-malware scanning of uploaded files; the compensating controls are the closed list of accepted types, the size limit and the private bucket.",
      ],
    },
    {
      heading: "8. Changes to this policy",
      paragraphs: [
        "This policy carries a version. When the version changes, acceptance is requested again on your next session. The acceptance record lives on the server; clearing your browser changes nothing about it.",
      ],
    },
  ];
}

const titles: Record<Locale, Record<PolicyDocument, string>> = {
  "pt-BR": { terms: "Termos de Uso", privacy: "Política de Privacidade" },
  en: { terms: "Terms of Service", privacy: "Privacy Policy" },
};

export function getLegalDocument(locale: Locale, kind: PolicyDocument): LegalDocumentContent {
  const version = POLICY_VERSIONS[kind];
  return {
    kind,
    title: titles[locale][kind],
    version,
    versionLabel: chrome[locale].versionLabel(version),
    reviewBanner: chrome[locale].reviewBanner,
    sections: kind === "terms" ? terms(locale) : privacy(locale),
  };
}
