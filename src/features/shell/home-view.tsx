import type { ReactNode } from "react";
import Link from "next/link";
import { BoundedNotice } from "@/features/bounds/bounded-notice";
import type { Bounded } from "@/features/bounds/contracts";
import type { ConflictAttentionItemView, InboxItemView, NeedsAttentionItemView } from "@/features/daily-cycle/contracts";
import { ConflictAttentionItemRow } from "@/features/daily-cycle/conflict-attention-item";
import type { HomeAgendaItem } from "@/features/daily-cycle/home-agenda";
import { InboxItemRow } from "@/features/daily-cycle/inbox-item";
import { NeedsAttentionItemRow } from "@/features/daily-cycle/needs-attention-item";
import { NeedsAttentionLeadCard } from "@/features/daily-cycle/needs-attention-lead";
import type { PriorityReason } from "@/features/daily-cycle/today-priorities";
import { ProtectedContent } from "@/features/operations/protected-content";
import { presentationFor } from "@/features/sensitivity/contracts";
import type { TaskSensitivity } from "@/features/sensitivity/task-derivation";
import { formatInstant } from "@/lib/time/instant-format";
import type { Locale } from "@/lib/preferences";
import { getHomeCopy, withCount } from "./home-copy";

/**
 * Hoje's presentation, with no data access of its own.
 *
 * Split out of `home-dashboard.tsx` so the layout can be rendered and asserted
 * without a Supabase client — the previous component loaded four projections and
 * built its markup in the same function, which is why none of its visual
 * behaviour had a test.
 *
 * ## The cockpit composition (Papel e Console, `02-arquitetura-e-rotas.md`)
 *
 * The redesign gives this page a **fixed reading order**: capture → precisa de
 * você → hoje/atrasado → adiante → fechar o dia. On a wide viewport the last
 * three move into a secondary column; the DOM order does not change, so focus
 * order stays equal to visual order in both layouts (`07-acessibilidade.md`).
 *
 * Two deliberate departures from the HTML mockups, on the handoff's own rule
 * that the documentation wins where the two disagree:
 *
 * 1. **Order inside the secondary column.** Mockup 03 draws *sendo organizado →
 *    adiante → fechar o dia*; `05-responsividade.md` states the single-column
 *    order as *… → agenda → organizando → fechar o dia*. The documented order is
 *    used for both layouts, because the alternative is a CSS `order` that makes
 *    focus order disagree with reading order on one of them.
 * 2. **No feed of recently captured records.** The mockup's Hoje has none, and
 *    `04-estados.md` puts the account of what was organized inside the *empty*
 *    state of the attention section, which is where it now lives. Registros is
 *    the feed, and it is slot 2 of the primary navigation.
 */
export type HomeTaskView = {
  readonly taskId: string;
  readonly title: string;
  readonly dueLabel: string | null;
  readonly stateLabel: string;
  readonly sensitivity: TaskSensitivity;
};

export type HomePriorityView = {
  readonly taskId: string;
  readonly title: string;
  readonly reason: PriorityReason;
  readonly dueLabel: string | null;
  readonly sensitivity: TaskSensitivity;
};

