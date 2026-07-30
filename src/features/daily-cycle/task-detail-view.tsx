import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Locale } from "@/lib/preferences";
import type { RelationSummary, WorkItemHumanState, WorkItemPriority } from "./contracts";
import { describeHistoryEntry, getTaskDetailCopy } from "./task-detail-copy";
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
  detail,
  actions,
}: {
  locale: Locale;
  detail: TaskDetailProjection;
  /** The status controls, injected so this component holds no Server Action. */
  actions: ReactNode;
}) {
  const copy = getTaskDetailCopy(locale);
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
    <div className="content-page task-detail-page">
      <Link className="back-link" href={`/${locale}/app/work`}>
        <ArrowLeft size={16} aria-hidden="true" />{copy.back}
      </Link>

      <header className="task-detail-header">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>{task.title}</h1>
          <p className="task-description">{task.description ?? copy.noDescription}</p>
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
          {task.plannedAt ? <Field label={copy.fields.planned}>{dateTime(task.plannedAt)}</Field> : null}
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
            <blockquote className="task-provenance">{detail.provenance.preview}</blockquote>
            <Link className="panel-view-all" href={`/${locale}/app/inbox/${detail.provenance.entryId}`}>
              {copy.provenance.openEntry}
            </Link>
          </>
        ) : (
          <p className="quiet-state">{copy.provenance.manual}</p>
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
