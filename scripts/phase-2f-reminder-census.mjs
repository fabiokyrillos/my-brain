/**
 * Phase 2F pre-code Gate 4 — read-only reminder census against the linked project.
 *
 * **This script writes nothing.** It issues `select` only, through the
 * service-role client so that RLS does not hide rows belonging to users other
 * than the caller — which is the entire point of a census whose most alarming
 * bucket is "a reminder whose owner differs from its task's owner". It creates
 * no fixtures, deletes nothing, and is safe to run against production; that is
 * why it is allowed to run before the reconciliation decision exists, and why no
 * reconciliation migration may be written until it has.
 *
 * Two of the requested buckets are structurally impossible rather than merely
 * empty, and the census reports them anyway. `reminders.task_id` carries
 * `references public.tasks(id) on delete cascade` (`202607160007:36`), so a
 * dangling task reference cannot survive a commit; and `202607170016:66-68` adds
 * the composite `(user_id, task_id) references public.tasks (user_id, id)`, so a
 * reminder cannot point at another owner's task. Measuring them regardless is
 * the difference between "the constraint says this cannot happen" and "this did
 * not happen" — and this repository has already paid once for an assertion that
 * was green while testing nothing.
 *
 * Usage: `node scripts/phase-2f-reminder-census.mjs`
 */

import { createClient } from "@supabase/supabase-js";

import { getLinkedSupabaseCredentials } from "./linked-supabase.mjs";

/** Statuses from which no further user action is expected (`202607160003:103`ff). */
const TERMINAL_TASK_STATUSES = new Set(["completed", "cancelled"]);

/**
 * The only status the heartbeat will fire.
 *
 * `run_user_heartbeat` selects `reminder.status = 'scheduled'` and consults the
 * task not at all (`202607170016:508-512`). `'snoozed'` is therefore *not* live:
 * unlike `pending_questions`, no reactivation path returns a snoozed reminder to
 * `scheduled`, which is itself worth reporting.
 */
const LIVE_REMINDER_STATUS = "scheduled";

const PAGE = 1000;

async function fetchAll(client, table, select) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const page = await client.from(table).select(select).range(from, from + PAGE - 1);
    if (page.error) throw new Error(`${table}: ${page.error.message}`);
    rows.push(...(page.data ?? []));
    if ((page.data ?? []).length < PAGE) return rows;
  }
}

const credentials = getLinkedSupabaseCredentials();
const admin = createClient(credentials.url, credentials.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const reminders = await fetchAll(
  admin,
  "reminders",
  "id,user_id,task_id,entry_id,status,remind_at,snoozed_until,created_at",
);
const tasks = await fetchAll(admin, "tasks", "id,user_id,status,due_at");
const taskById = new Map(tasks.map((task) => [task.id, task]));

const live = (reminder) => reminder.status === LIVE_REMINDER_STATUS;
const bound = (reminder) => reminder.task_id !== null;

const buckets = {
  "1. live reminder on a terminal task": reminders.filter(
    (r) => live(r) && bound(r) && TERMINAL_TASK_STATUSES.has(taskById.get(r.task_id)?.status),
  ),
  "2. live task-bound reminder on a non-terminal task with null due_at": reminders.filter(
    (r) =>
      live(r)
      && bound(r)
      && taskById.has(r.task_id)
      && !TERMINAL_TASK_STATUSES.has(taskById.get(r.task_id).status)
      && taskById.get(r.task_id).due_at === null,
  ),
  "3. reminder.user_id differs from its task's user_id (composite FK forbids)": reminders.filter(
    (r) => bound(r) && taskById.has(r.task_id) && taskById.get(r.task_id).user_id !== r.user_id,
  ),
  "4. task_id references a nonexistent task (FK cascade forbids)": reminders.filter(
    (r) => bound(r) && !taskById.has(r.task_id),
  ),
  "5. snoozed rows (never fire; no reactivation path exists)": reminders.filter(
    (r) => r.status === "snoozed",
  ),
  "6. independent reminders (task_id is null)": reminders.filter((r) => !bound(r)),
  "7. live independent reminders": reminders.filter((r) => live(r) && !bound(r)),
  "8. total reminders": reminders,
  "9. total live reminders": reminders.filter(live),
};

console.log("# Gate 4 — reminder census (read-only)\n");
console.log(`Project: ${credentials.url}`);
console.log(`Rows read: ${reminders.length} reminders, ${tasks.length} tasks. No writes issued.\n`);

const width = Math.max(...Object.keys(buckets).map((k) => k.length));
for (const [label, rows] of Object.entries(buckets)) {
  console.log(`${label.padEnd(width)}  ${String(rows.length).padStart(6)}`);
}

console.log("\n## Supplementary breakdowns\n");
const byStatus = reminders.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
console.log(`reminder status distribution: ${JSON.stringify(byStatus)}`);
const independentWithEntry = reminders.filter((r) => !bound(r) && r.entry_id !== null).length;
console.log(`independent reminders that still carry an entry_id: ${independentWithEntry}`);
const overdueLive = reminders.filter((r) => live(r) && new Date(r.remind_at) <= new Date()).length;
console.log(`live reminders already past remind_at (heartbeat would fire on next tick): ${overdueLive}`);
const distinctOwners = new Set(reminders.map((r) => r.user_id)).size;
console.log(`distinct reminder owners: ${distinctOwners}`);

const reconcilable = buckets["1. live reminder on a terminal task"].length
  + buckets["2. live task-bound reminder on a non-terminal task with null due_at"].length;
console.log(`\n## Reconciliation population\n`);
console.log(`Rows a §4(2) reconciliation would touch under the proposal's stated predicate: ${reconcilable}`);
console.log(
  `Rows it would touch if the predicate were written as a naive join without a`
  + ` \`task_id is not null\` guard: ${reconcilable + buckets["7. live independent reminders"].length}`
  + ` (the difference is user-authored independent reminders — F9's failure mode).`,
);
