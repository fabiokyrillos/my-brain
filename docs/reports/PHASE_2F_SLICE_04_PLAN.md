# Phase 2F — Slice 2F.4 planning report and repository inventory

**Status: planning only. No production code, migration, grant, reminder behaviour, measurement reader, PRD edit or closeout implementation has been produced.** This document is the deliverable; it is uncommitted and adds one untracked file to an otherwise clean tree.

Baseline accepted and unmodified: PR #26, merge commit `48d6a83e97f88992ca220084ffe2673f5a80a1bd`, merge-SHA CI `30467623925`, remote migration parity `202607290062`. Slices 2F.1, 2F.2 and 2F.3 are closed and were not reopened.

Inventory executed 2026-07-29 on branch `codex/phase-2f-slice-3-acceptance` (HEAD `2a13d07`, working tree clean). The Phase 2F pre-code Gate 2 artifact `scripts/phase-2f-writer-inventory.mjs` was re-run as 2F-PRECOND-001 requires ("run it before Slice 2F.2 and again before 2F.4"); its output is the normative basis of §3 and §4 below. It is read-only, credential-free and opens no network connection. No credentialed script was run and nothing was executed against the linked project.

---

## 1. Executive conclusion

**The "One Write Path" objective is already true in application code. It is not yet true in the database.**

Zero production-reachable direct INSERT/UPDATE/DELETE statements against `public.tasks` remain anywhere in the repository. The architecture gate's `tasks` allowlist is empty and compared by exact equality in both directions. The single remaining production direct write on either guarded table is `createReminder`'s `reminders` INSERT — the sanctioned Option C exception. What still permits a direct task write is the **grant**, not any caller.

Slice 2F.4 as the PRD scopes it — `2F-REVOKE-001…008`, `2F-TESTMIG-001…008`, `2F-REMINDER-003` — **is a single coherent slice and should not be widened.** Its coherence is not thematic but mechanical: the revocation and the test-suite semantic migration cannot land in different PRs, because CI's `database` job applies the whole migration chain to an empty database and then runs the entire pgTAP suite in the same job. A revocation without the re-dispositioned tests is a red CI job; the re-dispositioned tests without the revocation assert a denial that has not happened. The same is true of the four remote-smoke reworks: `npm run test:remote` is itself `remote-supabase-smoke.mjs`, which contains two of the affected writes, so 2F-REVOKE-005's in-session gate cannot pass unless the rework ships with the revocation.

**Three repository-truth corrections must be authorized before code starts.** The largest is that PRD §12's privilege-provenance paragraph — cited as load-bearing "because two gates turn on it" — is factually wrong: explicit grants on `tasks` and `reminders` *do* exist in the migration chain. They are issued dynamically inside `DO`-block loops, which is why a literal search for `grant … on public.tasks` finds nothing. This makes 2F-REVOKE-003's and 2F-REVOKE-004's *stated rationale* incorrect while leaving both requirements intact and, in fact, easier to satisfy deterministically.

Recommended scope: **the PRD's 2F.4 exactly, plus the three corrections, plus a written REMINDER-003 determination recommending revocation of `reminders` UPDATE and DELETE.** Exactly one migration. Estimated implementation risk: **medium**. It does not close Phase 2F — 2F.5 and 2F.6 remain.

---

## 2. Planning-document conflicts

Repository truth is stated first in each row; none of these was changed.

### C1 — PRD §12 privilege provenance is false (**blocking, owner decision required**)

PRD §12 states, verbatim:

> "no explicit `grant` on `tasks`/`reminders` exists anywhere in the migration chain — the current privileges originate in Supabase's platform default privileges, and the repository narrows by `revoke`"

Repository truth:

| Object | Explicit grant | Site |
|---|---|---|
| `public.tasks` | `grant select, insert, update, delete on public.tasks to authenticated` | `202607160003_intelligent_capture.sql:195`, inside a `DO` loop whose array at `:185-188` includes `'tasks'` |
| `public.reminders` | `grant select, insert, update, delete on public.reminders to authenticated` | `202607160007_agent_operations.sql:162`, loop array at `:155` includes `'reminders'` |
| both | `revoke all on public.<t> from anon` | `202607160003:196`, `202607160007:163` |

The grants are emitted by `execute format(...)`, so no literal `grant … tasks` string exists — which is the most probable origin of the PRD's claim.

Consequences, each concrete:

- **2F-REVOKE-003's stated proof scope is wrong.** The PRD justifies the CI re-grant harness as proving the re-grant applies "on a stack whose starting privileges reproduce Supabase's platform defaults — which is also where those privileges originate." The privileges originate in the migration chain. `supabase db reset` reproduces them because the migration grants them, not because of platform behaviour. The harness is therefore **more** deterministic than claimed, and its result no longer depends on an unversioned platform default. The sentence must be corrected, not the requirement.
- **2F-REVOKE-004's pre-revocation assertion changes meaning.** It no longer proves "the local stack granted the platform defaults at all"; it proves the migration chain's grant is in effect at the point of revocation. Still worth asserting, still non-vacuous, differently worded.
- **The re-grant script becomes exact rather than reconstructed.** It is the literal inverse of two known statements, not a guess at a platform default.
- **For `service_role` the PRD's claim is true.** No table grant to `service_role` exists anywhere in the chain; its privileges do come from Supabase's defaults. The claim is wrong only for `authenticated`.

### C2 — PRD §9's normative table is under-inventoried by two (**blocking, owner decision required**)

§9 enumerates **11** pgTAP statements under `set local role authenticated` and states "Obsolete tests to retire: **None** — every statement's underlying invariant survives". The repository now contains **13**. Slice 2F.3 added two, both legitimately:

| Site | Statement | Purpose |
|---|---|---|
| `phase_2e_task_command_creation.sql:1582` | `update public.tasks set created_by = 'agent'` | origin-drift fixture proving `undo_create_task_command` refuses a user-origin task whose origin drifted to `agent` (`2E_UNDO_RESTORE_INTEGRITY`) |
| `phase_2e_task_command_creation.sql:1609` | `update public.tasks set created_by = 'user'` | the mirror case, agent → user |

Both are under `set local role authenticated` (last role directive `:1332`; next `reset role` at `:1639`) and both break on revocation. Their §9 classification is unambiguous — they are class-4/5/7 **privileged-interference** proofs: the invariant is that the guard refuses a drifted origin *regardless of which writer drifted it*. Restaging the write vehicle as `postgres` preserves exactly what they prove. But they are not in the normative table, and 2F-TESTMIG-001 binds the work to "**every one of the 11**".

The disposition count for 2F.4 is therefore **13**, not 11, and §9 needs two rows added.

### C3 — PRD §9 and §2 line anchors for `creation.sql` have drifted +74

