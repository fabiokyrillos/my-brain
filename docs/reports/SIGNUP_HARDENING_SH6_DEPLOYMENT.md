# SH.6 deployment record — 2026-08-05

Append-only. Project `ulvwzqlpsjyrnqzfxmck`. Every value below was read back
from the hosted project, not inferred from the repository.

## 1. Merge sequence

| Step | Result |
| --- | --- |
| PR #93 merged | `cf540c7`, merge-SHA CI green ×3 (run `31044092893`) |
| PR #94 retargeted `codex/sh-slice-6-quotas` → `main` | done before merging, not trusted as "mergeable" against a stale base |
| PR #94 branch updated from new main | merge commit `18d65fb`, **no conflicts**, PR-head CI green ×3 |
| PR #94 merged | `6228a88`, merge-SHA CI green ×3 (run `31044886088`) |
| Branches | both preserved |

## 2. Pre-flight, before any migration

| Check | Reading |
| --- | --- |
| Project ref | `ulvwzqlpsjyrnqzfxmck` |
| Hosted migration head | `202608040075` — exactly as expected |
| `disable_signup` | `true` |
| `mailer_autoconfirm` | `false` |
| `external_anonymous_users_enabled` | `false` |
| `password_min_length` | `12` |
| `security_captcha_enabled` / provider | `true` / `turnstile` |
| SMTP | `smtp_host = null` — still unconfigured, no readiness claimed |
| Auth config vs repository truth | "already matches; nothing to do" |
| App health baseline | login 200, `/app` 307, legal 200 |

## 3. Migration application, in the required order

**`202608050076` first**, enforced by repository truth rather than by care: at
that moment `main` carried only that migration, so `db push` could not have
applied the second one early.

| After 076 | Reading |
| --- | --- |
| Hosted parity | `202608050076` |
| `claim_next_entry_interpretation_job` as anon | HTTP 401, `42501` — exists, refuses |
| `claim_entry_interpretation_job` as anon | HTTP 401, `42501` |
| `claim_attachment_job` as anon | HTTP 401, `42501` |
| Auth configuration | unchanged, still matching repository truth |
| App health | login 200, `/app` 307, legal 200 — identical to baseline |

The migration's own postconditions ran at apply time and raise on failure, so a
successful apply is itself the proof that the seven ceilings seeded, every
function is `SECURITY DEFINER` with an empty `search_path`, no client role holds
a privilege on `private.quota_ceilings`, and all four triggers exist as
`AFTER INSERT ... FOR EACH STATEMENT` with transition tables.

**`202608050077` second**, after PR #94 merged.

| After 077 | Reading |
| --- | --- |
| Hosted parity | `202608050077` — the chain head |
| Auth configuration | unchanged |
| App health | login 200, `/app` 307, legal 200 |

## 4. Exposure closures, read back live

| Probe | Reading |
| --- | --- |
| All 7 `prune_*` as **service_role** | HTTP 403, `42501` — refused |
| 3 `prune_*` as **anon** | HTTP 401, `42501` — refused |
| All 7 `count_prunable_*` as **service_role** | HTTP 200 |
| 3 `count_prunable_*` as **anon** | HTTP 401, `42501` — refused |
| `GET user_ai_credentials` as service_role | **HTTP 403, `42501`** — T-26 closed |
| `GET credential_validation_attempts` as service_role | **HTTP 403, `42501`** |
| `admin_credential_status` as service_role | HTTP 200 |
| `admin_credential_status` as anon | HTTP 401, `42501` |
| `admin_list_credential_envelopes` as service_role | HTTP 200, 1 active envelope, key_version histogram `{1:1}`, all five columns present |

The last row matters more than it looks: it proves the narrow replacement really
serves master-key rotation. A closure that had quietly broken rotation would
have read as success everywhere else.

## 5. Quota acceptance, on the deployed database

**Genuine concurrency** (`npm run sh6:quota-concurrency`) — 60 simultaneous
inserts by one owner against a ceiling of 50:

