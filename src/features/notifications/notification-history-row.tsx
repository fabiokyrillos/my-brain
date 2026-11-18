import Link from "next/link";

import type { Locale } from "@/lib/preferences";

import { getNotificationSettingsCopy } from "./copy";
import { isOwnerScopedDestination } from "./destination";
import { NotificationVerbs, type NotificationVerbHandlers } from "./notification-row-actions";
import type { NotificationRowView } from "./row-projection";

/**
 * One notice on the Avisos page (Editorial calmo, ADR-180).
 *
 * It reads the way the same notice reads on Hoje:
 *
 *  - **What it is about** — the notice's body, "Renovar o seguro do carro" — is
 *    the row's subject, in the reading face. Life Brain A.5 led with the stored
 *    title and ellipsized the body beside the time, so on a phone three rows
 *    said "Tarefa atrasada" and none said which task.
 *  - **One caption**: the kind of notice (the stored title) and when it
 *    arrived. A notice with no body is headed by its title and the caption is
 *    the time alone.
 *  - **One visible verb, on a notice still unanswered** — the projected primary,
 *    with the rest behind "⋯". A notice already read asks nothing, so it draws
 *    no verb: the same set waits behind the "⋯", primary first.
 *  - **The row is the link.** "Abrir" is the one anchor, and its hit area is
 *    the whole row; on a read row the word itself is not drawn, so the row is
 *    one quiet line. A plain link, deliberately: on this surface following it
 *    must not answer the notice on the reader's behalf (`action-copy.ts`,
 *    `openAction`) — only the attention queue's `NoticeOpenControl` marks on the
 *    way out. It renders only for a destination this product may send the
 *    owner to (`isOwnerScopedDestination`, `2S-ATTENTION-006`).
 *
 * Read and unread are still a word on every row (`2P-SETTINGS-008`). The page
 * now says it once, visibly, over each group, so the row's own word is kept for
 * assistive technology and not drawn on every line.
 */
export function NotificationHistoryRow({
  row,
  locale,
  timeZone,
  handlers,
  createdAtLabel,
}: {
  row: NotificationRowView;
  locale: Locale;
  timeZone: string;
  handlers: NotificationVerbHandlers;
  createdAtLabel: string | null;
}) {
  const copy = getNotificationSettingsCopy(locale);
  const notice = row.notification;
  const unread = notice.status === "unread";
  const body = notice.body.trim() ? notice.body : null;

  return (
    <li className="notification-item" data-status={notice.status}>
      <div className="notification-item-main">
        <p className="notification-item-subject">{body ?? notice.title}</p>
        <p className="notification-item-meta">
          {body ? <span className="notification-item-kind">{notice.title}</span> : null}
          {createdAtLabel ? <span className="notification-item-time">{createdAtLabel}</span> : null}
          <span className="notification-status-badge" data-status={notice.status}>
            {unread ? copy.unreadBadge : copy.readBadge}
          </span>
        </p>
      </div>
      <div className="notification-item-verbs">
        <NotificationVerbs collapsed={!unread} handlers={handlers} iconTrigger locale={locale} row={row} timeZone={timeZone} />
      </div>
      {isOwnerScopedDestination(notice.action_url) ? (
        <Link
          aria-label={`${copy.openDestination}: ${notice.title}`}
          className="notification-open-link"
          href={notice.action_url}
        >
          <span className="notification-open-label">{copy.openDestination}</span>
        </Link>
      ) : null}
    </li>
  );
}
