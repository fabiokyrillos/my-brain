# Phase 2F — Slice 2F.4 implementation report

**Task grant revocation and test-suite semantic migration.** Implemented, **undeployed**. No acceptance report exists yet and none may be written until deployment evidence exists.

Governed by `docs/PHASE_2F_PRD.md` **Revision 4.2**. Frozen scope as authorized: `2F-REVOKE-001…008`, `2F-TESTMIG-001…008`, `2F-REMINDER-003`, plus owner-approved corrections A1–A5. A8 (early census re-run) remains deferred and was not executed.

---

## 1. Branch and HEAD

| | |
|---|---|
| Branch | `codex/phase-2f-slice-4` |
| Slice base | `2a13d07` (the accepted 2F.3 acceptance commit, one ahead of `main` `48d6a83`) |
| HEAD at report time | `2a13d07` — **work is complete but uncommitted**; the commit follows review authorization |
| Deployed | **No.** Remote parity remains `202607290062`. |

Change sets are reported against the slice base `2a13d07`, not against `main`. A diff against `main` additionally shows three files (`PHASE_2F_SLICE_03_ACCEPTANCE.md`, `e2e/manual-task-creation.spec.ts`, `scripts/phase-2f3-creation-probe.mjs`) that belong to Slice 2F.3's accepted acceptance commit and are **not** part of this slice.

## 2. Complete changed-file list

**New (6):**

| File | Purpose |
|---|---|
| `supabase/migrations/202607300063_phase_2f_task_grant_revocation.sql` | the revocation — the slice's only migration |
| `scripts/phase-2f-regrant-task-write-grants.sql` | committed re-grant rollback (2F-REVOKE-003) |
| `supabase/tests/phase_2f_task_write_grants.sql` | grant posture, behavioural denial, non-vacuity, definer-path proof (27 assertions) |
| `supabase/regrant-rehearsal/phase_2f_regrant_restores_writes.sql` | the rehearsal suite, deliberately outside `supabase/tests/` (7 assertions) |
| `docs/reports/phase-2f/PHASE_2F_SLICE_04_PLAN.md` | the pre-code planning report and inventory |
| `docs/reports/phase-2f/PHASE_2F_SLICE_04_BLAST_RADIUS.md` | the pre-implementation blast-radius summary |

**Modified (13):**

| File | Change |
|---|---|
| `.github/workflows/ci.yml` | re-grant rehearsal step + posture labelling + `LOCAL_DB_URL` export |
| `supabase/tests/phase_2e_task_command_apply.sql` | §9 rows 1–5 dispositioned; two stale-prose corrections |
| `supabase/tests/phase_2e_task_command_creation.sql` | §9 rows 7, 8, 9, 12, 13 dispositioned |
| `supabase/tests/phase_2c_slice_5_task_graph.sql` | 2F-TESTMIG-003 definer-context actor-default assertion; plan 34 → 35 |
| `scripts/remote-phase-2e-smoke.mjs` | fixture seeding → `admin` |
| `scripts/remote-editable-candidate-confirmation-smoke.mjs` | cross-owner fixture → `admin` |
| `scripts/remote-supabase-smoke.mjs` | fixture → `admin`; read-side RLS evidence added |
| `docs/PHASE_2F_PRD.md` | Revision 4.2 (A1–A3) |
| `docs/SECURITY.md` | 2F-REVOKE-007 closure, the written determination, unreachable-policy record |
| `docs/DATABASE.md` | final grants, retained-but-unreachable policies, provenance, prose correction |
| `docs/STATE.md` | 2F.2/2F.3 merged+deployed, 2F.3 parity recorded, allowlist empty, current posture 2F.4 |
| `docs/TODO.md` | items 222, 235, 248 and the `audit_logs` prose item reconciled; header and 2F line refreshed |
| `docs/CHANGELOG.md` | 2F.4 entry; 2F.3 entry added as reconciliation (2F.3 not reopened) |

