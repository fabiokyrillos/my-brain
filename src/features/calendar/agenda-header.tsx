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
}: {
  readonly headingId?: string;
  readonly lens: AgendaLens;
  readonly locale: Locale;
  /** The header's action slot: the date stepper, or the lens's one action. */
  readonly actions?: ReactNode;
}) {
  const copy = getAgendaHeaderCopy(locale);
  const lenses: readonly AgendaLens[] = ["calendar", "plan", "reminders"];
  return (
    <>
      <PageHeader
        actions={actions}
        className="agenda-header"
        size="compact"
        title={<span id={headingId}>{copy.title}</span>}
      />
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
  className,
  locale,
  next,
  picker,
  previous,
  rangeClassName,
  rangeLabel,
  today,
}: {
  readonly className?: string;
  readonly locale: Locale;
  readonly next: AgendaStep;
  readonly picker: AgendaPickerTarget;
  readonly previous: AgendaStep;
  readonly rangeClassName?: string;
  readonly rangeLabel: string;
  readonly today: AgendaStep;
}) {
  const copy = getAgendaHeaderCopy(locale);
  return (
    <nav aria-label={copy.stepperLabel} className={cn("agenda-stepper", className)}>
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
      <ButtonLink href={today.href} size="sm" variant="secondary">{today.label}</ButtonLink>
    </nav>
  );
}
