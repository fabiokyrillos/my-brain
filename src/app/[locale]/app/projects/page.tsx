import { FolderKanban } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createRecord } from "@/features/operations/actions";
import { InlineCreateForm } from "@/features/operations/inline-create-form";
import { PaginationLinks } from "@/features/shell/pagination-links";
import { requireUser } from "@/lib/auth/require-user";
import { pageRange, paginateRows, parsePage } from "@/lib/pagination";
import { isLocale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";

export default async function ProjectsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ page?: string | string[] }> }) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const pt = locale === "pt-BR";
  const page = parsePage((await searchParams).page);
  const { from, to } = pageRange(page);
  const { supabase } = await requireUser(locale);
  const result = await supabase.from("projects").select("id,name,description,status,updated_at").neq("status", "archived").order("updated_at", { ascending: false }).range(from, to);
  const { items, hasNext } = paginateRows(requireSupabaseData(result, "load projects") ?? []);

  return <div className="content-page"><header className="list-header"><div><p className="eyebrow">{pt ? "CONTEXTO" : "CONTEXT"}</p><h1>{pt ? "Projetos" : "Projects"}</h1><p>{pt ? "Frentes ativas reconhecidas nas suas entradas ou criadas por você." : "Active workstreams recognized in your entries or created by you."}</p></div><InlineCreateForm action={createRecord} kind="project" locale={locale} /></header>{items.length ? <div className="list-stack">{items.map((project) => <Link href={`/${locale}/app/projects/${project.id}`} className="list-row" key={project.id}><div className="list-row-main"><strong>{project.name}</strong><p>{project.description ?? (pt ? "Projeto ativo" : "Active project")}</p></div><div className="list-meta"><span className={`status-badge ${project.status}`}>{project.status}</span></div></Link>)}</div> : <div className="empty-list"><FolderKanban size={30} /><strong>{pt ? "Nenhum projeto ainda" : "No projects yet"}</strong><p>{pt ? "Projetos citados nas capturas aparecem aqui automaticamente." : "Projects mentioned in captures appear here automatically."}</p></div>}<PaginationLinks locale={locale} path="projects" page={page} hasNext={hasNext} /></div>;
}
