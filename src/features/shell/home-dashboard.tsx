import { Clock3, MessageSquareText } from "lucide-react";
import Link from "next/link";
import { captureEntry } from "@/features/capture/actions";
import { QuickCaptureForm } from "@/features/capture/quick-capture-form";
import { getMessages } from "@/i18n/messages";
import { requireUser } from "@/lib/auth/require-user";
import type { Locale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";

export async function HomeDashboard({ locale }: { locale: Locale }) {
  const t = getMessages(locale).home;
  const pt = locale === "pt-BR";
  const { supabase, user } = await requireUser(locale);
  const [tasksResult, waitingResult, questionsResult, preferencesResult] = await Promise.all([
    supabase.from("tasks").select("id,title,due_at,status").in("status", ["inbox", "todo", "in_progress", "blocked"]).order("due_at", { ascending: true, nullsFirst: false }).limit(5),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("status", "waiting"),
    supabase.from("pending_questions").select("question").eq("status", "open").order("created_at", { ascending: false }).limit(1),
    supabase.from("agent_preferences").select("daily_review_time").eq("user_id", user.id).maybeSingle(),
  ]);
  const tasks = requireSupabaseData(tasksResult, "load dashboard tasks") ?? [];
  requireSupabaseData(waitingResult, "load waiting count");
  const questions = requireSupabaseData(questionsResult, "load open questions") ?? [];
  const preferences = requireSupabaseData(preferencesResult, "load review preference");
  const reviewTime = String(preferences?.daily_review_time ?? "22:00").slice(0, 5);
  const today = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(new Date()).toUpperCase();

  return <div className="dashboard">
    <section className="hero"><p className="eyebrow">{today}</p><h1>{t.greeting}<br /><span>{t.prompt}</span></h1><QuickCaptureForm action={captureEntry} locale={locale} captureSource="home" /></section>
    <section className="dashboard-grid">
      <article className="panel priority-panel"><header><div><span className="panel-kicker">01 / AGORA</span><h2>{t.priority}</h2></div><span className="count">{tasks.length}</span></header>{tasks.length ? <div className="dashboard-task-list">{tasks.map((task) => <Link href={`/${locale}/app/tasks`} className="dashboard-task" key={task.id}><strong>{task.title}</strong><span>{task.due_at ? new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" }).format(new Date(task.due_at)) : task.status.replaceAll("_", " ")}</span></Link>)}</div> : <div className="empty-state"><div className="thread-line" /><div><strong>{t.empty}</strong><p>{t.emptyHint}</p></div></div>}</article>
      <article className="panel"><header><div><span className="panel-kicker">02 / CONTEXTO</span><h2>{t.waiting}</h2></div><Clock3 size={19} /></header><p className="quiet-state">{waitingResult.count ? (pt ? `${waitingResult.count} ${waitingResult.count === 1 ? "item depende" : "itens dependem"} de retorno.` : `${waitingResult.count} waiting for a response.`) : (pt ? "Nada aguardando retorno." : "Nothing waiting for a response.")}</p></article>
      <article className="panel"><header><div><span className="panel-kicker">03 / CLAREZA</span><h2>{t.questions}</h2></div><MessageSquareText size={19} /></header><p className="quiet-state">{questions.length ? questions[0].question : (pt ? "Nenhuma pergunta em aberto." : "No open questions.")}</p></article>
      <article className="panel review-panel"><header><div><span className="panel-kicker">04 / RITMO</span><h2>{t.nextReview}</h2></div></header><div className="review-time"><strong>{reviewTime}</strong><span>{pt ? "Horário preferido" : "Preferred time"}</span></div></article>
    </section>
  </div>;
}
