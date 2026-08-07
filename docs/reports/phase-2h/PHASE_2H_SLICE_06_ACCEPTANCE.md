# Phase 2H — Slice 2H.6 acceptance

**Convergence and closeout.** Written 2026-08-07. Branch
`codex/phase-2h-slice-6`. **Zero migrations**, as allocated.

---

## 1. Requirements, delivered and cited

| Requirement | State | Evidence |
| --- | --- | --- |
| `2H-CLOSE-001` | **DELIVERED** | `scripts/generate-phase-2h-traceability.mjs` + `src/lib/closeout/phase-2h-traceability.test.ts` — fail-closed, both directions cross-checked, **thirteen fixtures each carrying exactly one deliberate defect**, plus the real repository as the positive control. Output: `PHASE_2H_TRACEABILITY_MATRIX.md`. |
| `2H-CLOSE-002` | **DELIVERED** | `migrationFindings()` reconciles the budget **per slice**, not by count. Four mutation fixtures: a sixth migration, a migration under the wrong slice's number, a missing migration, an empty chain. |
| `2H-CLOSE-003` | **DELIVERED** | [`PHASE_2H_REPORT.md`](PHASE_2H_REPORT.md) — every requirement classified, every defect, every owner action with a destination, and every inherited deferral re-raised by name. |
| `2H-CLOSE-004` | **DELIVERED** | §4 below — the destructive posture re-read from the live environment at close. **Nothing was written to production by this slice.** |
| `2H-CLOSE-005` | **DELIVERED** | §5 below — A13 re-verified; Phase 2I remains unstarted and the guard's signals are intact. |

---

## 2. The traceability generator — `2H-CLOSE-001`

**44 requirements declared across nine families. 44 delivered and cited. 0
partial. 0 undelivered.**

Delivery is evidenced by **citation on disk**, never by a column somebody typed.
Both directions are checked: an id the PRD declares and nothing cites is a
finding, *and* an id an acceptance record cites that the PRD does not declare is
a finding.

### It refused before it generated, which is the proof it works

The first run against the real repository, before this record existed:

```
Phase 2H traceability refused to generate:
  - 2H-CLOSE-001 is neither cited by an acceptance record nor declared undelivered
  - 2H-CLOSE-002 is neither cited by an acceptance record nor declared undelivered
  - 2H-CLOSE-003 is neither cited by an acceptance record nor declared undelivered
  - 2H-CLOSE-004 is neither cited by an acceptance record nor declared undelivered
  - 2H-CLOSE-005 is neither cited by an acceptance record nor declared undelivered
```

Exactly the five requirements this slice delivers, named, with no matrix
written. A generator whose first act is to refuse to describe its own slice is
one that will refuse to describe anybody else's.

### `UNDELIVERED` and `PARTIAL` are both empty, and that is asserted

An empty exception list is only meaningful if an unlisted, uncited requirement
is still a finding — otherwise emptiness would just mean "nobody wrote anything
down". The cross-check makes it checkable, and the guard asserts the emptiness
explicitly so a later edit that adds an exception has to change a line that says
so.

---

## 3. Mutation proofs — thirteen fixtures, one defect each

Each fixture is a temporary repository with a PRD, a reports directory and a
migrations directory. **One thing is wrong in each.** A fixture producing *two*
findings would prove less, not more — it could not say which rule fired.

| # | Fixture | Expected finding |
| --- | --- | --- |
| 0 | **clean baseline** | **none** — without this, every assertion below could be firing on the scaffolding rather than the defect |
| 1 | PRD requirement cited nowhere | `… is neither cited … nor declared undelivered` |
| 2 | acceptance cites an id the PRD does not declare | `… is cited … but the PRD does not declare it` |
| 3 | id declared `UNDELIVERED` **and** cited | `… the declaration and the evidence disagree` |
| 4 | `UNDELIVERED` with no destination | `… declared undelivered with no destination` |
| 5 | `UNDELIVERED` with no reason | `… declared undelivered with no reason` |
| 6 | `PARTIAL` with no citation | `… declared partially delivered but no acceptance record cites it` |
| 7 | stale exception for an id the PRD dropped | `… but the PRD does not declare it` |
| 8 | **a sixth `phase_2h` migration** | `spent 6 migrations against a budget of 5` **and** `is in the chain but is allocated to no slice` |
| 9 | **migration under the wrong slice's number** | `slice 2H.5 was allocated 202608070083 as phase_2h_retention but the chain holds …rate_limiting.sql` |
| 10 | a missing migration | `slice 2H.3's allocated migration … is absent from the chain` |
| 11 | broken requirement extraction (prose only) | `the PRD yielded no declared requirements` |
| 12 | subtly wrong declaration shape (not bold) | same — the generator and the A13 detector must agree on what a declaration *is* |
| 13 | broken acceptance extraction (no records / no citations) | `no acceptance record exists` / `cites any 2H requirement` |
| ✓ | **the real repository** | **no finding** — the positive control |

Fixture 9 is the one a count cannot catch: five migrations, budget spent
exactly, and one slice's number carrying another slice's subject.

---

## 4. Destructive posture, re-read live at close — `2H-CLOSE-004`

**This slice wrote nothing to production.** Every line below is a read.

### Cron catalog — five jobs, each with an owner

