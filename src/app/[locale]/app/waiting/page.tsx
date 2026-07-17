import { notFound } from "next/navigation";
import { TaskList, type TaskRecord } from "@/features/operations/task-list";
import { PaginationLinks } from "@/features/shell/pagination-links";
import { requireUser } from "@/lib/auth/require-user";
import { pageRange, paginateRows, parsePage } from "@/lib/pagination";
import { isLocale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";

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
  const pt = locale === "pt-BR";
  const page = parsePage((await searchParams).page);
  const { from, to } = pageRange(page);
  const { supabase } = await requireUser(locale);
  const result = await supabase
    .from("tasks")
    .select("id,title,description,status,due_at,created_by")
    .eq("status", "waiting")
    .order("updated_at", { ascending: false })
    .range(from, to);
  const { items, hasNext } = paginateRows(
    (requireSupabaseData(result, "load waiting tasks") ?? []) as TaskRecord[],
  );

  return (
    <div className="content-page">
      <header className="list-header"><div><p className="eyebrow">{pt ? "ACOMPANHAMENTO" : "FOLLOW-UP"}</p><h1>{pt ? "Aguardando" : "Waiting"}</h1><p>{pt ? "O que depende de outra pessoa e merece acompanhamento." : "What depends on someone else and needs follow-up."}</p></div></header>
      <TaskList emptyHint={pt ? "Quando algo depender de terceiros, mova a tarefa para Aguardando." : "Move tasks here when they depend on someone else."} locale={locale} tasks={items} />
      <PaginationLinks locale={locale} path="waiting" page={page} hasNext={hasNext} />
    </div>
  );
}