Slice 2F.3 inserted content above them. Every `creation.sql` anchor in §9, §2 item 5 and 2F-TESTMIG-005 is stale:

| PRD anchor | Current line | Statement |
|---|---|---|
| `creation.sql:1075` | **1149** | `update public.tasks set title = 'Edited later'` |
| `creation.sql:1115` | **1189** | `update public.reminders set remind_at = …` |
| `creation.sql:1135` | **1209** | `update public.reminders` (snoozed) |
| `creation.sql:1158` | **1232** | `insert into public.reminders (…)` |
| `creation.sql:1179` | **1253** | `insert into public.reminders (` |

All five `apply.sql` anchors (580, 598, 643, 1385, 2436, 2587) are still exact. This is a citation-hygiene defect, not a scope change, but 2F.4 cannot cite §9 by line without correcting it.

### C4 — `STATE.md` is two slices stale, and one 2F.3 obligation is unrecorded there

- Header (`:3`) reads "Slice 2F.1 accepted and merged; Slice 2F.2 implemented on branch `codex/phase-2f-slice-2`". Both 2F.2 and 2F.3 are merged and deployed.
- `:13` states the `tasks` allowlist "is now **one entry**". It is empty.
- `:7` and `PHASE_2_PLAN.md:128` cite PRD "Revision 4"; the governing revision is **4.1**.
- **2F-OPERATIONS-001** requires every deploying slice's remote parity re-verification to be "recorded in `STATE.md`". Slice 2F.3's parity (`202607280061` → `202607290062`) is recorded in `PHASE_2F_SLICE_03_ACCEPTANCE.md` §2 but not in `STATE.md`. Slice 2F.3 is closed and must not be reopened; this is carried as a documentation-reconciliation item for 2F.4 (which touches `STATE.md` anyway under 2F-REVOKE-007) with the closeout verification owed to 2F-OPERATIONS-006.

### C5 — `TODO.md` is stale and carries three items 2F.4 must reconcile

Header dated 2026-07-28. Line 28 still says "Slice 2F.2 … its deployment-session gates are pending" and cites Revision 4.

