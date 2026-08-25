import { captureEntry } from "@/features/capture/actions";
import { Composer } from "@/features/capture/composer";
import { transcribeRecording } from "@/features/capture/transcribe-action";
import { uploadAttachment } from "@/features/agent/actions";
import { loadAttentionProjection } from "@/features/daily-cycle/attention-projection";
import { loadMemoryConflicts } from "@/features/daily-cycle/conflict-projection";
import { EMPTY_HOME_AGENDA, loadHomeAgendaProjection } from "@/features/daily-cycle/home-agenda";
import { loadHomeSupplementalProjection } from "@/features/daily-cycle/home-projection";
import { loadInboxProjection } from "@/features/daily-cycle/inbox-projection";
import { EMPTY_ATTENTION_NOTICES, loadAttentionNotices } from "@/features/notifications/attention-notices";
import { NOTIFICATION_VERB_HANDLERS } from "@/features/notifications/verb-handlers";
import type { WorkItemHumanState } from "@/features/daily-cycle/contracts";
import { loadWorkProjection } from "@/features/daily-cycle/work-projection";
import { selectTodayPriorities } from "@/features/daily-cycle/today-priorities";
import { dismissOnboarding } from "@/features/onboarding/actions";
import { OnboardingPanel } from "@/features/onboarding/onboarding-panel";
import { loadOnboardingPath } from "@/features/onboarding/onboarding-view";
import { NeedsAttentionViewed } from "@/features/product-analytics/interaction-events";
import { requireUser } from "@/lib/auth/require-user";
import type { Locale } from "@/lib/preferences";
import { deriveHomeOperationalStatus } from "./capabilities";
import { HomeView, type HomePriorityView, type HomeTaskView, type HomeViewModel } from "./home-view";
import { getAgentName } from "@/features/profile/agent-identity";

