# Post-2H — Backup readiness and the state of `RG-DEP-3`

**Date:** 2026-08-07 · **Track:** A2 / A3 · **Not part of Phase 2H.**
Supersedes nothing; extends `docs/reports/phase-2h/PHASE_2H_BACKUP_AND_RETENTION.md`
Part I, which remains the record of the posture as found.

---

## 0. The verdict, first

> **A bounded, owner-run `pg_dump` schedule DOES satisfy this project's
> restore-readiness contract, without a provider upgrade.** The toolchain is
> built and its refusals are executed. It is blocked on **one free local
> install** and **two secrets the owner must mint** — nothing else.
>
> **`RG-DEP-3` remains FAIL, and must**, because no restore has succeeded.

The gate passes on the existence of
`docs/reports/signup-hardening/SIGNUP_HARDENING_BACKUP_RESTORE.md`. **That file
was deliberately not created.** Creating it would have flipped the gate green
without a restore ever having happened, which is the precise failure the
fail-closed checklist exists to prevent. It gets written when the drill runs,
and not before.

---

## 1. Can a scheduled `pg_dump` satisfy the contract? Yes — here is the reasoning

The question was open because a provider upgrade was recorded as the "smallest
closing action". Re-derived from current truth, it is not.

| Requirement of a restore-readiness contract | Provider daily backups (paid) | Owner-run `pg_dump` |
| --- | --- | --- |
| Postgres rows recoverable | yes | **yes** |
| Restorable into a **disposable** project (the drill needs this) | awkward — provider restore targets the same project | **yes, naturally** |
| Storage objects | **no**, on any plan | **no** |
| Hosted Auth configuration | **no** | **no** |
| Artifact the owner holds and can verify offline | no | **yes** |
| Cost | plan upgrade | free |
| New always-on service | none | none |

The two "no" rows are identical, which is the finding that decides it: **the
upgrade would not have closed Storage or Auth configuration either.** It buys
convenience, not coverage. So the simplest credible path is the dump, exactly as
the owner's guidance prefers, and the plan upgrade is a genuine option rather
than a prerequisite.

**One real asymmetry, recorded rather than glossed:** a provider backup is taken
whether or not the owner's machine is on. A local schedule that silently stops
is a backup that stopped existing — which is why `backup:verify` is a separate,
cheap command meant to run on its own schedule, and why a failed dump deletes
its partial output rather than leaving something that looks like a backup.

---

## 2. What was built

| Command | Script | What it does |
| --- | --- | --- |
| `npm run backup:check` | `scripts/backup-database.mjs --check` | Readiness only. Dumps nothing. Names every blocker. |
| `npm run backup:census` | `scripts/backup-census.mjs` | The pre-backup row census. **Runs today** — Management API only, no Docker, no password. |
| `npm run backup:run -- --out <dir>` | `scripts/backup-database.mjs` | The dump: two artifacts + manifest, encrypted, checksummed, census embedded. |
| `npm run backup:verify -- --manifest <path>` | `scripts/verify-backup-artifact.mjs` | Decrypt, checksum, and structural verification. |
| `npm run backup:restore-disposable -- --manifest <p> --target <ref>` | `scripts/restore-into-disposable.mjs` | The restore, behind three refusals. |
| `npm run ops:restore-drill -- --target <ref> --expect census.json` | `scripts/phase-2h-restore-drill.mjs` | The verdict. Pre-existing from 2H.5. |

Repository-side guard: `src/lib/closeout/backup-toolchain.test.ts`, **23
assertions**, all green.

### 2.1 The artifact layout

```
20260807T214500Z-data.sql.enc       <- THE BACKUP. public + private + auth, COPY format.
20260807T214500Z-schema.sql.enc     <- cross-check only, NOT the restore path.
20260807T214500Z-manifest.json      <- checksums, census, migration head, exclusions.
```

### 2.2 The restore path, and why it is not "apply the schema dump"

1. **The migration chain from git**, into the disposable project.
2. **The data dump**, which carries `auth.users` and every user-owned row.
3. **The drill**, which grades it.

Step 1 is not a shortcut — it is strictly better here, for a reason that would
otherwise have produced a false failure. Dumping from a managed provider
requires `--no-owner --no-privileges`, because the dump's role grants name roles
the target manages itself. **So a schema dump restored with those flags arrives
without the grants** — and the drill's check 3 (RLS and grant posture) would
then fail on a restore that was working exactly as designed. Applying the chain
reproduces the grants because the chain is what created them, and the chain is
the reviewed, append-only source of truth that "the schema IS recoverable from
git" already relies on.

---

## 3. The decisions, each with the failure it prevents

