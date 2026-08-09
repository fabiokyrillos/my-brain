import { notFound } from "next/navigation";
import { loadWorkProjection } from "@/features/daily-cycle/work-projection";
import { DEFAULT_WORK_QUERY, parseWorkQuery } from "@/features/daily-cycle/work-query";
import { WorkView } from "@/features/daily-cycle/work-view";
import { dateBounds } from "@/features/task-commands/detail-controls";
import { loadCandidateRelationOptions } from "@/features/tasks/relation-options";
import { requireUser } from "@/lib/auth/require-user";
import { parsePage } from "@/lib/pagination";
import { isLocale } from "@/lib/preferences";
import { getAgentName } from "@/features/profile/agent-identity";

export default async function WorkPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  /*
   * `2L-VIEW-007`/`-008`. The whole description of what the user is looking at
   * is parsed from the URL in one place, and every parameter it cannot
   * recognise resolves to the declared default — never to a wider set.
   */
  const query = parseWorkQuery(await searchParams, parsePage);
  const { supabase, user } = await requireUser(locale);

  const agentName = await getAgentName();
  /*
   * `2L-RETURN-004`. Every load is a fresh owner-scoped query. There is no
   * cache of a previous render to replay: returning to this page runs this
   * function again, against the caller's own session, at the current instant.
   */
  const load = (page: number) => loadWorkProjection(supabase, {
    userId: user.id,
    locale,
    view: query.view,
    page,
    filters: query,
  });

  let projection = await load(query.page);
  /*
   * `2L-RETURN-005` — a position that is no longer valid resolves to the
   * nearest one **and says so**.
   *
   * The case is a user returning to page seven of a set that has since lost
   * rows. The nearest valid position is the first page: this projection is
   * offset-based and has no cheap "last page with rows", and walking backwards
   * to find one would cost more reads than the fact is worth. One extra read,
   * and only when a non-first page came back empty — which is the rare case by
   * construction.
   */
  const positionAdjusted = query.page > DEFAULT_WORK_QUERY.page && projection.items.length === 0;
  if (positionAdjusted) projection = await load(DEFAULT_WORK_QUERY.page);
  const resolved = positionAdjusted ? { ...query, page: DEFAULT_WORK_QUERY.page } : query;

  /*
   * `2L-EDIT-001`. The relation pickers are loaded **once per page**, and only
   * when some row on this page actually renders one — three list queries for a
   * page of completed tasks, which admit nothing relational, would be three
   * round trips for nothing.
   */
  const controls = Object.values(projection.editControlsByTaskId).flat();
  const relations = controls.some((control) => control.relation !== null)
    ? await loadCandidateRelationOptions(supabase, user.id)
    : { projects: [], contexts: [], people: [] };

  return <WorkView agentName={agentName}
    locale={locale}
    timezone={projection.timezone}
    view={resolved.view}
    page={resolved.page}
    items={projection.items}
    hasNext={projection.hasNext}
    query={resolved}
    positionAdjusted={positionAdjusted}
    editControlsByTaskId={projection.editControlsByTaskId}
    statusByTaskId={projection.statusByTaskId}
    relationOptions={{
      project: relations.projects,
      context: relations.contexts,
      person: relations.people,
    }}
    // Computed on the server against the request's own instant, so the picker's
    // bounds are one value rather than two that could disagree across hydration.
    dateBounds={dateBounds(new Date())}
  />;
}
