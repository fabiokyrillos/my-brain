"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { BellPlus, CalendarClock, CircleOff, EyeOff, FileUp, LoaderCircle, RefreshCcw, Sparkles, Undo2 } from "lucide-react";
import { formatInstantForDateTimeLocal, localDateTimeToOffsetInstant } from "@/features/tasks/candidate-due-date";
import type { QuestionConsequence } from "./question-resolution-contract";
import type { QuestionSuggestion } from "./question-suggestions";

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

// Phase 2D — question resolution action contract (Slice 2D.1 answer; Slice
// 2D.2 adds the deferred/dismissed/not_relevant dispositions). Stable
// application codes mapped from the versioned resolution RPC; raw SQL text
// never reaches this boundary.
export type QuestionResolutionCode =
  | "validation_error"
  | "session_expired"
  | "stale_interpretation"
  | "not_open"
  | "idempotency_mismatch"
  | "consequence_unavailable"
  | "retryable_failure"
  | "resolution_succeeded";

export type QuestionResolutionOutcome = "answered" | "deferred" | "dismissed" | "not_relevant";

// Phase 2D Slice 2D.4 — the truthful, bounded outcome of the confirmed
// consequence. `none` means nothing beyond the resolution was applied.
export type QuestionConsequenceStatus = "none" | "reinterpretation_queued";

export type QuestionResolutionState = {
  status: "idle" | "success" | "error";
  code: QuestionResolutionCode | null;
  message: string;
  resolution: QuestionResolutionOutcome | null;
  snoozedUntil: string | null;
  consequence: QuestionConsequence | null;
  consequenceStatus: QuestionConsequenceStatus | null;
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
  resolution: null,
  snoozedUntil: null,
  consequence: null,
  consequenceStatus: null,
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
    deferToggle: "Adiar",
    deferLabel: "Adiar até",
    deferConfirm: "Confirmar adiamento",
    deferCancel: "Cancelar",
    suggestionsLabel: "Respostas sugeridas",
    suggestionsHint: "Sugestões vindas deste registro. Escolher uma preenche o campo — nada é enviado até você responder.",
    suggestionSelected: "Sugestão escolhida. Você ainda pode editar a resposta.",
    consequenceOpen: "Responder e reinterpretar",
    consequenceLabel: "Aplicar consequência: reinterpretar o registro",
    consequenceDescription:
      "Sua resposta será registrada e este registro entrará na fila para ser reinterpretado, gerando uma nova revisão da interpretação. Nenhuma interpretação anterior é apagada ou alterada.",
    consequenceNotice: "Nada foi aplicado ainda. Isto só acontece se você confirmar.",
    consequenceConfirm: "Confirmar e reinterpretar",
    consequenceSkip: "Pular consequência",
    consequenceApplying: "Registrando e enfileirando…",
    consequenceUndoHint: "Desfazer também cancela a reinterpretação enfileirada, se ela ainda não tiver começado.",
    deferInvalid: "Escolha uma data e hora futuras válidas.",
    deferring: "Adiando…",
    deferredUntil: (formatted: string) => `Pergunta adiada até ${formatted}.`,
    dismiss: "Descartar",
    dismissing: "Descartando…",
    notRelevant: "Não é relevante",
    markingNotRelevant: "Marcando…",
    undoLabels: {
      answered: "Desfazer resposta",
      deferred: "Desfazer adiamento",
      dismissed: "Desfazer descarte",
      not_relevant: "Desfazer marcação",
    },
    undoing: "Desfazendo…",
  },
  en: {
    answerLabel: "Answer",
    placeholder: "Your answer…",
    submit: "Answer",
    submitting: "Sending answer…",
    deferToggle: "Defer",
    deferLabel: "Defer until",
    deferConfirm: "Confirm deferral",
    deferCancel: "Cancel",
    suggestionsLabel: "Suggested answers",
    suggestionsHint: "Suggestions drawn from this record. Picking one fills the field — nothing is sent until you answer.",
    suggestionSelected: "Suggestion picked. You can still edit the answer.",
    consequenceOpen: "Answer and re-interpret",
    consequenceLabel: "Apply consequence: re-interpret this record",
    consequenceDescription:
      "Your answer will be recorded and this record will be queued for re-interpretation, producing a new interpretation revision. No earlier interpretation is deleted or changed.",
    consequenceNotice: "Nothing has been applied yet. This only happens if you confirm.",
    consequenceConfirm: "Confirm and re-interpret",
    consequenceSkip: "Skip consequence",
    consequenceApplying: "Recording and queueing…",
    consequenceUndoHint: "Undoing also cancels the queued re-interpretation, if it has not started yet.",
    deferInvalid: "Pick a valid future date and time.",
    deferring: "Deferring…",
    deferredUntil: (formatted: string) => `Question deferred until ${formatted}.`,
    dismiss: "Dismiss",
    dismissing: "Dismissing…",
    notRelevant: "Not relevant",
    markingNotRelevant: "Marking…",
    undoLabels: {
      answered: "Undo answer",
      deferred: "Undo deferral",
      dismissed: "Undo dismissal",
      not_relevant: "Undo mark",
    },
    undoing: "Undoing…",
  },
} as const;

