import Link from "next/link";
import type { Locale } from "@/lib/preferences";

export function PaginationLinks({
  locale,
  path,
  page,
  hasNext,
}: {
  locale: Locale;
  path: string;
  page: number;
  hasNext: boolean;
}) {
  if (page === 1 && !hasNext) return null;
  const pt = locale === "pt-BR";
  const href = (targetPage: number) => `/${locale}/app/${path}?page=${targetPage}`;

  return (
    <nav className="pagination-links" aria-label={pt ? "Paginação" : "Pagination"}>
      {page > 1
        ? <Link href={href(page - 1)}>{pt ? "Anterior" : "Previous"}</Link>
        : <span />}
      <span>{pt ? `Página ${page}` : `Page ${page}`}</span>
      {hasNext
        ? <Link href={href(page + 1)}>{pt ? "Próxima" : "Next"}</Link>
        : <span />}
    </nav>
  );
}
