"use client";

import { Button } from "@/components/ui";
import { useActionState, useRef, useState, useTransition } from "react";
import { RotateCcw } from "lucide-react";
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
      <Button icon={<RotateCcw />} loading={pending} type="submit">
        {pending ? (pt ? "Desfazendo…" : "Undoing…") : (pt ? "Desfazer" : "Undo")}
      </Button>
      {state.status !== "idle" && <span role={state.status === "success" ? "status" : "alert"}>{state.message}</span>}
    </form>
  );
}

/**
 * The people a record mentions, each as one question with its answers beside it.
 *
 * ## One tap decides (owner, 2026-11-17)
 *
 * This used to be a form: a radio pair and a name field per person, and one
 * "Salvar decisões sobre pessoas" under all of them. Deciding about one person
 * took three controls and a scroll. Now *Criar pessoa* and *Ignorar* each write
 * that one decision at once, and the name field appears only for whoever asks
 * to change the name.
 *
 * Nothing about the write changed. `resolvePersonCandidates` already accepted a
 * partial list of resolutions, so a single decision is the same request the form
 * sent with one row answered; the server still checks the interpretation, the
 * operation key and the owner. What makes an immediate write acceptable is the
 * same thing that did before — the result line carries *Desfazer*.
 *
 * Neither answer is `variant="primary"`: there may be several people on a page,
 * and the product allows one primary control per view.
 */
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
  const [names, setNames] = useState<ReadonlyMap<number, string>>(
    () => new Map(candidates.map((candidate) => [candidate.candidateIndex, candidate.proposedName])),
  );
  const [renaming, setRenaming] = useState<ReadonlySet<number>>(() => new Set());
  const operationKeyRef = useRef(operationKey);
  const pt = locale === "pt-BR";

  const wrappedAction: PersonCandidateAction = async (previousState, formData) => {
    formData.set("entryId", entryId);
    formData.set("expectedInterpretationId", interpretationId);
    formData.set("operationKey", operationKeyRef.current);
    formData.set("locale", locale);
    const result = await action(previousState, formData);
    if (result.status === "success") {
      operationKeyRef.current = crypto.randomUUID();
    }
    return result;
  };

  const [state, formAction, pending] = useActionState(wrappedAction, initialState);
  const [, startTransition] = useTransition();
  if (candidates.length === 0 && state.status === "idle") return null;

  const nameOf = (candidate: PendingPersonCandidate) => names.get(candidate.candidateIndex) ?? candidate.proposedName;

  /** Writes ONE decision. The resolution list is built here, never from the DOM. */
  function decide(candidate: PendingPersonCandidate, disposition: Decision) {
    const resolution: PersonCandidateResolutionInput = disposition === "rejected"
      ? { candidateIndex: candidate.candidateIndex, disposition }
      : { candidateIndex: candidate.candidateIndex, disposition, resolvedName: nameOf(candidate).trim() };
    const formData = new FormData();
    formData.set("resolutions", JSON.stringify([resolution]));
    startTransition(() => formAction(formData));
  }

  return (
    <div className="person-candidate-section">
      {candidates.length > 0 && (
        <ul aria-label={pt ? "Pessoas mencionadas" : "People mentioned"} className="person-candidate-list">
          {candidates.map((candidate) => {
            const groupLabel = pt
              ? `Pessoa mencionada: ${candidate.originalName}`
              : `Mentioned person: ${candidate.originalName}`;
            const inputId = `person-candidate-${candidate.candidateIndex}-name`;
            const name = nameOf(candidate);
            const isRenaming = renaming.has(candidate.candidateIndex);
            /*
              `person-candidate-item`, its own class. It once borrowed the task
              form's `.candidate-item`, a `<label>` holding a visually hidden
              checkbox whose rules hid any direct `<input>` child — which made
              this card's name field invisible and unclickable. That class is
              retired now (the task form became rows too); a layout class is
              still never shared between two different shapes.
            */
            return (
              <li key={candidate.candidateIndex}>
                <div aria-label={groupLabel} className="person-candidate-item" role="group">
                  <p className="person-candidate-question">
                    {pt ? `Criar a pessoa “${name.trim() || candidate.originalName}”?` : `Create the person “${name.trim() || candidate.originalName}”?`}
                    {/* Life Brain C.2: the role, when the reading names one, is part
                        of who this is — and what the note will say if confirmed. */}
                    {candidate.role ? <span className="person-candidate-role"> · {candidate.role}</span> : null}
                  </p>
                  {candidate.evidence && <p className="person-candidate-evidence">{candidate.evidence}</p>}
                  <div className="person-candidate-actions">
                    <Button disabled={pending || !name.trim()} onClick={() => decide(candidate, "confirmed")} type="button">
                      {pt ? "Criar pessoa" : "Create person"}
                    </Button>
                    <Button disabled={pending} onClick={() => decide(candidate, "rejected")} type="button" variant="ghost">
                      {pt ? "Ignorar" : "Ignore"}
                    </Button>
                    <Button
                      aria-controls={inputId}
                      aria-expanded={isRenaming}
                      disabled={pending}
                      onClick={() => setRenaming((current) => {
                        const next = new Set(current);
                        if (next.has(candidate.candidateIndex)) next.delete(candidate.candidateIndex);
                        else next.add(candidate.candidateIndex);
                        return next;
                      })}
                      type="button"
                      variant="link"
                    >
                      {pt ? "Mudar o nome" : "Change the name"}
                    </Button>
                  </div>
                  {/* Always in the document, so `aria-controls` has a target;
                      hidden until asked for, so the row at rest is a question
                      and its answers. */}
                  <div className="person-candidate-name" hidden={!isRenaming}>
                    <label htmlFor={inputId}>
                      {pt ? `Nome para criar: ${candidate.originalName}` : `Name to create: ${candidate.originalName}`}
                    </label>
                    <input
                      disabled={pending}
                      id={inputId}
                      maxLength={160}
                      onChange={(event) => setNames((current) => new Map(current).set(candidate.candidateIndex, event.target.value))}
                      type="text"
                      value={name}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
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
