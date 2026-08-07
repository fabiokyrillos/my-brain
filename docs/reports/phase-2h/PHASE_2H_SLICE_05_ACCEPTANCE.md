# Phase 2H — Slice 2H.5 acceptance

**Deployment contract, retention and backup.** Written 2026-08-07.
Branch `codex/phase-2h-slice-5`. Migration `202608070083` — **the fifth and
last of the phase's budget**.

---

## 1. Requirements, delivered and cited

| Requirement | State | Evidence |
| --- | --- | --- |
| `2H-DEPLOY-001` | **DELIVERED** | [`PHASE_2H_DEPLOYMENT_RUNBOOK.md`](PHASE_2H_DEPLOYMENT_RUNBOOK.md) — ordered steps, the migration-before-code hazard, rollback posture, per-step verification. Every command in it was executed during 2H.0–2H.5; §1's six pre-flight reads are recorded in §5 below. |
| `2H-DEPLOY-002` | **DELIVERED** | `src/lib/deployment/env-contract.ts` (27 variables, six surfaces, a `secret` classification) + `env-contract.test.ts` (23 assertions, both directions, four mutation controls). Runbook §7. |
| `2H-DEPLOY-003` | **DELIVERED** | `npm run verify:edge-parity` executed, fully green (§5). Runbook §4 makes it a **gate** with three non-collapsed states; `PHASE_2H_EDGE_DEPLOYMENT_EVIDENCE.md` §3. |
| `2H-DEPLOY-004` | **DELIVERED** | `npx supabase migration list --linked` executed before and after (§5, §7). Runbook §3. `AUTHORIZED_MIGRATION_HEAD` moved to `202608070083` in this commit. |
| `2H-DEPLOY-005` | *2H.0* | ADR recorded in slice 2H.0. Not this slice's. |
| `2H-DEPLOY-006` | **DELIVERED** | Runbook §8 — seven destructive actions, each with the authorization it needs and its state today; all **OWNER-ONLY**, none performed. Guarded by `operator-surface-boundary.test.ts`'s two-entry write allowlist. |
| `2H-DEPLOY-007` | **DELIVERED** | [`PHASE_2H_EDGE_DEPLOYMENT_EVIDENCE.md`](PHASE_2H_EDGE_DEPLOYMENT_EVIDENCE.md) — old→new versions, deploy commands, post-deploy parity, behavioural verification, absence of unrelated deployment, rollback posture. **Consumes existing evidence; nothing was redeployed.** |
| `2H-RETENTION-001` | **DELIVERED** | Migration `202608070083`; `supabase/tests/phase_2h_retention.sql` (31 assertions, boundary-based); `src/lib/observability-retention.ts`. |
| `2H-RETENTION-002` | **DELIVERED** | The migration schedules nothing and asserts so against `cron.job` **itself** (§6 of the migration); `phase-2h-retention-guard.test.ts` fails on a `cron.schedule` in any Phase 2H migration, with two mutation controls. |
| `2H-RETENTION-003` | **DELIVERED** | `npm run ops:retention-dry-run` executed (§7). `npm run ops:retention-schedule` defaults to a read and requires `--enable`; `--enable` prints the dry run first and refuses if it fails. **`--enable` NOT run.** |
| `2H-RETENTION-004` | **DELIVERED** | `phase-2h-retention-guard.test.ts` — every declared window has a sweep and a twin; a class with no sweep carries a recorded reason (`OBSERVABILITY_RETENTION_EXEMPT`); `scheduled: false` keeps "implemented" and "enforced" distinguishable. |
| `2H-BACKUP-001` | **DELIVERED** | [`PHASE_2H_BACKUP_AND_RETENTION.md`](PHASE_2H_BACKUP_AND_RETENTION.md) Part I — read from the provider, coverage table per class, and the finding stated first. |
| `2H-BACKUP-002` | **DELIVERED (mechanism); NOT EXECUTED** | `scripts/phase-2h-restore-drill.mjs`; refusal executed (§6). `RG-DEP-3` remains an owner action. |

