import type { ReactNode } from "react";

import Link from "next/link";

import { formatPlannedDay, getPlannedAtCopy } from "@/features/planning/planned-at";
import type { TaskDetailFact } from "@/features/task-commands/task-detail-controls";
import type { Locale } from "@/lib/preferences";

import type { RelationSummary, WorkItemPriority } from "./contracts";
import { getTaskDetailCopy } from "./task-detail-copy";
import type { TaskDetailProjection } from "./task-detail-projection";

/**
 * What a task *is*, as one ordered list of rows.
 *
 * The detail used to say this three times: a read-only "Detalhes" list, a
 * "Relações" list of the same task's facts, and — two screens further down —
 * twelve always-open forms, each repeating the field it changed. This module is
 * the single list the three collapsed into.
 *
 * It is **one function with two readers**, and that is the point of it living
 * here rather than in either of them: `TaskDetailView` prints it as a plain
 * `<dl>` when the task admits no edit at all, and `TaskDetailControls` prints
 * the same rows with their editing in place. Two hand-written lists would
 * drift, and the drift would be a row one reader shows and the other does not.
 *
 * Pure and server-safe: it formats, links and orders. Which rows may be
 * *changed* is not decided here — `actions` only names the command verbs that
 * belong to a row, and the controls offer one of them only when
 * `detailControlsFor(status)` also does.
 */

const priorityCopy: Record<WorkItemPriority, { pt: string; en: string }> = {
  low: { pt: "Baixa", en: "Low" },
  medium: { pt: "Média", en: "Medium" },
  high: { pt: "Alta", en: "High" },
  urgent: { pt: "Urgente", en: "Urgent" },
};

/**
 * Relations render as links, not as inert badges.
 *
 * On the Work list they are `<span class="status-badge">`, which is the
 * "looks actionable, is not" pattern UX-20 is about — a task's project is a
 * place the user can go. A context has no page, so it stays text: a control
 * that leads nowhere must not look like one that does.
 */
function relationValue(
  items: readonly RelationSummary[],
  hrefFor: (item: RelationSummary) => string | null,
): ReactNode {
  return (
    <span className="task-relations">
      {items.map((item) => {
        const href = hrefFor(item);
        return href ? (
          <Link className="task-relation" href={href} key={item.id}>{item.label}</Link>
        ) : (
          <span className="task-relation task-relation-plain" key={item.id}>{item.label}</span>
        );
      })}
    </span>
  );
}

export function taskFactsFor(
  detail: TaskDetailProjection,
  locale: Locale,
  agentName: string,
): readonly TaskDetailFact[] {
  const copy = getTaskDetailCopy(locale, agentName);
  const planned = getPlannedAtCopy(locale);
  const { task } = detail;
  const dateTime = (value: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short", timeZone: detail.timezone })
      .format(new Date(value));

  const personHref = (item: RelationSummary) => `/${locale}/app/people/${item.id}`;
  const taskHref = (item: RelationSummary) => `/${locale}/app/work/${item.id}`;

  /** A relation row is always present: "none" is an answer, and it is where the row's verb lives. */
  const relation = (
    id: string,
    label: string,
    none: string,
    items: readonly RelationSummary[],
    hrefFor: (item: RelationSummary) => string | null,
    actions: TaskDetailFact["actions"],
  ): TaskDetailFact => ({
    id,
    label,
    value: items.length ? relationValue(items, hrefFor) : none,
    empty: items.length === 0,
    // Linking a project, a context or a person ADDS one to the list; it does
    // not replace what is there, so the row's verb must not say "Alterar".
    additive: actions.every((action) => action.startsWith("assign_")),
    actions,
  });

  /** A row that exists only when it has something to say, and that nothing here changes. */
  const stated = (id: string, label: string, value: ReactNode): TaskDetailFact => ({
    id,
    label,
    value,
    empty: false,
    actions: [],
  });

  const plannedDay = formatPlannedDay(task.plannedAt, locale, detail.timezone);
  const dependsOn = task.dependsOn ?? [];

  return [
    {
      id: "due",
      label: copy.fields.due,
      value: task.dueAt ? dateTime(task.dueAt) : task.noDueReason ?? copy.fields.noDue,
      empty: !task.dueAt,
      actions: ["reschedule_due", "clear_due"],
    },
    /*
      `2M-PLAN-001`. The label and the formatting both come from the declaration:
      a planned day is a day the user chose, never a time they reserved, which is
      what OD-2M-3 A says `planned_at` is not. The row is present even when
      empty, because "no planned day" is an answer and an absent row is not.
    */
    {
      id: "planned",
      label: planned.label,
      value: plannedDay ?? planned.none,
      empty: plannedDay === null,
      actions: ["set_planned", "clear_planned"],
    },
    {
      id: "priority",
      label: copy.fields.priority,
      value: task.priority
        ? priorityCopy[task.priority][locale === "pt-BR" ? "pt" : "en"]
        : copy.fields.noPriority,
      empty: !task.priority,
      actions: ["set_priority"],
    },
    relation(
      "projects",
      copy.relations.projects,
      copy.relations.none.projects,
      task.projects,
      (item) => `/${locale}/app/projects/${item.id}`,
      ["assign_project"],
    ),
    relation("contexts", copy.relations.contexts, copy.relations.none.contexts, task.contexts, () => null, ["assign_context"]),
    relation("people", copy.relations.people, copy.relations.none.people, task.people, personHref, ["assign_person"]),
    relation(
      "waitingOn",
      copy.relations.waitingOn,
      copy.relations.none.waitingOn,
      task.waitingOnPeople,
      personHref,
      ["set_waiting_on"],
    ),
    ...(task.parent ? [stated("parent", copy.relations.parent, relationValue([task.parent], taskHref))] : []),
    ...(dependsOn.length ? [stated("dependsOn", copy.relations.dependsOn, relationValue(dependsOn, taskHref))] : []),
    ...(detail.completedAt ? [stated("completed", copy.fields.completed, dateTime(detail.completedAt))] : []),
    ...(detail.cancelledAt ? [stated("cancelled", copy.fields.cancelled, dateTime(detail.cancelledAt))] : []),
  ];
}
