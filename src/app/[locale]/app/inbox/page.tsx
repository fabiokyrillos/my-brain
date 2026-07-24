import { Inbox } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConversationalQuestions } from "@/features/agent/conversational-questions";
import { loadMoreNeedsAttention } from "@/features/daily-cycle/attention-actions";
import { loadAttentionProjection } from "@/features/daily-cycle/attention-projection";
import { InboxItemRow } from "@/features/daily-cycle/inbox-item";
import { loadInboxProjection } from "@/features/daily-cycle/inbox-projection";
import { NeedsAttentionList } from "@/features/daily-cycle/needs-attention-list";
import { NeedsAttentionViewed } from "@/features/product-analytics/interaction-events";
import { PaginationLinks } from "@/features/shell/pagination-links";
import { requireUser } from "@/lib/auth/require-user";
import { parsePage } from "@/lib/pagination";
import { isLocale } from "@/lib/preferences";

function InboxViewTabs({ locale, active }: { locale: "pt-BR" | "en"; active: "all" | "needs-you" }) {
  const pt = locale === "pt-BR";
  return (
    <nav className="inbox-view-tabs" aria-label={pt ? "Filtrar Caixa" : "Filter Inbox"}>
      <Link href={`/${locale}/app/inbox`} aria-current={active === "all" ? "page" : undefined}>{pt ? "Todos" : "All"}</Link>
      <Link href={`/${locale}/app/inbox?view=needs-you`} aria-current={active === "needs-you" ? "page" : undefined}>{pt ? "Precisa de você" : "Needs you"}</Link>
    </nav>
  );
}

export default async function InboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string | string[]; view?: string | string[] }>;
}) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const pt = locale === "pt-BR";
  const resolvedSearchParams = await searchParams;
  const view = resolvedSearchParams.view === "needs-you" ? "needs-you" : "all";
  const { supabase, user } = await requireUser(locale);

  if (view === "needs-you") {
    const projection = await loadAttentionProjection(supabase, { locale });

    return (
      <div className="content-page">
        <header className="list-header">
          <div>
            <p className="eyebrow">{pt ? "REGISTROS" : "RECORDS"}</p>
            <h1>{pt ? "Caixa de entrada" : "Inbox"}</h1>
            <p>{pt ? "Tudo que você confiou ao Brain, com o original sempre preservado." : "Everything you entrusted to Brain, with the original always preserved."}</p>
          </div>
        </header>
        <InboxViewTabs locale={locale} active="needs-you" />
        <ConversationalQuestions supabase={supabase} userId={user.id} locale={locale} mode="pull" limit={5} />
        {projection.items.length ? (
          <NeedsAttentionList
            initialItems={projection.items}
            initialCursor={projection.nextCursor}
            initialHasNext={projection.hasNext}
            locale={locale}
            loadMore={loadMoreNeedsAttention}
          />
        ) : (
          <>
            <NeedsAttentionViewed surface="needs_attention" itemCount={0} locale={locale} />
            <div className="empty-list"><Inbox size={30} /><strong>{pt ? "Nada precisa de você agora" : "Nothing needs you right now"}</strong><p>{pt ? "Quando uma decisão já suportada exigir sua confirmação, ela aparece aqui." : "When an already-supported decision needs your confirmation, it appears here."}</p></div>
          </>
        )}
      </div>
    );
  }

  const page = parsePage(resolvedSearchParams.page);
  const projection = await loadInboxProjection(supabase, { locale, page });

  return (
    <div className="content-page">
      <header className="list-header">
        <div>
          <p className="eyebrow">{pt ? "REGISTROS" : "RECORDS"}</p>
          <h1>{pt ? "Caixa de entrada" : "Inbox"}</h1>
          <p>{pt ? "Tudo que você confiou ao Brain, com o original sempre preservado." : "Everything you entrusted to Brain, with the original always preserved."}</p>
        </div>
      </header>
      <InboxViewTabs locale={locale} active="all" />
      {projection.items.length ? (
        <div className="list-stack">
          {projection.items.map((item) => <InboxItemRow item={item} key={item.entryId} locale={locale} />)}
        </div>
      ) : (
        <div className="empty-list"><Inbox size={30} /><strong>{pt ? "Nenhum registro ainda" : "No entries yet"}</strong><p>{pt ? "Use a captura rápida para registrar algo sem interromper seu fluxo." : "Use quick capture to save something without breaking your flow."}</p></div>
      )}
      <PaginationLinks locale={locale} path="inbox" page={page} hasNext={projection.hasNext} />
    </div>
  );
}
