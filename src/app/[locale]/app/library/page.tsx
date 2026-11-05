import Link from "next/link";

import { PageHeader } from "@/components/ui";
import { BrainLensTabs } from "@/features/library/brain-lenses";
import { getLibraryCopy } from "@/features/library/copy";
import { loadAreaCounts, loadIdeas } from "@/features/areas/area-page";
import { loadLifeAreas } from "@/features/library/life-areas";
import { getOwnerTimeZone } from "@/features/profile/owner-timezone";
import { formatInstant } from "@/lib/time/instant-format";
import { loadBrainOverview } from "@/features/library/overview";
import { getNavigationHref } from "@/features/shell/capabilities";
import { contextKindLabel } from "@/features/vocabulary/copy";
import { ProtectedContent } from "@/features/operations/protected-content";
import { requireUser } from "@/lib/auth/require-user";
import { getMessages } from "@/i18n/messages";
import type { Locale } from "@/lib/preferences";

/**
 * `2I-LIB-001` … `2I-LIB-008` — Brain, the overview lens.
 *
 * ## What changed, and what deliberately did not
 *
 * This was a grid of eight doors with a number on each. It is now the **visão
 * geral** of a unified space: the lens strip that says Brain has parts and which
 * one you are in, and a panel per domain that says what is behind the door
 * rather than only that a door exists.
 *
 * **No new data model** (`2I-LIB-002`) and **no dashboard** (`2I-LIB-007`): the
 * counts are navigation aids — they tell you whether a door leads anywhere — the
 * recent rows are three plain `created_at` reads, and there is no score, no
 * ranking and nothing derived from the numbers. The membership is still read off
 * `capabilities.ts` rather than restated, so a ninth context destination appears
 * here the day it is added.
 *
 * **No route moved and no loader was duplicated.** Each lens is the destination
 * it always was, at the URL it always had, with its own server-rendered loader —
 * see `lenses.ts` for why a query-string lens over a second loader was rejected.
 *
 * ## Why the recent rows are text and not links
 *
 * Four of the five domains with a recency source have a detail route; `files`
 * has none. A list where four items open something and the fifth silently does
 * not is worse than one where none does, and the panel's own door is one line
 * above every row. The rows are here to answer *is my stuff in there*, which is
 * what an overview owes and what `2I-LIB-003` allows.
 *
 * ## Sensitivity
 *
 * `memories.content` and `attachments.original_name` are content this product
 * governs, so both are asked through `ProtectedContent` under the same surface
 * literal their own pages use — a memory masked on `/app/memories` is masked
 * here. Person, project and organization names are structural identifiers
 * (ADR-110 Decision 2) and stay visible; none of those tables carries a
 * `sensitivity` column to derive from. `LIBRARY_RECENCY_SURFACE` decides both
 * halves in one place so they cannot disagree.
 *
 * Every read is owner-scoped by the request-scoped authenticated client under
 * forced RLS, exactly as search is.
 */
