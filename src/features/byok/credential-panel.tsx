"use client";

import { Inbox, KeyRound, LoaderCircle, ShieldCheck, ShieldAlert, Trash2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import type { Locale } from "@/lib/preferences";

import type { ByokActionState } from "./actions";
import { getByokCopy } from "./copy";
import type { CredentialMetadata } from "./credential-view";
import type { PendingEntryCount } from "./pending-entries";

/**
 * `BYOK-LIFECYCLE-002/003`, `BYOK-COPY-001…007`.
 *
 * ## Three things this component does not have, and cannot grow by accident
 *
 * **No reveal control.** There is no "show key" button, no `type` toggle on the
 * input, and no code path that receives plaintext to reveal. The value the user
 * types exists in the DOM for the life of the submission and nowhere else.
 *
 * **No prefill.** `defaultValue` is never set on the key field. A password input
 * that arrives pre-filled teaches the browser to store it and teaches the user
 * that the value came back — and it cannot have, because nothing reads it back.
 *
 * **No key in props.** `CredentialMetadata` has five fields and none of them is
 * key material. The component could not render a key if it wanted to.
 *
 * ## Why the field is cleared on submit and on unmount
 *
 * `BYOK-CRYPTO-007` keeps plaintext out of React state beyond the submitting
 * form's own lifetime. An uncontrolled input holds the value in the DOM node;
 * clearing it on both paths means a navigation away, or a second submission,
 * starts from empty rather than from whatever the user pasted twenty minutes
 * ago.
 */

const idle: ByokActionState = { status: "idle" };

type Action = (state: ByokActionState, formData: FormData) => Promise<ByokActionState>;

export function CredentialPanel({
  locale,
  credential,
  pending,
  saveAction,
  removeAction,
  interpretPendingAction,
}: {
  locale: Locale;
  credential: CredentialMetadata;
  pending: PendingEntryCount;
  saveAction: Action;
  removeAction: Action;
  interpretPendingAction: Action;
}) {
  const copy = getByokCopy(locale);
  const [saveState, save, savePending] = useActionState(saveAction, idle);
  const [removeState, remove, removePending] = useActionState(removeAction, idle);
  const [pendingState, interpretPending, interpretPendingBusy] = useActionState(
    interpretPendingAction,
    idle,
  );
  const keyField = useRef<HTMLInputElement>(null);

  // Cleared after every settled submission, and again on unmount. Both, because
  // they are different exits: one is "the user submitted", the other is "the
  // user navigated away mid-typing".
  useEffect(() => {
    if (saveState.status !== "idle" && keyField.current) keyField.current.value = "";
  }, [saveState]);

  useEffect(() => {
    const field = keyField.current;
    return () => {
      if (field) field.value = "";
    };
  }, []);

  /**
   * The feedback belongs to whichever action the user last took.
   *
   * The obvious `saveState.status !== "idle" ? saveState : removeState` is
   * wrong in a way only a full journey reveals: `useActionState` keeps its
   * result forever, so once a save or rotation has succeeded, `saveState` is
   * never idle again — and a subsequent **removal** silently kept showing
   * "Key replaced and validated" while the status beside it read "No key
   * configured". The panel contradicted itself about the one action a user
   * most needs confirmed. Which form was submitted is the only thing that
   * disambiguates two independently-retained states, so it is recorded.
   */
  const [lastAction, setLastAction] = useState<"save" | "remove" | null>(null);
  const state = lastAction === "remove" ? removeState : lastAction === "save" ? saveState : idle;
  // `BYOK-CAPTURE-004`/`005`. Offered only when a key is active and something is
  // actually waiting, so the section is never a button that would do nothing —
  // and never, on any path, something that runs by itself. Saving a key renders
  // this; it does not press it.
  const showPendingEntries = credential.status === "active" && pending.count > 0;
  const statusLabel =
    credential.status === "active"
      ? copy.settings.statusConfigured
      : credential.status === "invalid"
        ? copy.settings.statusInvalid
        : copy.settings.statusAbsent;

  return (
    <section className="settings-section byok-panel" aria-labelledby="byok-heading">
      <div className="settings-section-heading">
        <span>
          <KeyRound size={16} aria-hidden />
        </span>
        <div>
          <h2 id="byok-heading">{copy.settings.title}</h2>
          <p>{copy.settings.intro}</p>
        </div>
      </div>

      <p className="byok-status" data-status={credential.status}>
        {credential.status === "active" ? (
          <ShieldCheck size={16} aria-hidden />
        ) : (
          <ShieldAlert size={16} aria-hidden />
        )}
        <strong>{statusLabel}</strong>
        {/* Metadata only: the fingerprint is a keyed digest, never a slice of
            the key, and it is the most identifying thing shown anywhere. */}
        {credential.fingerprint ? <code>{credential.fingerprint}</code> : null}
        {credential.validatedAt ? (
          <span>
            {copy.settings.validatedAt}{" "}
            <time dateTime={credential.validatedAt}>
              {new Date(credential.validatedAt).toLocaleDateString(locale)}
            </time>
          </span>
        ) : null}
      </p>

      <p className="byok-honesty">{copy.settings.honesty}</p>

      <form action={save} className="byok-form" onSubmit={() => setLastAction("save")}>
        <input type="hidden" name="locale" value={locale} />
        {/* The staleness witness. Present only when a row exists, which is what
            makes this a rotation rather than a first save. */}
        {credential.observedUpdatedAt ? (
          <input type="hidden" name="observedUpdatedAt" value={credential.observedUpdatedAt} />
        ) : null}

        <label htmlFor="byok-api-key">{copy.settings.fieldLabel}</label>
        <input
          ref={keyField}
          id="byok-api-key"
          name="apiKey"
          // `password`, with no toggle. The absence of a reveal control is the
          // requirement, not a default that a later "usability improvement"
          // may quietly reverse.
          type="password"
          autoComplete="off"
          spellCheck={false}
          required
          // Never prefilled. See the header.
          placeholder="sk-…"
          aria-describedby="byok-key-hint"
        />
        <p id="byok-key-hint" className="field-hint">
          {copy.settings.fieldHint} {copy.settings.neverShown}
        </p>

        <button type="submit" disabled={savePending}>
          {savePending ? <LoaderCircle size={16} className="spin" aria-hidden /> : null}
          {credential.configured ? copy.settings.rotate : copy.settings.save}
        </button>
      </form>

      {credential.status !== "absent" && credential.status !== "removed" ? (
        <form
          action={remove}
          className="byok-remove"
          onSubmit={(event) => {
            // `BYOK-LIFECYCLE-006` is irreversible for the user in the sense
            // that matters: the key cannot come back, only be re-entered. An
            // explicit confirmation is the standard's requirement for exactly
            // this shape of action.
            if (!window.confirm(copy.settings.removeConfirm)) {
              event.preventDefault();
              return;
            }
            // Only a confirmed removal owns the feedback line; a cancelled one
            // must leave whatever the previous action said standing.
            setLastAction("remove");
          }}
        >
          <input type="hidden" name="locale" value={locale} />
          <button type="submit" className="danger" disabled={removePending}>
            {removePending ? (
              <LoaderCircle size={16} className="spin" aria-hidden />
            ) : (
              <Trash2 size={16} aria-hidden />
            )}
            {copy.settings.remove}
          </button>
        </form>
      ) : null}

      {showPendingEntries ? (
        <div className="byok-pending" aria-labelledby="byok-pending-heading">
          <h3 id="byok-pending-heading">
            <Inbox size={16} aria-hidden /> {copy.pendingEntries.title}
          </h3>
          <p>{copy.pendingEntries.description}</p>
          <p className="byok-pending-count">
            {pending.atLeast ? `${pending.count}+` : pending.count}
          </p>
          <form action={interpretPending}>
            <input type="hidden" name="locale" value={locale} />
            <button type="submit" disabled={interpretPendingBusy}>
              {interpretPendingBusy ? (
                <LoaderCircle size={16} className="spin" aria-hidden />
              ) : null}
              {copy.pendingEntries.button}
            </button>
          </form>
          {pendingState.status !== "idle" ? (
            <p role="status" data-state={pendingState.status} className="byok-feedback">
              {pendingState.message}
            </p>
          ) : null}
        </div>
      ) : null}

      {state.status !== "idle" ? (
        <p role="status" data-state={state.status} className="byok-feedback">
          {state.message}
        </p>
      ) : null}

      <p className="byok-costs-note">{copy.settings.costsNote}</p>
    </section>
  );
}
