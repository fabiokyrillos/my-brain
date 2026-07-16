"use client";

import { useActionState, useState } from "react";
import { Check, LoaderCircle, RotateCcw } from "lucide-react";
import type { TaskCandidate } from "@/lib/ai/extraction-schema";

export type ConfirmTasksState = {
  status: "idle" | "success" | "error";
  message: string;
  undoId: string | null;
};

export type ConfirmTasksAction = (
  state: ConfirmTasksState,
  formData: FormData,
) => Promise<ConfirmTasksState>;

export type UndoTasksState = {
  status: "idle" | "success" | "error";
  message: string;
};

export type UndoTasksAction = (
  state: UndoTasksState,
  formData: FormData,
) => Promise<UndoTasksState>;

const idleConfirmState: ConfirmTasksState = { status: "idle", message: "", undoId: null };
const idleUndoState: UndoTasksState = { status: "idle", message: "" };

function formatDueDate(value: string | null, locale: "pt-BR" | "en") {
  if (!value) return null;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function UndoButton({
  action,
  locale,
  undoId,
}: {
  action?: UndoTasksAction;
  locale: "pt-BR" | "en";
  undoId: string;
}) {
  const fallbackAction: UndoTasksAction = async () => ({
    status: "error",
    message: locale === "pt-BR" ? "Não foi possível desfazer." : "Could not undo.",
  });
  const [state, formAction, pending] = useActionState(action ?? fallbackAction, idleUndoState);
  const pt = locale === "pt-BR";

  return (
    <form action={formAction} className="undo-action">
      <input type="hidden" name="undoId" value={undoId} />
      <button type="submit" disabled={pending} className="button-secondary">
        {pending ? <LoaderCircle className="spin" size={16} /> : <RotateCcw size={16} />}
        {pending ? (pt ? "Desfazendo…" : "Undoing…") : (pt ? "Desfazer criação" : "Undo creation")}
      </button>
      {state.status !== "idle" && (
        <span role={state.status === "success" ? "status" : "alert"}>{state.message}</span>
      )}
    </form>
  );
}

export function TaskCandidateForm({
  action,
  candidates,
  entryId,
  initialState = idleConfirmState,
  locale,
  undoAction,
}: {
  action: ConfirmTasksAction;
  candidates: TaskCandidate[];
  entryId: string;
  initialState?: ConfirmTasksState;
  locale: "pt-BR" | "en";
  undoAction?: UndoTasksAction;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [selected, setSelected] = useState(() => candidates.map((_, index) => index));
  const pt = locale === "pt-BR";

  if (state.status === "success") {
    return (
      <div className="confirmation-result">
        <p role="status"><Check size={17} />{state.message}</p>
        {state.undoId && <UndoButton action={undoAction} locale={locale} undoId={state.undoId} />}
      </div>
    );
  }

  return (
    <form action={formAction} className="candidate-form">
      <input type="hidden" name="entryId" value={entryId} />
      <div className="candidate-list">
        {candidates.map((candidate, index) => {
          const checked = selected.includes(index);
          return (
            <label className="candidate-item" key={`${candidate.title}-${index}`}>
              <input
                type="checkbox"
                name="candidateIndex"
                value={index}
                checked={checked}
                onChange={() => setSelected((current) => checked
                  ? current.filter((value) => value !== index)
                  : [...current, index])}
              />
              <span className="candidate-check"><Check size={14} /></span>
              <span className="candidate-copy">
                <strong>{candidate.title}</strong>
                {candidate.description && <small>{candidate.description}</small>}
                {candidate.dueAt && <small>{pt ? "Prazo" : "Due"}: {formatDueDate(candidate.dueAt, locale)}</small>}
              </span>
              <span className="confidence-pill">{Math.round(candidate.confidence * 100)}%</span>
            </label>
          );
        })}
      </div>
      {state.status === "error" && <p className="form-error" role="alert">{state.message}</p>}
      <button type="submit" disabled={pending || selected.length === 0} className="button-primary">
        {pending && <LoaderCircle className="spin" size={17} />}
        {pending
          ? (pt ? "Criando…" : "Creating…")
          : pt
            ? `Criar ${selected.length} ${selected.length === 1 ? "tarefa" : "tarefas"}`
            : `Create ${selected.length} ${selected.length === 1 ? "task" : "tasks"}`}
      </button>
    </form>
  );
}
