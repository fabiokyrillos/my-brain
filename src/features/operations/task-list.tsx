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
import { Inbox } from "lucide-react";
import type { WorkItemHumanState, WorkItemPriority, WorkItemView } from "@/features/daily-cycle/contracts";
import type { Locale } from "@/lib/preferences";
import { WorkItemActions, type WorkItemActionHandler } from "./work-item-actions";

const humanStateCopy: Record<WorkItemHumanState, { pt: string; en: string }> = {
  not_started: { pt: "Não iniciada", en: "Not started" },
  in_progress: { pt: "Em andamento", en: "In progress" },
  waiting_on_someone: { pt: "Aguardando alguém", en: "Waiting on someone" },
  blocked: { pt: "Bloqueada", en: "Blocked" },
  deferred: { pt: "Adiada", en: "Deferred" },
  completed: { pt: "Concluída", en: "Completed" },
};

const priorityCopy: Record<WorkItemPriority, { pt: string; en: string }> = {
  low: { pt: "Baixa", en: "Low" },
  medium: { pt: "Média", en: "Medium" },
  high: { pt: "Alta", en: "High" },
  urgent: { pt: "Urgente", en: "Urgent" },
};

export type { WorkItemActionHandler };

export function TaskList({
  action,
  emptyHint,
  locale,
  tasks,
  timezone,
}: {
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
  emptyHint: string;
  locale: Locale;
  tasks: readonly WorkItemView[];
  timezone: string;
}) {
  const pt = locale === "pt-BR";
  if (tasks.length === 0) {
    return <div className="empty-list"><Inbox size={30} /><strong>{pt ? "Tudo em ordem" : "All clear"}</strong><p>{emptyHint}</p></div>;
  }

  return (
    <div className="list-stack">
      {tasks.map((task) => (
        <TaskRow action={action} key={task.taskId} locale={locale} task={task} timezone={timezone} />
      ))}
    </div>
  );
}

function TaskRow({
  action,
  locale,
  task,
  timezone,
}: {
  action: WorkItemActionHandler;
  locale: Locale;
  task: WorkItemView;
  timezone: string;
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
      <div className="list-row-main">
        {openHref ? <Link className="work-title-link" href={openHref}><strong>{task.title}</strong></Link> : <strong>{task.title}</strong>}
        {task.description && <p>{task.description}</p>}
        <small className="work-origin">{task.origin === "brain" ? (pt ? "Sugerida pelo Brain" : "Suggested by Brain") : (pt ? "Criada por você" : "Created by you")}</small>
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
        <WorkItemActions action={action} locale={locale} task={task} />
      </div>
    </article>
  );
}
