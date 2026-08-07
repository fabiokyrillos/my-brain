# Phase 2H — Backup posture and retention mechanism

`2H-BACKUP-001`, `2H-BACKUP-002`, `2H-RETENTION-001` … `2H-RETENTION-004`.
Slice 2H.5. Written 2026-08-07, from provider readback rather than from memory.

---

## Part I — Backup posture (`2H-BACKUP-001`)

### The reading, and its date

Taken 2026-08-07 from the Supabase Management API against the linked project
`ulvwzqlpsjyrnqzfxmck`:

```
GET /v1/projects/ulvwzqlpsjyrnqzfxmck/database/backups
  { "region": "us-west-2", "pitr_enabled": false, "walg_enabled": true, "backups": [] }

GET /v1/organizations/eyjwsxbnlwqrqqcsftle
  { "plan": "free" }

GET /v1/projects/ulvwzqlpsjyrnqzfxmck
  { "status": "ACTIVE_HEALTHY", "database": { "version": "17.6.1.147", "postgres_engine": "17" } }
```

### The honest finding, stated first

> **There is no operator-restorable backup of this project today.**

`backups: []` is empty, `pitr_enabled` is `false`, and the organization is on
the **free** plan, which provides no restorable or downloadable database backup.
`walg_enabled: true` refers to the provider's internal physical-backup
machinery; it is **not** a restore an operator can initiate, and an empty
`backups` array is what the API reports for a project with nothing to restore
from.

This is a real gap, not a documentation gap, and it is recorded here rather than
softened because a backup posture document that implied recoverability would be
the most dangerous artifact in this phase. **Destination: owner.** The smallest
action that closes it is upgrading the organization to a plan that includes
daily backups; the alternative is an owner-run `pg_dump` procedure on a
schedule, which is more work and more places for a credential to sit.

### Coverage, by class

| Class | Backed up? | By whom | Frequency | Retention | Notes |
| --- | --- | --- | --- | --- | --- |
| **Postgres database** (schema + rows) | **No operator-restorable backup** | provider (internal WAL-G only) | n/a | n/a | Free plan. `pitr_enabled: false`, `backups: []`. |
| **Storage objects** (uploaded files) | **No** | — | — | — | Not covered by database backups at all, on any plan. A database restore returns rows that reference objects that are gone. |
| **Hosted Auth configuration** (`disable_signup`, CAPTCHA, redirect allow list, SMTP) | **No** | — | — | — | Provider configuration, not database state. Reconstructed by hand from `src/features/auth/hosted-auth-posture.ts` and `scripts/hosted-auth-config.mjs`. |
| **`auth.users`** | with the database | provider | — | — | Part of the database, so it shares the database's posture. |
| **Edge Function source** | **Yes — by git** | this repository | every commit | forever | `supabase/functions/`. `verify:edge-parity` proves the deployed copy matches. |
| **Migration chain** | **Yes — by git** | this repository | every commit | forever | `supabase/migrations/`, append-only. A schema can be rebuilt from empty. |
| **External secrets** (`BYOK_MASTER_KEY`, peppers, `WORKER_DISPATCH_SECRET`, Vault entries) | **No, deliberately** | owner | — | — | Held outside the repository by design. **A restore without the original `BYOK_MASTER_KEY` recovers every credential envelope as unreadable ciphertext** — see below. |
| **Vault secrets** (`deletion_reap_url`, `deletion_reap_secret`) | **No** | — | — | — | 0/2 set today; the reaper is unarmed. |

### What recovery would actually cost, given the above

A total loss of the project today would mean:

1. **The schema is recoverable** — the migration chain is in git and applies from
   empty. This is the one strong part of the posture.
2. **The rows are not recoverable.** No restorable backup exists.
3. **Uploaded files are not recoverable** even if the rows were, because Storage
   is not covered.
4. **Hosted Auth configuration is reconstructable but not restorable** — by hand,
   from the repository's record of what it should be.
5. **BYOK envelopes would be unreadable without the original master key**, which
   lives only where the owner put it. This is the correct design — a backup that
   contained the key that opens it is not encryption — but it means the key is a
   recovery dependency with no backup of its own.

### The limitation that outranks the rest

**A restore is a rollback of everything at once.** Restoring a database to
yesterday un-deletes rows a user deleted, re-opens tasks a user closed, and
resurrects an account whose deletion was completed and logged. For a product
whose deletion path is a legal commitment (`SH-DELETE-*`,
`account_deletion_log`), that is not a neutral operation, and it is why §2 of
the restore drill refuses production as a target under any flag.

---

## Part II — The restore drill (`2H-BACKUP-002`)

### State: **NOT EXECUTED**

`RG-DEP-3` asks for a drill. Phase 2H delivers the **mechanism** and does not
run it. Executing the drill requires taking a backup (which does not exist
today), provisioning a disposable project, and restoring into it — provider
operations with a cost and a blast radius, none authorized here.

