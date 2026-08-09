import { notFound } from "next/navigation";
import { loadWorkProjection, parseWorkView } from "@/features/daily-cycle/work-projection";
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
  searchParams: Promise<{ view?: string | string[]; page?: string | string[] }>;
}) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const query = await searchParams;
  const view = parseWorkView(query.view);
  const page = parsePage(query.page);
  const { supabase, user } = await requireUser(locale);

  const agentName = await getAgentName();
  const projection = await loadWorkProjection(supabase, {
    userId: user.id,
    locale,
    view,
    page,
  });

  /*
   * `2L-EDIT-001`. The relation pickers are loaded **once per page**, and only
   * when some row on this page actually renders one — three list queries for a
   * page of completed tasks, which admit nothing relational, would be three
   * round trips for nothing. This is the same test the task detail applies,
   * widened from one row to the page's own rows and no further.
   */
  const controls = Object.values(projection.editControlsByTaskId).flat();
  const relations = controls.some((control) => control.relation !== null)
    ? await loadCandidateRelationOptions(supabase, user.id)
    : { projects: [], contexts: [], people: [] };

  return <WorkView agentName={agentName}
    locale={locale}
    timezone={projection.timezone}
    view={view}
    page={page}
    items={projection.items}
    hasNext={projection.hasNext}
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
