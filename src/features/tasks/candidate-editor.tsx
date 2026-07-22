"use client";

import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import type { ActionableCandidateView } from "@/features/daily-cycle/contracts";
import {
  recordCandidateEditReset,
  recordCandidateEditStarted,
} from "@/features/product-analytics/interaction-events";
import {
  candidateEditArraySchema,
  manualPriorityValues,
  normalizeCandidateEdits,
  serializeCandidateEdits,
  type CandidateChanges,
  type CandidateEditCommand,
  type CandidateEditSuggestion,
  type ManualPriority,
} from "./candidate-edit-contract";
import {
  formatInstantForDateTimeLocal,
  localDateTimeToOffsetInstant,
} from "./candidate-due-date";
import type { CandidateRelationOptions } from "./relation-options";

type EditorValues = {
  title: string;
  description: string;
  dueDate: string;
  plannedDate: string;
  priority: ManualPriority | "";
  noDue: boolean;
  noDueReason: string;
  projectIds: string[];
  contextIds: string[];
  personIds: string[];
  waitingOnPersonIds: string[];
};

const emptyRelationOptions: CandidateRelationOptions = Object.freeze({
  projects: [],
  contexts: [],
  people: [],
});

type FieldError = {
  label: string;
  message: string;
};

const copy = {
  "pt-BR": {
    candidate: (title: string) => `Sugestão: ${title}`,
    edit: (title: string) => `Editar sugestão: ${title}`,
    title: "Título",
    description: "Descrição",
    dueDate: (timezone: string) => `Data limite (${timezone})`,
    plannedDate: (timezone: string) => `Data planejada (${timezone})`,
    priority: "Prioridade",
    priorityOptions: {
      "": "Nenhuma",
      low: "Baixa",
      medium: "Média",
      high: "Alta",
      urgent: "Urgente",
    } as Record<ManualPriority | "", string>,
    noDue: "Sem prazo definido",
    noDueReason: "Motivo (opcional)",
    timezone: (timezone: string) => `Horário em ${timezone}`,
    due: "Prazo",
    planned: "Planejado",
    edited: "Editada",
    original: "Sugestão original",
    noDescription: "Sem descrição",
    noDueDate: "Sem prazo",
    noPriority: "Sem prioridade",
    projects: "Projetos",
    contexts: "Contextos",
    people: "Pessoas",
    waitingOn: "Aguardando por",
    noOptionsAvailable: "Nenhum registro disponível.",
    clearDescription: (title: string) => `Remover descrição: ${title}`,
    clearDueDate: (title: string) => `Remover prazo: ${title}`,
    clearPlannedDate: (title: string) => `Remover data planejada: ${title}`,
    clearProjects: (title: string) => `Remover projetos: ${title}`,
    clearContexts: (title: string) => `Remover contextos: ${title}`,
    clearPeople: (title: string) => `Remover pessoas: ${title}`,
    clearWaitingOn: (title: string) => `Remover pessoas aguardadas: ${title}`,
    noDueLabel: (title: string) => `Sem prazo definido: ${title}`,
    reset: (title: string) => `Restaurar sugestão: ${title}`,
    resetAnnouncement: "Sugestão restaurada.",
    titleRequiredError: {
      label: "Erro no título",
      message: "O título é obrigatório.",
    },
    titleLengthError: {
      label: "Erro de tamanho do título",
      message: "O título deve ter no máximo 240 caracteres.",
    },
    descriptionLengthError: {
      label: "Erro de tamanho da descrição",
      message: "A descrição deve ter no máximo 2.000 caracteres.",
    },
    noDueReasonLengthError: {
      label: "Erro de tamanho do motivo",
      message: "O motivo deve ter no máximo 2.000 caracteres.",
    },
    dueDateErrorLabel: "Erro na data limite",
    dueDateInvalid: "Informe uma data e hora válidas.",
    dueDateGap: "Esse horário não existe no fuso informado.",
    dueDateOverlap: "Esse horário é ambíguo no fuso informado.",
    plannedDateErrorLabel: "Erro na data planejada",
    plannedDateInvalid: "Informe uma data e hora válidas.",
    plannedDateGap: "Esse horário não existe no fuso informado.",
    plannedDateOverlap: "Esse horário é ambíguo no fuso informado.",
  },
  en: {
    candidate: (title: string) => `Suggestion: ${title}`,
    edit: (title: string) => `Edit suggestion: ${title}`,
    title: "Title",
    description: "Description",
    dueDate: (timezone: string) => `Due date (${timezone})`,
    plannedDate: (timezone: string) => `Planned date (${timezone})`,
    priority: "Priority",
    priorityOptions: {
      "": "None",
      low: "Low",
      medium: "Medium",
      high: "High",
      urgent: "Urgent",
    } as Record<ManualPriority | "", string>,
    noDue: "No due date",
    noDueReason: "Reason (optional)",
    timezone: (timezone: string) => `Time in ${timezone}`,
    due: "Due",
    planned: "Planned",
    edited: "Edited",
    original: "Original suggestion",
    noDescription: "No description",
    noDueDate: "No due date",
    noPriority: "No priority",
    projects: "Projects",
    contexts: "Contexts",
    people: "People",
    waitingOn: "Waiting on",
    noOptionsAvailable: "No records available.",
    clearDescription: (title: string) => `Clear description: ${title}`,
    clearDueDate: (title: string) => `Clear due date: ${title}`,
    clearPlannedDate: (title: string) => `Clear planned date: ${title}`,
    clearProjects: (title: string) => `Clear projects: ${title}`,
    clearContexts: (title: string) => `Clear contexts: ${title}`,
    clearPeople: (title: string) => `Clear people: ${title}`,
    clearWaitingOn: (title: string) => `Clear waiting on: ${title}`,
    noDueLabel: (title: string) => `No due date: ${title}`,
    reset: (title: string) => `Reset to suggestion: ${title}`,
    resetAnnouncement: "Suggestion reset.",
    titleRequiredError: {
      label: "Title error",
      message: "Title is required.",
    },
    titleLengthError: {
      label: "Title length error",
      message: "Title must be 240 characters or fewer.",
    },
    descriptionLengthError: {
      label: "Description length error",
      message: "Description must be 2,000 characters or fewer.",
    },
    noDueReasonLengthError: {
      label: "Reason length error",
      message: "Reason must be 2,000 characters or fewer.",
    },
    dueDateErrorLabel: "Due date error",
    dueDateInvalid: "Enter a valid date and time.",
    dueDateGap: "This time does not exist in the selected timezone.",
    dueDateOverlap: "This time is ambiguous in the selected timezone.",
    plannedDateErrorLabel: "Planned date error",
    plannedDateInvalid: "Enter a valid date and time.",
    plannedDateGap: "This time does not exist in the selected timezone.",
    plannedDateOverlap: "This time is ambiguous in the selected timezone.",
  },
} as const;

