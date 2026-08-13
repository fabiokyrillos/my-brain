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
import { BoundedNotice } from "@/features/bounds/bounded-notice";
import { boundedList, CONTEXTUAL_LIMIT, PICKER_LIMIT, withProbe } from "@/features/bounds/contracts";
import { getEntityCopy } from "@/features/entities/copy";
import { EntityEditForm } from "@/features/entities/entity-edit-form";
import { ProtectedContent } from "@/features/operations/protected-content";
import { deriveSubjectSensitivity, readableLevelsOf } from "@/features/sensitivity/subject-derivation";
import { deriveTaskSensitivity } from "@/features/sensitivity/task-derivation";
import { loadOrganizationOptions } from "@/features/entities/organizations";
import { PROJECT_STATUSES, type ProjectStatus } from "@/features/entities/schema";
import { getVocabularyCopy, taskStatusLabel } from "@/features/vocabulary/copy";
import { requireUser } from "@/lib/auth/require-user";
import { getOwnerTimeZone } from "@/features/profile/owner-timezone";
import { formatInstant } from "@/lib/time/instant-format";
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
  // `LDC-CONTEXT-001`. One accessor, cached per request: this page and every
  // other contextual surface stamp instants from the same source.
  const timeZone = await getOwnerTimeZone();
  const [projectResult, taskLinkResult, personLinkResult, entryLinkResult, organizations, peopleOptionsResult] = await Promise.all([
    // `organization_id` joins the projection here for the first time: the column
    // has always existed and the page never read it (UX-08).
    supabase.from("projects").select("id,name,description,status,organization_id,created_at,updated_at").eq("id", projectId).maybeSingle(),
    // `2N-PROJECT-006`, stated exactly as `2N-PERSON-003`: one row more than will
    // be shown, so a truncation can be reported instead of guessed.
    supabase.from("task_projects").select("task_id").eq("project_id", projectId).limit(withProbe(CONTEXTUAL_LIMIT)),
    supabase.from("person_projects").select("person_id,role,valid_from,valid_until").eq("project_id", projectId).is("valid_until", null).limit(withProbe(CONTEXTUAL_LIMIT)),
    supabase.from("entry_entities").select("entry_id").eq("entity_type", "project").eq("entity_id", projectId).limit(withProbe(CONTEXTUAL_LIMIT)),
    loadOrganizationOptions(supabase),
    // EGC-ASSOC-008. Bounded at 200, the `relation-options.ts` precedent, and
    // owner-scoped by RLS. Loaded here because a client component cannot query.
    supabase.from("people").select("id,name").order("name").limit(PICKER_LIMIT),
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
    // `source_entry_id` and `sensitivity` join these projections for the same
    // reason they do on the person page: a task's level is derived from the entry
    // it came from, and an entry's level travels with its content.
    taskIds.length ? supabase.from("tasks").select("id,title,status,due_at,source_entry_id").in("id", taskIds).order("updated_at", { ascending: false }).limit(withProbe(CONTEXTUAL_LIMIT)) : Promise.resolve({ data: [], error: null }),
    personIds.length ? supabase.from("people").select("id,name").in("id", personIds).limit(withProbe(CONTEXTUAL_LIMIT)) : Promise.resolve({ data: [], error: null }),
    entryIds.length ? supabase.from("entries").select("id,original_content,occurred_at,is_retroactive,sensitivity").in("id", entryIds).order("occurred_at", { ascending: false }).limit(withProbe(CONTEXTUAL_LIMIT)) : Promise.resolve({ data: [], error: null }),
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

  /*
   * The same two-read, one-map shape the person page uses, and for the same
   * reason: a task's source entry is often not one of the entries that mention
   * this project, and two maps would mean two ways for a lookup to miss.
   */
  const timelineLevels = readableLevelsOf(entries);
  const missingSourceIds = Array.from(
    new Set(
      tasks
        .map((task) => task.source_entry_id)
        .filter((id): id is string => Boolean(id) && !timelineLevels.has(id as string)),
    ),
  );
  const sourceResult = missingSourceIds.length
    ? await supabase.from("entries").select("id,sensitivity").in("id", missingSourceIds)
    : { data: [], error: null };
  const entryLevels = new Map(timelineLevels);
  for (const [id, level] of readableLevelsOf(sourceResult.data)) entryLevels.set(id, level);

  const boundedTasks = boundedList(tasks, CONTEXTUAL_LIMIT);
  const boundedEntries = boundedList(entries, CONTEXTUAL_LIMIT);

  return (
    <div className="content-page entity-detail">
      <Link className="back-link" href={`/${locale}/app/projects`}><ArrowLeft size={16} />{pt ? "Projetos" : "Projects"}</Link>

      <header className="entity-hero">
        <FolderKanban size={28} />
        <div>
          <p className="eyebrow">{copy.statuses[status].toUpperCase()}</p>
          <h1>{project.name}</h1>
          {/*
            `description` stays visible, and the reason is worth stating so a
            later reader does not take its absence from the mask as an oversight.
            ADR-110 Decision 4 masks `people.notes` because it is free text about
            a **human being** carrying no classification, and `2N-PRIVACY-008`
            extends that to "any field of that shape". A project's description is
            not of that shape — it describes work, not a person — and search
            deliberately keeps matching and snippeting it, so masking it here
            would leave the product saying two different things about one column.
            If that judgement is wrong it is a decision for the owner, not a
            widening this slice performs on its own.
          */}
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
          {boundedTasks.items.length ? (
            <div className="mini-list">
              {boundedTasks.items.map((task) => (
                <article key={task.id}>
                  <ProtectedContent
                    locale={locale}
                    revealKey={`project-task-${task.id}`}
                    sensitivity={deriveTaskSensitivity(task.source_entry_id, entryLevels)}
                    surface="project"
                  >
                    <strong>{task.title}</strong>
                  </ProtectedContent>
                  <span>{taskStatusLabel(locale, task.status) ?? vocabulary.unknownState}</span>
                </article>
              ))}
            </div>
          ) : <p className="quiet-state">{pt ? "Nenhuma tarefa vinculada." : "No linked tasks."}</p>}
          <BoundedNotice list={boundedTasks} locale={locale} />
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
        {boundedEntries.items.length ? (
          <div className="timeline-list">
            {boundedEntries.items.map((entry) => (
              <article key={entry.id}>
                <span className="timeline-dot" />
                <div>
                  <ProtectedContent
                    href={`/${locale}/app/inbox/${entry.id}`}
                    locale={locale}
                    revealKey={`project-entry-${entry.id}`}
                    sensitivity={deriveSubjectSensitivity(entry.id, entryLevels)}
                    surface="project"
                  >
                    <Link href={`/${locale}/app/inbox/${entry.id}`}><strong>{entry.original_content}</strong></Link>
                  </ProtectedContent>
                  <small>
                    {formatInstant(entry.occurred_at, "dayAndTime", locale, timeZone)}
                    {entry.is_retroactive ? ` · ${pt ? "adicionado depois" : "added later"}` : ""}
                  </small>
                </div>
              </article>
            ))}
          </div>
        ) : <p className="quiet-state">{pt ? "A linha do tempo começa na próxima menção." : "The timeline starts with the next mention."}</p>}
        <BoundedNotice list={boundedEntries} locale={locale} />
      </section>
    </div>
  );
}
