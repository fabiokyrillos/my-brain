"use client";

/**
 * The deletion control, and the only surface that reaches M3.
 *
 * ## Why the preview is fetched rather than passed in
 *
 * The page that renders this control already knows the entity's id, and it
 * would be cheaper to have it count the consequences while it loads. That is
 * refused: the counts must come from `preview_entity_deletion`, because the
 * confirmation's digest is derived from **that function's** census. A second
 * census computed by a page would drift from the one the server binds, and the
 * first symptom would be a confirmation refused as stale for no reason the
 * owner could see — or, far worse, a preview that under-reported while the
 * deletion did more.
 *
 * ## Three states, and why the middle one exists
 *
 * `idle` → `previewed` → `confirmed`. The owner does not confirm from the
 * trigger: they read the enumerated consequences first, and the confirm button
 * only appears once a server-issued confirmation exists for exactly what they
 * were shown. Collapsing the middle step would make the dialog's own numbers
 * the authorization, which `2N-CORRECT-010` forbids in the same sentence that
 * requires the preview.
 *
 * ## Reuse rather than a second dialog
 *
 * `ConfirmDialog` already implements focus entry, a Tab cycle that cannot reach
 * the page behind, and Escape returning focus to the opener — hand-rolled
 * because jsdom does not implement `showModal()`, so a native dialog would make
 * the accessibility requirement unassertable in the one place CI checks it.
 * Writing a second dialog here would mean writing those three behaviours again
 * and testing them nowhere.
 */

import { useActionState, useCallback, useId, useState } from "react";

import type { Locale } from "@/lib/preferences";
import { ConfirmDialog } from "@/features/task-commands/confirm-dialog";

import {
  applyDeletion,
  confirmDeletion,
  previewDeletion,
  undoDeletion,
} from "./actions";
import { IDLE_DELETION_STATE, type DeletionState } from "./state";
import { affectedConsequences, isIsolated, type DeletableEntityType } from "./contracts";
import { getDeletionCopy } from "./copy";

export function DeleteEntityControl({
  locale,
  entityType,
  entityId,
}: {
  locale: Locale;
  entityType: DeletableEntityType;
  entityId: string;
}) {
  const copy = getDeletionCopy(locale);
  const [open, setOpen] = useState(false);
  const headingId = useId();

  /**
   * One key per opening of the dialog, not one per render and not one per
   * mount. It is the idempotency key the confirmation and the apply share, so
   * a double-submit of the same deliberate act is one operation — and a second
   * deliberation is a different one.
   *
   * `useState` with a lazy initialiser rather than `useMemo`: a key that could
   * be recomputed on a re-render would silently split one act into two.
   */
  const [operationKey, setOperationKey] = useState(() => `del-${crypto.randomUUID()}`);

  const [preview, runPreview, previewing] = useActionState(previewDeletion, IDLE_DELETION_STATE);
  const [confirmation, runConfirm, confirming] = useActionState(confirmDeletion, IDLE_DELETION_STATE);
  const [result, runApply, applying] = useActionState(applyDeletion, IDLE_DELETION_STATE);
  const [undone, runUndo, undoing] = useActionState(undoDeletion, IDLE_DELETION_STATE);

  const close = useCallback(() => {
    setOpen(false);
    setOperationKey(`del-${crypto.randomUUID()}`);
  }, []);

  /**
   * The state actually on screen, newest-first.
   *
   * An explicit precedence rather than a merge, because two of these carry a
   * refusal and the owner must see the most recent one — a merge would let a
   * successful preview mask the stale confirmation that came after it.
   */
  const shown: DeletionState =
    undone.status !== "idle" ? undone
      : result.status !== "idle" ? result
        : confirmation.status !== "idle" ? confirmation
          : preview;

  const consequences = shown.preview?.consequences ?? null;
  const busy = previewing || confirming || applying || undoing;

  return (
    <>
      {/*
        Stable, locale-independent hooks for the hosted journeys.
        A journey that selected on translated copy would assert the translation
        rather than the behaviour, and would have to be edited every time a
        sentence improves — which is how an absence assertion quietly stops
        being able to fail.
      */}
      <button
        type="button"
        data-deletion="trigger"
        data-deletion-type={entityType}
        className="button button-danger"
        onClick={() => {
          setOpen(true);
          const data = new FormData();
          data.set("entityType", entityType);
          data.set("entityId", entityId);
          data.set("operationKey", operationKey);
          data.set("locale", locale);
          runPreview(data);
        }}
      >
        {copy.trigger[entityType]}
      </button>

      <ConfirmDialog
        open={open}
        title={copy.dialogTitle[entityType]}
        description={copy.previewIntro}
        cancelLabel={copy.cancel}
        onClose={close}
      >
        {/*
          One live region for every transition — loading, refusal and success —
          so a screen reader hears the outcome rather than only sighted users
          seeing a button change. `2N-ACCESS-003`: announced, not merely styled.
        */}
        <p
          role="status"
          aria-live="polite"
          className="dialog-status"
          data-deletion="status"
          data-deletion-state={previewing ? "loading" : shown.status}
          data-deletion-outcome={shown.outcome ?? ""}
        >
          {previewing ? copy.previewLoading : shown.message ?? ""}
        </p>

        {shown.status === "deleted" && shown.undoId ? (
          <form action={runUndo} data-deletion="undo-form">
            <input type="hidden" name="undoId" value={shown.undoId} />
            <input type="hidden" name="entityType" value={entityType} />
            <input type="hidden" name="entityId" value={entityId} />
            <input type="hidden" name="locale" value={locale} />
            <p>{copy.undoWindow}</p>
            <button type="submit" className="button" disabled={busy}>
              {copy.undoAction}
            </button>
          </form>
        ) : null}

        {consequences && shown.status !== "deleted" ? (
          <div aria-labelledby={headingId} data-deletion="preview">
            <h3 id={headingId}>{copy.consequenceHeading}</h3>
            {isIsolated(consequences) ? (
              <p data-deletion="isolated">{copy.nothingElseAffected}</p>
            ) : (
              <ul>
                {affectedConsequences(consequences).map(({ key, count }) => (
                  <li key={key} data-consequence={key} data-count={count}>
                    {copy.consequences[key](count)}
                  </li>
                ))}
              </ul>
            )}

            <h3>{copy.retentionHeading}</h3>
            <ul>
              {(shown.preview?.retention ?? []).map((kind) => (
                <li key={kind} data-retention={kind}>{copy.retention[kind]}</li>
              ))}
            </ul>

            {shown.preview?.undoAvailable ? <p>{copy.undoAvailable}</p> : null}
          </div>
        ) : null}

        {shown.status === "previewed" || shown.status === "error" ? (
          <form action={runConfirm} data-deletion="confirm-form">
            <input type="hidden" name="entityType" value={entityType} />
            <input type="hidden" name="entityId" value={entityId} />
            <input type="hidden" name="operationKey" value={operationKey} />
            <input type="hidden" name="locale" value={locale} />
            <button type="submit" className="button button-danger" disabled={busy || !consequences}>
              {copy.confirm}
            </button>
          </form>
        ) : null}

        {shown.status === "confirmed" ? (
          <form action={runApply} data-deletion="apply-form">
            <input type="hidden" name="entityType" value={entityType} />
            <input type="hidden" name="entityId" value={entityId} />
            <input type="hidden" name="operationKey" value={operationKey} />
            <input type="hidden" name="locale" value={locale} />
            <button type="submit" className="button button-danger" disabled={busy}>
              {applying ? copy.confirming : copy.confirm}
            </button>
          </form>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
