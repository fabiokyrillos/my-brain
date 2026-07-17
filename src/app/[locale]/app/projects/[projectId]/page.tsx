import { ArrowLeft, FolderKanban } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { isLocale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";

export default async function ProjectDetailPage({ params }: { params: Promise<{ locale: string; projectId: string }> }) {
  const { locale: candidate, projectId } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const pt = locale === "pt-BR";
  const { supabase } = await requireUser(locale);
  const [projectResult, taskLinkResult, personLinkResult, entryLinkResult] = await Promise.all([
    supabase.from("projects").select("id,name,description,status,created_at,updated_at").eq("id", projectId).maybeSingle(),
    supabase.from("task_projects").select("task_id").eq("project_id", projectId).limit(100),
    supabase.from("person_projects").select("person_id,role,valid_from,valid_until").eq("project_id", projectId).is("valid_until", null).limit(100),
    supabase.from("entry_entities").select("entry_id").eq("entity_type", "project").eq("entity_id", projectId).limit(100),
  ]);
  const project = requireSupabaseData(projectResult, "load project");
  const taskLinks = requireSupabaseData(taskLinkResult, "load project tasks") ?? [];
  const personLinks = requireSupabaseData(personLinkResult, "load project people") ?? [];
  const entryLinks = requireSupabaseData(entryLinkResult, "load project timeline links") ?? [];
  if (!project) notFound();

  const taskIds = taskLinks.map((item) => item.task_id);
  const personIds = personLinks.map((item) => item.person_id);
  const entryIds = entryLinks.map((item) => item.entry_id);
  const [taskResult, peopleResult, entryResult] = await Promise.all([
    taskIds.length ? supabase.from("tasks").select("id,title,status,due_at").in("id", taskIds).order("updated_at", { ascending: false }).limit(100) : Promise.resolve({ data: [], error: null }),
    personIds.length ? supabase.from("people").select("id,name").in("id", personIds).limit(100) : Promise.resolve({ data: [], error: null }),
    entryIds.length ? supabase.from("entries").select("id,original_content,occurred_at,is_retroactive").in("id", entryIds).order("occurred_at", { ascending: false }).limit(100) : Promise.resolve({ data: [], error: null }),
  ]);
  const tasks = requireSupabaseData(taskResult, "load related tasks") ?? [];
  const people = requireSupabaseData(peopleResult, "load related people") ?? [];
  const entries = requireSupabaseData(entryResult, "load project timeline") ?? [];

  return <div className="content-page entity-detail"><Link className="back-link" href={`/${locale}/app/projects`}><ArrowLeft size={16} />{pt ? "Projetos" : "Projects"}</Link><header className="entity-hero"><FolderKanban size={28} /><div><p className="eyebrow">{project.status.toUpperCase()}</p><h1>{project.name}</h1><p>{project.description ?? (pt ? "Contexto construído a partir dos seus registros." : "Context built from your entries.")}</p></div></header><div className="entity-columns"><section><h2>{pt ? "Tarefas" : "Tasks"}</h2>{tasks.length ? <div className="mini-list">{tasks.map((task) => <article key={task.id}><strong>{task.title}</strong><span>{task.status}</span></article>)}</div> : <p className="quiet-state">{pt ? "Nenhuma tarefa vinculada." : "No linked tasks."}</p>}</section><section><h2>{pt ? "Pessoas" : "People"}</h2>{people.length ? <div className="mini-list">{people.map((person) => <Link href={`/${locale}/app/people/${person.id}`} key={person.id}><strong>{person.name}</strong></Link>)}</div> : <p className="quiet-state">{pt ? "Nenhuma pessoa vinculada." : "No linked people."}</p>}</section></div><section className="entity-timeline"><h2>{pt ? "Linha do tempo" : "Timeline"}</h2>{entries.length ? <div className="timeline-list">{entries.map((entry) => <article key={entry.id}><span className="timeline-dot" /><div><Link href={`/${locale}/app/inbox/${entry.id}`}><strong>{entry.original_content}</strong></Link><small>{new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short" }).format(new Date(entry.occurred_at))}{entry.is_retroactive ? ` · ${pt ? "adicionado depois" : "added later"}` : ""}</small></div></article>)}</div> : <p className="quiet-state">{pt ? "A linha do tempo começa na próxima menção." : "The timeline starts with the next mention."}</p>}</section></div>;
}