**Not modified, deliberately:** `supabase/migrations/202607170028_…sql` — append-only chain; its false `audit_logs` comment is corrected in `DATABASE.md`/`SECURITY.md` prose instead, and the `audit_logs` grant is untouched.

## 3. Migration count

**Exactly one.** `202607300063_phase_2f_task_grant_revocation.sql`. The phase total is now two, as PRD §7 requires (2F.3's creation contract, applied; 2F.4's revocation, pending). The re-grant is a `scripts/` file and is **not** a migration.

## 4. Exact revokes

```sql
revoke insert, update, delete on public.tasks from authenticated;
revoke update, delete on public.reminders from authenticated;
```

Nothing else. No RLS policy, trigger, function signature, RPC or row was touched; no grant widened anywhere; no data written or deleted.

## 5. Exact retained privileges

| Object | `anon` | `authenticated` | `service_role` |
|---|---|---|---|
| `public.tasks` | nothing | **SELECT** | platform default (untouched) |
| `public.reminders` | nothing | **SELECT + INSERT** — INSERT is the Option C exception | platform default (untouched) |

All eight owner-scoped RLS policies remain; RLS remains `enable` **and** `force` on both tables; all six user-defined triggers remain; `create_due_task_reminder` remains `security invoker`.

## 6. Post-deploy assertion inventory

Nine assertion groups in the migration's `do $post_deploy$` block, each raising and aborting on failure, so a successful apply *is* their proof:

| # | Asserts |
|---|---|
| 1 | `authenticated` lacks `insert`, `update`, `delete` on `public.tasks` (loop, three checks) |
| 2 | `authenticated` **retains** `select` on `public.tasks` — positive, so a revocation that over-reached would fail here rather than pass every denial |
| 3 | `authenticated` lacks `update`, `delete` on `public.reminders` |
| 4 | `authenticated` **retains** `select` and `insert` on `public.reminders` — the Option C exception |
| 5 | `anon` holds none of the four privileges on either table |
| 6 | RLS `enable` **and** `force` on both tables (`force` checked separately: without it the owner bypasses every policy) |
| 7 | All 8 owner-scoped policies present by name, including the 5 the revocation makes unreachable |
| 8 | All 6 user-defined triggers present (`tgisinternal` excludes FK triggers) |
| 9 | `create_due_task_reminder` still `security invoker` |

Written without `coalesce`/`nullif`/`greatest`/`least` and without a bare `case … then` inside an `if` condition; the 2F-GUARD-001 grammar guard passes on the new file, verified by running it.

## 7. Disposition of all 13 pgTAP statements

Ten change vehicle; three are unaffected and stay `authenticated`. **No statement was mechanically re-roled, none deleted, and no assertion count changed** in either 2E file (`apply.sql` plan 132 and `creation.sql` plan 167 are byte-identical to the baseline, verified by counting against `2a13d07`).

