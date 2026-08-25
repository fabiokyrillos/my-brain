"use client";

/**
 * *Abrir* — the one control on an attention-surface notice that is not a verb.
 *
 * `2S-ATTENTION-006`: *"Opening a notice from home marks it seen. The row's
 * state moves, and the assertion reads the row after the interaction."*
 *
 * ## Why it is a form and not a link with an `onClick`
 *
 * The obvious shape is `<a href={…} onClick={fireAndForget}>`, and it is the
 * shape this repository already uses for **analytics** on the attention rows.
 * It is wrong here, and the difference is the point: an analytics event that
 * loses a race with navigation costs a row in a table nobody is waiting on. A
 * **state change** that loses that race leaves the owner looking at a notice
 * they just opened, still unread — which is exactly the defect this whole phase
 * exists to end.
 *
 * So the write completes first and the navigation follows it. The control is
 * disabled while the round is in flight, for the same reason every verb is.
 *
 * ## It creates no authority
 *
 * `2S-TRUST-010`. The write is `markNotification` — the same Server Action the
 * *Lida* verb dispatches to, taken from the same
 * `NOTIFICATION_VERB_HANDLERS` bundle, sending the same `status="read"`. This
 * component chooses *when*, never *what*.
 *
 * ## A notice already read is opened without a write
 *
 * `R-24`, the rule the verb list already carries: a control whose only possible
 * outcome is a no-op should not perform it. An already-seen notice navigates
 * straight through.
 */

import { useRouter } from "next/navigation";
import { useActionState } from "react";

import type { Locale } from "@/lib/preferences";

import { getNotificationActionCopy } from "./action-copy";
import type { MarkHandler } from "./notification-row-actions";

export function NoticeOpenControl({
  locale,
  notificationId,
  href,
  subjectLabel,
  alreadySeen,
  markAction,
}: {
  locale: Locale;
  notificationId: string;
  href: string;
  /** Carried into the accessible name, so twenty rows are twenty destinations. */
  subjectLabel: string;
  alreadySeen: boolean;
  markAction: MarkHandler;
}) {
  const router = useRouter();
  const copy = getNotificationActionCopy(locale);

  const [, formAction, pending] = useActionState(async () => {
    if (!alreadySeen) {
      const payload = new FormData();
      payload.set("locale", locale);
      payload.set("notificationId", notificationId);
      payload.set("status", "read");
      await markAction(payload);
    }
    router.push(href);
    return "opened";
  }, "idle");

  return (
    <form action={formAction} className="notice-open-form">
      <button
        aria-label={copy.openLabel(subjectLabel)}
        className="row-action notice-open-control"
        disabled={pending}
        type="submit"
      >
        {copy.openAction}
      </button>
    </form>
  );
}
