"use client";

import { useActionState, useState } from "react";
import { LoaderCircle, Plus, RotateCcw, Sparkles, X } from "lucide-react";
import type { InterpretationPatch } from "./schema";
import {
  conceptLabels,
  conceptOptions,
  getInterpretationCopy,
  type InterpretationLocale,
} from "./copy";

export type RevisionActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export type CorrectionAction = (state: RevisionActionState, formData: FormData) => Promise<RevisionActionState>;
export type UndoCorrectionAction = CorrectionAction;
export type ReprocessAction = CorrectionAction;

type CurrentRevision = Pick<
  InterpretationPatch,
  "summary" | "concepts" | "occurredAt" | "extractedDates" | "entityLinks" | "classifications" | "pendingQuestions"
> & { version: number };

export type EntityOption = {
  entityType: InterpretationPatch["entityLinks"][number]["entityType"];
  entityId: string;
  name: string;
};

const idleState: RevisionActionState = { status: "idle", message: "" };
const classificationOptions = ["fact", "interpretation", "inference", "suggestion"] as const;

function createOperationKey(fallback: string) {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : fallback;
}

function ActionFeedback({ state }: { state: RevisionActionState }) {
  if (state.status === "idle") return null;
  return <p role={state.status === "success" ? "status" : "alert"}>{state.message}</p>;
}

