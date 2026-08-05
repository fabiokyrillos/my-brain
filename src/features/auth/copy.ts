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
    backToLogin: "Voltar ao login",
    linkFromLogin: "Reenviar confirmação",
  },
  en: {
    eyebrow: "ACCESS",
    title: "Resend confirmation",
    lead: "If an account is waiting to be confirmed for this address, we will send a new link.",
    emailLabel: "Email",
    submit: "Resend link",
    backToLogin: "Back to sign in",
    linkFromLogin: "Resend confirmation",
  },
};

export function getResendCopy(locale: Locale): ResendCopy {
  return copy[locale];
}
