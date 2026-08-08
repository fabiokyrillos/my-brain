import { requireUser } from "@/lib/auth/require-user";
import { SearchSurface } from "@/features/search/search-surface";
import { searchEverything } from "@/features/search/actions";
import type { Locale } from "@/lib/preferences";

/**
 * `2I-SEARCH` — the global search route.
 *
 * The page authenticates and then hands the Server Action to the client
 * surface as a prop. The surface performs no I/O of its own, which is what
 * keeps the ownership boundary in one place: `searchEverything` uses the
 * request-scoped authenticated client, so forced RLS decides what exists.
 */
export default async function SearchPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  await requireUser(locale);

  return (
    <div className="page-shell">
      <SearchSurface locale={locale} runSearch={searchEverything} />
    </div>
  );
}
