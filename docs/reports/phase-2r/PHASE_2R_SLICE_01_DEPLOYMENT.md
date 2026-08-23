# Phase 2R — Slice 2R.1 hosted deployment record

**Migration `202608230101_phase_2r_slice_1_reminder_recurrence.sql`, applied to the
deployed project on 2026-08-23.** Parity moves `202608210100` → `202608230101`,
100 → 101, **advancing by exactly one**.

This is the record the slice's acceptance document said would be separate. It
exists because applying a migration is the one act in this phase that cannot be
undone by reverting a commit, so the question it has to answer is not *"did it
work"* but **"can a reader check that the thing applied is the thing reviewed"**.

---

## 1. The gate chain, in order, with what each returned

| # | Gate | Evidence |
|---|---|---|
| 1 | pgTAP suite complete | `supabase/tests/phase_2r_reminder_recurrence.sql`, `plan(83)`, ten sections whose declared counts sum to 83 (11+11+7+9+4+6+8+15+5+7) |
| 2 | `supabase db lint` | CI job `database and journey`, step *db lint* — green |
| 3 | whole chain applied to an **empty** database | same job, step *Apply the whole migration chain to an empty database* — green |
| 4 | positive, negative and non-vacuity controls | in the suite: two owners so a stranger's row provably exists before it is probed; the owner's own series proved **visible** in the same transaction as the write refusal, so the refusal cannot be explained by blindness; the duplicate live occurrence **attempted** rather than assumed refused |
| 5 | CI green on the PR head | run **32652662552**, head `430c39bf678dae5472fe3355b8249f4c5537ae52`, three of three jobs |
| 6 | merged | PR **#292**, merge method *merge*, merge commit **`ac5af97607804d9cecc354b484e31001c1eb3143`** |
| 7 | CI green at the **exact merge SHA** | run **32653470021**, `event: push`, `head_sha: ac5af97607…`, three of three jobs. This is the merge commit's own run, not the PR head's |
| 8 | the bytes to apply are `main`'s bytes | `git show origin/main:<migration>` and the working copy share `sha256 763241396d5b4b93510f07be270e17e292b024237983c00749ca9fe8c7d58644`; the per-chunk `md5` list used by the apply was recomputed **from `main`'s copy**, not from the branch's |
| 9 | hosted migration list **before** | 100 rows, head `202608210100`, `202608230101` absent, `public.reminder_series` absent, 57 public base tables |
| 10 | dry run showing **exactly one** pending | 101 local migration files against 100 hosted rows; the set difference is `{202608230101}`. Re-asserted **inside the applying transaction** (below), so it is a precondition and not only a prior reading |
| 11 | applied | below |
| 12 | owner-scoped hosted proof, with cleanup | §4 |
| 13 | fresh read: local = remote, advanced by exactly one | §3 |

---

## 2. How the file reached the database, and why it is provably the file

The Supabase CLI in this environment has no access token (`supabase projects
list` answers `LegacyPlatformAuthRequiredError`), and there is no database
password available to `psql`, so `supabase db push` was not an option. The
migration was applied through the Supabase MCP `execute_sql` boundary instead.

That means the SQL was **transcribed** rather than streamed from disk, and a
transcription is exactly the kind of step that can silently corrupt a
deployment. So the transcription was not trusted:

1. `main`'s copy of the migration was split into **eight chunks** at line
   boundaries, and each chunk's `md5` computed locally.
2. Each chunk was staged into a temporary table `private._phase_2r1_apply_stage`
   in its own call, and the database reported back the `md5` **it** computed.
3. Only after all eight matched was anything executed.

**The gate earned its place on the first chunk.** Chunk 1 came back
`64dfed46297db97704a2dafc38b9dc25` against `54d2abe9ca964d65c9adc074098c432e`:
one byte short, because the chunk ends on a **blank line** and a blank line at
the end of a paste is invisible. Nothing had been applied, so the fix was a
one-statement patch (`body || E'\n'`) and a re-read. The other seven matched
first time.

