import { notFound } from "next/navigation";
import { runTaskCommand } from "@/features/task-commands/actions";
import { CancelledTasksView } from "@/features/task-commands/cancelled-tasks-view";
import { loadCancelledTaskRecovery } from "@/features/task-commands/recovery";
import { requireUser } from "@/lib/auth/require-user";
import { defaultAgentPreferences, isLocale } from "@/lib/preferences";

/**
 * The cancelled-task recovery surface (PRD 2E-DESTRUCTIVE-006).
 *
 * A nested route under `work` rather than a fourth `WorkViewId`. Adding
 * `"cancelled"` to `workViews` would force it into `workItemHumanStates`,
 * `projection-mappers.ts`, `availableActions`, the `dailyCycleActions`
 * allowlist, `humanStateCopy` and the `work_view_viewed` property enum — making
 * a Phase 2E recovery surface a change to the daily-cycle product contract, for
 * a surface whose data source is a Phase 2E RPC rather than `work-projection`.
 *
 * Its link is rendered by `WorkView`. `capabilities.ts`'s `nested: true` only
 * drives active-state highlighting; navigation links render exclusively from
 * `primaryNavigationKeys`/`moreNavigationGroups`, so without that link this
 * route would be reachable only by typing the URL and 2E-DESTRUCTIVE-006's
 * "explicit affordance" would be unmet.
 */
export default async function CancelledTasksPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const { supabase, user } = await requireUser(locale);

  const profile = await supabase
    .from("profiles")
    .select("timezone")
    .eq("user_id", user.id)
    .maybeSingle();
  const timeZone = profile.data?.timezone ?? defaultAgentPreferences.timezone;

  const recovery = await loadCancelledTaskRecovery(supabase, {
    ownerId: user.id,
    now: new Date().toISOString(),
    timeZone,
    locale,
  });

  return (
    <CancelledTasksView
      action={runTaskCommand}
      hasMore={recovery.hasMore}
      locale={locale}
      tasks={recovery.tasks}
    />
  );
}
