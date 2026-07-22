"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, RotateCcw } from "lucide-react";
import type { ActionableCandidateView } from "@/features/daily-cycle/contracts";
import { TaskCandidatesPresented } from "@/features/product-analytics/interaction-events";
import {
  normalizeCandidateEdits,
  serializeCandidateEdits,
  type CandidateEditCommand,
  type CandidateEditSuggestion,
} from "./candidate-edit-contract";
import {
  candidateDispositionValues,
  normalizeCandidateResolutionCommand,
  serializeCandidateResolutions,
  type CandidateDisposition,
  type CandidateResolution,
} from "./candidate-disposition-contract";
import { CandidateEditor } from "./candidate-editor";
import type { CandidateRelationOptions } from "./relation-options";

export type ConfirmTasksCode =
  | "confirmed"
  | "resolved"
  | "validation_failed"
  | "unauthenticated"
  | "stale_interpretation"
  | "confirmation_contended"
  | "idempotency_mismatch"
  | "already_materialized"
  | "invalid_payload"
  | "invalid_relation"
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
    invalidEdits: "Revise as decisões e edições antes de continuar.",
    operationFailed: "Não foi possível resolver as sugestões agora.",
    decision: (title: string) => `Decisão para: ${title}`,
    decisionChanged: (title: string, label: string) => `Decisão para ${title}: ${label}.`,
    dispositions: {
      confirmed: { label: "Criar tarefa", help: "Cria uma tarefa com as edições selecionadas." },
      rejected: { label: "Rejeitar sugestão", help: "Marca a sugestão como incorreta ou inadequada." },
      retained: { label: "Manter como registro", help: "Mantém somente no histórico desta entrada." },
      dismissed: { label: "Dispensar sugestão", help: "Encerra sem dizer que a sugestão estava errada." },
    },
  },
  en: {
    invalidEdits: "Review the decisions and edits before continuing.",
    operationFailed: "The suggestions could not be resolved right now.",
    decision: (title: string) => `Decision for: ${title}`,
    decisionChanged: (title: string, label: string) => `Decision for ${title}: ${label}.`,
    dispositions: {
      confirmed: { label: "Create task", help: "Creates a task with the selected edits." },
      rejected: { label: "Reject suggestion", help: "Marks the suggestion as incorrect or unsuitable." },
      retained: { label: "Keep as record", help: "Keeps it only in this entry's history." },
      dismissed: { label: "Dismiss suggestion", help: "Closes it without saying the suggestion was wrong." },
    },
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
  entryId,
  locale,
  undoId,
}: {
  action?: UndoTasksAction;
  entryId: string;
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
      <input type="hidden" name="entryId" value={entryId} />
      <input type="hidden" name="locale" value={locale} />
      <button type="submit" disabled={pending} className="button-secondary">
        {pending
          ? <LoaderCircle className="spin" size={16} />
          : <RotateCcw size={16} />}
        {pending
          ? (pt ? "Desfazendo…" : "Undoing…")
          : (pt ? "Desfazer decisões" : "Undo decisions")}
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
  relationOptions,
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
  relationOptions?: CandidateRelationOptions;
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
  const [dispositionsByIndex, setDispositionsByIndex] = useState<
    ReadonlyMap<number, CandidateDisposition>
  >(() => new Map(candidates.map((candidate) => [Number(candidate.key), "confirmed"])));
  const [locallyResolvedIndexes, setLocallyResolvedIndexes] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  const [announcement, setAnnouncement] = useState("");
  const candidateIndexSignature = candidates.map((candidate) => candidate.key).join(",");
  const synchronizationRef = useRef({ interpretationId, candidateIndexSignature });
  const operationKeyRef = useRef(operationKey);
  const submittedPayloadSignatureRef = useRef<string | null>(null);
  const localized = formCopy[locale];
  const pt = locale === "pt-BR";

  useEffect(() => {
    const candidateIndexes = candidates
      .map((candidate) => Number(candidate.key))
      .sort((left, right) => left - right);
    const candidateIndexSet = new Set(candidateIndexes);
    const previous = synchronizationRef.current;

    if (previous.interpretationId !== interpretationId) {
      setSelected(candidateIndexes);
      setEditsByIndex(new Map());
      setInvalidIndexes(new Set());
      setDispositionsByIndex(new Map(
        candidateIndexes.map((candidateIndex) => [candidateIndex, "confirmed"]),
      ));
      setLocallyResolvedIndexes(new Set());
      setAnnouncement("");
      operationKeyRef.current = operationKey;
      submittedPayloadSignatureRef.current = null;
    } else if (previous.candidateIndexSignature !== candidateIndexSignature) {
      setSelected((current) => current.filter((candidateIndex) => candidateIndexSet.has(candidateIndex)));
      setEditsByIndex((current) => filterMapByIndexes(current, candidateIndexSet));
      setInvalidIndexes((current) => filterSetByIndexes(current, candidateIndexSet));
      setDispositionsByIndex((current) => {
        const next = filterMapByIndexes(current, candidateIndexSet);
        for (const candidateIndex of candidateIndexes) {
          if (!next.has(candidateIndex)) next.set(candidateIndex, "confirmed");
        }
        return next;
      });
      setLocallyResolvedIndexes((current) => filterSetByIndexes(current, candidateIndexSet));
    }

    synchronizationRef.current = { interpretationId, candidateIndexSignature };
  }, [candidateIndexSignature, candidates, interpretationId, operationKey]);

  async function submitTasks(
    previousState: ConfirmTasksState,
    formData: FormData,
  ): Promise<ConfirmTasksState> {
    const selectedCandidateIndexes = [...selected].sort((left, right) => left - right);
    const candidateResolutions: CandidateResolution[] = selectedCandidateIndexes.map(
      (candidateIndex) => ({
        candidateIndex,
        disposition: dispositionsByIndex.get(candidateIndex) ?? "confirmed",
      }),
    );
    const confirmedCandidateIndexes = candidateResolutions
      .filter(({ disposition }) => disposition === "confirmed")
      .map(({ candidateIndex }) => candidateIndex);
    const confirmedIndexSet = new Set(confirmedCandidateIndexes);

    if (
      selectedCandidateIndexes.length === 0
      || confirmedCandidateIndexes.some((candidateIndex) => invalidIndexes.has(candidateIndex))
    ) {
      return localValidationFailure(localized.invalidEdits);
    }

    try {
      const selectedIndexSet = new Set(selectedCandidateIndexes);
      const candidateEdits = [...editsByIndex.values()].filter((edit) => (
        selectedIndexSet.has(edit.candidateIndex) && confirmedIndexSet.has(edit.candidateIndex)
      ));
      const canonicalEdits = confirmedCandidateIndexes.length > 0
        ? normalizeCandidateEdits({
          edits: candidateEdits,
          selectedCandidateIndexes: confirmedCandidateIndexes,
          suggestions: candidates.map(toEditSuggestion),
        }).edits
        : [];
      const canonical = normalizeCandidateResolutionCommand({
        resolutions: candidateResolutions,
        edits: canonicalEdits,
      });
      const serializedResolutions = serializeCandidateResolutions(canonical.resolutions);
      const serializedEdits = serializeCandidateEdits(canonical.edits);
      const payloadSignature = JSON.stringify([
        serializedResolutions,
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
      formData.set("candidateResolutions", serializedResolutions);
      formData.set("candidateEdits", serializedEdits);
      formData.set("operationKey", operationKeyRef.current);
      formData.set("locale", locale);

      const result = await action(previousState, formData);
      if (result.status === "success") {
        setAnnouncement("");
        setLocallyResolvedIndexes((current) => new Set([
          ...current,
          ...selectedCandidateIndexes,
        ]));
        setSelected((current) => current.filter(
          (candidateIndex) => !selectedIndexSet.has(candidateIndex),
        ));
        setEditsByIndex((current) => excludeMapIndexes(current, selectedIndexSet));
        setInvalidIndexes((current) => excludeSetIndexes(current, selectedIndexSet));
        setDispositionsByIndex((current) => excludeMapIndexes(current, selectedIndexSet));
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

  const visibleCandidates = candidates.filter(
    (candidate) => !locallyResolvedIndexes.has(Number(candidate.key)),
  );
  const successResult = state.status === "success" ? (
    <div className="confirmation-result">
      <p aria-live="polite" role="status"><Check size={17} />{state.message}</p>
      {state.undoId && (
        <UndoButton
          action={undoAction}
          entryId={entryId}
          locale={locale}
          undoId={state.undoId}
        />
      )}
    </div>
  ) : null;

  if (visibleCandidates.length === 0) {
    return (
      <>
        {successResult}
        <div className="no-action-state">
          <Check size={22} />
          <strong>{pt ? "Nenhuma sugestão pendente." : "No pending suggestions."}</strong>
        </div>
      </>
    );
  }

  return (
    <>
      {successResult}
      <form
        action={formAction}
        aria-busy={pending}
        aria-describedby={state.status === "error" ? "candidate-form-error" : undefined}
        className="candidate-form"
      >
        <TaskCandidatesPresented
          candidateCount={visibleCandidates.length}
          entryId={entryId}
          interpretationId={interpretationId}
          locale={locale}
        />
        <input type="hidden" name="entryId" value={entryId} />
        <input type="hidden" name="interpretationId" value={interpretationId} />
        <input type="hidden" name="locale" value={locale} />
        <div className="candidate-list">
          {visibleCandidates.map((candidate) => {
            const index = Number(candidate.key);
            const checked = selected.includes(index);
            const disposition = dispositionsByIndex.get(index) ?? "confirmed";

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
                    onChange={() => {
                      setAnnouncement("");
                      setSelected((current) => (
                        checked
                          ? current.filter((value) => value !== index)
                          : [...current, index].sort((left, right) => left - right)
                      ));
                    }}
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
                <fieldset
                  aria-disabled={!checked || pending}
                  style={{
                    border: "1px solid var(--line)",
                    borderRadius: 12,
                    display: "grid",
                    gap: 6,
                    margin: 0,
                    minWidth: 0,
                    padding: 12,
                  }}
                >
                  <legend style={{ padding: "0 7px", fontSize: 12, fontWeight: 800 }}>
                    {localized.decision(candidate.title)}
                  </legend>
                  {candidateDispositionValues.map((value) => {
                    const option = localized.dispositions[value];
                    return (
                      <label
                        key={value}
                        style={{
                          alignItems: "center",
                          display: "grid",
                          gap: 8,
                          gridTemplateColumns: "44px minmax(0, 1fr)",
                          minHeight: 44,
                        }}
                      >
                        <input
                          aria-label={option.label}
                          checked={disposition === value}
                          disabled={!checked || pending}
                          name={`candidate-disposition-${index}`}
                          onChange={() => {
                            setDispositionsByIndex((current) => {
                              const next = new Map(current);
                              next.set(index, value);
                              return next;
                            });
                            setAnnouncement(
                              localized.decisionChanged(candidate.title, option.label),
                            );
                          }}
                          style={{ minHeight: 44, minWidth: 44 }}
                          type="radio"
                          value={value}
                        />
                        <span style={{ display: "grid", gap: 2 }}>
                          <strong>{option.label}</strong>
                          <small>{option.help}</small>
                        </span>
                      </label>
                    );
                  })}
                </fieldset>
                <CandidateEditor
                  candidate={candidate}
                  entryId={entryId}
                  locale={locale}
                  onEditChange={(edit) => updateEdit(index, edit)}
                  onValidityChange={(valid) => updateValidity(index, valid)}
                  relationOptions={relationOptions}
                  selected={checked && disposition === "confirmed" && !pending}
                  timezone={timezone}
                />
              </div>
            );
          })}
        </div>
        {announcement && (
          <p aria-live="polite" role="status" style={{ margin: 0 }}>
            {announcement}
          </p>
        )}
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
            ? (pt ? "Resolvendo…" : "Resolving…")
            : pt
              ? `Resolver ${selected.length} ${selected.length === 1 ? "sugestão" : "sugestões"}`
              : `Resolve ${selected.length} ${selected.length === 1 ? "suggestion" : "suggestions"}`}
        </button>
      </form>
    </>
  );
}

function filterMapByIndexes<T>(
  source: ReadonlyMap<number, T>,
  candidateIndexes: ReadonlySet<number>,
): Map<number, T> {
  return new Map([...source].filter(([candidateIndex]) => candidateIndexes.has(candidateIndex)));
}

function excludeMapIndexes<T>(
  source: ReadonlyMap<number, T>,
  excludedIndexes: ReadonlySet<number>,
): Map<number, T> {
  return new Map([...source].filter(([candidateIndex]) => !excludedIndexes.has(candidateIndex)));
}

function filterSetByIndexes(
  source: ReadonlySet<number>,
  candidateIndexes: ReadonlySet<number>,
): Set<number> {
  return new Set([...source].filter((candidateIndex) => candidateIndexes.has(candidateIndex)));
}

function excludeSetIndexes(
  source: ReadonlySet<number>,
  excludedIndexes: ReadonlySet<number>,
): Set<number> {
  return new Set([...source].filter((candidateIndex) => !excludedIndexes.has(candidateIndex)));
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
