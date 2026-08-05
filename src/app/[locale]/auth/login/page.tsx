import Link from "next/link";
import { notFound } from "next/navigation";
import { signIn } from "@/features/auth/actions";
import { authErrorMessage } from "@/features/auth/flow";
import { accountCopy } from "@/features/shell/account-copy";
import { getResendCopy } from "@/features/auth/copy";
import { TurnstileWidget } from "@/features/auth/turnstile";
import { isLocale } from "@/lib/preferences";

const successMessages = {
  "check-email": {
    "pt-BR": "Confira seu e-mail para confirmar a conta.",
    en: "Check your email to confirm the account.",
  },
  "recovery-sent": {
    "pt-BR": "Se a conta existir, o link de recuperação chegará em instantes.",
    en: "If the account exists, the recovery link will arrive shortly.",
  },
  "password-updated": {
    "pt-BR": "Senha atualizada. Entre novamente.",
    en: "Password updated. Sign in again.",
  },
  // Reused from the account surface's own copy module rather than restated, so
  // the sentence a user reads after signing out is the one that module owns.
  "signed-out": {
    "pt-BR": accountCopy["pt-BR"].signedOut,
    en: accountCopy.en.signedOut,
  },
} as const;

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const query = await searchParams;
  const pt = locale === "pt-BR";
  const message = successMessages[query.message as keyof typeof successMessages]?.[locale];

  return (
    <div className="auth-card">
      <Link href="/" className="brand"><span className="brand-mark">B</span><span>My Brain</span></Link>
      <p className="eyebrow">{pt ? "SEU CONTEXTO, DE VOLTA" : "YOUR CONTEXT, RESTORED"}</p>
      <h1>{pt ? "Entre no seu Brain" : "Sign in to your Brain"}</h1>
      <p>{pt ? "Continue exatamente de onde parou." : "Continue exactly where you left off."}</p>
      {query.error && <div className="form-alert">{authErrorMessage(query.error, locale)}</div>}
      {message && <div className="form-success">{message}</div>}
      <form action={signIn} className="auth-form">
        <input type="hidden" name="locale" value={locale} />
        <label>
          E-mail
          <input name="email" type="email" autoComplete="email" required maxLength={254} />
        </label>
        <label>
          {pt ? "Senha" : "Password"}
          <input name="password" type="password" autoComplete="current-password" required maxLength={128} />
        </label>
        {/*
          SH-CAPTCHA-003 names register, recover and resend. Sign-in is here
          anyway, and deliberately: Supabase's CAPTCHA protection is a
          per-project switch that GoTrue applies to the password grant as well
          as to signup and recovery. Enabling it with no widget on this form
          would lock **every existing account out of the product**, the owner's
          included, the moment the setting is flipped. Reading the requirement
          as a floor rather than a ceiling is the only reading that survives the
          rollout it was written for.
        */}
        <TurnstileWidget />
        <button>{pt ? "Entrar" : "Sign in"}</button>
      </form>
      <div className="auth-links">
        <Link href={`/${locale}/auth/recover`}>{pt ? "Esqueci minha senha" : "Forgot password"}</Link>
        <Link href={`/${locale}/auth/register`}>{pt ? "Criar conta" : "Create account"}</Link>
        <Link href={`/${locale}/auth/resend`}>{getResendCopy(locale).linkFromLogin}</Link>
      </div>
    </div>
  );
}