| # | Site | Table · op | Disposition | Invariant preserved |
|---|---|---|---|---|
| 1 | `apply.sql:580` | tasks · update | **retired and inverted**; restaged privileged | Positive claim died; denial moved to `phase_2f_task_write_grants.sql` §3. The property it carried — the audit trigger tolerating an unset `app.audit_actor` instead of raising `42704` — is restaged and still asserted |
| 2 | `apply.sql:598` | tasks · update | vehicle → owning role | trigger watches `title`; superseded title on the before side; actor defaults to `'user'` |
| 3 | `apply.sql:643` | tasks · update | vehicle → owning role | same, for `description` |
| 4 | `apply.sql:1385` | tasks · update | privileged interference | `apply_task_command`'s one-input divergence bless on a non-terminal row carrying `completed_at`; stale comment corrected |
| 5 | `apply.sql:2436` | tasks · update | privileged interference | the ten-column undo guard refuses a task that drifted after apply, whoever moved it |
| 6 | `apply.sql:2587` | reminders · insert | **unchanged, stays `authenticated`** | the retained Option C grant works |
| 7 | `creation.sql:1149` | tasks · update | privileged interference | creation-undo's guard on post-creation scalar drift |
| 8 | `creation.sql:1189` | reminders · update | vehicle → owning role (per A4) | creation-undo copes with a reminder whose `remind_at` moved |
| 9 | `creation.sql:1209` | reminders · update | vehicle → owning role (per A4) | creation-undo copes with a `snoozed` reminder — keeps the dormant literal falsifiable |
| 10 | `creation.sql:1232` | reminders · insert | **unchanged, stays `authenticated`** | retained grant; undo with an extra scheduled reminder |
| 11 | `creation.sql:1253` | reminders · insert | **unchanged, stays `authenticated`** | retained grant; undo with an extra snoozed reminder |
| 12 | `creation.sql:1582` | tasks · update | privileged interference (**new row**, A2) | undo refuses a task whose origin drifted `user` → `agent` |
| 13 | `creation.sql:1609` | tasks · update | privileged interference (**new row**, A2) | the mirror direction, `agent` → `user` |

Each vehicle change is bracketed narrowly — `reset role;` immediately before the write and `set local role authenticated;` immediately after — so every surrounding RPC call still runs through its real client-role entry point where `auth.uid()` is the ownership wall. `request.jwt.claims` is transaction-local and role-independent, so it survives each bracket intact.

**One deliberate coverage addition** (2F-TESTMIG-003): `phase_2c_slice_5_task_graph.sql` gains an assertion that a **deployed** SECURITY DEFINER writer which sets no `app.audit_actor` still records `actor = 'user'`. The vehicle is `confirm_entry_task_candidates_v6`'s parent-link UPDATE (`202607220044:1307`) — a definer body in a migration that predates ADR-046 and therefore never sets the actor. This exists because a `postgres` vehicle proves the trigger's behaviour for a writer that does not exist in production; `apply_task_command` sets `'user'` explicitly and the undo handlers set `'system'`, so neither exercises the default at all. Plan 34 → 35.

## 8. The three retained reminder INSERTs remain `authenticated`

Verified mechanically by re-running the role-context scan over the whole suite after every edit. `apply.sql:2587`, `creation.sql:1232` and `creation.sql:1253` still resolve to `set local role authenticated`, and none of the three was edited. They are the living proof that the Option C grant survives — if the revocation ever over-reached to reminders INSERT, these three fail before any production surface does.

## 9. Disposition of the three remote-smoke task INSERTs

| Site | Disposition |
|---|---|
| `remote-phase-2e-smoke.mjs:144` | seeds through the existing `admin` service-role client. Pure fixture: every assertion downstream runs through each owner's own end-user client against `list_task_command_candidates`/`apply_task_command`, so the tenant boundary is still exercised. `user_id` set per row, unchanged. |
| `remote-editable-candidate-confirmation-smoke.mjs:797` | seeds through `admin`. The row must still belong to `otherOwner` — its purpose is the `2C_INVALID_GRAPH_REFERENCE` cross-owner refusal — so the id is read from that owner's own session rather than assumed. The refusal is still raised by `confirm_entry_task_candidates_v6` and reached through `owner`'s end-user client. |
| `remote-supabase-smoke.mjs:258` | seeds through `admin`, **redesigned rather than only re-pointed** — see §10. |

`remote-supabase-smoke.mjs:286` (reminders INSERT) is **untouched** and still runs as `authenticated`, under the retained grant.

## 10. The cross-owner `23503` invariant is preserved

`remote-supabase-smoke.mjs:258` was the highest-ranked regression risk in the planning report, because the task it creates is not a spare fixture: it is the subject of the cross-owner composite-FK denial at the assertion immediately below, a Phase-1 ownership invariant unrelated to Phase 2F. Deleting the "broken" insert would have left that assertion unreachable **while the suite stayed green**.

