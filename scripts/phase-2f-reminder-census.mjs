/**
 * Phase 2F reminder census — pre-code Gate 4, and the Slice 2F.6 closeout
 * stop-gate (`2F-OPERATIONS-005`, owner decision 2).
 *
 * **This script writes nothing.** It issues `select` only, through the
 * service-role client so that RLS does not hide rows belonging to users other
 * than the caller — which is the entire point of a census whose most alarming
 * bucket is "a reminder whose owner differs from its task's owner". It creates
 * no fixtures, deletes nothing, and is safe to run against production; that is
 * why it is allowed to run before the reconciliation decision exists, and why no
 * reconciliation migration may be written until it has. A Vitest case asserts
 * this file still contains no `insert`, `update`, `delete`, `upsert` or `rpc`
 * call, so the guarantee is mechanical rather than a promise in a comment.
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
 * Two corrections landed in Slice 2F.6, both recorded rather than silently
 * applied (definitive Slice 2F.6 PRD §26 Mo1 and Mo2):
 *
 *   * **Paging carries a total order.** `fetchAll` used `.range()` with no
 *     `order`, so PostgREST paged an unordered relation. `taskById` is what the
 *     two *blocking* buckets join against, and a skipped task page turns a real
 *     bucket-1 row into `TERMINAL_TASK_STATUSES.has(undefined)` — false — so the
 *     stop-gate failed **open**. Slice 2F.5 had already fixed the same defect
 *     class in the command-funnel reader by moving to keyset paging on
 *     `(created_at, id)`; here a total order on the primary key is sufficient,
 *     because `id` is unique and the census reads whole tables rather than a
 *     window. Exhaustion is asserted rather than assumed.
 *   * **The read is not atomic, and that is stated rather than worked around.**
 *     Two independent PostgREST reads are joined in memory. A task completed
 *     between them presents as bucket 1 ("live reminder on a terminal task"),
 *     and both `run_user_heartbeat` (`202607170016:552-560`) and
 *     `apply_task_command` move rows on exactly this pair. A nonzero blocking
 *     bucket therefore requires a **second confirming run** before it escalates.
 *     A snapshot-consistent read would need a new RPC, which the closeout slice
 *     forbids; naming the limitation beats inventing an exception to that rule.
 *
 * The bucket predicates are exported as pure functions so CI can prove them.
 * That is an extraction, not a rewrite: the client construction, this
 * docstring's guarantee and every `select` list are byte-identical to the
 * pre-2F.6 version, which is what keeps `2F-PRECOND-001`'s preservation
 * obligation intact while serving its actual purpose — that the preserved proofs
 * cannot silently rot.
 *
 * One predicate widened, and it is recorded rather than folded into "identical":
 * `bound()` tested `task_id !== null` and now also excludes `undefined`. Against
 * the deployed project that is a no-op — PostgREST renders SQL NULL as `null` and
 * never as `undefined` — so no bucket can move. It exists for the injected rows
 * the CI cases feed the predicates, where a missing key is the natural way to
 * express an absent column.
 *
 * Usage: `npm run test:remote:2f:census` (or `node scripts/phase-2f-reminder-census.mjs`)
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { getLinkedSupabaseCredentials } from "./linked-supabase.mjs";

/** Statuses from which no further user action is expected (`202607160003:103`ff). */
export const TERMINAL_TASK_STATUSES = new Set(["completed", "cancelled"]);

/**
 * The only status the heartbeat will fire.
 *
 * `run_user_heartbeat` selects `reminder.status = 'scheduled'` and consults the
 * task not at all (`202607170016:508-512`). `'snoozed'` is therefore *not* live:
 * unlike `pending_questions`, no reactivation path returns a snoozed reminder to
 * `scheduled`, which is itself worth reporting.
 */
export const LIVE_REMINDER_STATUS = "scheduled";

/** The two buckets whose nonzero value halts closeout (PRD §6.12, §8). */
export const BLOCKING_BUCKETS = Object.freeze([
  "1. live reminder on a terminal task",
  "2. live task-bound reminder on a non-terminal task with null due_at",
]);

/** Reported with the closeout record, never blocking: a nonzero value is Option C working. */
export const INFORMATIONAL_BUCKET = "7. live independent reminders";

const PAGE = 1000;

/**
 * Reads a whole table in ordered pages.
 *
 * The `order` is load-bearing, not stylistic: `range()` is `LIMIT/OFFSET`, and
 * an `OFFSET` over an unordered relation may return a row twice or never.
 * Exhaustion is asserted — a table that keeps returning full pages past a
 * generous ceiling means the order is not total and the read cannot be trusted.
 */
export async function fetchAll(client, table, select, { page = PAGE, maxPages = 1000 } = {}) {
  const rows = [];
  for (let index = 0; index < maxPages; index += 1) {
    const from = index * page;
    const result = await client
      .from(table)
      .select(select)
      .order("id", { ascending: true })
      .range(from, from + page - 1);
    if (result.error) throw new Error(`${table}: ${result.error.message}`);
    const batch = result.data ?? [];
    rows.push(...batch);
    if (batch.length < page) return rows;
  }
  throw new Error(
    `${table}: read ${maxPages} full pages without exhausting the table. `
    + "Either the table is larger than this census is built for, or the paging order is not total — "
    + "either way the counts below cannot be trusted and the census refuses to report them.",
  );
}