| Decision | The failure it prevents |
| --- | --- |
| Connection string from `SUPABASE_DB_URL`, **never** an argument | An argument lands in shell history and in a process listing. **Found live:** the Supabase CLI's own `db dump --dry-run` prints a live `PGPASSWORD` to stdout. Every error in this toolchain is passed through `redact()`. |
| `--out` refused inside the repository | A dump holds every row of every user's content. One in the working tree is one `git add -A` from being published forever. |
| AES-256-GCM by default; plaintext needs `--plaintext-i-accept-the-risk` **and** is recorded in the manifest | A plaintext dump nobody labelled as plaintext. |
| SHA-256 taken over the **plaintext**, not the ciphertext | Checksumming ciphertext proves the file survived, not that the content did. |
| A failed dump deletes its partial artifacts and writes no manifest | A backup that half-exists is worse than none, because it looks like one. |
| The census is taken in the **same run** and embedded in the manifest | A census taken later describes a different database, so the drill would compare a restore against the wrong expectation. |
| `pg_dump` major version checked against the server major | pg_dump refuses a server newer than itself. Discovered at 03:00 on a schedule, that is a backup that silently stopped. |
| Three restore refusals, no override flag | See §4. |
| The restore script does **not** invoke the drill | The thing that performs a restore must not be the thing that says it worked. |

---

## 4. The three restore refusals

The drill (2H.5) refuses a target equal to the linked production ref. The
restore script **writes**, so it needs two more:

1. **`--target` may not equal the linked production ref.** Inherited.
2. **`RESTORE_DB_URL` may not contain the production ref, and must contain the
   target ref.** This is the check `--target` cannot make. A disposable
   `--target` alongside a production connection string passes refusal 1 and
   destroys the project — **the writes follow the connection string, not the
   flag.**
3. **The target must hold zero rows of user content.** Restoring over a
   populated database is either a mistake or a production restore that got past
   the first two.

There is no `--force`, and the guard asserts the absence of one.

### Proven by execution, 2026-08-07 — not by review

**Refusal 1**, and note it fires with `--manifest /nonexistent`: the refusal
happens **before** anything is read, so a wrong target cannot get as far as
loading a file.

```
$ node scripts/restore-into-disposable.mjs --target ulvwzqlpsjyrnqzfxmck --manifest /nonexistent
REFUSED.
The target is the LINKED PRODUCTION PROJECT.
  target      : ulvwzqlpsjyrnqzfxmck
  production  : ulvwzqlpsjyrnqzfxmck
There is no flag that overrides this refusal, by design.
```

**Refusal 2 — the one `--target` cannot make.** A *disposable* target alongside a
*production* connection string. This is the slip that destroys the project, and
refusal 1 passes it:

```
$ RESTORE_DB_URL="postgresql://postgres.ulvwzqlpsjyrnqzfxmck:...@...pooler.supabase.com:5432/postgres" \
  node scripts/restore-into-disposable.mjs --target disposable123ref --manifest /nonexistent
REFUSED.
RESTORE_DB_URL points at the PRODUCTION project.
The --target flag says "disposable123ref", but the connection string contains the
production ref "ulvwzqlpsjyrnqzfxmck". The flag is not what the writes follow --
the connection string is. This is the slip that destroys the project.
```

**The 2H.5 drill still refuses after being changed** (§5 replaced its table
list, so its refusal path is re-proved rather than assumed):

```
$ node scripts/phase-2h-restore-drill.mjs --target ulvwzqlpsjyrnqzfxmck
REFUSED: the target is the LINKED PRODUCTION PROJECT.
exit 3
```

**Refusal 3** (target already populated) is not executable without a second
project, so it is asserted statically by `backup-toolchain.test.ts` and stands
unexecuted. Named here rather than counted as proven.

**One trap the script prints rather than assumes:** applying the chain requires
`npx supabase link --project-ref <disposable>`, which **rewrites
`supabase/.temp/project-ref`** — the file every refusal in this toolchain reads
to decide what production is. Leaving it pointed at the disposable project
disarms all of them. The script prints the relink step as a non-skippable
instruction.

---

## 5. A defect this work found in the shipped drill

**`scripts/phase-2h-restore-drill.mjs` counted `public.entities`. There is no
such table in this schema.** The entity graph is `people`, `organizations`,
`projects` and `contexts`, joined through `entry_entities`.

The **first census ever taken** against the live project returned:

```
! entities: 400 ERROR: 42P01: relation "public.entities" does not exist
```

Nothing had caught it, for a reason worth stating plainly: **the drill had never
been run, so nothing had ever asked the database whether the list was true.**

Had the drill run against a real restore first, check 1 — the only check that
measures whether the *data* came back — would have reported `entities is
readable — FAIL` **on a perfectly good restore**. The worse outcome is the
second-order one: a reviewer who accepted one known-noisy failure in check 1
would have been trained to discount check 1's failures generally.

**Fixed at the source.** There is now exactly one list, in
`scripts/backup-shared.mjs`, imported by both the census and the drill — a
census measured over one list and compared against another cannot fail for the
reason it exists. The four real entity tables replace the phantom, so the entity
graph is genuinely counted rather than nominally counted.
`backup-toolchain.test.ts` asserts every censused table against the generated
`database.types.ts`, so the next rename fails a test instead of a drill.

