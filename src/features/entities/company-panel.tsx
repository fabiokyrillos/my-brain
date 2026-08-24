"use client";

/**
 * The person's company, edited where it is displayed (`2P-PERSON-001`,
 * `2P-PERSON-002`, `2P-PERSON-003`, `2P-PERSON-004`).
 *
 * ## What this replaces
 *
 * The company used to be read-only prose in the person's header, and changing it
 * meant scrolling to a `<details>` disclosure, opening a nine-field form, and
 * finding the selector inside it — then, to add a company that did not exist
 * yet, opening a *second* disclosure beside that form. Three openings for one
 * intention. This is one control, in the section that shows the value, and the
 * two halves of the flow — pick what exists, add what does not — are two panes of
 * the same dialog rather than two nested surfaces.
 *
 * ## Why the dialog is `ConfirmDialog`
 *
 * It is the repository's shared modal contract and it already supplies, each
 * with a test, the three behaviours a native `<dialog>` would have given:
 * initial focus into the panel, a Tab cycle that cannot reach the page behind,
 * and Escape closing it with focus returning to the control that opened it.
 * `2P-PERSON-004` asks for exactly those and for no nested dialogs, so this
 * mounts **one** and swaps its contents. The recorded reason it is hand-rolled —
 * jsdom implements `HTMLDialogElement` without `showModal` — is unchanged and is
 * not revisited here.
 *
 * ## The created-but-not-linked outcome changes the pane
 *
 * `2P-PERSON-003` asks for that outcome to be reported distinctly and to not
 * invite a duplicate retry. Reporting it is the action's job and was already
 * built; **not inviting the retry** is this component's, and it is behaviour
 * rather than wording: on that outcome the dialog returns to the selector, where
 * the company that now exists can be picked. Leaving the create pane open would
 * put the owner's cursor in a name field that has just been used successfully,
 * which is an invitation to press it again and get a second company.
 *
 * The branch is taken on `state.code`, never on the message: comparing against a
 * localized sentence would break silently the first time either translation is
 * reworded.
 */

import { Building2, LoaderCircle, Pencil } from "lucide-react";
import { useActionState, useId, useState } from "react";

import { ConfirmDialog } from "@/features/task-commands/confirm-dialog";
import type { Locale } from "@/lib/preferences";

import { getEntityCopy } from "./copy";
import { idleEntityEditState, type EntityEditState } from "./edit-state";
import type { EntityEditAction, OrganizationOption } from "./entity-edit-form";