What was done:

- the insert moved to `admin`, with `user_id` still `firstUser.id`, so the relationship's owner is unchanged;
- the `task_projects` insert that must fail is **still issued by `first`'s own end-user client** — `public.task_projects` was not revoked — and still fails for the original reason, the composite `(user_id, project_id)` foreign key;
- `assert(crossRelationship.error?.code === "23503", …)` is byte-identical and was neither deleted nor weakened;
- a comment at the site records why the row cannot be removed, so the next reader does not repeat the temptation.

**Added compensating evidence**, because the revocation genuinely destroyed something and the replacement should be real rather than implied: write-side RLS on `public.tasks` is no longer reachable from any client role, so the file now asserts read-side RLS in **both** directions — the owner must see their row (a zero count would satisfy the isolation half while proving nothing) and the other owner must not.

## 11. CI re-grant sequence and proof scope

The `database` job's sequence, with the posture boundary made explicit rather than implied by step order:

1. `supabase db reset` — the full chain, including the revocation.
2. **`Run the pgTAP suite (post-revocation posture)`** — the whole `supabase/tests` suite, including the 13 dispositions and the new grant suite.
3. `db lint`, the creation-race script, build, browser install, the foundation and task-command journeys — all under the same post-revocation posture.
4. **`Rehearse the re-grant rollback (SQL-level only; not a live-ops rehearsal)`**, last, in three labelled groups:
   - **A.** fails if the stack is not already post-revocation, so the rehearsal can never be what made an earlier step pass;
   - **B.** applies `scripts/phase-2f-regrant-task-write-grants.sql`, then runs `supabase test db --local supabase/regrant-rehearsal` — a **separate directory**, so the normal suite cannot be executed under the re-granted posture by ordering accident;
   - **C.** re-applies the revocation and re-asserts both the denial and the retained Option C INSERT, so the job never ends on a widened database.

**What it proves:** the committed rollback SQL applies and restores the **versioned migration-chain privileges** — those issued by `202607160003:195` and `202607160007:162` — on a stack `supabase db reset` built from those same migrations. Nothing in the claim depends on an unversioned platform default.

**What it does not prove, and may not be cited as proving:** live PostgREST schema-cache convergence; in-flight session behaviour; an operational rollback against production. Those are observable only against a live project and are gates of the 2F.4 deployment session. This scope statement appears in the workflow, the script header, the PRD and here, in the same words.

## 12. PRD Revision 4.2 changes

Three factual corrections, no requirement added, removed, renumbered or rescoped; no epic, slice, feature surface or architecture changed.

- **A1 — §12 privilege provenance rewritten.** Revision 4 claimed no explicit `grant` on `tasks`/`reminders` existed in the chain and that the privileges were Supabase platform defaults. Both grants exist, issued dynamically inside `DO` loops (`202607160003:185-196`, `202607160007:155-163`), which is why a literal search missed them. The claim survives for `service_role`, which genuinely has no table grant anywhere. The two rationales that depended on it were restated: **2F-REVOKE-003**'s proof scope (now "versioned migration-chain privileges", a stronger and fully determined claim) and **2F-REVOKE-004**'s non-vacuity mechanism (now an in-transaction re-grant/re-revoke round trip, rather than an appeal to platform defaults).
- **A2 — §9 expanded 11 → 13 rows.** `creation.sql:1582` and `:1609`, added by Slice 2F.3 after Revision 4 fixed the table, classified as privileged-interference like rows 4, 5 and 7. 2F-TESTMIG-001, §6.8's preamble and §8's 2F.4 acceptance line all move to 13.
- **A3 — five `creation.sql` anchors refreshed +74** in §9, §2 item 5 and 2F-TESTMIG-005. All six `apply.sql` anchors were verified still exact and left unchanged.
- Header and §14 revision-history entry added.

