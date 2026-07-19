import { notFound } from "next/navigation";
import { loadWorkProjection, parseWorkView } from "@/features/daily-cycle/work-projection";
import { WorkView } from "@/features/daily-cycle/work-view";
import { requireUser } from "@/lib/auth/require-user";
import { parsePage } from "@/lib/pagination";
import { isLocale } from "@/lib/preferences";

export default async function WorkPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ view?: string | string[]; page?: string | string[] }>;
}) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const query = await searchParams;
  const view = parseWorkView(query.view);
  const page = parsePage(query.page);
  const { supabase, user } = await requireUser(locale);
  const projection = await loadWorkProjection(supabase, {
    userId: user.id,
    locale,
    view,
    page,
  });

  return <WorkView
    locale={locale}
    timezone={projection.timezone}
    view={view}
    page={page}
    items={projection.items}
    hasNext={projection.hasNext}
  />;
}
