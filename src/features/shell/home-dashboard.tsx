import { Clock3, MessageSquareText } from "lucide-react";
import Link from "next/link";
import { captureEntry } from "@/features/capture/actions";
import { QuickCaptureForm } from "@/features/capture/quick-capture-form";
import { loadAttentionProjection } from "@/features/daily-cycle/attention-projection";
import { InboxItemRow } from "@/features/daily-cycle/inbox-item";
import { loadInboxProjection } from "@/features/daily-cycle/inbox-projection";
import { NeedsAttentionItemRow } from "@/features/daily-cycle/needs-attention-item";
import { getMessages } from "@/i18n/messages";
import { requireUser } from "@/lib/auth/require-user";
import type { Locale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";
import { deriveHomeOperationalStatus } from "./capabilities";

const RECENT_ACTIVITY_LIMIT = 4;
const NEEDS_ATTENTION_HOME_LIMIT = 3;

export async function HomeDashboard({ locale }: { locale: Locale }) {
  const t = getMessages(locale).home;
  const pt = locale === "pt-BR";
  const { supabase } = await requireUser(locale);
  const [tasksResult, waitingResult, questionsResult, inboxProjection, attentionProjection] = await Promise.all([
    supabase.from("tasks").select("id,title,due_at,status").in("status", ["inbox", "todo", "in_progress", "blocked"]).order("due_at", { ascending: true, nullsFirst: false }).limit(5),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("status", "waiting"),
    supabase.from("pending_questions").select("question").eq("status", "open").order("created_at", { ascending: false }).limit(1),
    loadInboxProjection(supabase, { locale, page: 1 }),
    loadAttentionProjection(supabase, { locale, limit: NEEDS_ATTENTION_HOME_LIMIT }),
  ]);
  const tasks = requireSupabaseData(tasksResult, "load dashboard tasks") ?? [];
  requireSupabaseData(waitingResult, "load waiting count");
  const questions = requireSupabaseData(questionsResult, "load open questions") ?? [];
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
      <article className="panel priority-panel"><header><div><span className="panel-kicker">01 / AGORA</span><h2>{t.priority}</h2></div><span className="count">{tasks.length}</span></header>{tasks.length ? <div className="dashboard-task-list">{tasks.map((task) => <Link href={`/${locale}/app/tasks`} className="dashboard-task" key={task.id}><strong>{task.title}</strong><span>{task.due_at ? new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" }).format(new Date(task.due_at)) : task.status.replaceAll("_", " ")}</span></Link>)}</div> : <div className="empty-state"><div className="thread-line" /><div><strong>{t.empty}</strong><p>{t.emptyHint}</p></div></div>}</article>
      <article className="panel attention-panel"><header><div><span className="panel-kicker">02 / PRECISA DE VOCÊ</span><h2>{t.needsAttention}</h2></div><span className="count attention-count">{attentionCount}</span></header>{attentionProjection.items.length ? <div className="dashboard-recent-list">{attentionProjection.items.map((item) => <NeedsAttentionItemRow item={item} key={item.key} locale={locale} />)}</div> : <p className="quiet-state">{t.needsAttentionEmpty}</p>}<Link href={`/${locale}/app/inbox?view=needs-you`} className="panel-view-all">{t.viewAll}</Link></article>
      <article className="panel"><header><div><span className="panel-kicker">03 / CONTEXTO</span><h2>{t.waiting}</h2></div><Clock3 size={19} /></header><p className="quiet-state">{waitingResult.count ? (pt ? `${waitingResult.count} ${waitingResult.count === 1 ? "item depende" : "itens dependem"} de retorno.` : `${waitingResult.count} waiting for a response.`) : (pt ? "Nada aguardando retorno." : "Nothing waiting for a response.")}</p></article>
      <article className="panel"><header><div><span className="panel-kicker">04 / CLAREZA</span><h2>{t.questions}</h2></div><MessageSquareText size={19} /></header><p className="quiet-state">{questions.length ? questions[0].question : (pt ? "Nenhuma pergunta em aberto." : "No open questions.")}</p></article>
      <article className="panel review-panel"><header><div><span className="panel-kicker">05 / {pt ? "ESTADO" : "STATUS"}</span><h2>{t.operationalStatus}</h2></div></header><div className="review-time" role="status"><strong>{operationalStatusCopy.label}</strong><span>{operationalStatusCopy.hint}</span></div></article>
      <article className="panel recent-panel"><header><div><span className="panel-kicker">06 / RECENTE</span><h2>{t.recent}</h2></div></header>{recentItems.length ? <div className="dashboard-recent-list">{recentItems.map((item) => <InboxItemRow item={item} key={item.entryId} locale={locale} />)}</div> : <p className="quiet-state">{pt ? "Nada por aqui ainda. Capture algo para começar." : "Nothing here yet. Capture something to get started."}</p>}</article>
    </section>
  </div>;
}