const ORGANIZING_HOME_LIMIT = 4;
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
  const now = new Date();
  const [workSettled, supplementalSettled, inboxSettled, attentionSettled, conflictSettled, agendaSettled, onboardingSettled, noticesSettled] = await Promise.allSettled([
    loadWorkProjection(supabase, { userId: user.id, locale, view: "today", page: 1 }),
    loadHomeSupplementalProjection(supabase, user.id),
    loadInboxProjection(supabase, { locale, page: 1 }),
    loadAttentionProjection(supabase, { locale, limit: NEEDS_ATTENTION_HOME_LIMIT }),
    // `2N-CONFLICT-003`. Its own settled slot, on the section-isolation rule
    // above: a failed conflict derivation degrades to "no conflicts found" and
    // logs, rather than taking Hoje down.
    loadMemoryConflicts(supabase, { locale, userId: user.id }),
    /*
      "Adiante". Its own settled slot for the same reason as every other
      section: the calendar projection throws on an unsupported profile zone
      (`2M-TIME-003`), and a cockpit that refuses to render because the agenda
      panel could not resolve a timezone would take the capture box down with it.
    */
    loadHomeAgendaProjection(supabase, { userId: user.id, locale, now }),
    /*
      `2O-ONBOARD-001`. Its own settled slot on the same rule: the guided path
      is an *offer*, and an offer that could take the cockpit down with it would
      be the imposition the requirement forbids. Every read inside already
      degrades to `unreadable`, so this slot catches only what none of them can.
    */
    loadOnboardingPath(supabase, user.id),
    /*
      The unanswered notices (`2S-SILENCE-008`). Its own settled slot on the
      same section-isolation rule as every other projection above: a notice
      query that fails must leave the cockpit standing with one fewer kind of
      row, not take the capture box down with it.
    */
    loadAttentionNotices(supabase, { userId: user.id, locale, limit: NEEDS_ATTENTION_HOME_LIMIT }),
  ]);

  function settled<T>(result: PromiseSettledResult<T>, fallback: T, section: string): T {
    if (result.status === "fulfilled") return result.value;
    console.error(`[home] ${section} projection failed; the section renders empty`, result.reason);
    return fallback;
  }

  /*
    `null` rather than an empty path: an empty `OnboardingPath` would have to
    claim five states it never read, and the panel would render "pending" over
    an account that has done everything. Nothing rendered is the only honest
    fallback for an offer whose whole content is a set of facts.
  */
  const onboarding = settled(onboardingSettled, null as Awaited<ReturnType<typeof loadOnboardingPath>> | null, "onboarding");
  const workProjection = settled(
    workSettled,
    { items: [], hasNext: false, timezone: "UTC", editControlsByTaskId: {}, statusByTaskId: {} } as Awaited<ReturnType<typeof loadWorkProjection>>,
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
  const conflicts = settled(
    conflictSettled,
    { items: [], bounded: false, limit: 0 } as Awaited<ReturnType<typeof loadMemoryConflicts>>,
    "conflicts",
  );
  const agenda = settled(agendaSettled, EMPTY_HOME_AGENDA, "agenda");
  const notices = settled(noticesSettled, EMPTY_ATTENTION_NOTICES, "notices");

  const operationalStatus = deriveHomeOperationalStatus({
    items: inboxProjection.items,
    attentionCount: attentionProjection.items.length,
    attentionHasNext: attentionProjection.hasNext,
    conflictCount: conflicts.items.length,
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
    now,
    timeZone: workProjection.timezone,
  }).map((priority) => ({
    taskId: priority.item.taskId,
    title: priority.item.title,
    reason: priority.reason,
    dueLabel: priority.item.dueAt ? dueFormatter.format(new Date(priority.item.dueAt)) : null,
    // `2L-PRIVACY-007`. Carried from the same projection the Work list reads,
    // so Hoje and Work cannot answer differently about the same task.
    sensitivity: priority.item.sensitivity,
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
      sensitivity: task.sensitivity,
    }));

  /*
    The two readings the side column and the quiet state need, both taken from
    the inbox page that was already loaded — no second query, and no second
    definition of "organizing" or "organized".

    `localDayBounds` in `workProjection.timezone` is the same day boundary the
    header, the priority selection and the due labels above use. A count of "what
    was organized today" computed from the server's clock would name a different
    day than the greeting sitting three lines above it (`LDC-HOME-001`).
  */
  const organizing = inboxProjection.items
    .filter((item) => item.productState === "organizing")
    .slice(0, ORGANIZING_HOME_LIMIT);

  /*
    The day's account is NOT computed here, and the reason is that the field it
    would need does not mean what it looks like it means.

    `04-estados.md` asks the quiet state to say how many records were organized
    today. The only per-entry timestamp this projection carries is
    `significantAt`, which is `entries.occurred_at` — and the worker
    **overwrites** that with the model's extracted event date
    (`202607170026_phase_2x_entry_interpretation_worker.sql:247`). So a Tuesday
    capture reading "reunião na sexta" carries Friday, and counting it would
    produce two false sentences: Tuesday under-reports, and Friday claims a
    record was organized on a day nothing happened.

    An independent review caught this. Two further errors sat on the same line:
    the count came from page one of the inbox, so it silently capped at fifty,
    and it used `workProjection.timezone` — which is `"UTC"` when that
    projection fell back, naming the wrong day for exactly the evening hours
    `LDC-HOME-001` exists to protect.

    Reporting nothing is the honest option until an ingestion timestamp is
    available to count. The quiet state keeps its reassurance and its link.
  */
  const organizedToday = 0;

  const view: HomeViewModel = {
    timeZone: workProjection.timezone,
    /*
      `LDC-HOME-001`. The header's day is MEANING, not formatting, and it comes
      from the same `workProjection.timezone` as `dueFormatter` and
      `selectTodayPriorities` fifteen lines above. Until this initiative it was
      `new Date()` with no zone: between 21:00 and midnight in America/Sao_Paulo
      the header and the list beneath it named two different days, every day.
    */
    todayLabel: new Intl.DateTimeFormat(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: workProjection.timezone,
    })
      .format(now)
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
    notices: notices.items,
    noticesHaveMore: notices.hasMore,
    conflicts,
    today,
    todayHasMore:
      workProjection.items.length - promoted.size > TODAY_HOME_LIMIT || workProjection.hasNext,
    waitingCount: supplemental.waitingCount,
    openQuestion: supplemental.openQuestionPreview,
    organizing,
    organizedTodayCount: organizedToday,
    agenda: agenda.items,
    agendaHasMore: agenda.hasMore,
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
        noticeHandlers={NOTIFICATION_VERB_HANDLERS}
        view={view}
        capture={
          /*
            `2P-CAPTURE-001`. The SAME component the capture page mounts, with
            the same three actions. Today used to mount text alone, so a file or
            a thought spoken aloud meant leaving the cockpit first.
          */
          <Composer
            action={captureEntry}
            attachmentAction={uploadAttachment}
            transcribeAction={transcribeRecording}
            agentName={agentName}
            locale={locale}
            captureSource="home"
          />
        }
        onboarding={
          onboarding ? (
            <OnboardingPanel locale={locale} path={onboarding} dismissAction={dismissOnboarding} />
          ) : null
        }
      />
    </>
  );
}
