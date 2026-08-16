/**
 * `2O-NOTIFY-004`, `-005`, `-006`, `-007` — the three facts, the bounds, and
 * the sentence about delivery that this product has to keep saying.
 *
 * ## Three rows, never one indicator
 *
 * `2O-NOTIFY-007` forbids collapsing consent, permission and delivery into one
 * signal. `three-facts.ts` makes the collapse unavailable in the model; this
 * makes it unavailable on the screen. Each row carries its own label, its own
 * sentence and its own `data-notification-fact` attribute, so a guard and a
 * journey can both check that all three rendered — an indicator that quietly
 * became one would fail rather than merely look tidier.
 *
 * ## The delivery row is the one that matters most and looks least important
 *
 * A reader who has granted permission and consented will conclude that alerts
 * work. They may not: push fails with HTTP 403 on a real iPhone and has never
 * run on Android. `2O-NOTIFY-006` forbids claiming delivery, and the strongest
 * reading of that is not silence — silence lets the reader conclude it — but
 * saying the specific thing, next to the two facts that look like good news.
 *
 * This surface **does not** resolve the 403 and must not (`OD-2O-11`).
 */

import { UniversalStateLine } from "@/features/experience/universal-state";

import { getNotificationSettingsCopy } from "./copy";
import type { NotificationThreeFacts } from "./three-facts";

export function NotificationFacts({
  facts,
  locale,
}: {
  readonly facts: NotificationThreeFacts;
  readonly locale: string;
}) {
  const copy = getNotificationSettingsCopy(locale);

  return (
    <section aria-label={copy.factsHeading} className="notification-facts">
      <h3>{copy.factsHeading}</h3>
      <p className="quiet-state">{copy.factsIntro}</p>

      <dl className="notification-fact-list">
        <div className="notification-fact" data-notification-fact="consent" data-fact-value={facts.consent}>
          <dt>{copy.consentFactLabel}</dt>
          <dd>{copy.consentFactValues[facts.consent]}</dd>
        </div>
        <div className="notification-fact" data-notification-fact="permission" data-fact-value={facts.permission}>
          <dt>{copy.permissionFactLabel}</dt>
          <dd>{copy.permissionFactValues[facts.permission]}</dd>
        </div>
        <div className="notification-fact" data-notification-fact="delivery" data-fact-value={facts.delivery}>
          <dt>{copy.deliveryFactLabel}</dt>
          <dd>{copy.deliveryFactValues[facts.delivery]}</dd>
        </div>
      </dl>

      {/*
        `2O-NOTIFY-006`. Rendered through the vocabulary as `error_recoverable`
        rather than as a muted note: it reports something that is not working,
        the reader can act on it (by not relying on device alerts), and the
        state's own safety line is true — nothing the reader wrote is affected.
      */}
      <UniversalStateLine
        className="notification-delivery-caveat"
        description={copy.deliveryCaveat}
        locale={locale}
        state="error_recoverable"
      />

      {/*
        `2O-NOTIFY-004`. A refused browser gets its own recovery text, and it
        is the only state whose recovery is somewhere this product cannot
        reach. Saying "try again" here would be the control that cannot work.
      */}
      {facts.permission === "denied" ? (
        <p className="notification-denied-recovery" data-notification-recovery="denied">
          {copy.deniedRecovery}
        </p>
      ) : null}
    </section>
  );
}

/**
 * `2O-NOTIFY-005` — the bounds, where consent is given.
 *
 * Rendered **above** the enable control rather than inside the preferences
 * that only appear once consent exists. The requirement's reason is the whole
 * point: these are *what makes the consent bounded*, so a reader deciding
 * whether to consent has to be able to read them before deciding, not after.
 *
 * The third bound the requirement names — an important-reminder override —
 * **does not exist in this product**, and `boundsNoOverride` says so. See the
 * note on that copy key.
 */
export function NotificationBounds({ locale }: { readonly locale: string }) {
  const copy = getNotificationSettingsCopy(locale);

  return (
    <section aria-label={copy.boundsHeading} className="notification-bounds" data-notification-bounds="true">
      <h3>{copy.boundsHeading}</h3>
      <ul>
        <li data-bound="quiet_hours">{copy.boundsQuietHours}</li>
        <li data-bound="daily_cap">{copy.boundsDailyCap}</li>
        <li data-bound="no_override">{copy.boundsNoOverride}</li>
      </ul>
      {/* `2O-NOTIFY-003`: how to stop, said at the ask and not after it. */}
      <p className="quiet-state" data-notification-how-to-stop="true">{copy.howToStop}</p>
    </section>
  );
}