| Line | Item | Disposition owed |
|---|---|---|
| 222 | "Write-path consolidation for `public.tasks`. `authenticated` still holds `insert, update, delete` … the `202607170016` revoke list never included it" | The application half is discharged by 2F.2/2F.3; the grant half is exactly 2F.4. Close in 2F.4. |
| 248 | "`public.reminders` still grants `insert, update, delete` to `authenticated`" | This *is* 2F-REMINDER-003. Close or narrow in 2F.4 per the determination. |
| 235 | "A task can hold a null `due_at` beside a live `scheduled` reminder … **Needs a decision:** a one-off reconciliation migration, or an explicit acceptance" | **The decision was made** (PRD §1, owner decision 2: reconciliation removed on Gate 4's zero-row census; the census becomes the 2F.6 stop-gate). The TODO still reads as open. Reconcile the wording — this is a stale-prose defect, not a reopening. |
| 228 | Stale documentation list, including the `202607170028:33` grant claim | Named by 2F-TESTMIG-007; 2F.4 corrects it at source. |

### C6 — Minor

`docs/reports/` holds `PHASE_2F_SLICE_03_PLAN.md` and `PHASE_2F_SLICE_03_ACCEPTANCE.md` but no `PHASE_2F_SLICE_03_REPORT.md`, whereas 2F.1 has a `_REPORT` and no `_ACCEPTANCE`. The acceptance report discharges the content obligation; only the naming is inconsistent. No action proposed.

**Nothing in C1–C6 changes intended scope.** C1, C2 and C3 change *stated facts the PRD relies on*, and correcting a normative PRD table (§9, §12) requires owner authorization even though repository truth is not in doubt.

---

## 3. Production write-path inventory

Source: `scripts/phase-2f-writer-inventory.mjs` (client roots `src`, `scripts`, `e2e`, `supabase/functions`), cross-checked by independent AST-free scans of `src/**`, `supabase/migrations/**` and `supabase/tests/**`.

### 3.1 `public.tasks` — application-reachable DML

**None.** Section 5 of the writer inventory ("revocation blast radius") lists five `authenticated` client-role writers; **none of them is production code touching `tasks`**. `persistTaskStatus` and `updateTaskStatus` no longer exist (removed in 2F.2); `createRecord`'s task branch routes through the creation family (2F.3).

| File · line | Caller | Runtime role | DB object | Op | Prod-reachable | Via validated command | Allowlisted | Disposition |
|---|---|---|---|---|---|---|---|---|
| `src/features/operations/actions.ts:122` | `createRecord` (task branch) | `authenticated` | `public.create_task_command` RPC (+ `issue_task_command_creation_confirmation`) | INSERT via RPC | **yes** | **yes** | n/a (not direct DML) | **remain** |
| `src/features/operations/actions.ts` (`applyWorkItemAction`) | Work surface | `authenticated` | `list_task_command_candidates` → `public.apply_task_command` | UPDATE via RPC | **yes** | **yes** | n/a | **remain** |
| `src/features/tasks/actions.ts:174, :252` | candidate confirmation | `authenticated` | `confirm_entry_task_candidates_v4` / `_v6` | INSERT via RPC | **yes** | **yes** | n/a | **remain** |
| `src/features/{tasks,agent,interpretations,task-commands}/*.ts` (`undo_operation`, 4 sites) | undo affordances | `authenticated` | `public.undo_operation` (definer router) | UPDATE via RPC | **yes** | **yes** | n/a | **remain** |
| `src/features/agent/actions.ts:823` | review generation | `authenticated` | `public.tasks` | **SELECT** | yes | n/a | n/a | **remain** (read) |
| `src/features/daily-cycle/*`, `src/app/**` (7 sites) | projections/pages | `authenticated` | `public.tasks` | **SELECT** | yes | n/a | n/a | **remain** (read) |

### 3.2 `public.reminders` — application-reachable DML

| File · line | Caller | Runtime role | DB object | Op | Prod-reachable | Validated command | Allowlisted | Disposition |
|---|---|---|---|---|---|---|---|---|
| `src/features/agent/actions.ts:125-132` | `createReminder` | `authenticated` | `public.reminders` | **INSERT (direct)** | **yes** | no | **yes** — the Option C exception | **remain** (PRD §2 item 6, 2F-REMINDER-001) |
| `src/app/[locale]/app/reminders/page.tsx:19` | reminders page | `authenticated` | `public.reminders` | SELECT | yes | n/a | n/a | remain (read) |

**No UPDATE and no DELETE on `public.reminders` exists in any production module.** A repository-wide search for a `delete` on either guarded table — across `src`, `scripts`, `supabase`, `e2e`, in both PostgREST-builder and raw-SQL form — returns **zero results of any kind, including in tests and fixtures.**

### 3.3 Command, undo, confirmation and audit tables

| Table | Application-reachable write | Posture |
|---|---|---|
| `public.undo_operations` | none — `revoke insert, update, delete … from authenticated` (`202607170016:201`); written only inside definer RPCs | already closed |
| `public.audit_logs` | `revoke update, delete … from authenticated` (`202607170016:196`); **INSERT is still granted** (the stale claim at `202607170028:33` denies this — 2F-TESTMIG-007's target) | out of 2F scope; correct the prose only |
| `public.task_command_confirmations` | none — `revoke all … from public, anon, authenticated, service_role` then `grant select … to authenticated` (`202607260059:258-261`). No role may write it; both writers are definer functions | already at target |
| `private.undo_operation_handlers` | none — schema `private` has no `grant usage on schema` to any role anywhere in the chain | already closed |
| `public.product_events` | `revoke all … from public, anon, authenticated, service_role`; `grant select … to authenticated` (`202607170024:76-77`); written only via `record_product_event*` | already at target |

### 3.4 Worker and Edge Function surface

`supabase/functions/**` contains **no** DML against `tasks` or `reminders` in any form. The worker is unaffected by the revocation.

### 3.5 In-database writers (the destination contracts)

Fourteen, last-declaration-only. The ones whose security context matters to the revocation:

| Function | Definer? | Writes | Why it survives revocation |
|---|---|---|---|
| `public.apply_task_command` | **yes** | tasks:update, reminders:insert/update | executes as owner |
| `public.create_task_command` | **yes** | tasks:insert | executes as owner |
| `public.confirm_entry_task_candidates` / `_v2`…`_v6`, `confirm_entry_tasks` | **yes** | tasks:insert/update | executes as owner |
| `public.run_user_heartbeat` | **yes** | reminders:update | executes as owner; `revoke all … from public, anon, authenticated` + `grant execute … to service_role` (`202607170016:598-599`) |
| `private.undo_apply_task_command_fields`, `undo_confirm_entry_tasks`, `undo_create_task_command` | **NO — invoker, deliberately** | tasks:update, reminders:insert/update | reached **only** through `public.undo_operation`, which **is** `security definer` (`202607250052`), so `current_user` inside them is the router's owner |
| `public.create_due_task_reminder` | **NO — invoker** | reminders:insert | trigger `after insert on public.tasks`; after tasks-INSERT revocation **every** task insert originates in a definer context, so the trigger can never execute as `authenticated` again — this is exactly 2F-REVOKE-002's proof obligation |

Six triggers exist on the two tables (`tasks_audit_changes`, `tasks_create_due_reminder`, `tasks_guard_terminal_candidate_resolution`, `tasks_record_candidate_confirmation`, `tasks_updated_at`, `reminders_updated_at`). All fire inside the contexts above.

### 3.6 Non-production writes that the revocation still breaks

Excluded from the "production-reachable" count, included because they are the slice's actual work.

**Client-role smoke writes (4)** — 2F-TESTMIG-006:

| Site | Client | Table · op | Note |
|---|---|---|---|
| `scripts/remote-phase-2e-smoke.mjs:144` | `owner.client` (`authenticated`) | tasks · insert | pure fixture → move to the script's existing `admin` service-role client |
| `scripts/remote-editable-candidate-confirmation-smoke.mjs:797` | `otherOwner` (`authenticated`) | tasks · insert | pure fixture → `admin` |
| `scripts/remote-supabase-smoke.mjs:258` | `first` (`authenticated`) | tasks · insert | **not a pure fixture** — see below |
| `scripts/remote-supabase-smoke.mjs:286` | `first` (`authenticated`) | reminders · insert | survives under Option C; unaffected |

`remote-supabase-smoke.mjs:258` needs naming precisely, because the PRD describes it only as "task-insert RLS assertions". The inserted task is *also* the required fixture for the cross-owner composite-FK denial at `:265-270` (`task_projects` insert must fail `23503`). Re-pointing it to `admin` preserves that proof; deleting it destroys an unrelated Phase-1 ownership invariant. **And `npm run test:remote` — 2F-REVOKE-005's own in-session gate — *is* this file**, so the rework is a hard prerequisite of the deployment session, not a follow-up.

Three further script writers (`phase-2f-gate3-exact-title-reuse.mjs:137/:143/:265`, `remote-product-events-smoke.mjs:165`) already run as `service_role` and are unaffected.

**pgTAP statements under `set local role authenticated` (13)** — see §2/C2. Six in `apply.sql` (580, 598, 643, 1385, 2436, 2587), seven in `creation.sql` (1149, 1189, 1209, 1232, 1253, 1582, 1609). The remaining 20 pgTAP writes on these tables run under the session default (`postgres`) and are unaffected.

---

## 4. Grant and privilege inventory

### 4.1 Table privileges

| Object | `anon` | `authenticated` | `service_role` | owner / `postgres` |
|---|---|---|---|---|
| `public.tasks` | **nothing** — `revoke all … from anon` (`202607160003:196`) | **SELECT, INSERT, UPDATE, DELETE** — explicit, `202607160003:195` | Supabase platform default (no explicit grant anywhere) | owner |
| `public.reminders` | **nothing** — `202607160007:163` | **SELECT, INSERT, UPDATE, DELETE** — explicit, `202607160007:162` | platform default | owner |
| `public.task_command_confirmations` | nothing | **SELECT only** | **nothing** (explicitly revoked) | owner |
| `public.undo_operations` | nothing | SELECT only | platform default | owner |
| `public.audit_logs` | nothing | SELECT + **INSERT** | platform default | owner |
| `public.product_events` | nothing | SELECT only | **nothing** (explicitly revoked) | owner |

RLS is `enable` + **`force`** on `tasks` and `reminders`, each with four owner-scoped policies (`_select_own`, `_insert_own`, `_update_own`, `_delete_own`), all `to authenticated`, all `(select auth.uid()) = user_id` (`202607160003:189-194`, `202607160007:156-161`).

### 4.2 Sequence privileges

**None in play.** No `serial`, `bigserial`, `create sequence` or `nextval` appears anywhere in the migration chain; both tables use `uuid primary key default gen_random_uuid()`. The revocation migration needs no sequence clause.

### 4.3 Schema USAGE

No `grant usage on schema` statement exists anywhere in the chain. `private` is therefore reachable only by the owner — which is the posture the entire undo-handler design depends on, and which `phase_2e_task_command_creation.sql:1633-1638` documents and relies on.

### 4.4 Function EXECUTE (task/reminder mutation relevant)

| Function | `anon`/`public` | `authenticated` | `service_role` |
|---|---|---|---|
| `public.apply_task_command(uuid,text,jsonb,jsonb,text,text,text)` | revoked | **execute** | — |
| `public.create_task_command(text,text[],jsonb,text,text,text,text)` | revoked | **execute** (`202607290062:848-850`) | — |
| `public.undo_operation(uuid)` | revoked | **execute** | — |
| `public.list_task_command_candidates(…)` | revoked | **execute** | — |
| `public.confirm_entry_task_candidates_v4/_v6` | revoked | **execute** | — |
| `public.confirm_entry_tasks(uuid,integer[])` | revoked | **revoked** (`202607250054:49` — retired) | — |
| `public.run_user_heartbeat(uuid)`, `run_all_heartbeats()` | revoked | **revoked** | **execute** |
| `private.undo_*` handlers | revoked | revoked | revoked |

### 4.5 Privileges inherited through role membership

`authenticated`, `anon` and `service_role` are Supabase platform roles; no `grant <role> to <role>` statement exists in the chain, so no repository-created membership path adds privilege. `postgres` owns every object and reaches the tables as owner, not through a grant.

### 4.6 Obsolete privileges revocable without breaking an accepted caller

| Privilege | Revocable? | Evidence |
|---|---|---|
| `authenticated` **INSERT** on `public.tasks` | **yes** | zero production callers; three smoke fixtures re-pointable to `admin`; every surviving insert is definer-context |
| `authenticated` **UPDATE** on `public.tasks` | **yes** | zero production callers since 2F.2; seven pgTAP statements restageable per §9 |
| `authenticated` **DELETE** on `public.tasks` | **yes** | **zero callers of any kind, repository-wide** — production, script, test, fixture or E2E |
| `authenticated` **UPDATE** on `public.reminders` | **yes** | zero production callers; exactly two pgTAP statements (`creation.sql:1189`, `:1209`), both already dispositioned conditionally by §9 rows 8–9 |
| `authenticated` **DELETE** on `public.reminders` | **yes** | **zero callers of any kind, repository-wide** |
| `authenticated` **INSERT** on `public.reminders` | **no — must be retained** | `createReminder` (Option C, 2F-REMINDER-001) plus three pgTAP stagings (§9 rows 6, 10, 11) |
| `authenticated` **SELECT** on either table | **no — must be retained** | every projection and page reads through it under RLS |

Nothing was revoked. This is an inventory.

---

## 5. Reminder lifecycle inventory

Eight distinct paths. They do **not** share one abstraction and repository evidence does not support forcing them into one.

| # | Path | Production caller | SQL object | Authorization | Idempotent | Audited | Undo/compensation | Ownership check | Direct `public.reminders` DML | Class |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Independent creation** | `createReminder` (`agent/actions.ts:125`) | none — PostgREST INSERT | RLS `reminders_insert_own` + `auth.getUser()` | **no** | **no** | **none** | RLS only | **yes — INSERT** | **user intent** (the Option C exception) |
| 2 | **Derived creation on task insert** | trigger `tasks_create_due_reminder` | `public.create_due_task_reminder` (**invoker**) | inherits the inserting context | n/a (fires once per insert) | no | cascades with the task | inherits `new.user_id` | yes — INSERT | **derived reconciliation** |
| 3 | **Reconciliation on terminal transition** | `applyWorkItemAction`, command console | `public.apply_task_command` (**definer**) — `202607270060:1567` update, `:1604` insert | `auth.uid()` predicate inside the body | **yes** — operation key + fingerprint | **yes** | **yes** — undo row | explicit | yes (inside definer) | **derived reconciliation** |
| 4 | **Undo compensation (apply)** | undo affordance | `private.undo_apply_task_command_fields` (invoker, definer-routed) — `202607270060:2043` update, `:2085` insert | via `undo_operation` (definer) | yes — replay short-circuit | yes | is the compensation | `p_user_id` | yes | **derived reconciliation** |
| 5 | **Undo compensation (creation)** | undo affordance | `private.undo_create_task_command` — `202607290062:777` update | via `undo_operation` | yes | yes | is the compensation | `p_user_id` | yes | **derived reconciliation** |
| 6 | **Delivery mark-sent** | `pg_cron` → `run_all_heartbeats` | `public.run_user_heartbeat` (**definer**, `service_role` only) — `202607170016:552` update | `service_role` EXECUTE only | per-user lock + 24h cooldown | no | none | `p_user_id` | yes | **system maintenance** |
| 7 | **Cancellation / edit by the user** | **does not exist** | — | — | — | — | — | — | — | — |
| 8 | **Administrative cleanup** | `verify-phase-*-cleanup.mjs`, smoke teardown | service-role deletes / `auth.users` cascade | service role | fail-closed | no | n/a | explicit fixture scoping | yes (out of production) | **system maintenance** |

Load-bearing observations:

- **Path 7 is empty.** No user-facing surface cancels, snoozes, edits or deletes a reminder. This is the factual basis of both 2F-REMINDER-002's "why it is acceptable today" and the 2F-REMINDER-003 determination.
- **Reminder DELETE happens only by cascade.** `reminders.task_id references public.tasks(id) on delete cascade`; `user_id references auth.users(id) on delete cascade`. No `delete from public.reminders` statement exists anywhere in the repository.
- **`snoozed` is dormant.** It is a declared CHECK member (`202607160007`), the heartbeat only ever selects `status = 'scheduled'`, and nothing in production writes `snoozed`. Recorded per 2F-REMINDER-004; kept falsifiable by pgTAP `creation.sql:1209`.
- **The three UPDATE paths (3, 4, 5, 6) are all definer or definer-routed.** Revoking `authenticated` UPDATE touches none of them.
- **User intent and derived reconciliation are genuinely different mechanisms here**, and the PRD's instruction not to merge them is supported: path 1 has no operation key, no pre-state, no audit actor and no undo row, while paths 3–5 have all four. Converging them means building the validated authoring contract that 2F-REMINDER-002 names as the reopening condition — explicitly not this phase.

---

## 6. Measurement-reader determination

**"Measurement reader" means 2F-MEASURE-001's minimal internal command-funnel reader.** It is not a dashboard, not an external export and not a new data source.

| Question | Finding |
|---|---|
| Intended consumer | Internal/owner-only. Its sole purpose is to make ADR-055's two evidence tiers and the 90-day expiry mechanically computable. |
| Does it exist? | **No.** Repository-wide, zero occurrences of "funnel" in any reader sense; `src/features/task-commands/analytics.ts` and `src/features/product-analytics/*` are **emitters**, not readers. |
| Source | `public.product_events`, already-emitted `task_command_*` events. |
| Metrics | qualifying-command count, active days, outcome distribution, refusal outcome classes (`outcomeCategory`), no-match rate, no-match-to-creation rate (`applyRoute = 'created'`), origin split (`commandOrigin ∈ {chat, work}`). |
| Content-bearing fields? | **No** — and structurally cannot be: the property allowlist is enforced in the database by `private.validate_product_event_properties` (`202607280061:304-317`), and reason-level granularity is explicitly out of scope because reason codes are not allowlisted. |
| Tenant isolation | `product_events` has `enable` + `force` RLS with `product_events_select_own` (`202607170024:73`), owner-scoped by `auth.uid()`. |
| Grants | `revoke all … from public, anon, authenticated, service_role`; `grant select … to authenticated` (`:76-77`). |
| **Migration required?** | **No.** SELECT is already granted and RLS already scopes it. A server-only owner-scoped aggregate satisfies 2F-MEASURE-001 with zero SQL. (`get_ai_cost_summary` is the definer-RPC precedent if aggregation ever needs to move server-side, but nothing forces that.) |
| Necessary for Phase 2F acceptance? | **Yes — but as Slice 2F.5, not 2F.4.** PRD §7 assigns MEASURE 1–7 to epic 2F-E; §8 gives 2F.5 its own acceptance criteria; §10 places the reader gate outside 2F.4's column entirely. |
| Stale? | **No.** ADR-055 is Accepted, `TODO.md:30` carries the live undated expiry entry awaiting the reader's go-live, and 2F-OPERATIONS-006 verifies that entry is dated at closeout. |
| Already satisfied by existing analytics? | **No.** Emission ≠ readability. Nothing in the product reads `product_events` for any purpose today. |

**Determination: do not build a measurement reader in Slice 2F.4.** It is a genuine Phase 2F requirement, it is not stale, it is not satisfied — and it belongs to 2F.5, which §7 marks parallelizable from day one because it depends only on the deployed Phase 2E contract. Folding it into 2F.4 would put a read-only feature inside the phase's highest-risk migration and destroy 2F.4's single revert boundary.

---

## 7. Remaining Phase 2F acceptance gaps

### 7.1 Gaps 2F.4 must close

| # | Gap | Requirement |
|---|---|---|
| G1 | `authenticated` still holds INSERT/UPDATE/DELETE on `public.tasks` | 2F-REVOKE-001 |
| G2 | The `reminders` UPDATE/DELETE determination is unwritten | 2F-REMINDER-003 |
| G3 | No CI re-grant harness step exists — verified: `ci.yml`'s `database` job runs `db reset`, pgTAP, `db lint`, the creation-race script, build, and two Playwright specs, and nothing else | 2F-REVOKE-003 |
| G4 | No pre-revocation privilege assertion exists; no pgTAP file contains any `table_privs_are`/`has_table_privilege` assertion for `tasks` or `reminders` | 2F-REVOKE-004 |
| G5 | 13 pgTAP statements and 4 smoke writes are undispositioned | 2F-TESTMIG-001…006 |
| G6 | `apply.sql:1382-1384`'s comment asserts the old grants; `202607170028:33` misstates the `audit_logs` posture | 2F-TESTMIG-007 |
| G7 | `create_due_task_reminder`'s post-revocation definer-context reachability is unproven | 2F-REVOKE-002 |
| G8 | `SECURITY.md` §16.4-class residual not closed for tasks; `STATE.md` posture not updated | 2F-REVOKE-007 |

### 7.2 Gaps that belong to 2F.5 / 2F.6 (named so they are not silently absorbed)

| # | Gap | Owner |
|---|---|---|
| G9 | Command-funnel reader + exclusion-mechanism proofs | 2F.5 |
| G10 | End-to-end match baseline, pinned and scope-labelled | 2F.5 (2F-MEASURE-007) |
| G11 | Dating the `TODO.md:30` expiry entry at reader go-live | 2F.5 → verified 2F.6 |
| G12 | Fail-closed traceability generator + 68-row matrix (no `generate-phase-2f-traceability.mjs` exists; 2C/2D/2E all have one) | 2F.6 (2F-OPERATIONS-003) |
| G13 | Cleanup verifier for 2F probes (no `verify-phase-2f-cleanup.mjs` exists) | 2F.6 (2F-OPERATIONS-004) |
| G14 | Census stop-gate re-run | 2F.6 (2F-OPERATIONS-005) |
| G15 | Full documentation reconciliation incl. C4/C5 | 2F.6 (2F-OPERATIONS-006) |

### 7.3 Proposed closeout gates, assessed against what already exists

| Candidate gate | Prevents | Where it should execute | Already substantially covered? |
|---|---|---|---|
| Empty `tasks` direct-write allowlist | a new direct writer | CI `app` — `direct-write-guard.test.ts` | **Yes, fully.** Exact equality both directions; already green and empty. No new gate. |
| Grant assertions (`tasks` denied, `reminders` narrowed, `select` preserved) | silent re-grant / platform drift | CI `database` pgTAP | **No — build in 2F.4** (G4) |
| Pre-revocation privilege assertion | a vacuous denial proof | CI `database` pgTAP, same run | **No — build in 2F.4** |
| Re-grant rehearsal | an unexecutable rollback | CI `database`, new harness step | **No — build in 2F.4** (G3) |
| Unique RPC signature | `42725` ambiguity | migration post-deploy `DO` block | **Yes** — the pattern is proven and executed by `202607290062`. Reuse, don't rebuild. |
| Migration parity before/after | undetected drift | deployment session + `STATE.md` | **Yes** — standing practice; needs the `STATE.md` record fixed (C4) |
| Analytics content-leak check | a title reaching `product_events` | database (`validate_product_event_properties`) + probe assertion | **Yes** — DB-enforced allowlist; 2F.3 gate 18 executed it. Reuse. |
| Undo-handler integrity | an unregistered `action_type` | `private.enforce_registered_undo_operation` + pgTAP `undo_operation_routing.sql` | **Yes, fully.** No new gate. |
| Forbidden-SQL reachability | a re-introduced raw-table fallback | CI `app` | **Partly.** `sql-reachability.test.ts` covers *matching triples*, not forbidden SQL. The direct-write guard covers PostgREST builder chains but **would not detect a raw-SQL fallback issued through an RPC or a dynamic table name.** A genuine residual — see §15/Q3. |
| Reminder mutation ownership | a cross-owner reminder write | pgTAP + probe | **Yes** — composite FK `(user_id, task_id)` (`202607170016:66-68`) plus definer `auth.uid()` predicates; census buckets 3–4 structurally impossible |
| Remote residue | orphan fixtures | deployment session | **Yes for 2E** (`verify-phase-2e-cleanup.mjs`, executed clean in 2F.3); **no 2F verifier yet** → G13, 2F.6 |
| Documentation consistency | stale normative prose | 2F.6 | **No** — C1–C5 are the backlog |

---

## 8. Recommended Slice 2F.4 scope

**Smallest viable scope — the PRD's 2F.4 exactly, plus three authorized corrections and one written determination:**

1. **One migration** revoking `insert, update, delete on public.tasks from authenticated` and — subject to the determination — `update, delete on public.reminders from authenticated`, with post-deploy `DO` assertions in the `202607290062` style.
2. **The written 2F-REMINDER-003 determination.** Recommended outcome: **revoke both.** Evidence: zero production client UPDATE/DELETE; zero DELETE statements of any kind repository-wide; exactly two affected pgTAP statements, both already conditionally dispositioned by §9 rows 8–9; every surviving reminder UPDATE is definer or definer-routed. INSERT is retained unchanged.
3. **13 pgTAP dispositions** per §9 as corrected by C2/C3.
4. **4 remote-smoke reworks** per 2F-TESTMIG-006, including the `remote-supabase-smoke.mjs:258` fixture dependency named in §3.6.
5. **The CI re-grant harness step** (2F-REVOKE-003), with its scope stated exactly and corrected per C1.
6. **The pre-revocation privilege assertion** (2F-REVOKE-004) and the `create_due_task_reminder` definer-context proof (2F-REVOKE-002).
7. **Stale-prose corrections at source** (2F-TESTMIG-007) and the `SECURITY.md`/`STATE.md`/`DATABASE.md`/`TODO.md` posture updates (2F-REVOKE-007), including C4's missing 2F.3 parity line.
8. **PRD corrections C1, C2, C3** — owner-authorized, minimal, recorded in a revision-history entry.

**Why it is coherent.** Not thematically — mechanically. CI's `database` job applies the full chain and runs the full pgTAP suite in one job, so the revocation and its 13 dispositions are inseparable. `npm run test:remote` is `remote-supabase-smoke.mjs`, which contains two affected writes, so the smoke rework is a prerequisite of the same deployment session that applies the migration. And 2F-REVOKE-003's harness must be green *before* the deploy it de-risks. One PR, one revert boundary, one session.

**What should be deferred:** everything in §7.2. Specifically — no measurement reader, no traceability generator, no cleanup verifier, no census re-run, no reminder authoring contract, no `snoozed` retirement, no AI provenance, no reconciliation migration.

**Does it close Phase 2F?** **No.** 2F.5 (MEASURE 1–7) and 2F.6 (OPERATIONS 3–6 + convergence audit) remain. After 2F.4 the *architectural* objective is complete; the *phase* is not.

**Estimated implementation risk: medium.** Low-risk parts: the migration is four `revoke` statements with assertions, and the application is provably unaffected. Medium-risk parts: 13 pgTAP restagings that must preserve their exact meaning (three are interference proofs where re-seeding would change what they prove), a CI harness step that does not exist yet, and a remote smoke whose redesign must not quietly drop the Phase-1 cross-owner ownership proof. High-risk parts: none, provided C1–C3 are settled first.

---

## 9. Explicit exclusions

Out of Slice 2F.4, each for a stated reason:

- **Measurement reader / evidence gate (MEASURE 1–7)** — 2F.5. §6.
- **Traceability generator, cleanup verifier, census stop-gate, convergence audit (OPERATIONS 3–6)** — 2F.6.
- **Reminder authoring contract, `create_reminder` RPC, reminder cancel/edit UI** — forbidden by 2F-REMINDER-001; retaining INSERT is an owner decision.
- **`snoozed` retirement** — 2F-REMINDER-004 defers it explicitly.
- **Reminder reconciliation migration** — removed by owner decision 2. A nonzero census bucket at 2F.6 is a stop-gate requiring a *new* owner decision, and does not authorize a migration then either.
- **AI provenance / `2E-COMMAND-012`** — ADR-057, deferred past Phase 2F behind the dry-run reopening gate.
- **`audit_logs` INSERT grant narrowing** — out of Phase 2F's stated invariant; only the false prose at `202607170028:33` is corrected.
- **Any 2F.1/2F.2/2F.3 rework** — closed and not reopened. C4's missing `STATE.md` parity line is carried forward as documentation reconciliation, not as a reopening.
- **Widening any grant anywhere** — 2F-REVOKE-006.

---

## 10. Proposed file list

**Database (1 new file)**
- `supabase/migrations/202607300063_phase_2f_task_grant_revocation.sql` *(new — exact timestamp assigned at implementation)*

**Rollback**
- `scripts/phase-2f-regrant-task-write-grants.sql` *(new — the committed re-grant, 2F-REVOKE-003)*

**pgTAP (edits only)**
- `supabase/tests/phase_2e_task_command_apply.sql` — dispositions 1–6 (§9 rows 1–6) + the `:1382-1384` comment correction
- `supabase/tests/phase_2e_task_command_creation.sql` — dispositions 7–11 plus the two C2 additions (`:1582`, `:1609`)
- `supabase/tests/phase_2f_task_write_grants.sql` *(new — pre-revocation assertion, post-revocation denial, `select`/RLS preservation, reminders posture, `create_due_task_reminder` definer-context proof)*

**CI**
- `.github/workflows/ci.yml` — the re-grant harness step in the `database` job

**Remote smokes**
- `scripts/remote-phase-2e-smoke.mjs` (`:144` → `admin`)
- `scripts/remote-editable-candidate-confirmation-smoke.mjs` (`:797` → `admin`)
- `scripts/remote-supabase-smoke.mjs` (`:258` redesigned, preserving the `:265-270` cross-owner proof; `:286` untouched)

**Documentation**
- `docs/PHASE_2F_PRD.md` — Revision 4.2: C1 (§12), C2 (§9 → 13 rows), C3 (line anchors), + revision-history entry **(owner authorization required)**
- `docs/SECURITY.md` — 2F-REVOKE-007 task closure + reminders determination outcome
- `docs/DATABASE.md` — grant posture, the now-unreachable `_update_own`/`_delete_own` policies, `snoozed` dormancy cross-reference
- `docs/STATE.md` — posture, slice status, C4's missing 2F.3 parity line
- `docs/TODO.md` — close lines 222 and 248; reconcile 235; discharge the `202607170028:33` item in 228
- `docs/CHANGELOG.md`
- `docs/reports/PHASE_2F_SLICE_04_REPORT.md` and `…_ACCEPTANCE.md` *(new)*
- `supabase/migrations/202607170028_phase_2x_candidate_action_consistency.sql` — **not edited** (append-only; the false claim is corrected in `DATABASE.md`/`SECURITY.md` prose, per house convention)

**Explicitly unchanged:** every file under `src/` except none — **no application source file changes in this slice.** That is itself a verification: if `src/` needs an edit, a production caller was missed.

---

## 11. Proposed migration count and database changes

**Exactly one migration.** This satisfies §7's "migrations expected in the whole phase: exactly two" (2F.3's creation contract + 2F.4's revocation).

Contents:

1. `revoke insert, update, delete on public.tasks from authenticated;`
2. `revoke update, delete on public.reminders from authenticated;` — **conditional on the determination**; recommended yes
3. Post-deploy `DO` assertions, raising and aborting on failure (the `202607290062` pattern, proven in the 2F.3 session):
   - `has_table_privilege('authenticated','public.tasks','insert'|'update'|'delete')` all **false**
   - `has_table_privilege('authenticated','public.tasks','select')` **true**
   - `has_table_privilege('authenticated','public.reminders','insert'|'select')` **true**; `'update'|'delete'` **false**
   - `anon` holds nothing on either table
   - the four RLS policies on each table still exist and RLS is still `force`
   - the six triggers still exist
   - `create_due_task_reminder` is still `security invoker`

**No sequence clause** (§4.2). **No RLS policy change** (2F-REVOKE-006) — `_update_own` and `_delete_own` become unreachable-but-present, which must be *documented* rather than dropped, because dropping them is a second change with its own rollback. **No function signature change. No new RPC. No grant widened anywhere.**

---

## 12. Test plan

**CI `app`** — unchanged and expected green with no edits. `direct-write-guard.test.ts` stays empty-allowlist green; `work-surface-reuse.test.ts`, `sql-grammar-guard.test.ts`, `policy-lock.test.ts`, `database-types-parity.test.ts` unaffected (no signature change).

**CI `worker`** — unchanged; the worker touches neither table.

**CI `database`** — the load-bearing gate:
1. `supabase db reset` applies the chain including the revocation.
2. `phase_2f_task_write_grants.sql` asserts, in one run: the pre-revocation grant was in effect (non-vacuity, reworded per C1), the post-revocation denial, `select`/RLS preservation, the reminders posture, and the `create_due_task_reminder` definer-context proof.
3. The full pgTAP suite green with all 13 dispositions landed (2F-TESTMIG-008). Baseline to beat: `Files=31 Tests=1324 Result=PASS`; expect 32 files and a higher count.
4. `db lint --schema public,private --fail-on error` clean.
5. **New harness step:** apply the revocation → apply `phase-2f-regrant-task-write-grants.sql` → prove by pgTAP that the previously-revoked writes function again. **Scope statement, mandatory wherever this is cited:** this proves the re-grant SQL applies and restores privileges on a stack whose starting privileges come from the migration chain itself (C1). It does **not** prove an operational rollback of a live database — PostgREST schema-cache convergence and in-flight session behaviour are named residuals, observable only in the deployment session.

**Deployment session** — full existing remote suite (2F-REVOKE-005), all reworked smokes, `test:remote:2e:cleanup`, authenticated journeys desktop + mobile × pt-BR + en as regression (§10's 2F.4 column), parity re-verified before and after.

**Evidence loss, stated rather than implied** (2F-REVOKE-004): write-side RLS on `tasks` becomes untestable from a client role, because the grant refuses before RLS is consulted. Compensating evidence: read-side RLS (cross-owner `select` provably empty) + RPC-boundary denial (`apply_task_command` against another owner's task raising `P0002`), both already exercised.

---

## 13. Deployment-session gates

Modelled on 2F.3's executed 21-gate package. Proposed for 2F.4:

| # | Gate |
|---|---|
| 1 | Merge-SHA CI green on all three jobs, cited by run id |
| 2 | Re-grant harness step green in that same run, with its C1-corrected scope statement |
| 3 | Pre-deployment parity `202607290062` |
| 4 | Migration applies first-attempt; post-deploy `DO` assertions pass (a successful apply *is* their proof) |
| 5 | Post-deployment parity `202607300063` |
| 6–9 | Live probe: `authenticated` INSERT / UPDATE / DELETE on `public.tasks` each refused (four checks incl. the recorded SQLSTATE) |
| 10 | `authenticated` SELECT on `public.tasks` still works, RLS-scoped |
| 11 | `authenticated` INSERT on `public.reminders` still works (Option C alive) |
| 12–13 | `authenticated` UPDATE / DELETE on `public.reminders` refused (if revoked) |
| 14 | `createRecord` creates a task through the rendered form, post-revocation, `created_by = 'user'` |
| 15 | All four Work actions apply through `apply_task_command`, post-revocation |
| 16 | Undo of a user-created task still functions |
| 17 | `create_due_task_reminder` still fires on a definer-context task insert (2F-REVOKE-002) |
| 18 | `run_user_heartbeat` still marks a reminder sent |
| 19 | **PostgREST schema-cache convergence observed** — the residual 2F-REVOKE-003 explicitly does not cover |
| 20 | Full remote suite green in-session (2F-REVOKE-005) |
| 21 | Authenticated journeys 4/4 (desktop+mobile × pt-BR+en) |
| 22 | `tasks` direct-write allowlist empty (2F-REVOKE-008) |
| 23 | `test:remote:2e:cleanup` clean, zero residue |
| 24 | Final parity re-check |

Per 2F-PRECOND-003, the report names the session each gate executed in; an unexecuted gate may not be cited.

---

## 14. Rollback plan

**Rollback boundary: the PR, plus the committed re-grant script. The migration is never reverted** (standing posture, unbroken since Phase 2B).

| Layer | Rollback | Residual |
|---|---|---|
| Migration | **not reverted.** If the revocation must be undone operationally, execute `scripts/phase-2f-regrant-task-write-grants.sql` — rehearsed at SQL level in CI, executed against the live project only if needed | PostgREST schema-cache convergence lag and in-flight session behaviour; observable only live (gate 19) |
| pgTAP + smokes + CI step | mechanical revert of the PR | none |
| Application source | **nothing to revert** — no `src/` file changes | none |
| Documentation | reverts with the PR | none |

**The rollback is materially safer than 2F.2's and 2F.3's**, for one reason worth stating: this slice changes no application code, so re-granting restores the exact pre-slice privilege state with no code/database skew. There is no data effect of any kind — a revocation writes no rows. This is the phase's only slice with **zero** data residual.

Failure-mode sequencing, if the deployment session goes wrong: execute the re-grant, re-verify gates 6–13 inverted, leave the migration applied, record the outcome, and stop. Do not attempt to `drop`/re-apply the migration.

---

## 15. Owner decisions required

Answers to the ten decision questions, then the authorizations.

**Q1 — Are any production-reachable direct writes still preventing "One Write Path"?**
**No.** Zero for `public.tasks`, in any module, in any form. One for `public.reminders` — `createReminder`'s INSERT — which is the sanctioned Option C exception and is deliberately retained. The objective is blocked only by the grant.

**Q2 — Are reminder UPDATE/DELETE user commands, derived side effects, maintenance, or a mixture?**
**A mixture, and no user commands at all.** UPDATE is derived reconciliation (paths 3–5) plus system maintenance (path 6). DELETE happens exclusively by FK cascade. The user-intent surface for reminders is INSERT-only (path 1); path 7 — user cancellation or editing — does not exist. This is why the determination can revoke both without touching user-facing behaviour.

**Q3 — Can obsolete grants be revoked without changing application behaviour?**
**Yes.** `tasks` INSERT/UPDATE/DELETE and `reminders` UPDATE/DELETE have zero production callers. `tasks` DELETE and `reminders` DELETE have zero callers of any kind, anywhere in the repository. The only behaviour that changes is in three remote-smoke fixtures and 13 pgTAP statements, all dispositioned. One honest caveat: the direct-write guard detects PostgREST builder chains only — it would not catch a raw-SQL fallback issued through an RPC or a dynamically-named table. The revocation itself is the backstop for that class, which is one more argument for shipping it.

**Q4 — Is a new migration required?**
**Yes.** A grant change is a schema change; the repository has no other mechanism, and the house pattern (`202607170016:196-252`) is exactly a list of bare `revoke … from authenticated` statements.

**Q5 — Can the complete slice be implemented with exactly one migration?**
**Yes.** Two-to-four `revoke` statements plus a post-deploy `DO` assertion block, in one file. The re-grant is a committed *script*, not a migration, so the phase total stays at two.

**Q6 — Is a measurement reader genuinely required for Phase 2F?**
**Yes, genuinely required — and not stale, not satisfied — but it is 2F.5's, not 2F.4's.** No reader exists; `product_events` is already SELECT-granted and RLS-scoped, so it needs no migration; ADR-055 and the live `TODO.md:30` expiry entry both depend on it. Building it in 2F.4 would put a read-only feature inside the phase's highest-risk migration.

**Q7 — Is 2F.4 a single coherent slice, or should it be divided?**
**Single, and it should not be divided.** The division the PRD already made (2F.4 implementation, 2F.5 measurement, 2F.6 closeout) is correct and mechanically forced. Within 2F.4, the revocation and the test-suite semantic migration cannot be separated: CI applies the chain and runs the full pgTAP suite in one job, and `npm run test:remote` — 2F-REVOKE-005's own gate — contains two of the affected writes.

**Q8 — What is the rollback boundary?**
The PR revert plus `scripts/phase-2f-regrant-task-write-grants.sql`. The migration is never reverted. Zero data residual — the only Phase 2F slice with none.

**Q9 — What remote deployment evidence would be necessary?**
The 24 gates in §13. The four that carry the most weight and have no CI equivalent: **gate 19** (PostgREST schema-cache convergence — the residual 2F-REVOKE-003 explicitly excludes), **gate 20** (the full remote suite, where a forgotten writer surfaces as an unrelated failure), **gates 14–16** (the real product still creating, mutating and undoing tasks post-revocation), and **gate 17** (the invoker trigger still reached in a definer context).

**Q10 — What accepted behaviour is most at risk of regression?**
Ranked:
1. **`remote-supabase-smoke.mjs`'s cross-owner ownership proof** (`:265-270`). Its `23503` denial depends on the task insert at `:258`. A careless "delete the broken insert" rework silently destroys a Phase-1 invariant that has nothing to do with Phase 2F. Highest risk because the damage is invisible — the suite stays green.
2. **The three interference proofs** (`apply.sql:1385`, `:2436`, `creation.sql:1149`) and the two C2 additions (`:1582`, `:1609`). §9 exists precisely because mechanical re-roling would change what they prove.
3. **`create_due_task_reminder`** — the only `security invoker` function on the task-insert path. If any task-insert path survives outside a definer context, reminder creation breaks silently for that path.
4. **Manual creation and the four Work actions** — freshly landed in 2F.2/2F.3 and least soaked.
5. **`createReminder`** — must keep working; a revocation that over-reaches to `reminders` INSERT breaks a live user surface.

### Authorizations requested

| # | Decision | Recommendation |
|---|---|---|
| **A1** | Correct PRD §12's privilege-provenance paragraph (C1) and the two requirement rationales that cite it | **Approve.** Repository truth is unambiguous; the requirements themselves do not change. |
| **A2** | Extend PRD §9's normative table from 11 to 13 rows (C2), classifying `creation.sql:1582`/`:1609` as privileged-interference restagings | **Approve.** Otherwise 2F-TESTMIG-001 binds work to a list that no longer describes the repository. |
| **A3** | Refresh PRD §9/§2 `creation.sql` line anchors (+74) (C3) | **Approve.** Citation hygiene; no semantic change. |
| **A4** | 2F-REMINDER-003 determination: **revoke** `authenticated` UPDATE and DELETE on `public.reminders`, retain INSERT and SELECT | **Approve.** Zero production callers; zero DELETE statements repository-wide; two pgTAP statements already conditionally dispositioned. |
| **A5** | Leave the now-unreachable `reminders_update_own`/`_delete_own` and `tasks_update_own`/`_delete_own`/`_insert_own` RLS policies **in place**, documented, rather than dropping them | **Approve.** 2F-REVOKE-006 says policies are unchanged; dropping them is a second change with its own rollback. |
| **A6** | Confirm Slice 2F.4 scope = PRD 2F.4 exactly (REVOKE 1–8, TESTMIG 1–8, REMINDER 3) + A1–A5, with §9's exclusions held | **Approve.** |
| **A7** | Confirm the measurement reader stays in 2F.5 and closeout stays in 2F.6 | **Approve.** |
| **A8** | Optional: authorize a read-only re-run of `scripts/phase-2f-reminder-census.mjs` against the linked project **before** implementation, to attach live evidence to the A4 determination | **Optional.** The determination stands on repository evidence alone; the census would add production confirmation that nothing is mid-flight. It writes nothing and is safe against production, but it is a 2F.6 gate being pulled forward, so it needs an explicit call. |

### Stop conditions

Implementation **stops immediately and returns for a decision** if any of the following occurs:

1. A1, A2 or A3 is declined — the slice cannot cite §9 or §12 as written.
2. A4 is declined and no alternative reminders posture is given.
3. The pre-revocation privilege assertion (2F-REVOKE-004) **fails** in CI — i.e. `authenticated` cannot insert/update/delete on `tasks` *before* the revocation. That would mean the privilege model is not what either the PRD or this inventory believes, and the entire premise needs re-derivation.
4. Restaging any of the 13 pgTAP statements requires changing **what it asserts** rather than **which role writes it**.
5. `remote-supabase-smoke.mjs`'s cross-owner `23503` proof cannot be preserved without a service-role vehicle that weakens it.
6. Any `src/` file needs an edit — that means a production caller was missed by this inventory and by the writer inventory.
7. The CI re-grant harness cannot be made green without weakening its stated scope.
8. A grant would have to widen anywhere (2F-REVOKE-006).
9. In the deployment session: gate 19 shows schema-cache behaviour that leaves live sessions in an inconsistent state, or gate 20's full remote suite fails on a surface this slice did not touch.

**No implementation begins until A1–A7 are answered.**
