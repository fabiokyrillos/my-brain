"use client";

import { Button } from "@/components/ui";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Check, RotateCcw } from "lucide-react";
import type { ActionableCandidateView } from "@/features/daily-cycle/contracts";
import { TaskCandidatesPresented } from "@/features/product-analytics/interaction-events";
import {
  normalizeCandidateEdits,
  serializeCandidateEdits,
  type CandidateEditCommand,
  type CandidateEditSuggestion,
} from "./candidate-edit-contract";
import {
  candidateResolutionArraySchema,
  normalizeCandidateResolutionCommand,
  serializeCandidateResolutions,
  type CandidateDisposition,
  type CandidateResolution,
} from "./candidate-disposition-contract";
import { CandidateEditor } from "./candidate-editor";
import { describeInstantForDateTimeLocal } from "./candidate-due-date";
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
  | "invalid_graph_reference"
  | "graph_cycle"
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
    question: (title: string) => `Criar a tarefa “${title}”?`,
    due: "Prazo",
    ignore: "Ignorar",
    moreOptions: "Mais opções",
    createAll: (count: number) => `Criar as ${count} tarefas`,
    siblingReference: (count: number) => (
      `Esta tarefa está ligada a outra sugestão desta lista. Use “Criar as ${count} tarefas” para criá-las juntas.`
    ),
    noPending: "Nenhuma sugestão pendente.",
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
    question: (title: string) => `Create the task “${title}”?`,
    due: "Due",
    ignore: "Ignore",
    moreOptions: "More options",
    createAll: (count: number) => `Create all ${count} tasks`,
    siblingReference: (count: number) => (
      `This task is linked to another suggestion in this list. Use “Create all ${count} tasks” to create them together.`
    ),
    noPending: "No pending suggestions.",
    dispositions: {
      confirmed: { label: "Create task", help: "Creates a task with the selected edits." },
      rejected: { label: "Reject suggestion", help: "Marks the suggestion as incorrect or unsuitable." },
      retained: { label: "Keep as record", help: "Keeps it only in this entry's history." },
      dismissed: { label: "Dismiss suggestion", help: "Closes it without saying the suggestion was wrong." },
    },
  },
} as const;

/**
 * The candidate's due date as a label, or nothing at all.
 *
 * `new Date` is not a contract: it throws through `Intl` on a malformed offset
 * and, worse, reads a date-only value as UTC midnight — a day the owner never
 * stated. The typed reader decides first, and the owner's timezone is named
 * explicitly so this label can never disagree with the editor sitting beside it.
 */
function formatDueDate(value: string | null, locale: "pt-BR" | "en", timezone: string) {
  if (!value) return null;
  if (describeInstantForDateTimeLocal(value, timezone).status !== "valid") return null;

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
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
      <Button icon={<RotateCcw />} loading={pending} type="submit">
        {pending
          ? (pt ? "Desfazendo…" : "Undoing…")
          : (pt ? "Desfazer decisões" : "Undo decisions")}
      </Button>
      {state.status !== "idle" && (
        <span role={state.status === "success" ? "status" : "alert"}>
          {state.message}
        </span>
      )}
    </form>
  );
}

