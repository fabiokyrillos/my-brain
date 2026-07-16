import { Check, Clock3, Inbox, RotateCcw } from "lucide-react";
import type { Locale } from "@/lib/preferences";
import { updateTaskStatus } from "./actions";

export type TaskRecord = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  due_at: string | null;
  created_by: string;
};

const statusPt: Record<string, string> = {
  inbox: "entrada", todo: "a fazer", in_progress: "em andamento", waiting: "aguardando",
  blocked: "bloqueada", deferred: "adiada", completed: "concluída", cancelled: "cancelada",
};

export function TaskList({ emptyHint, locale, tasks }: { emptyHint: string; locale: Locale; tasks: TaskRecord[] }) {
  const pt = locale === "pt-BR";
  if (tasks.length === 0) {
    return <div className="empty-list"><Inbox size={30} /><strong>{pt ? "Tudo em ordem" : "All clear"}</strong><p>{emptyHint}</p></div>;
  }

  return (
    <div className="list-stack">
      {tasks.map((task) => (
        <article className="list-row" key={task.id}>
          <div className="list-row-main">
            <strong>{task.title}</strong>
            <p>{task.description ?? (task.created_by === "agent" ? (pt ? "Sugerida pelo Brain" : "Suggested by Brain") : (pt ? "Criada por você" : "Created by you"))}</p>
          </div>
          <div className="list-meta">
            {task.due_at && <span>{new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(task.due_at))}</span>}
            <span className={`status-badge ${task.status}`}>{pt ? statusPt[task.status] ?? task.status : task.status.replaceAll("_", " ")}</span>
            <div className="row-actions">
              {task.status !== "completed" ? (
                <>
                  <form action={updateTaskStatus}>
                    <input type="hidden" name="taskId" value={task.id} /><input type="hidden" name="locale" value={locale} /><input type="hidden" name="status" value="completed" />
                    <button className="row-action" type="submit"><Check size={13} /> {pt ? "Concluir" : "Complete"}</button>
                  </form>
                  <form action={updateTaskStatus}>
                    <input type="hidden" name="taskId" value={task.id} /><input type="hidden" name="locale" value={locale} /><input type="hidden" name="status" value={task.status === "waiting" ? "todo" : "waiting"} />
                    <button className="row-action" type="submit"><Clock3 size={13} /> {task.status === "waiting" ? (pt ? "Retomar" : "Resume") : (pt ? "Aguardar" : "Wait")}</button>
                  </form>
                </>
              ) : (
                <form action={updateTaskStatus}>
                  <input type="hidden" name="taskId" value={task.id} /><input type="hidden" name="locale" value={locale} /><input type="hidden" name="status" value="todo" />
                  <button className="row-action" type="submit"><RotateCcw size={13} /> {pt ? "Reabrir" : "Reopen"}</button>
                </form>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
