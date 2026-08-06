"use server";

/**
 * The deletion request Server Action (SH-DELETE-002, SH-DELETE-010).
 *
 * Four checks, all server-side, in this order:
 *
 *   1. an authenticated session (and an `active` lifecycle — the SH.1 gate);
 *   2. the typed confirmation phrase, compared to the locale's own word —
 *      before the provider is asked anything, so a mistyped word costs neither
 *      a password attempt nor the CAPTCHA token;
 *   3. **the challenge token**, forwarded to the provider, never verified here;
 *   4. **recent re-authentication**: the password is re-entered and validated
 *      against the provider, not trusted from the client. A stolen or
 *      left-open session is the threat this exists for, and only the provider
 *      can answer it.
 *
 * Removing any control from the DOM changes nothing: every one of these is
 * decided here, and the transition happens in `request_account_deletion`,
 * which takes no target and derives its owner from `auth.uid()`.
 *
 * ## Why step 3 exists at all, and why it was missing
 *
 * SH.5 enabled hosted CAPTCHA, and hosted GoTrue applies that enforcement to
 * **password grants** — not only to the login form. The four surfaces in
 * `features/auth/actions.ts` each forward a `captchaToken`; this one did not,
 * because it was written in SH.2, before the control existed, and nothing
 * connected "we turned on CAPTCHA" to "there is a fifth password grant in the
 * product". From the day Turnstile was enabled, `signInWithPassword` here
 * answered `400 captcha_failed` for **every** caller, and the surface reported
 * `A senha não confere.` to people typing the right password: account deletion
 * was impossible on the deployment, and the message pointed at the wrong cause.
 *
 * Disabling hosted CAPTCHA would also have "fixed" it, and is rejected: the
 * control is enforced at the provider precisely so that it cannot be bypassed
 * by a client, and weakening it to make one surface work would trade a real
 * boundary for a missing four-line forward.
 *
 * **Nothing here verifies a token.** Verification needs the Turnstile *secret*,
 * which lives only in hosted GoTrue and must never exist in this repository —
 * so the token is read, bounded, and forwarded, exactly as `captcha.ts`
 * documents for the auth surfaces. `captcha-missing` is decided without
 * verifying anything: it is the absence of a token on a deployment that renders
 * a widget, which is a tampered or blocked submission, not a failed challenge.
 *
 * ## Why this consumes the sign-in ceiling
 *
 * A password grant reachable from a session is still a password oracle, and it
 * was previously the only one in the product with no throttle in front of it.
 * It admits against `signin_failure` — the existing kind, so no migration —
 * because that is precisely what it is: an attempt to prove a password. The
 * ceiling is per-identifier and per-IP and sits far below where a human lands.
 *
 * This action does NOT delete anything. It moves the account to `deleting`,
 * from which point every write is already refused (SH.1) and no job can be
 * claimed. The executor is the Edge Function, invoked separately with the
 * user's own access token — the capability never enters `src/`.
 */

import { after } from "next/server";
import { z } from "zod";
import {
  CAPTCHA_TOKEN_FIELD,
  isCaptchaError,
  readCaptchaToken,
  turnstileSiteKey,
} from "@/features/auth/captcha";
import { admitAuthEvent, finalizeAuthEvent } from "@/features/auth/throttle";
import { assertActiveAccount } from "@/lib/auth/require-user";
import { isLocale, type Locale } from "@/lib/preferences";
import { createClient } from "@/lib/supabase/server";
import { getDeletionCopy } from "./deletion-copy";
import type { DeletionRequestState } from "./deletion-request-state";

const requestSchema = z.object({
  locale: z.string().refine(isLocale),
  password: z.string().min(1).max(256),
  confirmation: z.string().min(1).max(64),
});

function failure(locale: Locale, code: Exclude<DeletionRequestState["code"], null>): DeletionRequestState {
  return { status: "error", code, message: getDeletionCopy(locale).errors[code] };
}

