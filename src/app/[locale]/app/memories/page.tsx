import { BrainCircuit, ChevronRight, Link2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getMemoryCopy } from "@/features/memories/copy";
import { memoryLifecycleState } from "@/features/memories/lifecycle";
import { asMemoryKind } from "@/features/memories/read";
import { createRecord } from "@/features/operations/actions";
import { InlineCreateForm } from "@/features/operations/inline-create-form";
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
    .select("id,content,kind,important,person_id,project_id,source_entry_id,valid_from,valid_until,updated_at")
    .order("important", { ascending: false })
    .order("updated_at", { ascending: false })
    .range(from, to);
  const { items, hasNext } = paginateRows(requireSupabaseData(result, "load memories") ?? []);

  // One clock for the whole render, so two rows cannot disagree about whether
  // the same instant has passed.
  const now = new Date();

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
          {items.map((memory) => {
            const state = memoryLifecycleState(memory, now);
            const related = memory.person_id !== null || memory.project_id !== null;
            return (
              <Link className="list-row memory-row" href={`/${locale}/app/memories/${memory.id}`} key={memory.id}>
                <div className="list-row-main">
                  <strong>{memory.content}</strong>
                  <p>
                    {copy.kinds[asMemoryKind(memory.kind)]}
                    {related ? (
                      <span className="memory-related-hint">
                        <Link2 aria-hidden="true" size={12} />
                        {memory.person_id !== null ? copy.relatedPerson : copy.relatedProject}
                      </span>
                    ) : null}
                  </p>
                </div>
                <div className="list-meta">
                  {/* The state is the row's headline fact: it is the difference
                      between a memory the assistant is using and one it is not. */}
                  <span className={`memory-state memory-state-${state}`}>{copy.states[state]}</span>
                  {memory.important ? <span className="status-badge">{copy.importantBadge}</span> : null}
                  <ChevronRight aria-hidden="true" className="memory-row-chevron" size={16} />
                </div>
              </Link>
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