## 13. Documentation reconciliation

- **`SECURITY.md`** — new Slice 2F.4 section: the §16.4-class residual closed for `public.tasks`; the final privilege table; the **written 2F-REMINDER-003 determination** with the four pieces of evidence behind it; the retained-but-unreachable RLS policies stated explicitly with the named evidence loss and its two compensations; the trigger ordering consequence; the rollback scope; the corrected provenance; and the `202607170028:33` prose correction.
- **`DATABASE.md`** — new section: the vigent grant table across six tables, provenance (including that no sequence and no schema-USAGE grant participates), the reachable/unreachable policy table, the surviving writers, and the same prose correction.
- **`STATE.md`** — 2F.2 and 2F.3 recorded as merged and deployed; **Slice 2F.3's parity `202607280061` → `202607290062` recorded**, discharging the 2F-OPERATIONS-001 obligation that had been met in the acceptance report but not in `STATE.md`; the allowlist recorded as empty; current posture moved to 2F.4; the phase-wide parity line corrected; the PRD reference moved to Revision 4.2.
- **`TODO.md`** — header and the Phase 2F line refreshed; item 222 (task write-path consolidation) **closed** with a correction to its own provenance claim; item 248 (reminder grants) **closed as narrowed**, recording that INSERT is retained on purpose; item 235 (task/reminder inconsistency) **reconciled from an open decision to a made one**, naming the census stop-gate that replaced the reconciliation migration; the `audit_logs` half of item 228 **discharged**, with the remaining items in that bullet left open.
- **`CHANGELOG.md`** — a 2F.4 entry, and a 2F.3 entry that was missing. The 2F.3 entry is explicitly labelled a reconciliation; **Slice 2F.3 was not reopened** and none of its artifacts changed.

## 14. Local gate results

| Gate | Result |
|---|---|
| `npm run lint` | **pass**, exit 0, zero errors |
| `npm run typecheck` | **pass**, exit 0, zero errors |
| `npm test` | **2371 passed, 2 failed** of 2373 across 130 files — see below |
| `npm run build` | **pass**, production build green |

**The two failures are pre-existing and this workstation's, not this slice's**, and that is verified rather than asserted:

- both are in `src/features/task-commands/sql-reachability.test.ts`, which reads `202607250056_phase_2e_task_command_matching.sql`;
- `git diff --stat 2a13d07` and `--stat main` are **empty for both files** — neither was touched;
- checking the test out from the accepted baseline `2a13d07` and running it reproduces **the same two failures**;
- the cause is line endings: that migration is checked out here with CRLF terminators, and the test matches on `\n  select\n    r.id,`. CI checks out LF and the `application` job is green on it — the same condition `STATE.md` already records for Slice 2F.2.

**Neither failure involves any file this slice changed.**

## 15. Local database-test results

**Not available on this workstation.** Docker is unavailable here, so `supabase db reset`, `supabase test db` and `db lint` cannot run locally. This is the standing external dependency recorded in `TODO.md`; the `database` job in CI is the first real execution of:

- the migration and its nine post-deploy assertion groups;
- the 13 dispositions and the two new pgTAP suites;
- the re-grant rehearsal.

This is **evidence debt, stated as such and not claimed as verification.** What was verified locally: assertion counts match `plan()` in all three touched/new suites (27/27, 7/7, 35/35), the two 2E files' assertion counts are byte-identical to the baseline, the grammar-trap guard passes on the new migration, and the role-context scan confirms exactly the intended 13 dispositions.

## 16. Working-tree status

Six untracked new files and thirteen modified tracked files, all listed in §2. **Nothing is committed yet** — the commit follows review authorization. No other file is dirty.

## 17. No `src/` file changed

**Confirmed: `git diff --name-only 2a13d07 -- src/` returns zero files.**