```
admitted : 50
refused  : 10
latency  : 410ms .. 1154ms
live rows in the database: 50
PASS  exactly 50 admitted (got 50, stored 50)
PASS  every racer got a declared answer
```

The stored count, not the responses, is the assertion. A count-then-insert
design over-admits here and passes every sequential test.

**The rest of the lane** (`npm run sh6:quota-acceptance`) — 11/11, two disposable
owners, **residual rows across `entries`/`jobs`/`account_lifecycle`: 0**.

| Case | Result |
| --- | --- |
| One INSERT of ceiling+1 entries refused, `QUOTA_ENTRIES_PER_DAY` | PASS |
| No partial write — refused batch stored 0 rows | PASS |
| A single entry inside the ceiling admitted | PASS |
| 55 exhausted jobs admitted past a ceiling of 50 | PASS |
| A live job still admitted behind them — no lockout | PASS |
| Owner A holds 5 in flight under live leases | PASS |
| Owner A refused at the fairness ceiling (`null`) | PASS |
| Owner B makes progress in the same tick | PASS |
| Expiring A's leases frees its share | PASS |
| A suspended owner gets `ACCOUNT_LIFECYCLE_NOT_ACTIVE`, never a `QUOTA_` code | PASS |
| Quota vocabulary distinct from lifecycle and throttle | PASS |

**The recorded run was 11/11; the script now carries 10 checks, and the
difference is deliberate.** The lifecycle-vocabulary case needed
`suspend_account`, and `signup-hardening-admin-boundary.test.ts` holds the
administrative surface to exactly one executable caller — the operator CLI. CI
caught the new script joining that set, which is the guard doing precisely its
job. Growing the set of files able to suspend an account, so that an acceptance
script could re-prove something already proven, is the worse trade: the property
holds in section 8 of `supabase/tests/signup_hardening_quotas.sql` against a real
Postgres every CI run, and it was proven once against this deployed database in
the run above. The case was removed rather than the boundary widened.

The entry-ceiling case is one array-bodied POST of 301 rows: it is simultaneously
the boundary test, the multi-row-bypass test and the no-partial-write test, and a
per-row trigger would admit all 301 on a count of zero.

Deployed two-user fairness runs on the **attachment** claim path, because the
interpretation path requires an active BYOK credential and SH.6's own exposure
closure now makes minting one from outside the database impossible. The
predicate is byte-identical across all three claim paths, asserted by
`signup-hardening-invariants.test.ts`.

## 6. Retention dry-run transcript (`npm run sh6:retention-dry-run`)

Run at `2026-08-05T20:41:16Z`. **Count-only. No sweep executed.**

| Class | Window | Cutoff | Eligible | Oldest surviving |
| --- | --- | --- | --- | --- |
| `jobs_terminal` | 90 d | 2026-05-07T20:41:16Z | **0** | 2026-07-21T14:53:31Z |
| `notifications` | 180 d | 2026-02-06T20:41:16Z | **0** | 2026-07-17T10:00:00Z |
| `product_events` | 180 d | 2026-02-06T20:41:16Z | **0** | NOT READABLE (HTTP 403) |
| `heartbeat_runs` | 30 d | 2026-07-06T20:41:16Z | **0** | 2026-07-16T20:49:45Z |
| `undo_operations_past_expiry` | 30 d | 2026-07-06T20:41:16Z | **0** | 2026-07-17T21:22:55Z |
| `auth_event_attempts` | 30 d | 2026-07-06T20:41:16Z | **0** | NOT READABLE (HTTP 403) |
| `credential_validation_attempts` | 30 d | 2026-07-06T20:41:16Z | **0** | NOT READABLE (HTTP 403) |

**Total eligible across all classes: 0.**

Three classes read `NOT READABLE` rather than "none in window", and the
distinction was a bug in the transcript script fixed before this run: those
tables refuse `service_role` by design — two of them because of revokes this very
slice made — and printing "(none in window)" for a table the reader is forbidden
to see would be the absence of evidence dressed as evidence.

