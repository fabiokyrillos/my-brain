"use client";

/**
 * `2M-PLAN-004` … `-010` — the daily planner.
 *
 * ## What this component is allowed to do
 *
 * Render, and hand a submission to an injected action. It has no Supabase
 * client, no Server Action of its own, no RPC and no write path;
 * `phase-2m-planner-authority-guard.test.ts` fails the build if any appears
 * anywhere under `src/features/planning`.
 *
 * That is `2M-PLAN-005` — *"the planner never moves anything by itself"* —
 * enforced structurally rather than by review. Every change a user makes here
 * goes through `applyTaskDetailCommand`, the same Server Action the task detail,
 * the Work list and the calendar submit to, which resolves through
 * `list_task_command_candidates` and applies through `apply_task_command`. The
 * operation key, the request fingerprint, the twelve-column staleness gate, the
 * audit row and the registered undo are all inherited, because they live below
 * that action and this file cannot reach past it. `2M-PLAN-010`'s provenance —
 * actor, source, reason, target, time and resulting state — is the audit row
 * that RPC already writes, not a second record this surface keeps.
 *
 * ## Why the outcome is not inside the row
 *
 * The planner is **date-partitioned**, exactly like the calendar, and it has the
 * same self-defeating shape slice 2M.1's deployment journey found: the
 * successful case is the one where the item **leaves the list it was in**.
 * Planning a task moves it out of *available*; clearing moves it out of
 * *planned*. Either way the row unmounts on revalidation, taking any outcome and
 * undo it owned with it, at the instant there is something to undo.
 *
 * So `CalendarOutcome` is mounted here — reused rather than reimplemented,
 * because it is the same problem on the adjacent surface and a second copy would
 * be a second announcement contract. `TaskDetailControls` takes
 * `renderResult={false}` so nothing is announced twice.
 *
 * ## What it deliberately does not offer
 *
 * **Creating anything.** `2M-PLAN-004` says the planner "creates nothing
 * implicitly", and this surface has no composer, no quick-add and no path to
 * one. The available pool is read from tasks that already exist; a day with an
 * empty pool says so rather than inviting the user to invent work.
 *
 * **Moving a deadline.** `plannedControlsFor` admits only actions declaring
 * `planned_at`, so `reschedule_due` and `clear_due` cannot render here. A
 * planner that could move a deadline would be contradicting its own premise.
 *
 * **Any gesture.** OD-2M-6 A: visible, labelled controls only. There is no
 * drag, swipe, pointer or touch handler in this file and the no-gesture guard
 * names the directory.
 */

import { useState } from "react";

import { UniversalStateLine } from "@/features/experience/universal-state";
import { formatInstant } from "@/lib/time/instant-format";
import { addLocalDays, formatLocalDate, parseLocalDate } from "@/lib/time/local-day";

import { CalendarOutcome } from "@/features/calendar/calendar-outcome";
import { AgendaHeader, AgendaStepper } from "@/features/calendar/agenda-header";
import { AGENDA_DATE_TOKEN } from "@/features/calendar/agenda-date-picker";
import { BulkBar, type BulkCommandHandler } from "@/features/operations/bulk-bar";
import { getWorkCopy } from "@/features/operations/copy";
import { ProtectedContent } from "@/features/operations/protected-content";
import {
  SELECTION_CEILING,
  clearSelection,
  isSelected,
  selectAllShown,
  toggleSelected,
  type Selection,
} from "@/features/operations/selection";
import type { TaskUndoHandler } from "@/features/operations/undo-affordance";
import { recordDayPlanned } from "@/features/product-analytics/interaction-events";
import type { TaskDetailCommandState } from "@/features/task-commands/detail-action-state";
import type { TaskDetailDateBounds, TaskDetailRelationOptions } from "@/features/task-commands/task-detail-controls";
import { TaskDetailControls, type TaskDetailCommandHandler } from "@/features/task-commands/task-detail-controls";
import type { Locale } from "@/lib/preferences";

import { getPlannerCopy } from "./copy";
import { plannedControlsFor } from "./planned-at";
import type { PlannerConflictKind } from "./planner-conflicts";
import type { PlannerItem, PlannerProjection } from "./planner-projection";

