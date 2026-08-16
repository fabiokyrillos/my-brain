import { notFound } from "next/navigation";

import { UniversalStateLine } from "@/features/experience/universal-state";

import { BrainLensTabs } from "@/features/library/brain-lenses";
import { getOwnerTimeZone } from "@/features/profile/owner-timezone";
import { getRelationsCopy } from "@/features/relations/copy";
import { loadRelations } from "@/features/relations/data";
import { RelationDiagram } from "@/features/relations/relation-diagram";
import { RelationList } from "@/features/relations/relation-list";
import { requireUser } from "@/lib/auth/require-user";
import { isLocale } from "@/lib/preferences";

/**
 * `/app/relations` — slice 2N.6's surface (`2N-RELATION-006`…`-011`,
 * `2N-ACCESS-004`), and the first graph this product has ever had.
 *
 * ## Order on the page is the contract, not a preference
 *
 * The list is rendered **first** and the drawing second. `2N-RELATION-007`
 * requires the text equivalent to carry the same information and not be a
 * degraded fallback, and building it first is the only way to make that
 * structurally true rather than periodically checked: the drawing receives a
 * strict subset of what the list already holds, so it cannot acquire exclusive
 * information without someone deliberately giving it some.
 *
 * ## Secondary, and left secondary
 *
 * `2N-RELATION-006` forbids the graph becoming primary navigation, and
 * `2I-SHELL-001` pins the four primary destinations. This route sits in the
 * `context` group at `more` visibility — the same restraint `calendar` took in
 * Phase 2M, and for the same reason: promoting a destination is an
 * information-architecture decision this slice was not authorized to make. It is
 * recorded as an owner question rather than taken unilaterally.
 *
 * ## A failed read is a failure, never an empty graph
 *
 * The loader returns an outcome and this renders it. `requireSupabaseData` would
 * throw to the error boundary, which is right for a page whose subject failed to
 * load; here the subject is a *set of links*, and an empty relations page is
 * exactly the kind of answer a reader would believe. 2N.5 found the same shape
 * live one domain over — a failed signing rendered as an absent link.
 */
export default async function RelationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const copy = getRelationsCopy(locale);

  const { supabase } = await requireUser(locale);
  // `LDC-CONTEXT-001`. One accessor, cached per request, exactly as every other
  // contextual surface stamps its instants.
  const timeZone = await getOwnerTimeZone();
  const outcome = await loadRelations(supabase, locale);

  return (
    <div className="content-page relations-page">
      <header className="list-header">
        <div>
          <p className="eyebrow">{copy.pageEyebrow}</p>
          <h1>{copy.pageTitle}</h1>
          <p>{copy.pageIntro}</p>
        </div>
      </header>

      {/*
        The strip does not promote this surface. `2N-RELATION-006` says the graph
        is never primary navigation, and it still is not: `relations` keeps
        `visibility: "more"` in `capabilities.ts` and appears in the rail only
        behind the disclosure. Being a lens of Brain is where it already sat in
        the registry — this is the strip saying so.
      */}
      <BrainLensTabs active="relations" locale={locale} />

      {outcome.status === "failed" ? (
        <section className="relations-section">
          {/* The wrapper keeps `data-relations-failed`. A read that failed is
              `error_recoverable`, which the vocabulary announces politely —
              this arrives with the page render rather than answering a click,
              so an assertive region would interrupt for no event. */}
          <div data-relations-failed="true">
            <UniversalStateLine
              description={<><strong>{copy.failedHeading}</strong> {copy.failedBody}</>}
              locale={locale}
              state="error_recoverable"
            />
          </div>
        </section>
      ) : (
        <>
          <RelationList locale={locale} projection={outcome.projection} timeZone={timeZone} />
          <RelationDiagram locale={locale} projection={outcome.projection} />
        </>
      )}
    </div>
  );
}
