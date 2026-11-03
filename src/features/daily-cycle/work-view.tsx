import { SlidersHorizontal, SquareTerminal } from "lucide-react";
import Link from "next/link";
import { Badge, PageHeader, SegmentedControl, buttonVariants } from "@/components/ui";
import { applyBulkWorkCommand, applyWorkItemAction, createRecord } from "@/features/operations/actions";
import { InlineCreateForm } from "@/features/operations/inline-create-form";
import { TaskList } from "@/features/operations/task-list";
import { WorkViewViewed } from "@/features/product-analytics/interaction-events";
import { PaginationLinks } from "@/features/shell/pagination-links";
import { runTaskCommand, undoWorkOperation } from "@/features/task-commands/actions";
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
import { WorkFilters } from "./work-filters";
import { getWorkFiltersCopy } from "./work-filters-copy";
import { groupWorkItems } from "./work-grouping";
import { WorkModeTabs } from "./work-modes";
import { activeFilterCount, isNarrowed, toWorkQueryParams, workHref, type WorkQuery } from "./work-query";
import { workViews, type WorkViewId } from "./work-projection";
import { withAgentName } from "@/lib/agent-name";

const copy = {
  "pt-BR": {
    title: "Tarefas",
    navigation: "Visões das tarefas",
    views: {
      today: { label: "Hoje", description: "Prazos de hoje e atrasos que ainda estão abertos.", empty: "Nenhum prazo exige sua atenção hoje." },
      all: { label: "Todas", description: "Tarefas confirmadas pelo {agent} e criadas manualmente.", empty: "Adicione uma tarefa acima ou capture uma intenção." },
      waiting: { label: "Aguardando", description: "Tarefas que dependem do retorno de alguém.", empty: "Use Aguardar quando uma tarefa depender de retorno." },
    },
    waitingNote: "Contexto de pessoas e follow-up completo chegarão em uma fase posterior.",
  },
  en: {
    title: "Tasks",
    navigation: "Task views",
    views: {
      today: { label: "Today", description: "Today's deadlines and overdue tasks that are still open.", empty: "No deadline needs your attention today." },
      all: { label: "All", description: "Tasks confirmed from {agent} and tasks you created manually.", empty: "Add a task above or capture an intention." },
      waiting: { label: "Waiting", description: "Tasks that depend on someone getting back to you.", empty: "Use Wait when a task depends on a response." },
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
  statusByTaskId,
  query,
  positionAdjusted = false,
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
  /** Each row's real status, which the preview's eligibility partition needs. */
  statusByTaskId?: Readonly<Record<string, string>>;
  /** The complete description of what the user is looking at (`2L-VIEW-007`). */
  query?: WorkQuery;
  /** `2L-RETURN-005` — the position moved, and the user is told. */
  positionAdjusted?: boolean;
}) {
  const text = withAgentName(copy[locale], agentName);
  const active = text.views[view];
  const filtersCopy = getWorkFiltersCopy(locale);
  const groups = query
    ? groupWorkItems(items, query.group, { ungrouped: filtersCopy.ungrouped, priority: filtersCopy.priority })
    : [{ key: "all", label: null, items }];
  /*
   * `2L-VIEW-009` and the universal-state contract: an empty page that is empty
   * BECAUSE of the narrowing is a different fact from a view with nothing in it,
   * and the two say different things to a user — one of them is actionable.
   */
  const emptyHint = query && isNarrowed(query) && items.length === 0
    ? filtersCopy.emptyFiltered
    : active.empty;

  /*
    `03-componentes.md`, ListToolbar. The filter set is seven groups of chips —
    roughly forty controls — and rendering all of them above the list made the
    narrowing taller than the work it narrows. Collapsed into a disclosure, with
    the count of what is currently active on the summary so a narrowed list can
    never look like an unnarrowed one.

    A `<details>` rather than a `useState` panel: it works before hydration, it
    is keyboard-operable with no code, and this stays a server component.
  */
  const narrowed = query ? isNarrowed(query) : false;
  const filterCount = query ? activeFilterCount(query) : 0;

  return <div className="content-page work-page">
    <WorkViewViewed locale={locale} view={view} />
    {/*
      Life Brain A.3 (`LB-A-006`). One compact header: the title, the active
      view's one-line description (hidden on a phone by `compact`), and the
      quick add as its action. The eyebrow went with the baseline's
      eyebrow + display + lead stack, which spent a third of an iPhone screen
      before the first task.

      Creating a task stays a primary action on every view, not only on
      "Todas" (`02-arquitetura-e-rotas.md` lists *criar* among the space's
      main actions) — it was once hidden on Hoje and Aguardando, which is where
      a user most often wants it.
    */}
    <PageHeader
      actions={<InlineCreateForm action={createRecord} kind="task" locale={locale} />}
      className="work-page-header"
      description={active.description}
      size="compact"
      title={text.title}
    />
    {view === "waiting" && <p className="work-view-note">{text.waitingNote}</p>}
    {positionAdjusted ? (
      <p className="work-position-adjusted" role="status">{filtersCopy.positionAdjusted}</p>
    ) : null}

    {/* Lista · Calendário · Planejar — the same work, three ways of looking at
        it. The Lista tab carries the current narrowing so a trip through the
        calendar does not silently reset it. */}
    <WorkModeTabs
      active="list"
      listHref={query ? workHref(locale, query) : undefined}
      locale={locale}
    />

    {/* Hoje · Todas · Aguardando — the one selection control for the views
        (Life Brain A.3). Switching view keeps the narrowing but returns to
        page 1: page 7 of Hoje is very rarely page 7 of Todas. */}
    <SegmentedControl
      className="work-view-tabs"
      label={text.navigation}
      options={workViews.map((candidate) => ({
        value: candidate,
        label: text.views[candidate].label,
        href: query ? workHref(locale, { ...query, view: candidate, page: 1 }) : `/${locale}/app/work?view=${candidate}`,
      }))}
      value={view}
    />

    <div className="work-toolbar">
      {query ? (
        <details className="work-disclosure" open={narrowed}>
          {/* One ghost button (Life Brain A.3) with the count of active
              filters. Open by default when something is active, and said in
              words as well — in the accessible name, since the badge is a
              digit: a narrowing you cannot see is a list that lies about what
              it contains. */}
          <summary
            aria-label={filterCount > 0 ? filtersCopy.filtersActiveLabel(filterCount) : undefined}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <SlidersHorizontal aria-hidden="true" className="ui-button__icon" />
            <span className="ui-button__label">{filtersCopy.filterSummary}</span>
            {filterCount > 0 ? <Badge aria-hidden="true" size="sm" tone="accent">{filterCount}</Badge> : null}
          </summary>
          <WorkFilters locale={locale} query={query} />
        </details>
      ) : null}
      {/*
        The command console keeps every capability it had and stops occupying the
        top of the page. It is a real feature — `runTaskCommand` with its own
        preview and undo — so it is collapsed, never removed.
      */}
      <details className="work-disclosure">
        <summary className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <SquareTerminal aria-hidden="true" className="ui-button__icon" />
          <span className="ui-button__label">{getTaskCommandCopy(locale).console.title}</span>
        </summary>
        <CommandConsole action={runTaskCommand} locale={locale} origin="work" />
      </details>
    </div>
    {groups.map((group) => (
      <section
        aria-label={group.label ?? undefined}
        className={group.label ? "work-group" : undefined}
        key={group.key}
      >
        {group.label ? (
          <h2 className="work-group-heading">
            {group.label} <span className="work-group-count">{filtersCopy.groupCount(group.items.length)}</span>
          </h2>
        ) : null}
        <TaskList
          agentName={agentName}
      action={applyWorkItemAction}
      emptyHint={emptyHint}
      locale={locale}
      tasks={group.items}
      timezone={timezone}
      undoAction={undoWorkOperation}
      bulk={statusByTaskId && relationOptions && dateBounds ? {
        action: applyBulkWorkCommand,
        undoAction: undoWorkOperation,
        statusByTaskId,
        relationOptions,
        dateBounds,
      } : undefined}
      quickEdit={editControlsByTaskId && relationOptions && dateBounds ? {
        action: applyTaskDetailCommand,
        undoAction: undoWorkOperation,
        controlsByTaskId: editControlsByTaskId,
        relationOptions,
        dateBounds,
      } : undefined}
        />
      </section>
    ))}
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
      // `2L-VIEW-009`: pagination composes with everything else, so the links
      // carry the whole query rather than the view alone.
      query={query ? toWorkQueryParams({ ...query, page: 1 }) : { view }}
    />
  </div>;
}