/**
 * No relation control can reach this surface, so there is nothing to populate.
 *
 * The same accurate-rather-than-stubbed value the calendar passes: no action
 * declaring `planned_at` carries a `projectRef`, `contextRef` or `personRef`, so
 * the three list queries the task detail makes are three round trips the planner
 * genuinely does not need. Frozen so a future edit cannot fill it in and quietly
 * widen what the planner can change.
 */
const NO_RELATIONS: TaskDetailRelationOptions = Object.freeze({
  project: Object.freeze([]),
  context: Object.freeze([]),
  person: Object.freeze([]),
}) as TaskDetailRelationOptions;

const EMPTY_SELECTION: Selection = clearSelection();

export function PlannerView({
  action,
  bulkAction,
  dateBounds,
  dayHrefBase,
  locale,
  projection,
  today,
  undoAction,
}: {
  action: TaskDetailCommandHandler;
  bulkAction: BulkCommandHandler;
  dateBounds: TaskDetailDateBounds;
  /** Where a day link goes. Navigation only — this component builds no URL policy. */
  dayHrefBase: string;
  locale: Locale;
  projection: PlannerProjection;
  /** `YYYY-MM-DD` in the owner's zone, so the date picker can mark today. */
  today?: string;
  undoAction?: TaskUndoHandler;
}) {
  const copy = getPlannerCopy(locale);
  const bulkCopy = getWorkCopy(locale).bulk;

  const [outcome, setOutcome] = useState<TaskDetailCommandState | null>(null);
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const [selectionRefusal, setSelectionRefusal] = useState<string | null>(null);

  /**
   * The outcome is recorded by a wrapper around the action, not by an effect
   * inside the row.
   *
   * The lesson slice 2M.1 paid for: an effect in a subtree that the same commit
   * unmounts never fires, so *a component cannot report its own outcome when the
   * outcome is what removes it*. Wrapping the call keeps the reporting in a
   * component the lists cannot unmount.
   */
  function reporting(handler: TaskDetailCommandHandler, operation: "set" | "cleared"): TaskDetailCommandHandler {
    return async (state, formData) => {
      const next = await handler(state, formData);
      setOutcome(next);
      // Q2's producer, and only on a real application: a refusal or a
      // `no_change` is not a plan being made, and counting it would make the
      // funnel report planning that never happened.
      if (next.status === "applied") {
        recordDayPlanned({ operation, itemCount: 1, locale });
      }
      return next;
    };
  }

  function changeSelection(next: ReturnType<typeof toggleSelected>) {
    if (next.status === "refused") {
      // Refused, never truncated — the ceiling of 50 OD-2L-4 signed, reused
      // rather than redeclared (`2M-PLAN-009`).
      setSelectionRefusal(bulkCopy.ceilingReached(SELECTION_CEILING));
      return;
    }
    setSelectionRefusal(null);
    setSelection(next.selection);
  }

  const selected = projection.available
    .filter((item) => isSelected(selection, item.taskId))
    .map((item) => ({ taskId: item.taskId, title: item.title, status: item.status }));

  /*
   * ADR-180. A conflict is a fact about particular tasks, and the projection
   * already says which. So besides the statement above the lists, each task it
   * names carries it on its own row — where the person is looking when they
   * decide what to do about it. Still a statement: no control comes with it.
   */
  const notedByTask = new Map<string, PlannerConflictKind[]>();
  for (const conflict of projection.conflicts) {
    for (const taskId of conflict.taskIds) {
      const kinds = notedByTask.get(taskId) ?? [];
      if (!kinds.includes(conflict.kind)) kinds.push(conflict.kind);
      notedByTask.set(taskId, kinds);
    }
  }

  /**
   * One row of the plan, in a fixed grammar: **seleção · tarefa · quando ·
   * o que você pode fazer**.
   *
   * The three parts used to stack — head, then a meta line, then the controls —
   * so a list of twelve available tasks was thirty-six blocks of text with no
   * column a reader could scan down. `data-operation` is what lets the two lists
   * share one row shape while the *planned* list omits the checkbox: bulk
   * planning applies to what is available, and offering it on rows that are
   * already planned would be offering a verb the ceiling and the preview were
   * never derived for.
   */
  function Row({ item, operation }: { item: PlannerItem; operation: "set" | "cleared" }) {
    /*
     * Life Brain D.1. One verb per row, and the one the list is about: an
     * available task is planned for **this** day, a planned one leaves it.
     * Moving a task to another day is the task's own page (or the bulk bar),
     * not a date field under every row.
     */
    const verb = operation === "set" ? "set_planned" : "clear_planned";
    const controls = plannedControlsFor(item.status).filter((control) => control.action === verb);
    // The deadline, as a day: what an intention is weighed against. The planned
    // day itself is not repeated — the page's subject and the list say it.
    const due = formatInstant(item.dueAt, "day", locale, projection.timezone);
    const noted = notedByTask.get(item.taskId) ?? [];
    return (
      <li className="planner-item" data-operation={operation} key={item.taskId}>
        {operation === "set" ? (
          // The label is the 44px target and sits on the title's first line.
          <label className="planner-select-label">
            <input
              aria-label={item.title}
              checked={isSelected(selection, item.taskId)}
              className="planner-select"
              onChange={() => changeSelection(toggleSelected(selection, item.taskId))}
              type="checkbox"
            />
          </label>
        ) : null}
        <div className="planner-item-head">
          {/*
            The title is never rendered directly. `surface="calendar"` because
            the planner lives under `/app/calendar` and shares its governed
            surface — a second surface name would be a vocabulary entry nothing
            declared. It is the row's link to the task (ADR-180).
          */}
          <span className="planner-item-title">
            <ProtectedContent
              href={item.href}
              locale={locale}
              revealKey={item.taskId}
              sensitivity={item.sensitivity}
              surface="calendar"
            >
              <a className="planner-item-link" href={item.href}>{item.title}</a>
            </ProtectedContent>
          </span>
          {due === null && noted.length === 0 ? null : (
            <p className="planner-item-meta">
              {due === null ? null : <span>{copy.dueOn(due)}</span>}
              {noted.map((kind) => (
                <span className="planner-item-noted" key={kind}>{copy.conflicts.statement[kind]}</span>
              ))}
            </p>
          )}
        </div>
        {controls.length > 0 ? (
          <div className="planner-item-controls">
          <TaskDetailControls
            action={reporting(action, operation)}
            controls={controls}
            dateBounds={dateBounds}
            defaultValues={{ set_planned: projection.day }}
            locale={locale}
            relationOptions={NO_RELATIONS}
            renderResult={false}
            submitLabels={{ set_planned: copy.planHere, clear_planned: copy.removeHere }}
            taskId={item.taskId}
            title={item.title}
            variant="preset"
          />
          </div>
        ) : null}
      </li>
    );
  }

  /*
   * `2M-PLAN-007`/`-008`. The conflicts, stated and never resolved. One region,
   * drawn in one of two places: above the lists when there is something to
   * notice, and inside "how planning works" when there is not — a quiet day
   * still says it is quiet, without a section of its own saying so first.
   *
   * ADR-180: a conflict whose task is a row on this page is stated **on that
   * row**, in amber, where the decision is made. Saying it a second time in a
   * block above the lists was the same sentence twice, so the block lists only
   * what no row carries — and when every observation is on a row it is one
   * quiet caption: how many there are, and that nothing was changed.
   */
  const rowIds = new Set([...projection.planned, ...projection.available].map((item) => item.taskId));
  const looseConflicts = projection.conflicts.filter(
    (conflict) => !conflict.taskIds.some((taskId) => rowIds.has(taskId)),
  );
  const allOnRows = projection.conflicts.length > 0 && looseConflicts.length === 0;
  const conflicts = (
    <section
      aria-label={copy.conflicts.heading}
      className="planner-conflicts"
      data-has-conflicts={projection.conflicts.length > 0 ? "true" : "false"}
      data-on-rows={allOnRows ? "true" : undefined}
    >
      {allOnRows ? null : <h2>{copy.conflicts.heading}</h2>}
      {projection.conflicts.length === 0 ? (
        <UniversalStateLine description={copy.conflicts.none} locale={locale} state="empty" />
      ) : allOnRows ? (
        <p className="planner-conflict-count">
          <span>{copy.conflicts.count(projection.conflicts.length)}</span>
          {/* `2M-PLAN-008`: stated as a fact, with nothing already applied. */}
          <span>{copy.conflicts.notResolved}</span>
        </p>
      ) : (
        <>
          <p className="planner-conflict-count">{copy.conflicts.count(looseConflicts.length)}</p>
          <ul className="planner-conflict-list">
            {looseConflicts.map((conflict) => (
              <li key={`${conflict.kind}:${conflict.taskIds.join("-")}`}>
                {copy.conflicts.statement[conflict.kind]}
              </li>
            ))}
          </ul>
          {/* `2M-PLAN-008`: stated as a fact, with nothing already applied. */}
          <p className="quiet-state">{copy.conflicts.notResolved}</p>
        </>
      )}
    </section>
  );

  return (
    <div className="content-page planner-page">
      {/*
        Life Brain A.4 (`LB-A-007`). Planejar is a lens of the Agenda, under the
        Agenda's one header. ADR-180: the day being planned is the page's
        subject, and under it one line says what the page asks.
      */}
      <AgendaHeader
        lens="plan"
        locale={locale}
        period={(
          <AgendaStepper
            caption={(
              <p className="planner-lede">
                {projection.isToday ? <span className="calendar-today">{copy.today}</span> : null}
                <span>{copy.lede}</span>
              </p>
            )}
            className="planner-day-nav"
            locale={locale}
            next={{ href: `${dayHrefBase}?date=${shiftDay(projection.day, 1)}`, label: copy.nextDay }}
            picker={{
              hrefTemplate: `${dayHrefBase}?date=${AGENDA_DATE_TOKEN}`,
              min: dateBounds.min,
              max: dateBounds.max,
              selected: projection.day,
              today: today ?? (projection.isToday ? projection.day : ""),
            }}
            previous={{ href: `${dayHrefBase}?date=${shiftDay(projection.day, -1)}`, label: copy.previousDay }}
            rangeLabel={dayLabel(projection.day, locale)}
            today={projection.isToday ? null : { href: dayHrefBase, label: copy.today }}
          />
        )}
      />

      {/*
        `2M-ACCESS-004`. One region, announced, above both lists — so the answer
        is in the same place whichever list the operation was performed in, and
        so it survives the row that caused it disappearing.
      */}
      <CalendarOutcome locale={locale} outcome={outcome} undoAction={undoAction} />

      {/*
        What needs a look comes before the lists, and only when it exists: a day
        with more items than declared hours, and anything on it that contradicts
        anything else. Both keep their full sentence (`2M-PLAN-006`, `-008`).
      */}
      {projection.capacity.overloaded ? (
        <p className="planner-overloaded" role="status">{copy.capacity.overloaded}</p>
      ) : null}
      {projection.conflicts.length > 0 ? conflicts : null}

      <section aria-label={copy.planned} className="planner-list">
        <h2>
          <span>{copy.planned}</span>
          <span className="planner-list-count">{projection.planned.length}</span>
        </h2>
        {projection.planned.length === 0 ? (
          <UniversalStateLine description={copy.plannedEmpty} locale={locale} state="empty" />
        ) : (
          <ul>{projection.planned.map((item) => <Row item={item} key={item.taskId} operation="cleared" />)}</ul>
        )}
      </section>

      <section aria-label={copy.available} className="planner-list">
        <h2>
          <span>{copy.available}</span>
          <span className="planner-list-count">{projection.available.length}</span>
        </h2>
        {projection.available.length === 0 ? (
          <UniversalStateLine description={copy.availableEmpty} locale={locale} state="empty" />
        ) : (
          <>
            <ul>{projection.available.map((item) => <Row item={item} key={item.taskId} operation="set" />)}</ul>
            {/* Planning several at once is the second path, so its entry is at
                the foot of the pool rather than above the first task. */}
            <div className="work-bulk-select-all planner-select-all">
              <button
                className="row-action"
                onClick={() => changeSelection(
                  selectAllShown(selection, projection.available.map((item) => item.taskId)),
                )}
                type="button"
              >
                {bulkCopy.selectAllShown}
              </button>
            </div>
            {/*
              `2M-PLAN-009`. The Phase 2L bulk bar, unchanged: the same selection
              ceiling, the same preview, the same partial-result contract and the
              same eligibility derivation. A planner-specific bulk path would
              have been a second set of those rules.
            */}
            <BulkBar
              action={bulkAction}
              dateBounds={dateBounds}
              locale={locale}
              onClear={() => { setSelection(clearSelection()); setSelectionRefusal(null); }}
              refusal={selectionRefusal}
              relationOptions={NO_RELATIONS}
              selected={selected}
              undoAction={undoAction}
            />
          </>
        )}
      </section>

      {/*
        ADR-180 — the account of the page, behind one closed line.

        What "planned" means (Life Brain D.1), that the page creates nothing
        (`2M-PLAN-004`), what the pool is, and the capacity sentences with their
        own assumption (`2M-PLAN-006`). All still here, in the owner's reach,
        and none of it between the day and its tasks. It opens by itself when
        the day is overloaded, because then the assumption behind that word is
        what the person needs next.
      */}
      <details className="planner-about" open={projection.capacity.overloaded}>
        <summary className="planner-about-summary">{copy.howItWorks}</summary>
        <div className="planner-about-body">
          <p className="planner-meaning">{copy.meaning}</p>
          <p className="quiet-state planner-guarantee">{copy.createsNothing}</p>
          <p className="quiet-state planner-list-hint">{copy.availableHint}</p>
          <section aria-label={copy.capacity.heading} className="planner-capacity">
            <h2>{copy.capacity.heading}</h2>
            <p className="planner-capacity-count">{copy.capacity.count(projection.capacity.plannedCount)}</p>
            <p>
              {projection.capacity.availabilityDeclared && projection.capacity.availableHours !== null
                ? copy.capacity.available(projection.capacity.availableHours)
                : copy.capacity.undeclared}
            </p>
            {/*
              `2M-PLAN-006`'s second clause, in the sentence the user reads rather
              than in a coefficient: nothing here knows how long anything takes.
            */}
            <p className="quiet-state">{copy.capacity.noDuration}</p>
          </section>
          {projection.conflicts.length === 0 ? conflicts : null}
        </div>
      </details>
    </div>
  );
}

