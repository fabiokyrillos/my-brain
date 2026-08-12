"use client";

/**
 * `2M-NOTIFY-003`, `-004`, `-010` — the controls, and the only place in this
 * repository permitted to raise a browser permission prompt.
 *
 * ## The prompt is raised by a click and by nothing else
 *
 * `2M-NOTIFY-003`: *"no permission of any kind is requested on first load, on
 * sign-in, or from any surface the user did not navigate to for that purpose.
 * The browser prompt may only be raised **after an explicit user action**, and
 * only after the benefit has been explained on that same surface."*
 *
 * There is therefore **no `useEffect` in this file that touches permission**.
 * The single call sits inside a click handler, on a page the user navigated to,
 * below the benefit and the content promise that `NotificationSettings`
 * renders. A denial is sticky and often unrecoverable without the user digging
 * through browser settings (T-07), which is why this is worth stating twice.
 *
 * ## A control that cannot work is not rendered
 *
 * `R-24` refuses a control with no consumer, and slice 2M.0's audit of five
 * inert scheduling preferences is why. Two states genuinely cannot work: a
 * browser with no Push API, and a deployment with no VAPID public key
 * configured. Both render the honest sentence instead of a switch — and the
 * VAPID case matters operationally, because the key is an owner action and this
 * surface must not look broken while it is pending.
 *
 * ## What this file may not have
 *
 * No private key, no sender, no payload construction. It hands three opaque
 * browser-generated strings to a Server Action and renders what comes back.
 */

import { useState, useTransition } from "react";

import {
  notificationFrequencies,
  notificationTypes,
  type NotificationConsentState,
  type NotificationFrequency,
  type NotificationType,
} from "./consent-contract";
import { getNotificationSettingsCopy } from "./copy";
import { decodeVapidPublicKey, readSubscriptionFields } from "./push-encoding";
import {
  registerPushSubscription,
  reportPushConsentState,
  revokePushConsent,
  updateNotificationPreferences,
} from "./actions";

export type PushControlsProps = Readonly<{
  locale: string;
  state: NotificationConsentState;
  /** The PUBLIC half of the VAPID pair, or null when the environment has none. */
  pushPublicKey: string | null;
  enabledTypes: readonly NotificationType[];
  frequency: NotificationFrequency;
  quietStart: string;
  quietEnd: string;
  dailyCap: number;
}>;

/** Whether this browser can do push at all. Read once, at click time. */
function pushIsAvailable(): boolean {
  return (
    typeof window !== "undefined"
    && "Notification" in window
    && "serviceWorker" in navigator
    && "PushManager" in window
  );
}

