/**
 * User-facing copy for the legal routes, the signup consent control and the
 * consent interposition — SH-COPY-001, both locales, no inline ternaries.
 *
 * The document *bodies* live in `documents.ts`; this is the chrome around them
 * and the words the consent surfaces use.
 */

import type { Locale } from "@/lib/preferences";

export type LegalCopy = {
  readonly backToProduct: string;
  readonly backToLogin: string;
  readonly otherDocument: Readonly<Record<"terms" | "privacy", string>>;

  /** The signup consent control (SH-LEGAL-007). */
  readonly consentControl: {
    /** Rendered around the two links; the surface supplies the anchors. */
    readonly leadIn: string;
    readonly conjunction: string;
    readonly trailer: string;
    readonly missing: string;
  };

  /** The first-session / version-bump interposition (SH-LEGAL-008/009). */
  readonly interposition: {
    readonly title: string;
    readonly firstSessionBody: string;
    readonly updatedBody: string;
    readonly readFirst: string;
    readonly accept: string;
    readonly accepting: string;
    readonly declineTitle: string;
    readonly declineBody: string;
    readonly declineSignOut: string;
    readonly declineDelete: string;
    readonly failed: string;
  };
};

const ptBR: LegalCopy = {
  backToProduct: "Voltar ao produto",
  backToLogin: "Ir para o login",
  otherDocument: { terms: "Ler os Termos de Uso", privacy: "Ler a Política de Privacidade" },
  consentControl: {
    leadIn: "Li e aceito os",
    conjunction: "e a",
    trailer: ".",
    missing: "É preciso aceitar os Termos de Uso e a Política de Privacidade para criar a conta.",
  },
  interposition: {
    title: "Antes de continuar",
    firstSessionBody:
      "Para usar o produto, é preciso aceitar os Termos de Uso e a Política de Privacidade. O aceite fica registrado no servidor, com a versão aceita.",
    updatedBody:
      "Os documentos mudaram desde o seu último aceite. Leia a versão atual e aceite para continuar; o acesso ao produto volta assim que o novo aceite é registrado.",
    readFirst: "Leia antes de aceitar:",
    accept: "Aceitar e continuar",
    accepting: "Registrando…",
    declineTitle: "Se você não quiser aceitar",
    declineBody:
      "Aceitar não é obrigatório. Você pode encerrar a sessão e voltar depois, ou excluir a conta — a exclusão apaga o seu conteúdo e é irreversível.",
    declineSignOut: "Sair da conta",
    declineDelete: "Excluir a conta",
    failed: "Não foi possível registrar o aceite agora. Tente novamente.",
  },
};

const en: LegalCopy = {
  backToProduct: "Back to the product",
  backToLogin: "Go to sign in",
  otherDocument: { terms: "Read the Terms of Service", privacy: "Read the Privacy Policy" },
  consentControl: {
    leadIn: "I have read and accept the",
    conjunction: "and the",
    trailer: ".",
    missing: "You must accept the Terms of Service and the Privacy Policy to create an account.",
  },
  interposition: {
    title: "Before you continue",
    firstSessionBody:
      "To use the product you need to accept the Terms of Service and the Privacy Policy. The acceptance is recorded on the server, together with the version you accepted.",
    updatedBody:
      "The documents have changed since you last accepted. Read the current version and accept to continue; product access resumes as soon as the new acceptance is recorded.",
    readFirst: "Read before accepting:",
    accept: "Accept and continue",
    accepting: "Recording…",
    declineTitle: "If you would rather not accept",
    declineBody:
      "Accepting is not compulsory. You can sign out and come back later, or delete the account — deletion erases your content and is irreversible.",
    declineSignOut: "Sign out",
    declineDelete: "Delete the account",
    failed: "The acceptance could not be recorded right now. Try again.",
  },
};

const catalog: Record<Locale, LegalCopy> = { "pt-BR": ptBR, en };

export function getLegalCopy(locale: Locale): LegalCopy {
  return catalog[locale];
}
