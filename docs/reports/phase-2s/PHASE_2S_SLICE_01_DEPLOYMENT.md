# Phase 2S — Slice 2S.1 hosted deployment record

The one migration Phase 2S is allowed to spend, applied to the deployed project.

- **Migration:** `202608240102_phase_2s_slice_1_notification_suppressions.sql`
- **Merge SHA:** `7457d82705c00a28713a8a0f66a43b408f8ba4bf` (PR #311)
- **Applied:** 2026-08-25
- **Parity before → after:** `202608230101` → `202608240102`
- **Chain length before → after:** 101 → 102 hosted, against 102 local

This slice reached the database only after **two** green CI runs, and it took a
third commit to get there: the second CI run found a central integration the
slice had never made (§8c of the acceptance record).

---

## 1. The gate chain, in order, with what each returned

| # | gate | result |
|---|---|---|
| 1 | CI green 3/3 on PR head `31fddcc` | `application`, `edge worker`, `database and journey` — **all success** |
| 2 | the census assertion actually passed, not vanished | `signup_hardening_grant_census.sql .... ok`, `Result: PASS`, **`Files=73, Tests=2819`** — the identical assertion count to the red run |
| 3 | final diff reviewed | 29 files, **exactly one** migration |
| 4 | merged | merge commit `7457d82` |
| 5 | CI green 3/3 on the **merge SHA** `7457d82` | run `32850011856`, all three jobs **success** |
| 6 | migration bytes identical to `main` | blob `753fd78ebb5d61b9a47c4537acc7618541f4790a` in `main`, in the branch, and in the worktree |
| 7 | hosted list read **before** applying | `202608240102` present locally, remote column **empty**; all 101 others aligned |
| 8 | dry run | `Would push these migrations: • 202608240102_…` — **exactly one** |
| 9 | applied | `Finished supabase db push` |
| 10 | hosted read **after** | 102 migrations, parity `202608240102`, table/RPC/handler all present |

Gate 2 is the one worth keeping. A corrected assertion and a **deleted** assertion
both turn a suite green; only the unchanged total distinguishes them.

---

## 2. What the deployed database says now

### Grants — the posture the first CI run had to teach this slice

| probe | result |
|---|---|
| `service_role` ACL entries on the table | **0** |
| `service_role` holds SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER | **false for all seven** |
| `anon` ACL entries | **0** |
| `authenticated` | `SELECT, INSERT, UPDATE, DELETE` (+ the schema's default `REFERENCES, TRIGGER, TRUNCATE` — see §5) |

The seven-way `has_table_privilege` probe is the one that matters. `alter default
privileges` in this schema hands `service_role` four privileges on every new
table, so **zero explicit grants is not the same as zero privileges**. Both are
now confirmed on the deployed project, which is where the default actually
applies.

This is what puts the table in the fourteen-member RPC-closed set that §8c is
about. Membership is derived, never declared.

### RLS

| probe | result |
|---|---|
| `relrowsecurity` | **true** |
| `relforcerowsecurity` | **true** |
| policies | **4** — `select_own`, `insert_own`, `update_own`, `delete_own` |
| roles on each policy | `authenticated` on all four |
| policies granted to `public` | **0** |

The last row is deliberate: a policy with no role list is PUBLIC, and this
repository has paid for that once already.

### Cadence — the deployed function is the tested function

| probe | result |
|---|---|
| heartbeat consults `notification_suppressions` | **true** |
| heartbeat still carries `interval '24 hours'` | **true** — the floor did not move |
| the ladder's terminal case (`else false`) survives deployment | **true** |
| `suppress_notification_subject` is SECURITY DEFINER | **true** |
| `undo_suppress_notification_subject_v1` is SECURITY DEFINER | **false** — INVOKER, as the first CI run required |
| that handler's `search_path` | `search_path=""` |

The undo handler's posture is checked **here** and not only in CI, because it was
a real security defect one run earlier and the deployed value is the only one
that protects anybody.

### Cascade

The FK to `auth.users` carries `confdeltype = 'c'` — ON DELETE CASCADE. See §5
for what was deliberately **not** executed to prove this.

---

## 3. The owner-scoped proof, and why it was rolled back rather than cleaned up

Every write below ran inside a `DO` block whose last statement is an
unconditional `RAISE`. **Residue is zero by construction, not by cleanup** — there
is no window in which a cleanup step could be forgotten, fail, or delete the
wrong row. The two real owners already in the project were used; no user, task or
reminder was created.

Results, verbatim from the raised message:

```
A_suppression_id=true A_undo_id=true scope=forever until=<null> replaced=false
| A_sees=1 A_undo_ledger=1
| B_sees=0 B_deleted=0 B_cross_tenant=REFUSED(42501)
| A_undo={"undone": true, "affected": 1} rows_after_undo=0
| handler_registered=true
```

| claim | evidence |
|---|---|
| the owner can silence their own subject | `suppression_id` returned, `A_sees=1` |
| the act is compensable | `undo_id` returned, `A_undo_ledger=1` |
| scope and instant cannot disagree | `scope=forever` with `until=<null>` |
| **isolation** | `B_sees=0` — RLS hides A's row from the other real owner entirely |
| B cannot destroy what B cannot see | `B_deleted=0` from an unqualified `DELETE` |
| **the boundary refuses, it does not merely hide** | `B_cross_tenant=REFUSED(42501)` — B silencing A's task is rejected outright |
| **the undo is real** | `{"undone": true, "affected": 1}`, `rows_after_undo=0` |

### Residue, both sides, probed after the rollback

| probe | result |
|---|---|
| `notification_suppressions` rows | **0** |
| `undo_operations` rows for `suppress_notification_subject` | **0** |
| `audit_logs` rows matching the action | **0** |

Three probes, three zeros — and each was **sighted** first. A separate run read
the same three counters *inside* the block, after the write and before the
`RAISE`:

```
SIGHTED INSIDE >>> suppressions=1 undo_ledger=1 audit=1
```

`1, 1, 1` inside and `0, 0, 0` after. **A residue probe that was never non-zero
proves only that it cannot see** — the audit counter in particular, since nothing
would have told me if `action_type like '%suppress%'` had simply matched no rows
the RPC writes. It matches `notification_suppressed`, and the sighting is what
established that.

---

## 4. The generated types against the deployed schema — and a defect this found

Regenerating types from the deployed project and diffing against the committed
`database.types.ts` found that slice 2S.1 had added the **table** and **not** the
RPC. `suppress_notification_subject` existed in the deployed schema and in the
regenerated types, and was **absent** from the committed file.

Nothing had failed, and nothing would have until slice 2S.2 tried to call it —
this slice creates the write authority and has no caller yet. **A producer with
no consumer is invisible**, including to a type checker.

Fixed by adding the function's signature at its alphabetical position, copied
from the regenerated output. The file was **not** wholesale regenerated: the
generator cannot see the RPC-closed tables (`entry_person_candidate_resolutions`,
`rate_limit_events`, …) or several `private`-adjacent functions, so replacing the
file would have deleted type coverage that predates this phase. After the
surgical fix, the regenerated-vs-committed diff contains **nothing** from slice
2S.1, and typecheck is zero.

---

## 5. What this deployment did **not** do

**The cascade was proved structurally, not behaviourally.** `confdeltype = 'c'`
is the mechanism, and it is confirmed on the deployed table. Executing it would
mean deleting a real user from the production project; even inside a rolled-back
block, the deletion path touches triggers that can reach outside the transaction,
and a rollback does not recall a network call. The behavioural proof stays where
it belongs — the pgTAP cascade drill in CI, which this slice extended to plant a
suppression row so that a future table fails the drill by name (§8b, item 5).

**`authenticated` holds TRUNCATE on this table, and that is pre-existing schema
policy rather than something this slice introduced.** Measured on the deployed
project: of **59** public base tables, **38** grant TRUNCATE to `authenticated` —
including `entries`, `memories`, `tasks` and `reminders`. The **21** that do not
are the ones whose migrations revoked from `authenticated` explicitly, and
`reminder_series` is among them.

TRUNCATE does **not** respect RLS. The practical exposure is narrow, because
PostgREST never emits TRUNCATE, so it requires some other path that executes
arbitrary SQL as `authenticated`. It is recorded rather than fixed for three
reasons: this slice has already spent Phase 2S's only migration; the condition is
the schema's majority posture rather than this table's anomaly; and narrowing it
is a decision about **38 tables**, which belongs to the owner and not to a
deployment record. Logged in `docs/TODO.md`.

**No cleanup step ran, and none was needed.** See §3.
