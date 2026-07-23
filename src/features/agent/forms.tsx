"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { BellPlus, FileUp, LoaderCircle, Sparkles, Undo2 } from "lucide-react";

export type AgentFormState = { status: "idle" | "success" | "error"; message: string };
export type AgentFormAction = (state: AgentFormState, formData: FormData) => Promise<AgentFormState>;
const idleState: AgentFormState = { status: "idle", message: "" };

function Feedback({ state }: { state: AgentFormState }) {
  return state.status === "idle" ? null : <span className="inline-create-feedback" role={state.status === "success" ? "status" : "alert"}>{state.message}</span>;
}

export function ReminderForm({ action, locale }: { action: AgentFormAction; locale: "pt-BR" | "en" }) {
  const [state, formAction, pending] = useActionState(action, idleState);const pt=locale==="pt-BR";
  return <div><form action={formAction} className="stacked-create"><input type="hidden" name="locale" value={locale}/><label>{pt?"Lembrete":"Reminder"}<input name="title" required maxLength={500}/></label><label>{pt?"Quando":"When"}<input name="remindAt" type="datetime-local" required/></label><label className="inline-check"><input name="important" type="checkbox"/> {pt?"Importante":"Important"}</label><button type="submit" disabled={pending}>{pending?<LoaderCircle className="spin" size={16}/>:<BellPlus size={16}/>} {pt?"Criar lembrete":"Create reminder"}</button></form><Feedback state={state}/></div>;
}

// Phase 2D Slice 2D.1 — question resolution action contract.
// Stable application codes mapped from the versioned resolution RPC; raw SQL
// text never reaches this boundary.
export type QuestionResolutionCode =
  | "validation_error"
  | "session_expired"
  | "stale_interpretation"
  | "not_open"
  | "idempotency_mismatch"
  | "retryable_failure"
  | "resolution_succeeded";

export type QuestionResolutionState = {
  status: "idle" | "success" | "error";
  code: QuestionResolutionCode | null;
  message: string;
  undoId: string | null;
  replayed: boolean;
  retryable: boolean;
};

export type QuestionResolutionAction = (
  state: QuestionResolutionState,
  formData: FormData,
) => Promise<QuestionResolutionState>;

export type QuestionUndoState = { status: "idle" | "success" | "error"; message: string };
export type QuestionUndoAction = (
  state: QuestionUndoState,
  formData: FormData,
) => Promise<QuestionUndoState>;

const idleQuestionResolutionState: QuestionResolutionState = {
  status: "idle",
  code: null,
  message: "",
  undoId: null,
  replayed: false,
  retryable: false,
};
const idleQuestionUndoState: QuestionUndoState = { status: "idle", message: "" };

const questionResolutionCopy = {
  "pt-BR": {
    answerLabel: "Resposta",
    placeholder: "Sua resposta…",
    submit: "Responder",
    submitting: "Enviando resposta…",
    undo: "Desfazer resposta",
    undoing: "Desfazendo…",
  },
  en: {
    answerLabel: "Answer",
    placeholder: "Your answer…",
    submit: "Answer",
    submitting: "Sending answer…",
    undo: "Undo answer",
    undoing: "Undoing…",
  },
} as const;

