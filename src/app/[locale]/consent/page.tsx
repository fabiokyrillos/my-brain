/**
 * The consent interposition route — SH-LEGAL-008/009.
 *
 * Where `requireUser` sends an account that owes an acceptance for the current
 * version of either document. Outside `app/` so it never renders the product
 * shell, and deliberately not calling `requireUser` itself, so the redirect
 * cannot recurse — the same shape `/account-state` uses.
 *
 * The state is resolved server-side on every request: an account that owes
 * nothing is bounced back into the product, so accepting in another tab
 * recovers here by refreshing, with no operator step and no client state
 * involved (SH-LEGAL-011).
 */

import { notFound, redirect } from "next/navigation";
import { ConsentSurface } from "@/features/legal/consent-surface";
import { missingPolicyAcceptances } from "@/features/legal/acceptance";
import { isLocale } from "@/lib/preferences";
import { createClient } from "@/lib/supabase/server";

export default async function ConsentPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  // A non-active account is not asked to consent: the lifecycle surface is the
  // more specific answer, and asking a suspended account to accept terms it
  // cannot then act under would be theatre.
  const lifecycle = await supabase
    .from("account_lifecycle")
    .select("status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (lifecycle.error || lifecycle.data?.status !== "active") {
    redirect(`/${locale}/account-state`);
  }

  const missing = await missingPolicyAcceptances(supabase, user.id);
  if (missing.length === 0) redirect(`/${locale}/app`);

  // "Has accepted before" decides one sentence, and is derived rather than
  // stored: any acceptance row at all means this is a version bump rather than
  // a first session.
  const priorAcceptance = await supabase
    .from("policy_acceptances")
    .select("id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  return (
    <main className="auth-stage">
      <ConsentSurface
        hasAcceptedBefore={!priorAcceptance.error && priorAcceptance.data !== null}
        locale={locale}
      />
    </main>
  );
}