Predicate identity is structural, not asserted: each class has **one** function
deciding what is prunable, the sweep deletes what it returns and the twin counts
what it returns, differing only in the limit. Boundary behaviour in both
directions is proven by `supabase/tests/signup_hardening_retention.sql` against a
real Postgres in CI, one second either side of every cutoff.

## 7. Heartbeat disposition (SH-EXPOSURE-005)

Proven before acting:

- No repository caller — `heartbeat-disposition.test.ts`, 4/4, over `src/`, `supabase/` and `scripts/`.
- No scheduler calls it — the only `cron.schedule` naming the heartbeat is `202607160008`, which calls `public.run_all_heartbeats()` **inside the database**; no `pg_net` call to `functions/v1/heartbeat` exists anywhere in the chain.
- No operator script depends on it — same test.
- The supported path is alive — `heartbeat_runs` shows hourly `completed` rows at 18:00, 19:00 and 20:00 UTC on the day of deployment.

Metadata before removal: slug `heartbeat`, status `ACTIVE`, version 8,
`verify_jwt: false`, id `9a2cc514-9132-4f6f-831d-65db87d4649e`.

**Undeployed 2026-08-05 at ~20:47 UTC.** Readback: `functions list` now returns
only `process-jobs` and `delete-account`; `POST /functions/v1/heartbeat` answers
**404**. The source stays in the repository — deleting it would make the
deployment un-auditable, and it is what a redeploy would use if the disposition
is ever reversed.

**No scheduled work regressed, verified by waiting rather than by reasoning.**
The next hourly tick after the undeploy ran at **`2026-08-05T21:00:00Z`, status
`completed`**. The argument that an HTTP wrapper cannot affect a `pg_cron` job
calling a SQL function is sound, and it is still an argument; the 21:00 row is
the observation.

## 8. The defect this deployment found (see ADR-082)

Applying `202608050077` **scheduled all seven destructive sweeps**, because the
migration ends with a `cron.schedule` block. Five had never run against
production and none was authorized. The first live purge would have executed at
04:11 UTC the next morning, and the dry-run transcript meant to precede that
decision would have described a deletion that had already happened.

Nothing was lost — every class measured zero eligible rows — but that is a fact
about how young this project is, not about the design: the oldest
`heartbeat_runs` row crosses its 30-day line within a fortnight.

Corrected the same day. Hosted `cron.job` before and after:

| Before | After |
| --- | --- |
| `byok-prune-credential-validation-attempts` *(new duplicate)* | *(removed)* |
| `byok-prune-validation-attempts` | `byok-prune-validation-attempts` |
| `my-brain-entry-dispatch` | `my-brain-entry-dispatch` |
| `my-brain-hourly-heartbeat` | `my-brain-hourly-heartbeat` |
| `my-brain-job-reaper` | `my-brain-job-reaper` |
| `sh-prune-auth-event-attempts` *(SH.5, authorized)* | `sh-prune-auth-event-attempts` |
| `sh-prune-heartbeat-runs` *(new)* | *(removed)* |
| `sh-prune-notifications` *(new)* | *(removed)* |
| `sh-prune-product-events` *(new)* | *(removed)* |
| `sh-prune-terminal-jobs` *(new)* | *(removed)* |
| `sh-prune-undo-operations` *(new)* | *(removed)* |

The two sweeps that pre-date SH.6 were left exactly as SH.5 and BYOK left them.
`scripts/sh6-retention-schedule.mjs` is now the gate the migration removed, and
`--enable` **is** the authorization of the first live purge.

## 9. Final deployed posture

- Hosted migration parity: **`202608050077`**.
- Public signup: **disabled**, unchanged throughout.
- Destructive sweeps: **executable by no role, and scheduled by nothing.**
- Retention `sweepActive` flags: **false** — deployed is not enforced, and the Privacy Policy keeps its honest-notice warning.
- **First live production purge: NOT AUTHORIZED / NOT EXECUTED.**