export async function requestAccountDeletion(
  _previous: DeletionRequestState,
  formData: FormData,
): Promise<DeletionRequestState> {
  const parsed = requestSchema.safeParse({
    locale: formData.get("locale"),
    password: formData.get("password"),
    confirmation: formData.get("confirmation"),
  });
  // An unparseable submission cannot name a locale to answer in; pt-BR is the
  // product default and the same fallback the auth surfaces use.
  const locale: Locale = parsed.success ? (parsed.data.locale as Locale) : "pt-BR";
  if (!parsed.success) return failure(locale, "failed");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return failure(locale, "session");
  await assertActiveAccount(supabase, user.id, locale);

  // The typed phrase, compared before the provider is asked anything: a wrong
  // word must not consume a password attempt at the provider, and must not
  // spend the single-use CAPTCHA token either.
  const copy = getDeletionCopy(locale);
  if (parsed.data.confirmation.trim() !== copy.confirmationPhrase) {
    return failure(locale, "phrase");
  }

  /*
   * The token, decided before the provider call and without verifying anything.
   *
   * The condition is the **site key**, not the token: a deployment with no key
   * renders no widget and can produce no token, which is the configured state
   * for local development and CI (SH-CAPTCHA-005). Refusing there would make
   * the whole surface untestable without a hosted secret, and would also make a
   * green CI run look like evidence of a control it never exercised. Where a
   * key *is* configured the widget renders, so a submission carrying no token
   * did not come from that form — a stripped hidden input, a blocked script, a
   * challenge that never completed — and it is refused before any password is
   * sent anywhere.
   */
  const captchaToken = readCaptchaToken(formData.get(CAPTCHA_TOKEN_FIELD));
  const challengeExpected = turnstileSiteKey(process.env) !== null;
  if (challengeExpected && !captchaToken) {
    return failure(locale, "captcha-missing");
  }

  // Admission before the provider call, keyed by the account's own address.
  // `claim_auth_event_slot` reserves by inserting, so the attempt is counted
  // whether or not it succeeds — the failure direction is toward more
  // throttling, never less.
  const admission = await admitAuthEvent(supabase, "signin_failure", user.email);
  if (!admission.admitted) {
    return failure(locale, admission.reason === "throttled" ? "throttled" : "unavailable");
  }

  // Re-authentication. `signInWithPassword` is the only way to verify a
  // password; it issues a fresh session for the same user, which is harmless
  // here and is what makes "recent" true.
  const reauth = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.password,
    options: { captchaToken },
  });
  if (reauth.error || reauth.data.user?.id !== user.id) {
    await finalizeAuthEvent(supabase, admission.attemptId, "refused");
    // A failed challenge is not a wrong password. Conflating them is what made
    // this defect look like a credential problem for every user who hit it.
    if (reauth.error && isCaptchaError(reauth.error)) {
      return failure(locale, "captcha-failed");
    }
    return failure(locale, "password");
  }
  await finalizeAuthEvent(supabase, admission.attemptId, "succeeded");

  const { error } = await supabase.rpc("request_account_deletion");
  if (error) {
    // The declared lifecycle refusal is distinguishable from an outage; no
    // provider or database message reaches the user either way.
    const lifecycleRefusal = error.message.includes("Account lifecycle");
    return failure(locale, lifecycleRefusal ? "lifecycle" : "failed");
  }

  // The executor runs outside the request path: it enumerates storage and
  // deletes the account, and the response the user sees does not wait on it.
  // A failure here is not a failure of the request — the account is already
  // `deleting` and the executor is re-runnable (SH-DELETE-005).
  after(async () => {
    await invokeDeletionExecutor(supabase);
  });

  return { status: "started", code: null, message: null };
}

/**
 * Invokes the executor with the caller's own access token.
 *
 * The function derives the account from that token and accepts no target, so
 * this call cannot be aimed at anyone else even by a caller who wanted to.
 */
async function invokeDeletionExecutor(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!accessToken || !url) return;

  try {
    await fetch(`${url}/functions/v1/delete-account`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ requestedAt: new Date().toISOString() }),
    });
  } catch {
    // Deliberately silent: the account is already `deleting`, writes are
    // blocked, and the executor is re-runnable. Logging the failure body could
    // carry an identifier, and nothing here would act on it.
  }
}
