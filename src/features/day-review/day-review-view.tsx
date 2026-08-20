"use client";

/**
 * `2M-REVIEW-001` … `-008` — the day review, rendered.
 *
 * ## What this component is allowed to do
 *
 * Render, and hand a submission to an injected action. It has no Supabase
 * client, no Server Action of its own, no RPC and no write path;
 * `phase-2m-review-authority-guard.test.ts` fails the build if any appears
 * anywhere under `src/features/day-review` — which is `2M-REVIEW-004`, enforced
 * structurally rather than by review.
 *
 * Every change a user makes here goes through `applyTaskDetailCommand`, the same
 * Server Action the task detail, the Work list, the calendar and the planner
 * submit to. The operation key, the request fingerprint, the staleness gate, the
 * confirmation a destructive verb requires, the audit row and the registered undo
 * are all inherited, because they live below that action and this file cannot
 * reach past it.
 *
 * ## The outcome is not inside the row
 *
 * The same lesson slices 2M.1 and 2M.2 paid for: this surface is
 * **day-partitioned**, so the successful case is often the one where the item
 * leaves the list — `carry_forward` moves an intention to tomorrow, and the
 * revalidated review of *today* no longer contains it. `CalendarOutcome` is
 * mounted once, above every list, and every control renders with
 * `renderResult={false}` so nothing is announced twice and nothing that has just
 * been changed takes its own answer away with it (`2M-MOBILE-004`,
 * `2M-ACCESS-004`).
 *
 * ## One `TaskDetailControls` per verb
 *
 * `carry_forward` and `plan` are both `set_planned`, differing only in the day
 * the surface proposes. A single control list cannot hold two controls for one
 * action — they would collide on the per-action operation key — so each verb is
 * rendered by its own invocation with a one-control list. Two independent keys is
 * the correct answer rather than a workaround: they are two different operations
 * the user may perform in either order.
 *
 * ## What it deliberately does not offer
 *
 * **Any proposal.** `2M-REVIEW-002` says the forward flow presents what is
 * committed and intended "without proposing changes the user has not asked for",
 * so there is no suggested action, no ranking, no "recommended" and no
 * preselected row. The one thing the surface fills in is the *day* for
 * `carry_forward`, which is what the verb's name already promises.
 *
 * **Any gesture.** OD-2M-6 A: visible, labelled controls only.
 */

import { useState } from "react";

import { UniversalStateLine } from "@/features/experience/universal-state";

import { CalendarOutcome } from "@/features/calendar/calendar-outcome";
import { ProtectedContent } from "@/features/operations/protected-content";
import type { TaskUndoHandler } from "@/features/operations/undo-affordance";
import { recordDayReviewActionApplied } from "@/features/product-analytics/interaction-events";
import type { TaskDetailCommandState } from "@/features/task-commands/detail-action-state";
import type { TaskDetailDateBounds, TaskDetailRelationOptions } from "@/features/task-commands/task-detail-controls";
import { TaskDetailControls, type TaskDetailCommandHandler } from "@/features/task-commands/task-detail-controls";
import type { Locale } from "@/lib/preferences";
import { formatInstant } from "@/lib/time/instant-format";

import { dayReviewControlFor, dayReviewRequiresConfirmation, type DayReviewVerb } from "./contracts";
import { getDayReviewCopy } from "./copy";
import type { DayReviewItem, DayReviewProjection } from "./day-review-projection";
import { summarizeDayReview } from "./synthesis";

/** No relation verb can reach this surface, so there is nothing to populate. */
const NO_RELATIONS: TaskDetailRelationOptions = Object.freeze({
  project: Object.freeze([]),
  context: Object.freeze([]),
  person: Object.freeze([]),
}) as TaskDetailRelationOptions;

