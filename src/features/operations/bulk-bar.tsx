"use client";

/**
 * `2L-BULK-001…012` — the selection bar, the preview and the result.
 *
 * ## Why the preview is not a step the user can skip
 *
 * `2L-BULK-005` requires a preview *before any bulk operation is applied*, and
 * the cheapest way to get that wrong is a dialog somebody can dismiss. Here the
 * preview is not a dialog: it is rendered continuously from the current
 * selection and the chosen operation, so the counts the user is about to act on
 * are on screen at the moment they act. There is no state in which Apply is
 * reachable and the preview is not visible.
 *
 * ## Why Apply is disabled when nothing would change
 *
 * A run that would apply to nothing is not an error and not a success; it is a
 * fact the user can see before committing. Disabling the control is the honest
 * form of that — the alternative is letting them press it and then telling them
 * nothing happened, which is the same information one round trip later.
 *
 * ## What this component does not decide
 *
 * The operations it offers come from `BULK_ELIGIBLE_ACTIONS`, which is derived
 * from the taxonomy; the partition comes from `previewBulk`, which asks the same
 * predicate the apply path asks; and the outcome vocabulary comes from
 * `summariseBulk`. This file renders. If it ever started deciding, the pure
 * modules beside it would stop being the answer.
 */

import { useActionState, useEffect, useRef, useState } from "react";

import { UniversalStateLine } from "@/features/experience/universal-state";

import { detailControlFor } from "@/features/task-commands/detail-controls";
import { getTaskDetailControlsCopy } from "@/features/task-commands/detail-controls-copy";
import type { TaskDetailDateBounds, TaskDetailRelationOptions } from "@/features/task-commands/task-detail-controls";
import type { Locale } from "@/lib/preferences";

import { BULK_ELIGIBLE_ACTIONS, isBulkEligibleAction } from "./bulk-eligibility";
import { idleBulkCommandState, type BulkCommandState } from "./bulk-command-state";
import { previewBulk, type BulkPreviewItem } from "./bulk-preview";
import { getWorkCopy } from "./copy";
import { SELECTION_CEILING } from "./selection";
import { UndoAffordance, type TaskUndoHandler } from "./undo-affordance";

export type BulkCommandHandler = (
  state: BulkCommandState,
  formData: FormData,
) => Promise<BulkCommandState>;

/** What the bar needs about each selected task. Never its content. */
export type BulkSelectedTask = BulkPreviewItem & { readonly title: string };

