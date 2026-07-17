import { notFound } from "next/navigation";
import { createRecord } from "@/features/operations/actions";
import { InlineCreateForm } from "@/features/operations/inline-create-form";
import { TaskList, type TaskRecord } from "@/features/operations/task-list";
import { PaginationLinks } from "@/features/shell/pagination-links";
import { requireUser } from "@/lib/auth/require-user";
import { pageRange, paginateRows, parsePage } from "@/lib/pagination";
import { isLocale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";

export default async function TasksPage({
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
    .neq("status", "cancelled")
    .order("updated_at", { ascending: false })
    .range(from, to);
  const { items, hasNext } = paginateRows(
    (requireSupabaseData(result, "load tasks") ?? []) as TaskRecord[],
  );

  return (
    <div className="content-page">
      <header className="list-header">
        <div>
          <p className="eyebrow">{pt ? "EXECUÇÃO" : "EXECUTION"}</p>
          <h1>{pt ? "Tarefas" : "Tasks"}</h1>
          <p>{pt ? "Ações confirmadas por você e tarefas criadas manualmente." : "Actions you confirmed and tasks you created manually."}</p>
        </div>
        <InlineCreateForm action={createRecord} kind="task" locale={locale} />
      </header>
      <TaskList
        emptyHint={pt ? "Registre uma intenção ou adicione uma tarefa acima." : "Capture an intention or add a task above."}
        locale={locale}
        tasks={items}
      />
      <PaginationLinks locale={locale} path="tasks" page={page} hasNext={hasNext} />
    </div>
  );
}
