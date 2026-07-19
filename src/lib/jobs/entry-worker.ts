import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// Best-effort, non-blocking nudge for the deployed entry-interpretation
// worker. The per-minute pg_cron dispatch (Slice 2X.4) already drains
// pending/failed interpret_entry jobs, so a failure here never strands
// work — it only means the job waits for the next scheduled drain instead
// of finishing immediately.
export async function kickEntryInterpretationWorker(
  supabase: SupabaseClient,
  jobId: string,
): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { error } = await supabase.functions.invoke("process-jobs", {
      body: { jobId },
      headers: { authorization: `Bearer ${session.access_token}` },
    });
    if (error) console.error("Entry worker kick failed", error.message);
  } catch (error) {
    console.error("Entry worker kick failed", error instanceof Error ? error.message : "unknown error");
  }
}
