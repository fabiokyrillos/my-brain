import { notFound } from "next/navigation";
import { HomeDashboard } from "@/features/shell/home-dashboard";
import { isLocale } from "@/lib/preferences";

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <HomeDashboard locale={locale}/>;
}
