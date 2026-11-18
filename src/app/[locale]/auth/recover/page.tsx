import Link from "next/link";
import { notFound } from "next/navigation";
import { recoverPassword } from "@/features/auth/actions";
import { getAuthPagesCopy, getAuthSubmitCopy } from "@/features/auth/copy";
import { authErrorMessage } from "@/features/auth/flow";
import { AuthSubmitButton } from "@/features/auth/submit-button";
import { TurnstileWidget } from "@/features/auth/turnstile";
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
  const pages = getAuthPagesCopy(locale);
  const copy = pages.recover;
  const submit = getAuthSubmitCopy("recover", locale);

  return (
    <div className="auth-column">
      <h1>{copy.title}</h1>
      <p className="auth-caption">{copy.caption}</p>
      {error && <p className="form-alert" role="alert">{authErrorMessage(error, locale)}</p>}
      <form action={recoverPassword} className="auth-form">
        <input type="hidden" name="locale" value={locale} />
        <label>
          {pages.emailLabel}
          <input name="email" type="email" required maxLength={254} autoComplete="email" />
        </label>
        <TurnstileWidget />
        <AuthSubmitButton label={submit.submit} pendingLabel={submit.submitPending} />
      </form>
      <nav aria-label={pages.linksLabel} className="auth-links">
        <Link href={`/${locale}/auth/login`}>{copy.back}</Link>
      </nav>
    </div>
  );
}
