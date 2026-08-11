import { notFound } from "next/navigation";
import { loadAccountIdentity } from "@/features/shell/account-identity";
import { AppShell } from "@/features/shell/app-shell";
import { requireUser } from "@/lib/auth/require-user";
import { isLocale } from "@/lib/preferences";

export default async function AuthenticatedLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  // The gate runs HERE, above the Suspense boundary `loading.tsx` creates over
  // this segment's children — not because the pages stopped calling it, but
  // because a `redirect()` raised below that boundary is flushed after the
  // shell and degrades from a 307 into a client-side navigation. SH-LIFECYCLE-008
  // and SH-LEGAL-008/009 specify a server-side refusal, and an answer that ships
  // 63 KB of shell and asks the browser to leave lasts exactly as long as
  // hydration does. `src/lib/closeout/server-side-gate-guard.test.ts` holds the
  // pairing; the pages keep their own call, so Server Actions and any route
  // reached without this layout are unaffected.
  await requireUser(locale);
  // Resolved here rather than inside `AppShell`, so the shell stays pure
  // presentation and its jsdom gate needs no Supabase double. Null is a
  // legitimate answer: a session can expire between the gate above and this
  // read, and the account surface must still render so the user has a way out.
  const identity = await loadAccountIdentity(locale);
  return <AppShell identity={identity} locale={locale}>{children}</AppShell>;
}
