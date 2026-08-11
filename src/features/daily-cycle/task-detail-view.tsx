import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getWorkCopy } from "@/features/operations/copy";
import { ProtectedContent } from "@/features/operations/protected-content";
import { formatPlannedDay, getPlannedAtCopy } from "@/features/planning/planned-at";
import { isDerivedLevel } from "@/features/sensitivity/task-derivation";
import type { Locale } from "@/lib/preferences";
import type { RelationSummary, WorkItemHumanState, WorkItemPriority } from "./contracts";
import { describeHistoryEntry, getTaskDetailCopy } from "./task-detail-copy";
import { TaskPanelClose } from "./task-panel-close";
import type { TaskDetailProjection } from "./task-detail-projection";

/**
 * The task, as an object the user can inspect.
 *
 * Pure presentation over the projection, with **no data access and no write
 * path**: the actions are injected by the route, which passes the same
 * `applyWorkItemAction` the Work list already uses.
 */
const humanStateCopy: Record<WorkItemHumanState, { pt: string; en: string }> = {
  not_started: { pt: "Não iniciada", en: "Not started" },
  in_progress: { pt: "Em andamento", en: "In progress" },
  waiting_on_someone: { pt: "Aguardando alguém", en: "Waiting on someone" },
  blocked: { pt: "Bloqueada", en: "Blocked" },
  deferred: { pt: "Adiada", en: "Deferred" },
  completed: { pt: "Concluída", en: "Completed" },
  cancelled: { pt: "Cancelada", en: "Cancelled" },
};

