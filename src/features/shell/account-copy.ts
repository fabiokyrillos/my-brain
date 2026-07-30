/**
 * The account and session surface's copy, typed (ADR-036,
 * `docs/ENGINEERING_STANDARDS.md`).
 *
 * A feature copy module rather than three new keys in `src/i18n/messages.ts`:
 * that record is the hand-rolled shell catalogue read by three files, and the
 * canonical mechanism for new copy is a typed `copy.ts` in the
 * `daily-cycle/copy.ts` shape. This is new copy.
 *
 * `accountFallback` exists because the identity is allowed to be absent. A
 * profile row with no `display_name` and no `display_name` in the auth metadata
 * is an ordinary state — the register form collects one, but nothing forces it
 * to survive an edit — and the honest answer there is a neutral word for "your
 * account", never an email and never a uuid.
 */

import type { Locale } from "@/lib/preferences";

export type AccountCopy = {
  /** The accessible name of the disclosure control itself. */
  readonly menuLabel: string;
  /** Names the region the panel opens, so it is navigable by landmark. */
  readonly panelLabel: string;
  /** Precedes the display name, so "who am I signed in as" reads as a sentence. */
  readonly signedInAs: string;
  /** Rendered in place of a display name nobody supplied. */
  readonly accountFallback: string;
  readonly settings: string;
  readonly signOut: string;
  /** Announced while the sign-out round is in flight. */
  readonly signingOut: string;
  /** The localized failure state; sign-out is the one action with no retry loop. */
  readonly signOutFailed: string;
  /** Shown on the login page after a completed sign-out. */
  readonly signedOut: string;
};

const ptBR: AccountCopy = {
  menuLabel: "Sua conta",
  panelLabel: "Conta e sessão",
  signedInAs: "Conectado como",
  accountFallback: "Sua conta",
  settings: "Configurações",
  signOut: "Sair da conta",
  signingOut: "Saindo…",
  signOutFailed: "Não foi possível sair agora. Tente de novo.",
  signedOut: "Você saiu da sua conta.",
};

const en: AccountCopy = {
  menuLabel: "Your account",
  panelLabel: "Account and session",
  signedInAs: "Signed in as",
  accountFallback: "Your account",
  settings: "Settings",
  signOut: "Sign out",
  signingOut: "Signing out…",
  signOutFailed: "We could not sign you out just now. Try again.",
  signedOut: "You have been signed out.",
};

export const accountCopy = { "pt-BR": ptBR, en } satisfies Record<Locale, AccountCopy>;

export function getAccountCopy(locale: Locale): AccountCopy {
  return accountCopy[locale];
}
