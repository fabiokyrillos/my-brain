"use client";

import { useActionState, useRef, useState } from "react";
import { LoaderCircle, RotateCcw, UserPlus } from "lucide-react";
import type { UndoTasksAction, UndoTasksState } from "@/features/tasks/task-candidate-form";
import type { PendingPersonCandidate, PersonCandidateResolutionInput } from "./person-candidate-contract";
import type { PersonCandidateActionState } from "./person-candidate-actions";

type Decision = "confirmed" | "rejected";
export type PersonCandidateAction = (
  state: PersonCandidateActionState,
  formData: FormData,
) => Promise<PersonCandidateActionState>;

const idleState: PersonCandidateActionState = { status: "idle", message: "", undoId: null };

function PersonUndoButton({
  action,
  entryId,
  locale,
  undoId,
}: {
  action: UndoTasksAction;
  entryId: string;
  locale: "pt-BR" | "en";
  undoId: string;
}) {
  const undoInitialState: UndoTasksState = { status: "idle", message: "" };
  const [state, formAction, pending] = useActionState(action, undoInitialState);
  const pt = locale === "pt-BR";
  return (
    <form action={formAction} className="undo-action">
      <input type="hidden" name="undoId" value={undoId} />
      <input type="hidden" name="entryId" value={entryId} />
      <input type="hidden" name="locale" value={locale} />
      <button type="submit" className="button-secondary" disabled={pending}>
        {pending ? <LoaderCircle className="spin" size={16} /> : <RotateCcw size={16} />}
        {pending ? (pt ? "Desfazendo…" : "Undoing…") : (pt ? "Desfazer decisões" : "Undo decisions")}
      </button>
      {state.status !== "idle" && <span role={state.status === "success" ? "status" : "alert"}>{state.message}</span>}
    </form>
  );
}

export function PersonCandidateForm({
  action,
  candidates,
  entryId,
  initialState = idleState,
  interpretationId,
  locale,
  operationKey,
  undoAction,
}: {
  action: PersonCandidateAction;
  candidates: readonly PendingPersonCandidate[];
  entryId: string;
  initialState?: PersonCandidateActionState;
  interpretationId: string;
  locale: "pt-BR" | "en";
  operationKey: string;
  undoAction?: UndoTasksAction;
}) {
  const [decisions, setDecisions] = useState<ReadonlyMap<number, Decision>>(() => new Map());
  const [names, setNames] = useState<ReadonlyMap<number, string>>(
    () => new Map(candidates.map((candidate) => [candidate.candidateIndex, candidate.proposedName])),
  );
  const operationKeyRef = useRef(operationKey);
  const pt = locale === "pt-BR";

  const wrappedAction: PersonCandidateAction = async (previousState, formData) => {
    const resolutions: PersonCandidateResolutionInput[] = [];
    for (const candidate of candidates) {
      const disposition = decisions.get(candidate.candidateIndex);
      if (!disposition) continue;
      if (disposition === "rejected") {
        resolutions.push({ candidateIndex: candidate.candidateIndex, disposition });
        continue;
      }
      resolutions.push({
        candidateIndex: candidate.candidateIndex,
        disposition,
        resolvedName: (names.get(candidate.candidateIndex) ?? candidate.proposedName).trim(),
      });
    }
    formData.set("entryId", entryId);
    formData.set("expectedInterpretationId", interpretationId);
    formData.set("operationKey", operationKeyRef.current);
    formData.set("locale", locale);
    formData.set("resolutions", JSON.stringify(resolutions));
    const result = await action(previousState, formData);
    if (result.status === "success") {
      operationKeyRef.current = crypto.randomUUID();
    }
    return result;
  };

  const [state, formAction, pending] = useActionState(wrappedAction, initialState);
  if (candidates.length === 0 && state.status === "idle") return null;

  const answeredCount = decisions.size;
  const hasInvalidConfirmedName = candidates.some((candidate) => (
    decisions.get(candidate.candidateIndex) === "confirmed"
    && !(names.get(candidate.candidateIndex) ?? "").trim()
  ));

  return (
    <div className="person-candidate-section">
      {candidates.length > 0 && (
        <form action={formAction} className="candidate-form">
          <fieldset className="candidate-list" aria-describedby="person-candidate-help">
            <legend>{pt ? "Pessoas mencionadas" : "People mentioned"}</legend>
            <p id="person-candidate-help" className="field-hint">
              {pt
                ? "Confirme apenas quem deve virar uma pessoa permanente. Você pode corrigir o nome ou ignorar a menção."
                : "Confirm only who should become a permanent person. You can correct the name or ignore the mention."}
            </p>
            {candidates.map((candidate) => {
              const decision = decisions.get(candidate.candidateIndex);
              const groupLabel = pt
                ? `Pessoa mencionada: ${candidate.originalName}`
                : `Mentioned person: ${candidate.originalName}`;
              const inputId = `person-candidate-${candidate.candidateIndex}-name`;
              return (
                <fieldset key={candidate.candidateIndex} className="candidate-item" aria-label={groupLabel}>
                  <legend>{candidate.originalName}</legend>
                  {candidate.evidence && <p>{candidate.evidence}</p>}
                  <label>
                    <input
                      checked={decision === "confirmed"}
                      name={`person-decision-${candidate.candidateIndex}`}
                      onChange={() => setDecisions((current) => new Map(current).set(candidate.candidateIndex, "confirmed"))}
                      type="radio"
                      value="confirmed"
                    />
                    {pt ? "Criar pessoa" : "Create person"}
                  </label>
                  <label>
                    <input
                      checked={decision === "rejected"}
                      name={`person-decision-${candidate.candidateIndex}`}
                      onChange={() => setDecisions((current) => new Map(current).set(candidate.candidateIndex, "rejected"))}
                      type="radio"
                      value="rejected"
                    />
                    {pt ? "Ignorar menção" : "Ignore mention"}
                  </label>
                  <label htmlFor={inputId}>
                    {pt ? `Nome para criar: ${candidate.originalName}` : `Name to create: ${candidate.originalName}`}
                  </label>
                  <input
                    disabled={decision !== "confirmed" || pending}
                    id={inputId}
                    maxLength={160}
                    onChange={(event) => setNames((current) => new Map(current).set(candidate.candidateIndex, event.target.value))}
                    type="text"
                    value={names.get(candidate.candidateIndex) ?? candidate.proposedName}
                  />
                </fieldset>
              );
            })}
          </fieldset>
          <button
            className="button-primary"
            disabled={pending || answeredCount === 0 || hasInvalidConfirmedName}
            type="submit"
          >
            {pending ? <LoaderCircle className="spin" size={17} /> : <UserPlus size={17} />}
            {pending
              ? (pt ? "Salvando…" : "Saving…")
              : (pt ? "Salvar decisões sobre pessoas" : "Save person decisions")}
          </button>
        </form>
      )}
      {state.status !== "idle" && (
        <div className={state.status === "success" ? "confirmation-result" : "form-error"} role={state.status === "success" ? "status" : "alert"} aria-live="polite">
          <strong>{state.message}</strong>
          {state.status === "success" && state.undoId && undoAction && (
            <PersonUndoButton action={undoAction} entryId={entryId} locale={locale} undoId={state.undoId} />
          )}
        </div>
      )}
    </div>
  );
}
