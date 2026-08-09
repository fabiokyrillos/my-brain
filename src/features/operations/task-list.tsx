"use client";

/**
 * The Work list, converted Server → Client in Phase 2F Slice 2F.2.
 *
 * **The no-JavaScript submit path is intentionally lost** (2F-SURFACE-010's
 * recorded trade). Every failure this surface can now reach is a *declared*
 * outcome with localized copy and a stated retry-ability, and rendering those
 * requires `useActionState`. The alternative — keeping the plain `<form action>`
 * and letting refusals be silent — is what 2F.2 exists to end: the pre-2F path
 * returned `void` and swallowed every outcome, including the ones where nothing
 * happened.
 */

import Link from "next/link";
import { useState } from "react";
import { Inbox } from "lucide-react";
import type { WorkItemHumanState, WorkItemPriority, WorkItemView } from "@/features/daily-cycle/contracts";
import { resolveTaskContent } from "@/features/sensitivity/task-derivation";
import type { DetailControl } from "@/features/task-commands/detail-controls";
import type {
  TaskDetailCommandHandler,
  TaskDetailDateBounds,
  TaskDetailRelationOptions,
} from "@/features/task-commands/task-detail-controls";
import type { Locale } from "@/lib/preferences";
import { getWorkCopy } from "./copy";
import { BulkBar, type BulkCommandHandler } from "./bulk-bar";
import { ProtectedContent } from "./protected-content";
import { QuickEdit } from "./quick-edit";
import {
  EMPTY_SELECTION,
  SELECTION_CEILING,
  clearSelection,
  isSelected,
  selectAllShown,
  toggleSelected,
  type Selection,
} from "./selection";
import type { TaskUndoHandler } from "./undo-affordance";
import { WorkItemActions, type WorkItemActionHandler } from "./work-item-actions";

const humanStateCopy: Record<WorkItemHumanState, { pt: string; en: string }> = {
  not_started: { pt: "Não iniciada", en: "Not started" },
  in_progress: { pt: "Em andamento", en: "In progress" },
  waiting_on_someone: { pt: "Aguardando alguém", en: "Waiting on someone" },
  blocked: { pt: "Bloqueada", en: "Blocked" },
  deferred: { pt: "Adiada", en: "Deferred" },
  completed: { pt: "Concluída", en: "Completed" },
  // Unreachable through this component — every Work query excludes cancelled rows
  // in SQL — but the record is exhaustive over the vocabulary on purpose, so a
  // state can never reach a reader with no word for it.
  cancelled: { pt: "Cancelada", en: "Cancelled" },
};

const priorityCopy: Record<WorkItemPriority, { pt: string; en: string }> = {
  low: { pt: "Baixa", en: "Low" },
  medium: { pt: "Média", en: "Medium" },
  high: { pt: "Alta", en: "High" },
  urgent: { pt: "Urgente", en: "Urgent" },
};

export type { WorkItemActionHandler };

/**
 * Everything quick edit needs, injected as one object (`2L-EDIT-001`).
 *
 * Optional, and deliberately all-or-nothing: a list rendered without it is the
 * list exactly as it was, which is what lets the jsdom gate and the Hoje panel
 * mount `TaskList` without a relation query. Half-supplied would be worse than
 * absent — a control with no options to point at is a control the user can only
 * fail to use.
 */
/**
 * Everything selection and bulk need, injected as one object (`2L-BULK-001`).
 *
 * Optional and all-or-nothing, for the reason `QuickEditSupport` is: a list
 * rendered without it is the list exactly as it was, which is what lets the
 * Hoje panel and the jsdom gate mount `TaskList` without a relation query.
 *
 * `statusByTaskId` is the row's **real** status, which the rendered
 * `WorkItemView` deliberately cannot supply — `humanState` is lossy, and the
 * preview partition is an eligibility question.
 */
export type BulkSupport = {
  readonly action: BulkCommandHandler;
  readonly undoAction?: TaskUndoHandler;
  readonly statusByTaskId: Readonly<Record<string, string>>;
  readonly relationOptions: TaskDetailRelationOptions;
  readonly dateBounds: TaskDetailDateBounds;
};

export type QuickEditSupport = {
  readonly action: TaskDetailCommandHandler;
  /** `2L-EDIT-008`. A quick edit is an operation too, and reversible the same way. */
  readonly undoAction?: TaskUndoHandler;
  /** Derived from the taxonomy per row, server-side. Never computed here. */
  readonly controlsByTaskId: Readonly<Record<string, readonly DetailControl[]>>;
  readonly relationOptions: TaskDetailRelationOptions;
  readonly dateBounds: TaskDetailDateBounds;
};

