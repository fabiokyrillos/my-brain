import type { Locale } from "@/lib/preferences";

import type { PrivacyCategoryKey } from "./enumeration";

/**
 * Privacidade e dados — the copy for slice 2O.5, in the typed feature-module
 * shape `docs/ENGINEERING_STANDARDS.md` makes canonical (the
 * `daily-cycle/copy.ts` form), not a scatter of locale ternaries.
 *
 * Two claims here are load-bearing and are checked by
 * `privacy-enumeration-guard.test.ts` rather than trusted:
 *
 *  - the census says it counts **the same things the deletion removes**, and
 *  - the export says it is **complete or refused**, never partial.
 *
 * A sentence the product cannot back is the defect `2O-ENTRY-002` was written
 * against, and it binds here for the same reason.
 */

export type PrivacyCopy = Readonly<{
  title: string;
  intro: string;
  census: Readonly<{
    heading: string;
    lead: string;
    rowsLabel: (rows: number) => string;
    unreadable: string;
    unreadableExplained: string;
    noSurface: string;
    seeSurface: string;
    categories: Readonly<Record<PrivacyCategoryKey, string>>;
    withheldHeading: string;
    withheldLead: string;
    withheldReasons: Readonly<Record<"throttle-counter" | "operator-error-sink", string>>;
  }>;
  export: Readonly<{
    heading: string;
    lead: string;
    action: string;
    pending: string;
    ready: (rows: number) => string;
    download: string;
    refusedTooLarge: string;
    refusedUnreadable: string;
    failed: string;
  }>;
  retention: Readonly<{ heading: string; lead: string; unenforced: string; deletionKeeps: string }>;
  deletion: Readonly<{ heading: string; lead: string; action: string }>;
  sessions: Readonly<{
    heading: string;
    signedInAs: (email: string) => string;
    signedInUnnamed: string;
    lead: string;
    action: string;
    failed: string;
  }>;
  consent: Readonly<{
    heading: string;
    lead: string;
    unreadable: string;
    never: string;
    accepted: (version: string, date: string) => string;
    outdated: (current: string) => string;
    current: string;
    read: string;
    optionalHeading: string;
    optionalLead: string;
    revoke: string;
    revoked: string;
    notGranted: string;
    revokeFailed: string;
  }>;
}>;

const ptBR: PrivacyCopy = {
  title: "Privacidade e dados",
  intro:
    "O que está guardado sobre você, como levar embora e como encerrar. As categorias abaixo cobrem exatamente as tabelas que a exclusão da conta percorre.",
  census: {
    heading: "O que está guardado sobre você",
    lead: "Contagens, nunca conteúdo. Cada número é lido com a sua própria identidade e as políticas de acesso da sua conta.",
    rowsLabel: (rows) => (rows === 1 ? "1 registro" : `${rows} registros`),
    unreadable: "não foi possível ler",
    unreadableExplained:
      "Uma leitura recusada não é a mesma coisa que nenhum dado. Quando não conseguimos contar, dizemos isso — não mostramos zero.",
    noSurface: "sem página própria; aparece na exportação",
    seeSurface: "Ver",
    categories: {
      entries: "Registros e interpretações",
      work: "Tarefas e compromissos",
      entities: "Pessoas, projetos e contextos",
      memories: "Memórias e resumos",
      chat: "Conversas",
      files: "Arquivos e análises",
      reminders: "Lembretes e notificações",
      questions: "Perguntas pendentes",
      ai: "Uso de IA e credencial",
      operations: "Processamento e auditoria",
      account: "Conta e preferências",
      usage: "Eventos de uso do produto",
    },
    withheldHeading: "O que não é mostrado aqui, e por quê",
    withheldLead:
      "Estas tabelas pertencem à sua conta e são removidas na exclusão, mas não são legíveis por você. A razão está dita porque uma exclusão que ninguém vê é indistinguível de um esquecimento.",
    withheldReasons: {
      "throttle-counter":
        "contador de proteção contra abuso — poder lê-lo permitiria medir o limite e contorná-lo",
      "operator-error-sink": "registro de erros operacionais, lido só por quem opera o sistema",
    },
  },
  export: {
    heading: "Levar seus dados",
    lead: "Um arquivo com tudo o que a exportação alcança, gerado na hora. Se qualquer parte não puder ser lida, a exportação é recusada — nunca entregamos um pedaço chamando de tudo.",
    action: "Gerar exportação",
    pending: "Gerando…",
    ready: (rows) => `Pronto: ${rows} registros. O arquivo diz o que cobre e quando foi gerado.`,
    download: "Baixar arquivo",
    refusedTooLarge:
      "Recusada: sua conta é grande demais para uma exportação gerada na hora. Nada parcial foi entregue.",
    refusedUnreadable:
      "Recusada: uma parte dos seus dados não pôde ser lida agora, então a exportação não estaria completa.",
    failed: "Não foi possível gerar a exportação agora. Tente de novo.",
  },
  retention: {
    heading: "Por quanto tempo guardamos",
    lead: "Esta é a política publicada, gerada a partir do próprio repositório.",
    unenforced:
      "Atenção: nem toda janela abaixo é aplicada automaticamente hoje. Onde não há varredura ativa, o prazo é a política e não a prática.",
    deletionKeeps: "O que sobrevive à exclusão da conta",
  },
  deletion: {
    heading: "Encerrar a conta",
    lead: "A exclusão pede confirmação, exige CAPTCHA e reautenticação, roda em uma transação e tem janela de recuperação. Nada disso muda por causa desta página.",
    action: "Ir para a exclusão da conta",
  },
  sessions: {
    heading: "Sessões",
    signedInAs: (email) => `Você está conectado como ${email}.`,
    signedInUnnamed: "Você está conectado nesta conta.",
    lead: "Encerrar em todos os dispositivos revoga todas as sessões desta conta, inclusive esta. Não mantemos uma lista de dispositivos.",
    action: "Sair de todos os dispositivos",
    failed: "Não foi possível encerrar as sessões agora. Tente de novo.",
  },
  consent: {
    heading: "O que você aceitou",
    lead: "A versão aceita e a data, lidas do registro da sua conta.",
    unreadable:
      "Não foi possível ler seu registro de aceites agora. Isso não significa que você não aceitou nada.",
    never: "Sem aceite registrado.",
    accepted: (version, date) => `Versão ${version}, aceita em ${date}.`,
    outdated: (current) => `A versão em vigor é a ${current}.`,
    current: "Em dia.",
    read: "Ler o documento",
    optionalHeading: "Consentimentos opcionais",
    optionalLead:
      "Notificações são o único consentimento opcional hoje. Aceitar os termos e a política de privacidade não é opcional — sem eles o produto não funciona.",
    revoke: "Revogar notificações",
    revoked: "Notificações revogadas.",
    notGranted: "Notificações não estão ativas nesta conta.",
    revokeFailed: "Não foi possível revogar agora. Tente de novo.",
  },
};

