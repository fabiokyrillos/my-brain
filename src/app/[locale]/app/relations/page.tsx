import { notFound } from "next/navigation";

import { UniversalStateLine } from "@/features/experience/universal-state";

import { BrainLensTabs } from "@/features/library/brain-lenses";
import { getOwnerTimeZone } from "@/features/profile/owner-timezone";
import { getRelationsCopy } from "@/features/relations/copy";
import { loadRelations } from "@/features/relations/data";
import { RelationCompactList } from "@/features/relations/relation-compact-list";
import { RelationDiagram } from "@/features/relations/relation-diagram";
import { RelationList } from "@/features/relations/relation-list";
import { RelationFocusControl, RelationViewTabs } from "@/features/relations/relation-view-controls";
import { focusableNodes, focusProjection, resolveFocus, resolveRelationView } from "@/features/relations/view";
import { requireUser } from "@/lib/auth/require-user";
import { isLocale } from "@/lib/preferences";

/**
 * `/app/relations` — slice 2N.6's surface (`2N-RELATION-006`…`-011`,
 * `2N-ACCESS-004`), and the first graph this product has ever had.
 *
 * ## Two tabs since slice 2P.6, and what that did NOT change
 *
 * `OD-2P-10`, signed in ADR-121, opens this surface on the **drawing** and keeps
 * a complete text tab beside it (`2P-RELATION-001`, `-002`). Until 2P.6 the two
 * presentations were siblings on one page, with the list rendered first — which
 * was never the point in itself. The point is `2N-RELATION-007`: the text
 * carries everything the drawing does, and is not a degraded fallback.
 *
 * That property is untouched and is now **structural in a different way**. One
 * projection is loaded, focus narrows it once, and both presentations render
 * from that same `projection` variable — so the drawing is a filter over what
 * the list holds and cannot acquire exclusive information without somebody
 * deliberately giving it some. The list additionally carries the edges the
 * drawing may not show, exactly as before.
 *
 * The tabs are **links**, not a client-side toggle. Each view has its own
 * address, so the text resolves with JavaScript off, back and forward behave,
 * and `2N-ACCESS-004`'s refusal of a gesture-only path is satisfied by the
 * browser rather than by a keyboard handler. Focus is a GET form for the same
 * reason.
 *
 * Nothing on this surface writes. `2P-RELATION-003` forbids adding inferred
 * facts and the plan's stop conditions forbid persisting a relation to improve
 * a drawing; `phase-2p-relations-guard.test.ts` asserts there is no route here
 * that could.
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
export default async function RelationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ view?: string | string[]; focus?: string | string[] }>;
}) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const copy = getRelationsCopy(locale);

  const { supabase } = await requireUser(locale);
  // `LDC-CONTEXT-001`. One accessor, cached per request, exactly as every other
  // contextual surface stamps its instants.
  const timeZone = await getOwnerTimeZone();
  const outcome = await loadRelations(supabase, locale);
  // `2P-RELATION-001`: the drawing is what an unqualified request opens on, and
  // a parameter this page does not recognise opens on it too — a bad query
  // string must not be able to make the surface unusable.
  const view = resolveRelationView((await searchParams).view);
  const requestedFocus = (await searchParams).focus;

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
        (() => {
          /*
            Focus is resolved against the projection that was loaded, never
            against a fresh read: an id that is not a person in this reader's own
            graph is discarded, so the parameter answers identically for "not
            yours", "not a person" and "nonsense" and cannot be used to test
            whether some other id exists.
          */
          const focusId = resolveFocus(requestedFocus, outcome.projection);
          const projection = focusProjection(outcome.projection, focusId);
          return (
            <>
              <RelationFocusControl
                focusId={focusId}
                locale={locale}
                options={focusableNodes(outcome.projection)}
                view={view}
              />
              <RelationViewTabs focusId={focusId} locale={locale} view={view} />
              {view === "diagram" ? (
                <>
                  <RelationDiagram locale={locale} projection={projection} />
                  {/*
                    `2P-RELATION-004`. Inside the drawing tab, because the case it
                    answers is "the figure does not fit this screen" — and
                    `2P-RELATION-003`, because each row opens that link's own
                    explanation in the text tab. It is a strict subset of the
                    drawing, so it can neither add nor hide anything.
                  */}
                  <RelationCompactList focusId={focusId} locale={locale} projection={projection} />
                </>
              ) : (
                <RelationList locale={locale} projection={projection} timeZone={timeZone} />
              )}
            </>
          );
        })()
      )}
    </div>
  );
}
