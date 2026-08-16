import { notFound } from "next/navigation";

import { UniversalStateView } from "@/features/experience/universal-state";
import { getHistoryCopy } from "@/features/history/copy";
import { HistoryFilterControls } from "@/features/history/history-filters";
import { HistoryList } from "@/features/history/history-list";
import { hasActiveFilters, historyFilterQuery, parseHistoryFilters } from "@/features/history/filters";
import { loadHistoryPage } from "@/features/history/projection";
import { getAgentName } from "@/features/profile/agent-identity";
import { PaginationLinks } from "@/features/shell/pagination-links";
import { DataAiTabs } from "@/features/transparency/data-ai-tabs";
import { getTransparencyCopy } from "@/features/transparency/copy";
import { requireUser } from "@/lib/auth/require-user";
import { parsePage } from "@/lib/pagination";
import { defaultAgentPreferences, isLocale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";

/**
 * The History surface (UX-13, and the History half of UX-21, UX-22 and UX-28).
 *
 * ## What this route used to be
 *
 * One line. It selected six columns, ordered by date, and printed
 * `action_type.replaceAll("_", " ")`, `reason` and `actor · entity_type · date`
 * straight out of the database — no filters, no search, no link to the object
 * any of it was about, and four raw values in front of a Portuguese reader.
 *
 * ## What it is now
 *
 * The route stays thin: it resolves the locale, the reader, their timezone and
 * their assistant's name, hands the filters to `loadHistoryPage`, and renders.
 * Every rule about vocabulary lives in `copy.ts`, every rule about what a row
 * means lives in `event.ts`, and every rule about what the database is asked
 * lives in `projection.ts`.
 *
 * Read-only, as authorized: no migration, no RPC, no grant change, no write path.
 */
export default async function HistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;

  const query = await searchParams;
  const page = parsePage(query.page);
  const filters = parseHistoryFilters(query);

  const [{ supabase, user }, agentName] = await Promise.all([requireUser(locale), getAgentName()]);
  const copy = getHistoryCopy(locale, agentName);

  const profile = requireSupabaseData(
    await supabase.from("profiles").select("timezone").eq("user_id", user.id).maybeSingle(),
    "load history timezone",
  );
  const timezone =
    typeof profile?.timezone === "string" && profile.timezone !== ""
      ? profile.timezone
      : defaultAgentPreferences.timezone;

  // One formatter per render, in the reader's own zone, so the date a filter
  // means and the date a row shows cannot disagree.
  const dateTimeFormat = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  });
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: timezone });
  const formatDateTime = (iso: string) => dateTimeFormat.format(new Date(iso));
  const formatDate = (iso: string) => dateFormat.format(new Date(iso));

  const { events, hasNext } = await loadHistoryPage(supabase, {
    userId: user.id,
    locale,
    timezone,
    page,
    filters,
    copy,
    formatDate,
  });

  const filtered = hasActiveFilters(filters);

  return (
    <div className="content-page">
      <header className="list-header">
        <div>
          {/*
            The eyebrow names the section this surface belongs to, not the
            abstract virtue it serves. "TRANSPARÊNCIA" was true of all three
            transparency surfaces and located none of them; **Dados e IA** is
            where the product now says they live, and the strip below repeats it
            as a place you can move around in.
          */}
          <p className="eyebrow">{getTransparencyCopy(locale).title.toUpperCase()}</p>
          <h1>{copy.title}</h1>
          <p>{copy.intro}</p>
        </div>
      </header>

      <DataAiTabs active="history" locale={locale} />

      <HistoryFilterControls copy={copy} filters={filters} locale={locale} />

      {events.length ? (
        <HistoryList copy={copy} events={events} formatDateTime={formatDateTime} locale={locale} />
      ) : (
        <UniversalStateView
          description={filtered ? copy.empty.filteredBody : copy.empty.body}
          locale={locale}
          state="empty"
          title={filtered ? copy.empty.filteredTitle : copy.empty.title}
        />
      )}

      <PaginationLinks
        hasNext={hasNext}
        locale={locale}
        page={page}
        path="history"
        query={historyFilterQuery(filters)}
      />
    </div>
  );
}