export function TaskList({
  action,
  agentName,
  bulk,
  emptyHint,
  locale,
  quickEdit,
  tasks,
  timezone,
  undoAction,
}: {
  /** The assistant’s configured name (UX-06), injected for the same reason the action is. */
  agentName: string;
  /**
   * The Server Action, injected by the Server Component that mounts this — the
   * shape `QuickCaptureForm` and `CommandConsole` already use.
   *
   * Not defaulted to an import of `./actions`, and that is not a style choice:
   * `actions.ts` is `"use server"` and reaches `@/lib/supabase/server`, whose
   * `server-only` guard throws the moment a Client Component module imports it.
   * Injection is also what lets the jsdom gate drive every declared outcome
   * without a database.
   */
  action: WorkItemActionHandler;
  bulk?: BulkSupport;
  emptyHint: string;
  locale: Locale;
  quickEdit?: QuickEditSupport;
  tasks: readonly WorkItemView[];
  timezone: string;
  /** `2L-EDIT-008`. Injected, like every other action this surface calls. */
  undoAction?: TaskUndoHandler;
}) {
  const pt = locale === "pt-BR";
  /*
   * The selection lives here rather than above, because it is scoped to what
   * this list is currently showing: a page change re-mounts the rows, and a
   * selection that outlived the set it describes would let a bulk operation
   * name items the user can no longer see (`2L-BULK-002`).
   */
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const [selectionRefusal, setSelectionRefusal] = useState<string | null>(null);
  const bulkCopy = getWorkCopy(locale).bulk;

  function change(next: ReturnType<typeof toggleSelected>) {
    if (next.status === "refused") {
      // Refused, never truncated: the selection is unchanged and the reason is
      // rendered where the user acted.
      setSelectionRefusal(bulkCopy.ceilingReached(SELECTION_CEILING));
      return;
    }
    setSelectionRefusal(null);
    setSelection(next.selection);
  }

  if (tasks.length === 0) {
    return <div className="empty-list"><Inbox size={30} /><strong>{pt ? "Tudo em ordem" : "All clear"}</strong><p>{emptyHint}</p></div>;
  }

  /*
   * `2L-PRIVACY-004` — the partial coverage, stated where it could mislead.
   *
   * OD-2L-1 option B protects a task through the note it came from, and a task
   * typed straight into this list has no note. A user looking at a page where
   * *something* is withheld would otherwise reasonably conclude that everything
   * sensitive is, so the sentence appears exactly when at least one row is
   * masked — and never on a page where nothing is, where it would be noise
   * about a mechanism the user has not met.
   */
  // "Is anything withheld" is asked of the **contract**, never of a level: this
  // file may not name a classification, and `sensitivity-boundary.test.ts`
  // fails the build if it does.
  const anyWithheld = tasks.some((task) => resolveTaskContent(task.sensitivity, task.taskId).masked);

  const selected = bulk
    ? tasks
      .filter((task) => isSelected(selection, task.taskId))
      .map((task) => ({
        taskId: task.taskId,
        title: task.title,
        status: bulk.statusByTaskId[task.taskId] ?? "",
      }))
    : [];

  return (
    <div className="list-stack">
      {bulk ? (
        <div className="work-bulk-select-all">
          <button
            className="row-action"
            onClick={() => change(selectAllShown(selection, tasks.map((task) => task.taskId)))}
            type="button"
          >
            {bulkCopy.selectAllShown}
          </button>
        </div>
      ) : null}
      {tasks.map((task) => (
        <TaskRow
          action={action}
          agentName={agentName}
          key={task.taskId}
          locale={locale}
          quickEdit={quickEdit}
          selectable={bulk ? {
            selected: isSelected(selection, task.taskId),
            onToggle: () => change(toggleSelected(selection, task.taskId)),
          } : undefined}
          task={task}
          timezone={timezone}
          undoAction={undoAction}
        />
      ))}
      {bulk ? (
        <BulkBar
          action={bulk.action}
          dateBounds={bulk.dateBounds}
          locale={locale}
          onClear={() => { setSelection(clearSelection()); setSelectionRefusal(null); }}
          refusal={selectionRefusal}
          relationOptions={bulk.relationOptions}
          selected={selected}
          undoAction={bulk.undoAction}
        />
      ) : null}
      {anyWithheld ? (
        <p className="quiet-state work-protected-note">{getWorkCopy(locale).protected.partialCoverage}</p>
      ) : null}
    </div>
  );
}

