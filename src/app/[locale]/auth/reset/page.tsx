import Link from "next/link";
import { notFound } from "next/navigation";
import { updatePassword } from "@/features/auth/actions";
import { authErrorMessage } from "@/features/auth/flow";
import { isLocale } from "@/lib/preferences";

export default async function ResetPasswordPage({
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
      <p className="eyebrow">{pt ? "ACESSO SEGURO" : "SECURE ACCESS"}</p>
      <h1>{pt ? "Defina uma nova senha" : "Set a new password"}</h1>
      <p>{pt ? "A nova senha encerrará esta sessão de recuperação." : "The new password will close this recovery session."}</p>
      {error && <div className="form-alert">{authErrorMessage(error, locale)}</div>}
      <form action={updatePassword} className="auth-form">
        <input type="hidden" name="locale" value={locale} />
        <label>
          {pt ? "Nova senha" : "New password"}
          <input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" />
        </label>
        <small>
          {pt
            ? "Use 12 ou mais caracteres, com maiúscula, minúscula, número e símbolo."
            : "Use 12 or more characters with uppercase, lowercase, number, and symbol."}
        </small>
        <label>
          {pt ? "Confirme a nova senha" : "Confirm new password"}
          <input name="passwordConfirmation" type="password" required minLength={12} maxLength={128} autoComplete="new-password" />
        </label>
        <button>{pt ? "Atualizar senha" : "Update password"}</button>
      </form>
      <Link href={`/${locale}/auth/recover`}>{pt ? "Solicitar outro link" : "Request another link"}</Link>
    </div>
  );
}
