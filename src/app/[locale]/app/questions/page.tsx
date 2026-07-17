import { CircleHelp } from "lucide-react";
import { notFound } from "next/navigation";
import { answerPendingQuestion } from "@/features/agent/actions";
import { QuestionAnswerForm } from "@/features/agent/forms";
import { PaginationLinks } from "@/features/shell/pagination-links";
import { requireUser } from "@/lib/auth/require-user";
import { pageRange, paginateRows, parsePage } from "@/lib/pagination";
import { isLocale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";

export default async function QuestionsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ page?: string | string[] }> }) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const pt = locale === "pt-BR";
  const page = parsePage((await searchParams).page);
  const { from, to } = pageRange(page);
  const { supabase } = await requireUser(locale);
  const result = await supabase.from("pending_questions").select("id,question,reason,confidence,created_at").eq("status", "open").order("created_at", { ascending: false }).range(from, to);
  const { items, hasNext } = paginateRows(requireSupabaseData(result, "load pending questions") ?? []);

  return <div className="content-page"><header className="list-header"><div><p className="eyebrow">{pt ? "CLAREZA" : "CLARITY"}</p><h1>{pt ? "Perguntas pendentes" : "Pending questions"}</h1><p>{pt ? "Ambiguidades que o Brain preservou em vez de adivinhar." : "Ambiguities Brain preserved instead of guessing."}</p></div></header>{items.length ? <div className="list-stack">{items.map((item) => <article className="question-card" key={item.id}><span>{Math.round(Number(item.confidence) * 100)}%</span><h2>{item.question}</h2><p>{item.reason}</p><QuestionAnswerForm action={answerPendingQuestion} locale={locale} questionId={item.id} /></article>)}</div> : <div className="empty-list"><CircleHelp size={30} /><strong>{pt ? "Nenhuma dúvida aberta" : "No open questions"}</strong><p>{pt ? "Quando houver ambiguidade relevante, ela aparecerá aqui sem bloquear o restante." : "Relevant ambiguity appears here without blocking everything else."}</p></div>}<PaginationLinks locale={locale} path="questions" page={page} hasNext={hasNext} /></div>;
}