export type CandidateEditorProps = {
  candidate: ActionableCandidateView;
  entryId: string;
  locale: "pt-BR" | "en";
  onEditChange: (edit: CandidateEditCommand | null) => void;
  onValidityChange?: (valid: boolean) => void;
  relationOptions?: CandidateRelationOptions;
  selected: boolean;
  timezone: string;
};

export function CandidateEditor({
  candidate,
  entryId,
  locale,
  onEditChange,
  onValidityChange,
  relationOptions = emptyRelationOptions,
  selected,
  timezone,
}: CandidateEditorProps) {
  const localized = copy[locale];
  const candidateIndex = Number(candidate.key);
  const originalDescription = candidate.description ?? null;
  const originalDueAt = candidate.dueAt ?? null;
  const originalDueDate = formatInstantForDateTimeLocal(originalDueAt, timezone);
  const suggestionSignature = JSON.stringify([
    candidate.key,
    candidate.title,
    originalDescription,
    originalDueAt,
  ]);
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState(candidate.title);
  const [description, setDescription] = useState(candidate.description ?? "");
  const [dueDate, setDueDate] = useState(originalDueDate);
  const [plannedDate, setPlannedDate] = useState("");
  const [priority, setPriority] = useState<ManualPriority | "">("");
  const [noDue, setNoDue] = useState(false);
  const [noDueReason, setNoDueReason] = useState("");
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [contextIds, setContextIds] = useState<string[]>([]);
  const [personIds, setPersonIds] = useState<string[]>([]);
  const [waitingOnPersonIds, setWaitingOnPersonIds] = useState<string[]>([]);
  const [titleTouched, setTitleTouched] = useState(false);
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  const [dueDateTouched, setDueDateTouched] = useState(false);
  const [plannedDateTouched, setPlannedDateTouched] = useState(false);
  const [noDueReasonTouched, setNoDueReasonTouched] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const synchronizationRef = useRef({
    suggestionSignature,
    timezone,
  });
  const lastEmissionRef = useRef<string | undefined>(undefined);
  const lastValidityRef = useRef<boolean | undefined>(undefined);
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const dueDateId = `${id}-due-date`;
  const plannedDateId = `${id}-planned-date`;
  const priorityId = `${id}-priority`;
  const noDueId = `${id}-no-due`;
  const noDueReasonId = `${id}-no-due-reason`;
  const projectsId = `${id}-projects`;
  const contextsId = `${id}-contexts`;
  const peopleId = `${id}-people`;
  const waitingOnId = `${id}-waiting-on`;
  const titleErrorId = `${id}-title-error`;
  const descriptionErrorId = `${id}-description-error`;
  const dueDateErrorId = `${id}-due-date-error`;
  const plannedDateErrorId = `${id}-planned-date-error`;
  const noDueReasonErrorId = `${id}-no-due-reason-error`;
  const editorPanelId = `${id}-editor`;

  const publishValidity = useCallback((valid: boolean) => {
    if (lastValidityRef.current === valid) {
      return;
    }

    lastValidityRef.current = valid;
    onValidityChange?.(valid);
  }, [onValidityChange]);

  useEffect(() => {
    const previous = synchronizationRef.current;

    if (previous.suggestionSignature !== suggestionSignature) {
      setTitle(candidate.title);
      setDescription(candidate.description ?? "");
      setDueDate(originalDueDate);
      setPlannedDate("");
      setPriority("");
      setNoDue(false);
      setNoDueReason("");
      setProjectIds([]);
      setContextIds([]);
      setPersonIds([]);
      setWaitingOnPersonIds([]);
      setTitleTouched(false);
      setDescriptionTouched(false);
      setDueDateTouched(false);
      setPlannedDateTouched(false);
      setNoDueReasonTouched(false);
      setAnnouncement("");
      setExpanded(false);
      const emptyEmission = serializeCandidateEdits([]);
      if (lastEmissionRef.current !== emptyEmission) {
        lastEmissionRef.current = emptyEmission;
        onEditChange(null);
      }
      publishValidity(true);
    } else if (previous.timezone !== timezone) {
      setDueDate((currentDueDate) => {
        const previousOriginalDueDate = formatInstantForDateTimeLocal(
          originalDueAt,
          previous.timezone,
        );

        if (currentDueDate === previousOriginalDueDate) {
          return originalDueDate;
        }

        try {
          const retainedInstant = localDateTimeToOffsetInstant(
            currentDueDate,
            previous.timezone,
          );
          return formatInstantForDateTimeLocal(retainedInstant, timezone);
        } catch {
          return currentDueDate;
        }
      });
      setPlannedDate((currentPlannedDate) => {
        if (!currentPlannedDate) {
          return currentPlannedDate;
        }

        try {
          const retainedInstant = localDateTimeToOffsetInstant(
            currentPlannedDate,
            previous.timezone,
          );
          return formatInstantForDateTimeLocal(retainedInstant, timezone);
        } catch {
          return currentPlannedDate;
        }
      });
      setAnnouncement("");
    }

    synchronizationRef.current = { suggestionSignature, timezone };
  }, [
    candidate.description,
    candidate.title,
    onEditChange,
    publishValidity,
    originalDueAt,
    originalDueDate,
    suggestionSignature,
    timezone,
  ]);

  const values = {
    title,
    description,
    dueDate,
    plannedDate,
    priority,
    noDue,
    noDueReason,
    projectIds,
    contextIds,
    personIds,
    waitingOnPersonIds,
  };
  const canonicalEdit = safelyBuildEdit({
    candidateIndex,
    originalDueDate,
    suggestion: {
      candidateIndex,
      title: candidate.title,
      description: originalDescription,
      dueAt: originalDueAt,
    },
    timezone,
    values,
  });
  const titleError = titleTouched ? validateTitle(title, locale) : null;
  const descriptionError = descriptionTouched
    ? validateDescription(description, locale)
    : null;
  const dueDateError = dueDateTouched
    ? validateDueDate(dueDate, timezone, locale)
    : null;
  const plannedDateError = plannedDateTouched
    ? validatePlannedDate(plannedDate, timezone, locale)
    : null;
  const noDueReasonError = noDueReasonTouched
    ? validateNoDueReason(noDueReason, locale)
    : null;
  const formattedDueDate = formatDueDateForDisplay(originalDueAt, timezone, locale);

  function emitEdit(nextValues: EditorValues) {
    if (!selected) {
      return;
    }

    recordCandidateEditStarted({ candidateIndex, entryId, locale });

    try {
      publishValidity(true);
      publishEdit(buildEdit({
        candidateIndex,
        originalDueDate,
        suggestion: {
          candidateIndex,
          title: candidate.title,
          description: originalDescription,
          dueAt: originalDueAt,
        },
        timezone,
        values: nextValues,
      }));
    } catch {
      publishValidity(false);
      publishEdit(null);
    }
  }

  function publishEdit(edit: CandidateEditCommand | null) {
    const serializedEdit = serializeCandidateEdits(edit ? [edit] : []);
    if (lastEmissionRef.current === serializedEdit) {
      return;
    }

    lastEmissionRef.current = serializedEdit;
    onEditChange(edit);
  }

  function changeTitle(nextTitle: string) {
    const nextValues = { ...values, title: nextTitle };
    setTitle(nextTitle);
    setAnnouncement("");
    emitEdit(nextValues);
  }

  function changeDescription(nextDescription: string) {
    const nextValues = { ...values, description: nextDescription };
    setDescription(nextDescription);
    setAnnouncement("");
    emitEdit(nextValues);
  }

  function changeDueDate(nextDueDate: string) {
    const nextValues = { ...values, dueDate: nextDueDate };
    setDueDate(nextDueDate);
    setDueDateTouched(true);
    setAnnouncement("");
    emitEdit(nextValues);
  }

  function changePlannedDate(nextPlannedDate: string) {
    const nextValues = { ...values, plannedDate: nextPlannedDate };
    setPlannedDate(nextPlannedDate);
    setPlannedDateTouched(true);
    setAnnouncement("");
    emitEdit(nextValues);
  }

  function changePriority(nextPriority: ManualPriority | "") {
    const nextValues = { ...values, priority: nextPriority };
    setPriority(nextPriority);
    setAnnouncement("");
    emitEdit(nextValues);
  }

  function changeNoDue(nextNoDue: boolean) {
    const nextValues = {
      ...values,
      noDue: nextNoDue,
      dueDate: nextNoDue ? "" : values.dueDate,
      noDueReason: nextNoDue ? values.noDueReason : "",
    };
    setNoDue(nextNoDue);
    if (nextNoDue) {
      setDueDate("");
      setDueDateTouched(false);
    } else {
      setNoDueReason("");
      setNoDueReasonTouched(false);
    }
    setAnnouncement("");
    emitEdit(nextValues);
  }

  function changeNoDueReason(nextNoDueReason: string) {
    const nextValues = { ...values, noDueReason: nextNoDueReason };
    setNoDueReason(nextNoDueReason);
    setAnnouncement("");
    emitEdit(nextValues);
  }

  function changeProjectIds(nextProjectIds: string[]) {
    const nextValues = { ...values, projectIds: nextProjectIds };
    setProjectIds(nextProjectIds);
    setAnnouncement("");
    emitEdit(nextValues);
  }

  function changeContextIds(nextContextIds: string[]) {
    const nextValues = { ...values, contextIds: nextContextIds };
    setContextIds(nextContextIds);
    setAnnouncement("");
    emitEdit(nextValues);
  }

  function changePersonIds(nextPersonIds: string[]) {
    const nextValues = { ...values, personIds: nextPersonIds };
    setPersonIds(nextPersonIds);
    setAnnouncement("");
    emitEdit(nextValues);
  }

  function changeWaitingOnPersonIds(nextWaitingOnPersonIds: string[]) {
    const nextValues = { ...values, waitingOnPersonIds: nextWaitingOnPersonIds };
    setWaitingOnPersonIds(nextWaitingOnPersonIds);
    setAnnouncement("");
    emitEdit(nextValues);
  }

  function resetSuggestion() {
    const editedFieldCount = canonicalEdit ? Object.keys(canonicalEdit.changes).length : 0;
    setTitle(candidate.title);
    setDescription(candidate.description ?? "");
    setDueDate(originalDueDate);
    setPlannedDate("");
    setPriority("");
    setNoDue(false);
    setNoDueReason("");
    setProjectIds([]);
    setContextIds([]);
    setPersonIds([]);
    setWaitingOnPersonIds([]);
    setTitleTouched(false);
    setDescriptionTouched(false);
    setDueDateTouched(false);
    setPlannedDateTouched(false);
    setNoDueReasonTouched(false);
    setAnnouncement(localized.resetAnnouncement);
    publishValidity(true);
    if (selected) {
      publishEdit(null);
    }
    recordCandidateEditReset({ editedFieldCount, entryId, locale });
  }

  function clearDescription() {
    const nextValues = { ...values, description: "" };
    setDescription("");
    setDescriptionTouched(false);
    setAnnouncement("");
    emitEdit(nextValues);
  }

  function clearDueDate() {
    const nextValues = { ...values, dueDate: "" };
    setDueDate("");
    setDueDateTouched(false);
    setAnnouncement("");
    emitEdit(nextValues);
  }

  function clearPlannedDate() {
    const nextValues = { ...values, plannedDate: "" };
    setPlannedDate("");
    setPlannedDateTouched(false);
    setAnnouncement("");
    emitEdit(nextValues);
  }

  function clearProjectIds() {
    changeProjectIds([]);
  }

  function clearContextIds() {
    changeContextIds([]);
  }

  function clearPersonIds() {
    changePersonIds([]);
  }

  function clearWaitingOnPersonIds() {
    changeWaitingOnPersonIds([]);
  }

  return (
    <fieldset
      aria-disabled={!selected}
      className="candidate-editor interpretation-correction-form"
      style={{
        border: "1px solid var(--line)",
        borderRadius: 12,
        margin: 0,
        minWidth: 0,
        padding: 14,
      }}
    >
      <legend style={{ padding: "0 7px", fontSize: 12, fontWeight: 800 }}>
        {localized.candidate(candidate.title)}
      </legend>

      <div className="candidate-copy">
        <strong>{candidate.title}</strong>
        {candidate.description && <small>{candidate.description}</small>}
        {formattedDueDate && <small>{localized.due}: {formattedDueDate}</small>}
        <small>{localized.timezone(timezone)}</small>
      </div>

      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <button
          aria-controls={editorPanelId}
          aria-expanded={expanded}
          aria-label={localized.edit(candidate.title)}
          className="button-secondary"
          disabled={!selected}
          onClick={() => setExpanded((current) => !current)}
          style={{ minHeight: 44, minWidth: 44 }}
          type="button"
        >
          {locale === "pt-BR" ? "Editar sugestão" : "Edit suggestion"}
        </button>
        {canonicalEdit && (
          <span
            className="status-badge"
            style={{ background: "var(--blue-wash)", color: "var(--blue)" }}
          >
            {localized.edited}
          </span>
        )}
      </div>

      {expanded && (
        <div id={editorPanelId} style={{ display: "grid", gap: 14 }}>
          <label className="field-label" htmlFor={titleId}>
            <span>{localized.title}</span>
            <input
              aria-describedby={titleError ? titleErrorId : undefined}
              aria-invalid={titleError ? true : undefined}
              disabled={!selected}
              id={titleId}
              onBlur={() => setTitleTouched(true)}
              onChange={(event) => changeTitle(event.target.value)}
              style={{ minHeight: 44, minWidth: 44 }}
              type="text"
              value={title}
            />
          </label>
          {titleError && (
            <p
              aria-label={titleError.label}
              className="form-error"
              id={titleErrorId}
              role="alert"
            >
              {titleError.message}
            </p>
          )}
          {canonicalEdit?.changes.title !== undefined && (
            <small>{localized.original}: {candidate.title}</small>
          )}

          <label className="field-label" htmlFor={descriptionId}>
            <span>{localized.description}</span>
            <textarea
              aria-describedby={descriptionError ? descriptionErrorId : undefined}
              aria-invalid={descriptionError ? true : undefined}
              disabled={!selected}
              id={descriptionId}
              onBlur={() => setDescriptionTouched(true)}
              onChange={(event) => changeDescription(event.target.value)}
              rows={3}
              style={{ minHeight: 44, minWidth: 44 }}
              value={description}
            />
          </label>
          {descriptionError && (
            <p
              aria-label={descriptionError.label}
              className="form-error"
              id={descriptionErrorId}
              role="alert"
            >
              {descriptionError.message}
            </p>
          )}
          {canonicalEdit?.changes.description !== undefined && (
            <small>
              {localized.original}: {candidate.description ?? localized.noDescription}
            </small>
          )}
          <button
            aria-label={localized.clearDescription(candidate.title)}
            className="button-secondary"
            disabled={!selected}
            onClick={clearDescription}
            style={{ minHeight: 44, minWidth: 44 }}
            type="button"
          >
            {locale === "pt-BR" ? "Remover descrição" : "Clear description"}
          </button>

          <label className="field-label" htmlFor={dueDateId}>
            <span>{localized.dueDate(timezone)}</span>
            <input
              aria-describedby={dueDateError ? dueDateErrorId : undefined}
              aria-invalid={dueDateError ? true : undefined}
              disabled={!selected || noDue}
              id={dueDateId}
              onBlur={() => setDueDateTouched(true)}
              onChange={(event) => changeDueDate(event.target.value)}
              style={{ minHeight: 44, minWidth: 44 }}
              type="datetime-local"
              value={dueDate}
            />
          </label>
          {dueDateError && (
            <p
              aria-label={dueDateError.label}
              className="form-error"
              id={dueDateErrorId}
              role="alert"
            >
              {dueDateError.message}
            </p>
          )}
          {canonicalEdit?.changes.dueAt !== undefined && (
            <small>
              {localized.original}: {formattedDueDate ?? localized.noDueDate}
            </small>
          )}
          <button
            aria-label={localized.clearDueDate(candidate.title)}
            className="button-secondary"
            disabled={!selected}
            onClick={clearDueDate}
            style={{ minHeight: 44, minWidth: 44 }}
            type="button"
          >
            {locale === "pt-BR" ? "Remover prazo" : "Clear due date"}
          </button>

          <label className="field-label" htmlFor={plannedDateId}>
            <span>{localized.plannedDate(timezone)}</span>
            <input
              aria-describedby={plannedDateError ? plannedDateErrorId : undefined}
              aria-invalid={plannedDateError ? true : undefined}
              disabled={!selected}
              id={plannedDateId}
              onBlur={() => setPlannedDateTouched(true)}
              onChange={(event) => changePlannedDate(event.target.value)}
              style={{ minHeight: 44, minWidth: 44 }}
              type="datetime-local"
              value={plannedDate}
            />
          </label>
          {plannedDateError && (
            <p
              aria-label={plannedDateError.label}
              className="form-error"
              id={plannedDateErrorId}
              role="alert"
            >
              {plannedDateError.message}
            </p>
          )}
          <button
            aria-label={localized.clearPlannedDate(candidate.title)}
            className="button-secondary"
            disabled={!selected}
            onClick={clearPlannedDate}
            style={{ minHeight: 44, minWidth: 44 }}
            type="button"
          >
            {locale === "pt-BR" ? "Remover data planejada" : "Clear planned date"}
          </button>

          <label className="field-label" htmlFor={priorityId}>
            <span>{localized.priority}</span>
            <select
              disabled={!selected}
              id={priorityId}
              onChange={(event) => changePriority(event.target.value as ManualPriority | "")}
              style={{ minHeight: 44, minWidth: 44 }}
              value={priority}
            >
              {manualPriorityOptionValues.map((value) => (
                <option key={value || "none"} value={value}>
                  {localized.priorityOptions[value]}
                </option>
              ))}
            </select>
          </label>

          <label className="field-label" htmlFor={noDueId} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input
              aria-label={localized.noDueLabel(candidate.title)}
              checked={noDue}
              disabled={!selected}
              id={noDueId}
              onChange={(event) => changeNoDue(event.target.checked)}
              style={{ minHeight: 44, minWidth: 44 }}
              type="checkbox"
            />
            <span>{localized.noDue}</span>
          </label>

          {noDue && (
            <>
              <label className="field-label" htmlFor={noDueReasonId}>
                <span>{localized.noDueReason}</span>
                <textarea
                  aria-describedby={noDueReasonError ? noDueReasonErrorId : undefined}
                  aria-invalid={noDueReasonError ? true : undefined}
                  disabled={!selected}
                  id={noDueReasonId}
                  onBlur={() => setNoDueReasonTouched(true)}
                  onChange={(event) => changeNoDueReason(event.target.value)}
                  rows={2}
                  style={{ minHeight: 44, minWidth: 44 }}
                  value={noDueReason}
                />
              </label>
              {noDueReasonError && (
                <p
                  aria-label={noDueReasonError.label}
                  className="form-error"
                  id={noDueReasonErrorId}
                  role="alert"
                >
                  {noDueReasonError.message}
                </p>
              )}
            </>
          )}

          <label className="field-label" htmlFor={projectsId}>
            <span>{localized.projects}</span>
            <select
              disabled={!selected || relationOptions.projects.length === 0}
              id={projectsId}
              multiple
              onChange={(event) => changeProjectIds(selectedOptionValues(event))}
              size={Math.min(5, Math.max(2, relationOptions.projects.length))}
              style={{ minHeight: 44, minWidth: 44 }}
              value={projectIds}
            >
              {relationOptions.projects.length === 0
                ? <option disabled value="">{localized.noOptionsAvailable}</option>
                : relationOptions.projects.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
            </select>
          </label>
          <button
            aria-label={localized.clearProjects(candidate.title)}
            className="button-secondary"
            disabled={!selected || relationOptions.projects.length === 0}
            onClick={clearProjectIds}
            style={{ minHeight: 44, minWidth: 44 }}
            type="button"
          >
            {locale === "pt-BR" ? "Remover projetos" : "Clear projects"}
          </button>

          <label className="field-label" htmlFor={contextsId}>
            <span>{localized.contexts}</span>
            <select
              disabled={!selected || relationOptions.contexts.length === 0}
              id={contextsId}
              multiple
              onChange={(event) => changeContextIds(selectedOptionValues(event))}
              size={Math.min(5, Math.max(2, relationOptions.contexts.length))}
              style={{ minHeight: 44, minWidth: 44 }}
              value={contextIds}
            >
              {relationOptions.contexts.length === 0
                ? <option disabled value="">{localized.noOptionsAvailable}</option>
                : relationOptions.contexts.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
            </select>
          </label>
          <button
            aria-label={localized.clearContexts(candidate.title)}
            className="button-secondary"
            disabled={!selected || relationOptions.contexts.length === 0}
            onClick={clearContextIds}
            style={{ minHeight: 44, minWidth: 44 }}
            type="button"
          >
            {locale === "pt-BR" ? "Remover contextos" : "Clear contexts"}
          </button>

          <label className="field-label" htmlFor={peopleId}>
            <span>{localized.people}</span>
            <select
              disabled={!selected || relationOptions.people.length === 0}
              id={peopleId}
              multiple
              onChange={(event) => changePersonIds(selectedOptionValues(event))}
              size={Math.min(5, Math.max(2, relationOptions.people.length))}
              style={{ minHeight: 44, minWidth: 44 }}
              value={personIds}
            >
              {relationOptions.people.length === 0
                ? <option disabled value="">{localized.noOptionsAvailable}</option>
                : relationOptions.people.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
            </select>
          </label>
          <button
            aria-label={localized.clearPeople(candidate.title)}
            className="button-secondary"
            disabled={!selected || relationOptions.people.length === 0}
            onClick={clearPersonIds}
            style={{ minHeight: 44, minWidth: 44 }}
            type="button"
          >
            {locale === "pt-BR" ? "Remover pessoas" : "Clear people"}
          </button>

          <label className="field-label" htmlFor={waitingOnId}>
            <span>{localized.waitingOn}</span>
            <select
              disabled={!selected || relationOptions.people.length === 0}
              id={waitingOnId}
              multiple
              onChange={(event) => changeWaitingOnPersonIds(selectedOptionValues(event))}
              size={Math.min(5, Math.max(2, relationOptions.people.length))}
              style={{ minHeight: 44, minWidth: 44 }}
              value={waitingOnPersonIds}
            >
              {relationOptions.people.length === 0
                ? <option disabled value="">{localized.noOptionsAvailable}</option>
                : relationOptions.people.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
            </select>
          </label>
          <button
            aria-label={localized.clearWaitingOn(candidate.title)}
            className="button-secondary"
            disabled={!selected || relationOptions.people.length === 0}
            onClick={clearWaitingOnPersonIds}
            style={{ minHeight: 44, minWidth: 44 }}
            type="button"
          >
            {locale === "pt-BR" ? "Remover pessoas aguardadas" : "Clear waiting on"}
          </button>

          <button
            aria-label={localized.reset(candidate.title)}
            className="button-secondary"
            disabled={!selected}
            onClick={resetSuggestion}
            style={{ minHeight: 44, minWidth: 44 }}
            type="button"
          >
            {locale === "pt-BR" ? "Restaurar sugestão" : "Reset to suggestion"}
          </button>
        </div>
      )}

      {announcement && (
        <p aria-live="polite" role="status" style={{ margin: 0 }}>
          {announcement}
        </p>
      )}
    </fieldset>
  );
}

const manualPriorityOptionValues: readonly (ManualPriority | "")[] = ["", ...manualPriorityValues];

function selectedOptionValues(event: ChangeEvent<HTMLSelectElement>): string[] {
  return Array.from(event.target.selectedOptions, (option) => option.value);
}

function buildEdit({
  candidateIndex,
  originalDueDate,
  suggestion,
  timezone,
  values,
}: {
  candidateIndex: number;
  originalDueDate: string;
  suggestion: CandidateEditSuggestion;
  timezone: string;
  values: EditorValues;
}): CandidateEditCommand | null {
  const changes: CandidateChanges = {
    title: values.title,
    description: values.description,
  };

  if (values.dueDate !== originalDueDate) {
    changes.dueAt = localDateTimeToOffsetInstant(values.dueDate, timezone);
  }

  if (values.plannedDate !== "") {
    changes.plannedAt = localDateTimeToOffsetInstant(values.plannedDate, timezone);
  }

  if (values.priority !== "") {
    changes.manualPriority = values.priority;
  }

  if (values.noDue) {
    changes.intentionalNoDue = true;
  }

  if (values.noDueReason.trim() !== "") {
    changes.noDueReason = values.noDueReason;
  }

  if (values.projectIds.length > 0) {
    changes.projectIds = values.projectIds;
  }

  if (values.contextIds.length > 0) {
    changes.contextIds = values.contextIds;
  }

  if (values.personIds.length > 0) {
    changes.personIds = values.personIds;
  }

  if (values.waitingOnPersonIds.length > 0) {
    changes.waitingOnPersonIds = values.waitingOnPersonIds;
  }

  const normalized = normalizeCandidateEdits({
    edits: [{ candidateIndex, changes }],
    selectedCandidateIndexes: [candidateIndex],
    suggestions: [suggestion],
  });

  return normalized.edits[0] ?? null;
}

function safelyBuildEdit(input: Parameters<typeof buildEdit>[0]): CandidateEditCommand | null {
  try {
    return buildEdit(input);
  } catch {
    return null;
  }
}

function validateTitle(value: string, locale: CandidateEditorProps["locale"]): FieldError | null {
  const localized = copy[locale];
  const normalized = value.trim();

  if (!normalized) {
    return localized.titleRequiredError;
  }
  if (!candidateEditArraySchema.safeParse([
    { candidateIndex: 0, changes: { title: value } },
  ]).success) {
    return localized.titleLengthError;
  }
  return null;
}

function validateDescription(
  value: string,
  locale: CandidateEditorProps["locale"],
): FieldError | null {
  if (!candidateEditArraySchema.safeParse([
    { candidateIndex: 0, changes: { description: value } },
  ]).success) {
    return copy[locale].descriptionLengthError;
  }
  return null;
}

function validateNoDueReason(
  value: string,
  locale: CandidateEditorProps["locale"],
): FieldError | null {
  if (!candidateEditArraySchema.safeParse([
    { candidateIndex: 0, changes: { noDueReason: value } },
  ]).success) {
    return copy[locale].noDueReasonLengthError;
  }
  return null;
}

function validateDueDate(
  value: string,
  timezone: string,
  locale: CandidateEditorProps["locale"],
): FieldError | null {
  if (!value) {
    return null;
  }

  const localized = copy[locale];
  try {
    localDateTimeToOffsetInstant(value, timezone);
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";

    if (/ambiguous|overlap/i.test(message)) {
      return {
        label: localized.dueDateErrorLabel,
        message: localized.dueDateOverlap,
      };
    }
    if (/nonexistent|gap/i.test(message)) {
      return {
        label: localized.dueDateErrorLabel,
        message: localized.dueDateGap,
      };
    }
    return {
      label: localized.dueDateErrorLabel,
      message: localized.dueDateInvalid,
    };
  }
}

function validatePlannedDate(
  value: string,
  timezone: string,
  locale: CandidateEditorProps["locale"],
): FieldError | null {
  if (!value) {
    return null;
  }

  const localized = copy[locale];
  try {
    localDateTimeToOffsetInstant(value, timezone);
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";

    if (/ambiguous|overlap/i.test(message)) {
      return {
        label: localized.plannedDateErrorLabel,
        message: localized.plannedDateOverlap,
      };
    }
    if (/nonexistent|gap/i.test(message)) {
      return {
        label: localized.plannedDateErrorLabel,
        message: localized.plannedDateGap,
      };
    }
    return {
      label: localized.plannedDateErrorLabel,
      message: localized.plannedDateInvalid,
    };
  }
}

function formatDueDateForDisplay(
  instant: string | null,
  timezone: string,
  locale: CandidateEditorProps["locale"],
): string | null {
  if (!instant) {
    return null;
  }

  formatInstantForDateTimeLocal(instant, timezone);
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "pt-BR", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: locale === "en",
    timeZone: timezone,
  }).format(new Date(instant));
}
