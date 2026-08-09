import { ArrowLeft, BrainCircuit } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ReturnToConversation } from "@/features/conversation-cards/return-to-conversation";
import { setMemoryLifecycle, updateMemory } from "@/features/memories/actions";
import { getMemoryCopy } from "@/features/memories/copy";
import { memoryLifecycleState } from "@/features/memories/lifecycle";
import { MemoryEditForm } from "@/features/memories/memory-edit-form";
import { asMemoryKind, asMemorySensitivity } from "@/features/memories/read";
import { requireUser } from "@/lib/auth/require-user";
import { isLocale, type Locale } from "@/lib/preferences";
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
  const { supabase } = await requireUser(locale);

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
  const [personResult, projectResult, entryResult, peopleResult, projectsResult] = await Promise.all([
    memory.person_id
      ? supabase.from("people").select("id,name").eq("id", memory.person_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    memory.project_id
      ? supabase.from("projects").select("id,name").eq("id", memory.project_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    memory.source_entry_id
      ? supabase
          .from("entries")
          .select("id,original_content,occurred_at")
          .eq("id", memory.source_entry_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("people").select("id,name").order("name").limit(200),
    supabase.from("projects").select("id,name").order("name").limit(200),
  ]);

  const person = requireSupabaseData(personResult, "load memory person");
  const project = requireSupabaseData(projectResult, "load memory project");
  const sourceEntry = requireSupabaseData(entryResult, "load memory source entry");
  const people = requireSupabaseData(peopleResult, "load people options") ?? [];
  const projects = requireSupabaseData(projectsResult, "load project options") ?? [];

  const state = memoryLifecycleState(memory, new Date());
  const kind = asMemoryKind(memory.kind);
  const sensitivity = asMemorySensitivity(memory.sensitivity);

  const retrieval =
    state === "active"
      ? copy.retrievalActive
      : state === "archived"
        ? copy.retrievalArchived
        : copy.retrievalScheduled;

  /**
   * Provenance, told apart from *absent* provenance.
   *
   * `source_entry_id` is `on delete set null`, so a memory that came from an
   * entry the owner later deleted is indistinguishable from one they typed
   * themselves — both hold `null`. The three cases are still worth
   * distinguishing where they *can* be: a live id with a row is a link, a live
   * id whose row did not load is a dangling reference worth admitting, and
   * `null` means the owner created it.
   */
  const provenance =
    memory.source_entry_id === null
      ? { label: copy.provenanceManual, href: null }
      : sourceEntry
        ? { label: copy.provenanceFromEntry, href: `/${locale}/app/inbox/${sourceEntry.id}` }
        : { label: copy.provenanceUnknown, href: null };

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
              the owner cannot read in full is one they cannot decide about. */}
          <h1 className="memory-content-heading">{memory.content}</h1>
          <p className="memory-retrieval-line">
            <span className={`memory-state memory-state-${state}`}>{copy.states[state]}</span>
            {retrieval}
          </p>
        </div>
      </header>

      <dl className="memory-facts">
        <div>
          <dt>{copy.provenance}</dt>
          <dd>
            {provenance.href ? (
              <Link href={provenance.href}>{provenance.label}</Link>
            ) : (
              provenance.label
            )}
          </dd>
        </div>
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
        <div>
          <dt>{copy.validFrom}</dt>
          <dd>{formatInstant(memory.valid_from ?? memory.created_at, locale)}</dd>
        </div>
        <div>
          <dt>{copy.validUntil}</dt>
          <dd>{memory.valid_until ? formatInstant(memory.valid_until, locale) : copy.validAlways}</dd>
        </div>
      </dl>

      {sourceEntry ? (
        <section className="entity-timeline">
          <h2>{copy.provenance}</h2>
          <div className="timeline-list">
            <article>
              <span className="timeline-dot" />
              <div>
                <Link href={`/${locale}/app/inbox/${sourceEntry.id}`}>
                  <strong>{sourceEntry.original_content}</strong>
                </Link>
                <small>{formatInstant(sourceEntry.occurred_at, locale)}</small>
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
    </div>
  );
}

function formatInstant(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short" }).format(
    new Date(value),
  );
}