> **Suspect the probe before the product — eight times now.** This is the same
> class as Phase 2H's six: the defect was in the thing that measures, not in the
> thing measured.

---

## 6. The census, taken live

`npm run backup:census`, 2026-08-07T21:46:43Z, project `ulvwzqlpsjyrnqzfxmck`:

| Table | Rows | | Table | Rows |
| --- | ---: | --- | --- | ---: |
| entries | 4 | | notifications | 57 |
| entry_interpretations | 5 | | jobs | 4 |
| tasks | 7 | | audit_logs | 31 |
| people | 3 | | ai_usage_events | 11 |
| organizations | 1 | | product_events | 63 |
| projects | 1 | | | |
| contexts | 0 | | **TOTAL** | **187** |
| memories | 0 | | | |

Zero unreadable tables. **This is not a backup** — it is the expectation a
restore will be measured against, and it is only meaningful when taken at the
same moment as the dump, which is why `backup:run` embeds its own.

---

## 7. What is blocking, exactly

`npm run backup:check`, executed 2026-08-07:

```
backup readiness
========================================================================
  MISS  pg_dump is not available. Install the PostgreSQL 17 client tools ...
  MISS  SUPABASE_DB_URL is not set ...
  MISS  BACKUP_ENCRYPTION_KEY is not set ...
========================================================================
3 blocker(s).
```

### Why not run the dump from CI instead, and remove the local install?

Considered and **not recommended**, though it is the owner's call. GitHub
Actions' `ubuntu-latest` already has `postgresql-client` and Docker, so a
scheduled workflow would work with no local install at all. It costs two things
this repository has been careful about:

1. **The production database password becomes a repository secret**, and every
   workflow-modifying commit becomes a path to it.
2. **A full copy of every user's content lands in GitHub's artifact storage.**
   Encrypted, that is defensible; it is still a materially larger
   secret-and-data boundary than a local install, taken to save one download.

Recorded here so the choice is visible rather than made by omission.

---

## 8. `RG-DEP-3` — status: **INCOMPLETE**

Per the owner's instruction, A3 is not faked. Conditions and their state:

| Condition | State |
| --- | --- |
| A real restorable backup mechanism exists | **mechanism yes, artifact no** — blocked on §7 |
| Disposable project only, never production | **enforced by three refusals, no override** |
| Verify target identity before restoring | **enforced** (ref + connection string + emptiness) |
| Restore the database | not executed |
| Verify migration state | mechanism ready (drill check 2) |
| Verify representative row counts | mechanism ready and **repaired** (drill check 1, §5) |
| Verify forced RLS | mechanism ready (drill check 3) |
| Verify critical grants | mechanism ready (drill check 3) |
| Verify account ownership boundaries | mechanism ready (drill check 3) |
| Document the Storage limitation | **done** — in every manifest and census |
| Document the `BYOK_MASTER_KEY` dependency | **done** — in every manifest and census |
| Clean up the disposable environment | instructed by the restore script's final output |

**`RG-DEP-3` stays FAIL until an actual restore succeeds.** No document was
written to make it pass.

---

## 9. Retention recommendation for the artifacts themselves

Not implemented — a backup-retention sweep would be a destructive schedule, and
ADR-082 puts that class of decision with the owner. Recommended, for the owner
to apply by hand or by an OS-level task:

- **Keep 7 daily, 4 weekly, 3 monthly.** Roughly two weeks of fine-grained
  recovery and a quarter of coarse recovery, at a size this project's row counts
  make trivial.
- **Delete a plaintext dump the same day it is used.**
- **Never store `BACKUP_ENCRYPTION_KEY` beside the backups it opens.** A key in
  the same folder is not encryption; it is a file extension.
- **Verify weekly**, not only before a restore: `npm run backup:verify`
  is cheap and is the only thing standing between "we have backups" and "we have
  files".

---

## 10. Exact owner actions

1. **Install the PostgreSQL 17 client tools.** Windows: the EDB installer,
   selecting **Command Line Tools only** — not the server, not Docker Desktop.
   Confirm with `pg_dump --version` reading 17.x, then `npm run backup:check`.
2. **Export the connection string**, from Supabase → Project Settings →
   Database → Connection string (URI):
   `$env:SUPABASE_DB_URL = "postgresql://..."`. **Not into `.env.local`, not
   into this repository, never as a command argument.**
3. **Mint the backup encryption key** and store it where `BYOK_MASTER_KEY` is
   stored:
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
   → `$env:BACKUP_ENCRYPTION_KEY`.
4. **Take the first backup:** `npm run backup:run -- --out D:/my-brain-backups`,
   then `npm run backup:verify -- --manifest <the manifest it names>`.
5. **Provision a disposable Supabase project** and run the drill (§4's sequence,
   including the relink).
6. **Only after the drill passes**, write
   `docs/reports/signup-hardening/SIGNUP_HARDENING_BACKUP_RESTORE.md` with the
   transcript, and **delete the disposable project.**

Steps 1–3 are the only true blockers. Everything else is executable the moment
they are done.
