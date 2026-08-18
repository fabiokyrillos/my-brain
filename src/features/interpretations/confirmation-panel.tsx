"use client";

import { useActionState, useMemo } from "react";
import { CheckCheck, LoaderCircle, RotateCcw } from "lucide-react";

/**
 * Slice 2P.1 — the terminal act on an entry whose only remaining "decision" is
 * the interpretation-wide review policy.
 *
 * This panel writes no status. It submits to a Server Action that hands the
 * decision to the database contract, and it renders whatever that contract
 * answered. When the contract refuses because a real decision is still open,
 * the refusal is what the owner sees — the panel has no opinion of its own.
 */
export type ConfirmationActionState = {
  status: "idle" | "success" | "error";
  message: string;
  undoId?: string;
};

export type ConfirmationAction = (
  state: ConfirmationActionState,
  formData: FormData,
) => Promise<ConfirmationActionState>;

const idleState: ConfirmationActionState = { status: "idle", message: "" };

const copy = {
  "pt-BR": {
    heading: "Nada mais a decidir",
    hint: "Revise a interpretação e confirme para tirar esta entrada da fila.",
    confirm: "Confirmar interpretação",
    confirming: "Confirmando…",
    undo: "Desfazer",
    undoing: "Desfazendo…",
    backToQueue: "Voltar para a fila",
  },
  en: {
    heading: "Nothing left to decide",
    hint: "Read the interpretation and confirm to take this entry out of the queue.",
    confirm: "Confirm interpretation",
    confirming: "Confirming…",
    undo: "Undo",
    undoing: "Undoing…",
    backToQueue: "Back to the queue",
  },
} as const;

export function ConfirmationPanel({
  entryId,
  interpretationId,
  locale,
  confirmAction,
  undoAction,
}: {
  entryId: string;
  interpretationId: string;
  locale: "pt-BR" | "en";
  confirmAction: ConfirmationAction;
  undoAction: ConfirmationAction;
}) {
  const [confirmState, confirm, confirming] = useActionState(confirmAction, idleState);
  const [undoState, undo, undoing] = useActionState(undoAction, idleState);
  const text = copy[locale];

  /*
    A stable key per (entry, interpretation) mount. Replaying the same key is a
    true replay at the database — it deduplicates on
    (user_id, operation_key), never on the entry's current status — so a double
    submit or a retried request cannot produce a second confirmation.
  */
  const operationKey = useMemo(
    () => `confirm-interpretation:${entryId}:${interpretationId}`,
    [entryId, interpretationId],
  );

  const confirmed = confirmState.status === "success" && undoState.status !== "success";

  return (
    <section className="no-action-state" aria-live="polite">
      <h2>{text.heading}</h2>
      <p>{text.hint}</p>

      {confirmed ? null : (
        <form action={confirm} className="candidate-form">
          <input type="hidden" name="entryId" value={entryId} />
          <input type="hidden" name="interpretationId" value={interpretationId} />
          <input type="hidden" name="operationKey" value={operationKey} />
          <input type="hidden" name="locale" value={locale} />
          <button type="submit" className="button-primary" disabled={confirming}>
            {confirming ? <LoaderCircle aria-hidden className="spin" /> : <CheckCheck aria-hidden />}
            {confirming ? text.confirming : text.confirm}
          </button>
        </form>
      )}

      {confirmState.message ? <p>{confirmState.message}</p> : null}
      {undoState.message ? <p>{undoState.message}</p> : null}

      {confirmed && confirmState.undoId ? (
        <form action={undo} className="undo-action">
          <input type="hidden" name="entryId" value={entryId} />
          <input type="hidden" name="undoId" value={confirmState.undoId} />
          <input type="hidden" name="locale" value={locale} />
          <button type="submit" className="button-secondary" disabled={undoing}>
            {undoing ? <LoaderCircle aria-hidden className="spin" /> : <RotateCcw aria-hidden />}
            {undoing ? text.undoing : text.undo}
          </button>
        </form>
      ) : null}

      {confirmed ? (
        <p>
          <a href={`/${locale}/app/inbox`}>{text.backToQueue}</a>
        </p>
      ) : null}
    </section>
  );
}
