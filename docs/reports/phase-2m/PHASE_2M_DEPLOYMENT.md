# Phase 2M — deployment record

**Authorization:** ADR-105. Migration budget **`2 allocated · NON-TRANSFERABLE`**.
A third is a stop condition.

This file records each migration's application to the **hosted** project, the
parity reading that followed, and the hosted proof. Everything below was
**executed**; nothing is inferred. Migration 2 will be appended here when slice
2M.4b spends it.

---

## Migration 1 — `202608110090_phase_2m_daily_cycle_telemetry.sql`

**Slice 2M.1, part 1.** The daily-cycle telemetry vocabulary and the `calendar`
surface, spent **before any producer exists** (`2M-METRICS-001`).

### 1. Provenance

| | |
|---|---|
| Pull request | **#168**, merged |
| Implementation SHA | `a5ed76b529402eedff54ccb56d646b26f741a131` |
| **Merge SHA** | **`6ca03142fa3bd4ef09f973b97f830ef7907a67c1`** |
| CI on the implementation SHA | run `31497188527` — **success**, all three jobs |
| **CI on the exact merge SHA** | run `31497762173` — **success**, all three jobs |
| Working tree at deployment | clean; the migration file **byte-identical** to the merge SHA (`sha256 6cdc61fd2e2a36862a8c8d11dbebd9e010d58f96ddf86e2a41e535951d7ed9ce`, compared against `git cat-file -p 6ca0314:…`) |

The `database` CI job is the one that matters most here: it applies **the whole
migration chain from an empty database**, runs `supabase db lint`, and executes
the full pgTAP suite — including the 39-assertion
`post_2j_product_event_write_path.sql`. It passed on both SHAs.

### 2. The dry run — exactly one pending migration

```
$ npx supabase db push --dry-run --linked
DRY RUN: migrations will *not* be pushed to the database.
Would push these migrations:
 • 202608110090_phase_2m_daily_cycle_telemetry.sql
```

Read **before** the push, and it is the check that would have caught an
unexpected second file riding along.

### 3. Application

```
$ npx supabase db push --linked
Applying migration 202608110090_phase_2m_daily_cycle_telemetry.sql...
Finished supabase db push.
```

Applied **2026-08-11**. The migration's own verification blocks ran inside that
apply and would have aborted it: the event-name CHECK was widened without losing
a pre-existing name; the validator knows all six new names and lost none; the
CHECK and the validator agree **name-by-name**, refusing to run vacuously below
36 names; the surface CHECK admits `calendar` and lost nothing; the writer
carries **no** vocabulary copy, checked name-by-name from the catalog; and RLS,
forced RLS, the policy set, `service_role`'s absence of SELECT and DELETE, the
append-only posture and the writer's `security definer` / empty `search_path`
are all unchanged.

### 4. Parity — read live, read-only

```
$ npx supabase migration list --linked
   …
   202608090088 | 202608090088 | 202608090088
   202608090089 | 202608090089 | 202608090089
   202608110090 | 202608110090 | 202608110090
```

| | |
|---|---|
| Reading taken | **2026-08-11** |
| Hosted parity **before** | `202608090089` (89 migrations) |
| Hosted parity **after** | **`202608110090`** (**90** migrations) |
| Local = remote | **yes**, every row, no gap and no orphan |
| Migration budget | **`2 allocated · 1 spent`** |

### 5. The hosted proof — every event and every surface, through the real writer

Two harnesses were run against the deployed project. Both create disposable
owners through the admin API (signup is closed and stays closed), write only
`is_synthetic = true` rows, and delete their owners in a `finally`.

#### 5.1 `npm run test:remote:product-events`

```
Remote product-events smoke passed: {
  taxonomyEvents: 39,
  ownerVisibleRows: 42,
  conversion: { captureStarted: 2, captureSaved: 1, processingCompleted: 2 },
  latencySamplesMs: [ 4, 5, 6, 7, 1 ],
  controls: [ 'allowlist', 'privacy', 'idempotency', 'distinct-interactions',
              'subject-ownership', 'RLS', 'service-role', 'bounded-response',
              'synthetic-cleanup' ]
}
```

Every one of the **39** declared event names was written through the real
**authenticated** writer `public.record_product_event` on the deployed project,
each on the surface it will carry — including all six Phase 2M events, four of
them on the `calendar` surface.

**Two defects had to be repaired before this could run at all, and they are the
finding of this deployment:**