/**
 * The nine census buckets, computed from two already-read row sets.
 *
 * Pure by construction so CI can prove each predicate against injected rows: a
 * bucket that silently inverts would otherwise be caught by nobody, and the two
 * blocking buckets decide whether closeout proceeds.
 */
export function computeReminderCensus(reminders, tasks) {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const live = (reminder) => reminder.status === LIVE_REMINDER_STATUS;
  const bound = (reminder) => reminder.task_id !== null && reminder.task_id !== undefined;

  return {
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
}

/** The supplementary breakdowns, also pure. `now` is injected so the report is reproducible. */
export function computeReminderBreakdowns(reminders, now = new Date()) {
  const live = (reminder) => reminder.status === LIVE_REMINDER_STATUS;
  const bound = (reminder) => reminder.task_id !== null && reminder.task_id !== undefined;
  return {
    byStatus: reminders.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {}),
    independentWithEntry: reminders.filter((r) => !bound(r) && r.entry_id !== null).length,
    overdueLive: reminders.filter((r) => live(r) && new Date(r.remind_at) <= now).length,
    distinctOwners: new Set(reminders.map((r) => r.user_id)).size,
  };
}

/** The population a §4(2) reconciliation would have touched — the two blocking buckets. */
export function reconciliationPopulation(buckets) {
  return BLOCKING_BUCKETS.reduce((total, label) => total + buckets[label].length, 0);
}

/** True when closeout must halt and escalate for an owner decision (PRD §6.12). */
export function stopGateTriggered(buckets) {
  return BLOCKING_BUCKETS.some((label) => buckets[label].length > 0);
}

export async function runReminderCensus({ log = console.log } = {}) {
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

  // One clock for the whole report. `computeReminderBreakdowns` takes an injected
  // `now` so the run is reproducible, and calling it without one computed
  // `overdueLive` against a different instant than the `Executed:` line printed.
  const executedAt = new Date();
  const buckets = computeReminderCensus(reminders, tasks);
  const breakdowns = computeReminderBreakdowns(reminders, executedAt);

  log("# Gate 4 — reminder census (read-only)\n");
  log(`Project: ${credentials.url}`);
  log(`Executed: ${executedAt.toISOString()}`);
  log(`Rows read: ${reminders.length} reminders, ${tasks.length} tasks. No writes issued.\n`);

  const width = Math.max(...Object.keys(buckets).map((key) => key.length));
  for (const [label, rows] of Object.entries(buckets)) {
    const marker = BLOCKING_BUCKETS.includes(label)
      ? "  (blocking)"
      : (label === INFORMATIONAL_BUCKET ? "  (informational)" : "");
    log(`${label.padEnd(width)}  ${String(rows.length).padStart(6)}${marker}`);
  }

  log("\n## Supplementary breakdowns\n");
  log(`reminder status distribution: ${JSON.stringify(breakdowns.byStatus)}`);
  log(`independent reminders that still carry an entry_id: ${breakdowns.independentWithEntry}`);
  log(`live reminders already past remind_at (heartbeat would fire on next tick): ${breakdowns.overdueLive}`);
  log(`distinct reminder owners: ${breakdowns.distinctOwners}`);

  const reconcilable = reconciliationPopulation(buckets);
  log("\n## Reconciliation population\n");
  log(`Rows a §4(2) reconciliation would touch under the proposal's stated predicate: ${reconcilable}`);
  log(
    "Rows it would touch if the predicate were written as a naive join without a"
    + ` \`task_id is not null\` guard: ${reconcilable + buckets[INFORMATIONAL_BUCKET].length}`
    + " (the difference is user-authored independent reminders — F9's failure mode).",
  );

  log("\n## Read atomicity — a limitation, not a footnote\n");
  log(
    "This census issues two independent PostgREST reads (reminders, then tasks) and joins them in\n"
    + "memory. It is not a snapshot. A task completed between the two reads presents as bucket 1, and\n"
    + "both run_user_heartbeat and apply_task_command move rows on exactly this pair. A nonzero\n"
    + "bucket 1 or 2 therefore requires a SECOND CONFIRMING RUN before it escalates as the closeout\n"
    + "stop-gate; a single observation is not sufficient to halt the phase.",
  );

  log("\n## Stop-gate\n");
  if (stopGateTriggered(buckets)) {
    log(
      "STOP-GATE TRIGGERED. A blocking bucket is nonzero. Re-run this census to confirm; if the\n"
      + "second run agrees, closeout HALTS and a new owner decision is required. No migration is\n"
      + "authorized by this finding (PRD §6.12, 2F-OPERATIONS-005).",
    );
  } else {
    log("Clear: buckets 1 and 2 are both zero. Bucket 7 is reported informationally and does not block.");
  }

  return {
    buckets,
    breakdowns,
    reconcilable,
    stopGate: stopGateTriggered(buckets),
    project: credentials.url,
    executedAt: executedAt.toISOString(),
  };
}

const invokedDirectly = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const result = await runReminderCensus();
  if (result.stopGate) process.exitCode = 1;
}
