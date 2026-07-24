import { CircleHelp } from "lucide-react";
import { notFound } from "next/navigation";
import { resolvePendingQuestion, undoQuestionResolution } from "@/features/agent/actions";
import { QuestionAnswerForm } from "@/features/agent/forms";
import { QuestionPreviewPanels } from "@/features/agent/question-preview-panels";
import { loadQuestionPreviews, type QuestionPreview } from "@/features/agent/question-preview-projection";
import { actionablePendingQuestionFilter } from "@/features/agent/question-visibility";
import { resolveProfileTimezone } from "@/features/daily-cycle/review-projection";
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
  const { supabase, user } = await requireUser(locale);
  // A snoozed question past its deadline is deterministically open again
  // (Slice 2D.2 read-time reactivation); a still-snoozed one stays hidden.
  const [result, profileResult] = await Promise.all([
    supabase.from("pending_questions").select("id,question,reason,confidence,created_at").or(actionablePendingQuestionFilter()).order("created_at", { ascending: false }).range(from, to),
    supabase.from("profiles").select("timezone").eq("user_id", user.id).maybeSingle(),
  ]);
  const { items, hasNext } = paginateRows(requireSupabaseData(result, "load pending questions") ?? []);
  const timezone = resolveProfileTimezone(
    (requireSupabaseData(profileResult, "load questions profile timezone") as { timezone?: unknown } | null)?.timezone,
  );
  // Slice 2D.3 — one owner-scoped, strictly read-only batch that yields the
  // bounded source DTO, the non-mutating predicted-effect preview, and the
  // deterministic suggested answers for the questions on this page.
  //
  // These are purely additive affordances, so the page degrades instead of
  // failing: if the projection read fails, the cards render without chips or
  // panels and answering / deferring / dismissing keeps working exactly as it
  // did before this slice. Provenance is authenticated independently in the
  // Server Action, so a missing preview can never weaken that check.
  const previews = await loadQuestionPreviews(supabase, user.id, items.map((item) => item.id), locale)
    .catch(() => new Map<string, QuestionPreview>());

  return <div className="content-page"><header className="list-header"><div><p className="eyebrow">{pt ? "CLAREZA" : "CLARITY"}</p><h1>{pt ? "Perguntas pendentes" : "Pending questions"}</h1><p>{pt ? "Ambiguidades que o Brain preservou em vez de adivinhar." : "Ambiguities Brain preserved instead of guessing."}</p></div></header>{items.length ? <div className="list-stack">{items.map((item) => { const preview = previews.get(item.id); return <article className="question-card" key={item.id}><span>{Math.round(Number(item.confidence) * 100)}%</span><h2>{item.question}</h2><p>{item.reason}</p><QuestionAnswerForm action={resolvePendingQuestion} undoAction={undoQuestionResolution} locale={locale} questionId={item.id} timezone={timezone} suggestions={preview?.suggestions ?? []} />{preview ? <QuestionPreviewPanels locale={locale} timezone={timezone} source={preview.source} effect={preview.effect} /> : null}</article>; })}</div> : <div className="empty-list"><CircleHelp size={30} /><strong>{pt ? "Nenhuma dúvida aberta" : "No open questions"}</strong><p>{pt ? "Quando houver ambiguidade relevante, ela aparecerá aqui sem bloquear o restante." : "Relevant ambiguity appears here without blocking everything else."}</p></div>}<PaginationLinks locale={locale} path="questions" page={page} hasNext={hasNext} /></div>;
}
