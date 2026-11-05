import Link from "next/link";

import type { Locale } from "@/lib/preferences";

import { getNotificationSettingsCopy } from "./copy";
import { isOwnerScopedDestination } from "./destination";
import { NotificationVerbs, type NotificationVerbHandlers } from "./notification-row-actions";
import type { NotificationRowView } from "./row-projection";

/**
 * Life Brain A.5 — one notice on the history page, on the list's own shape.
 *
 * Two lines and one visible control, so fifty notices fit in 3,500px on a
 * phone (`IMPLEMENTATION_PLAN.md` §A.5). The row used to be a bordered card
 * with the title, the body on its own line, a meta row of badge, time and
 * "Abrir", and the verbs wrapping to a full-width row of 44px buttons under
 * all of it — about 180px each.
 *
 *  - **Title**, then **one meta line**: the state as a word (`2P-SETTINGS-008`:
 *    never only a colour), the time, and the body, ellipsized on a phone. The
 *    full body is one tap away, on the destination.
 *  - **One visible control.** "Abrir" when the notice has a destination this
 *    product may send the owner to. A plain link, deliberately: on a HISTORY
 *    surface following a link must not answer the notice on the reader's
 *    behalf (`action-copy.ts`, `openAction`) — only the attention queue's
 *    `NoticeOpenControl` marks on the way out. The verbs sit behind a "⋯" with
 *    the primary verb first (`NotificationVerbs collapsed`). With no
 *    destination the "⋯" is the only control.
 *
 * The page used to render `action_url` straight into a `<Link>`; a stored
 * string is data, and the whitelist the attention row applies
 * (`isOwnerScopedDestination`, `2S-ATTENTION-006`) now applies here too.
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

  return (
    <li className="notification-item" data-status={notice.status}>
      <span aria-hidden="true" className="notification-item-dot" />
      <div className="notification-item-main">
        <p className="notification-item-title">{notice.title}</p>
        <p className="notification-item-meta">
          <span className="notification-status-badge" data-status={notice.status}>
            {unread ? copy.unreadBadge : copy.readBadge}
          </span>
          {createdAtLabel ? <span className="notification-item-time">{createdAtLabel}</span> : null}
          {notice.body ? <span className="notification-item-body">{notice.body}</span> : null}
        </p>
      </div>
      <div className="notification-item-trailing">
        {isOwnerScopedDestination(notice.action_url) ? (
          <Link
            aria-label={`${copy.openDestination}: ${notice.title}`}
            className="row-action notification-open-link"
            href={notice.action_url}
          >
            {copy.openDestination}
          </Link>
        ) : null}
        <NotificationVerbs collapsed handlers={handlers} locale={locale} row={row} timeZone={timeZone} />
      </div>
    </li>
  );
}
