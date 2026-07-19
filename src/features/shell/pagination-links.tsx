import Link from "next/link";
import type { Locale } from "@/lib/preferences";

export function PaginationLinks({
  locale,
  path,
  page,
  hasNext,
  query,
}: {
  locale: Locale;
  path: string;
  page: number;
  hasNext: boolean;
  query?: Readonly<Record<string, string>>;
}) {
  if (page === 1 && !hasNext) return null;
  const pt = locale === "pt-BR";
  const href = (targetPage: number) => {
    const parameters = new URLSearchParams(query);
    parameters.set("page", String(targetPage));
    return `/${locale}/app/${path}?${parameters.toString()}`;
  };

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
