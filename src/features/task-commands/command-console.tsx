"use client";

/**
 * The one command surface (Epic 2E-G).
 *
 * It mounts on Chat and on the task surface and behaves identically on both —
 * `origin` is the only thing that differs, and it is a telemetry category
 * rather than a behaviour switch.
 *
 * **This component decides nothing.** Which control to render arrives as
 * `state.control`, every sentence arrives already localized, and whether an
 * action may be applied in one step was settled by the matcher and the preview.
 * That is `ENGINEERING_STANDARDS`' "keep domain rules out of React", and here it
 * has a specific edge: re-deriving "is this destructive" from the preview in a
 * component would be a second place the confirmation requirement is decided.
 *
 * One `useActionState` drives every step, through the `runTaskCommand`
 * dispatcher. Seven hooks would hold seven independent states, and the outcome
 * of a Confirm would render beside — rather than replace — the preview that
 * produced it.
 */

import { LoaderCircle } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useActionState } from "react";

import type { Locale } from "@/lib/preferences";

import { ConfirmDialog } from "./confirm-dialog";
import { idleTaskCommandState, type TaskCommandConsoleState } from "./console-state";
import { getTaskCommandCopy } from "./copy";
import type { TaskDisambiguationView } from "./disambiguation";
import type { TaskCommandPreview } from "./preview";

export type TaskCommandAction = (
  state: TaskCommandConsoleState,
  formData: FormData,
) => Promise<TaskCommandConsoleState>;


