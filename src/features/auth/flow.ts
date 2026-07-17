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
  "recovery-failed": {
    "pt-BR": "Não foi possível enviar o link. Tente novamente.",
    en: "We could not send the link. Try again.",
  },
  "callback-failed": {
    "pt-BR": "O link não é mais válido. Solicite um novo.",
    en: "This link is no longer valid. Request a new one.",
  },
  "password-update-failed": {
    "pt-BR": "Não foi possível atualizar a senha. Tente novamente.",
    en: "We could not update the password. Try again.",
  },
} as const;

export type AuthErrorCode = keyof typeof messages;

export function authErrorMessage(code: string, locale: Locale) {
  return messages[code as AuthErrorCode]?.[locale]
    ?? (locale === "pt-BR"
      ? "Não foi possível continuar. Tente novamente."
      : "We could not continue. Try again.");
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