---

## 2. The migration — `202608070083`, the phase's last

**Budget: 5 allocated · 5 spent · 0 remaining.** A sixth is an owner amendment.

| What it does | Why |
| --- | --- |
| Seeds 3 rows in `private.retention_windows` | The windows 2H.2 passed as required arguments had **no home**; a scheduled statement would have carried the number in its text. One registry, reused rather than duplicated. |
| Builds `rate_limit_events`' predicate, twin and sweep | The one class this phase created that **genuinely accumulates for a live user**, and 2H.3 gave it no sweep at all. |
| Adds zero-argument forms of 2H.2's two sweeps and twins | So a cron statement carries **no number** and the catalog cannot drift from the registry. Thin wrappers; not a second copy of any predicate. |
| Asserts grants, both halves, the shared predicate, and no schedule | At apply time, against the catalog — so a wrapper that failed to create is caught by the same transaction that created the window. |

**No value was minted.** PRD §14.1 signs 90 days for the error sink and 90 for
dead-man history; both used unchanged. `rate_limit_events` is not named there
and **reuses that signed window**, stated loudly in the migration header, the
constants module and the guard. A new unsigned window would be an owner stop.

---

## 3. Pre-flight — the pgTAP run against the real project, before the push

`pgtap` is not installed on the hosted project and extension creation is
transactional, so the whole thing ran as `begin; create extension pgtap;
<migration>; <suite>; rollback;` against the linked project — real data, a real
`cron.job` catalog.

```
ran 31 / planned 31, failed 0
```

