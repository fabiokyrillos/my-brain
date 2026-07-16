import { notFound } from "next/navigation";
import { AppShell } from "@/features/shell/app-shell";
import { isLocale } from "@/lib/preferences";

export default async function AuthenticatedLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <AppShell locale={locale}>{children}</AppShell>;
}
