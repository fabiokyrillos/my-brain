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
import {
  boundedList,
  CONTEXTUAL_LIMIT,
  PICKER_LIMIT,
  RECENT_CHANGE_LIMIT,
  withProbe,
} from "@/features/bounds/contracts";
import { loadLinksForEntity } from "@/features/library/attachment-links";
import { ATTACHMENT_LINK_LIMIT } from "@/features/library/link-contracts";
import { LinkedFilesSection } from "@/features/library/linked-subjects-section";
import { resolveLinkedFiles, type ResolvedFileRow } from "@/features/library/linked-subjects";
import { getEntityCopy } from "@/features/entities/copy";
import { EntityEditForm } from "@/features/entities/entity-edit-form";
import {
  decisionEntryIds,
  deriveProjectState,
  describeProjectChanges,
} from "@/features/entities/project-context";
import { getHistoryCopy } from "@/features/history/copy";
import { HistoryList } from "@/features/history/history-list";
import { ProtectedContent } from "@/features/operations/protected-content";
import { getAgentName } from "@/features/profile/agent-identity";
import { deriveClaimProvenance, isOpenable, resolvableEntryIdsOf } from "@/features/provenance/contracts";
import { getProvenanceCopy } from "@/features/provenance/copy";
import { ProvenanceNote, SectionOriginNote } from "@/features/provenance/provenance-note";
import { deriveSubjectSensitivity, readableLevelsOf } from "@/features/sensitivity/subject-derivation";
import { deriveTaskSensitivity } from "@/features/sensitivity/task-derivation";
import { loadOrganizationOptions } from "@/features/entities/organizations";
import { PROJECT_STATUSES, type ProjectStatus } from "@/features/entities/schema";
import { attachmentStatusLabel, getVocabularyCopy, memoryKindLabel, taskStatusLabel } from "@/features/vocabulary/copy";
import { requireUser } from "@/lib/auth/require-user";
import { getOwnerTimeZone } from "@/features/profile/owner-timezone";
import { DeleteEntityControl } from "@/features/deletion/delete-entity-control";
import { formatInstant } from "@/lib/time/instant-format";
import { isLocale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";

/** The column is `text` with a CHECK, so a value outside the four is a data fault, not a crash. */
function asProjectStatus(value: string): ProjectStatus {
  return (PROJECT_STATUSES as readonly string[]).includes(value) ? (value as ProjectStatus) : "active";
}

/**
 * The audit columns this page reads, and deliberately not `reason`.
 *
 * `reason` is free text every writer fills with a restatement of the localized
 * sentence, and the History surface stopped rendering it for that reason
 * (UX-28). Not selecting it is stronger than not printing it: it never reaches
 * the RSC payload.
 */
const CHANGE_SELECT = "id,action_type,entity_type,entity_id,actor,before_state,after_state,created_at";

export default async function ProjectDetailPage({ params }: { params: Promise<{ locale: string; projectId: string }> }) {
  const { locale: candidate, projectId } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const copy = getEntityCopy(locale);
  const provenanceCopy = getProvenanceCopy(locale);
  const vocabulary = getVocabularyCopy(locale);
  const [{ supabase, user }, agentName] = await Promise.all([requireUser(locale), getAgentName()]);
  const historyCopy = getHistoryCopy(locale, agentName);
  // `LDC-CONTEXT-001`. One accessor, cached per request: this page and every
  // other contextual surface stamp instants from the same source.
  const timeZone = await getOwnerTimeZone();
  const [
    projectResult,
    taskLinkResult,
    personLinkResult,
    associationIdResult,
    entryLinkResult,
    memoryResult,
    projectChangeResult,
    organizations,
    peopleOptionsResult,
    fileLinkOutcome,
  ] = await Promise.all([
    // `organization_id` joins the projection here for the first time: the column
    // has always existed and the page never read it (UX-08).
    supabase.from("projects").select("id,name,description,status,organization_id,created_at,updated_at").eq("id", projectId).maybeSingle(),
    // `2N-PROJECT-006`, stated exactly as `2N-PERSON-003`: one row more than will
    // be shown, so a truncation can be reported instead of guessed.
    supabase.from("task_projects").select("task_id").eq("project_id", projectId).limit(withProbe(CONTEXTUAL_LIMIT)),
    supabase.from("person_projects").select("person_id,role,valid_from,valid_until").eq("project_id", projectId).is("valid_until", null).limit(withProbe(CONTEXTUAL_LIMIT)),
    /*
     * `2N-PROJECT-004`. The ids of every association this project has ever had,
     * **including the ended ones**, because that is what an audit row points at:
     * `associations.ts` records the junction row's own id, and ending a link
     * sets `valid_until` rather than deleting the row.
     *
     * A separate read rather than dropping the filter above, which would have
     * let a project with a long history of ended links starve its own People
     * panel of live rows inside the same bound.
     */
    supabase.from("person_projects").select("id").eq("project_id", projectId).limit(withProbe(CONTEXTUAL_LIMIT)),
    supabase.from("entry_entities").select("entry_id").eq("entity_type", "project").eq("entity_id", projectId).limit(withProbe(CONTEXTUAL_LIMIT)),
    /*
     * `memories.project_id` gains its first reader on this surface. The column
     * has existed since `202607160006` and the project page never looked at it,
     * so a memory the owner recorded about a project was reachable only from the
     * person it also mentioned, or not at all.
     *
     * `confidence` is **not** selected, exactly as on the person page
     * (`2N-RELATION-005`): the column is filled with a constant by its writers,
     * and a value absent from the projection cannot be rendered as certainty by
     * a later edit.
     */
    supabase.from("memories").select("id,content,kind,important,sensitivity,source_entry_id").eq("project_id", projectId).order("important", { ascending: false }).limit(withProbe(CONTEXTUAL_LIMIT)),
    // Owner-scoped twice: `user_id` in the predicate and RLS on the session.
    // The pair also lands on `audit_logs_user_entity_idx`.
    supabase.from("audit_logs").select(CHANGE_SELECT).eq("user_id", user.id).eq("entity_type", "project").eq("entity_id", projectId).order("created_at", { ascending: false }).limit(withProbe(RECENT_CHANGE_LIMIT)),
    loadOrganizationOptions(supabase),
    // EGC-ASSOC-008. Bounded at 200, the `relation-options.ts` precedent, and
    // owner-scoped by RLS. Loaded here because a client component cannot query.
    supabase.from("people").select("id,name").order("name").limit(PICKER_LIMIT),
    /*
     * `2N-FILES-009`, the same reader the person page mounts and deliberately
     * not a second implementation: the loader, the bound, the collapse of
     * removed/foreign/unreadable and the three rendered states are all shared,
     * so a file linked to a project and a file linked to a person cannot end up
     * described two different ways.
     */
    loadLinksForEntity(supabase, "project", projectId),
  ]);
  const project = requireSupabaseData(projectResult, "load project");
  const taskLinks = requireSupabaseData(taskLinkResult, "load project tasks") ?? [];
  const personLinks = requireSupabaseData(personLinkResult, "load project people") ?? [];
  const associationIds = (requireSupabaseData(associationIdResult, "load project association ids") ?? []).map((row) => row.id);
  const entryLinks = requireSupabaseData(entryLinkResult, "load project timeline links") ?? [];
  const memories = requireSupabaseData(memoryResult, "load project memories") ?? [];
  const projectChanges = requireSupabaseData(projectChangeResult, "load project changes") ?? [];
  const peopleOptions = requireSupabaseData(peopleOptionsResult, "load people options") ?? [];
  if (!project) notFound();

  const taskIds = taskLinks.map((item) => item.task_id);
  const personIds = personLinks.map((item) => item.person_id);
  const entryIds = entryLinks.map((item) => item.entry_id);
  const fileLinks = fileLinkOutcome.status === "ok" ? fileLinkOutcome.list.items : [];
  const linkedFileIds = fileLinks.map((link) => link.attachmentId);
  const [taskResult, peopleResult, entryResult, associationChangeResult, attachmentResult] = await Promise.all([
    // `source_entry_id` and `sensitivity` join these projections for the same
    // reason they do on the person page: a task's level is derived from the entry
    // it came from, and an entry's level travels with its content.
    taskIds.length ? supabase.from("tasks").select("id,title,status,due_at,source_entry_id").in("id", taskIds).order("updated_at", { ascending: false }).limit(withProbe(CONTEXTUAL_LIMIT)) : Promise.resolve({ data: [], error: null }),
    personIds.length ? supabase.from("people").select("id,name").in("id", personIds).limit(withProbe(CONTEXTUAL_LIMIT)) : Promise.resolve({ data: [], error: null }),
    // `current_interpretation_id` joins this projection for `2N-PROJECT-005`: a
    // decision is read from the interpretation that is current, so a reading the
    // owner has since corrected cannot resurface as one.
    entryIds.length ? supabase.from("entries").select("id,original_content,occurred_at,is_retroactive,sensitivity,current_interpretation_id").in("id", entryIds).order("occurred_at", { ascending: false }).limit(withProbe(CONTEXTUAL_LIMIT)) : Promise.resolve({ data: [], error: null }),
    associationIds.length ? supabase.from("audit_logs").select(CHANGE_SELECT).eq("user_id", user.id).eq("entity_type", "person_project").in("entity_id", associationIds).order("created_at", { ascending: false }).limit(withProbe(RECENT_CHANGE_LIMIT)) : Promise.resolve({ data: [], error: null }),
    // The same projection the library and the person page read, for the reason
    // `2N-FILES-004` states: a file name is governed content, so its
    // classification travels with it rather than being fetched again later.
    linkedFileIds.length ? supabase.from("attachments").select("id,original_name,status,sensitivity").in("id", linkedFileIds) : Promise.resolve({ data: [], error: null }),
  ]);
  const tasks = requireSupabaseData(taskResult, "load related tasks") ?? [];
  const people = requireSupabaseData(peopleResult, "load related people") ?? [];
  const entries = requireSupabaseData(entryResult, "load project timeline") ?? [];
  const associationChanges = requireSupabaseData(associationChangeResult, "load association changes") ?? [];

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
   *
   * Memories join tasks here for `2N-PROV-001`. Both tables carry
   * `source_entry_id`, and a memory about this project is no more likely than a
   * task to have come from an entry that mentions it.
   */
  const timelineLevels = readableLevelsOf(entries);
  const declaredSourceIds = Array.from(
    new Set(
      [...tasks.map((task) => task.source_entry_id), ...memories.map((memory) => memory.source_entry_id)]
        .filter((id): id is string => Boolean(id) && !timelineLevels.has(id as string)),
    ),
  );
  const currentInterpretationIds = entries
    .map((entry) => entry.current_interpretation_id)
    .filter((id): id is string => Boolean(id));
  const [sourceResult, interpretationResult] = await Promise.all([
    declaredSourceIds.length
      ? supabase.from("entries").select("id,sensitivity").in("id", declaredSourceIds)
      : Promise.resolve({ data: [], error: null }),
    // Only `concepts` — no summary, no confidence. The section says *that* a
    // record was read as a decision and links to the record; restating the
    // model's summary here would put an interpretation on the page as prose.
    currentInterpretationIds.length
      ? supabase.from("entry_interpretations").select("id,entry_id,concepts").in("id", currentInterpretationIds).limit(withProbe(CONTEXTUAL_LIMIT))
      : Promise.resolve({ data: [], error: null }),
  ]);
  // A failed read is NOT treated as an empty result: rows that do not arrive stay
  // absent from the map, which is the most-protective arm.
  const entryLevels = new Map(timelineLevels);
  for (const [id, level] of readableLevelsOf(sourceResult.data)) entryLevels.set(id, level);
  const memoryLevels = readableLevelsOf(memories);

  /*
   * The entries this page may offer to OPEN — built from rows that actually came
   * back, never from the ids that were asked for. An id the query requested and
   * did not return is removed, foreign or unreadable, and offering a link for it
   * would both 404 and confirm the id exists.
   */
  const resolvableEntryIds = new Set([
    ...resolvableEntryIdsOf(entries),
    ...resolvableEntryIdsOf(sourceResult.data),
  ]);

  // Both hops carry the bound, as on the person page: a link whose row does not
  // resolve would otherwise make a truncated list look complete.
  const boundedTasks = boundedList(tasks, CONTEXTUAL_LIMIT, taskLinks.length > CONTEXTUAL_LIMIT);
  const boundedEntries = boundedList(entries, CONTEXTUAL_LIMIT, entryLinks.length > CONTEXTUAL_LIMIT);
  const boundedMemories = boundedList(memories, CONTEXTUAL_LIMIT);
  /*
   * The linked-people list had the same defect the person page had in three
   * places: fetched with `withProbe`, then handed to the panel untrimmed, so at
   * 101 linked people it rendered the probe row and claimed to be complete.
   * Fixed in PR #205 rather than deferred to this slice - the panel now requires
   * its bound, so this is what the surface needs to keep compiling.
   */
  const boundedPeople = boundedList(people, CONTEXTUAL_LIMIT, personLinks.length > CONTEXTUAL_LIMIT);

  /*
   * `2N-FILES-005`/`-009`. Resolved from attachment rows that came back, never
   * from the ids the links named — a removed, foreign or unreadable attachment
   * is absent from this map and therefore absent from the section, which is the
   * same collapse every other list on this page performs.
   */
  const linkedFileRows = new Map<string, ResolvedFileRow>();
  const linkedFileLevels = readableLevelsOf(attachmentResult.data);
  for (const attachment of attachmentResult.data ?? []) {
    linkedFileRows.set(attachment.id, {
      name: attachment.original_name,
      status: attachment.status,
      sensitivity: deriveSubjectSensitivity(attachment.id, linkedFileLevels),
    });
  }
  const boundedFiles = boundedList(
    resolveLinkedFiles(fileLinks, linkedFileRows),
    ATTACHMENT_LINK_LIMIT,
    fileLinkOutcome.status === "ok" && fileLinkOutcome.list.bounded,
  );

  const formatDateTime = (iso: string) => formatInstant(iso, "dayAndTime", locale, timeZone) ?? "";
  const changeEvents = describeProjectChanges(
    [...projectChanges, ...associationChanges],
    historyCopy,
    formatDateTime,
  );
  /*
   * Two bounded reads merged. Each was ordered `created_at desc` under its own
   * limit, so the newest `RECENT_CHANGE_LIMIT` of the union is exactly what the
   * merge holds — but either source may have truncated while the merged list is
   * short of its own limit, which is the `upstreamBounded` case.
   *
   * `associationIds` is a **third** hop and carries the bound too. It is read
   * under `CONTEXTUAL_LIMIT`, so a project with more than a hundred association
   * rows in its whole history would leave some of them unqueried — and their
   * changes would be missing from a list that otherwise looked complete. That is
   * the same silent truncation one hop further out.
   */
  const boundedChanges = boundedList(
    changeEvents,
    RECENT_CHANGE_LIMIT,
    projectChanges.length > RECENT_CHANGE_LIMIT
      || associationChanges.length > RECENT_CHANGE_LIMIT
      || associationIds.length > CONTEXTUAL_LIMIT,
  );

  /*
   * `2N-PROJECT-005`. Derived from the entries this page already read, so the
   * decisions list inherits the timeline's bound rather than measuring one of
   * its own — its own overflow is impossible, since it is a subset of a list
   * that was already trimmed.
   */
  /*
   * A failed read must NOT become "no entry was read as a decision".
   *
   * `sourceResult` above deliberately reads `.data` directly, because a row that
   * does not arrive stays absent from the levels map and lands in the
   * most-protective arm — failing closed. This read has the opposite shape: an
   * empty result renders an empty-state sentence that *asserts* something about
   * the readings, so swallowing an error here would turn "we could not look"
   * into "there are none". `requireSupabaseData` is the posture every other list
   * on this page already takes.
   */
  const decisionIds = decisionEntryIds(
    requireSupabaseData(interpretationResult, "load project interpretations"),
  );
  const boundedDecisions = boundedList(
    boundedEntries.items.filter((entry) => decisionIds.has(entry.id)),
    CONTEXTUAL_LIMIT,
    boundedEntries.bounded,
  );

  const state = deriveProjectState({ tasks: boundedTasks, entries: boundedEntries });

  /*
   * `2N-PERSON-006`, `2N-PROV-003` — opening a source must not cost the reader
   * their place. Every row that can open one carries a stable anchor, and the
   * link hands that anchor to the entry page as `back`.
   *
   * The anchor is built from ids already in the URL or already public on the
   * page — never from content, which would put a masked string into the address
   * bar and the browser's history.
   */
  const sourceHref = (entryId: string, anchor: string) =>
    `/${locale}/app/inbox/${entryId}?back=${encodeURIComponent(`/${locale}/app/projects/${project.id}#${anchor}`)}`;

  return (
    <div className="content-page entity-detail">
      <Link className="back-link" href={`/${locale}/app/projects`}><ArrowLeft size={16} />{copy.allProjects}</Link>

      <header className="entity-hero">
        <FolderKanban size={28} />
        <div>
          <p className="eyebrow">{copy.statuses[status].toUpperCase()}</p>
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
          <h1>{project.name}</h1>
          <p>{project.description ?? copy.projectContextFallback}</p>
          <p className="entity-relation-line">
            <span>{copy.company}</span>
            <strong>{organizationName ?? copy.companyNone}</strong>
          </p>
          {/*
            `2N-PROJECT-003` — the state, said in one line, from three records
            that already exist: the project's own status, how many linked tasks
            are still open, and when the most recent linked entry happened.

            No new vocabulary: the status word is the stored `check` literal's
            label, and "em aberto" is what the Work filters already print for the
            same set of statuses.

            The count is separated into two strings rather than one with a
            prefix, because under a bound the only true sentence is "at least N" —
            the rows the limit dropped may hold further open tasks, and a bare
            number there would state a total nobody counted.
          */}
          <p className="entity-state-line" data-project-state="true">
            <span>{copy.stateLabel}</span>
            <strong>{copy.statuses[status]}</strong>
            <span data-open-commitments={state.openTasksAtLeast ? "at-least" : "exact"}>
              {state.openTasks === 0 && !state.openTasksAtLeast
                ? copy.noOpenCommitments
                : state.openTasksAtLeast
                  ? copy.openCommitmentsAtLeast(state.openTasks)
                  : copy.openCommitments(state.openTasks)}
            </span>
            <span>
              {state.lastEntryAt === null
                ? copy.noEntriesYet
                : copy.lastEntry(formatInstant(state.lastEntryAt, "day", locale, timeZone) ?? "")}
            </span>
          </p>
          {/*
            `2N-PERSON-004` applied to this surface: everything in this header —
            the name, the description, the company — is a field the owner typed
            into the form directly below. `projects` carries no `source_entry_id`,
            so there is no record to trace it to and none is invented. The state
            line is the one derived thing here, and it says only what the two
            lists below it show.
          */}
          <SectionOriginNote locale={locale} origin="persisted" />
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
          <h2>{copy.linkedTasks}</h2>
          {/*
            Derived: this list is assembled at render from `task_projects` and
            `tasks`, and the task itself is edited on Work, not here. Saying so is
            what stops the reader looking for an edit control that was never
            meant to be on this page.
          */}
          <SectionOriginNote locale={locale} origin="derived" />
          {boundedTasks.items.length ? (
            <div className="mini-list">
              {boundedTasks.items.map((task, index) => {
                /*
                 * Derived ONCE and asked about, rather than the resolvability
                 * test being re-implemented in the `href` — two answers to one
                 * question drift the moment the contract gains a condition,
                 * leaving a page that offers a link to a claim it simultaneously
                 * labels unsourced.
                 */
                const provenance = deriveClaimProvenance(task.source_entry_id, resolvableEntryIds);
                return (
                  <article id={`task-${task.id}`} key={task.id}>
                    <ProtectedContent
                      locale={locale}
                      revealKey={`project-task-${task.id}`}
                      sensitivity={deriveTaskSensitivity(task.source_entry_id, entryLevels)}
                      surface="project"
                    >
                      <strong>{task.title}</strong>
                    </ProtectedContent>
                    <span>{taskStatusLabel(locale, task.status) ?? vocabulary.unknownState}</span>
                    {/*
                      `subject` is positional, never the title. The title is what
                      `ProtectedContent` above may be withholding, and an
                      `aria-label` carrying it would hand the masked string to
                      assistive technology and to the DOM.
                    */}
                    <ProvenanceNote
                      href={isOpenable(provenance) ? sourceHref(provenance.entryId, `task-${task.id}`) : undefined}
                      locale={locale}
                      provenance={provenance}
                      subject={provenanceCopy.taskSubject(index + 1)}
                    />
                  </article>
                );
              })}
            </div>
          ) : <p className="quiet-state">{copy.linkedTasksEmpty}</p>}
          <BoundedNotice list={boundedTasks} locale={locale} />
        </section>
        {/*
          EGC-ASSOC-003. The same `person_projects` row, written from the other
          side by the same module. Neither surface owns a private path, and
          `egc-invariants.test.ts` asserts the single writer in both directions —
          two paths is how a soft-end contract acquires a hard delete on the
          surface that forgot about it.

          `2N-PROJECT-002`: the role comes from that row and nowhere else. A
          person with no role stored renders the panel's "no role" sentence
          rather than a guess from the project's name or from what they do
          elsewhere.
        */}
        <AssociationPanel
          addAction={associatePersonProject}
          bound={boundedPeople}
          endAction={endPersonProject}
          heading={copy.linkedPeople}
          locale={locale}
          options={peopleOptions.map((option) => ({ id: option.id, label: option.name }))}
          roleAction={updatePersonProjectRole}
          rows={boundedPeople.items.map((person) => ({
            id: person.id,
            label: person.name,
            href: `/${locale}/app/people/${person.id}`,
            role: roleByPersonId.get(person.id) ?? null,
          }))}
          target={{ kind: "project-person", projectId: project.id }}
        />
      </div>

      {/*
        `2N-PROJECT-005`. The heading says these are a **reading**, because that
        is what they are: `entry_interpretations.concepts` is what the extraction
        recorded, and the product's own `element_classifications` calls that
        element an interpretation by default. Calling the section "Decisões do
        projeto" would state that the product holds decisions; it holds entries
        that a reading marked, and every one of them opens.

        The risk half of this requirement ships nothing: there is no risk
        concept, column or table anywhere, and `blocker` does not mean risk. See
        `project-context.ts` and the guard that asserts the premise.
      */}
      <section className="entity-decisions" id="decisions">
        <h2>{copy.decisions}</h2>
        <SectionOriginNote locale={locale} origin="derived" />
        <p className="section-explainer">{copy.decisionsExplainer}</p>
        {boundedDecisions.items.length ? (
          <div className="mini-list">
            {boundedDecisions.items.map((entry) => (
              <article id={`decision-${entry.id}`} key={entry.id}>
                {/*
                  A distinct `revealKey` from the same entry's timeline row on
                  purpose: ADR-110 makes a reveal local and explicit, so two
                  placements of one record are two separate acts rather than one
                  that quietly unmasks the other.
                */}
                <ProtectedContent
                  href={sourceHref(entry.id, `decision-${entry.id}`)}
                  locale={locale}
                  revealKey={`project-decision-${entry.id}`}
                  sensitivity={deriveSubjectSensitivity(entry.id, entryLevels)}
                  surface="project"
                >
                  <Link href={sourceHref(entry.id, `decision-${entry.id}`)}><strong>{entry.original_content}</strong></Link>
                </ProtectedContent>
                <small>{formatInstant(entry.occurred_at, "dayAndTime", locale, timeZone)}</small>
              </article>
            ))}
          </div>
        ) : <p className="quiet-state">{copy.decisionsEmpty}</p>}
        <BoundedNotice list={boundedDecisions} locale={locale} />
      </section>

      {/*
        Rendered even when empty, unlike the person page's memory block.
        "Nenhuma memória vinculada a este projeto" is an answer to *what
        supports this context*; a section that vanishes leaves the reader unable
        to tell an empty answer from a surface that does not have the question —
        which is the distinction every other section on this page states.
      */}
      <section className="entity-memory" id="memories">
        <h2>{copy.projectMemories}</h2>
        <SectionOriginNote locale={locale} origin="derived" />
        {boundedMemories.items.length ? (
          boundedMemories.items.map((memory, index) => {
            const provenance = deriveClaimProvenance(memory.source_entry_id, resolvableEntryIds);
            return (
              <article id={`memory-${memory.id}`} key={memory.id}>
                <ProtectedContent
                  locale={locale}
                  revealKey={`project-memory-${memory.id}`}
                  sensitivity={deriveSubjectSensitivity(memory.id, memoryLevels)}
                  surface="project"
                >
                  <strong>{memory.content}</strong>
                </ProtectedContent>
                <span>{memoryKindLabel(locale, memory.kind) ?? vocabulary.unknownState}</span>
                {/*
                  A memory with a NULL `source_entry_id` renders `unsourced`, NOT
                  "informed by you". The column is `on delete set null`, so null
                  means either "nothing recorded a source" or "the source entry
                  was deleted" — and calling the second one owner-authored would
                  invent an origin for knowledge the owner may never have typed.
                */}
                <ProvenanceNote
                  href={isOpenable(provenance) ? sourceHref(provenance.entryId, `memory-${memory.id}`) : undefined}
                  locale={locale}
                  provenance={provenance}
                  subject={provenanceCopy.memorySubject(index + 1)}
                />
              </article>
            );
          })
        ) : <p className="quiet-state">{copy.projectMemoriesEmpty}</p>}
        <BoundedNotice list={boundedMemories} locale={locale} />
      </section>

      {/*
        `2N-PROJECT-004`. Derived from `audit_logs` and described by the same
        function the History surface uses, so one change is narrated one way
        wherever it is read. No change-log table is added, and none is needed:
        every writer on this page already records what it did.

        The explainer states the two things the trail carries for a project, so a
        change it never recorded — linking a task, for instance — reads as
        outside this list rather than as an absence of history.
      */}
      <section className="entity-changes" id="changes">
        <h2>{copy.recentChanges}</h2>
        <SectionOriginNote locale={locale} origin="derived" />
        <p className="section-explainer">{copy.recentChangesExplainer}</p>
        {boundedChanges.items.length ? (
          <HistoryList copy={historyCopy} events={boundedChanges.items} formatDateTime={formatDateTime} locale={locale} />
        ) : <p className="quiet-state">{copy.recentChangesEmpty}</p>}
        <BoundedNotice list={boundedChanges} locale={locale} />
      </section>

      {/*
        `2N-FILES-009`. The same component the person page mounts, with the same
        three states, so the two surfaces converge by construction rather than by
        two authors making the same choices twice.
      */}
      <LinkedFilesSection
        files={boundedFiles}
        locale={locale}
        outcome={fileLinkOutcome}
        statusLabel={(value) => attachmentStatusLabel(locale, value) ?? vocabulary.unknownState}
      />

      <section className="entity-timeline" id="timeline">
        <h2>{copy.timeline}</h2>
        {/*
          Derived, and the one section that needs no per-row provenance: these
          rows ARE the records. A "de um registro seu" line under an entry would
          be the page explaining that a record came from itself.
        */}
        <SectionOriginNote locale={locale} origin="derived" />
        {boundedEntries.items.length ? (
          <div className="timeline-list">
            {boundedEntries.items.map((entry) => (
              <article id={`entry-${entry.id}`} key={entry.id}>
                <span className="timeline-dot" />
                <div>
                  <ProtectedContent
                    href={sourceHref(entry.id, `entry-${entry.id}`)}
                    locale={locale}
                    revealKey={`project-entry-${entry.id}`}
                    sensitivity={deriveSubjectSensitivity(entry.id, entryLevels)}
                    surface="project"
                  >
                    <Link href={sourceHref(entry.id, `entry-${entry.id}`)}><strong>{entry.original_content}</strong></Link>
                  </ProtectedContent>
                  <small>
                    {formatInstant(entry.occurred_at, "dayAndTime", locale, timeZone)}
                    {entry.is_retroactive ? ` · ${copy.addedLater}` : ""}
                  </small>
                </div>
              </article>
            ))}
          </div>
        ) : <p className="quiet-state">{copy.timelineEmpty}</p>}
        <BoundedNotice list={boundedEntries} locale={locale} />
      </section>

      {/* Last on the page, for the reason the person page states. */}
      <section className="entity-danger-zone">
        <DeleteEntityControl locale={locale} entityType="project" entityId={project.id} />
      </section>
    </div>
  );
}
