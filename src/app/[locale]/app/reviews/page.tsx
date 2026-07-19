import { NotebookTabs } from "lucide-react";
import { notFound } from "next/navigation";
import { generateReview } from "@/features/agent/actions";
import { ReviewButton } from "@/features/agent/forms";
import { loadReviewListProjection } from "@/features/reviews/review-list";
import { PaginationLinks } from "@/features/shell/pagination-links";
import { requireUser } from "@/lib/auth/require-user";
import { parsePage } from "@/lib/pagination";
import { isLocale } from "@/lib/preferences";

export default async function ReviewsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const pt = locale === "pt-BR";
  const page = parsePage((await searchParams).page);
  const { supabase, user } = await requireUser(locale);
  const { items, hasNext } = await loadReviewListProjection(supabase, { userId: user.id, locale, page });

  return <div className="content-page">
    <header className="list-header"><div><p className="eyebrow">{pt ? "FECHAMENTO SOB DEMANDA" : "ON-DEMAND REVIEW"}</p><h1>{pt ? "Revisões" : "Reviews"}</h1><p>{pt ? "Gere uma revisão quando quiser; nada é executado por horário configurado." : "Generate a review when you choose; nothing runs from a configured schedule."}</p></div></header>
    <div className="review-buttons"><ReviewButton action={generateReview} locale={locale} period="daily" /><ReviewButton action={generateReview} locale={locale} period="weekly_review" /><ReviewButton action={generateReview} locale={locale} period="weekly_plan" /><ReviewButton action={generateReview} locale={locale} period="monthly" /></div>
    {items.length ? <div className="review-list">{items.map((review) => <article className="review-card" key={review.id}><header><div><span>{review.periodLabel}</span><h2>{review.title}</h2></div><span className="status-badge" data-tone={review.statusTone}>{review.statusLabel}</span></header><p>{review.content}</p><footer>{review.periodLabelRange}</footer></article>)}</div> : <div className="empty-list"><NotebookTabs size={30} /><strong>{pt ? "Nenhuma revisão ainda" : "No reviews yet"}</strong><p>{pt ? "Gere uma revisão quando houver atividade no período." : "Generate a review when there is activity in the period."}</p></div>}
    <PaginationLinks locale={locale} path="reviews" page={page} hasNext={hasNext} />
  </div>;
}