export default async function LibraryPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  const { supabase, user } = await requireUser(locale);
  const text = getLibraryCopy(locale);
  const messages = getMessages(locale);
  // `NavigationKey` includes `jobs`, which is context-only and carries no nav
  // label, so the union is wider than the label record. Brain only ever renders
  // `group: "context"` members, all of which have one -- but the compiler cannot
  // see that, and widening the label record to satisfy it would invent a label
  // for a destination that deliberately has none.
  const navLabels = messages.nav as Record<string, string>;

  // Two independent reads: an area read that fails says so in its own section
  // and never fails the overview (or the other way round).
  const [domains, areas, ideas, timeZone] = await Promise.all([
    loadBrainOverview(supabase, locale),
    loadLifeAreas(supabase),
    loadIdeas(supabase, user.id),
    getOwnerTimeZone(),
  ]);
  // Life Brain C.4 (`LB-C-009`): real counts, by the timeline's own rule. A
  // failed count read leaves the doors without a number rather than with a 0.
  const counts = areas.status === "ok" ? await loadAreaCounts(supabase, user.id, areas.areas.map((area) => area.id)) : null;
  const ideasArea = areas.status === "ok" ? areas.areas.find((area) => area.kind === "ideas") ?? null : null;
  // The area doors and "see all" hang off the registry's href for the
  // contexts lens, never a hand-written path (`2I-LIB-006`).
  const contextsHref = getNavigationHref(locale, "contexts");
  const recordsHref = getNavigationHref(locale, "inbox");

  return (
    <div className="brain-page">
      {/* Life Brain A.5: the shared compact header; the search link is its action. */}
      <PageHeader
        actions={(
          <Link className="brain-search-link" href={`/${locale}/app/search`}>
            {text.searchLink}
          </Link>
        )}
        className="brain-head"
        description={text.intro}
        size="compact"
        title={text.title}
      />

      <BrainLensTabs active="overview" locale={locale} />

      {/*
        Life Brain A.5: Memória opens with the owner's areas of life — the
        contexts the reading files records under (C.1). Doors, not a dashboard:
        no count (see `life-areas.ts`), each one the area's own page.
      */}
      <section aria-labelledby="brain-areas-heading" className="brain-areas">
        <h2 id="brain-areas-heading">{text.areas.heading}</h2>
        {areas.status === "failed" ? (
          <p className="brain-domain-quiet" role="note">{text.areas.failed}</p>
        ) : areas.areas.length ? (
          <>
            <ul className="brain-area-list">
              {areas.areas.map((area) => {
                const kindLabel = contextKindLabel(locale, area.kind);
                const count = counts?.get(area.id);
                return (
                  <li key={area.id}>
                    <Link className="brain-area" href={`${contextsHref}/${area.id}`}>
                      <span className="brain-area-name">{area.name}</span>
                      {kindLabel && kindLabel.localeCompare(area.name, locale, { sensitivity: "base" }) !== 0 ? (
                        <span className="brain-area-kind">{kindLabel}</span>
                      ) : null}
                      {count ? <span className="brain-area-count">{text.areas.count(count.count, count.atLeast)}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <p className="brain-areas-foot">
              {areas.bounded ? <span>{text.areas.more} </span> : null}
              <Link className="brain-areas-all" href={contextsHref}>{text.areas.seeAll}</Link>
            </p>
          </>
        ) : (
          <p className="brain-domain-quiet">{text.areas.empty}</p>
        )}
      </section>

      {/*
        Life Brain C.4 (`LB-C-011`): Ideias as a lens — the records whose current
        reading carries the `idea` concept. A filter over records, not a table.
      */}
      <section aria-labelledby="brain-ideas-heading" className="brain-areas brain-ideas">
        <h2 id="brain-ideas-heading">{text.ideas.heading}</h2>
        {ideas.status === "failed" ? (
          <p className="brain-domain-quiet" role="note">{text.ideas.failed}</p>
        ) : ideas.records.length ? (
          <>
            <ul className="brain-ideas-list">
              {ideas.records.map((idea) => {
                const href = `${recordsHref}/${idea.id}`;
                return (
                  <li key={idea.id}>
                    <ProtectedContent href={href} locale={locale} revealKey={`brain-idea-${idea.id}`} sensitivity={idea.sensitivity} surface="area">
                      <Link href={href}>{idea.preview}</Link>
                    </ProtectedContent>
                    <span className="brain-idea-date">{formatInstant(idea.occurredAt, "day", locale, timeZone)}</span>
                  </li>
                );
              })}
            </ul>
            {ideasArea ? (
              <p className="brain-areas-foot">
                <Link className="brain-areas-all" href={`${contextsHref}/${ideasArea.id}`}>{text.ideas.seeArea}</Link>
              </p>
            ) : null}
          </>
        ) : (
          <p className="brain-domain-quiet">{text.ideas.empty}</p>
        )}
      </section>

      <section className="brain-holds">
        <h2>{text.holdsHeading}</h2>
        <ul className="brain-domains">
          {domains.map((domain) => {
            const surface = domain.recentSurface;
            return (
              <li key={domain.key}>
                <article className="brain-domain">
                  <div className="brain-domain-head">
                    <h3>
                      <Link href={domain.href}>{navLabels[domain.key]}</Link>
                    </h3>
                    {/*
                      Three states, never two. A domain with no countable table
                      shows nothing; one whose count failed says so; one that
                      counted shows the figure. Collapsing the first two would
                      report an outage for Relações on every render.
                    */}
                    {domain.countSupported ? (
                      domain.count === null ? (
                        <span className="brain-domain-unavailable">{text.countUnavailable}</span>
                      ) : (
                        <span className="brain-domain-count">{domain.count}</span>
                      )
                    ) : null}
                  </div>
                  <p className="brain-domain-note">{text.descriptions[domain.key]}</p>
                  {domain.recencySupported ? (
                    /*
                      Three arms, not two. A failed read used to reach the
                      `nothingYet` branch and print a positive claim about the
                      owner's own data — the shape this surface refuses for the
                      count and, until an independent review found it, did not
                      refuse for the rows.
                    */
                    domain.recentFailed ? (
                      <p className="brain-domain-quiet" role="note">{text.recentUnavailable}</p>
                    ) : domain.recent.length ? (
                      <>
                        <p className="brain-recent-label">{text.recentLabel}</p>
                        <ul className="brain-recent">
                          {domain.recent.map((row) => (
                            <li key={row.id}>
                              {row.sensitivity && surface ? (
                                /*
                                  No `describedAs`: the label IS the protected
                                  content here, and passing it would defeat the
                                  mask through the control's accessible name --
                                  the same call the Work list and the memory
                                  listing make.
                                */
                                <ProtectedContent
                                  locale={locale}
                                  revealKey={`brain-recent-${domain.key}-${row.id}`}
                                  sensitivity={row.sensitivity}
                                  surface={surface}
                                >
                                  <span>{row.label}</span>
                                </ProtectedContent>
                              ) : (
                                <span>{row.label}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <p className="brain-domain-quiet">{text.nothingYet}</p>
                    )
                  ) : (
                    <p className="brain-domain-quiet">{text.noRecency}</p>
                  )}
                </article>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
