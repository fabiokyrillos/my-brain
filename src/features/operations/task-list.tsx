import { randomUUID } from "node:crypto";
import { Check, Clock3, Inbox, RotateCcw } from "lucide-react";
import type { WorkItemHumanState, WorkItemPriority, WorkItemView } from "@/features/daily-cycle/contracts";
import type { Locale } from "@/lib/preferences";
import { applyWorkItemAction } from "./actions";

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

const actionCopy = {
  complete_task: { pt: "Concluir", en: "Complete", icon: Check },
  wait_task: { pt: "Aguardar", en: "Wait", icon: Clock3 },
  resume_task: { pt: "Retomar", en: "Resume", icon: Clock3 },
  reopen_task: { pt: "Reabrir", en: "Reopen", icon: RotateCcw },
} as const;

export function TaskList({
  emptyHint,
  locale,
  tasks,
  timezone,
}: {
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
        <article className="list-row" key={task.taskId}>
          <div className="list-row-main">
            <strong>{task.title}</strong>
            {task.description && <p>{task.description}</p>}
            <small className="work-origin">{task.origin === "brain" ? (pt ? "Sugerida pelo Brain" : "Suggested by Brain") : (pt ? "Criada por você" : "Created by you")}</small>
            {(task.projects.length > 0 || task.contexts.length > 0 || task.people.length > 0 || task.waitingOnPeople.length > 0) && (
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
            <div className="row-actions">
              {task.availableActions.flatMap((action) => {
                if (!(action.id in actionCopy)) return [];
                const copy = actionCopy[action.id as keyof typeof actionCopy];
                const Icon = copy.icon;
                return [<form action={applyWorkItemAction} key={action.id}>
                  <input type="hidden" name="taskId" value={task.taskId} />
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="action" value={action.id} />
                  <input type="hidden" name="operationKey" value={randomUUID()} />
                  <button className="row-action" type="submit"><Icon size={13} /> {copy[pt ? "pt" : "en"]}</button>
                </form>];
              })}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
