"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ActionableCandidateView } from "@/features/daily-cycle/contracts";
import {
  recordCandidateEditReset,
  recordCandidateEditStarted,
} from "@/features/product-analytics/interaction-events";
import {
  candidateEditArraySchema,
  normalizeCandidateEdits,
  serializeCandidateEdits,
  type CandidateChanges,
  type CandidateEditCommand,
  type CandidateEditSuggestion,
} from "./candidate-edit-contract";
import {
  formatInstantForDateTimeLocal,
  localDateTimeToOffsetInstant,
} from "./candidate-due-date";

type EditorValues = {
  title: string;
  description: string;
  dueDate: string;
};

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
    timezone: (timezone: string) => `Horário em ${timezone}`,
    due: "Prazo",
    edited: "Editada",
    original: "Sugestão original",
    noDescription: "Sem descrição",
    noDueDate: "Sem prazo",
    clearDescription: (title: string) => `Remover descrição: ${title}`,
    clearDueDate: (title: string) => `Remover prazo: ${title}`,
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
    dueDateErrorLabel: "Erro na data limite",
    dueDateInvalid: "Informe uma data e hora válidas.",
    dueDateGap: "Esse horário não existe no fuso informado.",
    dueDateOverlap: "Esse horário é ambíguo no fuso informado.",
  },
  en: {
    candidate: (title: string) => `Suggestion: ${title}`,
    edit: (title: string) => `Edit suggestion: ${title}`,
    title: "Title",
    description: "Description",
    dueDate: (timezone: string) => `Due date (${timezone})`,
    timezone: (timezone: string) => `Time in ${timezone}`,
    due: "Due",
    edited: "Edited",
    original: "Original suggestion",
    noDescription: "No description",
    noDueDate: "No due date",
    clearDescription: (title: string) => `Clear description: ${title}`,
    clearDueDate: (title: string) => `Clear due date: ${title}`,
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
    dueDateErrorLabel: "Due date error",
    dueDateInvalid: "Enter a valid date and time.",
    dueDateGap: "This time does not exist in the selected timezone.",
    dueDateOverlap: "This time is ambiguous in the selected timezone.",
  },
} as const;

export type CandidateEditorProps = {
  candidate: ActionableCandidateView;
  entryId: string;
  locale: "pt-BR" | "en";
  onEditChange: (edit: CandidateEditCommand | null) => void;
  onValidityChange?: (valid: boolean) => void;
  selected: boolean;
  timezone: string;
};

export function CandidateEditor({
  candidate,
  entryId,
  locale,
  onEditChange,
  onValidityChange,
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
  const [titleTouched, setTitleTouched] = useState(false);
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  const [dueDateTouched, setDueDateTouched] = useState(false);
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
  const titleErrorId = `${id}-title-error`;
  const descriptionErrorId = `${id}-description-error`;
  const dueDateErrorId = `${id}-due-date-error`;
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
      setTitleTouched(false);
      setDescriptionTouched(false);
      setDueDateTouched(false);
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

  const values = { title, description, dueDate };
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

  function resetSuggestion() {
    const editedFieldCount = canonicalEdit ? Object.keys(canonicalEdit.changes).length : 0;
    setTitle(candidate.title);
    setDescription(candidate.description ?? "");
    setDueDate(originalDueDate);
    setTitleTouched(false);
    setDescriptionTouched(false);
    setDueDateTouched(false);
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
              disabled={!selected}
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

      <p aria-live="polite" role="status" style={{ margin: 0 }}>
        {announcement}
      </p>
    </fieldset>
  );
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
