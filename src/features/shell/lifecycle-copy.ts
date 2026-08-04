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
 * be an invention.
 *
 * ## SH.3: the reason's public label, and nothing beyond it
 *
 * SH-COPY-002 lets the suspended surface say *what kind* of suspension this is
 * and no more. `suspensionReasons` maps each stored code to one short public
 * label; there is no operator identity, no free text (the database refuses free
 * text at the column), and no internal code. A stored code with no entry here
 * renders the generic label rather than the code — the same fail-closed
 * instinct as `unknown` above — and a unit test pins this key set to the
 * migration's CHECK, so the two cannot drift.
 *
 * The reminder sentence is SH-SUSPEND-005's declared behavior, said to the user
 * in the one place they can read it: what came due during the suspension is not
 * delivered afterwards, and the reminders themselves are still there.
 */

import type { Locale } from "@/lib/preferences";

export type AccountStateKind = "suspended" | "deleting" | "unknown";

/**
 * The suspension reasons the database accepts, as a repository constant.
 *
 * Kept in this file rather than a schema module because the label is the only
 * thing the product does with a reason code — and keeping the set beside its
 * labels is what makes "every code has a label" a fact one file can state.
 */
export const SUSPENSION_REASON_CODES = [
  "operator_suspension",
  "operator_suspension_abuse",
  "operator_suspension_security",
] as const;

export type SuspensionReasonCode = (typeof SUSPENSION_REASON_CODES)[number];

export function isSuspensionReasonCode(value: unknown): value is SuspensionReasonCode {
  return (
    typeof value === "string" &&
    (SUSPENSION_REASON_CODES as readonly string[]).includes(value)
  );
}

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
  /** SH-COPY-002: one short public label per stored reason. No code renders raw. */
  readonly suspensionReasons: Record<SuspensionReasonCode, string>;
  /** SH-SUSPEND-005, stated to the user rather than only to the database. */
  readonly suspendedReminders: string;
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
  suspensionReasons: {
    operator_suspension: "Motivo: a conta está em análise.",
    operator_suspension_abuse: "Motivo: revisão de uso aceitável.",
    operator_suspension_security: "Motivo: precaução de segurança.",
  },
  suspendedReminders:
    "Lembretes que vencerem durante a suspensão não serão enviados depois; eles continuam na sua lista de lembretes.",
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
  suspensionReasons: {
    operator_suspension: "Reason: the account is under review.",
    operator_suspension_abuse: "Reason: acceptable-use review.",
    operator_suspension_security: "Reason: security precaution.",
  },
  suspendedReminders:
    "Reminders that come due during the suspension are not delivered afterwards; they stay in your reminders list.",
  signOut: "Sign out",
  signingOut: "Signing out…",
};

const catalog: Record<Locale, LifecycleCopy> = { "pt-BR": ptBR, en };

export function getLifecycleCopy(locale: Locale): LifecycleCopy {
  return catalog[locale];
}

/**
 * The public label for a stored reason code, fail-closed.
 *
 * Anything the database could hold but this file does not label — a future
 * code, a corrupted value, `null` — falls back to the generic label. A stored
 * enum never reaches the page.
 */
export function getSuspensionReasonLabel(locale: Locale, reasonCode: unknown): string {
  const copy = getLifecycleCopy(locale);
  return isSuspensionReasonCode(reasonCode)
    ? copy.suspensionReasons[reasonCode]
    : copy.suspensionReasons.operator_suspension;
}