export type HomeViewModel = {
  readonly todayLabel: string;
  readonly status:
    | { readonly kind: "attention"; readonly count: number; readonly hasMore: boolean }
    | { readonly kind: "organizing"; readonly count: number }
    | { readonly kind: "saved" };
  readonly attention: readonly NeedsAttentionItemView[];
  readonly attentionHasMore: boolean;
  /**
   * `2N-CONFLICT-004`. Rendered in the same section as the rows above.
   *
   * Hoje's status line can say *"Nada pendente. Tudo salvo."* — so a conflict it
   * did not know about would turn the queue's silence into a claim. The count in
   * the section heading and the status line both include these, which is why
   * they are here rather than only on the full queue.
   */
  readonly conflicts: Bounded<ConflictAttentionItemView>;
  /** `2J-HOJE-004`. Already capped and ordered by `selectTodayPriorities`. */
  readonly priorities: readonly HomePriorityView[];
  readonly today: readonly HomeTaskView[];
  readonly todayHasMore: boolean;
  readonly waitingCount: number;
  readonly openQuestion: string | null;
  /** Entries the worker is still reading. Rendered only when non-empty. */
  readonly organizing: readonly InboxItemView[];
  /**
   * What was organized today with nothing left to decide.
   *
   * Shown **only** in the attention section's empty state (`04-estados.md`): it
   * is the sentence that turns "nothing needs you" from an absence into an
   * account of the day.
   */
  readonly organizedTodayCount: number;
  /** `02-arquitetura-e-rotas.md` — the day's remaining anchors. */
  readonly agenda: readonly HomeAgendaItem[];
  readonly agendaHasMore: boolean;
  /**
   * The owner's zone (`LDC-DAILY-001`), carried on the model rather than read by
   * the rows.
   *
   * It comes from the **same `workProjection`** that computed `priorities` and
   * `today`, which is the point: Home's header, its task list and its inbox rows
   * are three answers to "when", and the defect this initiative removed was them
   * being computed from two different sources.
   */
  readonly timeZone: string;
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

/**
 * One task in the day's list.
 *
 * `reason` is present for the promoted rows and absent for the rest, which is
 * the only difference between the two groups — `2J-HOJE-003` requires overdue
 * and due-today to be distinguishable by more than a word, and the chip is that
 * distinction. Both groups render through this one component so a row cannot
 * gain or lose an affordance by which list it landed in.
 */
function TaskRow({
  href,
  locale,
  revealKey,
  sensitivity,
  title,
  meta,
}: {
  href: string;
  locale: Locale;
  revealKey: string;
  sensitivity: TaskSensitivity;
  title: string;
  meta: ReactNode;
}) {
  return (
    <ProtectedContent href={href} locale={locale} revealKey={revealKey} sensitivity={sensitivity}>
      <Link href={href} className="home-task">
        <strong>{title}</strong>
        <span className="home-task-meta">{meta}</span>
      </Link>
    </ProtectedContent>
  );
}

export function HomeView({
  locale,
  view,
  capture,
  onboarding,
  agentName,
}: {
  locale: Locale;
  view: HomeViewModel;
  /** The capture form, injected so this component stays free of Server Actions. */
  capture: ReactNode;
  /**
   * The guided path (`2O-ONBOARD-001`), injected for the same reason and
   * rendered **below** the composer. Optional, and `null` on an account that
   * finished or dismissed it — this component never decides that, so the
   * decision lives in one place rather than two.
   */
  onboarding?: ReactNode;
  agentName: string;
}) {
  const copy = getHomeCopy(locale, agentName);
  const { sections } = copy;
  /**
   * `2N-CONFLICT-004`. One number for one section.
   *
   * The heading count, the "view all" link and the empty state all read this,
   * so a conflict can never be rendered under a heading that says zero, and the
   * quiet state can never appear above a row.
   */
  const pendingCount = view.attention.length + view.conflicts.items.length;
  const workHref = `/${locale}/app/work?view=today`;
  const dayCount = view.priorities.length + view.today.length;

  /*
    The lead item is expanded and the rest collapse to one line each — the
    mockup's rule, and the reason the section can hold a real decision instead of
    a row that only says one exists.

    A conflict is never the lead. `resolve_validity_conflict` has no entry and no
    interpretation to propose (see `ConflictAttentionItemView`), so expanding one
    would produce a proposal card with nothing in it.
  */
  const [leadAttention, ...restAttention] = view.attention;
  const leadIsMasked = leadAttention
    ? presentationFor("hoje", leadAttention.sensitivity).outcome === "mask"
    : false;

  return (
    <div className="dashboard home-dashboard today-page">
      <header className="hero today-hero">
        <p className="eyebrow">{view.todayLabel}</p>
        <h1>{copy.greeting}<br /><span>{copy.prompt}</span></h1>
        {/*
          The state of the day as one sentence under the greeting rather than as
          its own dark panel. The old "Estado agora" panel restated the count that
          the section below already carries, which is repetition without value.
        */}
        <p className="home-status" role="status">{statusLine(view, copy)}</p>
      </header>

      {/* Capture sits at the top of the content, not inside a hero card
          (`02-arquitetura-e-rotas.md`: *captura → precisa de você → …*). */}
      <div className="today-capture">{capture}</div>

      {/*
        `2O-ONBOARD-001` — offered, never imposed. It sits *after* capture, and
        the order is the requirement rather than a layout preference: an
        onboarding that came first would put a guide between a first-time owner
        and the one interaction this product is built around.
      */}
      {onboarding}

      <div className="today-columns">
        <div className="today-main">
          <Section
            title={sections.attention.title}
            hint={sections.attention.hint}
            count={pendingCount ? `${pendingCount}${view.attentionHasMore || view.conflicts.bounded ? "+" : ""}` : undefined}
            action={
              pendingCount ? (
                <Link href={`/${locale}/app/inbox?view=needs-you`} className="panel-view-all">
                  {copy.viewAll}
                </Link>
              ) : undefined
            }
          >
            {pendingCount ? (
              <div className="home-list">
                {/*
                  `2N-CONFLICT-004`. First, and in the same list as the entry rows:
                  a contradiction is the one item here that will not resolve itself.
                  Each row masks its own content, so no branch is needed around it.
                */}
                {view.conflicts.items.map((conflict) => (
                  <ConflictAttentionItemRow
                    agentName={agentName}
                    item={conflict}
                    key={conflict.key}
                    locale={locale}
                    surface="home"
                    timeZone={view.timeZone}
                  />
                ))}
                {leadAttention ? (
                  /*
                    `2J-PRIVACY-001`/`004`/`005`. The row is rendered either way --
                    masking in place rather than dropping the item is what keeps
                    the count above honest. A masked lead falls back to the
                    collapsed row: an expanded card whose every field is withheld
                    is a large empty box, not a decision.
                  */
                  leadIsMasked ? (
                    <p className="home-masked" data-masked="true">{copy.maskedLabel}</p>
                  ) : (
                    <NeedsAttentionLeadCard
                      agentName={agentName}
                      item={leadAttention}
                      locale={locale}
                      proposesLabel={sections.attention.proposes}
                      reversibleLabel={sections.attention.reversible}
                      surface="home"
                      timeZone={view.timeZone}
                    />
                  )
                ) : null}
                {restAttention.map((item) =>
                  presentationFor("hoje", item.sensitivity).outcome === "mask" ? (
                    <p className="home-masked" key={item.key} data-masked="true">
                      {copy.maskedLabel}
                    </p>
                  ) : (
                    <NeedsAttentionItemRow agentName={agentName} item={item} key={item.key} locale={locale} surface="home" timeZone={view.timeZone} />
                  ),
                )}
                <BoundedNotice list={view.conflicts} locale={locale} />
              </div>
            ) : (
              <div className="home-quiet">
                <p className="quiet-state">{sections.attention.empty}</p>
                {/*
                  `04-estados.md`, Hoje **V**. The day's account, so the quiet
                  state reports what happened rather than only what did not.
                  Rendered only when there is something to report — a zero would
                  turn reassurance into "nothing worked".
                */}
                {view.organizedTodayCount > 0 ? (
                  <>
                    <p className="quiet-state">
                      {withCount(
                        view.organizedTodayCount === 1
                          ? sections.attention.organizedOne
                          : sections.attention.organizedMany,
                        view.organizedTodayCount,
                      )}
                    </p>
                    {/* `?view=record-only`, not the bare route. The default view
                        is needs-you — the queue of things that were *not*
                        organized — so a bare link here landed on the opposite of
                        what the label promises. */}
                    <Link href={`/${locale}/app/inbox?view=record-only`} className="panel-view-all">
                      {sections.attention.viewOrganized}
                    </Link>
                  </>
                ) : null}
              </div>
            )}
          </Section>

          {/*
            `2J-HOJE-004`/`005`/`006`. One list, two groups.

            The mockup draws a single "hoje e atrasado" list; the signed
            requirement is that at most three tasks are *promoted*, that the
            ordering is explainable, and that the rule is printed. Both survive:
            the promoted rows keep their reason chip and their own group heading,
            and the rule is printed once beneath the list. What went away is the
            second section header, not the behaviour.
          */}
          <Section
            title={sections.day.title}
            hint={sections.today.hint}
            count={dayCount ? `${dayCount}${view.todayHasMore ? "+" : ""}` : undefined}
            action={
              dayCount ? (
                <Link href={workHref} className="panel-view-all">{copy.viewAllWork}</Link>
              ) : undefined
            }
          >
            {dayCount ? (
              <>
                <div className="home-group">
                  {/* `2J-HOJE-005`. The heading and the cap it does not promise,
                      both kept when the two sections became two groups. */}
                  <h3 className="home-group-title">{sections.priorities.title}</h3>
                  <p className="home-group-hint">{sections.priorities.hint}</p>
                  {view.priorities.length ? (
                    <ol className="home-priorities">
                      {view.priorities.map((priority) => (
                        <li key={priority.taskId}>
                          {/*
                            The whole row is withheld, not only the title. The reason
                            chip says *why this task is urgent* and the due label says
                            *when* — both are facts about a task the owner asked to be
                            protected, and a masked title beside "overdue today" is a
                            mask that leaks the interesting half. The row stays, so the
                            count and the ordering keep telling the truth, and one
                            click restores all of it in place.
                          */}
                          <TaskRow
                            href={workHref}
                            locale={locale}
                            revealKey={`priority:${priority.taskId}`}
                            sensitivity={priority.sensitivity}
                            title={priority.title}
                            meta={
                              <>
                                <span className="priority-reason" data-reason={priority.reason}>
                                  {sections.priorities.reasons[priority.reason]}
                                </span>
                                {priority.dueLabel ? <span>{priority.dueLabel}</span> : null}
                              </>
                            }
                          />
                        </li>
                      ))}
                    </ol>
                  ) : (
                    /*
                      `2J-HOJE-006`. Said, not skipped. Merging the two sections
                      into one list must not lose the sentence that stops the
                      day's list from being read as "these are your priorities" —
                      the promotion rule ran and nothing qualified.
                    */
                    <p className="quiet-state">{sections.priorities.empty}</p>
                  )}
                  {view.priorities.length ? (
                    <p className="home-priority-rule">{sections.priorities.rule}</p>
                  ) : null}
                </div>

                {view.today.length ? (
                  <div className="home-group">
                    <h3 className="home-group-title">{sections.today.title}</h3>
                    <div className="home-list">
                      {view.today.map((task) => (
                        <TaskRow
                          href={workHref}
                          key={task.taskId}
                          locale={locale}
                          revealKey={`today:${task.taskId}`}
                          sensitivity={task.sensitivity}
                          title={task.title}
                          meta={
                            <>
                              {task.dueLabel ? <span>{task.dueLabel}</span> : null}
                              <span className="status-badge">{task.stateLabel}</span>
                            </>
                          }
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
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
        </div>

        <aside className="today-side" aria-label={copy.sideColumnLabel}>
          {/* Never rendered empty — `02-arquitetura-e-rotas.md`: *painéis vazios
              não renderizam*. */}
          {view.agenda.length ? (
            <Section
              title={sections.agenda.title}
              hint={sections.agenda.hint}
              /*
                `HomeAgendaProjection.hasMore` documents itself as *"true when the
                window held more than the panel shows, so the link can say so"* —
                and until the independent review caught it, nothing read the flag.
                A panel showing five of nineteen commitments looked exactly like a
                panel showing all five, and the calendar link read as an
                alternative rather than as the rest.

                The `+` is the same suffix the end-of-day summary already uses for
                a bounded count, so the two agree about what a truncated number
                looks like on this page.
              */
              count={`${view.agenda.length}${view.agendaHasMore ? "+" : ""}`}
              action={
                <Link href={`/${locale}/app/calendar`} className="panel-view-all">
                  {sections.agenda.viewAll}
                </Link>
              }
            >
              <ol className="home-agenda">
                {view.agenda.map((item) => (
                  <AgendaRow item={item} key={item.key} locale={locale} timeZone={view.timeZone} />
                ))}
              </ol>
            </Section>
          ) : null}

          {view.organizing.length ? (
            <Section
              title={sections.organizing.title}
              hint={sections.organizing.hint}
              count={`${view.organizing.length}`}
              action={
                <Link href={`/${locale}/app/inbox?view=organizing`} className="panel-view-all">
                  {copy.viewAllRecords}
                </Link>
              }
            >
              <div className="home-list">
                {view.organizing.map((item) => (
                  <InboxItemRow agentName={agentName} item={item} key={item.entryId} locale={locale} timeZone={view.timeZone} />
                ))}
              </div>
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
            {pendingCount + view.waitingCount + view.priorities.length > 0 ? (
              <ul className="home-endofday">
                {view.priorities.length ? (
                  <li>
                    {sections.priorities.title}: {view.priorities.length} {sections.endOfDay.unresolved}
                  </li>
                ) : null}
                {/*
                  `2N-CONFLICT-004`. The same count as the section above, for the
                  same reason: a day that closed reporting nothing unresolved while
                  a contradiction sat in the queue would be the silence this
                  requirement exists to end.
                */}
                {pendingCount ? (
                  <li>
                    {sections.attention.title}: {pendingCount}
                    {view.attentionHasMore || view.conflicts.bounded ? "+" : ""} {sections.endOfDay.unresolved}
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
        </aside>
      </div>
    </div>
  );
}

/**
 * One anchor in "Adiante".
 *
 * The lane is rendered as a word, never as a tint alone (`04-estados.md`: *cor +
 * palavra + forma*), and an unconfirmed extracted date is not in this panel at
 * all — `loadHomeAgendaProjection` does not request the `suggestion` lane,
 * because a guess does not belong in a list of what is committed.
 */
function AgendaRow({
  item,
  locale,
  timeZone,
}: {
  item: HomeAgendaItem;
  locale: Locale;
  timeZone: string;
}) {
  const stamp = formatInstant(item.at, item.isToday ? "time" : "dayAndTime", locale, timeZone) ?? "";
  const body = (
    <>
      <span className="home-agenda-time">{stamp}</span>
      <span className="home-agenda-title">{item.title}</span>
    </>
  );

  return (
    <li className="home-agenda-item" data-lane={item.lane}>
      {/* `2M-PRIVACY-001`. The panel receives the classification and withholds;
          it never asks a second question at render time. `surface="calendar"`
          because these rows *are* calendar items — asking as `work` would resolve
          them through a different derivation than `/app/calendar` uses, and the
          two surfaces would then disagree about the same item. */}
      <ProtectedContent
        href={item.href ?? `/${locale}/app/calendar`}
        locale={locale}
        revealKey={`agenda:${item.key}`}
        sensitivity={item.sensitivity}
        surface="calendar"
      >
        {item.href ? (
          <Link className="home-agenda-link" href={item.href}>{body}</Link>
        ) : (
          /* UX-20: what looks actionable must be actionable. An item with no
             route renders as text rather than as a link to nowhere. */
          <span className="home-agenda-link">{body}</span>
        )}
      </ProtectedContent>
    </li>
  );
}
