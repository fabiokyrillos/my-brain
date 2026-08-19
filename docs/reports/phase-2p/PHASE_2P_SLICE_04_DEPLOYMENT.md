# Phase 2P — slice 2P.4 deployment record

**Migration `202608190099_phase_2p_slice_4_automation_policy_and_calibration.sql`
— the phase's second and final, authorized by ADR-123.** A third is a stop
condition.

---

## 1. Provenance

| | |
|---|---|
| PR | [#261](https://github.com/fabiokyrillos/my-brain/pull/261) |
| Head under test | `d263db21fec0164e895571478a040cec80525d0e` |
| Merge SHA | `ab13b26d9aba6ea005553a544f3c7246a40d67e7` |
| Reviews / actionable comments | **zero** (the only comment is the Vercel bot's deploy metadata) |
| Byte identity | `sha256 ad0d445028da93cb8ae9eb0ed1c336da9b5188fded3d307cec8f828cc2d44d80`, `main` = disk |
| Local migrations after merge | **99**, worktree clean |

### CI at the exact head, read step by step

Four check-runs, **all `success`**. The `database and journey` job was read step
by step rather than by its conclusion, because §91 recorded a job that reported
four green conclusions while its browser lane had never run:

| Step | Result |
|---|---|
| 7 — apply the whole migration chain to an empty database | `success` |
| 8 — run the pgTAP suite | `success` |
| 9 — lint the database | `success` |
| 11–13 — three concurrency proofs | `success` |
| 14 — build the application under test | `success` |
| **15 — install the browser** | **`success`** |
| **16 — run the deterministic foundation journey** | **`success`** |
| 17 — rehearse the re-grant rollback | `success` |
| 18–19 — artifact collectors | `skipped` — correct, they are `if: failure()` |

**19 `success`, 2 `skipped`, zero `cancelled`.**

pgTAP, from the log rather than from the conclusion:
**`Files=68, Tests=2595`, `All tests successful.`, `Result: PASS`** — with
`phase_2p_automation_policy.sql`, `signup_hardening_cascade_drill.sql` and
`phase_2o_privacy_enumeration.sql` each reported `ok`. The last two are the
files that failed on the first head and caught this slice's two schema defects.

## 2. The backup and posture gate — executed, and it reports blockers

`npm run backup:check`:

```
  MISS  pg_dump is not available.
  MISS  SUPABASE_DB_URL is not set.
  MISS  BACKUP_ENCRYPTION_KEY is not set.
3 blocker(s).
```

**Textually the same three blockers recorded on 2026-08-07** in
`docs/reports/post-2h-rollout/POST_2H_BACKUP_READINESS.md` §7, where `RG-DEP-3`
is carried as **INCOMPLETE**. This slice does not change that posture, does not
close it, and does not treat it as passed.

`npm run backup:census`, 2026-08-19T04:51:37Z, project `ulvwzqlpsjyrnqzfxmck` —
the pre-application state the post-application state is measured against:

```
  entries 3 · entry_interpretations 7 · tasks 9 · people 2 · organizations 1
  projects 0 · contexts 0 · memories 1 · notifications 39 · jobs 7
  audit_logs 342 · ai_usage_events 21 · product_events 541
  TOTAL 973
```

## 3. The dry run — exactly one pending migration

```
$ npx supabase db push --dry-run --linked
DRY RUN: migrations will *not* be pushed to the database.
Would push these migrations:
 • 202608190099_phase_2p_slice_4_automation_policy_and_calibration.sql
```

Read **before** the push. It is the check that would have caught a second file
riding along.

## 4. CI on the exact merge SHA, read step by step again

`ab13b26`, run `32217233012`. Three check-runs, all `success`.
**41 `success`, 2 `skipped`, zero `cancelled`** across every job — the two
skipped are the `if: failure()` artifact collectors. Step 7 (whole chain on an
empty database), step 8 (pgTAP), steps 11–13 (three concurrency proofs), step
15 (`Install the browser`) and step 16 (`Run the deterministic foundation
journey`) all `success`.

## 5. Application

```
$ npx supabase db push --linked
Applying migration 202608190099_phase_2p_slice_4_automation_policy_and_calibration.sql...
Finished supabase db push.
```

## 6. Parity — read live, read-only

| | |
|---|---|
| hosted migrations | **99** |
| local migrations | **99** |
| parity | **`202608190099`** |
| `automation%` tables | **2** |
| `automation%` functions | **9** |
| undo handlers | **18** (was 17) |
| **policy rows** | **0** |
| **observation rows** | **0** |

**The fail-closed property, measured on the deployed database rather than
argued:** the migration created the whole contract and wrote **no policy row for
any account**. Absence computes `suggest_only`, so nothing is automatic and
nothing can be read as consent.

## 7. The hosted proof, owner-scoped

### 7.1 The owner's six categories — read-only, on real data

| Category | state | eligible | reason | reviewed | producer? | required |
|---|---|---|---|---|---|---|
| task | `suggest_only` | **false** | `suggest_only_by_owner` | 0 | yes | 50 |
| person | `suggest_only` | **false** | `suggest_only_by_owner` | 0 | yes | 80 |
| project | `suggest_only` | **false** | `suggest_only_by_owner` | 0 | **no** | 60 |
| organization | `suggest_only` | **false** | `suggest_only_by_owner` | 0 | **no** | 60 |
| memory | `suggest_only` | **false** | `suggest_only_by_owner` | 0 | **no** | 80 |
| relation | `suggest_only` | **false** | `suggest_only_by_owner` | 0 | **no** | 100 |

**`reviewed` is 0 for all six, including the two with a producer.** The producer
is an `after insert` trigger, so it cannot see the owner's pre-existing
resolutions, and none are backfilled. That is the contract working, not a gap:
manufacturing evidence for reviews that predate it is what ADR-123 Decision 4
forbids.

### 7.2 Grants and RLS, as deployed — read-only

| | |
|---|---|
| `authenticated` on `automation_category_policies` | **`SELECT`** and nothing else |
| `authenticated` on `automation_calibration_observations` | **`SELECT`** and nothing else |
| tables with RLS enabled **and forced** | **2** |
| SELECT policies **naming** `authenticated` | **2** |
| `private` functions reachable by `authenticated` | **0** |

### 7.3 Behaviour, in a transaction that was rolled back

| Probe | Result |
|---|---|
| arming a category | `automatic_when_eligible` → still **`insufficient_calibration`**, `eligible=false` |
| disabling it | **`automation_disabled_by_owner`**, immediately |
| the other owner | untouched — `suggest_only_by_owner`, `reviewed` 0 |
| undo | policy rows **1 → 0**: a policy that had no row is restored to having no row, not to a default |
| replaying that undo | refused **`55P03`** — the category no longer holds the state the operation produced |

### 7.4 The generated types match the hand-written ones, byte for byte

The migration could not be deployed before the code needed its types, so the
four entries in `database.types.ts` were written by hand. Regenerated from the
deployed schema afterwards and compared block by block:

```
IDENTICAL  automation_category_policies         (24 lines)
IDENTICAL  automation_calibration_observations  (60 lines)
IDENTICAL  automation_category_status           (21 lines)
IDENTICAL  set_automation_category_policy       (4 lines)
```

The whole-file diff carries 330 lines of **pre-existing** ordering drift between
the generator and the long-maintained committed file; **zero** of them mention
`automation`, and the same comparison against the pre-slice file carried 414.

### 7.5 Zero residue, with a non-vacuity control

| Probe fixture | Rows |
|---|---|
| policy rows | **0** |
| observation rows | **0** |
| `set_automation_category_policy` undo rows | **0** |
| `automation_policy_changed` audit rows | **0** |
| probe undo rows (`operation_key like 'proof-2p4:%'`) | **0** |

**A zero count is not a control**, so the same predicates were aimed at what
really exists: **2** users, **3** entries, **342** `audit_logs` rows, **99**
migrations at `202608190099`. `audit_logs` is unchanged at 342 — the migration
performs no backfill and writes no audit row, which the file itself proves: its
only top-level `insert` is the undo-handler registry row.

## 7.6 The authenticated browser journey, executed after application

`e2e/online-phase-2p-automation.spec.ts` signs a disposable account into the
deployed database and drives the real surface. **6 of 6 pass on desktop and 6 of
6 on mobile** — the first time this surface has been rendered in a real
authenticated browser.

It found a defect no local test could: the write always committed and the **page
never re-rendered**, so the undo control never appeared until the owner reloaded
by hand. Four mechanisms were measured before one worked; the acceptance record
carries the table. Both controls now navigate for real.

**The cascade fix was re-proved on production while cleaning up.** Three
disposable probe accounts holding policy rows, undo rows and audit rows were
deleted through `admin/users/{id}`; all three returned `200`, and `audit_logs`
returned to exactly **342** — the append-only defect CI caught, proved closed on
the deployed database rather than only in CI.

**Residue after all of it: zero, with the same non-vacuity control.** 2 users, 3
entries, 9 tasks, 342 audit rows; 0 journey accounts, 0 policy rows, 0
observations, 0 automation undo rows, 0 automation audit rows; parity
`202608190099`.

## 8. What this deployment does **not** prove

- **That any category can be automated.** None can, and none was enabled. The
  calibration evidence is zero for all six.
- **That an automatic write behaves correctly**, because none exists.
  `2P-AUTONOMY-005` … `-008` are encoded rules, classified `not-built-by-rule`.
- **A live two-session race** on the policy control.
- **Anything about real hardware.** §7.6's mobile lane is a Pixel 7 emulation;
  `2P-MOBILE-005`'s rule that hardware claims stay NOT EXECUTED is untouched.
- **A restorable backup artifact.** §2 — `RG-DEP-3` stays INCOMPLETE.

## 9. What this deployment did not touch

No grant, RLS policy, retention rule or `EXECUTE` privilege on any pre-existing
object changed. The only new privileges are `SELECT` on the two new tables and
`EXECUTE` on the two new `public` functions, all to `authenticated`; nothing in
`private` is granted to anyone. No `product_events` vocabulary value, name or
surface was added. No sweep was scheduled. Signup stays closed, rollout stays
25 pass · 3 fail · 2 owner-signature, no BYOK credential was read or spent, and
no Edge Function was deployed.
