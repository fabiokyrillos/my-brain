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
 * There is therefore **no `useEffect` in this file that REQUESTS permission**.
 * The single call sits inside a click handler, on a page the user navigated to,
 * below the benefit and the content promise that `NotificationSettings`
 * renders. A denial is sticky and often unrecoverable without the user digging
 * through browser settings (T-07), which is why this is worth stating twice.
 *
 * An effect that *reads* what the device already decided is a different act,
 * and it is permitted. `Notification.permission` is a property and
 * `getSubscription()` resolves from what the browser already holds: neither
 * shows the user anything, and neither can be denied.
 * `NOTIFY-CONSENT-STATE-IS-SERVER-ONLY` is why one is now required — the stored
 * consent says what the ACCOUNT agreed to and cannot say whether this device
 * still receives anything, and on 2026-10-27 this surface told the owner alerts
 * were active while their reinstalled phone held no subscription at all. Without
 * reading the device, the only alternative is to keep guessing from the server.
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

import { useEffect, useState, useTransition } from "react";

import {
  notificationFrequencies,
  notificationTypes,
  type NotificationConsentState,
  type NotificationFrequency,
  type NotificationType,
} from "./consent-contract";
import { getNotificationSettingsCopy } from "./copy";
import {
  reconcileDeviceDelivery,
  unreadDeviceFacts,
  type DeviceDeliveryFacts,
  type DevicePermission,
} from "./device-reconciliation";
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

/**
 * What this device reports about itself — read, and nothing more.
 *
 * `Notification.permission` is a property and `getSubscription()` resolves from
 * what the browser already holds. Neither shows the user anything and neither
 * can be refused, which is why this may run on mount while the prompt may not.
 *
 * A browser with no Push API is left UNREAD on purpose rather than reported as
 * blocked: "this browser is blocking notifications" is the wrong sentence for
 * one that was never able to offer them, and the consent vocabulary already has
 * `unsupported` for the device that reported it. That leaves one named residue —
 * a stored `granted` read on a browser without push still shows the old
 * optimistic surface — which is smaller than the wrong sentence would be.
 */
