import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { ButtonLink, PageHeader, SegmentedControl, cn } from "@/components/ui";
import type { Locale } from "@/lib/preferences";

import { agendaLensHref, getAgendaHeaderCopy, type AgendaLens } from "./agenda-copy";
import { AgendaDatePicker } from "./agenda-date-picker";

/**
 * Life Brain A.4 (`LB-A-007`) — one header for the three lenses of the Agenda.
 *
 * Calendário, Planejar and Lembretes were three pages with three headers, and
 * the first two carried the "Lista · Calendário · Planejar" strip that made
 * them modes of Tarefas. They are now lenses of one destination: the same
 * compact title, the same `SegmentedControl` of lenses, and — where the lens
 * has a date — the date stepper in the header's action slot (Lembretes puts its
 * one action, the composer, there instead)
 * (`DESIGN_DIRECTION.md` §6.4).
 *
 * The lenses are links to the routes that already existed, with
 * `aria-current="page"`: each lens keeps its own server-rendered loader, and
 * nothing a notification or a bookmark points at moves.
 */
export function AgendaHeader({
  headingId,
  lens,
  locale,
  actions,
  period,
}: {
  readonly headingId?: string;
  readonly lens: AgendaLens;
  readonly locale: Locale;
  /** The header's action slot: the lens's one action (Lembretes' composer). */
  readonly actions?: ReactNode;
  /**
   * ADR-180 — the period being shown, as the page's subject.
   *
   * A lens with a date (Calendário, Planejar) passes its stepper here instead
   * of into `actions`. The destination's name then steps back to a small line
   * beside the lenses, and the period — the thing the page is about — is the
   * largest text on it, in the reading face.
   */
  readonly period?: ReactNode;
}) {
  const copy = getAgendaHeaderCopy(locale);
  const lenses: readonly AgendaLens[] = ["calendar", "plan", "reminders"];
  const lensControl = (
    <SegmentedControl
      className="agenda-lenses"
      label={copy.lensesLabel}
      options={lenses.map((candidate) => ({
        value: candidate,
        label: copy.lenses[candidate],
        href: agendaLensHref(locale, candidate),
      }))}
      value={lens}
    />
  );
  if (period !== undefined) {
    return (
      <header className="agenda-masthead">
        <div className="agenda-masthead-top">
          <h1 className="agenda-masthead-title"><span id={headingId}>{copy.title}</span></h1>
          {lensControl}
        </div>
        {period}
      </header>
    );
  }
  return (
    <>
      <PageHeader
        actions={actions}
        className="agenda-header"
        size="compact"
        title={<span id={headingId}>{copy.title}</span>}
      />
      {lensControl}
    </>
  );
}

export type AgendaStep = {
  readonly href: string;
  readonly label: string;
  /** At the edge of the range the calendar covers: still a link, said as such. */
  readonly disabled?: boolean;
};

/** What the period label needs to open a picker (Life Brain D.1). */
export type AgendaPickerTarget = {
  /** The page's URL with `AGENDA_DATE_TOKEN` where the chosen date goes. */
  readonly hrefTemplate: string;
  /** The navigation bound, `YYYY-MM-DD`. */
  readonly min: string;
  readonly max: string;
  /** The anchor being shown and today, `YYYY-MM-DD`. */
  readonly selected: string;
  readonly today: string;
};

/**
 * Previous · the period · Today · Next, in the header.
 *
 * Life Brain D.1: the period is no longer a paragraph. It is the trigger of a
 * month of days (`AgendaDatePicker`), so the arrows stop being the only way to
 * move. It is required, not optional: a stepper without it is the defect.
 *
 * Links, never buttons: the URL is the state, the back button works, and a
 * period opens in a new tab. The arrows are icon-only, so their names are the
 * period words the calendar already had; the period label is a polite live
 * region so moving says where it landed.
 */
export function AgendaStepper({
  caption,
  className,
  locale,
  next,
  picker,
  previous,
  rangeClassName,
  rangeLabel,
  today,
}: {
  /**
   * The one line under the period: that it is today, what it holds, or what
   * the page asks. Inside the stepper so that on a phone it shares its line
   * with the arrows and the period keeps a line to itself.
   */
  readonly caption?: ReactNode;
  readonly className?: string;
  readonly locale: Locale;
  readonly next: AgendaStep;
  readonly picker: AgendaPickerTarget;
  readonly previous: AgendaStep;
  readonly rangeClassName?: string;
  readonly rangeLabel: string;
  /**
   * Back to today. `null` when the period on screen already holds today: a
   * link to the page being read is a control that does nothing.
   */
  readonly today: AgendaStep | null;
}) {
  const copy = getAgendaHeaderCopy(locale);
  return (
    <nav aria-label={copy.stepperLabel} className={cn("agenda-stepper", className)}>
      {/* The period first: it is what is read; the arrows follow it (ADR-180). */}
      <AgendaDatePicker
        className={rangeClassName}
        hrefTemplate={picker.hrefTemplate}
        label={rangeLabel}
        locale={locale}
        max={picker.max}
        min={picker.min}
        selected={picker.selected}
        today={picker.today}
      />
      {caption === undefined ? null : <div className="agenda-stepper-caption">{caption}</div>}
      <ButtonLink
        aria-disabled={previous.disabled ? "true" : undefined}
        aria-label={previous.label}
        className="ui-icon-button"
        href={previous.href}
        icon={<ChevronLeft />}
        rel="prev"
        size="sm"
        variant="ghost"
      />
      <ButtonLink
        aria-disabled={next.disabled ? "true" : undefined}
        aria-label={next.label}
        className="ui-icon-button"
        href={next.href}
        icon={<ChevronRight />}
        rel="next"
        size="sm"
        variant="ghost"
      />
      {today === null ? null : (
        <ButtonLink className="agenda-stepper-today" href={today.href} size="sm" variant="ghost">{today.label}</ButtonLink>
      )}
    </nav>
  );
}
