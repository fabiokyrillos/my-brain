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
        <NotificationVerbs handlers={handlers} locale={locale} row={row} />
      </div>
    </article>
  );
}