export function CompanyPanel({
  createAction,
  linkAction,
  locale,
  organizationId,
  organizationName,
  organizations,
  personId,
}: {
  /** `createOrganizationForSubject` — reused unchanged, both writes and both audits. */
  createAction: EntityEditAction;
  /** `linkPersonOrganization` — the narrow assignment of an existing company. */
  linkAction: EntityEditAction;
  locale: Locale;
  organizationId: string | null;
  /** Resolved by the page, so this component performs no lookup of its own. */
  organizationName: string | null;
  organizations: readonly OrganizationOption[];
  personId: string;
}) {
  const copy = getEntityCopy(locale);
  const fieldId = useId();

  const [linkState, link, linking] = useActionState(linkAction, idleEntityEditState);
  const [createState, create, createPending] = useActionState(createAction, idleEntityEditState);
  const pending = linking || createPending;

  /**
   * The two action states as they stood when the dialog was opened, and whether
   * the owner has since dismissed it.
   *
   * ## Why openness is DERIVED and not stored
   *
   * The first version closed the dialog from an effect, and against the deployed
   * app it hung **permanently**: the owner saw *Salvando…*, the row was written,
   * and nothing ever moved again. It reproduced only with a dialog *and* a
   * `revalidatePath` — the inline role editor on the same page, revalidating the
   * same route, was unaffected, and removing the revalidation let the dialog
   * close. Three builds and four authenticated runs to isolate.
   *
   * The mechanism the evidence points at: the successful state arrives together
   * with the re-rendered page, and the transition that owns `pending` is still
   * applying that payload. Closing unmounts the `<form>` that dispatched it —
   * `ConfirmDialog` renders `null` when shut — which takes the in-flight
   * dispatcher out from under React mid-commit, and `pending` never comes back
   * down.
   *
   * So the close waits for `pending` to fall, and it is expressed as a
   * derivation rather than a second effect. That is not only lint: a stored
   * "close me" flag is a fact about the past that can disagree with React's own
   * transition, and the whole failure above was two sources of truth about
   * whether a round had finished.
   *
   * Reopening works because the snapshot is retaken: the success that closed the
   * dialog is no longer *newer than the snapshot*, so it cannot close it again.
   */
  const [round, setRound] = useState<{ link: EntityEditState; create: EntityEditState } | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [createRequested, setCreateRequested] = useState(false);
  /** Which pane ran the last submission. Set from `onSubmit`, never from state. */
  const [submittedPane, setSubmittedPane] = useState<"link" | "create" | null>(null);


  /**
   * The round that has completed since the dialog opened, or `null`.
   *
   * **Keyed on the pane the owner last submitted from**, which is an event and
   * therefore needs no effect. A fixed preference between the two states cannot
   * work, because both orders are reachable: create → `createdButNotLinked` →
   * select, and select → refusal → create. Whichever is checked first would go
   * on reporting a failure the owner had already fixed — which is the defect the
   * first draft shipped and its own test caught.
   */
  const changed =
    round === null || submittedPane === null
      ? null
      : submittedPane === "create"
        ? (createState !== round.create ? createState : null)
        : (linkState !== round.link ? linkState : null);

  const outcome = changed ?? idleEntityEditState;
  const open = round !== null && !dismissed && !(changed?.status === "success" && !pending);
  /*
   * `2P-PERSON-003`. The company exists; the next act is to select it, not to
   * create it again — so the pane goes back to the selector on that outcome.
   * Derived for the same reason openness is: a stored flag would have to be
   * cleared by whoever set it, and the sentence alone would leave the create
   * field in front of the owner with a name that has already worked.
   */
  const creating = createRequested && changed?.code !== "createdButNotLinked";

  function openDialog() {
    setRound({ link: linkState, create: createState });
    setDismissed(false);
    setCreateRequested(false);
    setSubmittedPane(null);
  }

  function closeDialog() {
    setDismissed(true);
    setCreateRequested(false);
  }

  return (
    <div className="entity-company">
      <p className="entity-relation-line">
        <span>{copy.company}</span>
        {/*
          The company name stays visible for the same reason the person's own
          name does (ADR-110 Decision 2): it is a structural identifier the owner
          needs to recognise the record, not unsourced derived content.
        */}
        <strong>{organizationName ?? copy.companyNone}</strong>
        <small>{copy.companyExplainer}</small>
      </p>

      <button className="entity-edit-open" onClick={openDialog} type="button">
        <Pencil aria-hidden="true" size={15} />
        {copy.companyEdit}
      </button>

      {/*
        The outcome of the last round stays on the page after the dialog closes.
        Announcing a save and then destroying the only evidence of it would leave
        a screen-reader user with nothing to return to — the same reasoning
        `entity-edit-form.tsx` records for its own closed state.
      */}
      <div aria-atomic="true" aria-live="polite" className="sr-only" role="status">
        {open || outcome.status === "idle" ? "" : outcome.message}
      </div>
      {!open && outcome.status === "success" ? (
        <p className="entity-edit-feedback success">{outcome.message}</p>
      ) : null}

      <ConfirmDialog
        cancelLabel={copy.companyClose}
        className="task-command-dialog-form"
        description={copy.companyDialogDescription}
        /* A write in flight neither closes the dialog nor fires its cancel. */
        busy={pending}
        /*
          The create pane holds a company name typed by hand and the link pane
          an organisation chosen from a list, and neither lives in React state —
          both are read straight off the form. `useFormBaseline` compares the
          mounted pane to itself, so switching panes or putting a value back by
          hand both read as clean.
        */
        discard={{
          confirmLabel: copy.companyDiscardConfirm,
          prompt: copy.companyDiscardPrompt,
          resumeLabel: copy.companyDiscardResume,
        }}
        idPrefix="entity-company-dialog"
        onClose={closeDialog}
        open={open}
        title={copy.companyDialogTitle}
      >
        <div aria-atomic="true" aria-busy={pending} aria-live="polite" className="sr-only" role="status">
          {pending ? copy.saving : outcome.status === "idle" ? "" : outcome.message}
        </div>

        {creating ? (
          /*
            A SIBLING of the selector, never a child of it. HTML forbids nested
            forms and the browser's recovery — dropping the inner one — would make
            this control submit the other action with a stray field, refused by a
            strict schema for reasons no reader could act on. Only one is mounted
            at a time, which also keeps the dialog to a single set of controls for
            the Tab cycle to walk.

            `description` is submitted empty rather than omitted:
            `organizationCreateSchema` is `.strict()` and its description is
            required-but-nullable, so an absent key would be an invalid-input
            refusal for a form with no description control to fix.
          */
          <form action={create} onSubmit={() => setSubmittedPane("create")}>
            <input name="locale" type="hidden" value={locale} />
            <input name="subject" type="hidden" value="person" />
            <input name="subjectId" type="hidden" value={personId} />
            <input name="description" type="hidden" value="" />

            <label htmlFor={`${fieldId}-new-company`}>
              {copy.newCompanyName}
              <input
                autoComplete="off"
                defaultValue={createState.submitted?.name ?? ""}
                disabled={pending}
                id={`${fieldId}-new-company`}
                maxLength={160}
                name="name"
                required
                type="text"
              />
            </label>

            <div className="task-command-dialog-actions">
              <button className="task-command-primary" disabled={pending} type="submit">
                {pending ? <LoaderCircle aria-hidden="true" className="spin" size={16} /> : <Building2 aria-hidden="true" size={16} />}
                {pending ? copy.saving : copy.createOrganization}
              </button>
              <button
                className="task-command-secondary"
                disabled={pending}
                onClick={() => setCreateRequested(false)}
                type="button"
              >
                {copy.companyCreateBack}
              </button>
            </div>
          </form>
        ) : (
          <form action={link} onSubmit={() => setSubmittedPane("link")}>
            <input name="locale" type="hidden" value={locale} />
            <input name="personId" type="hidden" value={personId} />

            <label htmlFor={`${fieldId}-company`}>
              {copy.companyChooseLabel}
              {/* Keyed on its own default: React applies `defaultValue` to a
                  select only on mount, so the value stored by the round that
                  just completed needs a remount to show as selected. */}
              <select
                defaultValue={linkState.submitted?.organizationId ?? organizationId ?? ""}
                disabled={pending}
                id={`${fieldId}-company`}
                key={`company-${linkState.submitted?.organizationId ?? organizationId ?? ""}`}
                name="organizationId"
              >
                {/* Clearing is a first-class outcome: "no longer works there" is
                    a fact the owner must be able to record. */}
                <option value="">{copy.organizationNone}</option>
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>{organization.name}</option>
                ))}
              </select>
            </label>

            {createState.code === "createdButNotLinked" ? (
              <p className="task-command-dialog-note" data-company-created-not-linked="true">
                {copy.companyCreatedNotLinkedHint}
              </p>
            ) : null}

            <div className="task-command-dialog-actions">
              <button className="task-command-primary" disabled={pending} type="submit">
                {pending ? <LoaderCircle aria-hidden="true" className="spin" size={16} /> : null}
                {pending ? copy.saving : copy.companyChooseSubmit}
              </button>
              <button
                className="task-command-secondary"
                disabled={pending}
                onClick={() => setCreateRequested(true)}
                type="button"
              >
                {copy.companyCreateToggle}
              </button>
            </div>
          </form>
        )}

        {outcome.status === "error" ? (
          <p className="entity-edit-feedback error" role="alert">{outcome.message}</p>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
