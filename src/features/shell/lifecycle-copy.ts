/**
 * Copy for the account-state surface (SH-LIFECYCLE-008, SH-COPY-001/002).
 *
 * A typed feature copy module in the `daily-cycle/copy.ts` shape, both locales,
 * no inline ternaries. The stored status enum never renders raw: each state
 * maps to prose, so a vocabulary change in the database cannot leak an
 * identifier into the UI (the no-stored-enum-leakage rule).
 *
 * The `unknown` state is the fail-closed answer: when the lifecycle row cannot
 * be read, the product surface stays closed and this copy says "unavailable",
 * never "suspended" — claiming a suspension the database did not state would
 * be an invention. SH.3 (SH-COPY-002) refines the suspended copy with the
 * contact path's final wording; the structure it needs exists here.
 */

import type { Locale } from "@/lib/preferences";

export type AccountStateKind = "suspended" | "deleting" | "unknown";

export type LifecycleCopy = {
  readonly states: Record<
    AccountStateKind,
    {
      /** The page's single h1. */
      readonly title: string;
      /** What is true about the account and its data — no internal codes. */
      readonly body: string;
      /** How to proceed (contact for suspended; wait for deleting; retry for unknown). */
      readonly nextStep: string;
    }
  >;
  /** The one action every non-active account keeps (SH-LIFECYCLE-010). */
  readonly signOut: string;
  readonly signingOut: string;
};

const ptBR: LifecycleCopy = {
  states: {
    suspended: {
      title: "Conta suspensa",
      body: "Sua conta está suspensa e o produto está indisponível por enquanto. Seus dados permanecem guardados e intactos.",
      nextStep: "Se você acredita que isso é um engano, entre em contato com o operador do serviço.",
    },
    deleting: {
      title: "Exclusão em andamento",
      body: "A exclusão desta conta foi iniciada. Nenhuma nova ação é aceita enquanto ela não termina.",
      nextStep: "Você pode encerrar a sessão com segurança; o processo continua sem você.",
    },
    unknown: {
      title: "Conta indisponível",
      body: "Não foi possível confirmar a situação da sua conta agora, então o produto permanece fechado por segurança.",
      nextStep: "Tente novamente em instantes ou encerre a sessão.",
    },
  },
  signOut: "Sair da conta",
  signingOut: "Saindo…",
};

const en: LifecycleCopy = {
  states: {
    suspended: {
      title: "Account suspended",
      body: "Your account is suspended and the product is unavailable for now. Your data remains stored and intact.",
      nextStep: "If you believe this is a mistake, contact the service operator.",
    },
    deleting: {
      title: "Deletion in progress",
      body: "Deletion of this account has started. No new actions are accepted until it finishes.",
      nextStep: "You can sign out safely; the process continues without you.",
    },
    unknown: {
      title: "Account unavailable",
      body: "We could not confirm your account's state right now, so the product stays closed as a precaution.",
      nextStep: "Try again in a moment, or sign out.",
    },
  },
  signOut: "Sign out",
  signingOut: "Signing out…",
};

const catalog: Record<Locale, LifecycleCopy> = { "pt-BR": ptBR, en };

export function getLifecycleCopy(locale: Locale): LifecycleCopy {
  return catalog[locale];
}
