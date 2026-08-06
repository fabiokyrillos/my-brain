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
import type { DeletionRefusalCode } from "./deletion-request-state";

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
  readonly errors: Readonly<Record<DeletionRefusalCode, string>>;
  /**
   * Shown after a refusal that **spent the challenge**.
   *
   * A Turnstile token is single-use, and the widget does not re-issue one for a
   * form that stays on screen. So after any refusal the provider actually
   * answered — a wrong password, a rejected token — the next attempt needs a
   * fresh challenge, and the only way to get one here is a reload. Saying so is
   * better than a retry that fails for a reason the user cannot see. A wrong
   * confirmation word does not appear here on purpose: it is compared before
   * the provider is called, so the token is still unspent.
   */
  readonly retryHint: string;
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
    // Two sentences, because they ask for two different things: one says the
    // check did not run, the other says it ran and did not pass.
    "captcha-missing":
      "A verificação de segurança não foi concluída. Recarregue a página e tente de novo.",
    "captcha-failed":
      "A verificação de segurança não foi aceita. Recarregue a página e tente de novo.",
    password: "A senha não confere.",
    phrase: "Digite exatamente a palavra pedida para confirmar.",
    lifecycle: "Esta conta não está em um estado que permita esta ação.",
    throttled: "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
    unavailable: "Não foi possível verificar sua identidade agora. Tente novamente em instantes.",
    failed: "Não foi possível iniciar a exclusão agora. Tente novamente.",
  },
  retryHint: "Recarregue a página antes de tentar novamente: a verificação de segurança só vale uma vez.",
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
    "captcha-missing":
      "The security check did not complete. Reload the page and try again.",
    "captcha-failed":
      "The security check was not accepted. Reload the page and try again.",
    password: "That password is not correct.",
    phrase: "Type the confirmation word exactly as shown.",
    lifecycle: "This account is not in a state that allows this action.",
    throttled: "Too many attempts. Wait a few minutes and try again.",
    unavailable: "We could not verify your identity right now. Please try again shortly.",
    failed: "We could not start the deletion right now. Please try again.",
  },
  retryHint: "Reload the page before trying again: the security check is valid only once.",
  receiptTitle: "Account deleted",
  receiptBody: "Your data and your files are gone. This is the end of the session.",
};

const catalog: Record<Locale, DeletionCopy> = { "pt-BR": ptBR, en };

export function getDeletionCopy(locale: Locale): DeletionCopy {
  return catalog[locale];
}