| chunk | bytes | `md5` reported by the database |
|---|---|---|
| 1 | 10 156 | `54d2abe9ca964d65c9adc074098c432e` |
| 2 | 8 640 | `18a194e736a2927f2e725dddbc41dac2` |
| 3 | 9 278 | `86c40cb22b228c0baae8a75e14998a6a` |
| 4 | 7 228 | `e7076454ed06cf0df0181a59d577d490` |
| 5 | 7 782 | `5b534ce03a89afccfb6ebc06d30e7614` |
| 6 | 7 995 | `8c0568d7717c64988434ec35eaab57b1` |
| 7 | 8 415 | `65bfa5d5301aa985282b6de9784b7e4c` |
| 8 | 9 115 | `68a126b1f18ea1a869048620a2b22437` |
| **total** | **68 609** | whole-file `md5 4b3c167713ce986a5eb3f2e7a5d816a6` |

68 609 is the byte count of the file on `main`.

**The applying transaction refuses to apply anything else.** It re-checks all
eight chunk hashes, then the whole-file hash *and* length of the reassembled
text, then that `202608230101` is absent and that exactly 100 migrations are
recorded — and only then does it `execute` the assembled text, insert the
`supabase_migrations.schema_migrations` row and drop the staging table. Any
mismatch raises and the whole transaction rolls back. **The database, not the
transcriber, is the authority on whether the right bytes were applied.**

The staging table is scaffolding, not schema: it was created in `private`,
lived only between the eight staging calls, and was dropped **inside the same
transaction that applied the migration**. §3 reads its absence rather than
asserting it.

---

## 3. What the deployed database says now

Read in the applying transaction, immediately after `execute`:

| reading | value |
|---|---|
| hosted migrations | **101** (was 100 — **exactly one** advance) |
| hosted head | **`202608230101`** |
| `public.reminder_series` exists | yes |
| `authenticated` holds on it | **`SELECT`**, and nothing else |
| `service_role` holds on it | **`(none)`** |
| registered undo handlers for the two new operations | **2** |
| `private._phase_2r1_apply_stage` left behind | **0** |

**The migration's own post-deploy block ran against the deployed catalog and
raised nothing.** That block is not decoration: it asserts that
`run_user_heartbeat` still carries its per-user advisory lock, its daily cap and
its 24-hour cooldown; that `authenticated` holds neither `UPDATE` nor `DELETE`
on `public.reminders`; that the new table's grant set is `SELECT` and nothing
else; that RLS is enabled **and forced**; that both operations have a registered
compensation handler; and that all three signed daylight-saving cases answer
what `OD-2R-5` signed — the spring-forward gap at `2026-03-08T07:00:00+00`, the
fall-back overlap at `2026-11-01T05:30:00+00`, and the 31st clamping to
2026-02-28. Those are now properties of the **deployed** functions, not of a
test fixture.

Local against remote: 101 migration files in `supabase/migrations`, 101 rows in
`supabase_migrations.schema_migrations`, same head. **Equal, and advanced by one.**

---

## 4. The owner-scoped proof, and why it was rolled back rather than cleaned up

`2R-SERIES-*` is a database contract, so the proof had to be the contract
actually exercised on the deployed database by the owner's own account — not a
catalog read.

**It ran inside `begin; … rollback;`, and that is a decision rather than
convenience.** Creating a series writes a row to `public.undo_operations` and
rows to `public.audit_logs`, and **both are append-only**. A "create it then
delete it" proof would have had to violate the ledger contract to clean up after
itself. Rolling back never creates the rows at all, so the cleanup is total by
construction rather than by a delete nobody can audit.

What it exercised, as `authenticated` with the owner's `auth.uid()`:

