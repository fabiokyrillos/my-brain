/**
 * User-facing copy for the confirmation-resend surface — SH-COPY-001, both
 * locales, no inline ternaries.
 *
 * A typed module rather than `pt ? … : …` in the page, because the
 * locale-ternary ceiling is a guarded number (`locale-ternary-guard.test.ts`)
 * and new copy is exactly what it exists to keep out. The `legal/copy.ts` shape.
 *
 * ## Why the copy promises nothing about the address
 *
 * `sent` says *"if an account is waiting to be confirmed"*, never *"we sent a
 * link"*. SH-SIGNUP-011 makes the **outcome** uniform for an address that exists
 * and one that does not; copy that asserted delivery would put the distinction
 * straight back into the sentence the reader gets, which is precisely where an
 * attacker would read it. The uniform response and the uniform sentence have to
 * agree or neither is worth anything.
 */

import type { Locale } from "@/lib/preferences";

export type ResendCopy = {
  readonly eyebrow: string;
  readonly title: string;
  /** Deliberately conditional: "if there is an account…", never "we sent…". */
  readonly lead: string;
  readonly emailLabel: string;
  readonly submit: string;
  /** `AUTH-SIGNIN-PENDING-STATE`. Shown and announced while the request is out. */
  readonly submitPending: string;
  readonly backToLogin: string;
  /** The entry point from the sign-in surface. */
  readonly linkFromLogin: string;
};

const copy: Readonly<Record<Locale, ResendCopy>> = {
  "pt-BR": {
    eyebrow: "ACESSO",
    title: "Reenviar confirmação",
    lead: "Se houver uma conta aguardando confirmação para este e-mail, enviaremos um novo link.",
    emailLabel: "E-mail",
    submit: "Reenviar link",
    submitPending: "Reenviando link…",
    backToLogin: "Voltar ao login",
    linkFromLogin: "Reenviar confirmação",
  },
  en: {
    eyebrow: "ACCESS",
    title: "Resend confirmation",
    lead: "If an account is waiting to be confirmed for this address, we will send a new link.",
    emailLabel: "Email",
    submit: "Resend link",
    submitPending: "Resending link…",
    backToLogin: "Back to sign in",
    linkFromLogin: "Resend confirmation",
  },
};

export function getResendCopy(locale: Locale): ResendCopy {
  return copy[locale];
}

/**
 * `AUTH-SIGNIN-PENDING-STATE` — every auth submit button's two states.
 *
 * Here rather than as a `pt ? …` in each page for the reason this module opens
 * with: `locale-ternary-guard.test.ts` holds a ceiling that adding one would
 * break. Moving the existing labels in lowers the count rather than raising it.
 *
 * `resend` is deliberately absent. Its label already lives on `ResendCopy`
 * beside the rest of that surface's words, and naming it again here would be a
 * second source for one sentence — the shape this repository has been bitten
 * by before. It carries its own `submitPending` instead.
 */
export type AuthSubmitCopy = {
  readonly submit: string;
  /** Shown on the button, and announced politely, while the request is out. */
  readonly submitPending: string;
};

export type AuthSubmitForm = "signIn" | "signUp" | "recover" | "reset";

const submitCopy: Readonly<Record<AuthSubmitForm, Readonly<Record<Locale, AuthSubmitCopy>>>> = {
  signIn: {
    "pt-BR": { submit: "Entrar", submitPending: "Entrando…" },
    en: { submit: "Sign in", submitPending: "Signing in…" },
  },
  signUp: {
    "pt-BR": { submit: "Criar conta", submitPending: "Criando conta…" },
    en: { submit: "Create account", submitPending: "Creating account…" },
  },
  recover: {
    "pt-BR": { submit: "Enviar link", submitPending: "Enviando link…" },
    en: { submit: "Send link", submitPending: "Sending link…" },
  },
  reset: {
    "pt-BR": { submit: "Atualizar senha", submitPending: "Atualizando senha…" },
    en: { submit: "Update password", submitPending: "Updating password…" },
  },
};

export function getAuthSubmitCopy(form: AuthSubmitForm, locale: Locale): AuthSubmitCopy {
  return submitCopy[form][locale];
}
