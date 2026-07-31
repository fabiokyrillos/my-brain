import { ArrowLeft, UserRound } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { updatePerson } from "@/features/entities/actions";
import { getEntityCopy } from "@/features/entities/copy";
import { EntityEditForm } from "@/features/entities/entity-edit-form";
import { loadOrganizationOptions } from "@/features/entities/organizations";
import { contextKindLabel, getVocabularyCopy, memoryKindLabel, taskStatusLabel } from "@/features/vocabulary/copy";
import { requireUser } from "@/lib/auth/require-user";
import { isLocale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";

export default async function PersonDetailPage({ params }: { params: Promise<{ locale: string; personId: string }> }) {
  const { locale: candidate, personId } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const pt = locale === "pt-BR";
  const copy = getEntityCopy(locale);
  const vocabulary = getVocabularyCopy(locale);
  const { supabase } = await requireUser(locale);
  const [
    personResult,
    taskLinkResult,
    projectLinkResult,
    entryLinkResult,
    memoryResult,
    relationshipResult,
    contextLinkResult,
    organizations,
  ] = await Promise.all([
    // `organization_id` joins the projection for the first time (UX-09).
    supabase.from("people").select("id,name,notes,organization_id,created_at,updated_at").eq("id", personId).maybeSingle(),
    supabase.from("task_people").select("task_id,role").eq("person_id", personId).limit(100),
    supabase.from("person_projects").select("project_id,role,valid_from,valid_until").eq("person_id", personId).is("valid_until", null).limit(100),
    supabase.from("entry_entities").select("entry_id").eq("entity_type", "person").eq("entity_id", personId).limit(100),
    supabase.from("memories").select("id,content,kind,important").eq("person_id", personId).order("important", { ascending: false }).limit(100),
    // Two relations the schema has modelled since `202607160009` and the page
    // has never shown (UX-09). Both are validity-scoped: a relationship that
    // ended is history, not the current answer to "who is this to me".
    supabase.from("person_relationships").select("id,relationship_type,description,valid_from,valid_until").eq("person_id", personId).is("valid_until", null).order("valid_from", { ascending: false }).limit(50),
    supabase.from("person_contexts").select("context_id,valid_until").eq("person_id", personId).is("valid_until", null).limit(50),
    loadOrganizationOptions(supabase),
  ]);
  const person = requireSupabaseData(personResult, "load person");
  const taskLinks = requireSupabaseData(taskLinkResult, "load person tasks") ?? [];
  const projectLinks = requireSupabaseData(projectLinkResult, "load person projects") ?? [];
  const entryLinks = requireSupabaseData(entryLinkResult, "load person timeline links") ?? [];
  const memories = requireSupabaseData(memoryResult, "load person memories") ?? [];
  const relationships = requireSupabaseData(relationshipResult, "load person relationships") ?? [];
  const contextLinks = requireSupabaseData(contextLinkResult, "load person contexts") ?? [];
  if (!person) notFound();

  const taskIds = taskLinks.map((item) => item.task_id);
  const projectIds = projectLinks.map((item) => item.project_id);
  const entryIds = entryLinks.map((item) => item.entry_id);
  const contextIds = contextLinks.map((item) => item.context_id);
  const [taskResult, projectResult, entryResult, contextResult] = await Promise.all([
    taskIds.length ? supabase.from("tasks").select("id,title,status,due_at").in("id", taskIds).order("updated_at", { ascending: false }).limit(100) : Promise.resolve({ data: [], error: null }),
    projectIds.length ? supabase.from("projects").select("id,name,status").in("id", projectIds).limit(100) : Promise.resolve({ data: [], error: null }),
    entryIds.length ? supabase.from("entries").select("id,original_content,occurred_at,is_retroactive").in("id", entryIds).order("occurred_at", { ascending: false }).limit(100) : Promise.resolve({ data: [], error: null }),
    contextIds.length ? supabase.from("contexts").select("id,name,kind").in("id", contextIds).limit(50) : Promise.resolve({ data: [], error: null }),
  ]);
  const tasks = requireSupabaseData(taskResult, "load related tasks") ?? [];
  const projects = requireSupabaseData(projectResult, "load related projects") ?? [];
  const entries = requireSupabaseData(entryResult, "load person timeline") ?? [];
  const contexts = requireSupabaseData(contextResult, "load person context names") ?? [];

  // `person_projects.role` was already read here and never rendered (UX-09):
  // "shared projects" said they were shared, not what this person does on them.
  const roleByProjectId = new Map(projectLinks.map((link) => [link.project_id, link.role]));
  const organizationName = organizations.find((item) => item.id === person.organization_id)?.name ?? null;
  const formatDate = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value));

  return (
    <div className="content-page entity-detail">
      <Link className="back-link" href={`/${locale}/app/people`}><ArrowLeft size={16} />{pt ? "Pessoas" : "People"}</Link>

      <header className="entity-hero">
        <UserRound size={28} />
        <div>
          <p className="eyebrow">{pt ? "PESSOA" : "PERSON"}</p>
          <h1>{person.name}</h1>
          <p>{person.notes ?? (pt ? "Contexto construído a partir das interações registradas." : "Context built from recorded interactions.")}</p>
          <p className="entity-relation-line">
            <span>{copy.company}</span>
            <strong>{organizationName ?? copy.companyNone}</strong>
          </p>
        </div>
      </header>

      <EntityEditForm
        action={updatePerson}
        fields={{
          kind: "person",
          id: person.id,
          name: person.name,
          notes: person.notes,
          organizationId: person.organization_id,
        }}
        locale={locale}
        organizations={organizations}
      />

      <div className="entity-columns">
        <section>
          <h2>{copy.relationships}</h2>
          {relationships.length ? (
            <div className="mini-list">
              {relationships.map((relationship) => (
                <article key={relationship.id}>
                  <strong>{relationship.relationship_type}</strong>
                  <span>
                    {relationship.description ?? `${copy.since} ${formatDate(relationship.valid_from)}`}
                  </span>
                </article>
              ))}
            </div>
          ) : <p className="quiet-state">{copy.relationshipsEmpty}</p>}
        </section>
        <section>
          <h2>{copy.contexts}</h2>
          {contexts.length ? (
            <div className="mini-list">
              {contexts.map((context) => (
                <article key={context.id}><strong>{context.name}</strong><span>{contextKindLabel(locale, context.kind) ?? vocabulary.unknownState}</span></article>
              ))}
            </div>
          ) : <p className="quiet-state">{copy.contextsEmpty}</p>}
        </section>
      </div>

      <div className="entity-columns">
        <section>
          <h2>{pt ? "Pendências e tarefas" : "Open work and tasks"}</h2>
          {tasks.length ? (
            <div className="mini-list">
              {tasks.map((task) => <article key={task.id}><strong>{task.title}</strong><span>{taskStatusLabel(locale, task.status) ?? vocabulary.unknownState}</span></article>)}
            </div>
          ) : <p className="quiet-state">{pt ? "Nenhuma tarefa vinculada." : "No linked tasks."}</p>}
        </section>
        <section>
          <h2>{pt ? "Projetos em comum" : "Shared projects"}</h2>
          {projects.length ? (
            <div className="mini-list">
              {projects.map((project) => (
                <Link href={`/${locale}/app/projects/${project.id}`} key={project.id}>
                  <strong>{project.name}</strong>
                  <span>{roleByProjectId.get(project.id) ?? copy.noRole}</span>
                </Link>
              ))}
            </div>
          ) : <p className="quiet-state">{pt ? "Nenhum projeto vinculado." : "No linked projects."}</p>}
        </section>
      </div>

      {memories.length > 0 && (
        <section className="entity-memory">
          <h2>{pt ? "Memórias" : "Memories"}</h2>
          {memories.map((memory) => (
            <article key={memory.id}><strong>{memory.content}</strong><span>{memoryKindLabel(locale, memory.kind) ?? vocabulary.unknownState}</span></article>
          ))}
        </section>
      )}

      <section className="entity-timeline">
        <h2>{pt ? "Linha do tempo" : "Timeline"}</h2>
        {entries.length ? (
          <div className="timeline-list">
            {entries.map((entry) => (
              <article key={entry.id}>
                <span className="timeline-dot" />
                <div>
                  <Link href={`/${locale}/app/inbox/${entry.id}`}><strong>{entry.original_content}</strong></Link>
                  <small>
                    {new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short" }).format(new Date(entry.occurred_at))}
                    {entry.is_retroactive ? ` · ${pt ? "adicionado depois" : "added later"}` : ""}
                  </small>
                </div>
              </article>
            ))}
          </div>
        ) : <p className="quiet-state">{pt ? "A linha do tempo começa na próxima menção." : "The timeline starts with the next mention."}</p>}
      </section>
    </div>
  );
}