export function QuestionAnswerForm({ action, undoAction, locale, questionId }: {
  action: QuestionResolutionAction;
  undoAction: QuestionUndoAction;
  locale: "pt-BR" | "en";
  questionId: string;
}) {
  const [state, formAction, pending] = useActionState(action, idleQuestionResolutionState);
  const [undoState, undoFormAction, undoPending] = useActionState(undoAction, idleQuestionUndoState);
  const copy = questionResolutionCopy[locale];
  // The operation key survives retryable resubmissions of the same answer so
  // the database replays deterministically; it rotates when the answer text
  // changes and after a successful undo, so a fresh intent never collides
  // with a consumed key.
  const operationKeyRef = useRef<string | null>(null);
  if (operationKeyRef.current == null) operationKeyRef.current = crypto.randomUUID();
  const lastSubmittedAnswerRef = useRef<string | null>(null);
  // Controlled so a failed submission keeps the typed answer editable —
  // React resets uncontrolled fields after every form action.
  const [answer, setAnswer] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const undoFeedbackRef = useRef<HTMLParagraphElement>(null);
  const [undoneUndoId, setUndoneUndoId] = useState<string | null>(null);

  const submit = (formData: FormData) => {
    const answer = String(formData.get("answer") ?? "").trim();
    if (lastSubmittedAnswerRef.current !== null && lastSubmittedAnswerRef.current !== answer) {
      operationKeyRef.current = crypto.randomUUID();
    }
    lastSubmittedAnswerRef.current = answer;
    const operationKey = operationKeyRef.current ?? crypto.randomUUID();
    operationKeyRef.current = operationKey;
    formData.set("operationKey", operationKey);
    formAction(formData);
  };

  useEffect(() => {
    if (state.status === "error" && state.code === "validation_error") {
      inputRef.current?.focus();
    } else if (state.status !== "idle") {
      feedbackRef.current?.focus();
    }
  }, [state]);

  const undoSubmit = (formData: FormData) => {
    // The next answer is a fresh intent: remember which undo this was, rotate
    // the key, and clear the field before dispatching the compensating
    // operation. Tracking the undo id keeps a later re-answer (with its own
    // new undo id) fully undoable again.
    setUndoneUndoId(String(formData.get("undoId") ?? ""));
    operationKeyRef.current = crypto.randomUUID();
    lastSubmittedAnswerRef.current = null;
    setAnswer("");
    undoFormAction(formData);
  };

  useEffect(() => {
    if (undoState.status === "idle") return;
    undoFeedbackRef.current?.focus();
  }, [undoState]);

  const undone = undoState.status === "success"
    && state.status === "success"
    && state.undoId != null
    && state.undoId === undoneUndoId;
  const answered = state.status === "success" && !undone;
  const errorId = `question-answer-error-${questionId}`;
  const isFieldError = state.status === "error" && state.code === "validation_error";
  const visibleState = answered
    ? "answered"
    : pending
      ? "submitting"
      : state.status === "error"
        ? state.code ?? "error"
        : "editing";

  return (
    <div className="question-answer" data-state={visibleState}>
      {answered ? null : (
        <form action={submit} className="question-answer-form">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="questionId" value={questionId} />
          <input
            ref={inputRef}
            name="answer"
            required
            maxLength={4000}
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            aria-label={copy.answerLabel}
            placeholder={copy.placeholder}
            aria-invalid={isFieldError || undefined}
            aria-describedby={isFieldError ? errorId : undefined}
          />
          <button type="submit" disabled={pending}>
            {pending ? <LoaderCircle className="spin" size={16} /> : null} {pending ? copy.submitting : copy.submit}
          </button>
        </form>
      )}
      <p aria-live="polite" className="sr-only">{pending ? copy.submitting : ""}</p>
      {state.status === "idle" || (state.status === "success" && undone) ? null : (
        <p
          ref={feedbackRef}
          tabIndex={-1}
          id={isFieldError ? errorId : undefined}
          className="inline-create-feedback"
          role={state.status === "success" ? "status" : "alert"}
        >
          {state.message}
        </p>
      )}
      {answered && state.undoId ? (
        <form action={undoSubmit} className="question-undo-form">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="questionId" value={questionId} />
          <input type="hidden" name="undoId" value={state.undoId} />
          <button type="submit" disabled={undoPending}>
            {undoPending ? <LoaderCircle className="spin" size={16} /> : <Undo2 size={16} />} {undoPending ? copy.undoing : copy.undo}
          </button>
        </form>
      ) : null}
      {undoState.status === "error" || undone ? (
        <p
          ref={undoFeedbackRef}
          tabIndex={-1}
          className="inline-create-feedback"
          role={undoState.status === "success" ? "status" : "alert"}
        >
          {undoState.message}
        </p>
      ) : null}
    </div>
  );
}

export function UploadForm({ action, locale }: { action: AgentFormAction; locale: "pt-BR" | "en" }) {
  const [state, formAction, pending] = useActionState(action, idleState);const pt=locale==="pt-BR";
  return <div><form action={formAction} className="upload-form"><input type="hidden" name="locale" value={locale}/><label><FileUp size={25}/><span>{pt?"Imagem, PDF, documento ou planilha":"Image, PDF, document, or spreadsheet"}</span><small>{pt?"Privado · até 25 MB":"Private · up to 25 MB"}</small><input name="file" type="file" required accept="image/jpeg,image/png,image/webp,application/pdf,text/plain,text/csv,.docx,.xlsx"/></label><button type="submit" disabled={pending}>{pending?<LoaderCircle className="spin" size={16}/>:<FileUp size={16}/>} {pt?"Enviar arquivo":"Upload file"}</button></form><Feedback state={state}/></div>;
}

const jobRetryLabels = {
  "pt-BR": { idle: "Tentar novamente", pending: "Tentando…" },
  en: { idle: "Try again", pending: "Retrying…" },
} as const;

export function JobRetryForm({ action, locale, jobId }: { action: AgentFormAction; locale: "pt-BR" | "en"; jobId: string }) {
  const [state, formAction, pending] = useActionState(action, idleState);
  const labels = jobRetryLabels[locale];
  return <div><form action={formAction} className="job-retry-form"><input type="hidden" name="locale" value={locale}/><input type="hidden" name="jobId" value={jobId}/><button type="submit" disabled={pending}>{pending?<LoaderCircle className="spin" size={16}/>:null} {pending?labels.pending:labels.idle}</button></form><Feedback state={state}/></div>;
}

export function ReviewButton({ action, locale, period }: { action: AgentFormAction; locale: "pt-BR" | "en"; period: "daily" | "weekly_review" | "weekly_plan" | "monthly" }) {
  const [state, formAction, pending] = useActionState(action, idleState);const pt=locale==="pt-BR";const labels={daily:pt?"Resumo do dia":"Daily summary",weekly_review:pt?"Revisão da semana":"Weekly review",weekly_plan:pt?"Planejar a semana":"Plan the week",monthly:pt?"Revisão do mês":"Monthly review"};
  return <div className="review-action"><form action={formAction}><input type="hidden" name="locale" value={locale}/><input type="hidden" name="period" value={period}/><button type="submit" disabled={pending}>{pending?<LoaderCircle className="spin" size={16}/>:<Sparkles size={16}/>} {labels[period]}</button></form><Feedback state={state}/></div>;
}
