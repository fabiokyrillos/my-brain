"use client";

/**
 * The create surface organizations and contexts never had (EGC-ORG-003, EGC-CTX-003).
 *
 * Both tables have been fully writable by `authenticated` under forced RLS since
 * `202607160003:185-197`, and until EGC.1 only the interpretation-persistence
 * RPC ever wrote them. So a company could appear in your data because a capture
 * mentioned it, and there was no way to add one deliberately — which is how the
 * Company selector came to report emptiness while owning no way to fix it
 * (`EG-04`).
 *
 * **It decides nothing.** Which fields exist arrives as `kind`, every sentence
 * arrives already localized, and whether a name is taken is a database question
 * with a database answer that the Server Action returns.
 *
 * Collapsed by default, matching `EntityEditForm`: a list page's job is to show
 * what exists, and the way to add is one control rather than a form pushing the
 * list below the fold.
 */

import { LoaderCircle, Plus } from "lucide-react";
import { useActionState, useId, useState } from "react";

import type { Locale } from "@/lib/preferences";

import { getEntityCopy } from "./copy";
import { idleEntityEditState, type EntityEditState } from "./edit-state";
import type { EntityEditAction } from "./entity-edit-form";
import { CONTEXT_KINDS } from "./schema";

export type EntityCreateKind = "organization" | "context";

export function EntityCreateForm({
  action,
  kind,
  locale,
}: {
  action: EntityEditAction;
  kind: EntityCreateKind;
  locale: Locale;
}) {
  const [state, formAction, pending] = useActionState(action, idleEntityEditState);
  const copy = getEntityCopy(locale);
  const fieldId = useId();

  /**
   * Openness derived from *which state object* is current, not held free.
   *
   * `useActionState` returns a fresh object per round, so a completed create
   * closes the form on its own with no effect resetting it. A refusal keeps it
   * open, because there is a name to fix and closing would discard it;
   * `dismissed` is what lets Cancel still work in that case.
   */
  const [openedFor, setOpenedFor] = useState<EntityEditState | null>(null);
  const [dismissed, setDismissed] = useState<EntityEditState | null>(null);
  const open = dismissed !== state && (openedFor === state || state.status === "error");

  /** What the last refused round submitted — React 19 resets the form otherwise. */
  const restored = (field: string): string | undefined => state.submitted?.[field];

  const openLabel = kind === "organization" ? copy.newOrganization : copy.newContext;
  const submitLabel = kind === "organization" ? copy.createOrganization : copy.createContext;
  /** `contexts_name_check` bounds at 120; `organizations_name_check` at 160. */
  const nameMaxLength = kind === "organization" ? 160 : 120;

  if (!open) {
    return (
      <div className="entity-edit entity-create">
        <div aria-atomic="true" aria-live="polite" className="sr-only" role="status">
          {state.status === "idle" ? "" : state.message}
        </div>
        <button className="entity-edit-open" onClick={() => setOpenedFor(state)} type="button">
          <Plus aria-hidden="true" size={15} />
          {openLabel}
        </button>
        {state.status === "success" ? (
          <p className="entity-edit-feedback success">{state.message}</p>
        ) : null}
      </div>
    );
  }

  return (
    <form action={formAction} className="entity-edit entity-edit-form entity-create">
      <input name="locale" type="hidden" value={locale} />

      <div aria-atomic="true" aria-busy={pending} aria-live="polite" className="sr-only" role="status">
        {pending ? copy.saving : state.status === "idle" ? "" : state.message}
      </div>

      <label htmlFor={`${fieldId}-name`}>
        {copy.nameLabel}
        <input
          autoComplete="off"
          defaultValue={restored("name") ?? ""}
          disabled={pending}
          id={`${fieldId}-name`}
          maxLength={nameMaxLength}
          name="name"
          required
          type="text"
        />
      </label>

      <label htmlFor={`${fieldId}-description`}>
        {copy.descriptionLabel}
        <textarea
          defaultValue={restored("description") ?? ""}
          disabled={pending}
          id={`${fieldId}-description`}
          maxLength={4000}
          name="description"
          rows={3}
        />
      </label>

      {kind === "context" ? (
        <label htmlFor={`${fieldId}-kind`}>
          {copy.kindLabel}
          <select
            defaultValue={restored("kind") ?? "work"}
            disabled={pending}
            id={`${fieldId}-kind`}
            key={`kind-${restored("kind") ?? "work"}`}
            name="kind"
          >
            {CONTEXT_KINDS.map((contextKind) => (
              <option key={contextKind} value={contextKind}>{copy.kinds[contextKind]}</option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="entity-edit-actions">
        <button className="entity-edit-save" disabled={pending} type="submit">
          {pending ? <LoaderCircle aria-hidden="true" className="spin" size={16} /> : null}
          {pending ? copy.saving : submitLabel}
        </button>
        <button
          className="entity-edit-cancel"
          disabled={pending}
          onClick={() => { setDismissed(state); setOpenedFor(null); }}
          type="button"
        >
          {copy.cancel}
        </button>
      </div>

      {state.status === "error" ? (
        <p className="entity-edit-feedback error" role="alert">{state.message}</p>
      ) : null}
    </form>
  );
}
