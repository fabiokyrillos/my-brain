import { ArrowLeft, FolderKanban } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createOrganizationForSubject, updateProject } from "@/features/entities/actions";
import { AssociationPanel } from "@/features/entities/association-panel";
import {
  associatePersonProject,
  endPersonProject,
  updatePersonProjectRole,
} from "@/features/entities/associations";
import { getEntityCopy } from "@/features/entities/copy";
import { EntityEditForm } from "@/features/entities/entity-edit-form";
import { loadOrganizationOptions } from "@/features/entities/organizations";
import { PROJECT_STATUSES, type ProjectStatus } from "@/features/entities/schema";
import { getVocabularyCopy, taskStatusLabel } from "@/features/vocabulary/copy";
import { requireUser } from "@/lib/auth/require-user";
import { isLocale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";

/** The column is `text` with a CHECK, so a value outside the four is a data fault, not a crash. */
function asProjectStatus(value: string): ProjectStatus {
  return (PROJECT_STATUSES as readonly string[]).includes(value) ? (value as ProjectStatus) : "active";
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ locale: string; projectId: string }> }) {
  const { locale: candidate, projectId } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const pt = locale === "pt-BR";
  const copy = getEntityCopy(locale);
  const vocabulary = getVocabularyCopy(locale);
  const { supabase } = await requireUser(locale);
  const [projectResult, taskLinkResult, personLinkResult, entryLinkResult, organizations, peopleOptionsResult] = await Promise.all([
    // `organization_id` joins the projection here for the first time: the column
    // has always existed and the page never read it (UX-08).
    supabase.from("projects").select("id,name,description,status,organization_id,created_at,updated_at").eq("id", projectId).maybeSingle(),
    supabase.from("task_projects").select("task_id").eq("project_id", projectId).limit(100),
    supabase.from("person_projects").select("person_id,role,valid_from,valid_until").eq("project_id", projectId).is("valid_until", null).limit(100),
    supabase.from("entry_entities").select("entry_id").eq("entity_type", "project").eq("entity_id", projectId).limit(100),
    loadOrganizationOptions(supabase),
    // EGC-ASSOC-008. Bounded at 200, the `relation-options.ts` precedent, and
    // owner-scoped by RLS. Loaded here because a client component cannot query.
    supabase.from("people").select("id,name").order("name").limit(200),
  ]);
  const project = requireSupabaseData(projectResult, "load project");
  const taskLinks = requireSupabaseData(taskLinkResult, "load project tasks") ?? [];
  const personLinks = requireSupabaseData(personLinkResult, "load project people") ?? [];
  const entryLinks = requireSupabaseData(entryLinkResult, "load project timeline links") ?? [];
  const peopleOptions = requireSupabaseData(peopleOptionsResult, "load people options") ?? [];
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

  // `person_projects.role` was already being read by this page and never
  // rendered (UX-08). Keyed by person so the People list can say what each one
  // does here rather than only that they are linked.
  const roleByPersonId = new Map(personLinks.map((link) => [link.person_id, link.role]));
  const organizationName = organizations.find((item) => item.id === project.organization_id)?.name ?? null;
  const status = asProjectStatus(project.status);

  return (
    <div className="content-page entity-detail">
      <Link className="back-link" href={`/${locale}/app/projects`}><ArrowLeft size={16} />{pt ? "Projetos" : "Projects"}</Link>

      <header className="entity-hero">
        <FolderKanban size={28} />
        <div>
          <p className="eyebrow">{copy.statuses[status].toUpperCase()}</p>
          <h1>{project.name}</h1>
          <p>{project.description ?? (pt ? "Contexto construído a partir dos seus registros." : "Context built from your entries.")}</p>
          <p className="entity-relation-line">
            <span>{copy.company}</span>
            <strong>{organizationName ?? copy.companyNone}</strong>
          </p>
        </div>
      </header>

      <EntityEditForm
        action={updateProject}
        createOrganizationAction={createOrganizationForSubject}
        fields={{
          kind: "project",
          id: project.id,
          name: project.name,
          description: project.description,
          status,
          organizationId: project.organization_id,
        }}
        locale={locale}
        organizations={organizations}
      />

      <div className="entity-columns">
        <section>
          <h2>{pt ? "Tarefas" : "Tasks"}</h2>
          {tasks.length ? (
            <div className="mini-list">
              {tasks.map((task) => <article key={task.id}><strong>{task.title}</strong><span>{taskStatusLabel(locale, task.status) ?? vocabulary.unknownState}</span></article>)}
            </div>
          ) : <p className="quiet-state">{pt ? "Nenhuma tarefa vinculada." : "No linked tasks."}</p>}
        </section>
        {/*
          EGC-ASSOC-003. The same `person_projects` row, written from the other
          side by the same module. Neither surface owns a private path, and
          `egc-invariants.test.ts` asserts the single writer in both directions —
          two paths is how a soft-end contract acquires a hard delete on the
          surface that forgot about it.
        */}
        <AssociationPanel
          addAction={associatePersonProject}
          endAction={endPersonProject}
          heading={copy.linkedPeople}
          locale={locale}
          options={peopleOptions.map((option) => ({ id: option.id, label: option.name }))}
          roleAction={updatePersonProjectRole}
          rows={people.map((person) => ({
            id: person.id,
            label: person.name,
            href: `/${locale}/app/people/${person.id}`,
            role: roleByPersonId.get(person.id) ?? null,
          }))}
          target={{ kind: "project-person", projectId: project.id }}
        />
      </div>

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
