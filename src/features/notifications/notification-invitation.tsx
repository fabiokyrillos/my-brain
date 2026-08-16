/**
 * `2O-NOTIFY-002` — the invitation, at a moment of demonstrated value.
 *
 * ## It links; it never prompts
 *
 * The browser permission prompt is raised in exactly one file in this
 * repository and this is not it. `2O-NOTIFY-003` requires the ask to state
 * what will be sent, that payloads carry no content, and how to stop — and a
 * banner that stated all three would have become the settings page. So this
 * carries the reason and a link, and the page it links to carries the ask.
 *
 * ## What "a moment of value" means here
 *
 * `shouldOfferInvitation` decides, and the caller supplies the condition: the
 * account has a reminder still waiting to fire. A brand-new account has none,
 * so *"never on first arrival"* holds by construction rather than by a rule
 * somebody has to remember to apply.
 *
 * It also refuses to appear where it could only lead to a dead end — a browser
 * that has already refused, or one with no support — which
 * `mayInviteAtMomentOfValue` decides from the three facts.
 */

import Link from "next/link";

import { dismissNotificationInvitation } from "./actions";
import { getNotificationSettingsCopy } from "./copy";

export function NotificationInvitation({ locale }: { readonly locale: string }) {
  const copy = getNotificationSettingsCopy(locale);

  return (
    <aside
      aria-label={copy.inviteHeading}
      className="notification-invitation"
      data-notification-invitation="true"
    >
      <div className="notification-invitation-copy">
        <strong>{copy.inviteHeading}</strong>
        <p>{copy.inviteBody}</p>
      </div>
      <div className="notification-invitation-actions">
        {/*
          A link, not a control that could ask the browser anything. The
          destination is the surface that explains the benefit, the payload
          promise, the bounds and how to stop, and it is the only place a
          prompt can be raised — after a further explicit click, there.
        */}
        <Link className="row-action" href={`/${locale}/app/notifications`}>
          {copy.inviteAction}
        </Link>
        <form action={dismissNotificationInvitation}>
          <input name="locale" type="hidden" value={locale} />
          <button className="row-action" type="submit">
            {copy.inviteDismiss}
          </button>
        </form>
      </div>
    </aside>
  );
}
