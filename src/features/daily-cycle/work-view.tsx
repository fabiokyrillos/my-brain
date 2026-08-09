import Link from "next/link";
import { applyWorkItemAction, createRecord } from "@/features/operations/actions";
import { InlineCreateForm } from "@/features/operations/inline-create-form";
import { TaskList } from "@/features/operations/task-list";
import { WorkViewViewed } from "@/features/product-analytics/interaction-events";
import { PaginationLinks } from "@/features/shell/pagination-links";
import { runTaskCommand } from "@/features/task-commands/actions";
import { CommandConsole } from "@/features/task-commands/command-console";
import { getTaskCommandCopy } from "@/features/task-commands/copy";
import { applyTaskDetailCommand } from "@/features/task-commands/detail-actions";
import type { DetailControl } from "@/features/task-commands/detail-controls";
import type {
  TaskDetailDateBounds,
  TaskDetailRelationOptions,
} from "@/features/task-commands/task-detail-controls";
import type { Locale } from "@/lib/preferences";
import type { WorkItemView } from "./contracts";
import { workViews, type WorkViewId } from "./work-projection";
import { withAgentName } from "@/lib/agent-name";

const copy = {
  "pt-BR": {
    eyebrow: "EXECUÇÃO",
    title: "Trabalho",
    navigation: "Visões de Trabalho",
    views: {
      today: { label: "Hoje", description: "Prazos de hoje e atrasos que ainda estão abertos.", empty: "Nenhum prazo exige sua atenção hoje." },
      all: { label: "Todas", description: "Tarefas confirmadas pelo {agent} e criadas manualmente.", empty: "Adicione uma tarefa acima ou capture uma intenção." },
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
      all: { label: "All", description: "Tasks confirmed from {agent} and tasks you created manually.", empty: "Add a task above or capture an intention." },
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
  agentName,
  editControlsByTaskId,
  relationOptions,
  dateBounds,
}: {
  locale: Locale;
  timezone: string;
  view: WorkViewId;
  page: number;
  items: readonly WorkItemView[];
  hasNext: boolean;
  agentName: string;
  /** Derived from the taxonomy per row, in the projection (`2L-EDIT-001`). */
  editControlsByTaskId?: Readonly<Record<string, readonly DetailControl[]>>;
  relationOptions?: TaskDetailRelationOptions;
  dateBounds?: TaskDetailDateBounds;
}) {
  const text = withAgentName(copy[locale], agentName);
  const active = text.views[view];

  return <div className="content-page work-page">
    <WorkViewViewed locale={locale} view={view} />
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
    <CommandConsole action={runTaskCommand} locale={locale} origin="work" />
    <TaskList
      agentName={agentName}
      action={applyWorkItemAction}
      emptyHint={active.empty}
      locale={locale}
      tasks={items}
      timezone={timezone}
      quickEdit={editControlsByTaskId && relationOptions && dateBounds ? {
        action: applyTaskDetailCommand,
        controlsByTaskId: editControlsByTaskId,
        relationOptions,
        dateBounds,
      } : undefined}
    />
    {/*
      2E-DESTRUCTIVE-006's explicit affordance. It lives here rather than in the
      navigation because `capabilities.ts`'s `nested: true` drives active-state
      highlighting only — links render from `primaryNavigationKeys` and
      `moreNavigationGroups`, so a nested route with no link of its own is
      reachable only by typing the URL.
    */}
    <Link className="task-command-recovery-link" href={`/${locale}/app/work/cancelled`}>
      {getTaskCommandCopy(locale).recovery.entryPoint}
    </Link>
    <PaginationLinks
      locale={locale}
      path="work"
      page={page}
      hasNext={hasNext}
      query={{ view }}
    />
  </div>;
}
