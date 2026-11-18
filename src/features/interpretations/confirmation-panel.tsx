"use client";

import { Button } from "@/components/ui";
import { useActionState, useMemo } from "react";
import { RotateCcw } from "lucide-react";

/**
 * Slice 2P.1 — the terminal act on an entry whose only remaining "decision" is
 * the interpretation-wide review policy.
 *
 * This panel writes no status. It submits to a Server Action that hands the
 * decision to the database contract, and it renders whatever that contract
 * answered. When the contract refuses because a real decision is still open,
 * the refusal is what the owner sees — the panel has no opinion of its own.
 *
 * Drawn as the record page's other suggestions are (ADR-184): a question in the
 * reading face and its answer beside it, not a boxed panel with a heading and a
 * full-width primary button. The form and its four fields are unchanged.
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
    question: "A leitura está certa?",
    hint: "Confirmar tira este registro da fila.",
    confirm: "Confirmar leitura",
    confirming: "Confirmando…",
    undo: "Desfazer",
    undoing: "Desfazendo…",
    backToQueue: "Voltar para a fila",
  },
  en: {
    question: "Is the reading right?",
    hint: "Confirming takes this record out of the queue.",
    confirm: "Confirm reading",
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
    <div aria-label={text.question} className="record-question" role="group">
      {confirmed ? null : (
        <>
          <p className="record-question-text">{text.question}</p>
          <p className="record-question-meta">{text.hint}</p>
          <form action={confirm} className="record-question-actions">
            <input type="hidden" name="entryId" value={entryId} />
            <input type="hidden" name="interpretationId" value={interpretationId} />
            <input type="hidden" name="operationKey" value={operationKey} />
            <input type="hidden" name="locale" value={locale} />
            <Button loading={confirming} type="submit">
              {confirming ? text.confirming : text.confirm}
            </Button>
          </form>
        </>
      )}

      {confirmState.status === "error" ? <p className="form-error" role="alert">{confirmState.message}</p> : null}

      {confirmed ? (
        <div className="confirmation-result">
          <p aria-live="polite" role="status">{confirmState.message}</p>
          {confirmState.undoId ? (
            <form action={undo} className="undo-action">
              <input type="hidden" name="entryId" value={entryId} />
              <input type="hidden" name="undoId" value={confirmState.undoId} />
              <input type="hidden" name="locale" value={locale} />
              <Button icon={<RotateCcw />} loading={undoing} type="submit">
                {undoing ? text.undoing : text.undo}
              </Button>
            </form>
          ) : null}
          <a className="record-question-link" href={`/${locale}/app/inbox`}>{text.backToQueue}</a>
        </div>
      ) : null}

      {undoState.message ? (
        <p className="record-question-meta" role={undoState.status === "error" ? "alert" : "status"}>{undoState.message}</p>
      ) : null}
    </div>
  );
}
