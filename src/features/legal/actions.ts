"use server";

import { redirect } from "next/navigation";
import { assertActiveAccount } from "@/lib/auth/require-user";
import { isLocale, type Locale } from "@/lib/preferences";
import { createClient } from "@/lib/supabase/server";
import { missingPolicyAcceptances } from "./acceptance";
import { getLegalCopy } from "./copy";
import { type ConsentState } from "./consent-state";

function safeLocale(value: FormDataEntryValue | null): Locale {
  return isLocale(value) ? value : "pt-BR";
}

/**
 * Record acceptance of every document this account still owes — SH-LEGAL-008.
 *
 * ## What this action does NOT accept from the caller
 *
 * A version, and a document list. Both are derived server-side: the documents
 * come from `missingPolicyAcceptances`, and the version is chosen by
 * `record_policy_acceptance`, which takes no version parameter at all. A form
 * field naming a version would be a form field somebody could edit, and the
 * whole class of "accept a version I have not been shown" bugs is absent rather
 * than defended against.
 *
 * It deliberately does not call `requireUser`: that helper redirects a
 * consent-owing account *to this surface*, so calling it from the surface's own
 * action would be a loop. Authentication is inline and the lifecycle gate is
 * applied explicitly, in that order — a suspended account cannot record consent
 * any more than it can capture.
 */
export async function acceptPolicies(
  _previous: ConsentState,
  formData: FormData,
): Promise<ConsentState> {
  const locale = safeLocale(formData.get("locale"));
  const copy = getLegalCopy(locale);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  await assertActiveAccount(supabase, user.id, locale);

  const missing = await missingPolicyAcceptances(supabase, user.id);
  for (const document of missing) {
    const { error } = await supabase.rpc("record_policy_acceptance", {
      p_document: document,
      p_surface: "interposition",
    });
    // The database's message is never surfaced: the user gets one localized
    // sentence and the code stays in the log.
    if (error) {
      console.error("Policy acceptance refused", { code: error.code ?? "unknown" });
      return { status: "failed", message: copy.interposition.failed };
    }
  }

  redirect(`/${locale}/app`);
}
