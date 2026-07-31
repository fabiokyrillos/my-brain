import { toReminderStatus } from "@/features/reminders/lifecycle";

import type { HistoryChangeField, HistoryCopy } from "./copy";
import { HISTORY_CHANGE_FIELDS } from "./copy";
import { HISTORY_SUBJECT_ROUTES } from "./subject-route";
import {
  asHistoryActionType,
  asHistoryActor,
  asHistoryEntityType,
  asProjectStatus,
  asTaskPriority,
  asTaskStatus,
  type HistoryActionType,
  type HistoryActor,
  type HistoryEntityType,
} from "./vocabulary";

/**
 * One audit row turned into something a person reads (UX-13, UX-21, UX-28).
 *
 * Pure by construction: no Supabase, no `Intl` instance of its own, no clock.
 * Dates arrive already formatted through the `formatDate` callback the caller
 * supplies, which is what lets the tests assert on exact sentences without
 * depending on the runner's timezone.
 *
 * ## The rule this module is built around
 *
 * *Never manufacture detail.* A creation has no `before_state`, so it gets no
 * "from → to" clause. A row whose payloads do not overlap on any field the
 * product has a label for gets the plain sentence and nothing else. The
 * describer would rather say less than say something it cannot prove from the
 * row in front of it.
 */

export type HistoryEventRow = {
  readonly id: string;
  readonly actionType: string;
  readonly actor: string;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly beforeState: unknown;
  readonly afterState: unknown;
  readonly occurredAt: string;
};

/** One field that demonstrably changed, both sides already localized. */
export type HistoryChange = {
  readonly field: HistoryChangeField;
  readonly label: string;
  readonly from: string;
  readonly to: string;
};

/**
 * Whether the object this event is about can still be reached.
 *
 * - `resolved` — the caller loaded the row, so the reader owns it and it exists.
 * - `unavailable` — the kind has a detail route but the row did not come back:
 *   deleted, or belonging to someone else. The event stays; the link does not.
 * - `no-route` — the kind has no page of its own. Nothing is missing.
 */
export type HistorySubjectState = "resolved" | "unavailable" | "no-route";

export type HistoryEvent = {
  readonly id: string;
  readonly actor: HistoryActor;
  readonly actionType: HistoryActionType | null;
  readonly entityType: HistoryEntityType | null;
  readonly entityId: string | null;
  readonly occurredAt: string;
  readonly subject: HistorySubjectState;
  /** The whole event as one sentence. */
  readonly sentence: string;
  /**
   * Further changes, when there is more than one. A single change is folded
   * into `sentence` instead, because "Você alterou a prioridade de X de Média
   * para Alta" reads better than a sentence followed by a one-row table.
   */
  readonly changes: readonly HistoryChange[];
};

const TEXT_FIELDS = new Set<HistoryChangeField>(["title", "description", "content", "name"]);
const DATE_FIELDS = new Set<HistoryChangeField>(["due_at", "planned_at", "remind_at"]);
const MAX_VALUE_LENGTH = 80;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function truncate(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > MAX_VALUE_LENGTH ? `${trimmed.slice(0, MAX_VALUE_LENGTH)}…` : trimmed;
}

/**
 * A stored value rendered in the reader's language, or null when it cannot be.
 *
 * Returning null is the important half. `status` on a project and `status` on a
 * task are different vocabularies, and a value belonging to neither — a future
 * enum member, a column that changed meaning — must not fall through to being
 * printed raw. The field is dropped from the description instead (UX-21).
 */
function formatValue(
  field: HistoryChangeField,
  value: unknown,
  entityType: HistoryEntityType | null,
  copy: HistoryCopy,
  formatDate: (iso: string) => string,
): string | null {
  if (value === null || value === undefined) return copy.noValue;

  if (field === "status") {
    if (entityType === "task") {
      const status = asTaskStatus(value);
      return status === null ? null : copy.taskStatuses[status];
    }
    if (entityType === "project") {
      const status = asProjectStatus(value);
      return status === null ? null : copy.projectStatuses[status];
    }
    if (entityType === "reminder") {
      const status = toReminderStatus(String(value));
      return status === null ? null : copy.reminderStatuses[status];
    }
    return null;
  }

  if (field === "priority") {
    const priority = asTaskPriority(value);
    return priority === null ? null : copy.taskPriorities[priority];
  }

  if (DATE_FIELDS.has(field)) {
    if (typeof value !== "string") return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : formatDate(value);
  }

  if (TEXT_FIELDS.has(field)) {
    if (typeof value !== "string") return null;
    const text = truncate(value);
    return text === "" ? copy.noValue : text;
  }

  return null;
}

