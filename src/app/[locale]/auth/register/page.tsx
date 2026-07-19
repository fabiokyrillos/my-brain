import Link from "next/link";
import { notFound } from "next/navigation";
import { signUp } from "@/features/auth/actions";
import { authErrorMessage } from "@/features/auth/flow";
import { isLocale } from "@/lib/preferences";

export default async function RegisterPage({
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
      <p className="eyebrow">MY BRAIN</p>
      <h1>{pt ? "Crie seu espaço" : "Create your space"}</h1>
      <p>{pt ? "Privado, contextual e pronto para acompanhar seu ritmo." : "Private, contextual, and ready for your rhythm."}</p>
      {error && <div className="form-alert">{authErrorMessage(error, locale)}</div>}
      <form action={signUp} className="auth-form">
        <input type="hidden" name="locale" value={locale} />
        <label>
          {pt ? "Nome" : "Name"}
          <input name="displayName" required minLength={2} maxLength={100} autoComplete="name" />
        </label>
        <label>
          E-mail
          <input name="email" type="email" required maxLength={254} autoComplete="email" />
        </label>
        <label>
          {pt ? "Senha" : "Password"}
          <input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" />
        </label>
        <small>
          {pt
            ? "Use 12 ou mais caracteres, com maiúscula, minúscula, número e símbolo."
            : "Use 12 or more characters with uppercase, lowercase, number, and symbol."}
        </small>
        <label>
          {pt ? "Confirme a senha" : "Confirm password"}
          <input name="passwordConfirmation" type="password" required minLength={12} maxLength={128} autoComplete="new-password" />
        </label>
        <button>{pt ? "Criar conta" : "Create account"}</button>
      </form>
      <Link href={`/${locale}/auth/login`}>{pt ? "Já tenho conta" : "I already have an account"}</Link>
    </div>
  );
}
