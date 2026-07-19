import { notFound, redirect } from "next/navigation";
import { parsePage } from "@/lib/pagination";
import { isLocale } from "@/lib/preferences";

export default async function WaitingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const page = parsePage((await searchParams).page);
  redirect(`/${locale}/app/work?view=waiting&page=${page}`);
}
