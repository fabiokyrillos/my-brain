"use server";

import { redirect } from "next/navigation";
import {
  authProviderErrorCode,
  buildAuthCallbackUrl,
} from "@/features/auth/flow";
import {
  recoverySchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/features/auth/schema";
import { safeReturnPath } from "@/features/entry/return-path";
import { getAccountCopy } from "@/features/shell/account-copy";
import type { Locale } from "@/lib/preferences";
import { createClient } from "@/lib/supabase/server";
import { isCaptchaError, readCaptchaToken } from "./captcha";
import { idleSignOutState, type SignOutState } from "./sign-out-state";
import { configuredOriginFrom, isSignupOpenIn } from "./signup-policy";
import { admitAuthEvent, finalizeAuthEvent } from "./throttle";

function safeLocale(value: FormDataEntryValue | null): Locale {
  return value === "en" ? "en" : "pt-BR";
}

function formValues(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

/**
 * SH-ORIGIN-001 — the origin is configured, never asked for.
 *
 * This replaced a read of the request's `Origin` header. That header is
 * supplied by whoever makes the request, and it decided the host inside
 * `emailRedirectTo` and `resetPasswordForEmail`'s `redirectTo` — so an attacker
 * reaching either endpoint chose where a link in a mail the provider sends to a
 * *real user* points. The provider's redirect allowlist would have refused most
 * of that, but an allowlist is the backstop, not the control, and a backstop
 * nobody has read back (SH-GD.1) is a backstop nobody has verified.
 *
 * It returns `null` rather than throwing when the deployment has no configured
 * origin. Refusing to guess is the security property and it is unchanged;
 * crashing was never part of it. The first cut let the resolver throw, and a
 * production deploy without `APP_ORIGIN` turned password recovery into a bare
 * 500 — the caller saw an error page, and the operator saw nothing declared.
 * Now no mail is attempted, nothing is guessed, and both get something they can
 * act on.
 */
function authOrigin(): string | null {
  try {
    return configuredOriginFrom(process.env);
  } catch {
    // The message names an environment variable, so it is not forwarded. The
    // declared error code is what leaves this process.
    console.error("Auth origin is not configured; refusing to send an auth email");
    return null;
  }
}

/**
 * The refusal a throttle produced, as a redirect code.
 *
 * One helper so all four surfaces answer identically: a ceiling and an
 * unreachable throttle are different facts (SH-COPY-004), and neither may vary
 * with whether the identifier exists (SH-SIGNUP-011).
 */
function throttleErrorCode(reason: "throttled" | "unavailable") {
  return reason === "throttled" ? "throttled" : "auth-unavailable";
}

export async function signIn(formData: FormData) {
  const locale = safeLocale(formData.get("locale"));
  const parsed = signInSchema.safeParse(formValues(formData));
  if (!parsed.success) redirect(`/${locale}/auth/login?error=invalid-form`);

  const supabase = await createClient();

  // SH-THROTTLE-003 — admission BEFORE the provider call, so a brute-force run
  // is refused by this application rather than by GoTrue. Ours is the refusal
  // with uniform copy; the provider's differs between an address that exists
  // and one that does not, which is the distinction we are erasing.
  //
  // **The ceiling counts attempts, not only failures, and that is stricter than
  // the `signin_failure` kind name suggests.** `claim_auth_event_slot` reserves
  // by inserting — that atomicity is what makes it correct under concurrency —
  // so there is no way to consult a ceiling without recording against it, and
  // no way to withdraw the row after a success (no client role holds DELETE, by
  // design). The `outcome` column still tells the two apart for anyone reading
  // the ledger; what it does not do is exempt successes from the count. The
  // failure direction is toward more throttling, never less, and the ceiling is
  // set where a human never reaches it.
  const admission = await admitAuthEvent(supabase, "signin_failure", parsed.data.email);
  if (!admission.admitted) {
    redirect(`/${locale}/auth/login?error=${throttleErrorCode(admission.reason)}`);
  }

  const captchaToken = readCaptchaToken(formData.get("captchaToken"));
  const { error } = await supabase.auth.signInWithPassword({
    ...parsed.data,
    options: { captchaToken },
  });

  if (error) {
    await finalizeAuthEvent(supabase, admission.attemptId, "refused");
    // A failed challenge is not a wrong password. Conflating them sends someone
    // to reset a credential that was never the problem.
    const code = isCaptchaError(error) ? "captcha-failed" : "invalid-credentials";
    redirect(`/${locale}/auth/login?error=${code}`);
  }

  await finalizeAuthEvent(supabase, admission.attemptId, "succeeded");
  /*
   * `2O-ENTRY-007`. Back to the surface that was asked for, or the app's home.
   *
   * **This is the trust boundary, and the check here is the one that counts.**
   * The login page validates `next` too, but that only decides what gets
   * rendered; this value arrives in a `FormData` field, and a form field is
   * whatever the client chose to send. `safeReturnPath` is an allowlist — one
   * leading slash, this locale's own `/app`, no scheme, no control characters —
   * and everything it does not recognise becomes `null` here rather than a
   * redirect somebody else chose.
   *
   * The failure mode of getting this wrong is an open redirect that fires
   * **immediately after a successful sign-in**, which is the worst moment for
   * one: the session cookie is fresh and the visitor has just proved they trust
   * the page they are on.
   */
  redirect(safeReturnPath(formData.get("next")?.toString(), locale) ?? `/${locale}/app`);
}

/**
 * Ends the session and leaves the authenticated shell (UX-26).
 *
 * **The session is invalidated, not merely navigated away from.**
 * `supabase.auth.signOut()` revokes the refresh token at the provider and the SSR
 * client clears the auth cookies on the response, so the next request to
 * `/[locale]/app/…` reaches `proxy.ts` with no `sub` claim and is redirected to
 * login. A client-side `router.push` would have left a live session behind a
 * changed URL, which is the failure this action exists to avoid.
 *
 * **An already-expired session must still let the user leave.** Supabase reports
 * that case as `AuthSessionMissingError`, and treating it as a failure would trap
 * a user inside a shell they cannot use in a loop they cannot exit: there is no
 * session left to end, so the desired end state is *already true* and the only
 * honest thing to do is clear what remains and redirect. Every other provider
 * error is a genuine failure and is rendered, because a sign-out that silently
 * did nothing while claiming success is worse than one that says it failed.
 *
 * `redirect()` is called **outside** the `try`: it signals by throwing, and
 * catching it here would turn every successful sign-out into a rendered failure.
 */
export async function signOut(
  _previous: SignOutState,
  formData: FormData,
): Promise<SignOutState> {
  const locale = safeLocale(formData.get("locale"));

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();
    // `AuthSessionMissingError` carries this name across the provider's error
    // shapes; matching the name rather than the message keeps this off the
    // provider's prose.
    const sessionAlreadyGone = error !== null && error.name === "AuthSessionMissingError";
    if (error !== null && !sessionAlreadyGone) {
      return { ...idleSignOutState, status: "failed", message: getAccountCopy(locale).signOutFailed };
    }
  } catch {
    // A transport fault reaching here left the cookies untouched, so the session
    // may still be live — reporting success would be a claim this process cannot
    // support.
    return { ...idleSignOutState, status: "failed", message: getAccountCopy(locale).signOutFailed };
  }

  redirect(`/${locale}/auth/login?message=signed-out`);
}

export async function signUp(formData: FormData) {
  const locale = safeLocale(formData.get("locale"));

  // SH-SIGNUP-001 — the application gate, checked FIRST and defaulting closed.
  //
  // Before any parsing, before the provider is touched, and before the consent
  // refusal below can distinguish anything: when signup is closed there is
  // nothing to tell the caller about their input, because their input was never
  // going to be used. Checking this first is also what keeps a closed signup
  // from being a probe surface — a malformed body and a well-formed one get the
  // same answer.
  if (!isSignupOpenIn(process.env)) {
    redirect(`/${locale}/auth/register?error=signup-disabled`);
  }

  const parsed = signUpSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    // SH-LEGAL-007: the consent refusal is server-side and is told apart from a
    // malformed field, because "you have not agreed to the terms" is a
    // different thing to say than "check your input".
    const missingConsent = parsed.error.issues.some(
      (issue) => issue.path[0] === "acceptedPolicies",
    );
    redirect(
      `/${locale}/auth/register?error=${missingConsent ? "consent-required" : "invalid-form"}`,
    );
  }

  const origin = authOrigin();
  if (origin === null) redirect(`/${locale}/auth/register?error=auth-misconfigured`);

  const supabase = await createClient();

  // SH-THROTTLE-003, and note the order relative to the gate above: the closed
  // signup gate still refuses FIRST (SH-SIGNUP-001). Consulting a ceiling for a
  // request that was never going to reach a provider would spend a real slot on
  // a refusal the caller could trigger for free, turning a closed door into a
  // way to exhaust someone else's allowance.
  const admission = await admitAuthEvent(supabase, "signup", parsed.data.email);
  if (!admission.admitted) {
    redirect(`/${locale}/auth/register?error=${throttleErrorCode(admission.reason)}`);
  }

  const captchaToken = readCaptchaToken(formData.get("captchaToken"));
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: buildAuthCallbackUrl(origin, locale, `/${locale}/app`),
      captchaToken,
    },
  });

  if (error) {
    await finalizeAuthEvent(supabase, admission.attemptId, "provider_error");
    if (isCaptchaError(error)) redirect(`/${locale}/auth/register?error=captcha-failed`);
    const code = authProviderErrorCode(error, "signup-failed");
    redirect(`/${locale}/auth/register?error=${code}`);
  }

  await finalizeAuthEvent(supabase, admission.attemptId, "succeeded");
  // SH-SIGNUP-011: identical for an address that already exists and one that
  // does not. GoTrue is uniform here by design — an existing confirmed address
  // returns a user with no identities rather than an error — and this branch
  // must not undo that by inspecting the response and saying something else.
  redirect(`/${locale}/auth/login?message=check-email`);
}