**Read from pgTAP's own counters, not from `finish()`.** The Management API
returns only the **last** result set, so `select * from finish()` returning
nothing looks identical whether the run was clean or whether the middle is
simply invisible. `select _get('failed'), _get('curr_test'), _get('plan')` is
the answer that cannot be misread. *(Recorded in the runbook §1.7 — this is the
fifth "suspect the probe before the product" of the phase, and the first where
the probe's defect was in how its **output** was read rather than in its input.)*

**Residue readback after the rollback:**

```
{ "windows": 7, "new_fn": 0, "pgtap": 0, "cron_jobs": 5, "fixture_rows": 0 }
```

Seven registry rows (SH.6's, unchanged), zero new functions, no `pgtap`
extension, five cron jobs, no fixture rows. **Nothing persisted.**

---

## 4. Local gates

| Gate | Result |
| --- | --- |
| `npm run lint` | **0 errors, 0 warnings** |
| `npm run typecheck` | **0 errors** |
| `npm test` | **4223 passed, 0 failed tests.** 3 failed *files* are the known Windows shebang-parse baseline (`hosted-auth-parity`, `signup-hardening-admin-boundary`, `storage-orphan-scanner`) — green in CI, unchanged by this slice. |
| `npm run build` | **passes** |
| pgTAP (hosted pre-flight) | **31/31** |

### Three chain guards fired, and each was a real repair

1. **`egc-invariants`** — `AUTHORIZED_MIGRATION_HEAD` moved `202608070082` →
   `202608070083` **in the same commit as the migration**, as the budget rule
   requires.
2. **`phase-2f-documentation`** — `docs/SECURITY.md` must name the current chain
   head. Updated with the slice's own paragraph.
3. **`operator-surface-boundary`** — `2H-OPS-003: the operator CLI cannot
   mutate` failed on the new scheduling script. **Correctly.** The repair made
   the write allowlist an explicit two-entry list of *arming doors*, and added
   three assertions so the exemption is itself checked: each door must exist, be
   an operator script, derive its mode from `--enable`, default to a
   non-mutating mode, gate its write on that mode, and say what enabling
   authorizes. An exemption nobody checks is a hole.

---

## 5. Hosted reads — before

```
$ npx supabase migration list --linked
  ... 202608070082 | 202608070082 | 202608070082      # local == remote

$ npm run verify:edge-parity
delete-account    2026-08-07T13:15   2026-08-07T02:10   ok
heartbeat         (never)            2026-07-16T21:20   not deployed, by design
process-jobs      2026-08-07T14:36   2026-08-07T14:25   ok
every deployed function is at or ahead of its source

$ npm run ops:retention-schedule
cron catalog BEFORE (5 jobs)
  byok-prune-validation-attempts   17 4 * * *   active=true
  my-brain-entry-dispatch          * * * * *    active=true
  my-brain-hourly-heartbeat        0 * * * *    active=true
  my-brain-job-reaper              * * * * *    active=true
  sh-prune-auth-event-attempts     43 4 * * *   active=true
None of the three Phase 2H retention sweeps is scheduled.

$ npm run ops:deletion-reaper-schedule
schedule:  not scheduled
endpoint:  deletion_reap_url=ABSENT, deletion_reap_secret=ABSENT
reaper: NOT armed
```

---

## 6. The restore drill's refusal — executed

```
$ node scripts/phase-2h-restore-drill.mjs --target ulvwzqlpsjyrnqzfxmck
========================================================================
REFUSED: the target is the LINKED PRODUCTION PROJECT.
A restore into production overwrites live data with an older copy, and the
thing you would restore from is the thing you just replaced. There is no
flag that overrides this refusal, by design.
  target      : ulvwzqlpsjyrnqzfxmck
  production  : ulvwzqlpsjyrnqzfxmck
========================================================================
exit 3

$ node scripts/phase-2h-restore-drill.mjs
A --target project ref is required. This script never guesses a target.
exit 2
```

**The drill itself has NOT been executed against any project.** `RG-DEP-3`
remains an owner action, and it is blocked ahead of that by the finding in §8.

---

## 7. Post-deploy readings

*(Filled after `npx supabase db push --linked`. See §9 for the ordering
reasoning: this slice is deliberately **not** schema-coupled.)*

| Reading | Result |
| --- | --- |
| Hosted parity after | `202608070083`, 83 migrations, local = remote |
| `verify:edge-parity` after | green, unchanged (no function touched) |
| Cron catalog after | **5 jobs**, identical to before — nothing scheduled |
| `ops:retention-dry-run` | recorded below |
| Deletion reaper | **not armed**, 0/2 Vault secrets, no cron job |
| Signup | **disabled** at both layers |
| CAPTCHA | **enforced** |
| SMTP | **unconfigured** |

---

## 8. Findings

### F-2H.5-1 — There is no operator-restorable backup of this project

**Severity: high. Destination: owner.**

`pitr_enabled: false`, `backups: []`, organization plan **free**. The schema is
recoverable from git; **the rows are not**, Storage is not covered on any plan,
and hosted Auth configuration is reconstructable but not restorable. Full
posture and coverage table: `PHASE_2H_BACKUP_AND_RETENTION.md` Part I.

This also **blocks `RG-DEP-3`**: a restore drill needs something to restore.

**Smallest closing action:** upgrade the organization to a plan that includes
daily backups. The alternative is an owner-run `pg_dump` schedule, which is more
work and puts a credential in more places.

### F-2H.5-2 — `.env.example` was missing a required variable

**Severity: medium. Fixed in this slice.**

`env-contract.test.ts` found `NEXT_PUBLIC_TURNSTILE_SITE_KEY` required by the
application and absent from the file a new contributor copies. Added.

This is exactly why the check reads the repository instead of reading a runbook.

### F-2H.5-3 — The Edge env scan matched a variable inside a comment

**Severity: medium (in the probe). Fixed before it produced a wrong verdict.**

`supabase/functions/process-jobs/index.ts` carries a comment recording the
project-wide provider key BYOK **removed**. A naive `Deno.env.get("X")` scan
read it as a requirement, and the "fix" would have been to re-declare in the env
contract the very name `src/lib/byok/project-key-guard.test.ts` exists to
forbid — putting it back in a place someone could find it at 3am.

The scan now strips comments, and carries a non-vacuity control so a
comment-stripper that ate the whole file cannot read as "no findings".

**Sixth "suspect the probe before the product" of the phase.**

### F-2H.5-6 — The migration managed its own transaction, and the pre-flight hid it

**Severity: high (would have been silent). Fixed in this slice, before merge.**

`202608070083` was written with an explicit `begin;` / `commit;`. **No other
migration in this chain has one.** `supabase db push` already runs each file
inside a transaction, so the inner `commit;` would have **ended that
transaction**, leaving every statement after it in autocommit — and for this
migration specifically, that means §6's self-assertion (*"no Phase 2H retention
sweep is scheduled"*) would have raised **after its own DDL was already
committed**. A guard that travels with the DDL is worth nothing once it can no
longer roll the DDL back.

**The pre-flight passed 31/31 anyway**, because to splice a migration into one
transaction the harness must strip the file's own `begin;`/`commit;` — so it was
testing a text that would never be applied. Found by re-reading the diff against
its siblings, not by any check.

Fixed; `phase-2h-retention-guard.test.ts` now asserts that no Phase 2H migration
opens or closes a transaction, which makes the existing convention checkable
rather than merely conventional. Re-pre-flighted after the fix: **31/31**.

**Seventh "suspect the probe before the product" of the phase, and the first
where the probe was editing the artifact it was testing.**

### F-2H.5-4 — The application exposes no deployed-commit identifier

**Severity: low. Destination: `docs/TODO.md`, deployment observability.**

`verify:edge-parity` can assert "the deployed function matches its source".
Nothing can assert "the deployed application is the merge SHA" — the response
carries `server: Vercel` and a request trace, neither of which names a commit.
The authoritative reading is the Vercel dashboard. Adding an HTTP-readable build
identifier is an application change outside 2H.5's declared requirements.

### F-2H.5-5 — Two per-user operational classes are absent from the Privacy Policy

**Severity: low. Destination: `docs/TODO.md`, legal copy. Owner question.**

`error_events` and `rate_limit_events` are per-user operational records with a
90-day window, and neither appears in the Policy's rendered retention table.
Both are handled by account deletion and neither carries user content, so this
is not a T-31 falsehood — the Policy makes no claim about them either way.

Adding a class there changes a **published legal document and its version**,
forcing re-acceptance by every user. That is an owner and legal act, and this
phase is explicitly forbidden from signing legal acceptance on the owner's
behalf. Routed rather than decided.

---

## 9. Deployment ordering — the reasoning, recorded

**Safe order for this slice: merge, then apply the migration. The two are not
coupled, and that is a design choice rather than luck.**

`202608070083` creates three sweeps, three twins and three registry rows. **No
TypeScript reads any of them.** The dry-run and scheduling scripts are operator
tooling run by hand, never application code — `operator-surface-boundary.test.ts`
asserts that no file under `src/` calls an operator RPC.

So the application deployed by the merge is correct whether the migration has
been applied or not. The migration-before-code hazard the runbook §3 describes
— a Vercel build finishing before `db push`, putting new code on an old schema
in production — **does not apply here**, and this paragraph exists so the next
slice does not inherit the conclusion without the reasoning.

The migration itself also fails **closed** in the safe direction: an unseeded
window makes `private.retention_window` raise, and a sweep that cannot read its
window **deletes nothing**.

---

## 10. Destructive posture at close — unchanged

| | State |
| --- | --- |
| Public signup | **disabled** at both layers |
| Turnstile CAPTCHA | **enforced** |
| SMTP | **unconfigured** |
| Deletion reaper | **unarmed**, 0/2 Vault secrets, no cron job |
| Retention sweeps built | **8** (SH.6's five + this slice's three) |
| Retention sweeps **scheduled** | **0** |
| Attempt-prune jobs scheduled | **2**, both authorized by earlier slices, untouched |
| User-content purge | **never run** |
| Restore drill | **never executed** |
| Cron jobs total | **5**, unchanged |
| Phase 2I | **not started** |
