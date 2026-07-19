import Link from "next/link";
import { createRecord } from "@/features/operations/actions";
import { InlineCreateForm } from "@/features/operations/inline-create-form";
import { TaskList } from "@/features/operations/task-list";
import { PaginationLinks } from "@/features/shell/pagination-links";
import type { Locale } from "@/lib/preferences";
import type { WorkItemView } from "./contracts";
import { workViews, type WorkViewId } from "./work-projection";

const copy = {
  "pt-BR": {
    eyebrow: "EXECUÇÃO",
    title: "Trabalho",
    navigation: "Visões de Trabalho",
    views: {
      today: { label: "Hoje", description: "Prazos de hoje e atrasos que ainda estão abertos.", empty: "Nenhum prazo exige sua atenção hoje." },
      all: { label: "Todas", description: "Tarefas confirmadas pelo Brain e criadas manualmente.", empty: "Adicione uma tarefa acima ou capture uma intenção." },
      waiting: { label: "Aguardando", description: "Tarefas que dependem de outra pessoa.", empty: "Use Aguardar quando uma tarefa depender de retorno." },
    },
    waitingNote: "Contexto de pessoas e follow-up completo chegarão em uma fase posterior.",
  },
  en: {
    eyebrow: "EXECUTION",
    title: "Work",
    navigation: "Work views",
    views: {
      today: { label: "Today", description: "Today's deadlines and overdue work that is still open.", empty: "No deadline needs your attention today." },
      all: { label: "All", description: "Tasks confirmed from Brain and tasks you created manually.", empty: "Add a task above or capture an intention." },
      waiting: { label: "Waiting", description: "Tasks that depend on someone else.", empty: "Use Wait when a task depends on a response." },
    },
    waitingNote: "Person context and complete follow-up will arrive in a later phase.",
  },
} as const;

export function WorkView({
  locale,
  timezone,
  view,
  page,
  items,
  hasNext,
}: {
  locale: Locale;
  timezone: string;
  view: WorkViewId;
  page: number;
  items: readonly WorkItemView[];
  hasNext: boolean;
}) {
  const text = copy[locale];
  const active = text.views[view];

  return <div className="content-page work-page">
    <header className="list-header">
      <div>
        <p className="eyebrow">{text.eyebrow}</p>
        <h1>{text.title}</h1>
        <p>{active.description}</p>
        {view === "waiting" && <p className="work-view-note">{text.waitingNote}</p>}
      </div>
      {view === "all" && <InlineCreateForm action={createRecord} kind="task" locale={locale} />}
    </header>
    <nav className="work-view-tabs" aria-label={text.navigation}>
      {workViews.map((candidate) => <Link
        aria-current={candidate === view ? "page" : undefined}
        href={`/${locale}/app/work?view=${candidate}`}
        key={candidate}
      >
        {text.views[candidate].label}
      </Link>)}
    </nav>
    <TaskList emptyHint={active.empty} locale={locale} tasks={items} timezone={timezone} />
    <PaginationLinks
      locale={locale}
      path="work"
      page={page}
      hasNext={hasNext}
      query={{ view }}
    />
  </div>;
}
