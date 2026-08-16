import { ArrowLeft, BrainCircuit } from "lucide-react";
import { UniversalStateLine } from "@/features/experience/universal-state";
import Link from "next/link";
import { notFound } from "next/navigation";

import { boundedList, PICKER_LIMIT, RECENT_CHANGE_LIMIT, withProbe } from "@/features/bounds/contracts";
import { ReturnToConversation } from "@/features/conversation-cards/return-to-conversation";
import { isInvertedValidityWindow } from "@/features/daily-cycle/conflict-detection";
import { getConflictSectionCopy } from "@/features/daily-cycle/copy";
import { describeEntityChanges } from "@/features/entities/project-context";
import { getEntityCopy } from "@/features/entities/copy";
import { BoundedNotice } from "@/features/bounds/bounded-notice";
import { getHistoryCopy } from "@/features/history/copy";
import { HistoryList } from "@/features/history/history-list";
import { getAgentName } from "@/features/profile/agent-identity";
import { SectionOriginNote } from "@/features/provenance/provenance-note";
import {
  deriveClaimProvenance,
  isOpenable,
  resolvableEntryIdsOf,
} from "@/features/provenance/contracts";
import { ProvenanceNote } from "@/features/provenance/provenance-note";
import { getProvenanceCopy } from "@/features/provenance/copy";
import { setMemoryLifecycle, updateMemory } from "@/features/memories/actions";
import { getMemoryCopy } from "@/features/memories/copy";
import { memoryLifecycleState } from "@/features/memories/lifecycle";
import { MemoryEditForm } from "@/features/memories/memory-edit-form";
import { asMemoryKind } from "@/features/memories/read";
import { DeleteEntityControl } from "@/features/deletion/delete-entity-control";
import { ProtectedContent } from "@/features/operations/protected-content";
import { toSensitivityLevel } from "@/features/sensitivity/contracts";
import { deriveSubjectSensitivity, readableLevelsOf } from "@/features/sensitivity/subject-derivation";
import { requireUser } from "@/lib/auth/require-user";
import { getOwnerTimeZone } from "@/features/profile/owner-timezone";
import { formatInstant } from "@/lib/time/instant-format";
import { isLocale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";

/**
 * The memory detail surface (UX-10).
 *
 * A memory had no inspectable surface at all: the list showed its text, a kind
 * and a confidence percentage, and `source_entry_id`, `person_id`, `project_id`,
 * `sensitivity`, `valid_from` and `valid_until` — every column that answers
 * "where did this come from" and "is it still true" — were unreachable from
 * anywhere in the product. This page reads them, and it is the first place that
 * ever has.
 *
 * It answers the owner's questions in the order they are asked: what is this,
 * is it in force, where did it come from, what does it relate to, and how do I
 * correct or retire it.
 */
export default async function MemoryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; memoryId: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const { locale: candidate, memoryId } = await params;
  // `2K-CONT-002`: present only when the user arrived from a conversation.
  const from = (await searchParams).from;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const copy = getMemoryCopy(locale);
  const entityCopy = getEntityCopy(locale);
  const conflictCopy = getConflictSectionCopy(locale);
  const { supabase, user } = await requireUser(locale);
  // `LDC-CONTEXT-001`. One accessor, cached per request: this page and every
  // other contextual surface stamp instants from the same source.
  const timeZone = await getOwnerTimeZone();

  const memoryResult = await supabase
    .from("memories")
    .select(
      "id,content,kind,sensitivity,important,person_id,project_id,source_entry_id,valid_from,valid_until,created_at,updated_at",
    )
    .eq("id", memoryId)
    .maybeSingle();
  const memory = requireSupabaseData(memoryResult, "load memory");
  if (!memory) notFound();

  // The related rows and the pick-lists load together: the page needs the names
  // to render the relations and the same two lists to offer them for editing.
  const [personResult, projectResult, entryResult, peopleResult, projectsResult, changeResult, agentName] = await Promise.all([
    memory.person_id
      ? supabase.from("people").select("id,name").eq("id", memory.person_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    memory.project_id
      ? supabase.from("projects").select("id,name").eq("id", memory.project_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    memory.source_entry_id
      ? supabase
          .from("entries")
          .select("id,original_content,occurred_at,sensitivity")
          .eq("id", memory.source_entry_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    // `2N-KNOWS-008`. These two are the only genuinely BOUNDED lists on this
    // page — the memory's own facts are one row and the list page next door is
    // paginated, so nothing there is silently dropped. A picker that truncates
    // in silence is worse than a truncated read: the owner cannot link the
    // memory to a person that exists, and the form gives no sign that the name
    // they are looking for was left out. `withProbe` measures the bound instead
    // of guessing it from a full page.
    supabase.from("people").select("id,name").order("name").limit(withProbe(PICKER_LIMIT)),
    supabase.from("projects").select("id,name").order("name").limit(withProbe(PICKER_LIMIT)),
    /*
     * *"Histórico sem reescrever revisões"* — the audit trail, scoped to this
     * memory, by the same read the person and project workspaces make.
     *
     * It writes nothing and rewrites nothing. `memories` is edited in place and
     * carries no revision table; what this shows is the trail of edits every
     * writer already records, narrated by the History surface's own describer so
     * one change reads one way wherever it is read.
     */
    supabase.from("audit_logs").select("id,action_type,entity_type,entity_id,actor,before_state,after_state,created_at").eq("user_id", user.id).eq("entity_type", "memory").eq("entity_id", memoryId).order("created_at", { ascending: false }).limit(withProbe(RECENT_CHANGE_LIMIT)),
    getAgentName(),
  ]);

  const person = requireSupabaseData(personResult, "load memory person");
  const project = requireSupabaseData(projectResult, "load memory project");
  const sourceEntry = requireSupabaseData(entryResult, "load memory source entry");
  const people = boundedList(requireSupabaseData(peopleResult, "load people options"), PICKER_LIMIT);
  const projects = boundedList(
    requireSupabaseData(projectsResult, "load project options"),
    PICKER_LIMIT,
  );

  const state = memoryLifecycleState(memory, new Date());
  const kind = asMemoryKind(memory.kind);
  /*
   * `2N-CONFLICT-002` — the state `04-estados.md` calls **em conflito**, said on
   * the surface the queue sends the owner to.
   *
   * The detector, the two labels, the explanation and the instruction all
   * already existed; the needs-attention row said *"Abra a memória e remova a
   * data de término"*, and the memory then rendered `archived` beside two dates
   * with no word about the contradiction. That is the defect the detector was
   * built to end, surviving one click past the queue.
   *
   * **Five resolutions are not built, and that is the signed decision rather
   * than an omission.** `03-componentes.md` draws a conflict block with five;
   * OD-2N-7 **A** signs derivation from existing data with no conflict table, no
   * persisted lifecycle and exactly **one** action — `CONFLICT_ACTION_ID` — and
   * the four missing ones would each be a control that writes something the
   * schema cannot record. The one real action is the edit form already below.
   */
  const hasValidityConflict = isInvertedValidityWindow(memory);
  const changes = requireSupabaseData(changeResult, "load memory changes") ?? [];
  const historyCopy = getHistoryCopy(locale, agentName);
  const formatDateTime = (iso: string) => formatInstant(iso, "dayAndTime", locale, timeZone) ?? "";
  const boundedChanges = boundedList(
    describeEntityChanges(changes, historyCopy, formatDateTime),
    RECENT_CHANGE_LIMIT,
  );
  /*
   * `2N-KNOWS-007` — read from the current row, and narrowed through the
   * **contract's** predicate rather than `asMemorySensitivity`.
   *
   * The two disagree on exactly one input and it is the one that matters: for a
   * value outside the vocabulary, `asMemorySensitivity` returns `normal` and
   * `toSensitivityLevel` returns `highly_sensitive`. This page both *states* the
   * classification and *acts* on it, so taking them from two predicates that
   * fail in opposite directions would let it print "Normal" beside content the
   * mask is withholding. One read, one answer, failing closed.
   *
   * `asMemorySensitivity` is left alone: it is a narrowing used by a write path's
   * schema, and re-pointing that is not this slice's business.
   */
  const sensitivity = toSensitivityLevel(memory.sensitivity);
  // The memory is its own subject, so the map it is looked up in is the row that
  // was just read. Absence would still mean unreadable — `maybeSingle` returning
  // nothing already sent this page to `notFound()` above.
  const memorySensitivity = deriveSubjectSensitivity(memory.id, readableLevelsOf([memory]));
  const sourceSensitivity = deriveSubjectSensitivity(
    memory.source_entry_id,
    readableLevelsOf(sourceEntry ? [sourceEntry] : []),
  );

  const retrieval =
    state === "active"
      ? copy.retrievalActive
      : state === "archived"
        ? copy.retrievalArchived
        : copy.retrievalScheduled;

  /**
   * `2N-KNOWS-003` — where this memory came from, said only where it can be.
   *
   * ## What this replaced, and why it was wrong in both arms
   *
   * The page used to answer in three arms of its own: `null` printed *"Criada
   * por você" / "Created by you"*, an unresolvable id printed *"O registro de
   * origem não existe mais"*, and only the resolved case linked.
   *
   * **Neither non-link arm was true.** `memories.source_entry_id` is declared
   * `on delete set null` (`202607160006:6`), so `null` means *either* "nothing
   * recorded a source" *or* "the source entry was deleted and the key nulled
   * the column" — and nothing afterwards tells them apart. Calling that
   * owner-authored manufactures a positive claim about the origin of knowledge
   * out of an absence, which is the exact case
   * `src/features/provenance/contracts.ts` was written around: it makes
   * `ownerAuthored("memories")` a **type error** rather than a judgement call.
   *
   * The second arm was worse, because it asserted a fact the page cannot have.
   * The column is a plain FK to `entries(id)` with **no composite
   * `(user_id, id)`**, so a foreign id is storable, and under RLS a foreign
   * row simply does not come back — at which point *"no longer exists"* is
   * false about a record that does exist, and the sentence becomes a probe for
   * whether an entry id is real.
   *
   * So removed, foreign, unreadable and never-set are **one arm**, guaranteed
   * by having no branch that could separate them: the resolvable set is built
   * from the row this page actually got back, and everything else is
   * `unsourced`.
   */
  const resolvableEntryIds = resolvableEntryIdsOf(sourceEntry ? [sourceEntry] : []);
  const provenance = deriveClaimProvenance(memory.source_entry_id, resolvableEntryIds);
  const sourceHref = isOpenable(provenance)
    ? `/${locale}/app/inbox/${provenance.entryId}`
    : undefined;

  return (
    <div className="content-page entity-detail memory-detail">
      <Link className="back-link" href={`/${locale}/app/memories`}>
        <ArrowLeft size={16} />
        {copy.backToList}
      </Link>
      <ReturnToConversation from={from} locale={locale} />

      <header className="entity-hero">
        <BrainCircuit size={28} />
        <div>
          <p className="eyebrow">{copy.kinds[kind].toUpperCase()}</p>
          {/* The memory itself is the heading. It is owner prose and can be up
              to 4000 characters, so it wraps rather than truncating — a memory
              the owner cannot read in full is one they cannot decide about.

              `2N-PRIVACY-002` governs it all the same, and the memories LIST is
              why: a memory masked there and printed here would be the exact
              divergence slice 2L.1 found on Hoje, one entity over. The mask is
              not a refusal — the owner set this level themselves and the reveal
              is one explicit, local act away. */}
          <h1 className="memory-content-heading">
            <ProtectedContent
              locale={locale}
              revealKey={`memory-content-${memory.id}`}
              sensitivity={memorySensitivity}
              surface="memory"
            >
              {memory.content}
            </ProtectedContent>
          </h1>
          <p className="memory-retrieval-line">
            <span className={`memory-state memory-state-${state}`}>{copy.states[state]}</span>
            {retrieval}
          </p>
          {/*
            Rendered by the shared component rather than as a row in the facts
            list below, which is also why that row is gone: the list's own label
            is "Origem", `ProvenanceNote` renders "Origem", and a page that
            printed both would be labelling one fact twice.

            `subject` is a NEUTRAL POSITIONAL label, never the memory's text —
            that text is exactly what `ProtectedContent` may be withholding two
            lines above, and an `aria-label` carrying it would hand the masked
            string to assistive technology.
          */}
          <ProvenanceNote
            href={sourceHref}
            locale={locale}
            provenance={provenance}
            subject={getProvenanceCopy(locale).memorySubject(1)}
          />
        </div>
      </header>

      {/*
        Placed above the facts list, not inside it. A row saying the dates
        contradict, sitting between two rows that print them as though they were
        ordinary values, would be the page disagreeing with itself in one table.
        `role="note"` rather than `alert`: nothing just happened, and this is a
        standing property of the row the reader navigated to on purpose.
      */}
      {hasValidityConflict ? (
        <section className="memory-conflict" data-memory-conflict="true" role="note">
          <h2>{conflictCopy.groupLabel}</h2>
          {/*
            Both halves, always, and neither marked as the winner
            (`2N-CONFLICT-002`). The labels are the queue's own, so the row the
            owner clicked and the page they arrived at name the two dates
            identically.
          */}
          <dl className="conflict-dates">
            <div>
              <dt>{conflictCopy.validFromLabel}</dt>
              <dd>{formatInstant(memory.valid_from, "dayAndTime", locale, timeZone)}</dd>
            </div>
            <div>
              <dt>{conflictCopy.validUntilLabel}</dt>
              <dd>{formatInstant(memory.valid_until, "dayAndTime", locale, timeZone)}</dd>
            </div>
          </dl>
          <p>{conflictCopy.whyNotDecided}</p>
          <p>{conflictCopy.whatYouCanDo}</p>
        </section>
      ) : null}

      <dl className="memory-facts">
        <div>
          <dt>{copy.relatedPerson}</dt>
          <dd>
            {person ? (
              <Link href={`/${locale}/app/people/${person.id}`}>{person.name}</Link>
            ) : (
              copy.relatedNone
            )}
          </dd>
        </div>
        <div>
          <dt>{copy.relatedProject}</dt>
          <dd>
            {project ? (
              <Link href={`/${locale}/app/projects/${project.id}`}>{project.name}</Link>
            ) : (
              copy.relatedNone
            )}
          </dd>
        </div>
        <div>
          <dt>{copy.sensitivityLabel}</dt>
          <dd>{copy.sensitivities[sensitivity]}</dd>
        </div>
        {/*
          `2N-KNOWS-004` asks for THREE facts — when it was recorded, from when
          it is in force, and until when — and the page used to show two labels.
          `valid_from` fell back to `created_at` under the label "Vale desde",
          so a memory with no start date read as though it began the day it was
          typed, and the recording time was never shown as itself.

          They are different facts and the difference is the interesting one: a
          memory recorded in March can be in force from January. Each is now
          labelled as what it is, and an absent boundary says it is absent
          rather than borrowing another column's value.
        */}
        <div>
          <dt>{copy.recordedAt}</dt>
          <dd>{formatInstant(memory.created_at, "dayAndTime", locale, timeZone)}</dd>
        </div>
        <div>
          <dt>{copy.validFrom}</dt>
          <dd>
            {memory.valid_from
              ? formatInstant(memory.valid_from, "dayAndTime", locale, timeZone)
              : copy.validFromAlways}
          </dd>
        </div>
        <div>
          <dt>{copy.validUntil}</dt>
          <dd>{memory.valid_until ? formatInstant(memory.valid_until, "dayAndTime", locale, timeZone) : copy.validAlways}</dd>
        </div>
      </dl>

      {/*
        Gated on `isOpenable` rather than on `sourceEntry` again. The two agree
        today and would drift the moment the contract gained a condition,
        leaving a page that shows a source section under a line that calls the
        claim unsourced — the same "one question asked two ways" the person
        page's diff review caught in slice 2N.1.
      */}
      {isOpenable(provenance) && sourceEntry ? (
        <section className="entity-timeline">
          <h2>{copy.provenance}</h2>
          <div className="timeline-list">
            <article>
              <span className="timeline-dot" />
              <div>
                <ProtectedContent
                  href={`/${locale}/app/inbox/${sourceEntry.id}`}
                  locale={locale}
                  revealKey={`memory-source-${sourceEntry.id}`}
                  sensitivity={sourceSensitivity}
                  surface="memory"
                >
                  <Link href={`/${locale}/app/inbox/${sourceEntry.id}`}>
                    <strong>{sourceEntry.original_content}</strong>
                  </Link>
                </ProtectedContent>
                <small>{formatInstant(sourceEntry.occurred_at, "dayAndTime", locale, timeZone)}</small>
              </div>
            </article>
          </div>
        </section>
      ) : null}

      <MemoryEditForm
        action={updateMemory}
        fields={{
          id: memory.id,
          content: memory.content,
          kind,
          sensitivity,
          important: memory.important,
          personId: memory.person_id,
          projectId: memory.project_id,
        }}
        lifecycleAction={setMemoryLifecycle}
        locale={locale}
        people={people}
        projects={projects}
        state={state}
      />

      {/*
        The trail of corrections, below the form that makes them — the same band
        the person and project workspaces carry, mounted rather than rewritten.
        It is a *history*, not a revision list: `memories` is edited in place and
        has no revision table, and this writes and rewrites nothing.
      */}
      <section className="entity-changes" id="changes">
        <h2>{entityCopy.recentChanges}</h2>
        <SectionOriginNote locale={locale} origin="derived" />
        <p className="section-explainer">{copy.changesExplainer}</p>
        {boundedChanges.items.length ? (
          <HistoryList copy={historyCopy} events={boundedChanges.items} formatDateTime={formatDateTime} locale={locale} />
        ) : <UniversalStateLine description={copy.changesEmpty} locale={locale} state="empty" />}
        <BoundedNotice list={boundedChanges} locale={locale} />
      </section>

      {/*
        `2N-CORRECT-002` keeps archiving and removal distinct, and this is the
        surface where the distinction stops being free: the two controls now sit
        on one page. It is placed AFTER the edit form, below archive, so the
        reversible action is the one in reach and the irreversible one has to be
        travelled to — and `deletion/copy.ts` never describes it as archiving.
      */}
      <section className="entity-danger-zone">
        <DeleteEntityControl locale={locale} entityType="memory" entityId={memory.id} />
      </section>
    </div>
  );
}