/**
 * The tasks a record suggests, each as one question with its answers beside it.
 *
 * ## One tap decides (owner, 2026-11-18; the person rows did this in ADR-184)
 *
 * This used to be a batch form: per suggestion a checkbox, a grid of four
 * radios and an editor, and one "Resolver N sugestões" under all of them.
 * Deciding about one suggestion took three controls and a scroll. Now *Criar
 * tarefa* and *Ignorar* each write that one decision at once, and the two rarer
 * answers sit behind *Mais opções*.
 *
 * Nothing about the write changed. `resolveEntryTaskCandidates` always accepted
 * a partial list of resolutions, so one decision is the request the batch form
 * sent with a single row selected: the same fields, the same canonical
 * serialisation, the same operation-key rule. What makes an immediate write
 * acceptable is what did before — the result line carries the undo.
 *
 * No answer is `variant="primary"`: a record can suggest several tasks, and the
 * product allows one primary control per view.
 */
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
  const [editsByIndex, setEditsByIndex] = useState<ReadonlyMap<number, CandidateEditCommand>>(
    () => new Map(),
  );
  const [invalidIndexes, setInvalidIndexes] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  const [moreOptionsIndexes, setMoreOptionsIndexes] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  const [locallyResolvedIndexes, setLocallyResolvedIndexes] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  const candidateIndexSignature = candidates.map((candidate) => candidate.key).join(",");
  const synchronizationRef = useRef({ interpretationId, candidateIndexSignature });
  const operationKeyRef = useRef(operationKey);
  const submittedPayloadSignatureRef = useRef<string | null>(null);
  const localized = formCopy[locale];

  useEffect(() => {
    const candidateIndexSet = new Set(candidates.map((candidate) => Number(candidate.key)));
    const previous = synchronizationRef.current;

    if (previous.interpretationId !== interpretationId) {
      setEditsByIndex(new Map());
      setInvalidIndexes(new Set());
      setMoreOptionsIndexes(new Set());
      setLocallyResolvedIndexes(new Set());
      operationKeyRef.current = operationKey;
      submittedPayloadSignatureRef.current = null;
    } else if (previous.candidateIndexSignature !== candidateIndexSignature) {
      setEditsByIndex((current) => filterMapByIndexes(current, candidateIndexSet));
      setInvalidIndexes((current) => filterSetByIndexes(current, candidateIndexSet));
      setMoreOptionsIndexes((current) => filterSetByIndexes(current, candidateIndexSet));
      setLocallyResolvedIndexes((current) => filterSetByIndexes(current, candidateIndexSet));
    }

    synchronizationRef.current = { interpretationId, candidateIndexSignature };
  }, [candidateIndexSignature, candidates, interpretationId, operationKey]);

  const visibleCandidates = candidates.filter(
    (candidate) => !locallyResolvedIndexes.has(Number(candidate.key)),
  );
  const visibleIndexes = visibleCandidates
    .map((candidate) => Number(candidate.key))
    .sort((left, right) => left - right);

  async function submitTasks(
    previousState: ConfirmTasksState,
    formData: FormData,
  ): Promise<ConfirmTasksState> {
    // `decide` is the only caller and builds this list in code; it is parsed
    // again here because a FormData field is still an untrusted boundary.
    const requested = parseRequestedResolutions(formData.get("candidateResolutions"));
    if (!requested) return localValidationFailure(localized.invalidEdits);

    const candidateResolutions = [...requested].sort(
      (left, right) => left.candidateIndex - right.candidateIndex,
    );
    const resolvedCandidateIndexes = candidateResolutions.map(({ candidateIndex }) => candidateIndex);
    const resolvedIndexSet = new Set(resolvedCandidateIndexes);
    const confirmedCandidateIndexes = candidateResolutions
      .filter(({ disposition }) => disposition === "confirmed")
      .map(({ candidateIndex }) => candidateIndex);
    const confirmedIndexSet = new Set(confirmedCandidateIndexes);

    if (confirmedCandidateIndexes.some((candidateIndex) => invalidIndexes.has(candidateIndex))) {
      return localValidationFailure(localized.invalidEdits);
    }

    const candidateEdits = [...editsByIndex.values()].filter(
      (edit) => confirmedIndexSet.has(edit.candidateIndex),
    );

    /*
      A task that names a sibling suggestion as its parent or dependency can only
      be created in the request that creates that sibling too; alone, the server
      refuses it as an unavailable reference. While the sibling is still on the
      page the owner has a way through, so say which one instead of spending a
      round trip on a refusal that tells them to refresh. A reference to a
      sibling that is no longer listed is left for the server to judge, as it
      always was.
    */
    const pendingIndexSet = new Set(visibleIndexes);
    const needsSibling = candidateEdits.some((edit) => (
      siblingReferences(edit).some((candidateIndex) => (
        pendingIndexSet.has(candidateIndex) && !confirmedIndexSet.has(candidateIndex)
      ))
    ));
    if (needsSibling) {
      return localValidationFailure(localized.siblingReference(visibleIndexes.length));
    }

    try {
      const canonicalEdits = confirmedCandidateIndexes.length > 0
        ? normalizeCandidateEdits({
          edits: candidateEdits,
          selectedCandidateIndexes: confirmedCandidateIndexes,
          suggestions: candidates.map((candidate) => toEditSuggestion(candidate, timezone)),
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

      // Built from nothing, so no field can arrive that this function did not set.
      const request = new FormData();
      request.set("entryId", entryId);
      request.set("interpretationId", interpretationId);
      request.set("locale", locale);
      for (const candidateIndex of resolvedCandidateIndexes) {
        request.append("candidateIndex", String(candidateIndex));
      }
      request.set("candidateResolutions", serializedResolutions);
      request.set("candidateEdits", serializedEdits);
      request.set("operationKey", operationKeyRef.current);

      const result = await action(previousState, request);
      if (result.status === "success") {
        setLocallyResolvedIndexes((current) => new Set([
          ...current,
          ...resolvedCandidateIndexes,
        ]));
        setEditsByIndex((current) => excludeMapIndexes(current, resolvedIndexSet));
        setInvalidIndexes((current) => excludeSetIndexes(current, resolvedIndexSet));
        setMoreOptionsIndexes((current) => excludeSetIndexes(current, resolvedIndexSet));
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
  const [, startTransition] = useTransition();

  /** Writes the given decisions in ONE request. Built here, never read from the DOM. */
  function decide(resolutions: readonly CandidateResolution[]) {
    const formData = new FormData();
    formData.set("candidateResolutions", JSON.stringify(resolutions));
    startTransition(() => formAction(formData));
  }

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

  function toggleMoreOptions(candidateIndex: number) {
    setMoreOptionsIndexes((current) => {
      const next = new Set(current);
      if (next.has(candidateIndex)) {
        next.delete(candidateIndex);
      } else {
        next.add(candidateIndex);
      }
      return next;
    });
  }

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
          <strong>{localized.noPending}</strong>
        </div>
      </>
    );
  }

  return (
    <>
      {successResult}
      <div
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
        <div className="candidate-list">
          {visibleCandidates.map((candidate) => {
            const index = Number(candidate.key);
            const siblingCandidates = visibleCandidates
              .filter((sibling) => Number(sibling.key) !== index)
              .map((sibling) => ({ index: Number(sibling.key), title: sibling.title }));
            const dueDateLabel = formatDueDate(candidate.dueAt ?? null, locale, timezone);
            // The question names what a tap would actually create.
            const title = editsByIndex.get(index)?.changes.title ?? candidate.title;
            const moreOptionsOpen = moreOptionsIndexes.has(index);
            const moreOptionsId = `task-candidate-${index}-more`;

            return (
              <div
                aria-label={localized.decision(candidate.title)}
                className="task-candidate-decision-card"
                key={candidate.key}
                role="group"
              >
                <p className="task-candidate-question">{localized.question(title)}</p>
                {candidate.description && (
                  <p className="task-candidate-meta">{candidate.description}</p>
                )}
                {dueDateLabel && (
                  <p className="task-candidate-meta">{localized.due}: {dueDateLabel}</p>
                )}
                <div className="task-candidate-actions">
                  <Button
                    disabled={pending || invalidIndexes.has(index)}
                    onClick={() => decide([{ candidateIndex: index, disposition: "confirmed" }])}
                    type="button"
                  >
                    {localized.dispositions.confirmed.label}
                  </Button>
                  <Button
                    disabled={pending}
                    onClick={() => decide([{ candidateIndex: index, disposition: "dismissed" }])}
                    type="button"
                    variant="ghost"
                  >
                    {localized.ignore}
                  </Button>
                  <Button
                    aria-controls={moreOptionsId}
                    aria-expanded={moreOptionsOpen}
                    disabled={pending}
                    onClick={() => toggleMoreOptions(index)}
                    type="button"
                    variant="link"
                  >
                    {localized.moreOptions}
                  </Button>
                </div>
                {/* Always in the document, so `aria-controls` has a target;
                    hidden until asked for, so the row at rest is a question
                    and its two common answers. */}
                <div className="task-candidate-more" hidden={!moreOptionsOpen} id={moreOptionsId}>
                  {moreDispositions.map((disposition) => (
                    <div className="task-candidate-more-option" key={disposition}>
                      <Button
                        disabled={pending}
                        onClick={() => decide([{ candidateIndex: index, disposition }])}
                        type="button"
                        variant="ghost"
                      >
                        {localized.dispositions[disposition].label}
                      </Button>
                      <p className="task-candidate-meta">{localized.dispositions[disposition].help}</p>
                    </div>
                  ))}
                </div>
                <CandidateEditor
                  candidate={candidate}
                  entryId={entryId}
                  locale={locale}
                  onEditChange={(edit) => updateEdit(index, edit)}
                  onValidityChange={(valid) => updateValidity(index, valid)}
                  relationOptions={relationOptions}
                  siblingCandidates={siblingCandidates}
                  selected={!pending}
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
        {/*
          Not a shortcut for tapping each row. An edit can name a SIBLING
          suggestion as its parent or dependency, and the server only accepts
          that reference when both are created by the same request — so this is
          the one way to create such a pair.
        */}
        {visibleCandidates.length > 1 && (
          <Button
            className="task-candidate-batch"
            disabled={pending || visibleIndexes.some((index) => invalidIndexes.has(index))}
            onClick={() => decide(visibleIndexes.map(
              (candidateIndex) => ({ candidateIndex, disposition: "confirmed" }),
            ))}
            type="button"
            width="full"
          >
            {localized.createAll(visibleCandidates.length)}
          </Button>
        )}
      </div>
    </>
  );
}

/** The two answers that are rare enough to sit behind *Mais opções*. */
const moreDispositions = ["rejected", "retained"] as const satisfies readonly CandidateDisposition[];

/** What `decide` asked for, or nothing if the field is not a resolution list. */
function parseRequestedResolutions(value: FormDataEntryValue | null): CandidateResolution[] | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = candidateResolutionArraySchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The sibling suggestions an edit names as its parent or as dependencies. */
function siblingReferences(edit: CandidateEditCommand): number[] {
  const references = [
    edit.changes.parentRef ?? null,
    ...(edit.changes.dependsOn ?? []).map((dependency) => dependency.target),
  ];
  return references.flatMap((reference) => (
    reference?.type === "candidateIndex" ? [reference.value] : []
  ));
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

/**
 * The suggestion as the owner was actually shown it.
 *
 * A due date outside the readable contract is presented as absent — the same
 * thing `CandidateEditor` does, next to a localized notice saying so. Carrying
 * it through instead would fail suggestion validation and refuse the whole
 * batch, which would cost the owner every other candidate in the entry over one
 * optional field. Nothing stored is altered: only what this form claims the
 * owner saw.
 */
function toEditSuggestion(
  candidate: ActionableCandidateView,
  timezone: string,
): CandidateEditSuggestion {
  const dueAt = candidate.dueAt ?? null;

  return {
    candidateIndex: Number(candidate.key),
    title: candidate.title,
    description: candidate.description ?? null,
    dueAt: describeInstantForDateTimeLocal(dueAt, timezone).status === "valid" ? dueAt : null,
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
