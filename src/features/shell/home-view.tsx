import type { ReactNode } from "react";
import Link from "next/link";
import type { InboxItemView, NeedsAttentionItemView } from "@/features/daily-cycle/contracts";
import { InboxItemRow } from "@/features/daily-cycle/inbox-item";
import { NeedsAttentionItemRow } from "@/features/daily-cycle/needs-attention-item";
import type { PriorityReason } from "@/features/daily-cycle/today-priorities";
import { presentationFor } from "@/features/sensitivity/contracts";
import type { Locale } from "@/lib/preferences";
import { getHomeCopy, withCount } from "./home-copy";

/**
 * Home's presentation, with no data access of its own.
 *
 * Split out of `home-dashboard.tsx` so the layout can be rendered and asserted
 * without a Supabase client — the previous component loaded four projections and
 * built its markup in the same function, which is why none of its visual
 * behaviour had a test.
 */
export type HomeTaskView = {
  readonly taskId: string;
  readonly title: string;
  readonly dueLabel: string | null;
  readonly stateLabel: string;
};

export type HomePriorityView = {
  readonly taskId: string;
  readonly title: string;
  readonly reason: PriorityReason;
  readonly dueLabel: string | null;
};

export type HomeViewModel = {
  readonly todayLabel: string;
  readonly status:
    | { readonly kind: "attention"; readonly count: number; readonly hasMore: boolean }
    | { readonly kind: "organizing"; readonly count: number }
    | { readonly kind: "saved" };
  readonly attention: readonly NeedsAttentionItemView[];
  readonly attentionHasMore: boolean;
  /** `2J-HOJE-004`. Already capped and ordered by `selectTodayPriorities`. */
  readonly priorities: readonly HomePriorityView[];
  readonly today: readonly HomeTaskView[];
  readonly todayHasMore: boolean;
  readonly waitingCount: number;
  readonly openQuestion: string | null;
  readonly recent: readonly InboxItemView[];
};

function statusLine(view: HomeViewModel, copy: ReturnType<typeof getHomeCopy>): string {
  if (view.status.kind === "attention") {
    const count = `${view.status.count}${view.status.hasMore ? "+" : ""}`;
    return withCount(
      view.status.count === 1 ? copy.statusAttentionOne : copy.statusAttentionMany,
      count,
    );
  }
  if (view.status.kind === "organizing") {
    return withCount(
      view.status.count === 1 ? copy.statusOrganizingOne : copy.statusOrganizingMany,
      view.status.count,
    );
  }
  return copy.statusAllSaved;
}

/**
 * A section renders its heading and, when it has nothing, one quiet line.
 *
 * It does **not** reserve height for content it does not have. The previous grid
 * gave the priority panel `min-height: 392px` and its empty state a fixed 275px,
 * so an empty Home showed several hundred pixels of void beside the one panel
 * that did have content (UX-02).
 */
function Section({
  title,
  hint,
  count,
  action,
  children,
}: {
  title: string;
  hint?: string;
  count?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="home-section" aria-label={title}>
      <header>
        <div>
          <h2>{title}</h2>
          {hint ? <p>{hint}</p> : null}
        </div>
        {count ? <span className="count">{count}</span> : null}
      </header>
      {children}
      {action}
    </section>
  );
}

