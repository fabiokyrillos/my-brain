import { NotebookTabs } from "lucide-react";
import { notFound } from "next/navigation";
import { generateReview } from "@/features/agent/actions";
import { ReviewButton } from "@/features/agent/forms";
import { PaginationLinks } from "@/features/shell/pagination-links";
import { requireUser } from "@/lib/auth/require-user";
import { pageRange, paginateRows, parsePage } from "@/lib/pagination";
import { isLocale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";

export default async function ReviewsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ page?: string | string[] }> }) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const pt = locale === "pt-BR";
  const page = parsePage((await searchParams).page);
  const { from, to } = pageRange(page);
  const { supabase } = await requireUser(locale);
  const result = await supabase.from("summaries").select("id,title,content,period_type,period_start,period_end,status,model,generated_at").order("period_end", { ascending: false }).range(from, to);
  const { items, hasNext } = paginateRows(requireSupabaseData(result, "load reviews") ?? []);

  return <div className="content-page"><header className="list-header"><div><p className="eyebrow">{pt ? "FECHAMENTO E FOCO" : "REVIEW AND FOCUS"}</p><h1>{pt ? "Revisões" : "Reviews"}</h1><p>{pt ? "Resumos baseados nos seus registros reais, preservados por versão." : "Summaries grounded in your real entries and preserved by version."}</p></div></header><div className="review-buttons"><ReviewButton action={generateReview} locale={locale} period="daily" /><ReviewButton action={generateReview} locale={locale} period="weekly_review" /><ReviewButton action={generateReview} locale={locale} period="weekly_plan" /><ReviewButton action={generateReview} locale={locale} period="monthly" /></div>{items.length ? <div className="review-list">{items.map((review) => <article className="review-card" key={review.id}><header><div><span>{review.period_type.replaceAll("_", " ")}</span><h2>{review.title}</h2></div><span className={`status-badge ${review.status}`}>{review.status}</span></header><p>{review.content}</p><footer>{review.period_start} — {review.period_end} · {review.model}</footer></article>)}</div> : <div className="empty-list"><NotebookTabs size={30} /><strong>{pt ? "Nenhuma revisão ainda" : "No reviews yet"}</strong><p>{pt ? "Gere uma revisão quando houver atividade no período." : "Generate a review when there is activity in the period."}</p></div>}<PaginationLinks locale={locale} path="reviews" page={page} hasNext={hasNext} /></div>;
}
