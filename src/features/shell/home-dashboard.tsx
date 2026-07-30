import { captureEntry } from "@/features/capture/actions";
import { QuickCaptureForm } from "@/features/capture/quick-capture-form";
import { loadAttentionProjection } from "@/features/daily-cycle/attention-projection";
import { loadHomeSupplementalProjection } from "@/features/daily-cycle/home-projection";
import { loadInboxProjection } from "@/features/daily-cycle/inbox-projection";
import type { WorkItemHumanState } from "@/features/daily-cycle/contracts";
import { loadWorkProjection } from "@/features/daily-cycle/work-projection";
import { NeedsAttentionViewed } from "@/features/product-analytics/interaction-events";
import { requireUser } from "@/lib/auth/require-user";
import type { Locale } from "@/lib/preferences";
import { deriveHomeOperationalStatus } from "./capabilities";
import { HomeView, type HomeTaskView, type HomeViewModel } from "./home-view";
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
  const [workProjection, supplemental, inboxProjection, attentionProjection] = await Promise.all([
    loadWorkProjection(supabase, { userId: user.id, locale, view: "today", page: 1 }),
    loadHomeSupplementalProjection(supabase, user.id),
    loadInboxProjection(supabase, { locale, page: 1 }),
    loadAttentionProjection(supabase, { locale, limit: NEEDS_ATTENTION_HOME_LIMIT }),
  ]);

  const operationalStatus = deriveHomeOperationalStatus({
    items: inboxProjection.items,
    attentionCount: attentionProjection.items.length,
    attentionHasNext: attentionProjection.hasNext,
  });

  const today: HomeTaskView[] = workProjection.items.slice(0, TODAY_HOME_LIMIT).map((task) => ({
    taskId: task.taskId,
    title: task.title,
    dueLabel: task.dueAt
      ? new Intl.DateTimeFormat(locale, {
          day: "2-digit",
          month: "short",
          timeZone: workProjection.timezone,
        }).format(new Date(task.dueAt))
      : null,
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
    attention: attentionProjection.items,
    attentionHasMore: attentionProjection.hasNext,
    today,
    todayHasMore: workProjection.items.length > TODAY_HOME_LIMIT || workProjection.hasNext,
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
