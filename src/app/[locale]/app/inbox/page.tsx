import { Inbox } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConversationalQuestions } from "@/features/agent/conversational-questions";
import { loadMoreNeedsAttention } from "@/features/daily-cycle/attention-actions";
import { loadAttentionProjection } from "@/features/daily-cycle/attention-projection";
import { loadMemoryConflicts } from "@/features/daily-cycle/conflict-projection";
// `2J-ATTN-007`. The EXISTING reinterpretation action, passed down. The list
// never imports it, and there is no generic attention-mutation executor: the
// only write reachable from this surface is the one that already owned it.
import { reprocessEntry } from "@/features/interpretations/actions";
import { isInboxView, loadInboxProjection, type InboxView } from "@/features/daily-cycle/inbox-projection";
import { NeedsAttentionList } from "@/features/daily-cycle/needs-attention-list";
import { getRecordsCopy } from "@/features/daily-cycle/records-copy";
import { RecordsQueue } from "@/features/daily-cycle/records-queue";
import { NeedsAttentionViewed } from "@/features/product-analytics/interaction-events";
import { PaginationLinks } from "@/features/shell/pagination-links";
import { requireUser } from "@/lib/auth/require-user";
import { parsePage } from "@/lib/pagination";
import { isLocale, type Locale } from "@/lib/preferences";
import { getAgentName } from "@/features/profile/agent-identity";
import { getOwnerTimeZone } from "@/features/profile/owner-timezone";

/** Every value `?view=` accepts, in the order the chips render. */
type RecordsView = "needs-you" | InboxView;

/**
 * The queue's views, as URL state (`02-arquitetura-e-rotas.md`).
 *
 * Links rather than buttons: a view is a location, it survives a refresh and a
 * shared URL, and `aria-current="page"` is what says which one you are on.
 * `2J`-era chips used `aria-pressed`, which describes a toggle — this is
 * navigation.
 */
function RecordsViews({ locale, active }: { locale: Locale; active: RecordsView }) {
  const copy = getRecordsCopy(locale).views;
  const views: readonly { readonly id: RecordsView; readonly label: string }[] = [
    { id: "needs-you", label: copy.needsYou },
    { id: "organizing", label: copy.organizing },
    { id: "failed", label: copy.failed },
    { id: "record-only", label: copy.recordOnly },
    { id: "all", label: copy.all },
  ];

  return (
    <nav className="records-views" aria-label={copy.label}>
      {views.map((view) => (
        <Link
          aria-current={view.id === active ? "page" : undefined}
          className="records-view"
          href={view.id === "all" ? `/${locale}/app/inbox` : `/${locale}/app/inbox?view=${view.id}`}
          key={view.id}
        >
          {view.label}
        </Link>
      ))}
    </nav>
  );
}

function RecordsHeader({ locale, lead }: { locale: Locale; lead: string }) {
  const pt = locale === "pt-BR";
  return (
    <header className="records-header">
      <p className="eyebrow">{pt ? "REGISTROS" : "RECORDS"}</p>
      <h1>{pt ? "Registros" : "Records"}</h1>
      <p className="records-lead">{lead}</p>
    </header>
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
  const requested = resolvedSearchParams.view;
  /*
    The default is **needs-you** (`02-arquitetura-e-rotas.md`: *visão padrão
    precisa de você*), where it used to be "all". A queue whose default is the
    full archive is a feed; the decision list is the reason this surface exists.

    `/app/inbox` with no parameter still resolves — it lands on the default view
    — so no existing link, redirect or bookmark breaks.
  */
  const view: RecordsView = typeof requested === "string" && isInboxView(requested)
    ? requested
    : "needs-you";
  const { supabase, user } = await requireUser(locale);

  const agentName = await getAgentName();
  const copy = getRecordsCopy(locale);

  // `LDC-DAILY-001`. Read through the shared accessor, not off a table: this
  // page is held to the Slice 2X.16 projection boundary, and `cache()` makes
  // the repair cost one query per request however many surfaces ask.
  const timeZone = await getOwnerTimeZone();

  if (view === "needs-you") {
    // `2N-CONFLICT-003`. Two independent reads, deliberately: the queue's rows
    // come from `list_needs_attention` and conflicts are derived from the owner's
    // own memories, so neither can fail the other. Run together because they are
    // independent, not because they are related.
    const [projection, conflicts] = await Promise.all([
      loadAttentionProjection(supabase, { locale }),
      loadMemoryConflicts(supabase, { locale, userId: user.id }),
    ]);

    return (
      <div className="content-page records-page">
        <RecordsHeader locale={locale} lead={copy.lead.needsYou} />
        <RecordsViews locale={locale} active="needs-you" />
        <ConversationalQuestions supabase={supabase} userId={user.id} locale={locale} mode="pull" limit={5} />
        {/*
          Counts conflicts too. Left as `projection.items.length`, a queue whose
          only item was a contradiction would have rendered "nothing needs you
          right now" — which is the exact silence `2N-CONFLICT-004` forbids.
        */}
        {projection.items.length || conflicts.items.length ? (
          <NeedsAttentionList agentName={agentName}
            conflicts={conflicts}
            initialItems={projection.items}
            initialCursor={projection.nextCursor}
            initialHasNext={projection.hasNext}
            locale={locale}
            loadMore={loadMoreNeedsAttention}
            retryAction={reprocessEntry}
            timeZone={timeZone}
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
  const projection = await loadInboxProjection(supabase, { locale, page, view });

  /*
    A view that filtered nothing in says which view is empty, not "no entries
    yet" — the first-use copy would be a lie on an account with two hundred
    records and no failures (`04-estados.md`: *vazio por visão*).
  */
  const emptyCopy = view === "all"
    ? { title: pt ? "Nenhum registro ainda" : "No entries yet", body: pt ? "Use a captura rápida para registrar algo sem interromper seu fluxo." : "Use quick capture to save something without breaking your flow." }
    : {
      title: copy.views[view === "record-only" ? "recordOnly" : view],
      body: copy.emptyByView[view === "record-only" ? "recordOnly" : view],
    };

  return (
    <div className="content-page records-page">
      <RecordsHeader locale={locale} lead={copy.lead.all} />
      <RecordsViews locale={locale} active={view} />
      {projection.items.length ? (
        <RecordsQueue agentName={agentName} items={projection.items} locale={locale} timeZone={timeZone} />
      ) : (
        <div className="empty-list"><Inbox size={30} /><strong>{emptyCopy.title}</strong><p>{emptyCopy.body}</p></div>
      )}
      {/*
        The view has to survive the page change, or page 2 of "falhas" silently
        becomes page 2 of everything.
      */}
      <PaginationLinks
        locale={locale}
        path="inbox"
        page={page}
        hasNext={projection.hasNext}
        query={view === "all" ? undefined : { view }}
      />
    </div>
  );
}
