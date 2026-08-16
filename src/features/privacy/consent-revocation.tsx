"use client";

import { useState, useTransition } from "react";

import { revokePushConsent } from "@/features/notifications/actions";
import type { NotificationConsentState } from "@/features/product-analytics/contracts";
import type { Locale } from "@/lib/preferences";

import { getPrivacyCopy } from "./copy";

/**
 * The revocation control — `2O-CONSENT-004`.
 *
 * ## It renders a control only when there is a consent to revoke
 *
 * `R-2O-12` and `R-24` refuse a control that changes nothing. Only `granted`
 * has something to revoke, so every other state renders a **sentence** instead
 * of a button. A permanently disabled "revoke" next to "not active" would be
 * the affordance those rules forbid before they forbid the feature.
 *
 * ## The mechanism already existed and had no consumer
 *
 * `revokePushConsent` calls `revoke_push_consent`, which is what
 * `readPushConsent` reads back and what the delivery path honours — so
 * `2O-CONSENT-004`'s *"revoking it is honoured by the mechanism that reads it"*
 * is satisfied by wiring the existing path rather than by building a second one.
 * §82 recorded the inverse mistake being narrowly avoided in slice 2O.4: a
 * requirement that says "connect it" must not be read as "rebuild it", because
 * two writers for one contract can disagree while one with no reader is merely
 * invisible.
 */
export function ConsentRevocation({
  locale,
  state,
}: {
  locale: Locale;
  state: NotificationConsentState;
}) {
  const copy = getPrivacyCopy(locale);
  const [outcome, setOutcome] = useState<"idle" | "revoked" | "failed">("idle");
  const [pending, startTransition] = useTransition();

  if (outcome === "revoked" || state === "revoked") {
    return <p role="status">{copy.consent.revoked}</p>;
  }

  if (state !== "granted") {
    return <p>{copy.consent.notGranted}</p>;
  }

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await revokePushConsent(locale);
            setOutcome(result.ok ? "revoked" : "failed");
          })
        }
      >
        {copy.consent.revoke}
      </button>
      {outcome === "failed" ? <p role="alert">{copy.consent.revokeFailed}</p> : null}
    </div>
  );
}
