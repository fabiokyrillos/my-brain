import Link from "next/link";
import { notFound } from "next/navigation";
import { updatePassword } from "@/features/auth/actions";
import { getAuthPagesCopy, getAuthSubmitCopy } from "@/features/auth/copy";
import { authErrorMessage } from "@/features/auth/flow";
import { PasswordHint } from "@/features/auth/password-hint";
import { AuthSubmitButton } from "@/features/auth/submit-button";
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
  const pages = getAuthPagesCopy(locale);
  const copy = pages.reset;
  const submit = getAuthSubmitCopy("reset", locale);

  return (
    <div className="auth-column">
      <h1>{copy.title}</h1>
      {error && <p className="form-alert" role="alert">{authErrorMessage(error, locale)}</p>}
      <form action={updatePassword} className="auth-form">
        <input type="hidden" name="locale" value={locale} />
        <label>
          {copy.passwordLabel}
          <input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" aria-describedby="reset-password-hint" />
        </label>
        <PasswordHint copy={pages.passwordHint} id="reset-password-hint" locale={locale} />
        <label>
          {copy.confirmLabel}
          <input name="passwordConfirmation" type="password" required minLength={12} maxLength={128} autoComplete="new-password" />
        </label>
        <AuthSubmitButton label={submit.submit} pendingLabel={submit.submitPending} />
      </form>
      <nav aria-label={pages.linksLabel} className="auth-links">
        <Link href={`/${locale}/auth/recover`}>{copy.requestAnother}</Link>
      </nav>
    </div>
  );
}
