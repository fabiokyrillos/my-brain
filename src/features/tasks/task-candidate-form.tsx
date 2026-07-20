"use client";

import { useActionState, useRef, useState } from "react";
import { Check, LoaderCircle, RotateCcw } from "lucide-react";
import type { ActionableCandidateView } from "@/features/daily-cycle/contracts";
import { TaskCandidatesPresented } from "@/features/product-analytics/interaction-events";
import {
  normalizeCandidateEdits,
  serializeCandidateEdits,
  type CandidateEditCommand,
  type CandidateEditSuggestion,
} from "./candidate-edit-contract";
import { CandidateEditor } from "./candidate-editor";

export type ConfirmTasksCode =
  | "confirmed"
  | "validation_failed"
  | "unauthenticated"
  | "stale_interpretation"
  | "confirmation_contended"
  | "idempotency_mismatch"
  | "already_materialized"
  | "invalid_payload"
  | "record_only"
  | "not_found"
  | "operation_failed";

export type ConfirmTasksState = {
  status: "idle" | "success" | "error";
  code?: ConfirmTasksCode;
  message: string;
  undoId: string | null;
  replayed?: boolean;
  retryable?: boolean;
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

const idleConfirmState: ConfirmTasksState = {
  status: "idle",
  message: "",
  undoId: null,
};
const idleUndoState: UndoTasksState = { status: "idle", message: "" };

const formCopy = {
  "pt-BR": {
    invalidEdits: "Revise as edições antes de criar as tarefas.",
    operationFailed: "Não foi possível criar as tarefas agora.",
  },
  en: {
    invalidEdits: "Review the edits before creating the tasks.",
    operationFailed: "The tasks could not be created right now.",
  },
} as const;

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
  const [state, formAction, pending] = useActionState(
    action ?? fallbackAction,
    idleUndoState,
  );
  const pt = locale === "pt-BR";

  return (
    <form action={formAction} className="undo-action">
      <input type="hidden" name="undoId" value={undoId} />
      <input type="hidden" name="locale" value={locale} />
      <button type="submit" disabled={pending} className="button-secondary">
        {pending
          ? <LoaderCircle className="spin" size={16} />
          : <RotateCcw size={16} />}
        {pending
          ? (pt ? "Desfazendo…" : "Undoing…")
          : (pt ? "Desfazer criação" : "Undo creation")}
      </button>
      {state.status !== "idle" && (
        <span role={state.status === "success" ? "status" : "alert"}>
          {state.message}
        </span>
      )}
    </form>
  );
}

