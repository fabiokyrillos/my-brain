"use client";

/**
 * The cancelled-task recovery surface (PRD 2E-DESTRUCTIVE-006).
 *
 * "A cancelled task remains reachable through an explicit affordance, and
 * `restore_task` is offered there, so a confirmed action's result is observable
 * and escapable." PRD §3.3 consequence 3 is why: once the 24-hour undo window
 * closes, `restore_task` is the only exit from `cancelled`, and this is where a
 * user who cannot remember the task's exact wording finds it.
 *
 * Restoring is two deliberate steps, not one. The button submits `restore`,
 * which returns a **preview** — `restore_task` is not one-step eligible — and
 * the Apply control inside `TaskCommandResult` performs the write. That is the
 * same deliberateness cancelling required, which is exactly what the taxonomy
 * says it should be.
 *
 * The listing itself comes from `list_task_command_candidates`, so a task whose
 * creation was undone never appears here (2E-DESTRUCTIVE-009). This component
 * renders what it is given and decides nothing about eligibility.
 */

import { useActionState } from "react";

import type { Locale } from "@/lib/preferences";

import type { TaskCommandConsoleState } from "./console-state";
import { TaskCommandResult, idleConsoleState, type TaskCommandAction } from "./command-console";
import { getTaskCommandCopy } from "./copy";
import type { CancelledTaskView } from "./recovery";

export function CancelledTasksView({
  action,
  locale,
  tasks,
  hasMore,
}: {
  action: TaskCommandAction;
  locale: Locale;
  tasks: readonly CancelledTaskView[];
  hasMore: boolean;
}) {
  const [state, formAction, pending] = useActionState<TaskCommandConsoleState, FormData>(
    action,
    idleConsoleState,
  );
  const copy = getTaskCommandCopy(locale);

  return (
    <div className="content-page task-command-recovery">
      <header className="list-header">
        <div>
          <p className="eyebrow">{copy.recovery.eyebrow}</p>
          <h1>{copy.recovery.title}</h1>
          <p>{copy.recovery.description}</p>
        </div>
      </header>

      {tasks.length === 0 ? (
        <p className="task-command-recovery-empty">{copy.recovery.empty}</p>
      ) : (
        <section aria-label={copy.recovery.title}>
          {tasks.map((task) => (
            <form action={formAction} className="list-row" key={task.taskId}>
              <input name="locale" type="hidden" value={locale} />
              <input name="origin" type="hidden" value="work" />
              <input name="taskId" type="hidden" value={task.taskId} />
              {/*
                The title travels back so the command can be built from it
                without a model. It is the user's own data, already rendered on
                this page, and the database re-derives ownership regardless.
              */}
              <input name="taskTitle" type="hidden" value={task.title} />
              <div className="list-row-main">
                <strong>{task.title}</strong>
                <p className="task-command-recovery-meta">
                  {task.cancelledAt === null
                    ? null
                    : `${copy.recovery.cancelledAtLabel}: ${task.cancelledAt}`}
                  {task.dueAt === null ? null : ` · ${copy.recovery.dueAtLabel}: ${task.dueAt}`}
                  {task.projectNames.length === 0 ? null : ` · ${task.projectNames.join(", ")}`}
                </p>
              </div>
              <button
                className="task-command-secondary"
                disabled={pending}
                name="intent"
                type="submit"
                value="restore"
              >
                {copy.recovery.restore}
              </button>
            </form>
          ))}
        </section>
      )}

      {hasMore ? <p className="task-command-recovery-meta">{copy.recovery.hasMore}</p> : null}

      <TaskCommandResult
        formAction={formAction}
        locale={locale}
        origin="work"
        pending={pending}
        state={state}
      />
    </div>
  );
}