async function readDeviceDeliveryFacts(): Promise<DeviceDeliveryFacts> {
  if (!pushIsAvailable()) return unreadDeviceFacts;
  const permission: DevicePermission = Notification.permission;
  try {
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    return { permission, hasSubscription: existing !== null };
  } catch {
    // A worker that never becomes ready is a fact we do not have, not a device
    // we may accuse. Leaving it unread keeps the surface quiet rather than
    // wrong, which is the whole point of the distinction.
    return { permission, hasSubscription: null };
  }
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
  const [device, setDevice] = useState<DeviceDeliveryFacts>(unreadDeviceFacts);

  /*
   * The reconciliation. It READS ONLY — see the header — and it runs once per
   * mount because the answer changes between visits without this application
   * being involved at all: a reinstall, a cleared site, a permission revoked in
   * the browser's own settings. Nothing here requests anything, so
   * `2M-NOTIFY-003` is untouched.
   */
  useEffect(() => {
    let current = true;
    void readDeviceDeliveryFacts().then((facts) => {
      if (current) setDevice(facts);
    });
    return () => {
      current = false;
    };
  }, []);

  const key = decodeVapidPublicKey(props.pushPublicKey);

  /*
   * The environment cannot deliver: no key configured. Rendering the enable
   * button here would produce a prompt whose grant leads to a subscription that
   * can never receive anything -- a consent the product cannot honour.
   */
  if (key === null) {
    // `quiet-state` is retained deliberately — see the note in
    // `notification-settings.tsx`: this paragraph is what the deployed
    // notifications journey falls back to when `.push-controls` is absent.
    return <p className="quiet-state push-unavailable">{copy.notAvailableYet}</p>;
  }

  /*
   * `granted` in the database and `granted` on this device are two different
   * claims, and only the first one arrived as a prop. This is the second.
   */
  const verdict = reconcileDeviceDelivery(state, device);

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
      /*
       * Both facts are now known rather than guessed: permission was `granted`
       * above or this line is unreachable, and a subscription exists because
       * `fields` was read off one. Without this the repair notice would survive
       * its own repair until the next navigation.
       */
      setDevice({ permission: "granted", hasSubscription: true });
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
    if (result.ok) {
      setState(result.state);
      // The browser subscription was dropped above, so this is a fact too. The
      // revoked consent alone would already silence the notice; recording it
      // keeps the two halves from disagreeing if the consent write is retried.
      setDevice((previous) => ({ ...previous, hasSubscription: false }));
    } else setNotice(copy.saveFailed);
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
      {/*
        One button, two shapes, and the shape is the whole difference: turning
        alerts ON is this surface's promoted action, so it wears the promoted
        form; turning them OFF must stay just as reachable and just as legible
        without competing for attention. Neither branch changed what it does,
        which handler it calls, or when it is disabled.
      */}
      {/*
        `NOTIFY-CONSENT-STATE-IS-SERVER-ONLY`. Under a granted consent the device
        is asked whether it can actually receive anything, and when it cannot the
        surface says so FIRST — the sentence is the reason the controls below
        look the way they do.

        Deliberately NOT a live region. The verdict settles a microtask after
        mount, before anybody has interacted, so `role="status"` here would
        announce a change nobody is present for; and a live region that is
        conditionally rendered is never announced at all, which is the trap this
        avoids rather than falls into. The outcome of a CLICK still goes to the
        `push-notice` region below, which exists for exactly that.
      */}
      {verdict === "device-silent" || verdict === "device-blocked" ? (
        <p className="push-notice">
          {verdict === "device-silent" ? copy.deviceSilent : copy.deviceBlocked}
        </p>
      ) : null}

      {/*
        The repair, offered only where it can work. A blocked browser gets the
        sentence and no button: the click would resolve to `denied` again, and
        `R-24` refuses a control with no consumer. A silent device gets the
        promoted form, because re-subscribing is the action this surface exists
        to offer at that moment.
      */}
      {verdict === "device-silent" ? (
        <button className="push-action" type="button" onClick={run(enable)} disabled={pending}>
          {pending ? copy.enablePending : copy.deviceSilentAction}
        </button>
      ) : null}

      {state === "granted" ? (
        <button className="push-action push-action-off" type="button" onClick={run(disable)} disabled={pending}>
          {copy.disableAction}
        </button>
      ) : (
        <button className="push-action" type="button" onClick={run(enable)} disabled={pending || state === "denied"}>
          {pending ? copy.enablePending : copy.enableAction}
        </button>
      )}

      {/*
        `role="status"` rather than an alert: the outcome is information, and an
        assertive live region would interrupt a screen-reader user mid-sentence
        for something that is not an emergency. `2M-ACCESS-004`.
      */}
      {notice === null ? null : <p className="push-notice" role="status">{notice}</p>}

      {/*
        The preference controls are rendered only under a granted consent.
        Under any other state they would be controls whose value nothing reads
        -- `R-24` again -- because the delivery decision refuses before it ever
        consults a type or a frequency.
      */}
      {state !== "granted" ? null : (
        <div className="push-preferences">
          {/*
            Four cards, and the grouping is the only thing that changed. The
            three `<fieldset>`s stay fieldsets — the legend is what names the
            group to a screen reader (`2M-ACCESS-004`), and a `<div>` with a
            heading would have looked identical and announced nothing. The
            daily cap is deliberately NOT a fourth fieldset: it is a single
            control with a single label, and wrapping one labelled input in a
            group would announce the same words twice.
          */}
          <fieldset className="push-card">
            <legend>{copy.typesHeading}</legend>
            <div className="push-options">
              {notificationTypes.map((type) => (
                <label className="push-option" key={type}>
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
            </div>
          </fieldset>

          <fieldset className="push-card">
            <legend>{copy.frequencyHeading}</legend>
            <div className="push-options">
              {notificationFrequencies.map((option) => (
                <label className="push-option" key={option}>
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
            </div>
          </fieldset>

          <fieldset className="push-card">
            <legend>{copy.quietHeading}</legend>
            <div className="push-times">
              <label className="push-time">
                {copy.quietStartLabel}
                <input
                  type="time"
                  name="quietStart"
                  value={quietStart}
                  onChange={(event) => setQuietStart(event.target.value)}
                />
              </label>
              <label className="push-time">
                {copy.quietEndLabel}
                <input
                  type="time"
                  name="quietEnd"
                  value={quietEnd}
                  onChange={(event) => setQuietEnd(event.target.value)}
                />
              </label>
            </div>
            <p className="push-note">{copy.quietNote}</p>
          </fieldset>

          <div className="push-card">
            <label className="push-cap">
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
            <p className="push-note">{copy.dailyCapNote}</p>
          </div>

          <div className="push-save">
            <button className="push-submit" type="button" onClick={run(savePreferences)} disabled={pending}>
              {copy.savePreferences}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
