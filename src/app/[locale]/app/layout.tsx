import { notFound } from "next/navigation";
import { loadAccountIdentity } from "@/features/shell/account-identity";
import { AppShell } from "@/features/shell/app-shell";
import { isLocale } from "@/lib/preferences";

export default async function AuthenticatedLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  // Resolved here rather than inside `AppShell`, so the shell stays pure
  // presentation and its jsdom gate needs no Supabase double. Null is a
  // legitimate answer: a session can expire between `proxy.ts`'s check and this
  // read, and the account surface must still render so the user has a way out.
  const identity = await loadAccountIdentity(locale);
  return <AppShell identity={identity} locale={locale}>{children}</AppShell>;
}
