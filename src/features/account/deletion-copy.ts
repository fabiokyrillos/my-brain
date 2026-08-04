/**
 * The account-deletion surface's copy (SH-COPY-003, SH-COPY-001).
 *
 * SH-COPY-003 requires the surface to state, *before* the confirmation control
 * is usable: that deletion is irreversible, what is removed, what the deletion
 * log retains, and the expected timeline. Those four are `irreversible`,
 * `removes`, `retains` and `timeline` below — named after the claims rather
 * than after their position, so a future edit that drops one is visible.
 *
 * `retains` mirrors the enumerated field list of `account_deletion_log`
 * (`202608040072`). SH-LEGAL-014 will pin the Privacy Policy to the same
 * enumeration in SH.4; keeping the sentence here means the two cannot drift
 * silently, because a unit test compares them.
 *
 * The confirmation phrase is intentionally locale-specific: a user typing a
 * word in their own language is confirming something they read, not copying an
 * opaque token.
 */

import type { Locale } from "@/lib/preferences";

export type DeletionCopy = {
  readonly title: string;
  readonly irreversible: string;
  readonly removes: string;
  readonly retains: string;
  readonly timeline: string;
  /** The exact word the user must type; compared server-side. */
  readonly confirmationPhrase: string;
  readonly confirmationLabel: string;
  readonly passwordLabel: string;
  readonly submit: string;
  readonly submitting: string;
  readonly errors: {
    readonly session: string;
    readonly password: string;
    readonly phrase: string;
    readonly lifecycle: string;
    readonly failed: string;
  };
  /** Counts and timestamps only -- never a path, an id or an internal message. */
  readonly receiptTitle: string;
  readonly receiptBody: string;
};

const ptBR: DeletionCopy = {
  title: "Excluir a conta",
  irreversible:
    "A exclusão é definitiva. Depois que ela começa, não há como desfazer nem recuperar o que foi apagado.",
  removes:
    "Serão apagados todos os seus registros, interpretações, tarefas, pessoas, projetos, lembretes, conversas, memórias, arquivos enviados e o histórico de uso da sua conta.",
  retains:
    "Fica guardado apenas um registro sem identificação da própria exclusão: um identificador aleatório, as datas de cada etapa, a quantidade de itens e arquivos removidos e um código derivado da sessão que pediu a exclusão. Ele não contém seu e-mail, seu nome nem o identificador da sua conta.",
  timeline:
    "A exclusão começa assim que você confirma e costuma terminar em alguns instantes. Enquanto ela não termina, a conta fica bloqueada para qualquer nova ação.",
  confirmationPhrase: "EXCLUIR",
  confirmationLabel: "Para confirmar, digite EXCLUIR",
  passwordLabel: "Confirme sua senha",
  submit: "Excluir minha conta definitivamente",
  submitting: "Excluindo…",
  errors: {
    session: "Sua sessão expirou. Entre novamente para continuar.",
    password: "A senha não confere.",
    phrase: "Digite exatamente a palavra pedida para confirmar.",
    lifecycle: "Esta conta não está em um estado que permita esta ação.",
    failed: "Não foi possível iniciar a exclusão agora. Tente novamente.",
  },
  receiptTitle: "Conta excluída",
  receiptBody: "Removemos seus dados e seus arquivos. Este é o fim da sessão.",
};

const en: DeletionCopy = {
  title: "Delete your account",
  irreversible:
    "Deletion is permanent. Once it starts there is no undo and no way to recover what was erased.",
  removes:
    "This erases all of your records, interpretations, tasks, people, projects, reminders, conversations, memories, uploaded files, and your account's usage history.",
  retains:
    "Only an unidentified record of the deletion itself is kept: a random identifier, the timestamp of each step, how many items and files were removed, and a code derived from the session that requested it. It holds no email, no name and no account identifier.",
  timeline:
    "Deletion starts as soon as you confirm and usually finishes within moments. Until it finishes, the account is blocked from any new action.",
  confirmationPhrase: "DELETE",
  confirmationLabel: "To confirm, type DELETE",
  passwordLabel: "Confirm your password",
  submit: "Permanently delete my account",
  submitting: "Deleting…",
  errors: {
    session: "Your session expired. Sign in again to continue.",
    password: "That password is not correct.",
    phrase: "Type the confirmation word exactly as shown.",
    lifecycle: "This account is not in a state that allows this action.",
    failed: "We could not start the deletion right now. Please try again.",
  },
  receiptTitle: "Account deleted",
  receiptBody: "Your data and your files are gone. This is the end of the session.",
};

const catalog: Record<Locale, DeletionCopy> = { "pt-BR": ptBR, en };

export function getDeletionCopy(locale: Locale): DeletionCopy {
  return catalog[locale];
}