const priorityCopy: Record<WorkItemPriority, { pt: string; en: string }> = {
  low: { pt: "Baixa", en: "Low" },
  medium: { pt: "Média", en: "Medium" },
  high: { pt: "Alta", en: "High" },
  urgent: { pt: "Urgente", en: "Urgent" },
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="task-field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * Relations render as links, not as inert badges.
 *
 * On the Work list they are `<span class="status-badge">`, which is the
 * "looks actionable, is not" pattern UX-20 is about — a task's project is a
 * place the user can go.
 */
function RelationGroup({
  label,
  items,
  hrefFor,
}: {
  label: string;
  items: readonly RelationSummary[];
  hrefFor: (item: RelationSummary) => string | null;
}) {
  if (items.length === 0) return null;
  return (
    <div className="task-relation-group">
      <dt>{label}</dt>
      <dd>
        {items.map((item) => {
          const href = hrefFor(item);
          return href ? (
            <Link className="task-relation" href={href} key={item.id}>{item.label}</Link>
          ) : (
            <span className="task-relation task-relation-plain" key={item.id}>{item.label}</span>
          );
        })}
      </dd>
    </div>
  );
}

export function TaskDetailView({
  locale,
  agentName,
  detail,
  actions,
  controls,
  panel = false,
  backHref,
  backDestination = "work",
}: {
  locale: Locale;
  detail: TaskDetailProjection;
  /**
   * `2L-EDIT-007` — which frame this mount is in, and nothing else.
   *
   * The same component, the same fields, the same injected actions and the same
   * control set render in both. What the flag selects is the outer class the
   * layout keys its two shapes off — a docked panel beside the list on a wide
   * viewport, a full surface on a narrow one — and, on the panel, a back
   * affordance that returns to where the user was instead of to the list's
   * default view.
   *
   * It must never select a control. A viewport that changed what a user can do
   * is the failure this requirement is written against.
   */
  panel?: boolean;
  /**
   * `2L-RETURN-001`. Where the back affordance leads: the position the user
   * came from, already resolved by the route. Defaults to the Work list, which
   * is what a task opened from outside Work should return to.
   */
  backHref?: string;
  /**
   * `2M-CAL-008`. Which surface `backHref` leads to, so the affordance can name
   * it. Resolved by the route from the same parse that produced the href —
   * never re-derived here, because a label that guesses is how it came to say
   * "Trabalho" while pointing at the calendar. Defaults to Work, matching
   * `backHref`'s own default.
   */
  backDestination?: "calendar" | "work";
  /** The status controls, injected so this component holds no Server Action. */
  actions: ReactNode;
  /**
   * The field-edit controls (Slice D2), injected for the same reason and kept a
   * separate slot rather than folded into `actions`: they sit below the facts
   * they change, because the answer to "what is this task" must not be pushed
   * off the first screen by the ways to change it.
   */
  controls?: ReactNode;
  agentName: string;
}) {
  const copy = getTaskDetailCopy(locale, agentName);
  const backLabel = backDestination === "calendar" ? copy.backToCalendar : copy.back;
  const pt = locale === "pt-BR";
  const { task } = detail;
  const dateTime = (value: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short", timeZone: detail.timezone })
      .format(new Date(value));

  const hasRelations =
    task.projects.length > 0
    || task.contexts.length > 0
    || task.people.length > 0
    || task.waitingOnPeople.length > 0
    || Boolean(task.parent)
    || (task.dependsOn?.length ?? 0) > 0;

  return (
    <div className={panel ? "content-page task-detail-page task-detail-panel" : "content-page task-detail-page"}>
      {panel ? (
        // `router.back()` rather than a link to the list: the panel was opened
        // from a position — a view, a page, a filter — and a link would send the
        // user to the list's default instead of to where they actually were.
        // The URL-carried return position itself is slice 2L.3's subject.
        <TaskPanelClose label={backLabel} />
      ) : (
        <Link className="back-link" href={backHref ?? `/${locale}/app/work`}>
          <ArrowLeft size={16} aria-hidden="true" />{backLabel}
        </Link>
      )}

      <header className="task-detail-header">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          {/*
            `2L-PRIVACY-001`/`-007`. The detail withholds through the **same**
            component the list does, so the two cannot drift: neither surface
            owns a rule, and a surface that stopped asking would fail
            `sensitivity-convergence.test.ts` rather than silently print.
          */}
          <ProtectedContent locale={locale} revealKey={task.taskId} sensitivity={task.sensitivity}>
            <h1>{task.title}</h1>
            <p className="task-description">{task.description ?? copy.noDescription}</p>
          </ProtectedContent>
        </div>
        <span className="status-badge">{humanStateCopy[task.humanState][pt ? "pt" : "en"]}</span>
      </header>

      {actions}

      <section className="task-detail-section" aria-label={copy.sections.details}>
        <h2>{copy.sections.details}</h2>
        <dl className="task-fields">
          <Field label={copy.fields.due}>
            {task.dueAt
              ? dateTime(task.dueAt)
              : task.noDueReason ?? copy.fields.noDue}
          </Field>
          {/*
            `2M-PLAN-001`. The label and the formatting both come from the
            declaration, and the second is the substantive change: this field
            rendered `dateTime(...)` — a day the user chose, presented as a time
            they reserved, which is precisely what OD-2M-3 A says `planned_at`
            is not. The field is now shown even when empty, because "no planned
            day" is an answer and an absent row is not.
          */}
          <Field label={getPlannedAtCopy(locale).label}>
            {formatPlannedDay(task.plannedAt, locale, detail.timezone) ?? getPlannedAtCopy(locale).none}
          </Field>
          <Field label={copy.fields.priority}>
            {task.priority ? priorityCopy[task.priority][pt ? "pt" : "en"] : copy.none}
          </Field>
          <Field label={copy.fields.origin}>
            {task.origin === "brain" ? copy.origins.brain : copy.origins.you}
          </Field>
          <Field label={copy.fields.created}>{dateTime(detail.createdAt)}</Field>
          <Field label={copy.fields.updated}>{dateTime(detail.updatedAt)}</Field>
          {detail.completedAt ? <Field label={copy.fields.completed}>{dateTime(detail.completedAt)}</Field> : null}
          {detail.cancelledAt ? <Field label={copy.fields.cancelled}>{dateTime(detail.cancelledAt)}</Field> : null}
        </dl>
      </section>

      {controls}

      <section className="task-detail-section" aria-label={copy.sections.relations}>
        <h2>{copy.sections.relations}</h2>
        {hasRelations ? (
          <dl className="task-relations">
            <RelationGroup label={copy.relations.projects} items={task.projects} hrefFor={(item) => `/${locale}/app/projects/${item.id}`} />
            <RelationGroup label={copy.relations.contexts} items={task.contexts} hrefFor={() => null} />
            <RelationGroup label={copy.relations.people} items={task.people} hrefFor={(item) => `/${locale}/app/people/${item.id}`} />
            <RelationGroup label={copy.relations.waitingOn} items={task.waitingOnPeople} hrefFor={(item) => `/${locale}/app/people/${item.id}`} />
            <RelationGroup label={copy.relations.parent} items={task.parent ? [task.parent] : []} hrefFor={(item) => `/${locale}/app/work/${item.id}`} />
            <RelationGroup label={copy.relations.dependsOn} items={task.dependsOn ?? []} hrefFor={(item) => `/${locale}/app/work/${item.id}`} />
          </dl>
        ) : (
          <p className="quiet-state">{copy.relations.empty}</p>
        )}
      </section>

      <section className="task-detail-section" aria-label={copy.sections.provenance}>
        <h2>{copy.sections.provenance}</h2>
        {detail.provenance ? (
          <>
            <p className="quiet-state">{copy.provenance.fromEntry}</p>
            {/*
              The excerpt is the *entry itself*, which is the record whose
              classification produced the mask above. Printing it while the
              title is withheld would make the mask theatre, so it goes through
              the same contract with its own reveal key — revealing the title
              does not reveal the note, and vice versa.
            */}
            <ProtectedContent
              locale={locale}
              revealKey={`${task.taskId}:provenance`}
              sensitivity={task.sensitivity}
            >
              <blockquote className="task-provenance">{detail.provenance.preview}</blockquote>
            </ProtectedContent>
            <Link className="panel-view-all" href={`/${locale}/app/inbox/${detail.provenance.entryId}`}>
              {copy.provenance.openEntry}
            </Link>
          </>
        ) : (
          <>
            <p className="quiet-state">{copy.provenance.manual}</p>
            {/*
              `2L-PRIVACY-004`, stated exactly where a user could otherwise be
              misled: this is the one screen that tells them the task came from
              nothing, and therefore the one screen where "so nothing protects
              it" belongs.
            */}
            {isDerivedLevel(task.sensitivity) ? null : (
              <p className="quiet-state work-protected-note">
                {getWorkCopy(locale).protected.partialCoverage}
              </p>
            )}
          </>
        )}
      </section>

      <section className="task-detail-section" aria-label={copy.sections.history}>
        <h2>{copy.sections.history}</h2>
        {detail.history.length ? (
          <ol className="task-history">
            {detail.history.map((entry) => (
              <li key={entry.id}>
                <strong>{describeHistoryEntry(copy, entry)}</strong>
                {/*
                  `audit_logs.reason` is deliberately not rendered. It is written
                  by SQL as English prose — "Task created", "User created a task
                  directly" — so showing it puts untranslated text in front of a
                  Portuguese reader, and for a task every value it can hold only
                  restates the action the sentence above already names.
                  Localizing it would mean changing what the RPCs write, which is
                  a schema-level decision and not this surface's to take.
                */}
                <time dateTime={entry.occurredAt}>{dateTime(entry.occurredAt)}</time>
              </li>
            ))}
          </ol>
        ) : (
          <p className="quiet-state">{copy.history.empty}</p>
        )}
      </section>
    </div>
  );
}
