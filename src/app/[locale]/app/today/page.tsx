import { notFound } from "next/navigation";
import { TaskList, type TaskRecord } from "@/features/operations/task-list";
import { PaginationLinks } from "@/features/shell/pagination-links";
import { requireUser } from "@/lib/auth/require-user";
import { pageRange, paginateRows, parsePage } from "@/lib/pagination";
import { isLocale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";

export default async function TodayPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const pt = locale === "pt-BR";
  const page = parsePage((await searchParams).page);
  const { from, to } = pageRange(page);
  const { supabase } = await requireUser(locale);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const result = await supabase
    .from("tasks")
    .select("id,title,description,status,due_at,created_by")
    .not("due_at", "is", null)
    .lte("due_at", end.toISOString())
    .not("status", "in", "(completed,cancelled)")
    .order("due_at")
    .range(from, to);
  const { items, hasNext } = paginateRows(
    (requireSupabaseData(result, "load today's tasks") ?? []) as TaskRecord[],
  );

  return (
    <div className="content-page">
      <header className="list-header">
        <div>
          <p className="eyebrow">{new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(new Date()).toUpperCase()}</p>
          <h1>{pt ? "Hoje" : "Today"}</h1>
          <p>{pt ? "Prazos de hoje e atrasos que ainda precisam de atenção." : "Today's deadlines and overdue work that still needs attention."}</p>
        </div>
      </header>
      <TaskList
        emptyHint={pt ? "Nenhum prazo exige sua atenção hoje." : "No deadline needs your attention today."}
        locale={locale}
        tasks={items}
      />
      <PaginationLinks locale={locale} path="today" page={page} hasNext={hasNext} />
    </div>
  );
}
