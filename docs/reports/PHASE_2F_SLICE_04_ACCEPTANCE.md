# Phase 2F — Slice 2F.4 acceptance report

**Task grant revocation and test-suite semantic migration. Deployed and accepted.**

Deployment session executed 2026-07-29 against the linked project **`ulvwzqlpsjyrnqzfxmck`** (`my-brain`). Every gate below was **executed**; nothing is cited from static reasoning.

---

## 1. Identities

| | |
|---|---|
| **Implementation merge SHA** | **`c174f8fda7607ade2dc5d5b5d7fd1e40a749f736`** (PR #28) |
| **Prerequisite correction commit** | **`ecee755dc24ed4f7c6b3683f4e7ea5d90d269dc5`** |
| **Prerequisite correction merge SHA** | **`ba63204cacefb5366518cf7729fb3b679e15c5fd`** (PR #29) |
| Migration deployed | **`202607300063_phase_2f_task_grant_revocation.sql`** — the only one |
| Merge-SHA CI (2F-OPERATIONS-002) | run `30479818771` on `c174f8f` — application, edge worker, database and journey **all success** |

Slice 2F.3's acceptance evidence reached `main` separately as PR #27 → `e8b4bf2`, restoring the pattern PR #25 set for Slice 2F.2. It is not part of this slice's diff.

## 2. Deployment

| | |
|---|---|
| **Command** | `npx supabase db push --linked` |
| **Start** | **2026-07-29 18:38:20Z** |
| **End** | **2026-07-29 18:38:28Z** (8 seconds) |
| Output | `Applying migration 202607300063_phase_2f_task_grant_revocation.sql...` → `Finished supabase db push.` |
| Manual intervention | **none**; no ad hoc SQL before or after |
| **Parity** | **`202607290062` → `202607300063`** |

The migration's nine fail-closed post-deploy assertion groups all passed. They raise and abort the enclosing transaction, so a successful apply **is** their proof — not a separate claim about it.

## 3. Live privilege matrix

Read directly from the deployed catalog, before and after, so the denial is measured against a baseline rather than assumed.

| Table | Role | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|---|
| `public.tasks` | `authenticated` | **allowed** | **denied** | **denied** | **denied** |
| `public.tasks` | `anon` | denied | denied | denied | denied |
| `public.reminders` | `authenticated` | **allowed** | **allowed** | **denied** | **denied** |
| `public.reminders` | `anon` | denied | denied | denied | denied |

**Pre-deployment the same query returned all four privileges true for `authenticated` on both tables.** That is what makes the post-deployment denial non-vacuous: the privileges existed, were measured, and were removed.

Structural verification, same session: RLS `enable` **and** `force` on 2/2 tables; **8/8** owner-scoped policies present; **6/6** user-defined triggers present; `public.create_due_task_reminder` still **SECURITY INVOKER**.

## 4. Behavioural evidence through PostgREST

Every denial below returned **`42501 permission denied for table <t>`** through the live client surface with a real end-user token — never `service_role`, because a service-role client bypasses both RLS and the grant under test.

### Stale and fresh session convergence — **passed**

The residual CI explicitly could not prove. A session was minted **before** the migration and held across it:

| Session | task INSERT | task UPDATE | task DELETE | task SELECT |
|---|---|---|---|---|
| **Stale** (pre-migration JWT) | denied `42501` | denied `42501` | denied `42501` | allowed, 1 row |
| **Fresh** (post-migration) | denied `42501` | denied `42501` | denied `42501` | allowed, owner-scoped |

**No stale session retained its write ability.** PostgREST reflected the revocation immediately; no cache-convergence delay was observed.

### Reminders — Option C intact

| Operation | Result |
|---|---|
| INSERT | **succeeds** — the Option C authoring exception is alive |
| SELECT | succeeds |
| UPDATE | denied `42501` |
| DELETE | denied `42501` |

## 5. Production flows — 14/14

The surviving write path, exercised end to end against the deployed contract:

| Check | Result |
|---|---|
| Creation confirmation issued after revocation | pass |
| Task created through the definer contract | pass |
| `created_by = 'user'` persisted, no invented qualifier (`status=inbox`, `due_at=null`) | pass |
| Audit `actor = 'user'` | pass, 1 row |
| **The same caller still cannot INSERT directly (`42501`)** | pass |
| Operation-key replay returns the original identity (`idempotent=true`) | pass |
| Undo of a user-origin task functions | pass |
| Undo cancelled the created task (`status=cancelled`) | pass |
| Due-dated creation confirmation + creation | pass |
| **`create_due_task_reminder` fired inside the definer path** (2F-REVOKE-002) | pass, 1 scheduled reminder |
| Two-owner: owner resolves their own row (non-vacuous) | pass, 1 row |
| Two-owner: stranger reads zero rows | pass |
| Two-owner: stranger's undo refused | pass, `P0002` |
| Cleanup | 0 residue |

The fifth row is the decisive one: **the same caller that creates a task through the validated contract is refused `42501` on a direct INSERT.** That is the invariant this phase exists to establish, observed live rather than argued.

## 6. Cross-owner proof and read-side RLS

| Check | Result |
|---|---|
| **Cross-owner `23503`** | **passed** — `insert or update on table "task_projects" violates foreign key constraint "task_projects_project_owner_fk"`, issued by the owner's **own end-user client** |
| Task read-side RLS — owner | **sees 1** row |
| Task read-side RLS — stranger | **sees 0** rows |

The `23503` proof is preserved exactly. Its task fixture moved to the service-role client because `authenticated` lost INSERT, but the failing statement is still issued by `first`'s own end-user client against `public.task_projects`, which was not revoked — so it still fails on the composite ownership foreign key, not on a grant.

**Write-side RLS on `public.tasks` is no longer reachable from any client role** — the grant check runs before a policy is consulted. That evidence loss is stated, not implied. The compensation is the read-side proof above, asserted in **both** directions so the isolation half cannot pass vacuously, plus RPC-boundary denial (`P0002`).

## 7. Final remote suite

**`npm run test:remote` — exit 0**, from merged `main` content (blob `78e75d86…`, byte-identical on `ecee755` and `ba63204`).

### AI usage evidence

| | |
|---|---|
| Visible rows | **2** |
| Visible request-ID set | **exactly** `smoke-own-<suffix>` and `smoke-command-<suffix>` |
| Foreign-owned rows | **0** |
| Second user's own event | **absent** |
| `allTimeCalls` | **2** |
| `allTimeCostNanoUsd` | **5,170,000** |

Also green in the same run: cross-owner `23503`; read-side task RLS both directions; authenticated reminder INSERT; and every remaining pre-existing invariant through the deployed file worker.

## 8. The pre-existing remote-smoke defect — not this slice's

**The two stale assertions were Slice 2E.1 test defects, corrected separately in PR #29, and changed no production semantics.** This is recorded plainly because a reader arriving at the git history could otherwise conclude Slice 2F.4 broke the smoke.

| Commit | What it did |
|---|---|
| `5099f81` | wrote both assertions when `first` recorded exactly **one** AI-usage event |
| `6c4a907` (Slice 2E.1 corrections) | added a **second** legitimate event and updated **neither** assertion |

`git log -S` over both assertion strings confirms neither appears in `6c4a907`'s diff.

**Slice 2F.4 did not cause the defect; it made the defect matter.** This slice reworked the smoke's task fixture to seed through the service-role client, because the revocation removed `authenticated`'s INSERT. That rework, the cross-owner `23503` proof it protects, and the read-side RLS evidence it adds all sit *after* the two stale assertions — so the script aborted before reaching any of them, and gate 9 could not complete until they were fixed.

The correction, in one file (`scripts/remote-supabase-smoke.mjs`), weakened nothing: every value stayed an exact equality, the ownership check that the stale count had kept permanently unreachable now actually executes, and it gained a stricter companion naming the row that must be absent. The aggregate `5,170,000` was **derived** from the billing expression at `202607160015:167-172` and validated by reproducing the committed `3,550,000` figure for the first event. No production source, database object, migration, grant, RLS policy, trigger, RPC or pricing logic changed.

## 9. Rollback

**Not required and not executed.** No live re-grant ran. `scripts/phase-2f-regrant-task-write-grants.sql` remains committed and unexecuted against any project; its CI rehearsal is the only place it has run, at the scope stated there — SQL-level restoration of versioned chain privileges, never a live-ops rehearsal.

This slice has **no data residual of any kind**: a revocation writes no rows, and no application source changed.

## 10. Cleanup and residue

**Zero residue**, verified after the final suite run:

```
remoteSmokeObjects: 0
tasks: 0   reminders: 0   undo_operations: 0   ai_usage_events: 0
projects: 0   people: 0   task_projects: 0   task_contexts: 0
task_people: 0   task_dependencies: 0   attachments: 0
pending_questions: 0   entry_task_candidate_resolutions: 0
tablesNotYetDeployed: []
```

`task_command_confirmations` is reported as unreadable by `service_role` rather than zero — `202607260059` revokes it from that role by design. The refusal is asserted, not assumed, and an orphan there is structurally impossible under the `on delete cascade` to `auth.users`.

Every temporary deployment probe was removed; the working tree is clean and no probe source was committed.

## 11. Acceptance gates

| # | Gate | Result |
|---|---|---|
| 1 | Parity `202607290062` → `202607300063` | ✅ |
| 2 | Migration applies without manual intervention | ✅ |
| 3 | Live grant checks match the authorized posture | ✅ |
| 4 | PostgREST reflects the revocation | ✅ |
| 5 | Fresh sessions reflect the revocation | ✅ |
| 6 | Direct task INSERT, UPDATE, DELETE fail | ✅ `42501` |
| 7 | Reminder INSERT succeeds | ✅ |
| 8 | Reminder UPDATE and DELETE fail | ✅ `42501` |
| 9 | **Full remote suite passes** | ✅ exit 0 (after PR #29) |
| 10 | Cross-owner `23503` meaningful and green | ✅ |
| 11 | Task creation and command behaviour green | ✅ 14/14 |
| 12 | No rollback required | ✅ |
| 13 | No `src/` change | ✅ zero |
| 14 | No additional migration | ✅ exactly one |
| 15 | Deferred census did not run | ✅ |
| 16 | Slices 2F.5 and 2F.6 did not start | ✅ |

**All sixteen gates pass. Slice 2F.4 is accepted.**

## 12. Scope confirmations

- **Deferred reminder census: not run.** `scripts/phase-2f-reminder-census.mjs` remains the 2F.6 closeout stop-gate, untouched.
- **Slice 2F.5 and Slice 2F.6: not started.** No measurement reader, traceability generator, cleanup verifier, end-to-end baseline, reminder authoring contract, `snoozed` retirement or reconciliation migration exists. `src/` is untouched by this slice, which alone makes a measurement reader impossible.
- **AI provenance (`2E-COMMAND-012`)**: still deferred past Phase 2F per ADR-057.

## 13. Remaining risks

1. **The `application` CI flake persists.** `src/features/tasks/task-candidate-form.test.tsx` reds intermittently under load; it did so twice during this slice on an unchanged `src/` tree and passed on rerun. Out of this slice's frozen scope; `TODO.md:234` prescribes the fix and rules out a job-level retry.
2. **Write-side RLS on `public.tasks` is permanently untestable from a client role.** Recorded, with its compensating evidence, in `SECURITY.md`.
3. **`tasks_insert_own`, `tasks_update_own`, `tasks_delete_own`, `reminders_update_own` and `reminders_delete_own` are now unreachable by direct client DML** but deliberately retained (owner decision A5), so the committed re-grant restores the prior posture exactly. Documented in `DATABASE.md`.
4. **The live re-grant remains unrehearsed at the operational layer** — by design. Its CI proof is SQL-level only.

---

**Slice 2F.4 is deployed, verified and accepted.** `public.tasks` now has exactly one validated write path in both the application and the database; `public.reminders` retains the single documented Option C authoring exception, with UPDATE and DELETE revoked on the written 2F-REMINDER-003 determination.
