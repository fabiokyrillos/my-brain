"use client";

/**
 * The edit and archive surface a memory never had (UX-10).
 *
 * **It decides nothing.** Every sentence arrives already localized, the options
 * are the database's own CHECK literals, and whether a save succeeded was
 * settled by the Server Action. `ENGINEERING_STANDARDS` keeps domain rules out
 * of React, and "is this person mine" is a database question with a database
 * answer (`memories_person_owner_fk`).
 *
 * Collapsed by default, for the reason `entity-edit-form.tsx` records: the
 * detail page's job is to answer "what is this", and the ways to change it sit
 * behind one control so they do not push that answer off the first screen.
 *
 * The lifecycle control is a **separate form**, deliberately. Archiving is not a
 * field edit — it is one named transition with no input to get wrong — and
 * nesting it inside the edit form would both be invalid HTML and make "archive"
 * submit a half-finished edit alongside it.
 */

import { Archive, LoaderCircle, Pencil, RotateCcw } from "lucide-react";
import { useActionState, useId, useState } from "react";

import type { Locale } from "@/lib/preferences";

import { getMemoryCopy } from "./copy";
import { idleMemoryEditState, type MemoryEditState } from "./edit-state";
import type { MemoryLifecycleState } from "./lifecycle";
import { MEMORY_KINDS, MEMORY_SENSITIVITIES, type MemoryKind, type MemorySensitivity } from "./schema";

export type MemoryEditAction = (
  state: MemoryEditState,
  formData: FormData,
) => Promise<MemoryEditState>;

export type MemoryRelationOption = { readonly id: string; readonly name: string };

export type MemoryEditFields = {
  readonly id: string;
  readonly content: string;
  readonly kind: MemoryKind;
  readonly sensitivity: MemorySensitivity;
  readonly important: boolean;
  readonly personId: string | null;
  readonly projectId: string | null;
};

