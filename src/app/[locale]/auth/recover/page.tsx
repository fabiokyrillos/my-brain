import Link from "next/link";
import { notFound } from "next/navigation";
import { recoverPassword } from "@/features/auth/actions";
import { authErrorMessage } from "@/features/auth/flow";
import { isLocale } from "@/lib/preferences";

export default async function RecoverPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const { error } = await searchParams;
  const pt = locale === "pt-BR";

  return (
    <div className="auth-card">
      <p className="eyebrow">{pt ? "ACESSO" : "ACCESS"}</p>
      <h1>{pt ? "Recupere sua senha" : "Recover your password"}</h1>
      <p>{pt ? "Enviaremos um link seguro para seu e-mail." : "We will send a secure link to your email."}</p>
      {error && <div className="form-alert">{authErrorMessage(error, locale)}</div>}
      <form action={recoverPassword} className="auth-form">
        <input type="hidden" name="locale" value={locale} />
        <label>
          E-mail
          <input name="email" type="email" required maxLength={254} autoComplete="email" />
        </label>
        <button>{pt ? "Enviar link" : "Send link"}</button>
      </form>
      <Link href={`/${locale}/auth/login`}>{pt ? "Voltar ao login" : "Back to sign in"}</Link>
    </div>
  );
}
