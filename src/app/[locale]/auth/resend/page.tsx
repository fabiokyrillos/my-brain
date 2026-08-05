import Link from "next/link";
import { notFound } from "next/navigation";
import { resendConfirmation } from "@/features/auth/actions";
import { authErrorMessage } from "@/features/auth/flow";
import { TurnstileWidget } from "@/features/auth/turnstile";
import { isLocale } from "@/lib/preferences";

/**
 * SH-SIGNUP-008 — the confirmation-resend surface.
 *
 * It exists because re-registering was the only way to get a second
 * confirmation email, and that fails in two directions at once: it makes a
 * resend run the entire signup path, and once the signup gate closed it stopped
 * being available at all — so an account created before the gate closed had no
 * route to confirmation.
 *
 * ## The copy promises nothing about the address
 *
 * "If there is an account waiting to be confirmed, we will send a new link"
 * rather than "we sent a link". SH-SIGNUP-011 makes the *outcome* uniform for an
 * address that exists and one that does not; copy that said "sent" would put
 * the distinction back in the sentence the reader gets, which is where an
 * attacker would read it.
 *
 * Deliberately reachable while signup is closed: confirming an account that
 * already exists is not creating one.
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
  const pt = locale === "pt-BR";

  return (
    <div className="auth-card">
      <p className="eyebrow">{pt ? "ACESSO" : "ACCESS"}</p>
      <h1>{pt ? "Reenviar confirmação" : "Resend confirmation"}</h1>
      <p>
        {pt
          ? "Se houver uma conta aguardando confirmação para este e-mail, enviaremos um novo link."
          : "If an account is waiting to be confirmed for this address, we will send a new link."}
      </p>
      {error && <div className="form-alert">{authErrorMessage(error, locale)}</div>}
      <form action={resendConfirmation} className="auth-form">
        <input type="hidden" name="locale" value={locale} />
        <label>
          E-mail
          <input name="email" type="email" required maxLength={254} autoComplete="email" />
        </label>
        <TurnstileWidget />
        <button>{pt ? "Reenviar link" : "Resend link"}</button>
      </form>
      <Link href={`/${locale}/auth/login`}>{pt ? "Voltar ao login" : "Back to sign in"}</Link>
    </div>
  );
}
