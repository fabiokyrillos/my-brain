import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { UniversalStateView } from "@/features/experience/universal-state";
import { BrainLensTabs } from "@/features/library/brain-lenses";
import { getLibraryCopy } from "@/features/library/copy";
import { createRecord } from "@/features/operations/actions";
import { InlineCreateForm } from "@/features/operations/inline-create-form";
import { PaginationLinks } from "@/features/shell/pagination-links";
import { getVocabularyCopy, projectStatusLabel } from "@/features/vocabulary/copy";
import { requireUser } from "@/lib/auth/require-user";
import { pageRange, paginateRows, parsePage } from "@/lib/pagination";
import { isLocale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";

export default async function ProjectsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ page?: string | string[] }> }) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const copy = getLibraryCopy(locale).lists.projects;
  const page = parsePage((await searchParams).page);
  const { from, to } = pageRange(page);
  const { supabase } = await requireUser(locale);
  const result = await supabase.from("projects").select("id,name,description,status,updated_at").neq("status", "archived").order("updated_at", { ascending: false }).range(from, to);
  const { items, hasNext } = paginateRows(requireSupabaseData(result, "load projects") ?? []);

  // A lens of Brain, at its own URL. See `people/page.tsx` on why the strip
  // follows the `<h1>` rather than preceding it.
  return <div className="content-page"><PageHeader actions={<InlineCreateForm action={createRecord} kind="project" locale={locale} />} className="list-page-header" description={copy.description} size="compact" title={copy.title} /><BrainLensTabs active="projects" locale={locale} />{items.length ? <div className="list-stack">{items.map((project) => <Link href={`/${locale}/app/projects/${project.id}`} className="list-row" key={project.id}><div className="list-row-main"><strong>{project.name}</strong><p>{project.description ?? copy.rowFallback}</p></div><div className="list-meta"><span className={`status-badge ${project.status}`}>{projectStatusLabel(locale, project.status) ?? getVocabularyCopy(locale).unknownState}</span></div></Link>)}</div> : <UniversalStateView className="ux-state-quiet" description={copy.emptyBody} locale={locale} state="empty" title={copy.emptyTitle} />}<PaginationLinks locale={locale} path="projects" page={page} hasNext={hasNext} /></div>;
}
