import { ArrowLeft, UserRound } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { isLocale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";

export default async function PersonDetailPage({ params }: { params: Promise<{ locale: string; personId: string }> }) {
  const { locale: candidate, personId } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const pt = locale === "pt-BR";
  const { supabase } = await requireUser(locale);
  const [personResult, taskLinkResult, projectLinkResult, entryLinkResult, memoryResult] = await Promise.all([
    supabase.from("people").select("id,name,notes,created_at,updated_at").eq("id", personId).maybeSingle(),
    supabase.from("task_people").select("task_id,role").eq("person_id", personId).limit(100),
    supabase.from("person_projects").select("project_id,role,valid_from,valid_until").eq("person_id", personId).is("valid_until", null).limit(100),
    supabase.from("entry_entities").select("entry_id").eq("entity_type", "person").eq("entity_id", personId).limit(100),
    supabase.from("memories").select("id,content,kind,important").eq("person_id", personId).order("important", { ascending: false }).limit(100),
  ]);
  const person = requireSupabaseData(personResult, "load person");
  const taskLinks = requireSupabaseData(taskLinkResult, "load person tasks") ?? [];
  const projectLinks = requireSupabaseData(projectLinkResult, "load person projects") ?? [];
  const entryLinks = requireSupabaseData(entryLinkResult, "load person timeline links") ?? [];
  const memories = requireSupabaseData(memoryResult, "load person memories") ?? [];
  if (!person) notFound();

  const taskIds = taskLinks.map((item) => item.task_id);
  const projectIds = projectLinks.map((item) => item.project_id);
  const entryIds = entryLinks.map((item) => item.entry_id);
  const [taskResult, projectResult, entryResult] = await Promise.all([
    taskIds.length ? supabase.from("tasks").select("id,title,status,due_at").in("id", taskIds).order("updated_at", { ascending: false }).limit(100) : Promise.resolve({ data: [], error: null }),
    projectIds.length ? supabase.from("projects").select("id,name,status").in("id", projectIds).limit(100) : Promise.resolve({ data: [], error: null }),
    entryIds.length ? supabase.from("entries").select("id,original_content,occurred_at,is_retroactive").in("id", entryIds).order("occurred_at", { ascending: false }).limit(100) : Promise.resolve({ data: [], error: null }),
  ]);
  const tasks = requireSupabaseData(taskResult, "load related tasks") ?? [];
  const projects = requireSupabaseData(projectResult, "load related projects") ?? [];
  const entries = requireSupabaseData(entryResult, "load person timeline") ?? [];

  return <div className="content-page entity-detail"><Link className="back-link" href={`/${locale}/app/people`}><ArrowLeft size={16} />{pt ? "Pessoas" : "People"}</Link><header className="entity-hero"><UserRound size={28} /><div><p className="eyebrow">{pt ? "PESSOA" : "PERSON"}</p><h1>{person.name}</h1><p>{person.notes ?? (pt ? "Contexto construído a partir das interações registradas." : "Context built from recorded interactions.")}</p></div></header><div className="entity-columns"><section><h2>{pt ? "Pendências e tarefas" : "Open work and tasks"}</h2>{tasks.length ? <div className="mini-list">{tasks.map((task) => <article key={task.id}><strong>{task.title}</strong><span>{task.status}</span></article>)}</div> : <p className="quiet-state">{pt ? "Nenhuma tarefa vinculada." : "No linked tasks."}</p>}</section><section><h2>{pt ? "Projetos em comum" : "Shared projects"}</h2>{projects.length ? <div className="mini-list">{projects.map((project) => <Link href={`/${locale}/app/projects/${project.id}`} key={project.id}><strong>{project.name}</strong><span>{project.status}</span></Link>)}</div> : <p className="quiet-state">{pt ? "Nenhum projeto vinculado." : "No linked projects."}</p>}</section></div>{memories.length > 0 && <section className="entity-memory"><h2>{pt ? "Memórias" : "Memories"}</h2>{memories.map((memory) => <article key={memory.id}><strong>{memory.content}</strong><span>{memory.kind}</span></article>)}</section>}<section className="entity-timeline"><h2>{pt ? "Linha do tempo" : "Timeline"}</h2>{entries.length ? <div className="timeline-list">{entries.map((entry) => <article key={entry.id}><span className="timeline-dot" /><div><Link href={`/${locale}/app/inbox/${entry.id}`}><strong>{entry.original_content}</strong></Link><small>{new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short" }).format(new Date(entry.occurred_at))}{entry.is_retroactive ? ` · ${pt ? "adicionado depois" : "added later"}` : ""}</small></div></article>)}</div> : <p className="quiet-state">{pt ? "A linha do tempo começa na próxima menção." : "The timeline starts with the next mention."}</p>}</section></div>;
}