export function TaskCandidateForm({
  action,
  candidates,
  entryId,
  initialState = idleConfirmState,
  interpretationId,
  locale,
  operationKey,
  timezone,
  undoAction,
}: {
  action: ConfirmTasksAction;
  candidates: readonly ActionableCandidateView[];
  entryId: string;
  initialState?: ConfirmTasksState;
  interpretationId: string;
  locale: "pt-BR" | "en";
  operationKey: string;
  timezone: string;
  undoAction?: UndoTasksAction;
}) {
  const [selected, setSelected] = useState(() => (
    candidates.map((candidate) => Number(candidate.key)).sort((left, right) => left - right)
  ));
  const [editsByIndex, setEditsByIndex] = useState<ReadonlyMap<number, CandidateEditCommand>>(
    () => new Map(),
  );
  const [invalidIndexes, setInvalidIndexes] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  const operationKeyRef = useRef(operationKey);
  const submittedPayloadSignatureRef = useRef<string | null>(null);
  const localized = formCopy[locale];
  const pt = locale === "pt-BR";

  async function submitTasks(
    previousState: ConfirmTasksState,
    formData: FormData,
  ): Promise<ConfirmTasksState> {
    const selectedCandidateIndexes = [...selected].sort((left, right) => left - right);

    if (
      selectedCandidateIndexes.length === 0
      || selectedCandidateIndexes.some((candidateIndex) => invalidIndexes.has(candidateIndex))
    ) {
      return localValidationFailure(localized.invalidEdits);
    }

    try {
      const selectedIndexSet = new Set(selectedCandidateIndexes);
      const candidateEdits = [...editsByIndex.values()].filter((edit) => (
        selectedIndexSet.has(edit.candidateIndex)
      ));
      const canonical = normalizeCandidateEdits({
        edits: candidateEdits,
        selectedCandidateIndexes,
        suggestions: candidates.map(toEditSuggestion),
      });
      const serializedEdits = serializeCandidateEdits(canonical.edits);
      const payloadSignature = JSON.stringify([
        selectedCandidateIndexes,
        serializedEdits,
      ]);

      if (
        submittedPayloadSignatureRef.current !== null
        && submittedPayloadSignatureRef.current !== payloadSignature
      ) {
        operationKeyRef.current = crypto.randomUUID();
      }
      submittedPayloadSignatureRef.current = payloadSignature;

      formData.delete("candidateIndex");
      for (const candidateIndex of selectedCandidateIndexes) {
        formData.append("candidateIndex", String(candidateIndex));
      }
      formData.set("candidateEdits", serializedEdits);
      formData.set("operationKey", operationKeyRef.current);
      formData.set("locale", locale);

      const result = await action(previousState, formData);
      if (result.status === "success") {
        operationKeyRef.current = crypto.randomUUID();
        submittedPayloadSignatureRef.current = null;
      }
      return result;
    } catch {
      return {
        status: "error",
        code: "operation_failed",
        message: localized.operationFailed,
        undoId: null,
        retryable: true,
      };
    }
  }

  const [state, formAction, pending] = useActionState(submitTasks, initialState);

  function updateEdit(candidateIndex: number, edit: CandidateEditCommand | null) {
    setEditsByIndex((current) => {
      const next = new Map(current);
      if (edit) {
        next.set(candidateIndex, edit);
      } else {
        next.delete(candidateIndex);
      }
      return next;
    });
  }

  function updateValidity(candidateIndex: number, valid: boolean) {
    setInvalidIndexes((current) => {
      const next = new Set(current);
      if (valid) {
        next.delete(candidateIndex);
      } else {
        next.add(candidateIndex);
      }
      return next;
    });
  }

  if (state.status === "success") {
    return (
      <div className="confirmation-result">
        <p role="status"><Check size={17} />{state.message}</p>
        {state.undoId && (
          <UndoButton action={undoAction} locale={locale} undoId={state.undoId} />
        )}
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div className="no-action-state">
        <Check size={22} />
        <strong>
          {pt
            ? "Nenhuma sugestão pendente para confirmar."
            : "No pending suggestion to confirm."}
        </strong>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      aria-busy={pending}
      aria-describedby={state.status === "error" ? "candidate-form-error" : undefined}
      className="candidate-form"
    >
      <TaskCandidatesPresented
        candidateCount={candidates.length}
        entryId={entryId}
        interpretationId={interpretationId}
        locale={locale}
      />
      <input type="hidden" name="entryId" value={entryId} />
      <input type="hidden" name="interpretationId" value={interpretationId} />
      <input type="hidden" name="locale" value={locale} />
      <div className="candidate-list">
        {candidates.map((candidate) => {
          const index = Number(candidate.key);
          const checked = selected.includes(index);

          return (
            <div
              key={candidate.key}
              style={{ display: "grid", gap: 9 }}
            >
              <label className="candidate-item">
                <input
                  type="checkbox"
                  name="candidateIndex"
                  value={index}
                  checked={checked}
                  disabled={pending}
                  onChange={() => setSelected((current) => (
                    checked
                      ? current.filter((value) => value !== index)
                      : [...current, index].sort((left, right) => left - right)
                  ))}
                />
                <span className="candidate-check"><Check size={14} /></span>
                <span className="candidate-copy">
                  <strong>{candidate.title}</strong>
                  {candidate.description && <small>{candidate.description}</small>}
                  {candidate.dueAt && (
                    <small>
                      {pt ? "Prazo" : "Due"}: {formatDueDate(candidate.dueAt, locale)}
                    </small>
                  )}
                </span>
              </label>
              <CandidateEditor
                candidate={candidate}
                locale={locale}
                onEditChange={(edit) => updateEdit(index, edit)}
                onValidityChange={(valid) => updateValidity(index, valid)}
                selected={checked && !pending}
                timezone={timezone}
              />
            </div>
          );
        })}
      </div>
      {state.status === "error" && (
        <p className="form-error" id="candidate-form-error" role="alert">
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || selected.length === 0}
        className="button-primary"
      >
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

function toEditSuggestion(candidate: ActionableCandidateView): CandidateEditSuggestion {
  return {
    candidateIndex: Number(candidate.key),
    title: candidate.title,
    description: candidate.description ?? null,
    dueAt: candidate.dueAt ?? null,
  };
}

function localValidationFailure(message: string): ConfirmTasksState {
  return {
    status: "error",
    code: "validation_failed",
    message,
    undoId: null,
    retryable: false,
  };
}
