import { Layers } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { createContext } from "@/features/entities/actions";
import { loadContexts } from "@/features/entities/contexts";
import { getEntityCopy } from "@/features/entities/copy";
import { EntityCreateForm } from "@/features/entities/entity-create-form";
import { BrainLensTabs } from "@/features/library/brain-lenses";
import { PaginationLinks } from "@/features/shell/pagination-links";
import { contextKindLabel, getVocabularyCopy } from "@/features/vocabulary/copy";
import { requireUser } from "@/lib/auth/require-user";
import { parsePage } from "@/lib/pagination";
import { isLocale } from "@/lib/preferences";

/**
 * The contexts list (EGC-CTX-001, EGC-SURFACE-001).
 *
 * `contexts` has been read by the Person page since `202607160009` — it resolves
 * `person_contexts` into names — and has never had a route of its own. A context
 * could therefore exist, be attached to somebody, and be neither viewable nor
 * correctable.
 *
 * `kind` renders through `contextKindLabel` rather than raw, which is UX-21's
 * rule: a database token with the underscores taken out is still a database
 * token. An unrecognised value takes the neutral fallback.
 */
export default async function ContextsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const copy = getEntityCopy(locale);
  const vocabulary = getVocabularyCopy(locale);
  const page = parsePage((await searchParams).page);
  const { supabase } = await requireUser(locale);
  const { items, hasNext } = await loadContexts(supabase, page);

  return (
    <div className="content-page">
      <header className="list-header">
        <div>
          <p className="eyebrow">{copy.contextsEyebrow}</p>
          <h1>{copy.contextsTitle}</h1>
          <p>{copy.contextsIntro}</p>
        </div>
        <EntityCreateForm action={createContext} kind="context" locale={locale} />
      </header>

      {/* Contextos is presented as a lens of Brain and keeps its own route and
          deep links (ADR-114 Decision 6). No entity became a database property
          and no schema moved to say so. */}
      <BrainLensTabs active="contexts" locale={locale} />

      {items.length ? (
        <div className="list-stack">
          {items.map((context) => (
            <Link className="list-row" href={`/${locale}/app/contexts/${context.id}`} key={context.id}>
              <div className="list-row-main">
                <strong>{context.name}</strong>
                <p>{context.description ?? copy.noDescription}</p>
              </div>
              <div className="list-meta">
                <span className="status-badge">
                  {contextKindLabel(locale, context.kind) ?? vocabulary.unknownState}
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty-list">
          <Layers size={30} />
          <strong>{copy.contextsListEmpty}</strong>
          <p>{copy.contextsListEmptyHint}</p>
        </div>
      )}

      <PaginationLinks hasNext={hasNext} locale={locale} page={page} path="contexts" />
    </div>
  );
}
