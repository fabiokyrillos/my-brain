import { Inbox } from "lucide-react";
import { notFound } from "next/navigation";
import { InboxItemRow } from "@/features/daily-cycle/inbox-item";
import { loadInboxProjection } from "@/features/daily-cycle/inbox-projection";
import { PaginationLinks } from "@/features/shell/pagination-links";
import { requireUser } from "@/lib/auth/require-user";
import { parsePage } from "@/lib/pagination";
import { isLocale } from "@/lib/preferences";

export default async function InboxPage({
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
  const { supabase } = await requireUser(locale);
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