export function MemoryEditForm({
  action,
  lifecycleAction,
  fields,
  locale,
  people,
  projects,
  state: lifecycleState,
}: {
  action: MemoryEditAction;
  lifecycleAction: MemoryEditAction;
  fields: MemoryEditFields;
  locale: Locale;
  /** The owner's existing people and projects. Never created here. */
  people: readonly MemoryRelationOption[];
  projects: readonly MemoryRelationOption[];
  /** Which transition to offer — derived from the row's validity, never guessed here. */
  state: MemoryLifecycleState;
}) {
  const [state, formAction, pending] = useActionState(action, idleMemoryEditState);
  const [lifecycle, lifecycleFormAction, lifecyclePending] = useActionState(
    lifecycleAction,
    idleMemoryEditState,
  );
  const copy = getMemoryCopy(locale);
  const fieldId = useId();

  /**
   * Openness is derived from *which state object* is current, not held as a free
   * boolean — `useActionState` returns a fresh object per round, so a completed
   * save closes the form on its own with no effect resetting it (the reasoning
   * `entity-edit-form.tsx` records in full).
   */
  const [openedFor, setOpenedFor] = useState<MemoryEditState | null>(null);
  const [dismissed, setDismissed] = useState<MemoryEditState | null>(null);
  const open = dismissed !== state && (openedFor === state || state.status === "error");

  const restored = (field: string): string | undefined => state.submitted?.[field];

  const archived = lifecycleState === "archived";

  const lifecycleControl = (
    <form action={lifecycleFormAction} className="memory-lifecycle">
      <input name="locale" type="hidden" value={locale} />
      <input name="memoryId" type="hidden" value={fields.id} />
      <input name="transition" type="hidden" value={archived ? "restore" : "archive"} />
      <div aria-atomic="true" aria-live="polite" className="sr-only" role="status">
        {lifecyclePending
          ? archived
            ? copy.restoring
            : copy.archiving
          : lifecycle.status === "idle"
            ? ""
            : lifecycle.message}
      </div>
      <button className="memory-lifecycle-button" disabled={lifecyclePending} type="submit">
        {lifecyclePending ? (
          <LoaderCircle aria-hidden="true" className="spin" size={15} />
        ) : archived ? (
          <RotateCcw aria-hidden="true" size={15} />
        ) : (
          <Archive aria-hidden="true" size={15} />
        )}
        {archived ? copy.restore : copy.archive}
      </button>
      {/*
        Said next to the control rather than after the fact. "Archive" is the one
        word on this page a user could reasonably read as "delete", and the
        sentence that corrects it is worth more before the click than after.
      */}
      <small className="memory-lifecycle-hint">{copy.archiveExplainer}</small>
      {lifecycle.status !== "idle" && !lifecyclePending ? (
        <p className={`entity-edit-feedback ${lifecycle.status === "error" ? "error" : "success"}`}>
          {lifecycle.message}
        </p>
      ) : null}
    </form>
  );

  if (!open) {
    return (
      <div className="entity-edit memory-controls">
        {/* The outcome of the last round stays visible after the form closes:
            announcing a save and then hiding the only evidence of it would leave
            a screen-reader user with nothing to return to. */}
        <div aria-atomic="true" aria-live="polite" className="sr-only" role="status">
          {state.status === "idle" ? "" : state.message}
        </div>
        <button className="entity-edit-open" onClick={() => setOpenedFor(state)} type="button">
          <Pencil aria-hidden="true" size={15} />
          {copy.edit}
        </button>
        {state.status === "success" ? (
          <p className="entity-edit-feedback success">{state.message}</p>
        ) : null}
        {lifecycleControl}
      </div>
    );
  }

  return (
    <div className="entity-edit memory-controls">
      <form action={formAction} className="entity-edit-form">
        <input name="locale" type="hidden" value={locale} />
        <input name="memoryId" type="hidden" value={fields.id} />

        <div aria-atomic="true" aria-busy={pending} aria-live="polite" className="sr-only" role="status">
          {pending ? copy.saving : state.status === "idle" ? "" : state.message}
        </div>

        <label htmlFor={`${fieldId}-content`}>
          {copy.contentLabel}
          <textarea
            defaultValue={restored("content") ?? fields.content}
            disabled={pending}
            id={`${fieldId}-content`}
            maxLength={4000}
            name="content"
            required
            rows={4}
          />
        </label>

        {/* Each select is keyed on its own default: React applies `defaultValue`
            to a select only on mount, so a restored value needs a remount to
            take. Without the key a refused save would keep the owner's edited
            text and silently revert every dropdown beside it. */}
        <label htmlFor={`${fieldId}-kind`}>
          {copy.kindLabel}
          <select
            defaultValue={restored("kind") ?? fields.kind}
            disabled={pending}
            id={`${fieldId}-kind`}
            key={`kind-${restored("kind") ?? fields.kind}`}
            name="kind"
          >
            {MEMORY_KINDS.map((kind) => (
              <option key={kind} value={kind}>{copy.kinds[kind]}</option>
            ))}
          </select>
        </label>

        <label htmlFor={`${fieldId}-sensitivity`}>
          {copy.sensitivityLabel}
          <select
            defaultValue={restored("sensitivity") ?? fields.sensitivity}
            disabled={pending}
            id={`${fieldId}-sensitivity`}
            key={`sensitivity-${restored("sensitivity") ?? fields.sensitivity}`}
            name="sensitivity"
          >
            {MEMORY_SENSITIVITIES.map((sensitivity) => (
              <option key={sensitivity} value={sensitivity}>{copy.sensitivities[sensitivity]}</option>
            ))}
          </select>
        </label>

        <label htmlFor={`${fieldId}-person`}>
          {copy.relatedPerson}
          <select
            defaultValue={restored("personId") ?? fields.personId ?? ""}
            disabled={pending}
            id={`${fieldId}-person`}
            key={`person-${restored("personId") ?? fields.personId ?? ""}`}
            name="personId"
          >
            <option value="">{copy.relatedNone}</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>{person.name}</option>
            ))}
          </select>
        </label>

        <label htmlFor={`${fieldId}-project`}>
          {copy.relatedProject}
          <select
            defaultValue={restored("projectId") ?? fields.projectId ?? ""}
            disabled={pending}
            id={`${fieldId}-project`}
            key={`project-${restored("projectId") ?? fields.projectId ?? ""}`}
            name="projectId"
          >
            <option value="">{copy.relatedNone}</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
        </label>

        {/*
          The checkbox's own label wraps it, so the accessible name is the
          sentence beside it. The explanatory hint is linked rather than nested,
          for the reason the organization hint records: nested, it would become
          part of the control's *name* instead of advice about it.
        */}
        <label className="memory-checkbox" htmlFor={`${fieldId}-important`}>
          <input
            aria-describedby={`${fieldId}-important-hint`}
            defaultChecked={restored("important") ? restored("important") === "on" : fields.important}
            disabled={pending}
            id={`${fieldId}-important`}
            name="important"
            type="checkbox"
          />
          {copy.importantLabel}
        </label>
        <small className="entity-edit-hint" id={`${fieldId}-important-hint`}>{copy.importantExplainer}</small>

        <div className="entity-edit-actions">
          <button className="entity-edit-save" disabled={pending} type="submit">
            {pending ? <LoaderCircle aria-hidden="true" className="spin" size={15} /> : null}
            {pending ? copy.saving : copy.save}
          </button>
          <button
            className="entity-edit-cancel"
            disabled={pending}
            onClick={() => setDismissed(state)}
            type="button"
          >
            {copy.cancel}
          </button>
        </div>

        {state.status === "error" ? (
          <p className="entity-edit-feedback error">{state.message}</p>
        ) : null}
      </form>
      {lifecycleControl}
    </div>
  );
}
