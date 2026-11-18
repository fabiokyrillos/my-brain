"use client";

import { useRouter } from "next/navigation";
import { createContext, useActionState, useContext, useEffect, useRef, type ReactNode } from "react";

import type { Locale } from "@/lib/preferences";

import { idleNotificationBulkState, type NotificationBulkState } from "./bulk-state";
import { getNotificationSettingsCopy } from "./copy";

type BulkHandler = (state: NotificationBulkState, formData: FormData) => Promise<NotificationBulkState>;
type BulkScope = "mark_all_read" | "clear_read";

type BulkContext = {
  readonly dispatch: (formData: FormData) => void;
  readonly latest: NotificationBulkState;
  readonly locale: Locale;
  readonly pending: boolean;
  readonly readCount: number;
  readonly unreadCount: number;
};

const NotificationBulkContext = createContext<BulkContext | null>(null);

function useBulk(): BulkContext {
  const value = useContext(NotificationBulkContext);
  if (!value) throw new Error("A notification bulk control was rendered outside NotificationBulkBar.");
  return value;
}

/**
 * Life Brain D.2 — "Marcar todos como lidos" and "Limpar os lidos" (T5),
 * recomposed for Editorial calmo (ADR-180).
 *
 * The two verbs used to sit together in a bar above the list, on every visit,
 * whether or not either was wanted. Each now sits beside what it acts on —
 * `NotificationBulkVerb scope="mark_all_read"` on the line that counts the
 * unread notices, `scope="clear_read"` at the foot of the ones already read —
 * and costs no line of its own.
 *
 * This component is what keeps them one thing: ONE action state for both verbs
 * and the undo, so what `NotificationBulkOutcome` shows is always the latest
 * answer, whichever form produced it. It draws nothing itself.
 *
 * It is always mounted, and so is the outcome, even when both counts are zero:
 * the undo it offers must survive the refresh that empties them. The live
 * region exists, empty, before anything happens, so the outcome is announced
 * (a conditional live region is not).
 *
 * The route is refreshed from here, after the action has settled — never by a
 * `revalidatePath` inside the action, which would re-render this component
 * inside its own transition.
 */
export function NotificationBulkBar({
  applyAction,
  children,
  locale,
  readCount,
  undoAction,
  unreadCount,
}: {
  readonly applyAction: BulkHandler;
  readonly children: ReactNode;
  readonly locale: Locale;
  readonly readCount: number;
  readonly undoAction: BulkHandler;
  readonly unreadCount: number;
}) {
  // Held in a ref: the effect below must fire once per settled answer, never
  // again because the router object is a new one on a later render.
  const router = useRef(useRouter());
  const [latest, dispatch, pending] = useActionState(
    (state: NotificationBulkState, formData: FormData) =>
      formData.get("intent") === "undo" ? undoAction(state, formData) : applyAction(state, formData),
    idleNotificationBulkState,
  );

  useEffect(() => {
    if (latest.status === "applied" || latest.status === "undone") router.current.refresh();
  }, [latest]);

  return (
    <NotificationBulkContext.Provider value={{ dispatch, latest, locale, pending, readCount, unreadCount }}>
      {children}
    </NotificationBulkContext.Provider>
  );
}

/** One bulk verb, drawn only when it has something to act on. */
export function NotificationBulkVerb({ scope }: { readonly scope: BulkScope }) {
  const { dispatch, locale, pending, readCount, unreadCount } = useBulk();
  const copy = getNotificationSettingsCopy(locale).bulk;
  const count = scope === "mark_all_read" ? unreadCount : readCount;
  if (count <= 0) return null;

  return (
    <form action={dispatch} className="notification-bulk-form">
      <input name="locale" type="hidden" value={locale} />
      <input name="scope" type="hidden" value={scope} />
      <button className="notification-bulk-verb" disabled={pending} type="submit">
        {scope === "mark_all_read" ? copy.markAllRead : copy.clearRead}
      </button>
    </form>
  );
}

/** What the last bulk verb did, and the way back. Empty — and no taller than nothing — at rest. */
export function NotificationBulkOutcome() {
  const { dispatch, latest, locale, pending } = useBulk();
  const copy = getNotificationSettingsCopy(locale).bulk;
  const offer = latest.status === "applied" ? latest.undo : null;

  return (
    <div aria-label={copy.label} className="notification-bulk-outcome" role="group">
      <p aria-live="polite" className="notification-bulk-message" role="status">{latest.message}</p>
      {offer ? (
        <form action={dispatch} className="notification-bulk-form">
          <input name="intent" type="hidden" value="undo" />
          <input name="locale" type="hidden" value={locale} />
          <input name="auditId" type="hidden" value={offer.auditId} />
          <button className="notification-bulk-verb" disabled={pending} type="submit">
            {copy.undo}
          </button>
        </form>
      ) : null}
    </div>
  );
}