```
byok-prune-validation-attempts   17 4 * * *   select public.prune_credential_validation_attempts();
my-brain-entry-dispatch          * * * * *    net.http_post(...)  -- the drain nudge
my-brain-hourly-heartbeat        0 * * * *    select public.run_all_heartbeats()
my-brain-job-reaper              * * * * *    select public.reap_expired_jobs(100)
sh-prune-auth-event-attempts     43 4 * * *   select public.prune_auth_event_attempts();
```

No duplicate names. **No Phase 2H sweep. No user-content sweep.** The two that
delete are the attempt prunes authorized by BYOK and SH.5, both untouched by
this phase.

### Migrations

**83 total, head `202608070083`, local = remote.** All five Phase 2H migrations
present: `…079`, `…080`, `…081`, `…082`, `…083`.

### Retention

Ten windows in `private.retention_windows` — SH.6's seven, and Phase 2H's three
at the signed **90 days** each. **Eight sweeps built, zero scheduled.**

Every destructive sweep, re-read from the catalog:

| Function | `service_role` | `authenticated` |
| --- | --- | --- |
| `prune_error_events()` | **false** | false |
| `prune_scheduled_job_health()` | **false** | false |
| `prune_rate_limit_events()` | **false** | false |
| `prune_terminal_jobs()` | **false** | false |
| `prune_notifications()` | **false** | false |

**No purge has ever run.**

### Deletion recovery

`account_deletion_attempts`: **0 rows** — no deletion is stalled. Vault secrets
matching `deletion_reap_url` / `deletion_reap_secret`: **0 of 2**. No
`my-brain-deletion-reaper` cron job. **The reaper is unarmed**, and while
unarmed the tick still classifies, so a stall would be visible from the first
minute.

### Error sink, dead-man, rate limiting

`error_events` 1 row · `scheduled_job_health` 3 rows · `rate_limit_events` 1 row.
Writer and consumer both reachable; the sink's consumer returns classification
and counts, never an id, correlation id or owner. `ops:health` classifies all
five jobs and distinguishes `success_empty` from `success_work`.

### Edge Functions

`delete-account` **v3** ok · `process-jobs` **v22** ok · `heartbeat`
**never deployed, by design**. `verify:edge-parity` fully green.

### Backup

Documentation exists (`PHASE_2H_BACKUP_AND_RETENTION.md`), drill script exists
(`scripts/phase-2h-restore-drill.mjs`), **execution state: NOT EXECUTED.** The
script's production refusal is executed and recorded; the drill is not, and it
is blocked ahead of authorization by F-2H.5-1 — there is nothing to restore.

### Hosted Auth

`disable_signup = true` · `security_captcha_enabled = true`, provider
`turnstile` · `smtp_host = null`, `smtp_admin_email = null`, `smtp_pass = null`
· `mailer_autoconfirm = false` · `site_url = https://my-brain-dusky.vercel.app`.

### Rollout gate

```
25 pass, 3 fail, 2 owner-signature
FAIL  RG-QUO-3   sweeps built and dry-run recorded, but NOT SCHEDULED
FAIL  RG-DEP-1   production SMTP configured (readback)
FAIL  RG-DEP-3   backup restored to a disposable project and recorded
OWNER RG-LEG-4   professional legal review is an owner signature
OWNER RG-DEP-4   monitoring adequacy is an owner signature

SIGNUP MUST NOT OPEN.
```

**No owner-signature gate was satisfied on the owner's behalf.**

---

## 5. A13 — Phase 2I remains unstarted — `2H-CLOSE-005`

Re-run at close: **green.** No Phase 2I PRD, no ADR accepting a Phase 2I
implementation, no `2I-*` requirement declarations, no Phase 2I implementation
files. The guard's signals are intact and it still points at Phase 2I rather
than at a phase already under way.

Nothing in this slice created any of those.

---

## 6. Local gates

| Gate | Result |
| --- | --- |
| `npm run lint` | **0 errors, 0 warnings** |
| `npm run typecheck` | **0 errors** |
| `npm test` | **4246 passed, 0 failed tests.** 3 failed *files* are the known Windows shebang-parse baseline, green in CI and unchanged by this slice. |
| `npm run build` | **passes** |
| `npm run docs:phase-2h:traceability` | **wrote the matrix** — after refusing on its first run |
| `phase-2h-traceability.test.ts` | **22 passed** — thirteen mutation fixtures plus the positive control |
| A13 phase-start guard | **green** — Phase 2I unstarted |

---

## 7. The residual 2H.5 left, closed here

**Boundary evidence for the three Phase 2H classes.** The first live dry run
reported `NOT READABLE (HTTP 403)` for all three — correct, because every one of
those tables revokes each table privilege from every role including
`service_role`. That proved the count and said nothing about the cutoff.

`ops:retention-dry-run` now also **counts at a second, wider window** using the
interval-taking twins 2H.2 built, which `service_role` may run. A wider window
must not return fewer prunable rows than a narrower one; a violation exits
non-zero and says the predicate is not measuring time the way its window claims.
No table row is read to obtain it.

`rate_limit_events` has no interval-taking twin — 2H.5 gave it only the
zero-argument form, and adding one costs a migration the budget no longer has.
**Reported as unavailable rather than skipped**, which is the same three-outcome
discipline the row read already follows.

```
error_events          0 prunable at 90 days · wider window 0 at 45 days (must be >= 0)
scheduled_job_health  0 prunable at 90 days · wider window 0 at 45 days (must be >= 0)
rate_limit_events     0 prunable at 90 days · wider window UNAVAILABLE (no interval-taking twin)
```