function PreviewDeltas({ preview, fieldsLabel }: { preview: TaskCommandPreview; fieldsLabel: string }) {
  return (
    <dl className="task-command-deltas" aria-label={fieldsLabel}>
      {preview.deltas.map((delta) => (
        <div className="task-command-delta" data-changed={delta.changed} key={delta.field}>
          <dt>{delta.label}</dt>
          <dd>
            <span className="task-command-delta-before">{delta.before.text}</span>
            <span aria-hidden="true"> → </span>
            <span className="task-command-delta-after">{delta.after.text}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function PreviewEffects({ preview }: { preview: TaskCommandPreview }) {
  if (preview.effects.length === 0) return null;
  return (
    <ul className="task-command-effects">
      {preview.effects.map((effect) => (
        <li key={effect.kind}>{effect.text}</li>
      ))}
    </ul>
  );
}

/**
 * The disambiguation branch, which is two different shapes of question.
 *
 * 2E-MATCH-012 forbids rendering a `confirm_one` result as a list: "I found one
 * but I am not sure it is the one" asks the user to confirm, not to choose
 * between one thing. The radiogroup is therefore only for `list` and
 * `overflow`.
 *
 * The radiogroup has an **explicit submit control**, and that is a correctness
 * point rather than a style one: a radio that submitted on change would fire a
 * server round trip — including a Supabase query — on every arrow keypress as a
 * keyboard user browses the options, which is both slow and a way to be shown a
 * preview for a candidate you were only passing over.
 */
function Disambiguation({
  view,
  copy,
}: {
  view: TaskDisambiguationView;
  copy: ReturnType<typeof getTaskCommandCopy>;
}) {
  const groupId = useId();
  const [selected, setSelected] = useState(view.candidates[0]?.taskId ?? "");

  if (view.kind === "confirm_one") {
    const only = view.candidates[0];
    if (only === undefined) return null;
    return (
      <div className="task-command-candidates">
        <p className="task-command-candidate-title">{only.title}</p>
        <p className="task-command-candidate-meta">{only.status}</p>
        <input name="taskId" type="hidden" value={only.taskId} />
        <input name="rank" type="hidden" value={1} />
        <input name="candidateCount" type="hidden" value={view.candidates.length} />
        <button className="task-command-primary" name="intent" type="submit" value="select">
          {copy.console.chooseSubmit}
        </button>
      </div>
    );
  }

  return (
    <div className="task-command-candidates">
      <fieldset role="radiogroup" aria-labelledby={`${groupId}-legend`}>
        <legend id={`${groupId}-legend`}>{copy.console.candidateLegend}</legend>
        {view.candidates.map((candidate, index) => (
          <label className="task-command-candidate" key={candidate.taskId}>
            <input
              checked={selected === candidate.taskId}
              name="taskId"
              onChange={() => setSelected(candidate.taskId)}
              type="radio"
              value={candidate.taskId}
            />
            <span>
              <span className="task-command-candidate-title">{candidate.title}</span>
              <span className="task-command-candidate-meta">
                {candidate.status}
                {candidate.dueAt === null ? "" : ` · ${candidate.dueAt}`}
                {candidate.projectNames.length === 0 ? "" : ` · ${candidate.projectNames.join(", ")}`}
              </span>
              <span className="task-command-evidence">
                {candidate.evidence
                  .filter((signal) => signal.distinguishing)
                  .map((signal) => signal.text)
                  .join(" · ")}
              </span>
            </span>
            <input
              name="rank"
              type="hidden"
              value={selected === candidate.taskId ? index + 1 : ""}
              disabled={selected !== candidate.taskId}
            />
          </label>
        ))}
      </fieldset>
      <input name="candidateCount" type="hidden" value={view.candidates.length} />
      <button className="task-command-primary" name="intent" type="submit" value="select">
        {copy.console.chooseSubmit}
      </button>
    </div>
  );
}

/**
 * The rendered outcome of one round, shared by the console and the recovery
 * surface.
 *
 * Extracted rather than duplicated because both surfaces must present an
 * identical preview, an identical stale message and an identical undo
 * affordance — Epic 2E-G's "behaves identically" is a property of there being
 * one renderer, not of two that currently agree.
 */
export function TaskCommandResult({
  state,
  pending,
  formAction,
  locale,
  origin,
}: {
  state: TaskCommandConsoleState;
  pending: boolean;
  formAction: (formData: FormData) => void;
  locale: Locale;
  origin: "chat" | "work";
}) {
  const copy = getTaskCommandCopy(locale);
  const result = useRef<HTMLDivElement | null>(null);

  /**
   * The dialog is open for *one specific state object*, not as a free boolean.
   *
   * `useActionState` returns a fresh object for every round, so an open dialog
   * closes itself the moment a new result arrives — without an effect that
   * resets it, which React 19 correctly flags as a cascading render. It also
   * makes the property that matters unrepresentable rather than maintained: a
   * Confirm can only ever be submitted against the preview the dialog was
   * opened for, because any newer preview is a different object.
   */
  const [dialogFor, setDialogFor] = useState<TaskCommandConsoleState | null>(null);
  const dialogOpen = dialogFor === state;

  // 2E-A11Y-002: focus moves to the result after every async round, so a
  // keyboard or screen-reader user lands on the answer rather than back at the
  // top of the page. `tabIndex={-1}` makes the region programmatically
  // focusable without adding it to the tab order.
  useEffect(() => {
    if (state.status === "resolved") result.current?.focus();
  }, [state]);

  const session = state.session;
  const hidden = (
    <>
      <input name="locale" type="hidden" value={locale} />
      <input name="origin" type="hidden" value={origin} />
      {session === null ? null : <input name="session" type="hidden" value={session} />}
    </>
  );

  return (
    <>
      {/*
        2E-A11Y-003. One polite live region, announcing the outcome and — while
        a round is in flight — that a model call is happening. `aria-busy` is
        what tells a screen reader the region is mid-update rather than empty.
      */}
      <div
        aria-atomic="true"
        aria-busy={pending}
        aria-live="polite"
        className="sr-only"
        role="status"
      >
        {pending ? copy.console.pendingAnnouncement : state.announcement}
      </div>

      {state.status === "idle" ? null : (
        <div
          aria-label={copy.console.resultRegionLabel}
          className="task-command-result"
          ref={result}
          // An explicit landmark, not just an `aria-label`. A bare `div` has no
          // implicit role, so the name would be announced only once focus
          // happened to land here; as a named region it is also reachable by
          // landmark navigation, which is how a screen-reader user gets back to
          // the answer after moving away from it.
          role="region"
          tabIndex={-1}
        >
          <h3>{state.heading}</h3>
          <p>{state.detail}</p>
          {state.reason === null ? null : <p className="task-command-reason">{state.reason}</p>}

          {state.preview === null ? null : (
            <div className="task-command-preview">
              <p className="task-command-notice">{state.preview.copy.notice}</p>
              <p className="task-command-task-title">{state.preview.task.title}</p>
              <PreviewDeltas fieldsLabel={copy.console.changesLabel} preview={state.preview} />
              <PreviewEffects preview={state.preview} />
              <p className="task-command-reversibility">{state.preview.copy.reversibility}</p>
              {state.preview.copy.undoWindow === null ? null : (
                <p className="task-command-window">{state.preview.copy.undoWindow}</p>
              )}
              {state.preview.copy.gravity === null ? null : (
                <p className="task-command-gravity">{state.preview.copy.gravity}</p>
              )}
            </div>
          )}

          {state.creation === null ? null : (
            <div className="task-command-preview">
              <p className="task-command-notice">{state.creation.copy.notice}</p>
              <p className="task-command-task-title">{state.creation.title}</p>
              <p>{state.creation.copy.reminder}</p>
              <p className="task-command-reversibility">{state.creation.copy.reversibility}</p>
              <p className="task-command-gravity">{state.creation.copy.confirmation}</p>
            </div>
          )}

          {state.control === "choose" && state.disambiguation !== null ? (
            <form action={formAction}>
              {hidden}
              <Disambiguation copy={copy} view={state.disambiguation} />
            </form>
          ) : null}

          {state.control === "apply" ? (
            <form action={formAction}>
              {hidden}
              <button className="task-command-primary" name="intent" type="submit" value="apply">
                {copy.console.apply}
              </button>
            </form>
          ) : null}

          {state.control === "confirm" ? (
            <>
              <button
                className="task-command-destructive"
                onClick={() => setDialogFor(state)}
                type="button"
              >
                {copy.console.confirm}
              </button>
              <ConfirmDialog
                cancelLabel={copy.console.dialogCancel}
                description={state.preview?.copy.gravity ?? state.detail}
                onClose={() => setDialogFor(null)}
                open={dialogOpen}
                title={copy.console.dialogTitle}
              >
                <form action={formAction}>
                  {hidden}
                  <button
                    className="task-command-destructive"
                    name="intent"
                    type="submit"
                    value="confirm"
                  >
                    {copy.console.confirm}
                  </button>
                </form>
              </ConfirmDialog>
            </>
          ) : null}

          {state.control === "create" ? (
            <form action={formAction}>
              {hidden}
              <button className="task-command-primary" name="intent" type="submit" value="create">
                {copy.console.create}
              </button>
            </form>
          ) : null}

          {state.control === "clarify" ? (
            <form action={formAction} className="task-command-clarify">
              {hidden}
              <label htmlFor="task-command-clarification">{copy.console.clarifyLabel}</label>
              <input
                autoComplete="off"
                id="task-command-clarification"
                maxLength={1000}
                name="clarification"
                placeholder={copy.console.clarifyPlaceholder}
                required
                type="text"
              />
              <button className="task-command-primary" name="intent" type="submit" value="clarify">
                {copy.console.clarifySubmit}
              </button>
            </form>
          ) : null}

          {state.undo === null ? null : (
            <form action={formAction}>
              <input name="locale" type="hidden" value={locale} />
              <input name="origin" type="hidden" value={origin} />
              <input name="undoId" type="hidden" value={state.undo.undoId} />
              <button className="task-command-secondary" name="intent" type="submit" value="undo">
                {state.undo.label}
              </button>
            </form>
          )}
        </div>
      )}
    </>
  );
}

export function CommandConsole({
  action,
  locale,
  origin,
}: {
  action: TaskCommandAction;
  locale: Locale;
  origin: "chat" | "work";
}) {
  const [state, formAction, pending] = useActionState(action, idleTaskCommandState);
  const copy = getTaskCommandCopy(locale);

  return (
    <section className="task-command-console">
      <header>
        <p className="eyebrow">{copy.console.eyebrow}</p>
        <h2>{copy.console.title}</h2>
        <p>{copy.console.description}</p>
      </header>

      <form action={formAction} className="task-command-form">
        <input name="locale" type="hidden" value={locale} />
        <input name="origin" type="hidden" value={origin} />
        <label htmlFor="task-command-text">{copy.console.inputLabel}</label>
        <div className="task-command-input-row">
          <input
            autoComplete="off"
            disabled={pending}
            id="task-command-text"
            maxLength={1000}
            name="commandText"
            placeholder={copy.console.inputPlaceholder}
            required
            type="text"
          />
          <button
            className="task-command-primary"
            disabled={pending}
            name="intent"
            type="submit"
            value="start"
          >
            {pending ? <LoaderCircle aria-hidden="true" className="task-command-spin" size={18} /> : null}
            {pending ? copy.console.pending : copy.console.submit}
          </button>
        </div>
      </form>

      <TaskCommandResult
        formAction={formAction}
        locale={locale}
        origin={origin}
        pending={pending}
        state={state}
      />
    </section>
  );
}

export { idleTaskCommandState as idleConsoleState };
