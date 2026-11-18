import Link from "next/link";
import { notFound } from "next/navigation";
import { signIn } from "@/features/auth/actions";
import { authErrorMessage } from "@/features/auth/flow";
import { accountCopy } from "@/features/shell/account-copy";
import { getAuthPagesCopy, getAuthSubmitCopy, getResendCopy } from "@/features/auth/copy";
import { AuthSubmitButton } from "@/features/auth/submit-button";
import { TurnstileWidget } from "@/features/auth/turnstile";
import { safeReturnPath } from "@/features/entry/return-path";
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
  searchParams: Promise<{ error?: string; message?: string; next?: string }>;
}) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const query = await searchParams;
  const returnPath = safeReturnPath(query.next, locale);
  const pages = getAuthPagesCopy(locale);
  const copy = pages.login;
  const signInCopy = getAuthSubmitCopy("signIn", locale);
  const message = successMessages[query.message as keyof typeof successMessages]?.[locale];

  return (
    <div className="auth-column">
      {/*
        Editorial calmo (ADR-180). The page is its one sentence, the two fields
        and the one action. The mark is the layout's; the eyebrow and "Continue
        exatamente de onde parou." are cut.

        What happened last — a refused sign-in, a link on its way — is a
        sentence between the question and the fields, in the tone that says
        which it is. `alert` and `status` rather than a bare `div`: both were
        unannounced before.
      */}
      <h1>{copy.title}</h1>
      {query.error && <p className="form-alert" role="alert">{authErrorMessage(query.error, locale)}</p>}
      {message && <p className="form-success" role="status">{message}</p>}
      <form action={signIn} className="auth-form">
        <input type="hidden" name="locale" value={locale} />
        {/*
          `2O-ENTRY-007`. The surface that was asked for, carried through the
          form so that signing in returns there.

          Validated **here as well as** in `signIn`, and neither check makes the
          other redundant: this one keeps an unusable value out of the document
          the browser holds, and the one in the action is the boundary that
          matters, because a hidden input is whatever the client sends. A `next`
          this page refuses simply is not rendered, and sign-in lands on the
          app's home — the ordinary behaviour, and the correct loss.
        */}
        {returnPath && <input type="hidden" name="next" value={returnPath} />}
        <label>
          {pages.emailLabel}
          <input name="email" type="email" autoComplete="email" required maxLength={254} />
        </label>
        <label>
          {copy.passwordLabel}
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
        {/*
          `AUTH-SIGNIN-PENDING-STATE`. A component of its own because
          `useFormStatus` reports only from inside the submitting form — which
          also keeps this page a server component instead of turning the whole
          form, hidden fields and CAPTCHA widget included, into client code.
        */}
        <AuthSubmitButton label={signInCopy.submit} pendingLabel={signInCopy.submitPending} />
      </form>
      <nav aria-label={pages.linksLabel} className="auth-links">
        <Link href={`/${locale}/auth/recover`}>{copy.forgot}</Link>
        <Link href={`/${locale}/auth/register`}>{copy.create}</Link>
        <Link href={`/${locale}/auth/resend`}>{getResendCopy(locale).linkFromLogin}</Link>
      </nav>
    </div>
  );
}
