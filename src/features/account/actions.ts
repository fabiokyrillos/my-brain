"use server";

/**
 * The deletion request Server Action (SH-DELETE-002, SH-DELETE-010).
 *
 * Three checks, all server-side, in this order:
 *
 *   1. an authenticated session (and an `active` lifecycle — the SH.1 gate);
 *   2. **recent re-authentication**: the password is re-entered and validated
 *      against the provider here, not trusted from the client. A stolen or
 *      left-open session is the threat this exists for, and only the provider
 *      can answer it;
 *   3. the typed confirmation phrase, compared to the locale's own word.
 *
 * Removing the control from the DOM changes nothing: the phrase is compared
 * here, and the transition happens in `request_account_deletion`, which takes
 * no target and derives its owner from `auth.uid()`.
 *
 * This action does NOT delete anything. It moves the account to `deleting`,
 * from which point every write is already refused (SH.1) and no job can be
 * claimed. The executor is the Edge Function, invoked separately with the
 * user's own access token — the capability never enters `src/`.
 */

import { after } from "next/server";
import { z } from "zod";
import { assertActiveAccount } from "@/lib/auth/require-user";
import { isLocale, type Locale } from "@/lib/preferences";
import { createClient } from "@/lib/supabase/server";
import { getDeletionCopy } from "./deletion-copy";

export type DeletionRequestState = {
  readonly status: "idle" | "error" | "started";
  readonly code:
    | null
    | "session"
    | "password"
    | "phrase"
    | "lifecycle"
    | "failed";
  readonly message: string | null;
};

export const idleDeletionRequestState: DeletionRequestState = {
  status: "idle",
  code: null,
  message: null,
};

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
  // word must not consume a password attempt at the provider.
  const copy = getDeletionCopy(locale);
  if (parsed.data.confirmation.trim() !== copy.confirmationPhrase) {
    return failure(locale, "phrase");
  }

  // Re-authentication. `signInWithPassword` is the only way to verify a
  // password; it issues a fresh session for the same user, which is harmless
  // here and is what makes "recent" true.
  const reauth = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.password,
  });
  if (reauth.error || reauth.data.user?.id !== user.id) {
    return failure(locale, "password");
  }

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