/**
 * The neighbouring day, as `YYYY-MM-DD`.
 *
 * Computed on the calendar date itself rather than by adding 86 400 000 ms to an
 * instant: a day is not always 24 hours long, and the arithmetic that assumes it
 * is is the defect slice 2M.0 removed from two other places.
 */
/** The day, said as a date rather than as ISO digits. */
function dayLabel(day: string, locale: Locale): string {
  const parsed = parseLocalDate(day);
  if (parsed === null) return day;
  // A calendar date has no instant: noon UTC, formatted in UTC, is that date
  // in every zone (the reasoning of `calendar-view.tsx`'s `formatDayLabel`).
  const instant = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, 12));
  return new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" }).format(instant);
}

function shiftDay(day: string, delta: number): string {
  /*
   * `LDC-MISC-001`. This was already **correct** — `Date.UTC(y, m, d + delta)`
   * is civil-date arithmetic and DST-safe, and `2M-TIME-007` recorded it as such
   * and deliberately left it alone.
   *
   * It moves onto the contract anyway, for one reason: it was the last
   * `toISOString().slice(0, 10)` in the tree, and with it gone that family
   * reaches zero **with no exemption**. A family at zero needs no allowlist, and
   * an allowlist is the thing a later author widens. A correct second
   * implementation of calendar arithmetic is also still a second one.
   */
  const parsed = parseLocalDate(day);
  if (parsed === null) return day;
  return formatLocalDate(addLocalDays(parsed, delta));
}
