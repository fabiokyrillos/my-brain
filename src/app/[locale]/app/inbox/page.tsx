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
import { byokSettingsHref } from "@/features/byok/routes";
import { loadPendingEntryCount } from "@/features/byok/pending-entries";
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
function RecordsViews({
  locale,
  active,
  awaitingAiCount,
}: {
  locale: Locale;
  active: RecordsView;
  /**
   * `BYOK-CAPTURE-002`. How many entries are waiting on a key, so the chip can
   * be offered only when it would return something.
   */
  awaitingAiCount: number;
}) {
  const copy = getRecordsCopy(locale).views;
  const views: readonly { readonly id: RecordsView; readonly label: string }[] = [
    { id: "needs-you", label: copy.needsYou },
    { id: "organizing", label: copy.organizing },
    { id: "failed", label: copy.failed },
    { id: "record-only", label: copy.recordOnly },
    /*
      Conditional, and the second clause is what stops it being a trap: a deep
      link to `?view=awaiting-ai` on an account that has since resolved every
      such entry would otherwise render a chip row in which no chip is current,
      and `aria-current` would point at nothing. The same rule the attention
      queue's filter row already follows — never advertise a filter that yields
      nothing — with the one exception of the view you are standing on.
    */
    ...(awaitingAiCount > 0 || active === "awaiting-ai"
      ? [{ id: "awaiting-ai" as const, label: copy.awaitingAi }]
      : []),
    { id: "all", label: copy.all },
  ];

  return (
    <nav className="records-views" aria-label={copy.label}>
      {views.map((view) => (
        <Link
          aria-current={view.id === active ? "page" : undefined}
          className="records-view"
          /*
            Every chip names its view, **including "Tudo"**.

            It used to link to the bare `/app/inbox`, which was correct while
            that resolved to the archive. When the default became needs-you, the
            chip started landing on a different view than the one it says — and
            `aria-current` could never mark it, so it could not even look
            selected. Nothing else in the product linked to `?view=all`, which
            left the complete archive reachable only by typing the URL.
          */
          href={`/${locale}/app/inbox?view=${view.id}`}
          key={view.id}
        >
          {view.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * `BYOK-CAPTURE-002`. What the default view says when entries are stuck.
 *
 * The independent review's finding was that `awaiting_ai_configuration` reached
 * no view at all once needs-you became the default: `list_needs_attention` never
 * selects it, and widening that RPC is a migration this initiative does not
 * have. It is emphatically a state that needs the owner — the lifecycle resolver
 * has answered `needs_attention` + `configure_ai_credential` for it since BYOK —
 * so the queue that is *named* for that has to admit it exists.
 *
 * Two links because there are genuinely two acts: look at what is waiting, and
 * fix the reason it is waiting. Neither is a mutation, so neither confirms.
 */
function AwaitingAiNotice({
  locale,
  count,
  /**
   * `loadPendingEntryCount` caps at `PENDING_ENTRY_COUNT_CEILING` and returns
   * this flag beside the number, precisely so a capped count is never printed
   * as an exact one. Reading `count` alone would tell an owner with seven
   * hundred stuck entries that they have exactly five hundred — the same defect
   * as the unread `agendaHasMore` this session fixed, in the same session.
   */
  atLeast,
  /** False on the awaiting-ai view itself, where it would link to this page. */
  showListLink,
}: {
  locale: Locale;
  count: number;
  atLeast: boolean;
  showListLink: boolean;
}) {
  const copy = getRecordsCopy(locale).awaitingAiNotice;
  const shown = atLeast ? `${count}+` : String(count);
  return (
    /*
      A `<div>`, not an `<aside>`. An `<aside>` inside `<main>` is a
      `complementary` landmark, and an unnamed one holding a single sentence is
      an entry in the landmark list that tells a screen-reader user nothing.
      There is no `data-tone` either: it named a tone no rule selected, which is
      the producer-with-no-consumer defect this session found three times
      already. The tone is in the class, where the rule is.
    */
    <div className="records-notice">
      <p>{count === 1 && !atLeast ? copy.one : copy.many.replace("{count}", shown)}</p>
      <p className="records-notice-actions">
        {showListLink ? (
          <Link href={`/${locale}/app/inbox?view=awaiting-ai`}>{copy.seeThem}</Link>
        ) : null}
        <Link href={byokSettingsHref(locale)}>{copy.configure}</Link>
      </p>
    </div>
  );
}

/**
 * The sentence a view that filtered nothing in gets to say.
 *
 * A function rather than an inline ternary because the key mapping is no longer
 * one-to-one — `record-only` and `awaiting-ai` are hyphenated route values over
 * camel-cased copy keys — and an index expression that has to spell both is
 * where a fifth view would silently pick the wrong sentence.
 */
function emptyCopyFor(view: InboxView, copy: ReturnType<typeof getRecordsCopy>, pt: boolean) {
  switch (view) {
    case "all":
      return {
        title: pt ? "Nenhum registro ainda" : "No entries yet",
        body: pt
          ? "Use a captura rápida para registrar algo sem interromper seu fluxo."
          : "Use quick capture to save something without breaking your flow.",
      };
    case "record-only":
      return { title: copy.views.recordOnly, body: copy.emptyByView.recordOnly };
    case "awaiting-ai":
      return { title: copy.views.awaitingAi, body: copy.emptyByView.awaitingAi };
    default:
      return { title: copy.views[view], body: copy.emptyByView[view] };
  }
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
    const [projection, conflicts, awaitingAi] = await Promise.all([
      loadAttentionProjection(supabase, { locale }),
      loadMemoryConflicts(supabase, { locale, userId: user.id }),
      // A third independent read, for the third thing the queue cannot see from
      // the RPC. A `head` count, so no captured text is pulled into a page that
      // only needs to know whether to raise the notice.
      loadPendingEntryCount(supabase, user.id),
    ]);

    return (
      <div className="content-page records-page">
        <RecordsHeader locale={locale} lead={copy.lead.needsYou} />
        <RecordsViews locale={locale} active="needs-you" awaitingAiCount={awaitingAi.count} />
        {awaitingAi.count > 0 ? <AwaitingAiNotice atLeast={awaitingAi.atLeast} count={awaitingAi.count} locale={locale} showListLink /> : null}
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
  const [projection, awaitingAi] = await Promise.all([
    loadInboxProjection(supabase, { locale, page, view }),
    loadPendingEntryCount(supabase, user.id),
  ]);

  /*
    A view that filtered nothing in says which view is empty, not "no entries
    yet" — the first-use copy would be a lie on an account with two hundred
    records and no failures (`04-estados.md`: *vazio por visão*).
  */
  const emptyCopy = emptyCopyFor(view, copy, pt);

  return (
    <div className="content-page records-page">
      <RecordsHeader locale={locale} lead={copy.lead.all} />
      <RecordsViews locale={locale} active={view} awaitingAiCount={awaitingAi.count} />
      {/*
        On this view the notice is the *fix*, not the announcement: the rows
        below say which records are stuck, and this is the one link that unsticks
        them. Raised on needs-you and here, and nowhere else — on "Tudo" it would
        be a banner about four rows among two hundred.
      */}
      {view === "awaiting-ai" && awaitingAi.count > 0 ? (
        <AwaitingAiNotice atLeast={awaitingAi.atLeast} count={awaitingAi.count} locale={locale} showListLink={false} />
      ) : null}
      {projection.items.length ? (
        <RecordsQueue agentName={agentName} items={projection.items} locale={locale} timeZone={timeZone} />
      ) : projection.hasNext ? (
        /*
          Empty **page**, not empty view.

          The status prefilter is a declared superset and the derived product
          state decides membership, so a page can be filled entirely with rows
          the post-filter discards while matching rows sit further along. Showing
          the view's empty copy here would print "Nenhuma falha. Nada ficou pelo
          caminho." above a "Próxima" link, with a terminal_error on page three —
          a categorical claim that is false, which is worse than saying nothing.
        */
        <div className="empty-list"><Inbox size={30} /><strong>{copy.emptyPage.title}</strong><p>{copy.emptyPage.body}</p></div>
      ) : (
        <div className="empty-list"><Inbox size={30} /><strong>{emptyCopy.title}</strong><p>{emptyCopy.body}</p></div>
      )}
      {/*
        The view has to survive the page change, or page 2 of "falhas" silently
        becomes page 2 of everything — and "Tudo" is not an exception, because
        the parameter is what distinguishes it from the default.
      */}
      <PaginationLinks
        locale={locale}
        path="inbox"
        page={page}
        hasNext={projection.hasNext}
        query={{ view }}
      />
    </div>
  );
}
