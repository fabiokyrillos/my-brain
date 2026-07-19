import { Clock3, MessageSquareText } from "lucide-react";
import Link from "next/link";
import { captureEntry } from "@/features/capture/actions";
import { QuickCaptureForm } from "@/features/capture/quick-capture-form";
import { loadAttentionProjection } from "@/features/daily-cycle/attention-projection";
import { loadHomeSupplementalProjection } from "@/features/daily-cycle/home-projection";
import { InboxItemRow } from "@/features/daily-cycle/inbox-item";
import { loadInboxProjection } from "@/features/daily-cycle/inbox-projection";
import { NeedsAttentionItemRow } from "@/features/daily-cycle/needs-attention-item";
import { loadWorkProjection } from "@/features/daily-cycle/work-projection";
import { NeedsAttentionViewed } from "@/features/product-analytics/interaction-events";
import { getMessages } from "@/i18n/messages";
import { requireUser } from "@/lib/auth/require-user";
import type { Locale } from "@/lib/preferences";
import { deriveHomeOperationalStatus } from "./capabilities";

const RECENT_ACTIVITY_LIMIT = 4;
const NEEDS_ATTENTION_HOME_LIMIT = 3;
const PRIORITY_HOME_LIMIT = 5;

export async function HomeDashboard({ locale }: { locale: Locale }) {
  const t = getMessages(locale).home;
  const pt = locale === "pt-BR";
  const { supabase, user } = await requireUser(locale);
  const [workProjection, supplemental, inboxProjection, attentionProjection] = await Promise.all([
    loadWorkProjection(supabase, { userId: user.id, locale, view: "today", page: 1 }),
    loadHomeSupplementalProjection(supabase, user.id),
    loadInboxProjection(supabase, { locale, page: 1 }),
    loadAttentionProjection(supabase, { locale, limit: NEEDS_ATTENTION_HOME_LIMIT }),
  ]);
  const priorityTasks = workProjection.items.slice(0, PRIORITY_HOME_LIMIT);
  const today = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(new Date()).toUpperCase();
  const recentItems = inboxProjection.items.slice(0, RECENT_ACTIVITY_LIMIT);
  const attentionCount = `${attentionProjection.items.length}${attentionProjection.hasNext ? "+" : ""}`;
  const operationalStatus = deriveHomeOperationalStatus({
    items: inboxProjection.items,
    attentionCount: attentionProjection.items.length,
    attentionHasNext: attentionProjection.hasNext,
  });
  const operationalStatusCount = `${operationalStatus.count}${operationalStatus.hasMore ? "+" : ""}`;
  const operationalStatusCopy = operationalStatus.kind === "attention"
    ? {
        label: (operationalStatus.count === 1 ? t.attentionOne : t.attentionMany).replace("{count}", operationalStatusCount),
        hint: t.attentionStatusHint,
      }
    : operationalStatus.kind === "organizing"
      ? {
          label: (operationalStatus.count === 1 ? t.organizingOne : t.organizingMany).replace("{count}", operationalStatusCount),
          hint: t.organizingHint,
        }
      : { label: t.allSaved, hint: t.allSavedHint };

  return <div className="dashboard">
    <section className="hero"><p className="eyebrow">{today}</p><h1>{t.greeting}<br /><span>{t.prompt}</span></h1><QuickCaptureForm action={captureEntry} locale={locale} captureSource="home" /></section>
    <section className="dashboard-grid">
      <article className="panel priority-panel"><header><div><span className="panel-kicker">01 / AGORA</span><h2>{t.priority}</h2></div><span className="count">{priorityTasks.length}</span></header>{priorityTasks.length ? <div className="dashboard-task-list">{priorityTasks.map((task) => <Link href={`/${locale}/app/work?view=today`} className="dashboard-task" key={task.taskId}><strong>{task.title}</strong>{task.dueAt && <span>{new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" }).format(new Date(task.dueAt))}</span>}</Link>)}</div> : <div className="empty-state"><div className="thread-line" /><div><strong>{t.empty}</strong><p>{t.emptyHint}</p></div></div>}</article>
      <article className="panel attention-panel"><NeedsAttentionViewed surface="home" itemCount={attentionProjection.items.length} locale={locale} /><header><div><span className="panel-kicker">02 / PRECISA DE VOCÊ</span><h2>{t.needsAttention}</h2></div><span className="count attention-count">{attentionCount}</span></header>{attentionProjection.items.length ? <div className="dashboard-recent-list">{attentionProjection.items.map((item) => <NeedsAttentionItemRow item={item} key={item.key} locale={locale} surface="home" />)}</div> : <p className="quiet-state">{t.needsAttentionEmpty}</p>}<Link href={`/${locale}/app/inbox?view=needs-you`} className="panel-view-all">{t.viewAll}</Link></article>
      <article className="panel"><header><div><span className="panel-kicker">03 / CONTEXTO</span><h2>{t.waiting}</h2></div><Clock3 size={19} /></header><p className="quiet-state">{supplemental.waitingCount ? (pt ? `${supplemental.waitingCount} ${supplemental.waitingCount === 1 ? "item depende" : "itens dependem"} de retorno.` : `${supplemental.waitingCount} waiting for a response.`) : (pt ? "Nada aguardando retorno." : "Nothing waiting for a response.")}</p></article>
      <article className="panel"><header><div><span className="panel-kicker">04 / CLAREZA</span><h2>{t.questions}</h2></div><MessageSquareText size={19} /></header><p className="quiet-state">{supplemental.openQuestionPreview ?? (pt ? "Nenhuma pergunta em aberto." : "No open questions.")}</p></article>
      <article className="panel review-panel"><header><div><span className="panel-kicker">05 / {pt ? "ESTADO" : "STATUS"}</span><h2>{t.operationalStatus}</h2></div></header><div className="review-time" role="status"><strong>{operationalStatusCopy.label}</strong><span>{operationalStatusCopy.hint}</span></div></article>
      <article className="panel recent-panel"><header><div><span className="panel-kicker">06 / RECENTE</span><h2>{t.recent}</h2></div></header>{recentItems.length ? <div className="dashboard-recent-list">{recentItems.map((item) => <InboxItemRow item={item} key={item.entryId} locale={locale} />)}</div> : <p className="quiet-state">{pt ? "Nada por aqui ainda. Capture algo para começar." : "Nothing here yet. Capture something to get started."}</p>}</article>
    </section>
  </div>;
}
