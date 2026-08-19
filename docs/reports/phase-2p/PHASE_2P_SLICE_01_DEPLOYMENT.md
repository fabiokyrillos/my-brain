# Phase 2P — slice 2P.1 deployment record

Migration `202608180098_phase_2p_slice_1_entry_lifecycle_rederivation.sql`, the
**single** migration ADR-122's amendment authorized for this slice. Applied
2026-08-19.

---

## 1. Provenance

| | |
|---|---|
| Pull request | **#259**, merged |
| Implementation SHA | `6dd562505b5be7610ac404c4de4996c8cc092585` |
| **Merge SHA** | **`4d04f5930ec9fbfc2519dd3f5dc9049328ea6285`** |
| CI on the implementation SHA | four check-runs, **all `success`** |
| **CI on the exact merge SHA** | three check-runs, **all `success`** |
| Working tree at deployment | clean; the migration file **byte-identical** to `main` — `sha256 38b41d1cb5625cb4c6652918ca1edd53d2ac9e644561e92f266f69c6fb6f8fc5`, compared against `git show 4d04f59:…` |
| Reviews / actionable comments | **zero** — the only PR comment is the Vercel bot's deploy metadata |

### The `database and journey` job, read step by step at both points

§91 recorded a job that reported four green conclusions while its browser lane
had never run, so the conclusions are not trusted without the step list.

| Step | head `6dd5625` | merge `4d04f59` |
|---|---|---|
| 7 whole migration chain on an empty database | `success` | `success` |
| 8 full pgTAP suite | `success` | `success` |
| 9 `supabase db lint` | `success` | `success` |
| 11–13 three concurrency proofs | `success` | `success` |
| 14 build the application under test | `success` | `success` |
| **15 `Install the browser`** | **`success`** | **`success`** |
| **16 `Run the deterministic foundation journey`** | **`success`** | **`success`** |
| 17 rollback rehearsal | `success` | `success` |
| 18–19 artifact collectors | `skipped` — correct, they are `if: failure()` | same |

**21 `success`, 2 `skipped`, zero `cancelled`** at both points.

---

## 2. The backup and posture gate — executed, and it reports blockers

`npm run backup:check`:

```
  MISS  pg_dump is not available.
  MISS  SUPABASE_DB_URL is not set.
  MISS  BACKUP_ENCRYPTION_KEY is not set.
3 blocker(s).
```

These are **textually the same three blockers recorded on 2026-08-07** in
`docs/reports/post-2h-rollout/POST_2H_BACKUP_READINESS.md` §7, where `RG-DEP-3`
is carried as **INCOMPLETE**. This slice does not change that posture, does not
close it, and does not treat it as passed. It is an owner-signature residual and
it stays exactly where it was.

`npm run backup:census`, 2026-08-19T02:10:41Z, project `ulvwzqlpsjyrnqzfxmck`
— the pre-application state the post-application state is measured against:

```
  entries 3 · entry_interpretations 7 · tasks 9 · people 2 · organizations 1
  projects 0 · contexts 0 · memories 1 · notifications 39 · jobs 7
  audit_logs 341 · ai_usage_events 21 · product_events 541
  TOTAL 972
```

---

## 3. The dry run — exactly one pending migration

```
$ npx supabase db push --dry-run --linked
DRY RUN: migrations will *not* be pushed to the database.
Would push these migrations:
 • 202608180098_phase_2p_slice_1_entry_lifecycle_rederivation.sql
```

Read **before** the push. It is the check that would have caught a second file
riding along.

## 4. Application

```
$ npx supabase db push --linked
Applying migration 202608180098_phase_2p_slice_1_entry_lifecycle_rederivation.sql...
NOTICE: trigger "entries_zz_preserve_updated_at_on_rederivation" ... does not exist, skipping
NOTICE: trigger "tasks_rederive_entry_lifecycle" ... does not exist, skipping
NOTICE: trigger "entry_task_candidate_resolutions_rederive_entry_lifecycle" ... does not exist, skipping
NOTICE: trigger "pending_questions_rederive_entry_lifecycle" ... does not exist, skipping
NOTICE: trigger "entry_person_candidate_resolutions_rederive_entry_lifecycle" ... does not exist, skipping
Finished supabase db push.
```

The five notices are the migration's own `drop trigger if exists` guards on a
first application. Nothing else was reported.

## 5. Parity — read live, read-only

`npx supabase migration list --linked` ends `202608180098 | 202608180098 |
202608180098`, and read directly from the database:

| | |
|---|---|
| hosted migrations | **98** |
| local migrations | **98** |
| **parity** | **`202608180098`** |

Objects present, counted rather than assumed:

| Object | Count |
|---|---|
| `private` contract functions (`entry_pending_decisions`, `entry_lifecycle_state`, `rederive_entry_lifecycle`, `rederive_entry_lifecycle_from_row`, `normalized_element_trust`, `preserve_updated_at_on_rederivation`, `undo_confirm_entry_interpretation`) | **7** |
| `public.confirm_entry_interpretation` | **1** |
| re-derivation triggers running `rederive_entry_lifecycle_from_row` | **4** |
| `entries_zz_preserve_updated_at_on_rederivation` | **1** |
| registered undo handler | `undo_confirm_entry_interpretation` |

---

## 6. The backfill moved one entry, and did not make it look new

The migration's final block re-derives the entries the defect had already
stranded. It moved **exactly one**: the entry that was `partially_processed`
became `awaiting_review`, and wrote **one** audit row —
`audit_logs` 341 → 342, the whole of the difference from the census above.

