import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui";
import { UniversalStateView } from "@/features/experience/universal-state";
import { ProcessingView } from "@/features/processing/processing-view";
import { PaginationLinks } from "@/features/shell/pagination-links";
import { getTransparencyCopy } from "@/features/transparency/copy";
import { DataAiTabs } from "@/features/transparency/data-ai-tabs";
import { getVocabularyCopy } from "@/features/vocabulary/copy";
import { requireUser } from "@/lib/auth/require-user";
import { getOwnerTimeZone } from "@/features/profile/owner-timezone";
import { formatInstant } from "@/lib/time/instant-format";
import { pageRange, paginateRows, parsePage } from "@/lib/pagination";
import { isLocale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";

/**
 * Processamento — the third view of Dados e IA.
 *
 * ## The route did not move, and the word did
 *
 * `02-arquitetura-e-rotas.md`: *"Jobs" deixa de ser conceito de usuário: vira
 * "Processamento", alcançável a partir da falha.* The route stays `/app/jobs`
 * and the capability stays `visibility: "context-only"` with no navigation
 * label — which is the handoff's other requirement for it, and was already true.
 * What changed is the name the product says, and that this surface now wears the
 * strip placing it beside Atividade and Custos.
 *
 * ## What it may show, and what it must not
 *
 * `03-componentes.md`'s ProcessingTimeline says a user-facing surface *never
 * exposes a queue, an attempt or a job name*. This is not that surface: it is
 * the **advanced** view, reached from a failure or from Dados e IA, and its
 * whole purpose is the technical detail the rest of the product withholds. The
 * requirement it does obey is the one about error text — `jobs.error` is written
 * by the worker and is shown here and nowhere a casual reader lands.
 *
 * Every row is owner-scoped by RLS through the request-scoped client. Read-only:
 * this page has no write path, and the one retry control the product offers
 * lives on `/app/files`, beside the file it would retry.
 *
 * ## Editorial calmo (ADR-180)
 *
 * The page opens the way Histórico does — the strip, then its name — and then
 * answers *está tudo andando?* in one sentence. The rows follow in the order
 * they matter (`ProcessingView`): failed, in flight, and the finished ones
 * folded behind a count. The same read as before; nothing else is queried.
 */
export default async function JobsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const transparency = getTransparencyCopy(locale);
  const vocabulary = getVocabularyCopy(locale);
  const page = parsePage((await searchParams).page);
  const { from, to } = pageRange(page);
  const { supabase } = await requireUser(locale);
  // `LDC-CONTEXT-001`. The same accessor every other surface stamps from, so a
  // job's time and a record's time cannot land on two different days.
  const timeZone = await getOwnerTimeZone();
  const result = await supabase
    .from("jobs")
    .select("id,type,status,attempts,max_attempts,error,created_at")
    .order("created_at", { ascending: false })
    .range(from, to);
  const { items, hasNext } = paginateRows(requireSupabaseData(result, "load jobs") ?? []);

  return (
    <div className="content-page jobs-page">
      <DataAiTabs active="jobs" locale={locale} />

      <PageHeader size="compact" title={transparency.lenses.jobs} />

      {items.length ? (
        <ProcessingView
          formatWhen={(iso) => formatInstant(iso, "dayAndTime", locale, timeZone)}
          hasNext={hasNext}
          jobs={items}
          locale={locale}
          page={page}
        />
      ) : (
        <UniversalStateView
          className="ux-state-quiet"
          description={vocabulary.jobsEmptyBody}
          locale={locale}
          state="empty"
          title={vocabulary.jobsEmptyTitle}
        />
      )}

      <PaginationLinks locale={locale} path="jobs" page={page} hasNext={hasNext} />
    </div>
  );
}
