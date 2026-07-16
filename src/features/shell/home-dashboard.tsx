import Link from "next/link";
import { Clock3, MessageSquareText } from "lucide-react";
import { captureEntry } from "@/features/capture/actions";
import { QuickCaptureForm } from "@/features/capture/quick-capture-form";
import { getMessages } from "@/i18n/messages";
import { requireUser } from "@/lib/auth/require-user";
import type { Locale } from "@/lib/preferences";

export async function HomeDashboard({ locale }: { locale: Locale }) {
  const t = getMessages(locale).home;
  const pt = locale === "pt-BR";
  const { supabase, user } = await requireUser(locale);
  const [tasksResult, waitingResult, questionsResult, preferencesResult] = await Promise.all([
    supabase.from("tasks").select("id,title,due_at,status").in("status", ["inbox", "todo", "in_progress", "blocked"]).order("due_at", { ascending: true, nullsFirst: false }).limit(5),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("status", "waiting"),
    supabase.from("entry_interpretations").select("pending_questions").order("created_at", { ascending: false }).limit(20),
    supabase.from("agent_preferences").select("daily_review_time").eq("user_id", user.id).maybeSingle(),
  ]);
  const tasks = tasksResult.data ?? [];
  const questions = (questionsResult.data ?? []).flatMap((item) => Array.isArray(item.pending_questions) ? item.pending_questions : []);
  const reviewTime = String(preferencesResult.data?.daily_review_time ?? "22:00").slice(0, 5);

  return <div className="dashboard">
    <section className="hero"><p className="eyebrow">{t.eyebrow}</p><h1>{t.greeting}<br/><span>{t.prompt}</span></h1><QuickCaptureForm action={captureEntry} locale={locale} /></section>
    <section className="dashboard-grid">
      <article className="panel priority-panel"><header><div><span className="panel-kicker">01 / AGORA</span><h2>{t.priority}</h2></div><span className="count">{tasks.length}</span></header>{tasks.length ? <div className="dashboard-task-list">{tasks.map((task) => <Link href={`/${locale}/app/tasks`} className="dashboard-task" key={task.id}><strong>{task.title}</strong><span>{task.due_at ? new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" }).format(new Date(task.due_at)) : task.status.replaceAll("_", " ")}</span></Link>)}</div> : <div className="empty-state"><div className="thread-line"/><div><strong>{t.empty}</strong><p>{t.emptyHint}</p></div></div>}</article>
      <article className="panel"><header><div><span className="panel-kicker">02 / CONTEXTO</span><h2>{t.waiting}</h2></div><Clock3 size={19}/></header><p className="quiet-state">{waitingResult.count ? (pt ? `${waitingResult.count} ${waitingResult.count === 1 ? "item depende" : "itens dependem"} de retorno.` : `${waitingResult.count} waiting for a response.`) : (pt ? "Nada aguardando retorno." : "Nothing waiting for a response.")}</p></article>
      <article className="panel"><header><div><span className="panel-kicker">03 / CLAREZA</span><h2>{t.questions}</h2></div><MessageSquareText size={19}/></header><p className="quiet-state">{questions.length ? String((questions[0] as { question?: string }).question ?? (pt ? "Há uma pergunta em aberto." : "There is an open question.")) : (pt ? "Nenhuma pergunta em aberto." : "No open questions.")}</p></article>
      <article className="panel review-panel"><header><div><span className="panel-kicker">04 / RITMO</span><h2>{t.nextReview}</h2></div></header><div className="review-time"><strong>{reviewTime}</strong><span>{pt ? "Resumo diário · hoje" : "Daily review · today"}</span></div></article>
    </section>
  </div>;
}
