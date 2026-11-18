"use client";

import { LoaderCircle } from "lucide-react";
import { formatInstant } from "@/lib/time/instant-format";
import { useActionState, useEffect, useRef, useState } from "react";

import { getSettingsCopy } from "@/features/settings/copy";
import { SettingFact } from "@/features/settings/setting-fact";
import type { Locale } from "@/lib/preferences";

import type { ByokActionState } from "./actions";
import { getByokCopy } from "./copy";
import type { CredentialMetadata, CredentialStatus } from "./credential-view";
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
  timeZone,
}: {
  locale: Locale;
  credential: CredentialMetadata;
  pending: PendingEntryCount;
  saveAction: Action;
  removeAction: Action;
  interpretPendingAction: Action;
  /**
   * The owner's zone (`LDC-MISC-001`). This is a client component, so the
   * validated-at date rendered in the **browser's** zone — the one authority the
   * contract names explicitly as not being one.
   */
  timeZone: string;
}) {
  const copy = getByokCopy(locale);
  const settingsCopy = getSettingsCopy(locale);
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
  /*
    Four statuses, four sentences.

    This exhausted three of `CredentialStatus`'s four members and let `removed`
    fall through to `statusAbsent`, so a key the account had and deleted said
    "Nenhuma chave configurada" — the same words as a key never entered. The
    polish pass separated them by `data-status`, which a stylesheet and a test
    can read and a person cannot.

    Written as a `Record` rather than a third ternary so the compiler is the
    thing that notices the next member: a fifth `CredentialStatus` fails to
    typecheck here instead of silently inheriting whichever branch is last.
  */
  const statusLabels: Record<CredentialStatus, string> = {
    active: copy.settings.statusConfigured,
    invalid: copy.settings.statusInvalid,
    removed: copy.settings.statusRemoved,
    absent: copy.settings.statusAbsent,
  };
  const statusLabel = statusLabels[credential.status];

  return (
    /*
      Editorial calmo (ADR-180): the key is a fact with its state beside it and
      its editor underneath, not a card that always shows an empty password
      field.

      - What the page asks of the owner comes first: entries waiting for a key
        to be interpreted, when there are any.
      - The key row states the three answers it always stated (state, keyed
        fingerprint, validity) and opens the SAME form — same fields, same
        hidden witness, same action. It arrives open when there is no working
        key, because then entering one is the page's whole point.
      - Removing the key is the last line, in the risk tone, behind the same
        confirmation.
    */
    <section className="byok-panel" aria-labelledby="byok-heading">
      <h2 className="settings-group-title" id="byok-heading">{copy.settings.title}</h2>
      <p className="settings-group-note">{copy.settings.intro}</p>

      <div className="settings-rows byok-body">
      {showPendingEntries ? (
        <div className="byok-pending" aria-labelledby="byok-pending-heading">
          <div className="byok-pending-copy">
            <h3 id="byok-pending-heading">{copy.pendingEntries.title}</h3>
            <p className="byok-pending-count">
              {pending.atLeast ? `${pending.count}+` : pending.count}
            </p>
            <p>{copy.pendingEntries.description}</p>
          </div>
          <form action={interpretPending}>
            <input type="hidden" name="locale" value={locale} />
            <button className="setting-verb byok-pending-submit" type="submit" disabled={interpretPendingBusy}>
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

      <SettingFact
        className="byok-key"
        closeVerb={settingsCopy.close}
        label={settingsCopy.groups.key}
        open={credential.status !== "active"}
        value={
          /*
            Three separate answers. Metadata only: the fingerprint is a keyed
            digest, never a slice of the key, and it is still the ONLY `<code>`
            in this panel — `byok-settings-journey` matches it by element.
          */
          <span className="byok-state" data-status={credential.status}>
            <span className="byok-badge" data-status={credential.status}>
              <strong>{statusLabel}</strong>
            </span>
            {credential.fingerprint ? (
              <span className="byok-identifier">
                <code>{credential.fingerprint}</code>
              </span>
            ) : null}
            {credential.validatedAt ? (
              <span className="byok-validated">
                {copy.settings.validatedAt}{" "}
                <time dateTime={credential.validatedAt}>
                  {formatInstant(credential.validatedAt, "day", locale, timeZone)}
                </time>
              </span>
            ) : null}
          </span>
        }
        verb={settingsCopy.change}
      >
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
          <p id="byok-key-hint" className="field-hint byok-hint">
            {copy.settings.fieldHint} {copy.settings.neverShown}
          </p>

          <button className="byok-submit" type="submit" disabled={savePending}>
            {savePending ? <LoaderCircle size={16} className="spin" aria-hidden /> : null}
            {credential.configured ? copy.settings.rotate : copy.settings.save}
          </button>
        </form>
      </SettingFact>

      {/*
        The outcome, directly under the row it reports on — outside the editor,
        so it is still on screen when a first save closes the row. Which state
        it renders and when is unchanged: `lastAction` still decides, for the
        reason the header gives.
      */}
      {state.status !== "idle" ? (
        <p role="status" data-state={state.status} className="byok-feedback">
          {state.message}
        </p>
      ) : null}

      {/*
        The destructive action: last, quiet, in the risk tone. Same form, same
        action, same confirmation.
      */}
      {credential.status !== "absent" && credential.status !== "removed" ? (
        <div className="byok-danger">
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
          <button type="submit" className="danger byok-destructive" disabled={removePending}>
            {removePending ? <LoaderCircle size={16} className="spin" aria-hidden /> : null}
            {copy.settings.remove}
          </button>
        </form>
        </div>
      ) : null}
      </div>

      {/*
        `BYOK-COPY`: who can decrypt, and that removal is immediate. On the
        page, not inside the row's editor — a disclosure a reader only meets
        after deciding to type a key in is not a disclosure.
      */}
      <p className="byok-honesty">{copy.settings.honesty}</p>
      <p className="byok-costs-note">{copy.settings.costsNote}</p>
    </section>
  );
}