const en: PrivacyCopy = {
  title: "Privacy and data",
  intro:
    "What is stored about you, how to take it with you, and how to end things. The categories below cover exactly the tables account deletion walks.",
  census: {
    heading: "What is stored about you",
    lead: "Counts, never content. Every number is read with your own identity and your account's own access policies.",
    rowsLabel: (rows) => (rows === 1 ? "1 record" : `${rows} records`),
    unreadable: "could not be read",
    unreadableExplained:
      "A refused read is not the same as no data. When we cannot count, we say so — we do not show zero.",
    noSurface: "no page of its own; it appears in the export",
    seeSurface: "View",
    categories: {
      entries: "Entries and interpretations",
      work: "Tasks and commitments",
      entities: "People, projects and contexts",
      memories: "Memories and summaries",
      chat: "Conversations",
      files: "Files and analyses",
      reminders: "Reminders and notifications",
      questions: "Pending questions",
      ai: "AI usage and credential",
      operations: "Processing and audit",
      account: "Account and preferences",
      usage: "Product usage events",
    },
    withheldHeading: "What is not shown here, and why",
    withheldLead:
      "These tables belong to your account and are removed on deletion, but they are not readable by you. The reason is stated, because an exclusion nobody can see is indistinguishable from an omission.",
    withheldReasons: {
      "throttle-counter":
        "abuse-prevention counter — being able to read it would let the ceiling be measured and worked around",
      "operator-error-sink": "operational error record, read only by whoever runs the system",
    },
  },
  export: {
    heading: "Take your data",
    lead: "One file with everything the export reaches, built on the spot. If any part cannot be read, the export refuses — we never hand over a piece and call it the whole.",
    action: "Generate export",
    pending: "Generating…",
    ready: (rows) => `Ready: ${rows} records. The file states what it covers and when it was made.`,
    download: "Download file",
    refusedTooLarge:
      "Refused: your account is too large for an export built on the spot. Nothing partial was handed over.",
    refusedUnreadable:
      "Refused: part of your data could not be read just now, so the export would not be complete.",
    failed: "We could not build the export just now. Try again.",
  },
  retention: {
    heading: "How long we keep things",
    lead: "This is the published policy, generated from the repository itself.",
    unenforced:
      "Note: not every window below is automatically enforced today. Where no sweep runs, the period is the policy and not the practice.",
    deletionKeeps: "What survives account deletion",
  },
  deletion: {
    heading: "End the account",
    lead: "Deletion asks for confirmation, requires a CAPTCHA and re-authentication, runs in a transaction and has a recovery window. None of that changes because of this page.",
    action: "Go to account deletion",
  },
  sessions: {
    heading: "Sessions",
    signedInAs: (email) => `You are signed in as ${email}.`,
    signedInUnnamed: "You are signed in to this account.",
    lead: "Signing out everywhere revokes every session for this account, including this one. We keep no device list.",
    action: "Sign out everywhere",
    failed: "We could not end your sessions just now. Try again.",
  },
  consent: {
    heading: "What you have accepted",
    lead: "The accepted version and the date, read from your account's own record.",
    unreadable:
      "We could not read your acceptance record just now. That does not mean you accepted nothing.",
    never: "No acceptance recorded.",
    accepted: (version, date) => `Version ${version}, accepted on ${date}.`,
    outdated: (current) => `The version in force is ${current}.`,
    current: "Up to date.",
    read: "Read the document",
    optionalHeading: "Optional consents",
    optionalLead:
      "Notifications are the only optional consent today. Accepting the terms and the privacy policy is not optional — without them the product does not run.",
    revoke: "Revoke notifications",
    revoked: "Notifications revoked.",
    notGranted: "Notifications are not active on this account.",
    revokeFailed: "We could not revoke just now. Try again.",
  },
};

export function getPrivacyCopy(locale: Locale): PrivacyCopy {
  return locale === "en" ? en : ptBR;
}
