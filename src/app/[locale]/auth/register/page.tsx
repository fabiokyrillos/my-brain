import Link from "next/link";
import { notFound } from "next/navigation";
import { signUp } from "@/features/auth/actions";
import { authErrorMessage } from "@/features/auth/flow";
import { isSignupOpenIn } from "@/features/auth/signup-policy";
import { getEntryCopy } from "@/features/entry/copy";
import { getLegalCopy } from "@/features/legal/copy";
import { getLegalDocument } from "@/features/legal/documents";
import { legalDocumentPath } from "@/features/legal/versions";
import { TurnstileWidget } from "@/features/auth/turnstile";
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
  const consent = getLegalCopy(locale).consentControl;
  /*
   * `2O-ENTRY-005` and `2O-ENTRY-006`.
   *
   * The **same predicate `signUp` enforces** (`auth/actions.ts`), read here so
   * the page and the action cannot disagree. Until this slice the page asked for
   * a name, an e-mail, a password and a consent, and only then did the action
   * refuse — so the product collected four fields it had already decided not to
   * use, and said so nowhere.
   *
   * It reads `process.env` and nothing from the request, so the statement is
   * **standing rather than conditional on input**: it is identical for every
   * visitor and every submission, which is what keeps the closed door from
   * becoming a probe surface. `SH-SIGNUP-001`'s uniform-outcome property is
   * re-asserted, not replaced — the action still refuses first and identically.
   */
  const signupOpen = isSignupOpenIn(process.env);
  const entry = getEntryCopy(locale);

  return (
    <div className="auth-card">
      <p className="eyebrow">MY BRAIN</p>
      {/*
        `2O-ENTRY-003`: no availability claim while the door is shut. "Crie seu
        espaço" over a form that cannot succeed is an invitation the product
        cannot honour.
      */}
      <h1>{signupOpen
        ? (pt ? "Crie seu espaço" : "Create your space")
        : (pt ? "Cadastro fechado" : "Registration closed")}</h1>
      {signupOpen
        ? <p>{pt ? "Privado, contextual e pronto para acompanhar seu ritmo." : "Private, contextual, and ready for your rhythm."}</p>
        : <p className="form-alert" role="status">{entry.closedNotice}</p>}
      {error && <div className="form-alert">{authErrorMessage(error, locale)}</div>}
      {/*
        `2O-ENTRY-005` says the page states the closed door **before** asking for
        a name, an e-mail, a password or a consent — and "before asking"
        presupposes the asking. The form therefore stays, below the statement.

        An earlier cut of this slice removed it while the door was shut, on the
        reasoning that collecting a password only to discard it is worse than not
        asking. That is a defensible product opinion and it is **not what was
        signed**: `OD-2O-1` **A**'s "no signup call to action while signup is
        closed" is about the public entry page, which carries no form and no link
        here. Removing this one would also have deleted the surface
        `SH-LEGAL-007`'s consent assertions are made against — the existing
        foundation journey failed on exactly that, which is how the over-reach was
        caught.

        What the visitor now gets is the honest version of the same protection:
        the heading and the notice say the door is shut before any field appears,
        and `signUp` still refuses first and identically whatever is submitted.
      */}
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
        {/*
          SH-LEGAL-007. Unchecked by default and required: an unticked checkbox
          submits nothing, so the server-side schema fails with its own code
          whether the box was left alone or the input was removed in the
          browser. The copy comes from `legal/copy.ts` rather than from another
          inline ternary — the locale-ternary ceiling does not rise (SH-COPY-001).
        */}
        <label>
          <input name="acceptedPolicies" required type="checkbox" value="on" />
          <span>
            {consent.leadIn}{" "}
            <Link href={legalDocumentPath(locale, "terms")}>
              {getLegalDocument(locale, "terms").title}
            </Link>{" "}
            {consent.conjunction}{" "}
            <Link href={legalDocumentPath(locale, "privacy")}>
              {getLegalDocument(locale, "privacy").title}
            </Link>
            {consent.trailer}
          </span>
        </label>
        <TurnstileWidget />
        <button>{pt ? "Criar conta" : "Create account"}</button>
      </form>
      {/*
        `2O-ENTRY-008`. Two ways out, whatever the door is doing: on to sign-in
        for someone who already has an account, and back to the page that says
        what the product is. Neither is a registration.
      */}
      <Link href={`/${locale}/auth/login`}>{entry.signIn}</Link>
      <Link href={`/${locale}`}>{pt ? "O que é o My Brain" : "What My Brain is"}</Link>
    </div>
  );
}