export function BulkBar({
  action,
  dateBounds,
  locale,
  onClear,
  refusal,
  relationOptions,
  selected,
  undoAction,
}: {
  action: BulkCommandHandler;
  dateBounds: TaskDetailDateBounds;
  locale: Locale;
  onClear: () => void;
  /** A selection change the model refused, rendered where the user acted. */
  refusal: string | null;
  relationOptions: TaskDetailRelationOptions;
  selected: readonly BulkSelectedTask[];
  undoAction?: TaskUndoHandler;
}) {
  const copy = getWorkCopy(locale).bulk;
  const controlCopy = getTaskDetailControlsCopy(locale);
  const [verb, setVerb] = useState<string>(BULK_ELIGIBLE_ACTIONS[0] ?? "");
  const [value, setValue] = useState<string>("");
  const result = useRef<HTMLDivElement | null>(null);

  /**
   * One key per (task, verb) pair, minted lazily and **never in the render
   * body** — the discipline `work-item-actions.tsx` records: a
   * pending→settled transition is a re-render, and StrictMode double-renders in
   * development.
   */
  const keys = useRef<Map<string, string>>(new Map());
  function operationKeyFor(taskId: string, verbName: string): string {
    const id = `${taskId}:${verbName}`;
    const existing = keys.current.get(id);
    if (existing !== undefined) return existing;
    const minted = crypto.randomUUID();
    keys.current.set(id, minted);
    return minted;
  }

  // `verb` is always one of `BULK_ELIGIBLE_ACTIONS`, which the select is built
  // from — but it is held as a string because that is what a change event
  // yields, so it is narrowed rather than asserted.
  const control = isBulkEligibleAction(verb) ? detailControlFor(verb) : null;
  const preview = previewBulk(verb, selected);
  const options = control?.relation ? relationOptions[control.relation] : null;
  const canApply = preview.status === "previewed"
    && !preview.wouldChangeNothing
    && (control?.field === null || value.trim() !== "");

  async function submit(state: BulkCommandState, formData: FormData): Promise<BulkCommandState> {
    formData.set(
      "items",
      JSON.stringify(
        preview.eligible.map((item) => {
          const task = selected.find((entry) => entry.taskId === item.taskId);
          return {
            taskId: item.taskId,
            title: task?.title ?? "",
            operationKey: operationKeyFor(item.taskId, verb),
          };
        }),
      ),
    );
    const next = await action(state, formData);
    // Rotated after every settled round, so a second run on the same selection
    // is a new request rather than a replay of the first.
    if (next.status !== "idle") keys.current.clear();
    return next;
  }

  const [state, formAction, pending] = useActionState(submit, idleBulkCommandState);

  useEffect(() => {
    // `2L-ACCESS-006`: a bulk result announces once and moves focus once, to the
    // result — never per item, which would drag a screen-reader user through
    // fifty stops.
    if (state.status !== "idle") result.current?.focus();
  }, [state]);

  if (selected.length === 0 && state.status === "idle" && refusal === null) return null;

  return (
    <section aria-label={copy.barLabel} className="work-bulk-bar">
      <div aria-atomic="true" aria-busy={pending} aria-live="polite" className="sr-only" role="status">
        {state.announcement}
      </div>

      {/*
        `2L-MOBILE-006` — the count is announced when it changes.
        A separate polite region from the outcome one above: they change at
        different times and for different reasons, and one region carrying both
        would replace "3 selected" with the result of a run the user has not
        started yet.
      */}
      <div aria-atomic="true" aria-live="polite" className="sr-only" role="status">
        {copy.selected(selected.length)}
      </div>

      <div className="work-bulk-selection">
        <strong>{copy.selected(selected.length)}</strong>
        <span className="work-bulk-hint">{copy.ceilingHint(SELECTION_CEILING)}</span>
        <button className="row-action" onClick={onClear} type="button">{copy.clear}</button>
      </div>

      {/* The refusal is rendered where the user acted, not swallowed. */}
      {refusal ? <p className="form-error work-bulk-refusal" role="alert">{refusal}</p> : null}

      <form action={formAction} className="work-bulk-form">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="action" value={verb} />

        <label htmlFor="work-bulk-action">{copy.chooseOperation}</label>
        <select
          id="work-bulk-action"
          onChange={(event) => { setVerb(event.target.value); setValue(""); }}
          value={verb}
        >
          {BULK_ELIGIBLE_ACTIONS.map((candidate) => (
            <option key={candidate} value={candidate}>{controlCopy.actions[candidate]}</option>
          ))}
        </select>

        {control?.field === null ? null : (
          <>
            <label htmlFor="work-bulk-value">{copy.chooseValue}</label>
            {control?.kind === "choice" && control.choices !== null ? (
              <select
                id="work-bulk-value"
                name="value"
                onChange={(event) => setValue(event.target.value)}
                value={value}
              >
                <option disabled value="">{controlCopy.choosePlaceholder}</option>
                {control.choices.map((choice) => (
                  <option key={choice} value={choice}>
                    {controlCopy.choices[choice as keyof typeof controlCopy.choices] ?? choice}
                  </option>
                ))}
              </select>
            ) : null}
            {control?.kind === "date" ? (
              <input
                id="work-bulk-value"
                max={dateBounds.max}
                min={dateBounds.min}
                name="value"
                onChange={(event) => setValue(event.target.value)}
                type="date"
                value={value}
              />
            ) : null}
            {control?.kind === "relation" && options !== null ? (
              options.length === 0 ? (
                <UniversalStateLine description={controlCopy.relationEmpty[control.relation!]} locale={locale} state="empty" />
              ) : (
                // The **name**, never the id: it is resolved by
                // `resolve_owned_entity_exact` inside the candidate query, so
                // ownership is proven in the database rather than asserted here.
                <select
                  id="work-bulk-value"
                  name="value"
                  onChange={(event) => setValue(event.target.value)}
                  value={value}
                >
                  <option disabled value="">{controlCopy.choosePlaceholder}</option>
                  {options.map((option) => (
                    <option key={option.id} value={option.label}>{option.label}</option>
                  ))}
                </select>
              )
            ) : null}
          </>
        )}

        {/* `2L-BULK-005`. Rendered continuously, so there is no state in which
            Apply is reachable and the counts are not on screen. */}
        <div className="work-bulk-preview">
          <strong>{copy.previewHeading}</strong>
          {preview.wouldChangeNothing ? (
            <p>{copy.previewNothing}</p>
          ) : (
            <p>{copy.previewCounts(preview.eligibleCount, preview.refusedCount)}</p>
          )}
          {preview.refusedCount > 0 ? (
            <p className="quiet-state">{copy.reasons.ineligible_status}</p>
          ) : null}
        </div>

        <button className="row-action" disabled={pending || !canApply} type="submit">
          {copy.apply}
        </button>
      </form>

      {state.status === "idle" ? null : (
        <div
          aria-label={copy.resultRegionLabel}
          className="work-bulk-result"
          ref={result}
          role="region"
          tabIndex={-1}
        >
          <strong>{state.message}</strong>
          {state.summary ? (
            <ul className="work-bulk-result-list">
              {state.summary.notApplied.map((item) => (
                <li key={item.taskId} className="work-bulk-result-refused">
                  {copy.itemReasons[item.reason ?? "failed"]}
                </li>
              ))}
            </ul>
          ) : null}
          {/* `2L-BULK-012`. One control per item the database actually gave a
              reversal for — never per selected item, and never for the set. */}
          {undoAction && state.summary
            ? state.summary.undoable.map((item) => (
              <UndoAffordance
                action={undoAction}
                key={item.taskId}
                locale={locale}
                undo={item.undo}
              />
            ))
            : null}
        </div>
      )}
    </section>
  );
}
