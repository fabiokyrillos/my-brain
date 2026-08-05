# Retention schedule — implemented (SH-RETENTION-001/010)

Owner-accepted in `ADR-077` (amendment P-1) before SH.6 implemented it. This
document is the operational half: what each window means for a person using the
product, what it costs them, and what has and has not actually run.

**Approval of this schedule was not authorization for a purge.** No live sweep
has executed against production. The first one is an owner decision taken after
reading a dry-run transcript, and the mechanism is built so that nothing else is
even possible: the destructive functions are executable by no role at all — not
`anon`, not `authenticated`, not `service_role` — so only the scheduler can run
them, and only once an owner enables the schedule against a deployed database.

## The windows

| Class | Window | Measured on | What a person loses at the window |
| --- | --- | --- | --- |
| `jobs` (terminal) | 90 days | `created_at` | The Jobs page stops showing processing runs older than 90 days. Live work — queued, running, or failed with attempts remaining — is never removed at any age. |
| `notifications` | 180 days | `created_at` | Notification history older than six months disappears from the notifications page. |
| `product_events` | 180 days | `created_at` | Nothing user-visible; this is the internal funnel ledger, and its own table comment promised 180 days from the day it was created. SH.6 is where the promise became true. |
| `heartbeat_runs` | 30 days | `started_at` | Nothing user-visible. Operational telemetry about the agent's own runs. |
| `undo_operations` | 30 days **past expiry** | `expires_at` | Nothing: an undo expires after 24 hours and cannot be applied afterwards, so the row is already inert for 30 days before it goes. |
| `auth_event_attempts` | 30 days | `attempted_at` | Nothing user-visible. Abuse-counting rows that hold no address and no IP. |
| `credential_validation_attempts` | 30 days | `attempted_at` | Nothing user-visible. Unchanged from BYOK; its window now reads from the same table as the rest. |

## Retained, deliberately

| Class | Reason |
| --- | --- |
| `audit_logs` | Audit integrity. An audit trail with a horizon is not an audit trail. |
| `ai_usage_events` | Billing reconciliation. The ledger has to outlive any dispute about it. |
| Interpretation versions | The user's own record of what the agent understood, which is product history rather than telemetry. |

All three are disclosed in the Privacy Policy, generated from
`src/features/legal/retention.ts` so the policy and the schedule cannot drift
(SH-LEGAL-014, T-31).

## Restoration limits, stated plainly

**A purged row is unrecoverable.** There is no soft delete, no archive and no
tombstone. The only path back is a database backup taken before the sweep ran,
and restoring one is a whole-database operation, not a per-row one.

That is the reason the dry-run exists and the reason it comes first.

## The two carve-outs, named rather than buried

**Exhausted jobs are terminal.** This schema has no `exhausted` status, so a job
that has burned every attempt sits in `failed` forever. Treating it as live
would mean it is never swept *and* that it permanently occupies a queue slot
against the SH-QUOTA-002 ceiling — a lockout with no way back. It is terminal
for retention and free for the quota, and both halves are tested.

**An undo row a candidate resolution points at is retained.**
`entry_task_candidate_resolutions.undo_operation_id` is a composite foreign key
with `NO ACTION` (`202607220041`). Deleting a referenced undo row raises a
foreign-key violation and takes the whole batch with it, so the sweep excludes
them. Nulling the pointer instead would make the delete succeed by rewriting a
resolution's record of what happened to suit a retention job, which is not a
trade this product makes. The carve-out is bounded — only confirmed candidates
create these rows — and it is proven in
`supabase/tests/signup_hardening_retention.sql`.

## How to produce a transcript

```powershell
npm run sh6:retention-dry-run          # human-readable
npm run sh6:retention-dry-run -- --json
```

It calls the seven `count_prunable_*` functions and prints class, cutoff, count,
the column each window is measured on, and the oldest surviving row. It prints
no user content and it cannot delete anything — the destructive halves are
granted to no role, so running the wrong one is not a mistake that is available.

**A non-zero count is not authorization.** Record the transcript and stop.

## Status

- Repository: **complete.** Seven sweeps, seven count-only twins sharing one
  predicate each, scheduler-only, bounded per invocation, boundary-tested in
  both directions.
- Shared environment: **not applied.** `202608050077` has not been deployed, so
  no sweep is scheduled anywhere and no window is enforced for anyone. The
  Privacy Policy still renders its honest-notice warning, and it will keep
  rendering it until the deployment readback is recorded and the `sweepActive`
  flags flip.
- Production purge: **NOT AUTHORIZED.** Not attempted, not scheduled against
  production, and not incomplete implementation — a deliberate stop.
