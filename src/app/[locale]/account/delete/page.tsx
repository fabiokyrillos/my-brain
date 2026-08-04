/**
 * The deletion request route — SH-DELETE-002, and SH-LEGAL-010's destination.
 *
 * Outside `app/`, deliberately, for the same reason `/account-state` is: an
 * account that owes consent is interposed away from every product route, and
 * the decline path has to reach *somewhere*. Deleting the account is one of the
 * two things a consent-owing account may still do, so this route must not sit
 * behind the gate that is asking it to consent.
 *
 * It does not call `requireUser` — that helper redirects a consent-owing account
 * to `/consent`, which would make this page unreachable exactly when it is
 * needed. Authentication is inline and the lifecycle gate is explicit, in that
 * order: a suspended or already-deleting account is sent to `/account-state`
 * rather than shown a second deletion form.
 */

import { notFound, redirect } from "next/navigation";
import { DeletionSurface } from "@/features/account/deletion-surface";
import { assertActiveAccount } from "@/lib/auth/require-user";
import { isLocale } from "@/lib/preferences";
import { createClient } from "@/lib/supabase/server";

export default async function DeleteAccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  await assertActiveAccount(supabase, user.id, locale);

  return (
    <main className="auth-stage">
      <DeletionSurface locale={locale} />
    </main>
  );
}
