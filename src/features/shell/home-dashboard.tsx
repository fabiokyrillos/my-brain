import { captureEntry } from "@/features/capture/actions";
import { QuickCaptureForm } from "@/features/capture/quick-capture-form";
import { loadAttentionProjection } from "@/features/daily-cycle/attention-projection";
import { loadHomeSupplementalProjection } from "@/features/daily-cycle/home-projection";
import { loadInboxProjection } from "@/features/daily-cycle/inbox-projection";
import type { WorkItemHumanState } from "@/features/daily-cycle/contracts";
import { loadWorkProjection } from "@/features/daily-cycle/work-projection";
import { selectTodayPriorities } from "@/features/daily-cycle/today-priorities";
import { NeedsAttentionViewed } from "@/features/product-analytics/interaction-events";
import { requireUser } from "@/lib/auth/require-user";
import type { Locale } from "@/lib/preferences";
import { deriveHomeOperationalStatus } from "./capabilities";
import { HomeView, type HomePriorityView, type HomeTaskView, type HomeViewModel } from "./home-view";
import { getAgentName } from "@/features/profile/agent-identity";

const RECENT_ACTIVITY_LIMIT = 4;
const NEEDS_ATTENTION_HOME_LIMIT = 3;
const TODAY_HOME_LIMIT = 5;

const humanStateLabels = {
  "pt-BR": {
    not_started: "Não iniciada",
    in_progress: "Em andamento",
    waiting_on_someone: "Aguardando alguém",
    blocked: "Bloqueada",
    deferred: "Adiada",
    completed: "Concluída",
    cancelled: "Cancelada",
  },
  en: {
    not_started: "Not started",
    in_progress: "In progress",
    waiting_on_someone: "Waiting on someone",
    blocked: "Blocked",
    deferred: "Deferred",
    completed: "Completed",
    cancelled: "Cancelled",
  },
} as const satisfies Record<Locale, Record<WorkItemHumanState, string>>;

/**
 * Home's data access. Presentation lives in `home-view.tsx`.
 *
 * The split is what makes the layout testable: this half needs a Supabase client
 * and the other half does not, so the visual behaviour that UX-02 was about can
 * be asserted directly instead of only through a database-backed journey.
 */
export async function HomeDashboard({ locale }: { locale: Locale }) {
  const { supabase, user } = await requireUser(locale);
  const agentName = await getAgentName();
  /*
    `2J-HOJE-010`. `Promise.allSettled`, not `Promise.all`.

    Hoje composes four independent projections. Under `Promise.all` a single
    failing one -- a timeout on the waiting count, a schema-cache miss on the
    attention RPC -- threw, the route's error boundary caught it, and the user
    lost the whole day's surface including the capture box. That is the worst
    possible trade: the section least likely to fail is the one they came for.

    Each projection now degrades to its own empty shape, which every section
    already renders as a quiet state (`2J-HOJE-009`). A user with a broken
    attention query sees Hoje with an empty attention section, not a stack trace.

    Deliberately NOT silent about which: a failed projection logs, because a
    section that is empty for a week because something is broken should be
    findable. It just does not take the page down to say so.
  */
  const [workSettled, supplementalSettled, inboxSettled, attentionSettled] = await Promise.allSettled([
    loadWorkProjection(supabase, { userId: user.id, locale, view: "today", page: 1 }),
    loadHomeSupplementalProjection(supabase, user.id),
    loadInboxProjection(supabase, { locale, page: 1 }),
    loadAttentionProjection(supabase, { locale, limit: NEEDS_ATTENTION_HOME_LIMIT }),
  ]);

  function settled<T>(result: PromiseSettledResult<T>, fallback: T, section: string): T {
    if (result.status === "fulfilled") return result.value;
    console.error(`[home] ${section} projection failed; the section renders empty`, result.reason);
    return fallback;
  }

  const workProjection = settled(
    workSettled,
    { items: [], hasNext: false, timezone: "UTC" } as Awaited<ReturnType<typeof loadWorkProjection>>,
    "work",
  );
  const supplemental = settled(
    supplementalSettled,
    { waitingCount: 0, openQuestionPreview: null },
    "supplemental",
  );
  const inboxProjection = settled(
    inboxSettled,
    { items: [], hasNext: false } as Awaited<ReturnType<typeof loadInboxProjection>>,
    "inbox",
  );
  const attentionProjection = settled(
    attentionSettled,
    { items: [], hasNext: false, nextCursor: null },
    "attention",
  );

  const operationalStatus = deriveHomeOperationalStatus({
    items: inboxProjection.items,
    attentionCount: attentionProjection.items.length,
    attentionHasNext: attentionProjection.hasNext,
  });

  /*
    `2J-HOJE-004`. Computed from the SAME `today` projection the list below
    renders, and in the projection's own timezone -- not the server's. Two
    sources would eventually disagree about what "today" means, which is the
    defect that made `/app/today` and `/app` two different answers in the first
    place.
  */
  const dueFormatter = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    timeZone: workProjection.timezone,
  });
  const priorities: HomePriorityView[] = selectTodayPriorities(workProjection.items, {
    now: new Date(),
    timeZone: workProjection.timezone,
  }).map((priority) => ({
    taskId: priority.item.taskId,
    title: priority.item.title,
    reason: priority.reason,
    dueLabel: priority.item.dueAt ? dueFormatter.format(new Date(priority.item.dueAt)) : null,
  }));

  /*
    `2J-HOJE-004`. The list below excludes whatever the priority section already
    shows. Rendering a task twice on one screen is the "repetition without
    value" this file removed from Home once already (UX-02) -- and it is worse
    here, because the second copy carries less information than the first.
  */
  const promoted = new Set(priorities.map((priority) => priority.taskId));
  const today: HomeTaskView[] = workProjection.items
    .filter((task) => !promoted.has(task.taskId))
    .slice(0, TODAY_HOME_LIMIT)
    .map((task) => ({
      taskId: task.taskId,
      title: task.title,
      dueLabel: task.dueAt ? dueFormatter.format(new Date(task.dueAt)) : null,
      stateLabel: humanStateLabels[locale][task.humanState],
    }));

  const view: HomeViewModel = {
    todayLabel: new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" })
      .format(new Date())
      .toUpperCase(),
    status:
      operationalStatus.kind === "attention"
        ? { kind: "attention", count: operationalStatus.count, hasMore: operationalStatus.hasMore }
        : operationalStatus.kind === "organizing"
          ? { kind: "organizing", count: operationalStatus.count }
          : { kind: "saved" },
    priorities,
    attention: attentionProjection.items,
    attentionHasMore: attentionProjection.hasNext,
    today,
    todayHasMore:
      workProjection.items.length - promoted.size > TODAY_HOME_LIMIT || workProjection.hasNext,
    waitingCount: supplemental.waitingCount,
    openQuestion: supplemental.openQuestionPreview,
    recent: inboxProjection.items.slice(0, RECENT_ACTIVITY_LIMIT),
  };

  return (
    <>
      <NeedsAttentionViewed
        surface="home"
        itemCount={attentionProjection.items.length}
        locale={locale}
      />
      <HomeView
        agentName={agentName}
        locale={locale}
        view={view}
        capture={<QuickCaptureForm action={captureEntry} agentName={agentName} locale={locale} captureSource="home" />}
      />
    </>
  );
}
