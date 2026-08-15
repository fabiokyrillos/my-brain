import Link from "next/link";

import { BrainLensTabs } from "@/features/library/brain-lenses";
import { getLibraryCopy } from "@/features/library/copy";
import { loadBrainOverview } from "@/features/library/overview";
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
  const { supabase } = await requireUser(locale);
  const text = getLibraryCopy(locale);
  const messages = getMessages(locale);
  // `NavigationKey` includes `jobs`, which is context-only and carries no nav
  // label, so the union is wider than the label record. Brain only ever renders
  // `group: "context"` members, all of which have one -- but the compiler cannot
  // see that, and widening the label record to satisfy it would invent a label
  // for a destination that deliberately has none.
  const navLabels = messages.nav as Record<string, string>;

  const domains = await loadBrainOverview(supabase, locale);

  return (
    <div className="brain-page">
      <header className="brain-head">
        <h1>{text.title}</h1>
        <p>{text.intro}</p>
        <Link className="brain-search-link" href={`/${locale}/app/search`}>
          {text.searchLink}
        </Link>
      </header>

      <BrainLensTabs active="overview" locale={locale} />

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
                    domain.recent.length ? (
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
