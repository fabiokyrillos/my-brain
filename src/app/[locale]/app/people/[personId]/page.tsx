import { ArrowLeft, UserRound } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createOrganizationForSubject, updatePerson } from "@/features/entities/actions";
import { AssociationPanel } from "@/features/entities/association-panel";
import {
  associatePersonContext,
  associatePersonProject,
  endPersonContext,
  endPersonProject,
  updatePersonProjectRole,
} from "@/features/entities/associations";
import { loadContextOptions } from "@/features/entities/contexts";
import { getEntityCopy } from "@/features/entities/copy";
import { EntityEditForm } from "@/features/entities/entity-edit-form";
import { loadOrganizationOptions } from "@/features/entities/organizations";
import { RelationshipPanel } from "@/features/entities/relationship-panel";
import { describeRelationshipType } from "@/features/entities/relationship-vocabulary";
import {
  createOwnerRelationship,
  endOwnerRelationship,
  updateOwnerRelationship,
} from "@/features/entities/relationships";
import { loadAliasesForEntity } from "@/features/entities/aliases";
import { describeEntityChanges } from "@/features/entities/project-context";
import { getHistoryCopy } from "@/features/history/copy";
import { HistoryList } from "@/features/history/history-list";
import { getAgentName } from "@/features/profile/agent-identity";
import { BoundedNotice } from "@/features/bounds/bounded-notice";
import { boundedList, CONTEXTUAL_LIMIT, PICKER_LIMIT, RECENT_CHANGE_LIMIT, RELATION_LIMIT, withProbe } from "@/features/bounds/contracts";
import { loadLinksForEntity } from "@/features/library/attachment-links";
import { ATTACHMENT_LINK_LIMIT } from "@/features/library/link-contracts";
import { LinkedFilesSection } from "@/features/library/linked-subjects-section";
import { resolveLinkedFiles, type ResolvedFileRow } from "@/features/library/linked-subjects";
import { ProtectedContent } from "@/features/operations/protected-content";
import { deriveClaimProvenance, isOpenable, resolvableEntryIdsOf } from "@/features/provenance/contracts";
import { getProvenanceCopy } from "@/features/provenance/copy";
import { ProvenanceNote, SectionOriginNote } from "@/features/provenance/provenance-note";
import {
  deriveFreeTextSensitivity,
  deriveSubjectSensitivity,
  readableLevelsOf,
} from "@/features/sensitivity/subject-derivation";
import { deriveTaskSensitivity } from "@/features/sensitivity/task-derivation";
import { attachmentStatusLabel, getVocabularyCopy, memoryKindLabel, taskStatusLabel } from "@/features/vocabulary/copy";
import { requireUser } from "@/lib/auth/require-user";
import { getOwnerTimeZone } from "@/features/profile/owner-timezone";
import { DeleteEntityControl } from "@/features/deletion/delete-entity-control";
import { formatInstant } from "@/lib/time/instant-format";
import { isLocale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";

/**
 * The person workspace — `03-componentes.md`, EntityWorkspace.
 *
 * ## The template, and the one part of it that is not built
 *
 * The handoff's order is *cabeçalho → resumo do Brain com fontes → duas colunas
 * (trabalho em aberto / o que o Brain acredita saber) → "onde aparece"*. Four of
 * those five are here. The **generated summary is not**, and it is left out
 * rather than faked: the product has no per-entity summary, storing one would
 * cost a migration this initiative does not have, and generating one at render
 * would spend the owner's own credential on a model call per page load —
 * exactly what `2K-SUGG-001` refused for the same shape of feature.
 *
 * `04-estados.md` offers *"Ainda não há material suficiente para um resumo"* as
 * the empty arm, and that sentence is **not** used, because it says the
 * capability exists and is waiting for material. It does not exist. An honest
 * absence is silence plus a record in the changelog, not a placeholder that
 * implies a feature.
 *
 * What occupies that position instead is a band that is real: **what changed
 * here recently**, read from the audit trail this product already keeps and
 * linked to the same rows on `/app/history`.
 *
 * ## What did not move
 *
 * Every loader, bound, provenance derivation, sensitivity derivation, Server
 * Action, association panel and the deletion control are the code they were.
 * This commit reorders and regroups; the only new read is the audit band's.
 */
/**
 * The audit columns the changes band needs — the same eight the project page
 * reads, written once per surface because a shared constant would be a third
 * module for one string list. Both are checked against each other by
 * `phase-2n-project-guard.test.ts`'s sibling assertion.
 */
const CHANGE_SELECT = "id,action_type,entity_type,entity_id,actor,before_state,after_state,created_at";

export default async function PersonDetailPage({ params }: { params: Promise<{ locale: string; personId: string }> }) {
  const { locale: candidate, personId } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const pt = locale === "pt-BR";
  const copy = getEntityCopy(locale);
  const provenanceCopy = getProvenanceCopy(locale);
  const vocabulary = getVocabularyCopy(locale);
  const { supabase, user } = await requireUser(locale);
  // `LDC-CONTEXT-001`. One accessor, cached per request: this page and every
  // other contextual surface stamp instants from the same source.
  const timeZone = await getOwnerTimeZone();
  const [
    personResult,
    taskLinkResult,
    projectLinkResult,
    entryLinkResult,
    memoryResult,
    relationshipResult,
    contextLinkResult,
    organizations,
    contextOptions,
    projectOptionsResult,
    aliases,
    fileLinkOutcome,
    personChangeResult,
    agentName,
  ] = await Promise.all([
    // `organization_id` joins the projection for the first time (UX-09).
    supabase.from("people").select("id,name,notes,organization_id,created_at,updated_at").eq("id", personId).maybeSingle(),
    // `2N-PERSON-003`: every list below asks for one row more than it will show,
    // so "there are more" is knowable rather than guessed. See
    // `features/bounds/contracts.ts` — receiving exactly `limit` rows cannot
    // distinguish a complete list from a truncated one.
    supabase.from("task_people").select("task_id,role").eq("person_id", personId).limit(withProbe(CONTEXTUAL_LIMIT)),
    supabase.from("person_projects").select("project_id,role,valid_from,valid_until").eq("person_id", personId).is("valid_until", null).limit(withProbe(CONTEXTUAL_LIMIT)),
    supabase.from("entry_entities").select("entry_id").eq("entity_type", "person").eq("entity_id", personId).limit(withProbe(CONTEXTUAL_LIMIT)),
    // `sensitivity` joins this projection because `2J-PRIVACY-005` requires the
    // classification to travel with the content rather than be fetched again at
    // render time — and because `2N-KNOWS-007` requires it read from the current
    // row, which is what selecting it beside the content means.
    // `source_entry_id` joins this projection for `2N-PROV-001`: it is the only
    // column on `memories` that can point at a record. Note it is declared
    // `on delete set null`, so a NULL here is ambiguous and never renders as
    // owner-authored — see `features/provenance/contracts.ts`.
    supabase.from("memories").select("id,content,kind,important,sensitivity,source_entry_id").eq("person_id", personId).order("important", { ascending: false }).limit(withProbe(CONTEXTUAL_LIMIT)),
    // Two relations the schema has modelled since `202607160009` and the page
    // has never shown (UX-09). Both are validity-scoped: a relationship that
    // ended is history, not the current answer to "who is this to me".
    supabase.from("person_relationships").select("id,relationship_type,description,valid_from,valid_until").eq("person_id", personId).is("valid_until", null).order("valid_from", { ascending: false }).limit(withProbe(RELATION_LIMIT)),
    supabase.from("person_contexts").select("context_id,valid_until").eq("person_id", personId).is("valid_until", null).limit(withProbe(RELATION_LIMIT)),
    loadOrganizationOptions(supabase),
    // EGC.2. The two selectors the association panels offer, bounded at 200 by
    // the loaders themselves (EGC-ASSOC-008). Loaded here rather than inside the
    // panels because a client component cannot query.
    loadContextOptions(supabase),
    // **Archived projects are included on purpose.** Filtering them out made
    // `options.length === 0` mean two different things: "you have no projects"
    // and "all of yours are archived" — so an owner with three archived
    // projects was told to create one, which is the `EG-04` shape again. It is
    // also a true thing to record that somebody worked on a project that has
    // since been archived.
    supabase.from("projects").select("id,name").order("name").limit(PICKER_LIMIT),
    // `2N-IDENTITY-004` — `entity_aliases` gains its first reader, and this is
    // the surface it means something on: a person page that never showed the
    // nicknames the owner recorded could not explain why searching one found
    // this person. Owner-scoped under forced RLS, validity-windowed at now.
    loadAliasesForEntity(supabase, "person", personId, new Date()),
    /*
     * `2N-PERSON-008`, `2N-FILES-009` — `entity_attachments` gains its first
     * reader on a contextual page, and gains no writer anywhere.
     *
     * The outcome is kept rather than flattened to a list: "no file is linked to
     * this person" and "the link table could not be read" are different claims,
     * and the section renders them differently. The section also states, in the
     * empty case, that the product currently offers no way to create a link —
     * `authenticated` holds no `INSERT` on the table and this slice adds none —
     * so the emptiness is explained rather than left to look like a bug.
     */
    loadLinksForEntity(supabase, "person", personId),
    /*
     * The audit trail, scoped to this person — the same read `2N-PROJECT-004`
     * gave the project workspace, on the surface that answers the same question
     * about a different subject.
     *
     * `(user_id, entity_type, entity_id)` is `audit_logs_user_entity_idx`, so
     * this is one indexed lookup. It carries the probe row like every other list
     * on this page, because a changes band that silently stopped at twenty would
     * be the truncation `2N-PERSON-003` exists to end.
     */
    supabase.from("audit_logs").select(CHANGE_SELECT).eq("user_id", user.id).eq("entity_type", "person").eq("entity_id", personId).order("created_at", { ascending: false }).limit(withProbe(RECENT_CHANGE_LIMIT)),
    getAgentName(),
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
  const fileLinks = fileLinkOutcome.status === "ok" ? fileLinkOutcome.list.items : [];
  const linkedFileIds = fileLinks.map((link) => link.attachmentId);
  const [taskResult, projectResult, entryResult, contextResult, attachmentResult] = await Promise.all([
    // `source_entry_id` joins this projection so a task's classification can be
    // derived at all: `tasks` carries no `sensitivity` column and OD-2L-1 B
    // forbids adding one, so the level comes from the entry the task came from.
    taskIds.length ? supabase.from("tasks").select("id,title,status,due_at,source_entry_id").in("id", taskIds).order("updated_at", { ascending: false }).limit(withProbe(CONTEXTUAL_LIMIT)) : Promise.resolve({ data: [], error: null }),
    projectIds.length ? supabase.from("projects").select("id,name,status").in("id", projectIds).limit(withProbe(CONTEXTUAL_LIMIT)) : Promise.resolve({ data: [], error: null }),
    entryIds.length ? supabase.from("entries").select("id,original_content,occurred_at,is_retroactive,sensitivity").in("id", entryIds).order("occurred_at", { ascending: false }).limit(withProbe(CONTEXTUAL_LIMIT)) : Promise.resolve({ data: [], error: null }),
    contextIds.length ? supabase.from("contexts").select("id,name,kind").in("id", contextIds).limit(withProbe(RELATION_LIMIT)) : Promise.resolve({ data: [], error: null }),
    // `2N-FILES-004`: `sensitivity` travels with the name, because
    // `2N-PRIVACY-002` names a file name as content this contract governs — the
    // same projection the library itself reads, so a file masked there is masked
    // here.
    linkedFileIds.length ? supabase.from("attachments").select("id,original_name,status,sensitivity").in("id", linkedFileIds) : Promise.resolve({ data: [], error: null }),
  ]);
  const tasks = requireSupabaseData(taskResult, "load related tasks") ?? [];
  const projects = requireSupabaseData(projectResult, "load related projects") ?? [];
  const entries = requireSupabaseData(entryResult, "load person timeline") ?? [];
  const contexts = requireSupabaseData(contextResult, "load person context names") ?? [];
  const projectOptions = requireSupabaseData(projectOptionsResult, "load project options") ?? [];

  /*
   * `2N-PRIVACY-001`/`-002`/`-005` — the classifications this page renders with.
   *
   * A task's source entry is usually NOT one of the timeline entries above:
   * the timeline is the entries that mention this person, and a task can come
   * from an entry that never did. So the levels for those sources are read here,
   * owner-scoped and bounded to the ids actually on the page.
   *
   * The two reads are merged into ONE map, because the derivation's contract is
   * that absence means unreadable. Two maps would have meant two ways to be
   * absent, and a lookup that missed the first would have to remember to try the
   * second — the kind of "remembering" this contract exists to remove.
   */
  const timelineLevels = readableLevelsOf(entries);
  /*
   * `2N-PROV-001`: memories join tasks here.
   *
   * Both tables carry `source_entry_id`, and a memory's source is no more likely
   * than a task's to be one of the timeline entries — the timeline is what
   * mentions this person, and a memory can come from an entry that never did. So
   * both sets of ids are resolved in the same owner-scoped, bounded read, and
   * the rows that come back feed BOTH the classification map and the set of
   * sources this page may offer to open.
   */
  const declaredSourceIds = Array.from(
    new Set(
      [...tasks.map((task) => task.source_entry_id), ...memories.map((memory) => memory.source_entry_id)]
        .filter((id): id is string => Boolean(id) && !timelineLevels.has(id as string)),
    ),
  );
  const sourceResult = declaredSourceIds.length
    ? await supabase.from("entries").select("id,sensitivity").in("id", declaredSourceIds)
    : { data: [], error: null };
  // A failed read is NOT treated as an empty result that could be mistaken for
  // "these entries carry no classification": rows that do not arrive stay absent
  // from the map, which is exactly the most-protective arm.
  const entryLevels = new Map(timelineLevels);
  for (const [id, level] of readableLevelsOf(sourceResult.data)) entryLevels.set(id, level);
  const memoryLevels = readableLevelsOf(memories);

  /*
   * The entries this page may offer to OPEN — built from rows that actually came
   * back, never from the ids that were asked for.
   *
   * That distinction is the whole guarantee: an id the query requested and did
   * not return is removed, foreign or unreadable, and offering a link for it
   * would both 404 and confirm the id exists. `resolvableEntryIdsOf` therefore
   * reads the returned rows, and every one of those three cases lands in the
   * same `unsourced` arm.
   */
  const resolvableEntryIds = new Set([
    ...resolvableEntryIdsOf(entries),
    ...resolvableEntryIdsOf(sourceResult.data),
  ]);

  // `2N-PRIVACY-009`, ADR-110 Decision 4. The note carries no classification and
  // none may be inferred from its text, so it is masked by default and revealed
  // only by an explicit, local act.
  const notesSensitivity = deriveFreeTextSensitivity();

  /*
   * Both hops carry the bound. Tasks and the timeline are read through
   * `task_people` and `entry_entities` first, and a link whose row does not
   * resolve would otherwise make a truncated list look complete — see
   * `boundedList`'s `upstreamBounded`.
   */
  const boundedTasks = boundedList(tasks, CONTEXTUAL_LIMIT, taskLinks.length > CONTEXTUAL_LIMIT);
  const boundedMemories = boundedList(memories, CONTEXTUAL_LIMIT);
  const boundedEntries = boundedList(entries, CONTEXTUAL_LIMIT, entryLinks.length > CONTEXTUAL_LIMIT);
  /*
   * The three lists that asked for a probe row and then rendered it.
   *
   * Every query above already used `withProbe`, so the rows were *fetched* to
   * measure the bound - but relationships, contexts and linked projects went
   * straight into their panels without passing through `boundedList`. At 51
   * relationships, 51 contexts or 101 linked projects the page showed one row
   * more than its own limit and stated nothing, which is the silent truncation
   * `2N-PERSON-003` exists to end. Contexts and projects resolve through a link
   * table first, so both carry the upstream hop the same way tasks do.
   */
  const boundedRelationships = boundedList(relationships, RELATION_LIMIT);
  const boundedContexts = boundedList(contexts, RELATION_LIMIT, contextLinks.length > RELATION_LIMIT);
  const boundedProjects = boundedList(projects, CONTEXTUAL_LIMIT, projectLinks.length > CONTEXTUAL_LIMIT);

  /*
   * `2N-PERSON-008`, `2N-FILES-005`/`-009`.
   *
   * Built from attachment rows that actually came back, never from the ids the
   * links named. A file that was deleted, belongs to someone else, or simply did
   * not return is absent from this map and therefore absent from the section —
   * the same collapse `resolvableEntryIdsOf` performs above, so the page cannot
   * be used to test whether a particular attachment id exists.
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

  // `person_projects.role` was already read here and never rendered (UX-09):
  // "shared projects" said they were shared, not what this person does on them.
  /*
   * `2N-PROJECT-004`'s band, on the person workspace.
   *
   * `requireSupabaseData` rather than a silent `[]`: the section states *"nenhuma
   * alteração registrada"*, which is a claim about the trail. A failed read that
   * rendered as that sentence would turn "we could not look" into "there is
   * nothing", which is the shape this page already refuses three times over.
   *
   * Only rows whose `entity_type` is `person` are read. The explainer says so,
   * for the reason the project page's does: a change the trail never recorded
   * against this subject must read as outside the list rather than as an absence
   * of history.
   */
  const personChanges = requireSupabaseData(personChangeResult, "load person changes") ?? [];
  const historyCopy = getHistoryCopy(locale, agentName);
  const formatDateTime = (iso: string) => formatInstant(iso, "dayAndTime", locale, timeZone) ?? "";
  const boundedChanges = boundedList(
    describeEntityChanges(personChanges, historyCopy, formatDateTime),
    RECENT_CHANGE_LIMIT,
  );

  const roleByProjectId = new Map(projectLinks.map((link) => [link.project_id, link.role]));
  const organizationName = organizations.find((item) => item.id === person.organization_id)?.name ?? null;
  const formatDate = (value: string) => formatInstant(value, "day", locale, timeZone) ?? "";

  /*
   * `2N-PERSON-006`, `2N-PROV-003` — opening a source must not cost the reader
   * their place.
   *
   * Every row that can open one carries a stable anchor, and the link hands that
   * anchor to the entry page as `back`. Returning is then a normal navigation to
   * a fragment on this page rather than a scroll position the browser may or may
   * not have kept, which matters because these rows are server-rendered and a
   * back navigation can re-fetch them.
   *
   * The anchor is built from ids that are already in the URL or already public
   * on the page — never from content, which would put a masked string into the
   * address bar and the browser's history.
   */
  const sourceHref = (entryId: string, anchor: string) =>
    `/${locale}/app/inbox/${entryId}?back=${encodeURIComponent(`/${locale}/app/people/${person.id}#${anchor}`)}`;

  return (
    <div className="content-page entity-workspace">
      <Link className="back-link" href={`/${locale}/app/people`}><ArrowLeft size={16} />{pt ? "Pessoas" : "People"}</Link>

      <header className="entity-hero">
        <UserRound size={28} />
        <div>
          <p className="eyebrow">{pt ? "PESSOA" : "PERSON"}</p>
          {/*
            ADR-110 Decision 2: the name STAYS VISIBLE. A structural identifier
            the owner needs to recognise the entity is not unsourced derived
            content, and masking it would make the page unusable while protecting
            nothing — the name is how the user got here.
          */}
          <h1>{person.name}</h1>
          {/*
            ADR-110 Decision 4: the note does not. It is free text about a human
            being with no classification of its own and no classifiable source,
            and `2N-PRIVACY-005` says absence never resolves to `normal`. The
            fallback sentence is not a note and is shown as it always was.
          */}
          {person.notes ? (
            <ProtectedContent
              describedAs={person.name}
              locale={locale}
              revealKey={`person-notes-${person.id}`}
              sensitivity={notesSensitivity}
              surface="person"
            >
              <span>{person.notes}</span>
            </ProtectedContent>
          ) : (
            <p>{pt ? "Contexto construído a partir das interações registradas." : "Context built from recorded interactions."}</p>
          )}
          {aliases.length > 0 && (
            <p className="entity-aliases">
              {/* Gender-neutral in pt-BR on purpose: this line describes every
                  person, and "conhecida"/"conhecido" would force the product to
                  assert something about them that it does not know. */}
              <span>{pt ? "Outros nomes" : "Also known as"}</span>
              <strong>{aliases.map((entry) => entry.alias).join(" · ")}</strong>
            </p>
          )}
          {/*
            EGC-REL-009. Company and relationship-to-owner are visibly distinct
            concerns: this line says where they work, and the relationship panel
            below says who they are to the owner. The explainer is what stops the
            Company field from reading as a way to describe a personal
            relationship — the confusion the Camila scenario exposed.
          */}
          <p className="entity-relation-line">
            <span>{copy.company}</span>
            <strong>{organizationName ?? copy.companyNone}</strong>
            <small>{copy.companyExplainer}</small>
          </p>
          {/*
            `2N-PERSON-004`, `2N-PROV-001`. Everything in this header — the name,
            the note, the company, the nicknames — is a field the owner typed
            into the form directly below. `people` carries no `source_entry_id`,
            so there is no record to trace it to and none is invented.
          */}
          <SectionOriginNote locale={locale} origin="persisted" />
        </div>
      </header>

      {/*
        The edit form, behind a disclosure.
        `03-componentes.md` puts *ações* in the workspace header; a nine-field
        form sitting open between the identity and the content is not an action,
        it is a page of its own wearing the header's position. Behind a
        `<details>` it keeps every capability — the same move part two made for
        Trabalho's forty filter controls — and the workspace starts where the
        handoff says it starts, at what the Brain knows about this person.
      */}
      <details className="entity-edit-disclosure">
        <summary>{copy.editSummary}</summary>
        <EntityEditForm
          action={updatePerson}
          createOrganizationAction={createOrganizationForSubject}
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
      </details>

      {/*
        Where the handoff draws the generated summary. See the module header on
        why no summary is rendered and why the empty sentence `04-estados.md`
        offers for it is not used. This band is what genuinely exists in its
        place — and it is the project workspace's own section, mounted here
        rather than reimplemented, so one change is narrated one way wherever it
        is read.
      */}
      <section className="entity-changes" id="changes">
        <h2>{copy.recentChanges}</h2>
        <SectionOriginNote locale={locale} origin="derived" />
        <p className="section-explainer">{copy.personChangesExplainer}</p>
        {boundedChanges.items.length ? (
          <HistoryList copy={historyCopy} events={boundedChanges.items} formatDateTime={formatDateTime} locale={locale} />
        ) : <p className="quiet-state">{copy.personChangesEmpty}</p>}
        <BoundedNotice list={boundedChanges} locale={locale} />
      </section>

      <div className="entity-workspace-columns">
        <section className="entity-workspace-column" aria-labelledby="workspace-open">
          <h2 id="workspace-open">{copy.openWork}</h2>
          <section className="entity-tasks">
            <h3>{pt ? "Pendências e tarefas" : "Open work and tasks"}</h3>
            {/*
              `2N-PERSON-004`. Derived: this list is assembled at render from
              `task_people` and `tasks`, and the task itself is edited on Work, not
              here. Saying so is what stops the reader looking for an edit control
              that was never meant to be on this page.
            */}
            <SectionOriginNote locale={locale} origin="derived" />
            {boundedTasks.items.length ? (
              <div className="mini-list">
                {boundedTasks.items.map((task, index) => {
                  /*
                   * Derived ONCE and asked about, rather than the resolvability
                   * test being re-implemented in the `href`.
                   *
                   * Writing `resolvableEntryIds.has(...) ? sourceHref(...)` beside
                   * `deriveClaimProvenance(...)` would be two answers to one
                   * question, and they would drift the moment the contract gained
                   * a condition — leaving a page that offers a link to something
                   * it simultaneously labels unsourced.
                   */
                  const provenance = deriveClaimProvenance(task.source_entry_id, resolvableEntryIds);
                  return (
                  <article id={`task-${task.id}`} key={task.id}>
                    {/*
                      The same component the Work list and the task detail mount, so
                      a task masked on `/app/work` is masked here too — the
                      divergence `2L-PRIVACY-007` found on Hoje, prevented one
                      domain earlier this time. No `describedAs`: the title IS the
                      protected content, and passing it would defeat the mask
                      through the accessible name.
                    */}
                    <ProtectedContent
                      locale={locale}
                      revealKey={`person-task-${task.id}`}
                      sensitivity={deriveTaskSensitivity(task.source_entry_id, entryLevels)}
                      surface="person"
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
            ) : <p className="quiet-state">{pt ? "Nenhuma tarefa vinculada." : "No linked tasks."}</p>}
            <BoundedNotice list={boundedTasks} locale={locale} />
          </section>
          <AssociationPanel
            addAction={associatePersonProject}
            bound={boundedProjects}
            endAction={endPersonProject}
            heading={copy.linkedProjects}
            locale={locale}
            options={projectOptions.map((option) => ({ id: option.id, label: option.name }))}
            roleAction={updatePersonProjectRole}
            rows={boundedProjects.items.map((project) => ({
              id: project.id,
              label: project.name,
              href: `/${locale}/app/projects/${project.id}`,
              role: roleByProjectId.get(project.id) ?? null,
            }))}
            target={{ kind: "person-project", personId: person.id }}
          />
        </section>

        {/*
          EGC.2. These sections were read-only until EGC.2: the page loaded
          `person_relationships` and `person_contexts` and rendered whatever it
          found, which was always nothing, because nothing had ever written them.
          `person_relationships` in particular had no writer in either layer.
        */}
        <section className="entity-workspace-column" aria-labelledby="workspace-knows">
          <h2 id="workspace-knows">{copy.whatBrainKnows}</h2>
          <RelationshipPanel
          bound={boundedRelationships}
          createAction={createOwnerRelationship}
          endAction={endOwnerRelationship}
          locale={locale}
          personId={person.id}
          relationships={boundedRelationships.items.map((relationship) => ({
            id: relationship.id,
            storedType: relationship.relationship_type,
            // `null` for a value outside the vocabulary, so the panel renders the
            // stored token rather than a guess (EGC-REL-006).
            label: describeRelationshipType(locale, relationship.relationship_type),
            description: relationship.description,
            since: formatDate(relationship.valid_from),
          }))}
          updateAction={updateOwnerRelationship}
        />
        <AssociationPanel
          addAction={associatePersonContext}
          bound={boundedContexts}
          endAction={endPersonContext}
          heading={copy.contexts}
          locale={locale}
          options={contextOptions.map((option) => ({ id: option.id, label: option.name }))}
          rows={boundedContexts.items.map((context) => ({
            id: context.id,
            label: context.name,
            href: `/${locale}/app/contexts/${context.id}`,
          }))}
          target={{ kind: "person-context", personId: person.id }}
        />
      {boundedMemories.items.length > 0 && (
        <section className="entity-memory">
          <h3>{pt ? "Memórias" : "Memories"}</h3>
          <SectionOriginNote locale={locale} origin="derived" />
          {boundedMemories.items.map((memory, index) => {
            const provenance = deriveClaimProvenance(memory.source_entry_id, resolvableEntryIds);
            return (
            <article id={`memory-${memory.id}`} key={memory.id}>
              <ProtectedContent
                locale={locale}
                revealKey={`person-memory-${memory.id}`}
                sensitivity={deriveSubjectSensitivity(memory.id, memoryLevels)}
                surface="person"
              >
                <strong>{memory.content}</strong>
              </ProtectedContent>
              <span>{memoryKindLabel(locale, memory.kind) ?? vocabulary.unknownState}</span>
              {/*
                A memory with a NULL `source_entry_id` renders `unsourced`, NOT
                "informed by you". The column is `on delete set null`, so null
                means either "nothing recorded a source" or "the source entry was
                deleted" — and calling the second one owner-authored would invent
                an origin for knowledge the owner may never have typed.
              */}
              <ProvenanceNote
                href={isOpenable(provenance) ? sourceHref(provenance.entryId, `memory-${memory.id}`) : undefined}
                locale={locale}
                provenance={provenance}
                subject={provenanceCopy.memorySubject(index + 1)}
              />
            </article>
            );
          })}
          <BoundedNotice list={boundedMemories} locale={locale} />
        </section>
      )}

      {/*
        `2N-PERSON-008`. Rendered unconditionally rather than only when it has
        rows, because the two things this section says when it is empty are both
        useful: that no file is linked to this person, and that the product does
        not yet offer a way to link one. A section that disappeared when empty
        would leave the second fact unsaid and the first indistinguishable from
        the page having no opinion.
      */}
      <LinkedFilesSection
        files={boundedFiles}
        locale={locale}
        outcome={fileLinkOutcome}
        statusLabel={(value) => attachmentStatusLabel(locale, value) ?? vocabulary.unknownState}
      />
        </section>
      </div>

      {/*
        "Onde aparece", last of the four bands the workspace template names. The
        heading changed from *Linha do tempo* because the section answers a
        different question from the one that name asks: it is not this person's
        chronology, it is the records that mention them.
      */}
      <section className="entity-timeline">
        <h2>{copy.whereItAppears}</h2>
        {/*
          Derived, and the one section that needs no per-row provenance: these
          rows ARE the records. A "de um registro seu" line under an entry would
          be the page explaining that a record came from itself, which is the
          repetition `2N-PROV-002` guards against by asking that source and
          derived statement be visibly DIFFERENT things.
        */}
        <SectionOriginNote locale={locale} origin="derived" />
        {boundedEntries.items.length ? (
          <div className="timeline-list">
            {boundedEntries.items.map((entry) => (
              <article id={`entry-${entry.id}`} key={entry.id}>
                <span className="timeline-dot" />
                <div>
                  {/*
                    The raw entry text ADR-108's audit found printed in full with
                    no classification applied at all. `href` keeps the row
                    openable while masked: being able to reach an entry is not
                    content, and a masked row nobody can open would be a
                    functional loss the privacy decision never asked for.
                  */}
                  <ProtectedContent
                    href={sourceHref(entry.id, `entry-${entry.id}`)}
                    locale={locale}
                    revealKey={`person-entry-${entry.id}`}
                    sensitivity={deriveSubjectSensitivity(entry.id, entryLevels)}
                    surface="person"
                  >
                    <Link href={sourceHref(entry.id, `entry-${entry.id}`)}><strong>{entry.original_content}</strong></Link>
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

      {/*
        Last on the page, deliberately. Everything above it is what the owner
        would want to read BEFORE deciding, and the preview this control opens
        re-counts all of it server-side rather than reusing the numbers rendered
        here — those are bounded reads, and a bound is exactly what a deletion
        preview must not inherit.
      */}
      <section className="entity-danger-zone">
        <DeleteEntityControl locale={locale} entityType="person" entityId={person.id} />
      </section>
    </div>
  );
}
