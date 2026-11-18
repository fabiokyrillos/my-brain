import type { ReactNode } from "react";

import { UniversalStateLine } from "@/features/experience/universal-state";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getWorkCopy } from "@/features/operations/copy";
import { ProtectedContent } from "@/features/operations/protected-content";
import { isDerivedLevel } from "@/features/sensitivity/task-derivation";
import type { Locale } from "@/lib/preferences";
import type { WorkItemHumanState } from "./contracts";
import { describeHistoryEntry, getTaskDetailCopy } from "./task-detail-copy";
import { taskFactsFor } from "./task-facts";
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
   * The list of facts **with its editing in place** — `TaskDetailControls` in
   * its `fields` frame — injected for the same reason.
   *
   * When it is given, it *is* the "Detalhes" section: it was handed the rows
   * `taskFactsFor` builds, so this component prints no list of its own and a
   * value is never on the page twice. When it is absent (a task that admits no
   * edit, or a caller that mounts none) the same rows are printed here as a
   * plain `<dl>`. Both readings come from one function, so they cannot drift.
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
  /*
    What "Origem" and "Criada em" used to say as two fields of the weight of the
    due date. They are bookkeeping about where the task came from, so they are
    one quiet line in the section that is about exactly that. "Última alteração"
    is gone as a field: the history's first entry is that fact, with its author.
  */
  const originLine = `${task.origin === "brain" ? copy.origins.brain : copy.origins.you} · ${copy.provenance.createdPrefix} ${dateTime(detail.createdAt)}`;

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
        {/*
          `04-estados.md`: *cor + palavra + forma*. The word was already here and
          the colour was not — every state rendered on the same neutral wash, so
          "Bloqueada" and "Concluída" were the same object with different text.
          `data-state` carries it, mapped to the tone tokens in `operations.css`;
          the word stays the primary signal, so nothing depends on the colour.
        */}
        <span className="status-badge" data-state={task.humanState}>
          {humanStateCopy[task.humanState][pt ? "pt" : "en"]}
        </span>
      </header>

      {/*
        The two columns of a detail surface — `03-componentes.md`, and the same
        split the record detail took in this redesign: **what you can do** on the
        left, **what it is and where it came from** on the right.

        Placed by grid rather than reordered by `order`, so the focus order is
        the DOM order in both layouts. On the panel and on a narrow viewport the
        wrappers stack and the reading order is unchanged, which is why the split
        can be pure CSS and costs the panel nothing.

        The facts stay in the *left* column, and since the page was recomposed
        (ADR-184) each one carries the control that changes it on its own row.
        Sending them right would have put a due date in one column and the field
        that sets it in the other.
      */}
      <div className="task-detail-body">
        <div className="task-detail-primary">
        {actions}

        {controls ?? (
          <section className="task-detail-section" aria-label={copy.sections.details}>
            <h2>{copy.sections.details}</h2>
            <dl className="task-facts">
              {taskFactsFor(detail, locale, agentName).map((fact) => (
                <div className="task-fact" key={fact.id}>
                  <dt>{fact.label}</dt>
                  <dd>
                    <span className="task-fact-value" data-empty={fact.empty ? "true" : undefined}>
                      {fact.value}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}
        </div>

        <div className="task-detail-secondary">
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
              <p className="task-origin">{originLine}</p>
              <Link className="panel-view-all" href={`/${locale}/app/inbox/${detail.provenance.entryId}`}>
                {copy.provenance.openEntry}
              </Link>
            </>
          ) : (
            <>
              <p className="quiet-state">{copy.provenance.manual}</p>
              <p className="task-origin">{originLine}</p>
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

        {/*
          Collapsed at rest: it answers "what happened to this", which is asked
          after everything above it. Native `<details>`, so the keyboard
          operation and the expanded state cost no script — the same footnote the
          record page uses for its earlier decisions.
        */}
        <section className="task-detail-section task-history-section" aria-label={copy.sections.history}>
          <details className="record-footnote">
            <summary><h2>{copy.sections.history}</h2></summary>
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
              <UniversalStateLine description={copy.history.empty} locale={locale} state="empty" />
            )}
          </details>
        </section>
        </div>
      </div>
    </div>
  );
}
