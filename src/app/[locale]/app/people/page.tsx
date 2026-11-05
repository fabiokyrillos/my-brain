import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { UniversalStateView } from "@/features/experience/universal-state";
import { BrainLensTabs } from "@/features/library/brain-lenses";
import { getLibraryCopy } from "@/features/library/copy";
import { createRecord } from "@/features/operations/actions";
import { InlineCreateForm } from "@/features/operations/inline-create-form";
import { PaginationLinks } from "@/features/shell/pagination-links";
import { requireUser } from "@/lib/auth/require-user";
import { pageRange, paginateRows, parsePage } from "@/lib/pagination";
import { isLocale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";

export default async function PeoplePage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ page?: string | string[] }> }) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const copy = getLibraryCopy(locale).lists.people;
  const page = parsePage((await searchParams).page);
  const { from, to } = pageRange(page);
  const { supabase } = await requireUser(locale);
  // `2N-PRIVACY-010`, ADR-110 Decision 5: `notes` is **not selected**. It used to
  // be this row's subtitle, which made a listing of every person an indirect
  // surface printing free text about each of them in full. Not fetching it is
  // stronger than fetching and withholding it — there is no value left on the
  // page for a later edit to start rendering again, and none in the RSC payload.
  const result = await supabase.from("people").select("id,name,updated_at").order("updated_at", { ascending: false }).range(from, to);
  const { items, hasNext } = paginateRows(requireSupabaseData(result, "load people") ?? []);

  // Pessoas is a lens of Brain, at the URL it has always had (Life Brain A.5:
  // the shared compact header, no eyebrow). The strip sits
  // below the page's own `<h1>` so the heading order stays the document's
  // subject first -- the failure `/app/reviews` shipped and part three repaired.
  return <div className="content-page"><PageHeader actions={<InlineCreateForm action={createRecord} kind="person" locale={locale} />} className="list-page-header" description={copy.description} size="compact" title={copy.title} /><BrainLensTabs active="people" locale={locale} />{items.length ? <div className="list-stack">{items.map((person) => <Link href={`/${locale}/app/people/${person.id}`} className="list-row" key={person.id}><div className="list-row-main"><strong>{person.name}</strong><p>{copy.rowMeta}</p></div></Link>)}</div> : <UniversalStateView className="ux-state-quiet" description={copy.emptyBody} locale={locale} state="empty" title={copy.emptyTitle} />}<PaginationLinks locale={locale} path="people" page={page} hasNext={hasNext} /></div>;
}
