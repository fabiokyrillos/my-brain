# Signup Hardening — final report

**Date:** 2026-08-05 · **Slices:** SH.0 – SH.7 · **Migrations:** 8 of 8 budgeted,
spent and not exceeded · **Chain head:** `202608050077` · **Hosted parity:**
`202608050077`

**Public signup is closed and this initiative did not open it.** That was never
its job: SH-ROLLOUT-005 is post-initiative and owner-only, and what this
initiative produces is the fail-closed gate that says whether it may.

---

## 1. The rollout gate, executed

`npm run rollout:verify`, against the deployed project, 2026-08-05:

**25 pass · 3 fail · 2 owner-signature.**

A failed or unsigned gate is a closed door, and the script has no path that
reports otherwise. The three failures and two signatures are the honest remaining
distance to opening signup:

| Gate | State | Why |
| --- | --- | --- |
| **RG-QUO-3** | FAIL | Retention sweeps are built, dry-run recorded, and **deliberately not scheduled** (ADR-082). Enabling them is the authorization of the first live purge. |
| **RG-DEP-1** | FAIL | Production SMTP is not configured (`smtp_host = null`, read back). No readiness is claimed. |
| **RG-DEP-3** | FAIL | Backup restored to a disposable project has never been performed (SH-GD.2). |
| **RG-LEG-4** | OWNER | Professional legal review is a human signature; the drafts ship with a visible banner. |
| **RG-DEP-4** | OWNER | Monitoring and incident-handling adequacy is a human signature. |

The other 25 gates are green on evidence, not on assertion: hosted readbacks for
the Auth posture, executed probes for the exposure closures, artifacts resolved
on disk for everything else.

`src/lib/closeout/signup-rollout-gate.test.ts` proves the script fails closed —
30 cases, including that **no gate passes against an empty repository** and that
every hosted gate fails rather than skips when the readback is unavailable.

## 2. Every requirement accounted for (SH-OPERATIONS-005)

`npm run docs:signup-hardening:traceability` generates
`SIGNUP_HARDENING_TRACEABILITY_MATRIX.md` and **fails rather than print an
unresolved claim**.

**137 requirements across 16 families. Delivered 131 · deferred with a
destination 3 · not delivered and named 3.** Every requirement is in exactly one
class; a requirement in none fails the generator, which is SH-OPERATIONS-005
expressed as a program rather than as a promise to be thorough.

**Deferred, each with a destination:**

| Requirement | Destination |
| --- | --- |
| SH-SIGNUP-005 | Confirmation-required behavioural half — blocked on custom SMTP |
| SH-SIGNUP-008 | Resend ceiling measurement — blocked on custom SMTP |
| SH-SIGNUP-011 | Enumeration timing residual — declared measure-once, still unmeasured |

**Not delivered, and named:**

| Requirement | Reason |
| --- | --- |
| SH-ROLLOUT-005 | Opening signup is post-initiative and owner-only by design |
| SH-LEGAL-013 | The drafts ship honestly labeled; the review itself is an owner signature |
| SH-STORAGE-006 | v1 no-malware-scanner posture, owner-accepted (ADR-077), compensating controls declared |

## 3. Post-initiative re-census (SH-EXPOSURE-007)

Read back from the deployed project after all eight migrations:

| Property | Reading |
| --- | --- |
| Public base tables | 46 |
| User-owned tables missing forced RLS | **none** |
| `anon` explicit table grants | **none** |
| Tables with zero `service_role` grants | exactly the six the census pins: `account_deletion_log`, `auth_event_attempts`, `credential_validation_attempts`, `product_events`, `task_command_confirmations`, `user_ai_credentials` |

### The one delta, measured rather than assumed

The hosted catalog shows `anon` holding explicit EXECUTE on **eight functions**
the CI census does not: `audit_task_change`, `create_due_task_reminder`,
`link_interpreted_entities`, `mark_historical_summaries_outdated`,
`normalize_pending_questions`, `protect_entry_original`, `rls_auto_enable`,
`set_updated_at`. All eight predate this initiative; the divergence is the
FINDINGS §12.3 local/hosted platform-default difference, live again.

**The reachable surface is nevertheless unchanged, and that was measured.** Every
one was called as `anon` against the deployed PostgREST:

- seven answered **`404 PGRST202`** — PostgREST does not expose trigger-returning
  functions at all, so the grant has nothing to act on;
- `rls_auto_enable` answered **`400 0A000`**, refusing as an event-trigger
  function.

So the delta is a **catalog** difference and not a **reachable** one, which is
what SH-EXPOSURE-007 actually asks about. Recorded rather than closed: revoking
eight pre-existing grants would need a migration this initiative has no budget
for, and the exposure it would remove is zero. **Destination: any future slice
that opens a migration on these functions for another reason.**

## 4. Storage posture (SH-STORAGE-005)

Read back from the deployed project:

| Property | Reading |
| --- | --- |
| `user-files` bucket public | **false** |
| File size limit | `26214400` — the `ATTACHMENT_LIMITS.maxBytes` constant |
| MIME allowlist entries | 8 — the constant's list |
| Own-prefix policies | **4**: `user_files_select_own`, `user_files_insert_own`, `user_files_update_own`, `user_files_delete_own` |

The first cut of that policy count read **3**, because it filtered on `qual`
alone and an INSERT policy carries `with_check` instead. Recorded because it is
the same shape as two other defects this initiative found: a probe that reads the
wrong column reports a shortfall that is not there, and a probe that reads the
wrong thing reports a sufficiency that is not there either.

## 5. What this initiative found, across all slices

Nine defects were caught by mechanisms rather than by reading, and the causes
generalise:

1. A `BEFORE ... FOR EACH ROW` trigger cannot see its own statement's earlier
   rows, so any per-owner ceiling checked that way falls to one array-bodied POST.
2. This schema has no `exhausted` job status — counting spent `failed` jobs as
   live is a permanent lockout rather than a ceiling.
3. A PRD's claim that "nothing uses this grant" is a hypothesis; two real callers
   depended on the `service_role` grant SH-EXPOSURE-001 removes.
4. A census must read the catalog, not the migration chain: platform defaults
   grant privileges no migration mentions.
5. **A migration that schedules a destructive sweep has already authorized it**
   (ADR-082) — the one that would have caused real harm on a slightly older
   database.
6. A transcript that prints "(none in window)" for a table it is *refused* on
   dresses the absence of evidence as evidence.
7. An acceptance script that reaches an administrative RPC has joined the
   administrative boundary; CI caught it, and the fix was to shrink the script
   rather than widen the allowlist.
8. A guard that cannot tell code from prose reports the wrong answer in whichever
   direction the prose runs (`RG-BYOK-2`'s first cut).
9. A readback filtered on the wrong column under-reports (§4 above).

## 6. Status

**Signup Hardening is complete as an initiative.** Every slice is closed, every
migration is deployed, the gate exists and runs, and every requirement is
accounted for.

**Public signup remains closed.** Opening it requires one green run of
`npm run rollout:verify` — currently 3 fail and 2 unsigned — then an owner flip
of `disable_signup`, then a second green run against the open state
(SH-ROLLOUT-005). There is no manual-confidence path and this report does not
create one.

**First live production purge: NOT AUTHORIZED / NOT EXECUTED.**