// Wall-clock value (YYYY-MM-DDTHH:mm) for a datetime-local input, rendered in
// the persisted profile timezone via the shared Phase 2C conversion module.
function instantToDeferLocalValue(instantMs: number, timezone: string): string {
  const rounded = new Date(instantMs);
  rounded.setUTCSeconds(0, 0);
  const canonical = `${rounded.toISOString().slice(0, 19)}Z`;
  try {
    return formatInstantForDateTimeLocal(canonical, timezone);
  } catch {
    return "";
  }
}

type QuestionResolutionKind = "answer" | "deferred" | "dismissed" | "not_relevant";

export function QuestionAnswerForm({ action, undoAction, locale, questionId, timezone = "America/Sao_Paulo", suggestions = [], canReinterpret = false }: {
  action: QuestionResolutionAction;
  undoAction: QuestionUndoAction;
  locale: "pt-BR" | "en";
  questionId: string;
  timezone?: string;
  suggestions?: readonly QuestionSuggestion[];
  // Slice 2D.4 — offered only when the read-only effect preview says a
  // reinterpretation is genuinely possible (the question's interpretation is
  // still the entry's current one). When the preview is unavailable the
  // control is simply absent, so the flow degrades to the plain answer.
  canReinterpret?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, idleQuestionResolutionState);
  const [undoState, undoFormAction, undoPending] = useActionState(undoAction, idleQuestionUndoState);
  const copy = questionResolutionCopy[locale];
  // The operation key survives retryable resubmissions of the same resolution
  // so the database replays deterministically; it rotates when the submitted
  // payload (kind, answer text, or deferral instant) changes and after a
  // successful undo, so a fresh intent never collides with a consumed key.
  const operationKeyRef = useRef<string | null>(null);
  if (operationKeyRef.current == null) operationKeyRef.current = crypto.randomUUID();
  const lastSubmittedSignatureRef = useRef<string | null>(null);
  // Controlled so a failed submission keeps the typed answer editable —
  // React resets uncontrolled fields after every form action.
  const [answer, setAnswer] = useState("");
  // Slice 2D.3 — which presented suggestion the current answer came from. It
  // is a UI hint only: the server re-derives the deterministic options and
  // authenticates the attribution, so this can never forge provenance. It is
  // cleared deterministically the moment the answer stops matching the chip.
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<string | null>(null);
  const selectedSuggestion = suggestions.find((option) => option.id === selectedSuggestionId) ?? null;
  const [lastKind, setLastKind] = useState<QuestionResolutionKind>("answer");
  // Slice 2D.4 — the confirmed consequence. `consequenceOpen` only reveals a
  // read-only description plus an explicit confirmation control; it performs
  // no mutation, no enqueue, and no resolution. Only pressing the
  // confirmation button submits, and it submits `consequence=reinterpret`.
  const [consequenceOpen, setConsequenceOpen] = useState(false);
  const [lastConsequence, setLastConsequence] = useState<QuestionConsequence>("none");
  const consequenceConfirmRef = useRef<HTMLButtonElement>(null);
  const [deferOpen, setDeferOpen] = useState(false);
  const [deferValue, setDeferValue] = useState("");
  const [deferMin, setDeferMin] = useState("");
  const [deferLocalError, setDeferLocalError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const deferInputRef = useRef<HTMLInputElement>(null);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const undoFeedbackRef = useRef<HTMLParagraphElement>(null);
  const [undoneUndoId, setUndoneUndoId] = useState<string | null>(null);

  const dispatchResolution = (formData: FormData, kind: QuestionResolutionKind, signature: string) => {
    if (lastSubmittedSignatureRef.current !== null && lastSubmittedSignatureRef.current !== signature) {
      operationKeyRef.current = crypto.randomUUID();
    }
    lastSubmittedSignatureRef.current = signature;
    const operationKey = operationKeyRef.current ?? crypto.randomUUID();
    operationKeyRef.current = operationKey;
    formData.set("operationKey", operationKey);
    formData.set("kind", kind);
    setLastKind(kind);
    setDeferLocalError(false);
    formAction(formData);
  };

  const submitAnswer = (formData: FormData) => {
    const submitted = String(formData.get("answer") ?? "").trim();
    setLastConsequence("none");
    dispatchResolution(formData, "answer", `answer|none|${submitted}`);
  };

  // The only path that ever asks for a consequence. It is reachable only from
  // the confirmation panel's confirm button, and the operation-key signature
  // includes the consequence so an answer-only attempt and an
  // answer-plus-reinterpret attempt can never be conflated on replay.
  const submitAnswerWithReinterpretation = (formData: FormData) => {
    const submitted = String(formData.get("answer") ?? "").trim();
    formData.set("consequence", "reinterpret");
    setLastConsequence("reinterpret");
    dispatchResolution(formData, "answer", `answer|reinterpret|${submitted}`);
  };

  const submitDefer = (formData: FormData) => {
    setLastConsequence("none");
    const localValue = String(formData.get("snoozedUntilLocal") ?? "");
    let instant: string | null = null;
    try {
      instant = localDateTimeToOffsetInstant(localValue, timezone);
    } catch {
      instant = null;
    }
    if (!instant) {
      setDeferLocalError(true);
      deferInputRef.current?.focus();
      return;
    }
    formData.set("snoozedUntil", instant);
    dispatchResolution(formData, "deferred", `deferred|${instant}`);
  };

  const submitDismiss = (formData: FormData) => {
    setLastConsequence("none");
    dispatchResolution(formData, "dismissed", "dismissed");
  };

  const submitNotRelevant = (formData: FormData) => {
    setLastConsequence("none");
    dispatchResolution(formData, "not_relevant", "not_relevant");
  };

  // Picking a suggestion only fills the editable field and moves focus there.
  // It never submits, never resolves, and never writes analytics.
  const selectSuggestion = (suggestion: QuestionSuggestion) => {
    setAnswer(suggestion.value);
    setSelectedSuggestionId(suggestion.id);
    inputRef.current?.focus();
  };

  const changeAnswer = (value: string) => {
    setAnswer(value);
    // Deterministic invalidation, matching the server's canonical comparison:
    // an answer edited away from the chip is a typed answer again.
    if (selectedSuggestion && value.trim() !== selectedSuggestion.value) {
      setSelectedSuggestionId(null);
    }
  };

  // Opening the panel is a pure disclosure: it reads nothing, writes nothing,
  // and enqueues nothing. Focus lands on the confirmation control so the
  // keyboard path matches the pointer path.
  const openConsequence = () => {
    setConsequenceOpen(true);
    setDeferOpen(false);
  };

  useEffect(() => {
    if (consequenceOpen) consequenceConfirmRef.current?.focus();
  }, [consequenceOpen]);

  const skipConsequence = () => {
    setConsequenceOpen(false);
    inputRef.current?.focus();
  };

  const openDefer = () => {
    const now = Date.now();
    setDeferMin(instantToDeferLocalValue(now + 60_000, timezone));
    if (!deferValue) setDeferValue(instantToDeferLocalValue(now + 24 * 3_600_000, timezone));
    setDeferLocalError(false);
    setDeferOpen(true);
  };

  useEffect(() => {
    if (state.status === "error" && state.code === "validation_error") {
      if (lastKind === "deferred") deferInputRef.current?.focus();
      else if (lastKind === "answer") inputRef.current?.focus();
      else feedbackRef.current?.focus();
    } else if (state.status !== "idle") {
      feedbackRef.current?.focus();
    }
  }, [state, lastKind]);

  const undoSubmit = (formData: FormData) => {
    // The next resolution is a fresh intent: remember which undo this was,
    // rotate the key, and clear the editable state before dispatching the
    // compensating operation. Tracking the undo id keeps a later
    // re-resolution (with its own new undo id) fully undoable again.
    setUndoneUndoId(String(formData.get("undoId") ?? ""));
    operationKeyRef.current = crypto.randomUUID();
    lastSubmittedSignatureRef.current = null;
    setAnswer("");
    setSelectedSuggestionId(null);
    setConsequenceOpen(false);
    setLastConsequence("none");
    setDeferOpen(false);
    setDeferValue("");
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
  const resolved = state.status === "success" && !undone;
  const resolution: QuestionResolutionOutcome = state.resolution ?? "answered";
  const errorId = `question-answer-error-${questionId}`;
  const deferErrorId = `question-defer-error-${questionId}`;
  const suggestionsLabelId = `question-suggestions-label-${questionId}`;
  const suggestionsHintId = `question-suggestions-hint-${questionId}`;
  const consequenceLabelId = `question-consequence-label-${questionId}`;
  const consequenceDescriptionId = `question-consequence-description-${questionId}`;
  const trimmedAnswer = answer.trim();
  const isFieldError = state.status === "error" && state.code === "validation_error" && lastKind === "answer";
  const isDeferFieldError = deferLocalError
    || (state.status === "error" && state.code === "validation_error" && lastKind === "deferred");
  const visibleState = resolved
    ? resolution
    : pending
      ? "submitting"
      : state.status === "error"
        ? state.code ?? "error"
        : "editing";
  const submittingLabel = lastKind === "answer"
    ? lastConsequence === "reinterpret" ? copy.consequenceApplying : copy.submitting
    : lastKind === "deferred"
      ? copy.deferring
      : lastKind === "dismissed"
        ? copy.dismissing
        : copy.markingNotRelevant;
  const successMessage = resolved && resolution === "deferred" && state.snoozedUntil
    ? copy.deferredUntil(
      new Intl.DateTimeFormat(locale, {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: timezone,
      }).format(new Date(state.snoozedUntil)),
    )
    : state.message;

  return (
    <div className="question-answer" data-state={visibleState} data-consequence={resolved ? state.consequenceStatus ?? "none" : undefined}>
      {resolved ? null : (
        <>
          {suggestions.length ? (
            <div className="question-suggestions" role="group" aria-labelledby={suggestionsLabelId} aria-describedby={suggestionsHintId}>
              <p id={suggestionsLabelId} className="question-suggestions-label">{copy.suggestionsLabel}</p>
              <p id={suggestionsHintId} className="question-suggestions-hint">{copy.suggestionsHint}</p>
              <div className="question-suggestion-options">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    className="question-suggestion"
                    aria-pressed={selectedSuggestionId === suggestion.id}
                    onClick={() => selectSuggestion(suggestion)}
                    disabled={pending}
                  >
                    {suggestion.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <form action={submitAnswer} className="question-answer-form">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="questionId" value={questionId} />
            {selectedSuggestion ? (
              <input type="hidden" name="suggestionId" value={selectedSuggestion.id} />
            ) : null}
            <input
              ref={inputRef}
              name="answer"
              required
              maxLength={4000}
              value={answer}
              onChange={(event) => changeAnswer(event.target.value)}
              aria-label={copy.answerLabel}
              placeholder={copy.placeholder}
              data-suggested={selectedSuggestion ? "true" : undefined}
              aria-invalid={isFieldError || undefined}
              aria-describedby={isFieldError ? errorId : undefined}
            />
            <button type="submit" disabled={pending}>
              {pending && lastKind === "answer" && lastConsequence === "none" ? <LoaderCircle className="spin" size={16} /> : null} {pending && lastKind === "answer" && lastConsequence === "none" ? copy.submitting : copy.submit}
            </button>
          </form>
          {canReinterpret ? (
            <div className="question-consequence" data-open={consequenceOpen}>
              {consequenceOpen ? null : (
                <button type="button" onClick={openConsequence} disabled={pending}>
                  <RefreshCcw size={16} /> {copy.consequenceOpen}
                </button>
              )}
              {consequenceOpen ? (
                <form
                  action={submitAnswerWithReinterpretation}
                  className="question-consequence-form"
                  aria-labelledby={consequenceLabelId}
                  aria-describedby={consequenceDescriptionId}
                >
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="questionId" value={questionId} />
                  <input type="hidden" name="answer" value={answer} />
                  {selectedSuggestion ? (
                    <input type="hidden" name="suggestionId" value={selectedSuggestion.id} />
                  ) : null}
                  <p id={consequenceLabelId} className="question-consequence-label">{copy.consequenceLabel}</p>
                  <p id={consequenceDescriptionId} className="question-consequence-description">{copy.consequenceDescription}</p>
                  <p className="question-consequence-notice">{copy.consequenceNotice}</p>
                  <div className="question-consequence-actions">
                    <button ref={consequenceConfirmRef} type="submit" disabled={pending || trimmedAnswer.length === 0}>
                      {pending && lastConsequence === "reinterpret" ? <LoaderCircle className="spin" size={16} /> : <RefreshCcw size={16} />} {pending && lastConsequence === "reinterpret" ? copy.consequenceApplying : copy.consequenceConfirm}
                    </button>
                    <button type="button" onClick={skipConsequence} disabled={pending}>
                      {copy.consequenceSkip}
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
          ) : null}
          <div className="question-dispositions">
            {deferOpen ? null : (
              <button type="button" onClick={openDefer} disabled={pending}>
                <CalendarClock size={16} /> {copy.deferToggle}
              </button>
            )}
            <form action={submitDismiss} className="question-disposition-form">
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="questionId" value={questionId} />
              <button type="submit" disabled={pending}>
                {pending && lastKind === "dismissed" ? <LoaderCircle className="spin" size={16} /> : <CircleOff size={16} />} {pending && lastKind === "dismissed" ? copy.dismissing : copy.dismiss}
              </button>
            </form>
            <form action={submitNotRelevant} className="question-disposition-form">
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="questionId" value={questionId} />
              <button type="submit" disabled={pending}>
                {pending && lastKind === "not_relevant" ? <LoaderCircle className="spin" size={16} /> : <EyeOff size={16} />} {pending && lastKind === "not_relevant" ? copy.markingNotRelevant : copy.notRelevant}
              </button>
            </form>
          </div>
          {deferOpen ? (
            <form action={submitDefer} className="question-defer-form">
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="questionId" value={questionId} />
              <label>
                {copy.deferLabel}
                <input
                  ref={deferInputRef}
                  type="datetime-local"
                  name="snoozedUntilLocal"
                  required
                  min={deferMin || undefined}
                  value={deferValue}
                  onChange={(event) => {
                    setDeferValue(event.target.value);
                    setDeferLocalError(false);
                  }}
                  aria-invalid={isDeferFieldError || undefined}
                  aria-describedby={isDeferFieldError ? deferErrorId : undefined}
                />
              </label>
              {deferLocalError ? (
                <p id={deferErrorId} className="inline-create-feedback" role="alert">
                  {copy.deferInvalid}
                </p>
              ) : null}
              <div className="question-defer-actions">
                <button type="submit" disabled={pending}>
                  {pending && lastKind === "deferred" ? <LoaderCircle className="spin" size={16} /> : <CalendarClock size={16} />} {pending && lastKind === "deferred" ? copy.deferring : copy.deferConfirm}
                </button>
                <button type="button" onClick={() => { setDeferOpen(false); setDeferLocalError(false); }} disabled={pending}>
                  {copy.deferCancel}
                </button>
              </div>
            </form>
          ) : null}
        </>
      )}
      <p aria-live="polite" className="sr-only">
        {pending ? submittingLabel : selectedSuggestion ? copy.suggestionSelected : ""}
      </p>
      {state.status === "idle" || (state.status === "success" && undone) ? null : (
        <p
          ref={feedbackRef}
          tabIndex={-1}
          id={isFieldError ? errorId : isDeferFieldError && !deferLocalError ? deferErrorId : undefined}
          className="inline-create-feedback"
          role={state.status === "success" ? "status" : "alert"}
        >
          {successMessage}
        </p>
      )}
      {resolved && state.consequenceStatus === "reinterpretation_queued" ? (
        <p className="question-consequence-undo-hint">{copy.consequenceUndoHint}</p>
      ) : null}
      {resolved && state.undoId ? (
        <form action={undoSubmit} className="question-undo-form">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="questionId" value={questionId} />
          <input type="hidden" name="undoId" value={state.undoId} />
          <input type="hidden" name="resolution" value={resolution} />
          <button type="submit" disabled={undoPending}>
            {undoPending ? <LoaderCircle className="spin" size={16} /> : <Undo2 size={16} />} {undoPending ? copy.undoing : copy.undoLabels[resolution]}
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