**Its `updated_at` is unchanged**, still `2026-08-17T00:04:49.401446+00:00`.
That is owner decision (i) working on real data at the first opportunity:
repairing a stranded entry's status did not make an old entry look freshly
touched, and did not move it up Needs You.

---

## 7. The hosted proof, owner-scoped

### 7.1 Correction 3(a), on the owner's own three entries — read-only

| Entry | what genuinely remains | queue reason |
|---|---|---|
| A | `element_policy` | `review_interpretation` |
| B | `task_candidate`, `person_candidate`, `element_policy` | **`confirm_existing_candidates`** |
| C | `element_policy` | `review_interpretation` |

Before this slice **all three** would have reported the generic
`review_interpretation`. Entry B now says what it is actually waiting for, and
`review_interpretation` on A and C now means the one true thing left: the
interpretation itself is unconfirmed. Only **two** of the five deployed reasons
are in use and no sixth name exists — the vocabulary
`needs_attention_item_opened` validates inside the database is untouched.

### 7.2 The lifecycle contract, end to end — in transactions that were rolled back

| Property | Result |
|---|---|
| an entry with only the element policy left | `awaiting_review` |
| an entry with an open question | `partially_processed` |
| **confirming while a question is open** | **refused, `55P03`** — not the `40001` that hangs the gateway |
| confirming the settled entry | → **`completed`**, undo id returned |
| replay with the **same** operation key | `idempotent: true` |
| a **different** key on an already-confirmed entry | `idempotent: true`, and confirmation rows stay **1** — **defect 6 closed** |
| `updated_at` across the confirmation's re-derivation | **preserved** |
| **answering the question** (through the trigger) | `partially_processed` → **`awaiting_review`**, instant preserved |
| confirming that entry afterwards | → **`completed`** — **defect 1 closed**, both statuses are confirmable |
| **another owner's entry** | **refused, `P0002`**; that entry's status untouched |
| **undo** | `undone: true`, status back to `awaiting_review` |
| decisions after undo | `['element_policy']` — the truthful prior state re-derived, no decision fabricated |

### 7.3 The P0 defect, proved fixed on the deployed database

This is the slice's whole reason to exist, and it is one row of evidence:

| Step | `list_needs_attention` says |
|---|---|
| a settled entry, before | `review_interpretation` — it is **in** the queue |
| after `confirm_entry_interpretation` | status `completed`, and the reason is **`null`** — it has **left** |
| re-reading the projection again | still absent (`0` rows) — the answer is stable across reads, which is refresh and back navigation at the data layer |
| after `undo_operation` | `review_interpretation` — it is back, truthfully |

**Before this migration no entry could ever leave Needs You**, because the
status was derived once at interpretation time and no resolution path re-derived
it. This is that defect, measured as closed against the hosted database.

`2P-ATTENTION-008` asks for hosted journeys proving *removal, refresh, back
navigation, replay and another-owner isolation*. Removal, replay and isolation
are proved above and in §7.2. **Refresh and back navigation are proved only at
the data layer** — the projection returns the same answer on repeated reads —
because no authenticated **browser** journey was run. The requirement is
therefore **partial**, and §8 carries the remainder rather than absorbing it.

### 7.4 Zero residue, with a non-vacuity control

Every probe ran inside a transaction that was rolled back, and absence was then
**measured**:

| Probe fixture | Rows |
|---|---|
| probe users (by id, and by email pattern) | **0** |
| probe entries / interpretations / questions | **0** |
| probe `undo_operations` (`operation_key like 'probe-%'`) | **0** |
| probe audit rows | **0** |
| probe schemas | **0** |

**A zero count is not a control**, so the same predicates were aimed at what
really exists: **2** users, **3** entries, **15** `undo_operations`. The probe
can see rows; zero means absence, not blindness.

The owner's three entries carry their original `updated_at` values
(`2026-08-16T22:16:21`, `2026-08-17T00:04:49`, `2026-08-16T22:19:34`),
`confirm_entry_interpretation` audit rows total **0**, and `audit_logs` is 342 —
the census's 341 plus the backfill's single row, with nothing unaccounted for.

---

## 8. What this deployment does **not** prove

- **A live two-session race on this contract.** `rederive_entry_lifecycle` takes
  `for update` on the entry before deciding, and that lock is asserted
  structurally in pgTAP, but the hosted probe holds one connection and cannot
  run two simultaneous sessions. CI's three concurrency proofs cover other
  paths, not this one.
- **The browser journeys for this surface**, which is the open half of
  `2P-ATTENTION-008`. CI's foundation journey is unauthenticated or
  fixture-rendered and cannot see the RSC boundary — the defect class that has
  shipped twice in this repository. The confirmation panel has not been rendered
  in a real authenticated browser, so refresh and back navigation are proved at
  the projection and not in a page.
- **A restorable backup artifact.** §2 — `RG-DEP-3` stays INCOMPLETE.
- **Anything about the six resolution routes the application never calls**,
  beyond the structural fact that the contract binds to the four *tables* they
  write rather than to their bodies, so any route reaching those tables
  re-derives.

## 9. What this deployment did not touch

No grant, no RLS policy, no retention rule and no `EXECUTE` privilege on any
pre-existing function changed. The only new privilege is `EXECUTE` on
`public.confirm_entry_interpretation` to `authenticated` — the requirement's own
object. No function in `private` was granted to anyone. `public.set_updated_at`
is unmodified and no trigger was disabled at any point in the product. Signup
stays closed, rollout stays 25 pass · 3 fail · 2 owner-signature, no BYOK
credential was read or spent, and no Edge Function was deployed.