export function EntryReprocessButton({
  action,
  entryId,
  locale,
  operationKey,
}: {
  action: ReprocessAction;
  entryId: string;
  locale: InterpretationLocale;
  operationKey: string;
}) {
  const labels = getInterpretationCopy(locale);
  const [state, formAction, pending] = useActionState(action, idleState);
  return (
    <form action={formAction} className="entry-reprocess-form">
      <input type="hidden" name="entryId" value={entryId} />
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="operationKey" value={operationKey} />
      <button type="submit" className="button-secondary" disabled={pending}>
        {pending ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
        {pending ? labels.reprocessing : labels.reprocess}
      </button>
      <ActionFeedback state={state} />
    </form>
  );
}

function SecondaryActions({
  canUndo,
  entryId,
  locale,
  reprocessAction,
  reprocessOperationKey,
  undoId,
  undoAction,
}: {
  canUndo: boolean;
  entryId: string;
  locale: InterpretationLocale;
  reprocessAction: ReprocessAction;
  reprocessOperationKey: string;
  undoId: string;
  undoAction: UndoCorrectionAction;
}) {
  const labels = getInterpretationCopy(locale);
  const [undoState, undoFormAction, undoPending] = useActionState(undoAction, idleState);
  const [reprocessState, reprocessFormAction, reprocessPending] = useActionState(reprocessAction, idleState);

  return (
    <div className="interpretation-secondary-actions">
      {canUndo && (
        <form action={undoFormAction}>
          <input type="hidden" name="entryId" value={entryId} />
          <input type="hidden" name="undoId" value={undoId} />
          <input type="hidden" name="locale" value={locale} />
          <button type="submit" className="button-secondary" disabled={undoPending}>
            {undoPending ? <LoaderCircle className="spin" size={16} /> : <RotateCcw size={16} />}
            {undoPending ? labels.undoing : labels.undo}
          </button>
          <ActionFeedback state={undoState} />
        </form>
      )}
      <form action={reprocessFormAction}>
        <input type="hidden" name="entryId" value={entryId} />
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="operationKey" value={reprocessOperationKey} />
        <button type="submit" className="button-secondary" disabled={reprocessPending}>
          {reprocessPending ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
          {reprocessPending ? labels.reprocessing : labels.reprocess}
        </button>
        <ActionFeedback state={reprocessState} />
      </form>
    </div>
  );
}

export function InterpretationRevisionEditor({
  canUndo,
  correctionAction,
  current,
  entityOptions,
  entryId,
  locale,
  operationKey: suppliedOperationKey,
  reprocessAction,
  reprocessOperationKey: suppliedReprocessOperationKey,
  undoId,
  undoAction,
}: {
  canUndo: boolean;
  correctionAction: CorrectionAction;
  current: CurrentRevision;
  entityOptions: EntityOption[];
  entryId: string;
  locale: InterpretationLocale;
  operationKey?: string;
  reprocessAction: ReprocessAction;
  reprocessOperationKey?: string;
  undoId?: string;
  undoAction: UndoCorrectionAction;
}) {
  const labels = getInterpretationCopy(locale);
  const [editing, setEditing] = useState(false);
  const [operationKey, setOperationKey] = useState(suppliedOperationKey ?? entryId);
  const [dates, setDates] = useState(() => current.extractedDates.map((date, index) => ({ ...date, key: `${index}-${date.value}` })));
  const [state, formAction, pending] = useActionState(correctionAction, idleState);
  const selectedEntities = new Set(current.entityLinks.map((link) => `${link.entityType}:${link.entityId}`));

  function startCorrection() {
    setOperationKey(suppliedOperationKey ?? createOperationKey(entryId));
    setEditing(true);
  }

  if (!editing) {
    return (
      <section className="interpretation-editor" aria-label={locale === "pt-BR" ? "Revisão da interpretação" : "Interpretation review"}>
        <p className="interpretation-current-summary">{current.summary}</p>
        <div className="interpretation-editor-actions">
          <button type="button" className="button-primary" onClick={startCorrection}>{labels.correct}</button>
          <SecondaryActions
            canUndo={canUndo}
            entryId={entryId}
            locale={locale}
            reprocessAction={reprocessAction}
            reprocessOperationKey={suppliedReprocessOperationKey ?? entryId}
            undoId={undoId ?? entryId}
            undoAction={undoAction}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="interpretation-editor interpretation-editor-editing">
      <form action={formAction} className="interpretation-correction-form">
        <input type="hidden" name="entryId" value={entryId} />
        <input type="hidden" name="expectedVersion" value={current.version} />
        <input type="hidden" name="operationKey" value={operationKey} />
        <input type="hidden" name="locale" value={locale} />

        <label className="field-label">
          {labels.summary}
          <textarea name="summary" defaultValue={current.summary} rows={4} required maxLength={2000} />
        </label>

        <fieldset>
          <legend>{labels.concepts}</legend>
          <div className="interpretation-option-grid">
            {conceptOptions.map((concept) => (
              <label key={concept} className="check-row">
                <input type="checkbox" name="concepts" value={concept} defaultChecked={current.concepts.includes(concept)} />
                <span>{conceptLabels[concept][locale]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="field-label">
          {labels.occurredAt}
          <input name="occurredAt" type="text" defaultValue={current.occurredAt} required />
        </label>

        <fieldset>
          <legend>{labels.dates}</legend>
          <div className="interpretation-date-list">
            {dates.map((date, index) => (
              <div key={date.key} className="interpretation-date-row">
                <label>
                  {locale === "pt-BR" ? `Data identificada ${index + 1}` : `Identified date ${index + 1}`}
                  <input
                    type="date"
                    value={date.value.slice(0, 10)}
                    onChange={(event) => setDates((items) => items.map((item) => item.key === date.key ? { ...item, value: event.target.value } : item))}
                  />
                </label>
                <label>
                  {labels.dateLabel}
                  <input
                    type="text"
                    value={date.label ?? ""}
                    maxLength={160}
                    onChange={(event) => setDates((items) => items.map((item) => item.key === date.key ? { ...item, label: event.target.value || null } : item))}
                  />
                </label>
                <input type="hidden" name="extractedDate" value={JSON.stringify({ value: date.value, label: date.label ?? null })} />
                <button type="button" className="icon-button" aria-label={`${labels.removeDate} ${index + 1}`} onClick={() => setDates((items) => items.filter((item) => item.key !== date.key))}><X size={16} /></button>
              </div>
            ))}
          </div>
          <button type="button" className="button-secondary" onClick={() => setDates((items) => [...items, { value: "", label: null, key: createOperationKey(`${entryId}-${items.length}`) }])}><Plus size={16} />{labels.addDate}</button>
        </fieldset>

        <fieldset>
          <legend>{labels.entities}</legend>
          {entityOptions.length === 0 ? <p>{labels.noEntities}</p> : (
            <div className="interpretation-option-grid">
              {entityOptions.map((entity) => {
                const key = `${entity.entityType}:${entity.entityId}`;
                return (
                  <label key={key} className="check-row">
                    <input
                      type="checkbox"
                      name="entityLink"
                      value={JSON.stringify({ entityType: entity.entityType, entityId: entity.entityId, mention: entity.name, confidence: 1 })}
                      defaultChecked={selectedEntities.has(key)}
                    />
                    <span>{entity.name} <small>{entity.entityType}</small></span>
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>

        <fieldset>
          <legend>{labels.classifications}</legend>
          {([
            ["summary", locale === "pt-BR" ? "Classificação do resumo" : "Summary classification"],
            ["concepts", locale === "pt-BR" ? "Classificação dos conceitos" : "Concept classification"],
            ["occurredAt", locale === "pt-BR" ? "Classificação da data" : "Date classification"],
            ["entities", locale === "pt-BR" ? "Classificação dos vínculos" : "Link classification"],
          ] as const).map(([field, label]) => (
            <label key={field} className="field-label">
              {label}
              <select name={`${field}Classification`} defaultValue={current.classifications[field]}>
                {classificationOptions.map((classification) => <option key={classification} value={classification}>{classification}</option>)}
              </select>
            </label>
          ))}
        </fieldset>

        {current.pendingQuestions.length > 0 && (
          <fieldset>
            <legend>{labels.pending}</legend>
            {current.pendingQuestions.map((question) => (
              <label key={question.question} className="check-row">
                <input type="checkbox" name="pendingQuestion" value={JSON.stringify(question)} defaultChecked />
                <span>{labels.keepQuestion}: {question.question}</span>
              </label>
            ))}
          </fieldset>
        )}

        <label className="check-row">
          <input type="checkbox" name="recordOnly" />
          <span>{labels.recordOnly}</span>
        </label>
        <label className="field-label">
          {labels.reason}
          <textarea name="correctionReason" rows={2} maxLength={500} />
        </label>

        <div className="interpretation-form-actions">
          <button type="submit" className="button-primary" disabled={pending}>{pending ? labels.saving : labels.save}</button>
          <button type="button" className="button-secondary" onClick={() => setEditing(false)}>{labels.cancel}</button>
        </div>
        <ActionFeedback state={state} />
      </form>
    </section>
  );
}
