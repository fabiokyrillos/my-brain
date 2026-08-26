/**
 * One unanswered notice, on the attention surface.
 *
 * ## What it deliberately does not decide
 *
 * Nothing. The verbs, their order, their copy, their eligibility and the
 * subject they act on all arrive inside `row`, already resolved by
 * `projectNotificationRows`, and are mounted through `NotificationVerbs` —
 * the same function `/app/notifications` mounts. This component contributes the
 * row's *chrome*: an eyebrow saying what kind of thing this is, the notice's own
 * words, and the instant it arrived in the owner's zone.
 *
 * That split is `2S-ACT-011` made structural. Two surfaces that each assembled
 * their own controls could agree today and drift tomorrow; two surfaces that
 * both hand a `NotificationRowView` to one mount cannot disagree at all without
 * one of them visibly ceasing to call it.
 *
 * ## Not a client component
 *
 * It renders no state and handles no event — the interactive half is
 * `NotificationRowActions`, which is `"use client"` and receives the Server
 * Actions as props. Keeping this half on the server is what lets `home-view.tsx`
 * render it without importing any module the `server-only` guard protects.
 */

import { formatInstant } from "@/lib/time/instant-format";
import type { Locale } from "@/lib/preferences";

import { getNotificationActionCopy } from "./action-copy";
import { isOwnerScopedDestination, NoticeOpenControl } from "./notice-open-control";
import { NotificationVerbs, type NotificationVerbHandlers } from "./notification-row-actions";
import type { NotificationRowView } from "./row-projection";

export function AttentionNoticeRow({
  row,
  locale,
  timeZone,
  handlers,
}: {
  row: NotificationRowView;
  locale: Locale;
  /**
   * The owner's zone (`LDC-DAILY-001`). Required, never defaulted — a default
   * here would be the *server's* zone, which is how this repository once
   * rendered the same instant differently on two surfaces.
   */
  timeZone: string;
  handlers: NotificationVerbHandlers;
}) {
  const copy = getNotificationActionCopy(locale);
  const stamp = formatInstant(row.notification.created_at, "dayAndTime", locale, timeZone);

  return (
    <article className="list-row notice-attention-row" data-notice-type={row.notification.type}>
      <div className="list-row-main">
        {/*
          The eyebrow exists because this row sits among entry-derived rows that
          look like it and mean something else. Without it "Precisa de você"
          would hold two kinds of item distinguished only by their verbs.
        */}
        <p className="eyebrow notice-attention-eyebrow">{copy.attentionEyebrow}</p>
        <strong>{row.notification.title}</strong>
        <p>{row.notification.body}</p>
      </div>
      <div className="list-meta">
        {stamp ? <span>{stamp}</span> : null}
        {/*
          `2S-ATTENTION-006`. Rendered only where the notice has somewhere this
          product may send the owner.

          `notifications.action_url` is nullable AND it is a stored string. A
          row is data, and data is untrusted: an absolute URL, a
          protocol-relative `//host` or a `javascript:` payload sitting in that
          column would otherwise become a navigation this surface performed on
          the owner's behalf. `isOwnerScopedDestination` is the whitelist, and a
          destination that fails it renders no control at all — an affordance
          for something that cannot happen is the "controle falso" the direction
          forbids.

          It takes `markAction` out of the same bundle the verbs dispatch
          through, so opening writes through the authority `2S-TRUST-010`
          enumerates rather than through one of its own.
        */}
        {isOwnerScopedDestination(row.notification.action_url) ? (
          <NoticeOpenControl
            alreadySeen={row.notification.status !== "unread"}
            href={row.notification.action_url}
            locale={locale}
            markAction={handlers.markAction}
            notificationId={row.notification.id}
            subjectLabel={row.subjectLabel}
          />
        ) : null}
        <NotificationVerbs handlers={handlers} locale={locale} row={row} timeZone={timeZone} />
      </div>
    </article>
  );
}
