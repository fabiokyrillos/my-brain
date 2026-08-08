import Link from "next/link";

import { LIBRARY_MEMBERS, LIBRARY_RECENCY } from "@/features/library/contracts";
import { getLibraryCopy } from "@/features/library/copy";
import { getNavigationHref } from "@/features/shell/capabilities";
import { requireUser } from "@/lib/auth/require-user";
import { getMessages } from "@/i18n/messages";
import type { Locale } from "@/lib/preferences";

/**
 * `2I-LIB-001` … `2I-LIB-008` — Library.
 *
 * Renders the `group: "context"` membership that `capabilities.ts` has carried
 * since before this phase. **No new data model** (`2I-LIB-002`), and **no
 * dashboard metrics** (`2I-LIB-007`): the counts below are navigation aids —
 * they tell you whether a door leads anywhere — and there is no chart, no
 * trend and no derived score.
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
  // label, so the union is wider than the label record. Library only ever
  // renders `group: "context"` members, all of which have one -- but the
  // compiler cannot see that, and widening the label record to satisfy it
  // would invent a label for a destination that deliberately has none.
  const navLabels = messages.nav as Record<string, string>;

  // One count per domain, concurrently. A failed count renders as null rather
  // than collapsing the page: Library's job is to be a door, and a door that
  // will not open because a counter failed is worse than a door with no number.
  const summaries = await Promise.all(
    LIBRARY_MEMBERS.map(async (key) => {
      const recency = LIBRARY_RECENCY[key];
      if (!recency) return { key, count: null as number | null };
      const { count, error } = await supabase
        .from(recency.table)
        .select("id", { count: "exact", head: true });
      return { key, count: error ? null : (count ?? 0) };
    }),
  );

  return (
    <div className="library-page">
      <header className="library-head">
        <h1>{text.title}</h1>
        <p>{text.intro}</p>
        <Link className="library-search-link" href={`/${locale}/app/search`}>
          {text.searchLink}
        </Link>
      </header>

      <ul className="library-grid">
        {summaries.map(({ key, count }) => (
          <li key={key}>
            <Link className="library-card" href={getNavigationHref(locale, key)}>
              <span className="library-card-name">{navLabels[key]}</span>
              <span className="library-card-note">{text.descriptions[key]}</span>
              {count !== null ? <span className="library-card-count">{count}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