export function HomeView({
  locale,
  view,
  capture,
  agentName,
}: {
  locale: Locale;
  view: HomeViewModel;
  /** The capture form, injected so this component stays free of Server Actions. */
  capture: ReactNode;
  agentName: string;
}) {
  const copy = getHomeCopy(locale, agentName);
  const { sections } = copy;

  return (
    <div className="dashboard home-dashboard">
      <section className="hero">
        <p className="eyebrow">{view.todayLabel}</p>
        <h1>{copy.greeting}<br /><span>{copy.prompt}</span></h1>
        {/*
          The state of the day as one sentence under the greeting rather than as
          its own dark panel. The old "Estado agora" panel restated the count that
          the section below already carries, which is repetition without value.
        */}
        <p className="home-status" role="status">{statusLine(view, copy)}</p>
        {capture}
      </section>

      <div className="home-sections">
        <Section
          title={sections.attention.title}
          hint={sections.attention.hint}
          count={view.attention.length ? `${view.attention.length}${view.attentionHasMore ? "+" : ""}` : undefined}
          action={
            view.attention.length ? (
              <Link href={`/${locale}/app/inbox?view=needs-you`} className="panel-view-all">
                {copy.viewAll}
              </Link>
            ) : undefined
          }
        >
          {view.attention.length ? (
            <div className="home-list">
              {view.attention.map((item) =>
                /*
                  `2J-PRIVACY-001`/`004`/`005`. The row is rendered either way --
                  masking in place rather than dropping the item is what keeps
                  the count above honest. The mask withholds the entry preview,
                  which is raw user text, and nothing else.
                */
                presentationFor("hoje", item.sensitivity).outcome === "mask" ? (
                  <p className="home-masked" key={item.key} data-masked="true">
                    {copy.maskedLabel}
                  </p>
                ) : (
                  <NeedsAttentionItemRow agentName={agentName} item={item} key={item.key} locale={locale} surface="home" />
                ),
              )}
            </div>
          ) : (
            <p className="quiet-state">{sections.attention.empty}</p>
          )}
        </Section>

        {/*
          `2J-HOJE-004`/`005`/`006`. Rendered before the day's full list because
          it is the answer to "what do I do first"; the list below is the answer
          to "what else is there". The heading says "at most three" and the rule
          is printed, so the ordering is explainable without opening the code --
          and when nothing qualifies the section says so rather than padding
          itself from the list below it.
        */}
        <Section
          title={sections.priorities.title}
          hint={sections.priorities.hint}
        >
          {view.priorities.length ? (
            <>
              <ol className="home-priorities">
                {view.priorities.map((priority) => (
                  <li key={priority.taskId}>
                    <Link href={`/${locale}/app/work?view=today`} className="home-task">
                      <strong>{priority.title}</strong>
                      <span className="home-task-meta">
                        <span className="priority-reason" data-reason={priority.reason}>
                          {sections.priorities.reasons[priority.reason]}
                        </span>
                        {priority.dueLabel ? <span>{priority.dueLabel}</span> : null}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
              <p className="home-priority-rule">{sections.priorities.rule}</p>
            </>
          ) : (
            <p className="quiet-state">{sections.priorities.empty}</p>
          )}
        </Section>

        <Section
          title={sections.today.title}
          hint={sections.today.hint}
          count={view.today.length ? `${view.today.length}${view.todayHasMore ? "+" : ""}` : undefined}
          action={
            view.today.length ? (
              <Link href={`/${locale}/app/work?view=today`} className="panel-view-all">
                {copy.viewAllWork}
              </Link>
            ) : undefined
          }
        >
          {view.today.length ? (
            <div className="home-list">
              {view.today.map((task) => (
                <Link href={`/${locale}/app/work?view=today`} className="home-task" key={task.taskId}>
                  <strong>{task.title}</strong>
                  <span className="home-task-meta">
                    {task.dueLabel ? <span>{task.dueLabel}</span> : null}
                    <span className="status-badge">{task.stateLabel}</span>
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="quiet-state">{sections.today.empty}</p>
          )}
        </Section>

        {/*
          Waiting and the open question appear only when they have something to
          say. An empty panel that exists to hold a place is what made the page
          feel like a magazine rather than a working surface.
        */}
        {view.waitingCount > 0 ? (
          <Section title={sections.waiting.title}>
            <p className="quiet-state">
              {withCount(
                view.waitingCount === 1 ? sections.waiting.one : sections.waiting.many,
                view.waitingCount,
              )}
            </p>
          </Section>
        ) : null}

        {view.openQuestion ? (
          <Section
            title={sections.question.title}
            action={
              <Link href={`/${locale}/app/questions`} className="panel-view-all">
                {copy.answerQuestion}
              </Link>
            }
          >
            <p className="home-question">{view.openQuestion}</p>
          </Section>
        ) : null}

        {/*
          `2J-DAY-002`/`003`/`004`. The day's closing gesture, composed from the
          numbers already on this page -- no new query, and no new review
          system. It counts what is still open and offers the door to the
          review domain that has existed since before this phase.

          It changes NOTHING by itself (`2J-DAY-004`). There is no
          "close the day" mutation, no auto-carry and no auto-complete: ending a
          day is a reading, and anything that follows from it goes through the
          write path that already owns it, with its own confirmation.
        */}
        <Section title={sections.endOfDay.title} hint={sections.endOfDay.hint}>
          {view.attention.length + view.waitingCount + view.priorities.length > 0 ? (
            <ul className="home-endofday">
              {view.priorities.length ? (
                <li>
                  {sections.priorities.title}: {view.priorities.length} {sections.endOfDay.unresolved}
                </li>
              ) : null}
              {view.attention.length ? (
                <li>
                  {sections.attention.title}: {view.attention.length}
                  {view.attentionHasMore ? "+" : ""} {sections.endOfDay.unresolved}
                </li>
              ) : null}
              {view.waitingCount ? (
                <li>
                  {sections.waiting.title}: {view.waitingCount} {sections.endOfDay.unresolved}
                </li>
              ) : null}
            </ul>
          ) : (
            <p className="quiet-state">{sections.endOfDay.clear}</p>
          )}
          <Link href={`/${locale}/app/reviews`} className="panel-view-all">
            {sections.endOfDay.openReview}
          </Link>
        </Section>

        <Section
          title={sections.recent.title}
          action={
            view.recent.length ? (
              <Link href={`/${locale}/app/inbox`} className="panel-view-all">
                {copy.viewAllRecords}
              </Link>
            ) : undefined
          }
        >
          {view.recent.length ? (
            <div className="home-list">
              {view.recent.map((item) => (
                <InboxItemRow agentName={agentName} item={item} key={item.entryId} locale={locale} />
              ))}
            </div>
          ) : (
            <p className="quiet-state">{sections.recent.empty}</p>
          )}
        </Section>
      </div>
    </div>
  );
}