export async function recoverPassword(formData: FormData) {
  const locale = safeLocale(formData.get("locale"));
  const parsed = recoverySchema.safeParse(formValues(formData));
  if (!parsed.success) redirect(`/${locale}/auth/recover?error=invalid-form`);

  const origin = authOrigin();
  if (origin === null) redirect(`/${locale}/auth/recover?error=auth-misconfigured`);

  const supabase = await createClient();

  const admission = await admitAuthEvent(supabase, "recovery", parsed.data.email);
  if (!admission.admitted) {
    redirect(`/${locale}/auth/recover?error=${throttleErrorCode(admission.reason)}`);
  }

  const captchaToken = readCaptchaToken(formData.get("captchaToken"));
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: buildAuthCallbackUrl(origin, locale, `/${locale}/auth/reset`),
    captchaToken,
  });

  if (error) {
    await finalizeAuthEvent(supabase, admission.attemptId, "provider_error");
    if (isCaptchaError(error)) redirect(`/${locale}/auth/recover?error=captcha-failed`);
    const code = authProviderErrorCode(error, "recovery-failed");
    redirect(`/${locale}/auth/recover?error=${code}`);
  }

  await finalizeAuthEvent(supabase, admission.attemptId, "succeeded");
  redirect(`/${locale}/auth/login?message=recovery-sent`);
}

