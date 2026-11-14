"use client";

import { CheckCheck, Eraser, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/components/ui";
import type { Locale } from "@/lib/preferences";

import { idleNotificationBulkState, type NotificationBulkState } from "./bulk-state";
import { getNotificationSettingsCopy } from "./copy";

type BulkHandler = (state: NotificationBulkState, formData: FormData) => Promise<NotificationBulkState>;

/**
 * Life Brain D.2 — "Marcar todos como lidos" and "Limpar os lidos", above the
 * list (T5).
 *
 * The component is always mounted, in the same place, even when both counts are
 * zero: the undo it offers must survive the refresh that empties them. The live
 * region exists, empty, before anything happens, so the outcome is announced
 * (a conditional live region is not).
 *
 * The route is refreshed from here, after the action has settled — never by a
 * `revalidatePath` inside the action, which would re-render this component
 * inside its own transition.
 */
export function NotificationBulkBar({
  applyAction,
  locale,
  readCount,
  undoAction,
  unreadCount,
}: {
  readonly applyAction: BulkHandler;
  readonly locale: Locale;
  readonly readCount: number;
  readonly undoAction: BulkHandler;
  readonly unreadCount: number;
}) {
  const copy = getNotificationSettingsCopy(locale).bulk;
  // Held in a ref: the effect below must fire once per settled answer, never
  // again because the router object is a new one on a later render.
  const router = useRef(useRouter());
  // One state for both verbs and the undo, so what is shown is always the
  // latest answer, whichever form produced it.
  const [latest, dispatch, pending] = useActionState(
    (state: NotificationBulkState, formData: FormData) =>
      formData.get("intent") === "undo" ? undoAction(state, formData) : applyAction(state, formData),
    idleNotificationBulkState,
  );

  useEffect(() => {
    if (latest.status === "applied" || latest.status === "undone") router.current.refresh();
  }, [latest]);

  const offer = latest.status === "applied" ? latest.undo : null;

  return (
    <div aria-label={copy.label} className="notification-bulk" role="group">
      {unreadCount > 0 || readCount > 0 ? (
        <div className="notification-bulk-verbs">
          {unreadCount > 0 ? (
            <form action={dispatch}>
              <input name="locale" type="hidden" value={locale} />
              <input name="scope" type="hidden" value="mark_all_read" />
              <Button disabled={pending} icon={<CheckCheck />} size="sm" type="submit" variant="secondary">
                {copy.markAllRead}
              </Button>
            </form>
          ) : null}
          {readCount > 0 ? (
            <form action={dispatch}>
              <input name="locale" type="hidden" value={locale} />
              <input name="scope" type="hidden" value="clear_read" />
              <Button disabled={pending} icon={<Eraser />} size="sm" type="submit" variant="ghost">
                {copy.clearRead}
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}
      <div className="notification-bulk-outcome">
        <p aria-live="polite" className="notification-bulk-message" role="status">{latest.message}</p>
        {offer ? (
          <form action={dispatch}>
            <input name="intent" type="hidden" value="undo" />
            <input name="locale" type="hidden" value={locale} />
            <input name="auditId" type="hidden" value={offer.auditId} />
            <Button disabled={pending} icon={<RotateCcw />} size="sm" type="submit" variant="ghost">
              {copy.undo}
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