export function PushControls(props: PushControlsProps) {
  const copy = getNotificationSettingsCopy(props.locale);
  const [state, setState] = useState<NotificationConsentState>(props.state);
  const [types, setTypes] = useState<readonly NotificationType[]>(props.enabledTypes);
  const [frequency, setFrequency] = useState<NotificationFrequency>(props.frequency);
  const [quietStart, setQuietStart] = useState(props.quietStart);
  const [quietEnd, setQuietEnd] = useState(props.quietEnd);
  const [dailyCap, setDailyCap] = useState(props.dailyCap);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const key = decodeVapidPublicKey(props.pushPublicKey);

  /*
   * The environment cannot deliver: no key configured. Rendering the enable
   * button here would produce a prompt whose grant leads to a subscription that
   * can never receive anything -- a consent the product cannot honour.
   */
  if (key === null) {
    return <p className="quiet-state">{copy.notAvailableYet}</p>;
  }

  async function enable() {
    setNotice(null);
    if (!pushIsAvailable()) {
      // Reported so the state is recorded rather than inferred from silence,
      // and so `denied` and `unsupported` stay the distinguishable pair
      // `2M-NOTIFY-010` requires.
      await reportPushConsentState("unsupported", props.locale);
      setState("unsupported");
      return;
    }

    // THE PROMPT. Inside a click handler, and nowhere else in the repository.
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      await reportPushConsentState("denied", props.locale);
      setState("denied");
      setNotice(copy.permissionRefused);
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (subscription === null) {
      subscription = await registration.pushManager.subscribe({
        // Required by every current browser, and honest: every push this
        // product sends renders a notification the user sees. A silent push
        // would be a background capability nobody consented to.
        userVisibleOnly: true,
        applicationServerKey: key as BufferSource,
      });
    }

    const fields = readSubscriptionFields(subscription);
    if (fields === null) {
      // A half-built subscription would be stored as consent that silently
      // never delivers, so it is refused rather than recorded.
      setNotice(copy.saveFailed);
      return;
    }

    const result = await registerPushSubscription(fields, props.locale);
    if (result.ok) {
      setState(result.state);
      setTypes(notificationTypes);
      setFrequency("immediate");
    } else {
      setNotice(copy.saveFailed);
    }
  }

  async function disable() {
    setNotice(null);
    // The browser subscription goes first, then the server record. In this
    // order a failure leaves the user MORE protected rather than less: an
    // unsubscribed browser with a stale server row receives nothing, while the
    // reverse would keep a live browser subscription the server no longer
    // governs.
    if (pushIsAvailable()) {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (existing) await existing.unsubscribe().catch(() => false);
    }
    const result = await revokePushConsent(props.locale);
    if (result.ok) setState(result.state);
    else setNotice(copy.saveFailed);
  }

  async function savePreferences() {
    setNotice(null);
    const result = await updateNotificationPreferences({
      enabledTypes: types,
      frequency,
      quietStart,
      quietEnd,
      dailyCap,
    }, props.locale);
    setNotice(result.ok ? copy.saved : copy.saveFailed);
  }

  const run = (work: () => Promise<void>) => () => startTransition(() => { void work(); });

  return (
    <div className="push-controls">
      {state === "granted" ? (
        <button type="button" onClick={run(disable)} disabled={pending}>
          {copy.disableAction}
        </button>
      ) : (
        <button type="button" onClick={run(enable)} disabled={pending || state === "denied"}>
          {pending ? copy.enablePending : copy.enableAction}
        </button>
      )}

      {/*
        `role="status"` rather than an alert: the outcome is information, and an
        assertive live region would interrupt a screen-reader user mid-sentence
        for something that is not an emergency. `2M-ACCESS-004`.
      */}
      {notice === null ? null : <p role="status">{notice}</p>}

      {/*
        The preference controls are rendered only under a granted consent.
        Under any other state they would be controls whose value nothing reads
        -- `R-24` again -- because the delivery decision refuses before it ever
        consults a type or a frequency.
      */}
      {state !== "granted" ? null : (
        <div className="push-preferences">
          <fieldset>
            <legend>{copy.typesHeading}</legend>
            {notificationTypes.map((type) => (
              <label key={type}>
                <input
                  type="checkbox"
                  name="notificationType"
                  value={type}
                  checked={types.includes(type)}
                  onChange={(event) => {
                    setTypes(event.target.checked
                      ? [...types, type]
                      : types.filter((candidate) => candidate !== type));
                  }}
                />
                {copy.types[type]}
              </label>
            ))}
          </fieldset>

          <fieldset>
            <legend>{copy.frequencyHeading}</legend>
            {notificationFrequencies.map((option) => (
              <label key={option}>
                <input
                  type="radio"
                  name="notificationFrequency"
                  value={option}
                  checked={frequency === option}
                  onChange={() => setFrequency(option)}
                />
                {copy.frequencies[option]}
              </label>
            ))}
          </fieldset>

          <fieldset>
            <legend>{copy.quietHeading}</legend>
            <label>
              {copy.quietStartLabel}
              <input
                type="time"
                name="quietStart"
                value={quietStart}
                onChange={(event) => setQuietStart(event.target.value)}
              />
            </label>
            <label>
              {copy.quietEndLabel}
              <input
                type="time"
                name="quietEnd"
                value={quietEnd}
                onChange={(event) => setQuietEnd(event.target.value)}
              />
            </label>
            <p className="quiet-state">{copy.quietNote}</p>
          </fieldset>

          <label>
            {copy.dailyCapLabel}
            <input
              type="number"
              name="dailyCap"
              min={0}
              max={20}
              value={dailyCap}
              onChange={(event) => setDailyCap(Number(event.target.value))}
            />
          </label>
          <p className="quiet-state">{copy.dailyCapNote}</p>

          <button type="button" onClick={run(savePreferences)} disabled={pending}>
            {copy.savePreferences}
          </button>
        </div>
      )}
    </div>
  );
}
