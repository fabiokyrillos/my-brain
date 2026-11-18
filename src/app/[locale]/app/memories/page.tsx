import { Link2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui";
import { UniversalStateView } from "@/features/experience/universal-state";
import { BrainLensTabs } from "@/features/library/brain-lenses";
import { areaByEntry, groupBySegment, memorySegment } from "@/features/memories/segments";
import { getMemoryCopy } from "@/features/memories/copy";
import { memoryLifecycleState } from "@/features/memories/lifecycle";
import { asMemoryKind } from "@/features/memories/read";
import { createProposedMemory, undoProposedMemory } from "@/features/memories/actions";
import { MemoryComposer } from "@/features/memories/memory-composer";
import { ProtectedContent } from "@/features/operations/protected-content";
import {
  deriveClaimProvenance,
  isOpenable,
  resolvableEntryIdsOf,
} from "@/features/provenance/contracts";
import { getProvenanceCopy } from "@/features/provenance/copy";
import { ProvenanceNote } from "@/features/provenance/provenance-note";
import { deriveSubjectSensitivity, readableLevelsOf } from "@/features/sensitivity/subject-derivation";
import { PaginationLinks } from "@/features/shell/pagination-links";
import { requireUser } from "@/lib/auth/require-user";
import { pageRange, paginateRows, parsePage } from "@/lib/pagination";
import { isLocale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";

/**
 * The Memories list (UX-10, UX-20, UX-21).
 *
 * Three things changed here, and each one closes a specific finding:
 *
 * - **The rows are links.** They were `<article>` elements styled as list rows
 *   with nothing to activate — UX-20's "styled as interactive, inert". There is
 *   a detail page now, so the affordance is honest rather than removed. Since
 *   the editorial recomposition (ADR-180) a row is the memory's own sentence in
 *   the reading face with one quiet line under it, and the state is said only
 *   where the memory is not in force.
 * - **`confidence` is gone.** The page rendered
 *   `Math.round(Number(memory.confidence) * 100)}%` as the row's only metadata.
 *   Every hand-written memory stores `1`, so the column read "100%" beside every
 *   row the owner wrote — a number that looked like a judgement about their own
 *   statement and could not be acted on. What replaces it is the thing that
 *   actually varies and actually matters: whether the assistant may use it.
 * - **The kind is localized in both locales.** The page kept ten Portuguese
 *   labels in a module-scope `Record<string, string>` and gave English readers
 *   `memory.kind.replaceAll("_", " ")` — the raw database enum, spaced (UX-21).
 */
export default async function MemoriesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const copy = getMemoryCopy(locale);
  const page = parsePage((await searchParams).page);
  const { from, to } = pageRange(page);
  const { supabase } = await requireUser(locale);

  const result = await supabase
    .from("memories")
    // `sensitivity` joins this projection so the list can obey the same contract
    // the detail page does. Without it, a memory the owner classified would be
    // masked on its own page and printed in full in the list that links to it —
    // the divergence `2N-PRIVACY-001` exists to end.
    .select("id,content,kind,important,person_id,project_id,source_entry_id,sensitivity,valid_from,valid_until,updated_at")
    .order("important", { ascending: false })
    .order("updated_at", { ascending: false })
    .range(from, to);
  const { items, hasNext } = paginateRows(requireSupabaseData(result, "load memories") ?? []);

  // One clock for the whole render, so two rows cannot disagree about whether
  // the same instant has passed.
  const now = new Date();
  const memoryLevels = readableLevelsOf(items);

  /*
   * `2N-KNOWS-003` — "every memory shows its source" was failing on the surface
   * most memories are actually seen from. This page already SELECTED
   * `source_entry_id` and rendered nothing with it.
   *
   * One owner-scoped read, bounded to the ids on this page, and the resolvable
   * set is built from what came BACK rather than from what was asked for. That
   * distinction is the contract: an entry that was deleted, belongs to someone
   * else, or simply did not return is absent from the set by the same route, so
   * no branch here can tell them apart and the rendered list cannot be used to
   * test whether a given entry id exists.
   */
  const sourceIds = [...new Set(items.map((memory) => memory.source_entry_id).filter((id): id is string => id !== null))];
  const sourceResult = sourceIds.length
    ? await supabase.from("entries").select("id").in("id", sourceIds)
    : { data: [], error: null };
  /*
   * `.data` is read directly, deliberately, and this is the one place on this
   * page where that is correct. A row that does not arrive stays out of the
   * resolvable set and its memory renders `unsourced` — the most protective
   * arm. Routing it through `requireSupabaseData` would turn a failed
   * provenance lookup into a failed page, and this list's job is to show
   * memories.
   */
  const resolvableEntryIds = resolvableEntryIdsOf(sourceResult.data);

  /*
    Life Brain E.4 (ADR-172): the segment of each memory, derived from the life
    area of the record it came from (`entry_entities` → `contexts.kind`) and its
    own kind. Two owner-scoped reads, both bounded by this page's source ids;
    a failure leaves every memory segmented by kind alone, never unlisted.
  */
  const areaLinks = sourceIds.length
    ? await supabase.from("entry_entities").select("entry_id,entity_id").eq("entity_type", "context").in("entry_id", sourceIds)
    : { data: [], error: null };
  const areaContextIds = [...new Set((areaLinks.data ?? []).map((link) => link.entity_id))];
  const areaContexts = areaContextIds.length
    ? await supabase.from("contexts").select("id,kind").in("id", areaContextIds)
    : { data: [], error: null };
  const kindByContext = new Map((areaContexts.data ?? []).map((context) => [context.id, context.kind]));
  const areas = areaByEntry(
    (areaLinks.data ?? []).map((link) => ({ entryId: link.entry_id, kind: kindByContext.get(link.entity_id) ?? "" })),
  );
  const groups = groupBySegment(items, (memory) => memorySegment(memory, areas));
  const positionOf = new Map(items.map((memory, index) => [memory.id, index]));
  const provenanceCopy = getProvenanceCopy(locale);

  return (
    <div className="content-page">
      <PageHeader
        actions={(
        /*
          `2P-MEMORY-001` … `-004`. The one-line field this header carried is
          gone. It was an `<input maxLength={4000}>` showing about sixty
          characters, with an `sr-only` label, no explanation of what a memory is
          for, and no step between typing and storing.

          The composer submits to `createProposedMemory` — the action the
          assistant composer already uses, which is idempotent, audits, and
          returns the created id the undo needs. `createRecord`'s memory branch
          is deleted in the same change rather than left dormant.
        */
          <MemoryComposer
            createAction={createProposedMemory}
            locale={locale}
            undoAction={undoProposedMemory}
          />
        )}
        className="list-page-header"
        description={copy.intro}
        size="compact"
        title={copy.title}
      />

      <BrainLensTabs active="memories" locale={locale} />

      {items.length ? (
        <div aria-label={copy.segmentsLabel} className="memory-segments" role="group">
        {groups.map((group) => (
        <section aria-labelledby={`memory-segment-${group.segment}`} className="memory-segment" key={group.segment}>
        <h2 className="memory-segment-title" id={`memory-segment-${group.segment}`}>
          {copy.segments[group.segment]}
          <span className="memory-segment-count">{group.items.length}</span>
        </h2>
        <ul className="memory-list">
          {group.items.map((memory) => {
            const index = positionOf.get(memory.id) ?? 0;
            const state = memoryLifecycleState(memory, now);
            const related = memory.person_id !== null || memory.project_id !== null;
            const href = `/${locale}/app/memories/${memory.id}`;
            const provenance = deriveClaimProvenance(memory.source_entry_id, resolvableEntryIds);
            return (
              /*
                The memory's own sentence is the row, and the row is the link.

                Not a `Link` wrapping the row: the reveal control is a
                `<button>` and the source is its own link, and neither may sit
                inside an anchor. `ProtectedContent` carries the `href`, so the
                title — masked or not — is what opens the memory, and
                `memories.css` stretches that one anchor's hit area over the
                row. The separate chevron link the row used to end with is gone
                with it: a second target for the same destination, named only
                "Memórias".
              */
              <li className="memory-row" key={memory.id}>
                <ProtectedContent
                  href={href}
                  locale={locale}
                  revealKey={`memory-row-${memory.id}`}
                  sensitivity={deriveSubjectSensitivity(memory.id, memoryLevels)}
                  surface="memory"
                >
                  <Link className="memory-row-title" href={href}>{memory.content}</Link>
                </ProtectedContent>
                <div className="memory-row-foot">
                  {/*
                    The state is said where it is the exception. A list of
                    memories is a list of what is in force; "Em vigor" on every
                    row was a badge that could only repeat itself, and it hid
                    the two rows that are NOT being used. The memory's own page
                    always names its state.
                  */}
                  {state === "active" ? null : (
                    <span className={`memory-state memory-state-${state}`}>{copy.states[state]}</span>
                  )}
                  {memory.important ? <span className="memory-row-important">{copy.importantBadge}</span> : null}
                  <span>{copy.kinds[asMemoryKind(memory.kind)]}</span>
                  {related ? (
                    <span className="memory-related-hint">
                      <Link2 aria-hidden="true" size={12} />
                      {memory.person_id !== null ? copy.relatedPerson : copy.relatedProject}
                    </span>
                  ) : null}
                  {/*
                    Per row, because unlike the relation panels on the person
                    page every row here genuinely has a different answer.

                    `subject` is the row's POSITION, never its content: the
                    title beside it is exactly what `ProtectedContent` may be
                    masking, and an accessible name carrying it would hand the
                    masked string to assistive technology.
                  */}
                  <ProvenanceNote
                    href={isOpenable(provenance) ? `/${locale}/app/inbox/${provenance.entryId}` : undefined}
                    locale={locale}
                    provenance={provenance}
                    subject={provenanceCopy.memorySubject(index + 1)}
                  />
                </div>
              </li>
            );
          })}
        </ul>
        </section>
        ))}
        </div>
      ) : (
        <UniversalStateView
          className="ux-state-quiet"
          description={copy.emptyBody}
          locale={locale}
          state="empty"
          title={copy.emptyTitle}
        />
      )}

      <PaginationLinks locale={locale} path="memories" page={page} hasNext={hasNext} />

      {/*
        The mental model (UX-10): what a memory is, and how it differs from the
        record list next door. It stood above the list as a tinted box on every
        visit; the header's one sentence already says what this page holds, so
        the longer account is one press away, after the memories themselves.
      */}
      <details className="memory-explainer">
        <summary>{copy.explainerSummary}</summary>
        <p>{copy.whatIsIt}</p>
        <p>{copy.howItDiffers}</p>
      </details>
    </div>
  );
}