/**
 * SH-SIGNUP-008 — a fresh confirmation email, from its own surface.
 *
 * Re-registering was the only way to get one, and that is wrong twice: it runs
 * the whole signup path (consent, password policy, the gate) to achieve a
 * resend, and when signup is closed it is not available at all — so an account
 * created before the gate closed could never confirm.
 *
 * It carries **its own ceiling**, tighter than the others, because this is the
 * one surface whose entire purpose is to cause a message to be delivered to
 * somebody else's inbox (T-15). That ceiling is currently marked provisional:
 * the binding provider limit is a default-SMTP artefact, not a product decision.
 *
 * Uniform by construction: GoTrue's `resend` answers the same way for an
 * address that has nothing to confirm as for one that does, and this action adds
 * nothing that could tell them apart — the throttle is consulted before the
 * provider, its refusal is the shared code, and the success message is fixed.
 */
export async function resendConfirmation(formData: FormData) {
  const locale = safeLocale(formData.get("locale"));
  const parsed = recoverySchema.safeParse(formValues(formData));
  if (!parsed.success) redirect(`/${locale}/auth/resend?error=invalid-form`);

  const origin = authOrigin();
  if (origin === null) redirect(`/${locale}/auth/resend?error=auth-misconfigured`);

  const supabase = await createClient();

  const admission = await admitAuthEvent(supabase, "resend", parsed.data.email);
  if (!admission.admitted) {
    redirect(`/${locale}/auth/resend?error=${throttleErrorCode(admission.reason)}`);
  }

  const captchaToken = readCaptchaToken(formData.get("captchaToken"));
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: {
      emailRedirectTo: buildAuthCallbackUrl(origin, locale, `/${locale}/app`),
      captchaToken,
    },
  });

  if (error) {
    await finalizeAuthEvent(supabase, admission.attemptId, "provider_error");
    if (isCaptchaError(error)) redirect(`/${locale}/auth/resend?error=captcha-failed`);
    // `authProviderErrorCode` maps the provider's own rate limit to its shared
    // code. Everything else becomes one generic failure rather than being
    // forwarded, because a provider message here can distinguish an address
    // that exists from one that does not.
    const code = authProviderErrorCode(error, "recovery-failed");
    redirect(`/${locale}/auth/resend?error=${code}`);
  }

  await finalizeAuthEvent(supabase, admission.attemptId, "succeeded");
  redirect(`/${locale}/auth/login?message=check-email`);
}

export async function updatePassword(formData: FormData) {
  const locale = safeLocale(formData.get("locale"));
  const parsed = resetPasswordSchema.safeParse(formValues(formData));
  if (!parsed.success) redirect(`/${locale}/auth/reset?error=invalid-form`);

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect(`/${locale}/auth/login?error=callback-failed`);

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) redirect(`/${locale}/auth/reset?error=password-update-failed`);

  const { error: signOutError } = await supabase.auth.signOut();
  if (signOutError) redirect(`/${locale}/auth/reset?error=password-update-failed`);
  redirect(`/${locale}/auth/login?message=password-updated`);
}