| step | result |
|---|---|
| `create_reminder_series_v1`, daily rule | `replayed: false` |
| the series visible to its owner, under **forced** RLS | 1 |
| live occurrences | **1** — `2R-MODEL-005` on the deployed database |
| its sequence | 1 |
| its instant | in the **future** |
| `apply_reminder_series_command_v1` with `{"kind":"edit_future","hour":7}` | scope `future`; anchor hour **9 → 7** |
| `undo_operation` through the real router | anchor hour **back to 9** |
| the ledger row afterwards | `status = 'undone'`, `undone_at` set |
| the compensating write | audited, 1 row |

Two of those lines are the deployment's own answer to defects this slice found
late. **The partial edit — `hour` and nothing else — is the exact call that was
impossible before the command gate was fixed**, and it now works against the
deployed function rather than against a test double. **The closed ledger row is
the defect found by reading `public.undo_operation`'s calling convention**, and
it is now observable on the real database.

### Residue, both sides, with the probes shown sighted

| counter | before | after |
|---|---|---|
| `reminder_series` rows | 0 | **0** |
| reminders carrying a `series_id` | 0 | **0** |
| reminders with `detached_at` | 0 | **0** |
| `undo_operations` for the two new action types | 0 | **0** |
| `audit_logs` for the seven new action types | 0 | **0** |
| `private._phase_2r1_apply_stage` | — | **0** |
| *sighted:* total reminders | 1 | 1 |
| *sighted:* total audit rows | 312 | 312 |
| *sighted:* total undo rows | — | 10 |
| *sighted:* users | 2 | — |

The sighted rows are the point of the table. A zero from a reader that cannot
see anything is indistinguishable from a zero from a reader that can, so the
same statement that reports the zeros reports non-zero totals from the same
tables. **The totals are unchanged across the proof**: 312 audit rows before and
after, one reminder before and after.

And the rollback took the fixture without taking the migration: 13 Phase 2R
functions are present afterwards, at head `202608230101`.

---

## 4b. The fourth parity proof: the generated types against the deployed schema

Migration parity answers *"the same list of migrations"*. It does not answer
*"the same schema"* — a hand-edited generated file can claim a column the
database does not have, which is how this slice's `undo_operations.description`
defect survived four hosted rehearsals. So the types were generated **from the
deployed project** and compared block for block against the file in the tree.

| block | repo file vs types generated from the deployed database |
|---|---|
| `reminder_series` (Row, Insert, Update, Relationships) | **identical** |
| `reminder_series_preview` (Args, Returns) | **identical** |
| `reminders` | identical after one correction, below |

**One drift was found and corrected.** `reminders.Relationships` listed
`reminders_series_owner_fk` *after* `reminders_task_id_fkey`; the generator
emits it before. Every column, type and nullability matched — the difference was
ordering alone, introduced because the entry was appended by hand. It is
corrected to what the generator produces, which is the repository's own rule:
**a generated file is not a place to hand-edit, and the way to prove it wasn't
is to diff it against the generator.**

Two families of difference in the whole-file diff are **pre-existing and not
this slice's**: the MCP generator emits no `graphql_public` schema and omits
tables that carry no API-role grants at all (the RPC-closed set, e.g.
`entry_person_candidate_resolutions`), while the repository's
`supabase gen types typescript --linked --schema public,graphql_public`
includes them. The two generators have different scopes; they are not two
readings of one schema, and this record does not treat their difference as
drift.

---

## 5. What this deployment did not do

No second migration — the allocation was **1**, and it is now spent, applied and
closed. No change to the heartbeat, quiet hours, the daily cap, the 24-hour
cooldown or the per-user lock, asserted by the post-deploy block against the
deployed body. No change to any existing grant, policy, retention rule or
authority. No Edge Function deployed. No AI call and no BYOK credit spent. No
real user data read beyond the owner's own account id, and no row of it written
— the only writes were made inside a transaction that was rolled back. Signup
stays closed and the rollout gate is untouched.

**`2R-SERIES-*` is still not classified.** The database contract is deployed and
exercised; the semantics, the surface and the undo journeys are slice 2R.2's to
prove, and a passing RPC call is not a delivered feature.