function TaskRow({
  action,
  agentName,
  locale,
  quickEdit,
  selectable,
  task,
  timezone,
  undoAction,
}: {
  action: WorkItemActionHandler;
  agentName: string;
  locale: Locale;
  quickEdit?: QuickEditSupport;
  selectable?: { readonly selected: boolean; readonly onToggle: () => void };
  task: WorkItemView;
  timezone: string;
  undoAction?: TaskUndoHandler;
}) {
  const pt = locale === "pt-BR";
  // The producer of `open_task` is `work-projection.ts`; this is its consumer.
  // Before Slice D1 the row was an <article> with no way in, so a task could be
  // acted on in four fixed ways and never inspected (UX-05, UX-19). The title is
  // the link rather than the row, because the row contains the action forms and
  // a <form> inside an <a> is not valid markup.
  const openHref = task.availableActions.find((available) => available.id === "open_task")?.href;

  return (
    <article className="list-row">
      {selectable ? (
        <label className="work-row-select">
          {/*
            `2L-BULK-002`. An explicit act on this item, with an accessible name
            that says which item — a checkbox labelled only "Select" repeated
            fifty times names nothing (`2L-ACCESS-003`). A masked row's label is
            the protected stub, which is the honest thing to call it: the user
            can select it without being told what it says (`2L-PRIVACY-008`).
          */}
          <input
            checked={selectable.selected}
            onChange={selectable.onToggle}
            type="checkbox"
          />
          <span className="sr-only">
            {getWorkCopy(locale).bulk.selectRow(
              resolveTaskContent(task.sensitivity, task.taskId).masked
                ? getWorkCopy(locale).protected.label
                : task.title,
            )}
          </span>
        </label>
      ) : null}
      <div className="list-row-main">
        {/*
          `2L-PRIVACY-001`/`-003`. The title and the description are the only
          user content this row renders, and they are withheld together: masking
          one and printing the other would protect nothing.

          The row itself survives — its state, its dates, its relations and its
          four actions all stay — because the count, the pagination and any
          later selection have to keep describing the set the user actually
          owns. `href` keeps the masked row openable without putting the
          withheld title into the link.
        */}
        <ProtectedContent
          href={openHref}
          locale={locale}
          revealKey={task.taskId}
          sensitivity={task.sensitivity}
        >
          {openHref ? <Link className="work-title-link" href={openHref}><strong>{task.title}</strong></Link> : <strong>{task.title}</strong>}
          {task.description && <p>{task.description}</p>}
        </ProtectedContent>
        <small className="work-origin">{task.origin === "brain" ? (pt ? `Sugerida pelo ${agentName}` : `Suggested by ${agentName}`) : (pt ? "Criada por você" : "Created by you")}</small>
        {(task.projects.length > 0 || task.contexts.length > 0 || task.people.length > 0
          || task.waitingOnPeople.length > 0 || task.parent || (task.dependsOn?.length ?? 0) > 0) && (
          <div className="work-relations">
            {task.projects.map((project) => (
              <span className="status-badge" key={`project-${project.id}`}>{project.label}</span>
            ))}
            {task.contexts.map((context) => (
              <span className="status-badge" key={`context-${context.id}`}>{context.label}</span>
            ))}
            {task.people.map((person) => (
              <span className="status-badge" key={`person-${person.id}`}>{person.label}</span>
            ))}
            {task.waitingOnPeople.map((person) => (
              <span className="status-badge" key={`waiting-on-${person.id}`}>
                {(pt ? "Aguardando: " : "Waiting on: ") + person.label}
              </span>
            ))}
            {task.parent && (
              <span className="status-badge" key={`parent-${task.parent.id}`}>
                {(pt ? "Tarefa-mãe: " : "Parent: ") + task.parent.label}
              </span>
            )}
            {task.dependsOn?.map((dependency) => (
              <span className="status-badge" key={`depends-on-${dependency.id}`}>
                {(pt ? "Depende de: " : "Depends on: ") + dependency.label}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="list-meta">
        {task.dueAt && <span>{new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short", timeZone: timezone }).format(new Date(task.dueAt))}</span>}
        {!task.dueAt && task.intentionalNoDue && (
          <span className="status-badge">{pt ? "Sem prazo" : "No due date"}</span>
        )}
        {task.plannedAt && (
          <span>{pt ? "Planejado: " : "Planned: "}{new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short", timeZone: timezone }).format(new Date(task.plannedAt))}</span>
        )}
        {task.priority && (
          <span className="status-badge">{priorityCopy[task.priority][pt ? "pt" : "en"]}</span>
        )}
        {task.noDueReason && <small>{task.noDueReason}</small>}
        <span className="status-badge">{humanStateCopy[task.humanState][pt ? "pt" : "en"]}</span>
        <WorkItemActions action={action} locale={locale} task={task} undoAction={undoAction} />
        {/*
          `2L-EDIT-001`. The controls arrive already derived from the taxonomy
          against this row's real status — this row does not compute them, and
          could not: `humanState` is lossy on purpose.
        */}
        {quickEdit ? (
          <QuickEdit
            action={quickEdit.action}
            controls={quickEdit.controlsByTaskId[task.taskId] ?? []}
            dateBounds={quickEdit.dateBounds}
            locale={locale}
            relationOptions={quickEdit.relationOptions}
            taskId={task.taskId}
            title={task.title}
            undoAction={quickEdit.undoAction}
          />
        ) : null}
      </div>
    </article>
  );
}