**`scripts/phase-2h-restore-drill.mjs` has never been run against any project.**
Its refusal path has been executed and is recorded in the acceptance file; the
drill itself has not.

### The procedure

**Prerequisites** (all owner actions):

1. A restorable backup exists. Today it does not — see Part I.
2. A **disposable** Supabase project is provisioned, in the same region, on a
   plan that permits restore.
3. A pre-drill row census is taken from the **source** project and saved as
   JSON: `{ "entries": 812, "tasks": 240, ... }`.

**The drill**:

```
# 1. Restore the backup into the DISPOSABLE project (provider console).
# 2. Verify, from this repository:
node scripts/phase-2h-restore-drill.mjs --target <disposable-ref> --expect ./census.json
# 3. DELETE the disposable project.
```

### What the script refuses, and why there is no override

The production project reference is read from `supabase/.temp/project-ref` — the
repository's own record of which project is live — and **any target equal to it
is refused before a single read happens**, with exit code 3. There is no flag
that overrides this.

A restore into production overwrites live data with an older copy, and the thing
you would restore from is the thing you just replaced. The happy path and the
catastrophe differ by one identifier. **A drill that could be pointed at
production is not a drill.**

Refusal proven by execution, 2026-08-07:

```
$ node scripts/phase-2h-restore-drill.mjs --target ulvwzqlpsjyrnqzfxmck
REFUSED: the target is the LINKED PRODUCTION PROJECT.
  target      : ulvwzqlpsjyrnqzfxmck
  production  : ulvwzqlpsjyrnqzfxmck
exit 3

$ node scripts/phase-2h-restore-drill.mjs
A --target project ref is required. This script never guesses a target.
exit 2
```

### What the drill verifies, and why counts alone are not enough

A restore that produced an **empty** database satisfies "the restore completed".
So four things are checked, and a failure in any one is a failed drill:

1. **Row counts** for ten named tables against the pre-drill census — user
   content first, then the operational tables, because a restore that recovered
   every entry and no audit trail is a partial recovery that reads as a complete
   one. **A total of zero rows fails**, regardless of the census.
2. **The migration chain** — head and count must equal the repository's. A
   restore that lands at an older schema head is a restore into a product the
   code cannot run.
3. **RLS and grant posture** — every `public` table `RLS enabled AND forced`, a
   non-trivial policy count, and no direct `anon`/`authenticated` grant on the
   append-only tables. A physical restore can reproduce every row and still lose
   the boundary that keeps one user's rows away from another's. The policy-count
   check exists because forced RLS with **zero** policies denies everyone, which
   is safe, passes a naive check, and is not a working product.
4. **The destructive posture of the copy** — no retention sweep scheduled beyond
   the two authorized attempt prunes. A restored copy that arrived with sweeps
   scheduled would start deleting on its own, against data an operator is still
   comparing to the source.

The transcript ends by saying the disposable project should be **deleted**: it
holds a full copy of production data, and every hour it survives is an hour of
extra exposure.

---

## Part III — The retention mechanism (`2H-RETENTION-001` … `004`)

### The three classes this phase retains, and the one it does not

| Class | Before 2H.5 | After 2H.5 | Window |
| --- | --- | --- | --- |
| `error_events` | sweep + twin (2H.2), **window passed as an argument, no home** | registry row + zero-argument sweep and twin that read it | **90 days**, PRD §14.1, signed |
| `scheduled_job_health` | sweep + twin (2H.2), same gap | same | **90 days**, PRD §14.1, signed |
| `rate_limit_events` | **no sweep at all** (2H.3) | predicate, twin and sweep | **90 days**, reused |
| `account_deletion_attempts` | none | **none, deliberately** | — |

### No value was minted, and this is the loud part

PRD §14.1, adopted verbatim by the owner's execution authorization, signs **90
days** for the error sink and **90 days** for dead-man history. Both are used
unchanged.

**`rate_limit_events` is not named in §14.1.** It therefore **reuses the signed
90-day Phase 2H observability window** rather than inventing a fourth number. A
genuinely new, unsigned window would be an owner stop condition, not a judgement
call taken inside DDL. The migration says so in its header, the constants module
says so in its docstring, and `phase-2h-retention-guard.test.ts` fails if either
statement disappears.

Ninety days is also safe here for a structural reason worth recording: the
limiter's own window is **one rolling hour** (`2H-RATE-001`, V-3), so a 90-day
sweep cannot remove a row any ceiling could still be counting. It is off by
three orders of magnitude in the safe direction.

### Why `account_deletion_attempts` gets nothing

