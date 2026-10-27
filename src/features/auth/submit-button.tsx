"use client";

import { useFormStatus } from "react-dom";

/**
 * `AUTH-SIGNIN-PENDING-STATE` — the submit button that says it was pressed.
 *
 * The sign-in page is a server component whose form posts straight to the
 * `signIn` Server Action, so nothing on it could hold a pending state and the
 * button sat inert between the tap and the navigation. The owner reported it
 * exactly that way: after clicking *Entrar*, "só eu sei que cliquei".
 *
 * `useFormStatus` reports only from inside the `<form>` that is submitting, so
 * reading it requires a component of its own below the form element — which is
 * also what keeps the page a server component rather than turning the whole
 * form, hidden fields and CAPTCHA widget included, into client code.
 *
 * The split between the view and the hook is the one `entryDestination` uses
 * against `src/app/page.tsx`: the part worth asserting is pure and asserted
 * directly, and what reads the environment is a thin adapter over it.
 *
 * `disabled` is not decoration. Two sessions three seconds apart were recorded
 * on a single sign-in, and three in nine seconds the day before; a button that
 * cannot be pressed twice is the difference between discouraging that and
 * preventing it.
 */
export function AuthSubmitButtonView({
  pending,
  label,
  pendingLabel,
}: {
  readonly pending: boolean;
  readonly label: string;
  readonly pendingLabel: string;
}) {
  return (
    <>
      <button type="submit" disabled={pending}>
        {pending ? pendingLabel : label}
      </button>
      {/*
        Mounted from the first render, empty, rather than appearing together
        with its text. A live region created in the same render as its content
        is not announced, so a conditional region announces nothing — which is
        the failure mode this repository has already paid for once.
      */}
      <p aria-atomic="true" aria-live="polite" className="sr-only" role="status">
        {pending ? pendingLabel : ""}
      </p>
    </>
  );
}

/** The adapter. Reads the enclosing form's status and renders the view. */
export function AuthSubmitButton({
  label,
  pendingLabel,
}: {
  readonly label: string;
  readonly pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return <AuthSubmitButtonView pending={pending} label={label} pendingLabel={pendingLabel} />;
}
