import type { Locale } from "@/lib/preferences";

const messages = {
  "invalid-form": {
    "pt-BR": "Revise os campos e tente novamente.",
    en: "Review the fields and try again.",
  },
  "invalid-credentials": {
    "pt-BR": "E-mail ou senha inválidos.",
    en: "Invalid email or password.",
  },
  "signup-failed": {
    "pt-BR": "Não foi possível criar a conta. Tente novamente.",
    en: "We could not create the account. Try again.",
  },
  "email-rate-limited": {
    "pt-BR": "Muitas solicitações de e-mail. Aguarde alguns minutos e tente novamente.",
    en: "Too many email requests. Wait a few minutes and try again.",
  },
  "recovery-failed": {
    "pt-BR": "Não foi possível enviar o link. Tente novamente.",
    en: "We could not send the link. Try again.",
  },
  "callback-failed": {
    "pt-BR": "O link não é mais válido. Solicite um novo.",
    en: "This link is no longer valid. Request a new one.",
  },
  // SH-LEGAL-007. Its own code rather than `invalid-form`: "you missed a
  // required field" and "you have not agreed to the terms" are different facts,
  // and the second one is the whole point of the control.
  "consent-required": {
    "pt-BR": "É preciso aceitar os Termos de Uso e a Política de Privacidade para criar a conta.",
    en: "You must accept the Terms of Service and the Privacy Policy to create an account.",
  },
  "password-update-failed": {
    "pt-BR": "Não foi possível atualizar a senha. Tente novamente.",
    en: "We could not update the password. Try again.",
  },
  // SH-SIGNUP-002. Honest, and deliberately not an apology for a fault: signup
  // being closed is the product's current state, not an outage and not
  // something the reader did wrong. It says so plainly and does not promise a
  // date nobody has committed to.
  "signup-disabled": {
    "pt-BR": "As inscrições estão fechadas no momento. Este produto ainda não está aberto ao público.",
    en: "Sign-ups are closed right now. This product is not open to the public yet.",
  },
  // SH-ORIGIN-001. The deployment is missing `APP_ORIGIN`, so no auth email can
  // be addressed safely.
  //
  // This exists because refusing to guess an origin is right and crashing is
  // not: the first cut let the resolver throw, and a production deploy without
  // the variable turned password recovery into a bare 500. The security
  // property is unchanged — nothing is guessed, no mail is attempted — but the
  // reader now gets a sentence instead of an error page, and the operator gets
  // a declared code instead of a stack trace.
  //
  // It says "configuration" rather than naming the variable: the person reading
  // it cannot fix it, and naming internals to someone who cannot act on them is
  // just a smaller stack trace.
  "auth-misconfigured": {
    "pt-BR": "Este ambiente ainda não está configurado para enviar e-mails de autenticação. Avise o responsável pelo produto.",
    en: "This environment is not configured to send authentication emails yet. Let the product owner know.",
  },
} as const;

export type AuthErrorCode = keyof typeof messages;

type ProviderAuthError = {
  code?: string;
  message?: string;
};

export function authErrorMessage(code: string, locale: Locale) {
  return messages[code as AuthErrorCode]?.[locale]
    ?? (locale === "pt-BR"
      ? "Não foi possível continuar. Tente novamente."
      : "We could not continue. Try again.");
}

export function authProviderErrorCode(
  error: ProviderAuthError,
  fallback: AuthErrorCode,
): AuthErrorCode {
  return error.code === "over_email_send_rate_limit"
    ? "email-rate-limited"
    : fallback;
}

export function safeAuthNext(value: string | null, locale: Locale) {
  const fallback = `/${locale}/app`;
  if (!value || value.startsWith("//")) return fallback;
  if (value === `/${locale}/auth/reset`) return value;
  if (value === fallback || value.startsWith(`${fallback}/`)) return value;
  return fallback;
}

export function isAuthSessionContinuation(pathname: string, locale: Locale) {
  return pathname === `/${locale}/auth/callback`
    || pathname === `/${locale}/auth/reset`;
}

export function buildAuthCallbackUrl(
  origin: string,
  locale: Locale,
  next: `/${Locale}/app` | `/${Locale}/auth/reset`,
) {
  const url = new URL(`/${locale}/auth/callback`, origin);
  url.searchParams.set("next", safeAuthNext(next, locale));
  return url.toString();
}