/**
 * The fields that differ between the two payloads, in a stable order.
 *
 * Both payloads must be objects: a row with only an `after_state` records a
 * creation, and describing it as a change from nothing would be an invention.
 * A field present in only one payload is likewise skipped — the writers build
 * their jsonb explicitly, so an absent key means "not recorded here", not
 * "was null".
 */
export function extractChanges(
  row: Pick<HistoryEventRow, "beforeState" | "afterState">,
  entityType: HistoryEntityType | null,
  copy: HistoryCopy,
  formatDate: (iso: string) => string,
): readonly HistoryChange[] {
  const before = asRecord(row.beforeState);
  const after = asRecord(row.afterState);
  if (before === null || after === null) return [];

  const changes: HistoryChange[] = [];
  for (const field of HISTORY_CHANGE_FIELDS) {
    if (!(field in before) || !(field in after)) continue;
    if (JSON.stringify(before[field] ?? null) === JSON.stringify(after[field] ?? null)) continue;

    const from = formatValue(field, before[field], entityType, copy, formatDate);
    const to = formatValue(field, after[field], entityType, copy, formatDate);
    if (from === null || to === null || from === to) continue;

    changes.push({ field, label: copy.fields[field], from, to });
  }
  return changes;
}

function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

/**
 * Renders an action template against a subject that may not exist.
 *
 * A `[…]` segment is the part of the phrase that only makes sense with a name
 * in it: kept (without the brackets) when there is one, removed entirely when
 * there is not. Removing the whole segment rather than just the `{subject}`
 * token is what keeps "desfez uma alteração em" from ever being rendered.
 */
function renderAction(template: string, subjectLabel: string | null): string {
  if (subjectLabel === null) return template.replace(/\[[^\]]*\]/g, "");
  return fill(template.replace(/\[([^\]]*)\]/g, "$1"), { subject: truncate(subjectLabel) });
}

/**
 * The whole row as a sentence, plus any changes that did not fit inside it.
 *
 * @param subject what the caller found when it went looking for the object.
 * `found: false` is what makes the deleted-subject state honest — the row is
 * still rendered, and the link is withheld rather than pointed at a 404.
 */
export function describeHistoryEvent(
  row: HistoryEventRow,
  subject: { readonly found: boolean; readonly label: string | null },
  copy: HistoryCopy,
  formatDate: (iso: string) => string,
): HistoryEvent {
  const actor = asHistoryActor(row.actor);
  const actionType = asHistoryActionType(row.actionType);
  const entityType = asHistoryEntityType(row.entityType);
  const actorLabel = copy.actors[actor];
  const changes = extractChanges(row, entityType, copy, formatDate);
  const subjectLabel = subject.found ? subject.label : null;

  const base = {
    id: row.id,
    actor,
    actionType,
    entityType,
    entityId: row.entityId,
    occurredAt: row.occurredAt,
    subject: subjectState(entityType, row.entityId, subject.found),
  };

  if (changes.length === 1) {
    const [change] = changes;
    const sentence =
      subjectLabel === null
        ? fill(copy.changeSentenceWithoutSubject, {
            actor: actorLabel,
            field: copy.fieldsInSentence[change.field],
            from: change.from,
            to: change.to,
          })
        : fill(copy.changeSentence, {
            actor: actorLabel,
            field: copy.fieldsInSentence[change.field],
            subject: truncate(subjectLabel),
            from: change.from,
            to: change.to,
          });
    return { ...base, sentence, changes: [] };
  }

  const template = actionType === null ? copy.unknownAction : copy.actions[actionType];
  const sentence = `${actorLabel} ${renderAction(template, subjectLabel)}`;
  return { ...base, sentence, changes };
}

/**
 * A link is only offered when the row was loaded, never merely because the kind
 * is linkable — otherwise a deleted task would render an anchor to a 404.
 */
function subjectState(
  entityType: HistoryEntityType | null,
  entityId: string | null,
  found: boolean,
): HistorySubjectState {
  if (entityType === null || entityId === null) return "no-route";
  if (HISTORY_SUBJECT_ROUTES[entityType] === null) return "no-route";
  return found ? "resolved" : "unavailable";
}
