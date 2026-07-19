import Link from "next/link";
import { notFound } from "next/navigation";
import { signIn } from "@/features/auth/actions";
import { authErrorMessage } from "@/features/auth/flow";
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
        <button>{pt ? "Entrar" : "Sign in"}</button>
      </form>
      <div className="auth-links">
        <Link href={`/${locale}/auth/recover`}>{pt ? "Esqueci minha senha" : "Forgot password"}</Link>
        <Link href={`/${locale}/auth/register`}>{pt ? "Criar conta" : "Create account"}</Link>
      </div>
    </div>
  );
}
