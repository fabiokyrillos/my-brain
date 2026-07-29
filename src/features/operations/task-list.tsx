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

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock3, Inbox, RotateCcw } from "lucide-react";
import type { WorkItemHumanState, WorkItemPriority, WorkItemView } from "@/features/daily-cycle/contracts";
import { isWorkSurfaceAction, type WorkSurfaceAction } from "@/features/task-commands/taxonomy";
import type { Locale } from "@/lib/preferences";
import { idleWorkItemActionState, type WorkItemActionState } from "./work-action-state";
import { getWorkActionsCopy } from "./work-actions-copy";

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

const actionIcon: Record<WorkSurfaceAction, typeof Check> = {
  complete_task: Check,
  wait_task: Clock3,
  resume_task: Clock3,
  reopen_task: RotateCcw,
};

export type WorkItemActionHandler = (
  state: WorkItemActionState,
  formData: FormData,
) => Promise<WorkItemActionState>;

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
  const copy = getWorkActionsCopy(locale);
  const router = useRouter();
  const result = useRef<HTMLDivElement | null>(null);

  /**
   * The operation keys, one per **(row, action)** pair (2F-SURFACE-006).
   *
   * Held in a ref and minted lazily, exactly as `quick-capture-form.tsx:33-40`
   * mints its idempotency key — **never in the render body**, where every
   * re-render would re-mint: `useActionState`'s pending→settled transition is a
   * re-render, and StrictMode double-renders in development.
   *
   * Scoped per action rather than per row because one key carrying two different
   * request fingerprints is refused with `2E_IDEMPOTENCY_MISMATCH` — a
   * legitimate second action on the same row would fail for a reason the user
   * cannot see or act on.
   */
  const keys = useRef<Map<WorkSurfaceAction, string>>(new Map());
  function operationKeyFor(id: WorkSurfaceAction): string {
    const existing = keys.current.get(id);
    if (existing !== undefined) return existing;
    const minted = crypto.randomUUID();
    keys.current.set(id, minted);
    return minted;
  }

  async function submit(state: WorkItemActionState, formData: FormData): Promise<WorkItemActionState> {
    const clicked = formData.get("action");
    if (!isWorkSurfaceAction(clicked)) return state;
    // Carried into the request at submit time and **never rendered into
    // markup**: a hidden input holding a client-minted uuid would not match the
    // value the server rendered, and React would report a hydration mismatch on
    // every row.
    formData.set("operationKey", operationKeyFor(clicked));
    const next = await action(state, formData);
    // Rotated after **every** terminal outcome, not only success. A refused
    // apply raises inside `apply_task_command`, which aborts the transaction and
    // rolls back the operation-key reservation — so no key is ever burned by a
    // refusal and reuse would also be safe. Rotating unconditionally is the
    // simpler invariant to hold.
    if (next.status !== "idle") keys.current.delete(clicked);
    return next;
  }

  const [state, formAction, pending] = useActionState(submit, idleWorkItemActionState);

  // Focus lands on the outcome after every round, so a keyboard or screen-reader
  // user is told what happened instead of being left on a button whose label no
  // longer describes the row. `tabIndex={-1}` makes the region programmatically
  // focusable without adding it to the tab order — `command-console.tsx:192-198`.
  useEffect(() => {
    if (state.status !== "idle") result.current?.focus();
  }, [state]);

  return (
    <article className="list-row">
      <div className="list-row-main">
        <strong>{task.title}</strong>
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

        {/*
          One polite live region per row, announcing the pending phrase while a
          round is in flight and the outcome once it settles. `aria-busy` is what
          tells a screen reader the region is mid-update rather than empty —
          `command-console.tsx:216-224`.
        */}
        <div aria-atomic="true" aria-busy={pending} aria-live="polite" className="sr-only" role="status">
          {pending ? copy.pendingAnnouncement : state.announcement}
        </div>

        <div className="row-actions">
          {task.availableActions.flatMap((available) => {
            // 2F-SURFACE-009: the projection derives availability from the task's
            // status and the taxonomy decides eligibility for that status; a
            // button rendered outside its declared eligible statuses would be
            // offering a refusal.
            if (!isWorkSurfaceAction(available.id)) return [];
            const Icon = actionIcon[available.id];
            // One form per action, all sharing this row's single
            // `useActionState`. Every field the action reads is a hidden input,
            // so nothing depends on which element submitted — **except the
            // operation key, which is never rendered** and is set on the
            // FormData at submit time instead.
            return [
              <form action={formAction} key={available.id}>
                <input type="hidden" name="taskId" value={task.taskId} />
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="title" value={task.title} />
                <input type="hidden" name="action" value={available.id} />
                <button className="row-action" disabled={pending} type="submit">
                  <Icon size={13} /> {copy.actions[available.id]}
                </button>
              </form>,
            ];
          })}
        </div>

        {state.status === "idle" ? null : (
          <div
            aria-label={copy.resultRegionLabel}
            className="work-action-result"
            ref={result}
            // A named landmark rather than a bare `div`: a screen-reader user can
            // navigate back to the answer after moving away from it.
            role="region"
            tabIndex={-1}
          >
            <strong>{state.heading}</strong>
            <p>{state.detail}</p>
            {state.title === null ? null : <p className="work-action-title">{state.title}</p>}
            {state.refreshable && (
              <button className="row-action" onClick={() => router.refresh()} type="button">
                {copy.refresh}
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