1. **The smoke had been unrunnable since `202608070081`.** Its first assertion
   compares its hand-written event matrix to `productEventNames` by **exact
   ordered equality**, and the matrix stopped at Phase 2E's four names. Phase 2H
   added one, Phase 2J three and Phase 2K three, and each time the gap widened
   in silence — because a manual script that is never run reports nothing at all.
   `2E-ANALYTICS-006`'s vocabulary reader stopped the smoke from *drifting*;
   nothing stopped it from being *abandoned*. Thirteen names were added, and the
   assertion is meaningful again.
2. **It signed in with `grant_type=password`**, which Turnstile has refused since
   Signup Hardening SH.5. It now mints a session through
   `admin/generate_link` + `verifyOtp`, the CAPTCHA-free path
   `sh5-password-policy-probe.mjs` established.

#### 5.2 `npm run measure:2m:proof`

The producer → writer → **consumer** proof, reading through the consumer's own
code path rather than a query invented for the occasion:

```
Q1  Calendar opened: 4       day 1 · week 2 · agenda 1
Q2  Planning actions: 3      set 2 · cleared 1 · in bulk 2 · items touched 10
Q3  Reviews opened: 4        day 2 → acted 2 (100%) · next_day 2 → acted 0 (0%)
                             carry_forward 1 · reschedule 1
Q4  Notifications silenced: 3  quiet_hours 2 · daily_cap 1
    Consent transitions: 2     granted 1 · revoked 1
```

Every aggregate matched the corpus exactly. Six controls, all **non-vacuous**:

| Control | Result |
|---|---|
| An undeclared event name (`calendar_day_viewed`) | refused `22023` |
| An undeclared surface (`planner`) | refused `22023` |
| **A user-chosen date** (`plannedDate`) on a valid event **and** a valid surface | refused `22023` |
| An out-of-enum `orientation` on the `calendar` surface | refused `22023` |
| A replayed idempotency key | recorded **once**, same `event_id` |
| RLS bound, tested against a **row that exists** and belongs to somebody else | not read |

The last one is the shape that matters: the consumer's isolation is proved
against a foreign row that was really written, never against an empty database.

**A third defect was found here and corrected in both places it appeared.** The
reader selected, filtered and ordered by `product_events.occurred_at`, and that
**column does not exist** — the ledger's only timestamp is `created_at`
(`202607170024:51`). PostgREST answered *"column product_events.occurred_at does
not exist"* on the first run. `scripts/phase-2k-conversation-funnel-reader.mjs`
carried the identical defect **and** the identical CAPTCHA defect, so Phase 2K's
declared consumer could never have executed either; both are corrected in the
same change, and `phase-2m-telemetry-guard.test.ts` now derives the ledger's real
column list from `202607170024` and fails any consumer that reads a column the
table does not have.

### 6. Zero residue, proved owner-scoped

```
zero residue: no disposable owner survives, so none of their rows can.
total auth users: 2
residual phase-2x-events fixtures: 0
```

`product_events` is **unreadable to `service_role`** — no SELECT and no DELETE —
so a global row count could not prove anything here even if someone tried. The
honest evidence is that **no owner of those rows survives**: every disposable
account was deleted, and `auth.users` was enumerated afterwards to confirm none
with either fixture prefix remained. The rows are gone by cascade.

### 7. What this deployment does **not** prove

Stated rather than smoothed, because a harness is not a producer and recording
one as the other is how `R-09` gets violated with a green run:

- **The producer half is not proved**, because at this commit **there is no
  producer** — which is `2M-METRICS-001`'s whole point, and the reason this
  migration was merged and deployed before the calendar exists. The corpus in
  §5.2 was written by a harness standing in for the calendar, the planner, the
  day review and the notification sender.
- Those producers arrive in **slice 2M.1 part 2** (`calendar_viewed`), **2M.2**
  (`day_planned`), **2M.3** (`day_review_opened`, `day_review_action_applied`),
  **2M.4a** (`notification_consent_changed`) and **2M.4b**
  (`notification_suppressed`). Each slice's acceptance record carries its own
  producer evidence, and `2M-METRICS-003` closes only when every one of the six
  has a real producer **and** the reader that already reads it.

### 8. What this deployment did not touch

No RLS change, no grant, no policy, no Auth or GoTrue setting, no `config.toml`
push, no Edge Function deploy, no schedule, no cron job, no retention sweep, no
secret, no signup change, no rollout execution, no provider call, no BYOK use.
The migration asserts the unchanged posture rather than assuming it, and those
assertions ran during the apply.
