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
  /** The page's one sentence, in the reading face. */
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
    title: "Reenvie a confirmação.",
    lead: "Se houver uma conta aguardando confirmação para este e-mail, enviaremos um novo link.",
    emailLabel: "E-mail",
    submit: "Reenviar link",
    submitPending: "Reenviando link…",
    backToLogin: "Voltar ao login",
    linkFromLogin: "Reenviar confirmação",
  },
  en: {
    title: "Resend the confirmation.",
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

/**
 * The words of the five signed-out pages (Editorial calmo, ADR-180).
 *
 * Each page is one sentence saying what it is for, its fields, one action and
 * its ways out. The eyebrows and the second explanatory sentence each page
 * carried are gone; `recover.caption` is the one sentence kept, because it says
 * what pressing the button does.
 *
 * The labels are the ones the pages already carried, moved here from inline
 * locale ternaries — `foundation.spec.ts` and the online journeys find the
 * fields by them, so none was reworded.
 */
export type PasswordGap = "length" | "lowercase" | "uppercase" | "digit" | "symbol";

export type PasswordHintCopy = {
  /** The whole rule. What is shown before anything is typed, and without script. */
  readonly rule: string;
  /** Leads the list of what the password still lacks. */
  readonly missingLead: string;
  readonly missing: Readonly<Record<PasswordGap, string>>;
  readonly met: string;
};

export type AuthPagesCopy = {
  /** The accessible name of each page's ways out. */
  readonly linksLabel: string;
  readonly emailLabel: string;
  readonly login: {
    readonly title: string;
    readonly passwordLabel: string;
    readonly forgot: string;
    readonly create: string;
  };
  readonly register: {
    readonly title: string;
    /** `2O-ENTRY-003`: no availability claim while the door is shut. */
    readonly closedTitle: string;
    readonly nameLabel: string;
    readonly passwordLabel: string;
    readonly confirmLabel: string;
    readonly about: string;
  };
  readonly recover: {
    readonly title: string;
    readonly caption: string;
    readonly back: string;
  };
  readonly reset: {
    readonly title: string;
    readonly passwordLabel: string;
    readonly confirmLabel: string;
    readonly requestAnother: string;
  };
  readonly passwordHint: PasswordHintCopy;
};

const pagesCopy: Readonly<Record<Locale, AuthPagesCopy>> = {
  "pt-BR": {
    linksLabel: "Outros caminhos",
    emailLabel: "E-mail",
    login: {
      title: "Entre no seu Brain.",
      passwordLabel: "Senha",
      forgot: "Esqueci minha senha",
      create: "Criar conta",
    },
    register: {
      title: "Crie seu espaço.",
      closedTitle: "Cadastro fechado.",
      nameLabel: "Nome",
      passwordLabel: "Senha",
      confirmLabel: "Confirme a senha",
      about: "O que é o My Brain",
    },
    recover: {
      title: "Recupere sua senha.",
      caption: "Enviaremos um link seguro para seu e-mail.",
      back: "Voltar ao login",
    },
    reset: {
      title: "Defina uma nova senha.",
      passwordLabel: "Nova senha",
      confirmLabel: "Confirme a nova senha",
      requestAnother: "Solicitar outro link",
    },
    passwordHint: {
      rule: "Use 12 ou mais caracteres, com maiúscula, minúscula, número e símbolo.",
      missingLead: "Ainda falta:",
      missing: {
        length: "12 caracteres",
        lowercase: "uma minúscula",
        uppercase: "uma maiúscula",
        digit: "um número",
        symbol: "um símbolo",
      },
      met: "A senha atende às regras.",
    },
  },
  en: {
    linksLabel: "Other paths",
    // "E-mail" in both locales, as these three pages always had it: the
    // unauthenticated journeys find the field by this label.
    emailLabel: "E-mail",
    login: {
      title: "Sign in to your Brain.",
      passwordLabel: "Password",
      forgot: "Forgot password",
      create: "Create account",
    },
    register: {
      title: "Create your space.",
      closedTitle: "Registration closed.",
      nameLabel: "Name",
      passwordLabel: "Password",
      confirmLabel: "Confirm password",
      about: "What My Brain is",
    },
    recover: {
      title: "Recover your password.",
      caption: "We will send a secure link to your email.",
      back: "Back to sign in",
    },
    reset: {
      title: "Set a new password.",
      passwordLabel: "New password",
      confirmLabel: "Confirm new password",
      requestAnother: "Request another link",
    },
    passwordHint: {
      rule: "Use 12 or more characters with uppercase, lowercase, number, and symbol.",
      missingLead: "Still missing:",
      missing: {
        length: "12 characters",
        lowercase: "a lowercase letter",
        uppercase: "an uppercase letter",
        digit: "a number",
        symbol: "a symbol",
      },
      met: "The password meets the rules.",
    },
  },
};

export function getAuthPagesCopy(locale: Locale): AuthPagesCopy {
  return pagesCopy[locale];
}
