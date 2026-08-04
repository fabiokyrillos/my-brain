/**
 * The account-state route (SH-LIFECYCLE-008): where `requireUser` sends every
 * non-active account. Deliberately OUTSIDE `/app`, so it never renders the
 * product shell, and deliberately not calling `requireUser`, so the redirect
 * cannot recurse.
 *
 * The status is resolved server-side on every request — client state is never
 * the enforcement point. An `active` visitor is bounced back to the product
 * (a reactivated account recovers by refreshing, no operator step); an
 * unauthenticated visitor goes to login; anything unreadable renders the
 * fail-closed `unknown` surface rather than guessing.
 */

import { notFound, redirect } from "next/navigation";
import { AccountStateSurface } from "@/features/shell/account-state-surface";
import type { AccountStateKind } from "@/features/shell/lifecycle-copy";
import { isLocale } from "@/lib/preferences";
import { createClient } from "@/lib/supabase/server";

export default async function AccountStatePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const lifecycle = await supabase
    .from("account_lifecycle")
    .select("status,reason_code")
    .eq("user_id", user.id)
    .maybeSingle();

  const status = lifecycle.error ? null : lifecycle.data?.status ?? null;
  if (status === "active") redirect(`/${locale}/app`);

  const state: AccountStateKind =
    status === "suspended" || status === "deleting" ? status : "unknown";

  // SH-COPY-002: the reason travels as the stored code and is turned into its
  // public label by the copy module, which falls back to the generic label for
  // anything it does not know. The code itself never reaches the page.
  return (
    <AccountStateSurface
      locale={locale}
      reasonCode={lifecycle.error ? null : lifecycle.data?.reason_code ?? null}
      state={state}
    />
  );
}
