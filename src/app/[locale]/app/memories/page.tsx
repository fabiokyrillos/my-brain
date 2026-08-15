import { BrainCircuit, ChevronRight, Link2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BrainLensTabs } from "@/features/library/brain-lenses";
import { getMemoryCopy } from "@/features/memories/copy";
import { memoryLifecycleState } from "@/features/memories/lifecycle";
import { asMemoryKind } from "@/features/memories/read";
import { createRecord } from "@/features/operations/actions";
import { InlineCreateForm } from "@/features/operations/inline-create-form";
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
 *   a detail page now, so the affordance is honest rather than removed.
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
  const provenanceCopy = getProvenanceCopy(locale);

  return (
    <div className="content-page">
      <header className="list-header">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p>{copy.intro}</p>
        </div>
        <InlineCreateForm action={createRecord} kind="memory" locale={locale} />
      </header>

      <BrainLensTabs active="memories" locale={locale} />

      {/*
        The mental model, said once at the top rather than implied by the rows
        (UX-10). Two sentences: what a memory is, and how it differs from the
        record list next door — which is the distinction the owner could not make
        from anything the product previously showed them.
      */}
      <section className="memory-explainer">
        <p>{copy.whatIsIt}</p>
        <p>{copy.howItDiffers}</p>
      </section>

      {items.length ? (
        <div className="list-stack">
          {items.map((memory, index) => {
            const state = memoryLifecycleState(memory, now);
            const related = memory.person_id !== null || memory.project_id !== null;
            const href = `/${locale}/app/memories/${memory.id}`;
            const provenance = deriveClaimProvenance(memory.source_entry_id, resolvableEntryIds);
            return (
              /*
                A `div` rather than a `Link` wrapping the whole row, because the
                reveal control is a `<button>` and a button inside an anchor is
                invalid markup that gives the row two conflicting activations.
                The Work list hit this exact problem first and answered it the
                same way: `ProtectedContent` carries the `href`, so the title —
                masked or not — is what opens the memory.
              */
              <div className="list-row memory-row" key={memory.id}>
                <div className="list-row-main">
                  <ProtectedContent
                    href={href}
                    locale={locale}
                    revealKey={`memory-row-${memory.id}`}
                    sensitivity={deriveSubjectSensitivity(memory.id, memoryLevels)}
                    surface="memory"
                  >
                    <Link href={href}><strong>{memory.content}</strong></Link>
                  </ProtectedContent>
                  <p>
                    {copy.kinds[asMemoryKind(memory.kind)]}
                    {related ? (
                      <span className="memory-related-hint">
                        <Link2 aria-hidden="true" size={12} />
                        {memory.person_id !== null ? copy.relatedPerson : copy.relatedProject}
                      </span>
                    ) : null}
                  </p>
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
                <div className="list-meta">
                  {/* The state is the row's headline fact: it is the difference
                      between a memory the assistant is using and one it is not. */}
                  <span className={`memory-state memory-state-${state}`}>{copy.states[state]}</span>
                  {memory.important ? <span className="status-badge">{copy.importantBadge}</span> : null}
                  <Link aria-label={copy.title} className="memory-row-chevron-link" href={href}>
                    <ChevronRight aria-hidden="true" className="memory-row-chevron" size={16} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-list">
          <BrainCircuit size={30} />
          <strong>{copy.emptyTitle}</strong>
          <p>{copy.emptyBody}</p>
        </div>
      )}

      <PaginationLinks locale={locale} path="memories" page={page} hasNext={hasNext} />
    </div>
  );
}