It is `on delete cascade` from `auth.users`, so a **completed** deletion removes
the rows. And a **stalled** row must survive exactly as long as the account it
is stuck on, because it is the only evidence that the account is stuck. A window
there would delete the finding rather than the data. Recorded in
`OBSERVABILITY_RETENTION_EXEMPT` so the absence is a decision, not an omission —
which is the second half of `2H-RETENTION-004`.

### The mechanism, and the property that makes it checkable

Each class has **one predicate**. The count-only twin counts what it returns;
the destructive sweep deletes what it returns. There is no second copy of the
rule, so the dry run and the deletion **cannot** disagree — that is structural,
not reviewed. The migration proves the structure is what shipped by comparing
the twin's answer to the predicate's at apply time.

The window comes from `private.retention_windows` and the batch bound from
`private.retention_batch_limit()`, so **a scheduled statement carries no number
at all** and the cron catalog cannot drift from the registry.

### Grants: the asymmetry IS the mechanism

| Function | `service_role` | `authenticated` / `anon` | `pg_cron` (database owner) |
| --- | --- | --- | --- |
| `count_prunable_*()` | **execute** | refused | n/a |
| `prune_*()` | **refused** | refused | the only principal that can run it |
| `private.prunable_*` | refused | refused | via the definers above |

A dry run must be possible **without** the ability to delete. Nothing in this
repository can execute a destructive sweep — including the service role every
operator script authenticates as. Only the scheduler can, and it is not
scheduled. **That is why enabling a schedule is the authorization of the first
live purge.**

### Boundary evidence — `supabase/tests/phase_2h_retention.sql`, 31 assertions

A count is easy to produce and almost impossible to check: "412 rows are
prunable" is satisfied equally well by the right predicate and by one off by a
day, a timezone or an inclusive bound. So every assertion is a **boundary**
assertion — two rows one second apart across the cutoff, and the answer must
differ:

- one second **inside** the window survives;
- one second **outside** is prunable;
- a row consumed **now** is never prunable;
- a **refused** rate-limit row outside the window is prunable too (retaining it
  longer than an admitted one would keep *more* about a user who was told no);
- the twin's count **equals** the predicate's, exactly;
- the sweep removes **exactly** what the twin counted, and a second dry run then
  counts zero — it converged;
- a **live** cron job's health row is never prunable at any age, even against a
  one-second window;
- the append-only DELETE refusal on `error_events` is still in force for
  everyone who is not the sweep;
- **no role** can execute any destructive sweep;
- **all three** twins are reachable by `service_role` and by nobody else;
- **no** Phase 2H sweep is scheduled;
- **both** previously authorized attempt-prune jobs survive — asserting their
  *presence* matters as much as asserting the absence, because an absence-only
  check passes on a slice that removed somebody else's authorized schedule;
- SH.6's five user-content sweeps remain unscheduled;
- **all six halves exist**, so the refusal censuses are not vacuous.

That last one is not decoration. Sections 6 and 7 are satisfied equally well by
a schema in which none of these functions exists, and an always-passing control
published two wrong verdicts in this repository once.

### Scheduling — the act, not the artifact (`2H-RETENTION-003`)

```
npm run ops:retention-schedule                # default: reads the catalog, changes nothing
npm run ops:retention-dry-run                 # counts, cannot delete
npm run ops:retention-schedule -- --enable    # OWNER-ONLY
```

`--enable` prints the count-only dry run **first**, in the same transcript as
the act, so an owner who has not seen the counts cannot enable by accident; and
it refuses outright if the dry run fails, because enabling a purge whose size is
unknown is the thing the gate exists to prevent. It also names the six jobs it
does **not** own — the two authorized attempt prunes and the four operational
jobs — and fails if any of them disappeared while it ran.

**A non-zero dry-run count is evidence. It is not authorization.**

### State today

**Eight sweeps built. Zero scheduled. No purge has ever run.**

- SH.6's five user-content sweeps: built (`202608050077`), unscheduled.
- Phase 2H's three observability sweeps: built (`202608070083`), unscheduled.
- The two attempt prunes that *are* scheduled were authorized by earlier slices
  and are untouched by this one.

### A routed question, not a silent omission

`error_events` and `rate_limit_events` are per-user *operational* records, and
neither appears in the Privacy Policy's rendered retention table. Both are
handled by account deletion — `error_events` is de-identified (it is append-only
and cannot cascade), `rate_limit_events` cascades — and neither carries user
content. They share the SH.6 **registry**, so one schedule still has one home;
they do not share the Policy's rendered table.

Adding a class there changes a **published legal document and its version**,
which forces re-acceptance by every user. That is an owner and legal act, not a
side effect of a retention slice, and Phase 2H is explicitly forbidden from
signing legal acceptance on the owner's behalf.

> **Owner question, routed:** should the Privacy Policy's retention table
> enumerate `error_events` and `rate_limit_events`? **Destination:**
> `docs/TODO.md`, legal copy, alongside the next policy version bump.
