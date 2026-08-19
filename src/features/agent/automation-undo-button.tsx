"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { UniversalStateLine } from "@/features/experience/universal-state";
import type { Locale } from "@/lib/preferences";
import type { AutomationCategory } from "./automation-policy";
import { idleAutomationState, type AutomationActionState } from "./automation-state";

/**
 * The reversal, with the same outcome handling the policy form has and for the
 * same measured reasons.
 *
 * Undoing a policy change has to visibly put the category back — the reason
 * sentence, the select and the disappearance of this control are all
 * server-rendered facts, and without a refresh none of them moves until the
 * owner reloads. An undo that appears to do nothing is worse than no undo: the
 * owner presses it again, and the second press refuses with `55P03` because the
 * first one already succeeded.
 *
 * ## Why that `55P03` now has its own sentence
 *
 * It is not a generic failure. It means the category moved after this change
 * was recorded, and `public.undo_operation` refused rather than overwriting a
 * newer decision with an older one. Reporting it as *"could not undo, try
 * again"* would invite precisely the retry that will keep being refused.
 *
 * ## Why this stopped reloading the page
 *
 * Slice 2P.4 used `window.location.reload()` here, which was right while
 * Settings was one page with nothing to lose. It stops being right once a
 * failure has a message the owner has not read: a reload would take the message
 * away with everything else. So a success refreshes and a failure navigates
 * nowhere.
 *
 * It holds no state and decides nothing. `public.undo_operation` re-reads the
 * row and refuses regardless of what this button believed.
 */
export function AutomationUndoButton({
  locale,
  undoId,
  category,
  label,
  undoAction,
}: {
  locale: Locale;
  undoId: string;
  /**
   * Carried only so a failure lands on the right row. The database re-reads the
   * recorded operation and decides for itself what it touches, so a wrong value
   * here can misplace a message and nothing more.
   */
  category: AutomationCategory;
  label: string;
  /** Injected, so this component stays free of Server Actions. */
  undoAction: (
    previous: AutomationActionState,
    formData: FormData,
  ) => Promise<AutomationActionState>;
}) {
  const router = useRouter();
  const [outcome, formAction, pending] = useActionState(undoAction, idleAutomationState);
  const refreshed = useRef<AutomationActionState | null>(null);

  useEffect(() => {
    if (outcome.status !== "success") return;
    // One refresh per outcome — see `automation-policy-form.tsx`.
    if (refreshed.current === outcome) return;
    refreshed.current = outcome;
    router.refresh();
  }, [outcome, router]);

  return (
    <form aria-busy={pending} action={formAction}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="undoId" value={undoId} />
      <input type="hidden" name="category" value={category} />
      <button type="submit" className="automation-undo" disabled={pending}>
        {label}
      </button>
      {outcome.status === "error" ? (
        <UniversalStateLine
          className="automation-outcome"
          description={outcome.message}
          locale={locale}
          state="error_recoverable"
        />
      ) : null}
    </form>
  );
}