This is the slice's own falsification test, not a formality. The planning report made it stop condition 6: if any `src/` file had needed an edit, a production caller had been missed by both the writer inventory and the blast-radius summary. None did.

## 18. No deployment occurred

**Confirmed.** No migration was applied to any project; no `supabase db push`, `db query`, `db reset` or function deploy was run. Remote parity remains `202607290062`. `202607300063` exists only on this branch. A8 was not executed — `scripts/phase-2f-reminder-census.mjs` was not run, and no credentialed script of any kind was executed against the linked project.

## 19. Slices 2F.5 and 2F.6 did not start

**Confirmed.** No measurement reader, no funnel query, no traceability generator, no cleanup verifier, no census re-run, no end-to-end baseline, no reminder authoring contract, no reminder edit/cancel UI, no `snoozed` retirement, no reconciliation migration, no AI provenance, and no later-phase work exists in this change set. `src/` is untouched, which alone makes a measurement reader impossible.

## 20. Remaining risks and environment-only gaps

| # | Risk / gap | Status |
|---|---|---|
| R1 | **Every database assertion in this slice is unexecuted.** Docker is unavailable locally, so the migration, its post-deploy block, the 13 dispositions, the two new suites and the rehearsal have their first real run in CI. | Environment-only. Highest residual. The slice cannot be accepted on a green `application` job alone. |
| R2 | **The rehearsal step depends on `psql` and `LOCAL_DB_URL`.** `psql` is preinstalled on `ubuntu-latest`; `DB_URL` comes from `supabase status -o env` with a fallback to the `config.toml` port. If the CLI stops reporting it and the fallback is also wrong, the step fails loudly rather than skipping. | Fails closed by design; unverified until CI runs. |
| R3 | **The `42501` message text is asserted exactly** (`permission denied for table tasks`) in the house 4-argument `throws_ok` idiom. It is stable across PostgreSQL versions, but it is a text match. | If it ever drifts, the failure is loud and localized. |
| R4 | **Section 6 of the grant suite depends on `confirm_entry_task_candidates_v6` materializing `due_at` from the candidate baseline** when no edit is supplied (`202607220044:699-707`), which is what makes the trigger fire. Verified by reading the function body; a fixed ISO literal with an explicit offset is used so the shape cannot drift. | Verified statically, unexecuted. |
| R5 | **PostgREST schema-cache convergence and in-flight session behaviour are unproven** and cannot be proven in CI. | Named residual; a deployment-session gate (§13 of the planning report, gate 19). |
| R6 | **`npm run test:remote` has not been executed** against the linked project with the reworked smokes. | Deployment-session gate 20; the reworked file is the full remote suite itself. |
| R7 | **Two pre-existing local test failures persist** (`sql-reachability.test.ts`, CRLF). Unrelated to this slice, already recorded for 2F.2. | Pre-existing; green in CI. |
| R8 | **`docs/reports/shared/governance/SLICE_REPORT_TEMPLATE.md` remains dead** and the remaining `TODO.md:228` documentation items remain open. | Out of frozen scope; left for 2F.6's 2F-OPERATIONS-006. |

## 21. Stop conditions — none fired

| Condition | Result |
|---|---|
| A1/A2/A3 declined | approved |
| A4 declined | approved |
| Pre-revocation grant assertion fails | cannot be evaluated locally (R1); the mechanism is built and fails closed |
| A disposition requires changing the invariant rather than the vehicle | **did not occur** — all 13 keep their exact assertions; assertion counts unchanged |
| Cross-owner `23503` proof cannot be preserved | **preserved**, byte-identical, with compensating evidence added |
| Any `src/` file needs an edit | **none did** |
| Re-grant rehearsal requires weakening its proof or changing production code | **neither** |
| A grant would have to widen anywhere | **none did** |

---

**Stopping here for review authorization.** Nothing is committed, nothing is deployed, and the deployment-session gates in the planning report §13 remain unexecuted and unclaimed.
