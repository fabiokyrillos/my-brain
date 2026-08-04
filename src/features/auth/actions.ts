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
import { getAccountCopy } from "@/features/shell/account-copy";
import type { Locale } from "@/lib/preferences";
import { createClient } from "@/lib/supabase/server";
import { idleSignOutState, type SignOutState } from "./sign-out-state";
import { configuredOriginFrom, isSignupOpenIn } from "./signup-policy";

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
 */
function authOrigin() {
  return configuredOriginFrom(process.env);
}

export async function signIn(formData: FormData) {
  const locale = safeLocale(formData.get("locale"));
  const parsed = signInSchema.safeParse(formValues(formData));
  if (!parsed.success) redirect(`/${locale}/auth/login?error=invalid-form`);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) redirect(`/${locale}/auth/login?error=invalid-credentials`);

  redirect(`/${locale}/app`);
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
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: buildAuthCallbackUrl(origin, locale, `/${locale}/app`),
    },
  });

  if (error) {
    const code = authProviderErrorCode(error, "signup-failed");
    redirect(`/${locale}/auth/register?error=${code}`);
  }
  redirect(`/${locale}/auth/login?message=check-email`);
}

export async function recoverPassword(formData: FormData) {
  const locale = safeLocale(formData.get("locale"));
  const parsed = recoverySchema.safeParse(formValues(formData));
  if (!parsed.success) redirect(`/${locale}/auth/recover?error=invalid-form`);

  const origin = authOrigin();
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: buildAuthCallbackUrl(origin, locale, `/${locale}/auth/reset`),
  });

  if (error) {
    const code = authProviderErrorCode(error, "recovery-failed");
    redirect(`/${locale}/auth/recover?error=${code}`);
  }
  redirect(`/${locale}/auth/login?message=recovery-sent`);
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
