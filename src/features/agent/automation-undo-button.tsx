"use client";

import { useTransition } from "react";

/**
 * The reversal, with the same refresh the policy form needs and for the same
 * measured reason.
 *
 * Undoing a policy change has to visibly put the category back — the reason
 * sentence, the select and the disappearance of this control are all
 * server-rendered facts, and without `router.refresh()` none of them moves
 * until the owner reloads. An undo that appears to do nothing is worse than no
 * undo: the owner presses it again, and the second press refuses with `55P03`
 * because the first one already succeeded.
 *
 * It holds no state and decides nothing. `public.undo_operation` re-reads the
 * row and refuses regardless of what this button believed.
 */
export function AutomationUndoButton({
  locale,
  undoId,
  label,
  undoAction,
}: {
  locale: string;
  undoId: string;
  label: string;
  /** Injected, so this component stays free of Server Actions. */
  undoAction: (formData: FormData) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      aria-busy={pending}
      action={async (formData) => {
        await undoAction(formData);
        /*
          A full reload, for the reason `automation-policy-form.tsx` records at
          length: `router.refresh()` sends its request and the server answers,
          and the screen still keeps the previous generation.

          It matters most here. An undo that appears to do nothing invites a
          second press, and the second press refuses with `55P03` — because the
          first one already succeeded.
        */
        startTransition(() => window.location.reload());
      }}
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="undoId" value={undoId} />
      <button type="submit" className="automation-undo" disabled={pending}>
        {label}
      </button>
    </form>
  );
}
