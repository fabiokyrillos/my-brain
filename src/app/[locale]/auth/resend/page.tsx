import Link from "next/link";
import { notFound } from "next/navigation";
import { resendConfirmation } from "@/features/auth/actions";
import { getResendCopy } from "@/features/auth/copy";
import { authErrorMessage } from "@/features/auth/flow";
import { TurnstileWidget } from "@/features/auth/turnstile";
import { isLocale } from "@/lib/preferences";

/**
 * SH-SIGNUP-008 — the confirmation-resend surface.
 *
 * It exists because re-registering was the only way to get a second
 * confirmation email, and that fails in two directions at once: it makes a
 * resend run the entire signup path — consent, password policy, the gate — and
 * once the signup gate closed it stopped being available at all, so an account
 * created before the gate closed had no route to confirmation.
 *
 * Deliberately reachable **while signup is closed**: confirming an account that
 * already exists is not creating one.
 *
 * All copy comes from `auth/copy.ts`. See that module for why the lead sentence
 * promises nothing about whether the address exists.
 */
export default async function ResendPage({
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
  const copy = getResendCopy(locale);

  return (
    <div className="auth-card">
      <p className="eyebrow">{copy.eyebrow}</p>
      <h1>{copy.title}</h1>
      <p>{copy.lead}</p>
      {error && <div className="form-alert">{authErrorMessage(error, locale)}</div>}
      <form action={resendConfirmation} className="auth-form">
        <input type="hidden" name="locale" value={locale} />
        <label>
          {copy.emailLabel}
          <input name="email" type="email" required maxLength={254} autoComplete="email" />
        </label>
        <TurnstileWidget />
        <button>{copy.submit}</button>
      </form>
      <Link href={`/${locale}/auth/login`}>{copy.backToLogin}</Link>
    </div>
  );
}
