import { requireUser } from "@/lib/auth/require-user";
import { getOwnerTimeZone } from "@/features/profile/owner-timezone";
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
  // `LDC-SEARCH-001`. The surface is a client component, so the zone travels as
  // a prop: the browser's zone is not the authority, and a result dated
  // differently here than on the page it links to is the divergence this
  // initiative removes.
  const timeZone = await getOwnerTimeZone();

  return (
    <div className="page-shell">
      <SearchSurface locale={locale} runSearch={searchEverything} timeZone={timeZone} />
    </div>
  );
}
