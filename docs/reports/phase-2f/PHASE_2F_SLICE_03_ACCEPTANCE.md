# Phase 2F — Slice 2F.3 acceptance report

Deployment session executed 2026-07-29 against the linked project **`ulvwzqlpsjyrnqzfxmck`** (`my-brain`, `us-west-2`). Every gate below was **executed**; nothing is cited from static reasoning.

---

## 1. Merge and CI

| | |
|---|---|
| PR | **#26** |
| **Merge commit SHA** | **`48d6a83e97f88992ca220084ffe2673f5a80a1bd`** |
| **Merge-SHA CI run** | **`30467623925`** |
| `application` (lint, types, unit, build) | **success** |
| `edge worker` (deno types, deno tests) | **success** |
| `database and journey` (migrations, pgTAP, db lint, foundation e2e) | **success** |

Pre-merge authoritative run on the implementation head `a347e4ff…`: **`30466689290`**, all three green, pgTAP `Files=31 Tests=1324 Result=PASS`, `phase_2e_task_command_creation.sql` plan 167 / executed 167.

## 2. Migration parity

| | Value |
|---|---|
| **Pre-deployment remote head** | `202607280061` |
| **Post-deployment remote head** | **`202607290062`** |
| Local head | `202607290062` — parity complete, **no drift** |
| Migrations applied this slice | **exactly one** — `202607290062_phase_2f_creation_origin.sql` |

The migration applied on the first attempt. All post-deploy `DO` assertions passed — they raise and abort the transaction on failure, so a successful apply *is* their proof.

## 3. Deployed function signature

Probed through PostgREST against the live project, before and after:

| Probe | Before | After |
|---|---|---|
| 6-argument call | resolves — raised the function's own `42501 Authentication required` | **resolves** — same `42501` |
| 7-argument call (`p_created_by`) | **`404 PGRST202`** — "no matches were found in the schema cache" | **resolves** — same `42501` |
| `42725` ambiguity | none | **none** |

Both shapes now reach one function; neither is ambiguous. **Exactly one `pg_proc` row** was asserted inside the migration's own post-deploy block (`overloads <> 1` raises), executed against the deployed database — a stronger proof than a client probe. The deployed signature is `public.create_task_command(text, text[], jsonb, text, text, text, text)` with `pronargdefaults = 1`.

## 4. Deployment-session gate results

Executed by `scripts/phase-2f3-creation-probe.mjs` (two disposable owners, real end-user tokens through PostgREST — never `service_role`, because the tenant boundary is an `auth.uid()` predicate inside a `security definer` body) and `e2e/manual-task-creation.spec.ts`.

| # | Gate | Result |
|---|---|---|
| 1 | Parity ends at `202607290062` | ✅ |
| 2 | Exactly one `create_task_command` `pg_proc` row | ✅ post-deploy assertion |
| 3 | Only the seven-argument signature deployed | ✅ |
| 4 | Trailing parameter has one default; omitting it stays unambiguous | ✅ |
| 5 | No `42725` | ✅ |
| 6 | Bare creation through the **rendered form**, no UX change | ✅ **4/4** — desktop + mobile × pt-BR + en |
| 7 | Created task has `created_by = 'user'` | ✅ (and no invented qualifier: due/planned/priority all null, status `inbox`) |
| 8 | Audit row `actor = 'user'` | ✅ 1 row, reason `User created a task directly` |
| 9 | Available undo operation recorded | ✅ `status=available`, `action_type=create_task_command`, evidence `applied_state.createdBy = 'user'` |
| 10 | Owner's undo compensates | ✅ task → `cancelled` with `cancelled_at`, operation → `undone` |
| 11 | Legacy caller omitting `p_created_by` persists `agent` | ✅ |
| 12 | `create_title_only` accepts only an empty canonical patch | ✅ |
| 13 | Non-empty patch refuses **and writes nothing** | ✅ `Invalid task creation patch`, 0 rows written |
| 14 | Qualifier actions still work with exact patches | ✅ `reschedule_due` applied with its due date |
| 15 | Operation-key replay returns original identities | ✅ `idempotent=true`, same `task_id` and `undo_id` |
| 16 | Key reuse with changed input | ✅ `P0001 / 2E_IDEMPOTENCY_MISMATCH` |
| 17 | Two-owner, non-vacuous | ✅ owner resolves (1 row) → stranger reads 0 → stranger's undo refused `P0002` → owner's row unchanged |
| 18 | No content-bearing analytics payload | ✅ 0 leaked |
| 19 | `tasks` direct-write allowlist empty | ✅ `TASKS_ALLOWLIST = []`, gate green |
| 20 | Cleanup | ✅ 0 disposable users, 0 tasks/undo/audit/reminders residue; project-wide `codex-*` leftovers: **0** |
| 21 | Post-deployment parity `202607290062` | ✅ |

`task_command_confirmations` is reported as `unreadable(403)` rather than zero: `202607260059` revokes it from `service_role` by design. That refusal is asserted, not assumed, and an orphan there is structurally impossible under the `on delete cascade` to `auth.users`.

`npm run test:remote:2e:cleanup` — **passed**, all orphan counts 0, `tablesNotYetDeployed: []`, `remoteSmokeObjects: 0`.

## 5. Findings during the session

Two harness defects, **neither in the migration contract nor in application routing**:

1. The probe sent the seven-argument object to `issue_task_command_creation_confirmation`, which deliberately stayed at six — it does not write, so it has no origin to record. `404 PGRST202`. Fixed by stripping the origin in one helper, which makes the mistake unrepresentable at every call site.
2. The e2e spec used `getByLabel("New task")`, which substring-matches and therefore also hit the submit button's "Add new task", violating strict mode. Fixed with `{ exact: true }`.

**No production data was written by either failure**, and cleanup verified clean after both.

For the record, the three pre-merge CI failures were also all test-only — a prose-vs-code match in a post-deploy assertion, two catalog transcription errors in a post-deploy assertion, and a privilege assumption in new pgTAP. **The production SQL body has not changed since the first push of this slice.**

## 6. Rollback posture

- **Migration:** not reverted — standing posture. It persists compatibly: `p_created_by` defaults to `'agent'`, so every pre-existing caller is byte-identical, which gate 11 proved live.
- **Code:** a revert of the application routing restores the prior manual-creation behaviour entirely.
- **Residual:** tasks created with `created_by = 'user'` keep that value. They remain undoable, because the widened guard persists too. No compensation is required.

## 7. Final state

- Working tree **clean**; the temporary Playwright config and `test-results/` removed.
- Remote parity **`202607290062`**; local head identical.
- Exactly **one** migration in this slice.
- **Slice 2F.4 has not started** — no grant revocation, no reminder UPDATE/DELETE determination, no measurement reader, no closeout work is present in the merged diff.