export function DayReviewView({
  action,
  dateBounds,
  locale,
  projection,
  reviewsHref,
  undoAction,
}: {
  action: TaskDetailCommandHandler;
  dateBounds: TaskDetailDateBounds;
  locale: Locale;
  projection: DayReviewProjection;
  /** Where the generated-review list lives. Navigation only. */
  reviewsHref: string;
  undoAction?: TaskUndoHandler;
}) {
  const copy = getDayReviewCopy(locale);
  const [outcome, setOutcome] = useState<TaskDetailCommandState | null>(null);

  const synthesis = summarizeDayReview(projection);

  /**
   * Q3's numerator, recorded by a wrapper around the action rather than by an
   * effect inside the row — the same shape the planner uses, for the same
   * reason: a component cannot report its own outcome when the outcome is what
   * removes it.
   *
   * Only on a real application. A refusal, a `no_change` or an abandoned
   * confirmation is not a review action being applied, and counting one would
   * make the funnel report review actions that never happened.
   */
  function reporting(handler: TaskDetailCommandHandler, verb: DayReviewVerb): TaskDetailCommandHandler {
    return async (state, formData) => {
      const next = await handler(state, formData);
      setOutcome(next);
      if (next.status === "applied") {
        recordDayReviewActionApplied({ scope: projection.scope, actionKind: verb.kind, locale });
      }
      return next;
    };
  }

  function VerbControls({ item, verb }: { item: DayReviewItem; verb: DayReviewVerb }) {
    const control = dayReviewControlFor(verb);
    if (control === null) return null;
    const proposed = verb.patchSource === "next_day"
      ? projection.nextDay
      : verb.patchSource === "fixed" && verb.value !== null
        ? verb.value
        : undefined;

    return (
      <div className="day-review-verb" data-verb={verb.kind}>
        <p className="quiet-state">
          {copy.verbs[verb.kind]} — {copy.verbHints[verb.kind]}
          {dayReviewRequiresConfirmation(verb.kind) ? ` ${copy.irreversible}` : ""}
        </p>
        <TaskDetailControls
          action={reporting(action, verb)}
          controls={[control]}
          dateBounds={dateBounds}
          {...(proposed === undefined ? {} : { defaultValues: { [control.action]: proposed } })}
          locale={locale}
          relationOptions={NO_RELATIONS}
          renderResult={false}
          taskId={item.taskId}
          title={item.title}
          variant="inline"
        />
      </div>
    );
  }

  /**
   * @param source which section is rendering this row.
   *
   * "Concluído" is complete by definition, so a state word there would be a
   * label that can only say one thing. In "Intenções do dia" and "Prazos do
   * dia" a row may be either, and the word is the whole difference between a
   * list of what the day held and a list of what it left — which is what the
   * synthesis above counts.
   */
  function Row({ item, source }: { item: DayReviewItem; source: "completed" | "planned" | "due" }) {
    const open = source !== "completed" && item.completedAt === null;
    return (
      <li
        className="day-review-item"
        data-open={source === "completed" ? undefined : String(open)}
        key={item.taskId}
      >
        <div className="day-review-item-head">
          {source === "completed" ? null : (
            // Word first, tint second — `04-estados.md`, and the reason nothing
            // on this surface depends on colour alone.
            <span className="day-review-state">
              {open ? copy.synthesis.stateOpen : copy.synthesis.stateDone}
            </span>
          )}
          {/*
            The title is never rendered directly. `surface="calendar"` because
            the day review shares this phase's governed surface — a second
            surface name would be a vocabulary entry nothing declared.
          */}
          <ProtectedContent
            href={item.href}
            locale={locale}
            revealKey={item.taskId}
            sensitivity={item.sensitivity}
            surface="calendar"
          >
            {item.title}
          </ProtectedContent>
        </div>
        {/*
          The row's actions, behind a disclosure (owner report of 2026-08-20).

          ## What was wrong, measured with representative data

          Every row rendered **all five** command forms open — a date input, a
          status select and their buttons, each in its own block. Two tasks
          produced ten of them: **3 000 px of a 4 125 px desktop page**, and a
          **14 391 px** page on an iPhone. The review's own content — what the
          day actually contained — was a few lines at the top, and everything
          after it was controls. The owner reported the page as *"visualmente
          muito ruim"*, and this is the shape of it.

          ## Why `<details>` rather than a new pattern

          The product already answers this exact question on the calendar:
          `.calendar-reschedule` is a `<details>` whose `<summary>` opens the
          same `TaskDetailControls`. Inventing a second disclosure here would be
          a second thing to keep accessible and a second thing to style.

          **Nothing is removed and nothing moves behind a gesture.** The same
          five verbs, the same command path, the same confirmation rules — one
          press away, keyboard-operable, and announced by the native
          `<summary>`'s own expanded state.
        */}
        {item.verbs.length > 0 ? (
          <details className="day-review-actions">
            <summary className="day-review-actions-summary">{copy.rowActions}</summary>
            <div className="day-review-verbs">
              {item.verbs.map((verb) => <VerbControls item={item} key={verb.kind} verb={verb} />)}
            </div>
          </details>
        ) : null}
      </li>
    );
  }

  /**
   * A plain function returning elements, **called** rather than mounted.
   *
   * Not a component: `react-hooks/static-components` refuses a component created
   * during render, and it is right to — a fresh component identity on every
   * render remounts its whole subtree, which on this surface would discard the
   * state of any control the user was part-way through filling in. `Row` and
   * `VerbControls` are keyed leaves that React can reconcile; this one wraps
   * three lists and is invoked directly instead.
   */
  function section(items: readonly DayReviewItem[], source: "completed" | "planned" | "due") {
    const heading = copy.sections[source];
    return (
      <section aria-label={heading} className="day-review-section" data-source={source}>
        <h3>{heading}</h3>
        {projection.sourceStates[source] === "unavailable" ? (
          // `2M-REVIEW-001`. An unreadable source is never rendered as an empty
          // one: "nothing happened" and "I could not read this" are different
          // claims, and only one of them is true here.
          <p role="status">{copy.unavailable(heading)}</p>
        ) : items.length === 0 ? (
          <UniversalStateLine description={copy.empty[source]} locale={locale} state="empty" />
        ) : (
          <ul>{items.map((item) => <Row item={item} key={item.taskId} source={source} />)}</ul>
        )}
      </section>
    );
  }

  return (
    /*
      A `<section>` of `/app/reviews`, not a page of its own.

      It was a second `content-page` nested inside the first, with a flat run of
      `<h2>`s and the page's own `<h1>` *below* all of them — so the document
      opened at level two and the review's title was a sibling of its own
      sections rather than their parent. Demoting the `<h1>` (which is what the
      first repair did) fixed the count and left the order wrong, which is the
      half of `07-acessibilidade.md` an axe run does not measure.

      The outline now reads: `<h1>` Revisões → `<h2>` this review → `<h3>` its
      parts → `<h2>` the history below it.
    */
    <section aria-labelledby="day-review-title" className="day-review-page">
      <header className="list-header">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2 className="day-review-title" id="day-review-title">{copy.title(projection.scope)}</h2>
          <p>{copy.description(projection.scope)}</p>
          {/* `2M-REVIEW-007`, re-asserted on the surface that makes the promise. */}
          <UniversalStateLine description={copy.nothingScheduled} locale={locale} state="empty" />
        </div>
        <nav aria-label={copy.scopeLabel} className="day-review-scope-nav">
          {(["day", "next_day"] as const).map((scope) => (
            <a
              aria-current={projection.scope === scope ? "page" : undefined}
              href={`${reviewsHref}?scope=${scope}`}
              key={scope}
            >
              {copy.scopes[scope]}
            </a>
          ))}
        </nav>
      </header>

      <CalendarOutcome locale={locale} outcome={outcome} undoAction={undoAction} />

      {/*
        The closing's one-line reading, and the pendências under it.

        The surface listed five sections and left the reader to count four of
        them to answer "how did the day go". A closing states the day and then
        shows its parts — so this is first, and everything below it is the
        working out.

        **Every number is a count over the projection's own arrays.** No score,
        no proportion, no target and no "productive": `2M-REVIEW-002` forbids
        the surface proposing changes the user did not ask for, and grading a
        day is the loudest proposal there is. `summarizeDayReview` carries the
        derivation and its own account of why `partial` is a field rather than a
        footnote.
      */}
      <section aria-label={copy.synthesis.heading} className="day-review-synthesis">
        <h3>{copy.synthesis.heading}</h3>
        {synthesis.quiet ? (
          <UniversalStateLine description={copy.synthesis.quiet} locale={locale} state="empty" />
        ) : (
          <ul className="day-review-counts">
            <li>{copy.synthesis.completed(synthesis.completed)}</li>
            <li>{copy.synthesis.open(synthesis.open)}</li>
            <li>{copy.synthesis.captured(synthesis.captured)}</li>
          </ul>
        )}
        {/*
          A count over a source that failed is not a small count, it is an
          unknown one. Announced, because it changes what every number above
          means and the reader may already have read them.
        */}
        {synthesis.partial.length > 0 ? (
          <p className="day-review-partial" role="status">
            {copy.synthesis.partial(
              synthesis.partial.map((source) => copy.sections[source]).join(", "),
            )}
          </p>
        ) : null}
        {/*
          The pendências are **not listed here**, and that is deliberate.

          Every one of them is already a row in "Intenções do dia" or "Prazos do
          dia" below, with the verbs its own status admits. A second list would
          be the repetition `2J-HOJE-004` removed from Hoje for the same reason —
          *the same task in two lists on one screen, where the second copy always
          carries less than the first* — and here it would carry less in the way
          that matters most: no controls, or a second set of them competing for
          the same operation key.

          So the count is stated here and the rows say their own state where they
          already are, which is what `data-open` on the row is for.
        */}
      </section>

      <section aria-label={copy.schedule.heading} className="day-review-schedule">
        <h3>{copy.schedule.heading}</h3>
        {/* `2M-REVIEW-006`. The three preferences, read — and said back. */}
        <p>
          {projection.schedule.dailyAt === null
            ? copy.schedule.dailyUnknown
            : projection.schedule.dailyTimeReached
              ? copy.schedule.dailyAfter(projection.schedule.dailyAt)
              : copy.schedule.dailyBefore(projection.schedule.dailyAt)}
        </p>
        <p>
          {projection.schedule.weeklyAt === null || projection.schedule.weeklyWeekday === null
            ? copy.schedule.weeklyUnknown
            : projection.schedule.weeklyDayReached
              ? copy.schedule.weeklyToday(projection.schedule.weeklyAt)
              : copy.schedule.weekly(
                copy.weekdays[projection.schedule.weeklyWeekday],
                projection.schedule.weeklyAt,
              )}
        </p>
      </section>

      <section aria-label={copy.unreadableHeading} className="day-review-unreadable">
        <h3>{copy.unreadableHeading}</h3>
        {projection.unreadable.length === 0 ? (
          <UniversalStateLine description={copy.unreadableNone} locale={locale} state="empty" />
        ) : (
          /*
            `role="status"` on the wrapper, not on the `<ul>`.

            An explicit role *replaces* the element's implicit one, so
            `<ul role="status">` stops being a list and its `<li>` children have
            no list parent — which is exactly what axe reported on the live page.
            The announcement and the list structure are two different jobs, and
            they now sit on two different elements.
          */
          <div role="status">
            <ul>
              {projection.unreadable.map((source) => (
                <li key={source}>{copy.unavailable(copy.sections[source])}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {section(projection.completed, "completed")}
      {section(projection.planned, "planned")}
      {section(projection.due, "due")}

      <section aria-label={copy.sections.captured} className="day-review-section" data-source="captured">
        <h3>{copy.sections.captured}</h3>
        {projection.sourceStates.captured === "unavailable" ? (
          <p role="status">{copy.unavailable(copy.sections.captured)}</p>
        ) : projection.captured.length === 0 ? (
          <UniversalStateLine description={copy.empty.captured} locale={locale} state="empty" />
        ) : (
          <ul>
            {projection.captured.map((capture) => (
              <li className="day-review-item" key={capture.entryId}>
                <ProtectedContent
                  href={capture.href}
                  locale={locale}
                  revealKey={capture.entryId}
                  sensitivity={capture.sensitivity}
                  surface="calendar"
                >
                  {capture.excerpt}
                </ProtectedContent>
                <p className="day-review-item-meta">
                  {formatInstant(capture.capturedAt, "time", locale, projection.timezone)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label={copy.generatedHeading} className="day-review-section" data-source="generated">
        <h3>{copy.generatedHeading}</h3>
        {projection.sourceStates.generated === "unavailable" ? (
          <p role="status">{copy.unavailable(copy.generatedHeading)}</p>
        ) : projection.generated === null ? (
          <UniversalStateLine description={copy.generatedNone} locale={locale} state="empty" />
        ) : (
          /*
           * `2M-REVIEW-008`. Every field here comes from `toReviewListItemView`
           * — the `review_summary` presentation contract — and this surface adds
           * no formatting of its own to a stored review's period, status or
           * words. A review rendered around the contract would be a second
           * opinion on what "outdated" means.
           */
          <article className="review-card">
            <header>
              <div>
                <span>{projection.generated.periodLabel}</span>
                <h4>{projection.generated.title}</h4>
              </div>
              <span className="status-badge" data-tone={projection.generated.statusTone}>
                {projection.generated.statusLabel}
              </span>
            </header>
            <footer>{projection.generated.periodLabelRange}</footer>
          </article>
        )}
        <p><a className="row-action" href={reviewsHref}>{copy.openReviews}</a></p>
      </section>
    </section>
  );
}
