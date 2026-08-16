/**
 * `2M-NOTIFY-003`, `-008` and `-010` — the governance surface, and what it
 * deliberately does **not** do yet.
 *
 * ## No prompt, and no control that changes nothing
 *
 * `2M-NOTIFY-003`: *"no permission of any kind is requested on first load, on
 * sign-in, or from any surface the user did not navigate to for that purpose.
 * The browser prompt may only be raised **after an explicit user action**, and
 * only after the benefit has been explained on that same surface."*
 *
 * This slice ships the explanation and the honest state, and **no prompt at
 * all** — not a deferred one, not one behind a flag. There is no
 * `Notification.requestPermission` in this file and
 * `phase-2m-push-boundary-guard.test.ts` fails the build if one appears anywhere
 * before slice 2M.4b.
 *
 * It also ships **no controls**. `2M-NOTIFY-004` asks for per-type,
 * per-frequency and quiet-period controls *"each with a consumer that reads
 * it"*, and the consumer is the persisted consent record that migration 2 has
 * not created yet. A control rendered now would change nothing — which is
 * exactly what `R-24` refuses and what slice 2M.0's audit of the five inert
 * preferences was about. So the surface **says so**, in both locales, rather
 * than offering a switch that quietly does nothing.
 *
 * ## The state is read, not assumed
 *
 * The five states are distinguishable and each has its own sentence. `denied`
 * and `unsupported` are the two where the honest answer is "not from here", and
 * both say that plainly — `denied` because the browser will not prompt again,
 * `unsupported` because on iOS the app has to be installed to the home screen
 * first, which is a thing the user can act on and would never guess.
 *
 * ## Content stays where it already is
 *
 * `2M-NOTIFY-008`: the in-app rows remain the surface where content is shown,
 * behind authentication. This section sits **above** that list on the same page
 * and says so, so the promise and the thing it is a promise about are read
 * together.
 */

import type {
  NotificationConsentState,
  NotificationFrequency,
  NotificationType,
} from "./consent-contract";
import { getNotificationSettingsCopy } from "./copy";
import { NotificationBounds, NotificationFacts } from "./notification-facts";
import { PushControls } from "./push-controls";
import { deriveThreeFacts } from "./three-facts";

export function NotificationSettings({
  locale,
  state,
  pushPublicKey,
  enabledTypes,
  frequency,
  quietStart,
  quietEnd,
  dailyCap,
}: {
  locale: string;
  /**
   * The consent state, resolved by the caller.
   *
   * Passed in rather than read here for the reason every other surface in this
   * phase takes its data as a prop: a component that read its own state would be
   * a component every test has to mock a client for, and one that could acquire
   * a write path by accident.
   */
  state: NotificationConsentState;
  /** The PUBLIC half of the VAPID pair, or null when unset in this environment. */
  pushPublicKey: string | null;
  enabledTypes: readonly NotificationType[];
  frequency: NotificationFrequency;
  quietStart: string;
  quietEnd: string;
  dailyCap: number;
}) {
  const copy = getNotificationSettingsCopy(locale);

  return (
    <section aria-label={copy.heading} className="notification-settings">
      <h2>{copy.heading}</h2>
      <p>{copy.benefit}</p>
      <p className="quiet-state">{copy.contentPromise}</p>

      <h3>{copy.stateHeading}</h3>
      {/*
        A `status`, not a bare paragraph: this is the one line on the page whose
        value changes what the user can do, and `2M-ACCESS-004` asks for a state
        a sighted user perceives to be announced.
      */}
      <p data-consent-state={state} role="status">{copy.states[state]}</p>

      {/*
        `2O-NOTIFY-004`/`-006`/`-007`. The single sentence above is the state
        machine's own summary and stays; below it the same situation is broken
        into the three facts that are genuinely separate. A reader who has
        granted permission would otherwise conclude alerts work, and on this
        product's current hardware evidence they may not.
      */}
      <NotificationFacts facts={deriveThreeFacts(state)} locale={locale} />

      {/*
        `2O-NOTIFY-005`. Above the control, not inside the preferences that only
        appear once consent exists — the requirement's own reason is that these
        are what BOUND the consent, so they have to be readable before deciding.
      */}
      <NotificationBounds locale={locale} />

      <p className="quiet-state">{copy.noPromptYet}</p>

      {/*
        Slice 2M.4b. The controls the 2M.4a record routed here, each with a
        consumer: the enable button's consumer is the consent record, and the
        type, frequency, quiet-period and cap controls' consumer is
        `begin_push_delivery`, which reads every one of them before sending.

        `PushControls` is the client boundary and the ONLY place in this
        repository that may raise a browser permission prompt -- and it does so
        from a click handler, below the benefit and the content promise
        rendered above, which is the ordering `2M-NOTIFY-003` requires.
      */}
      <PushControls
        locale={locale}
        state={state}
        pushPublicKey={pushPublicKey}
        enabledTypes={enabledTypes}
        frequency={frequency}
        quietStart={quietStart}
        quietEnd={quietEnd}
        dailyCap={dailyCap}
      />

      <p className="quiet-state">{copy.inAppNote}</p>
    </section>
  );
}
