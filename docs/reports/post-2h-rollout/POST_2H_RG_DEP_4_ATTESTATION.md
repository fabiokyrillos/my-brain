# `RG-DEP-4` — monitoring adequacy attestation, prepared for signature

**Date:** 2026-08-07 · **Status: UNSIGNED. This document does not sign
`RG-DEP-4`, and nothing in it may be read as a signature.**

Companion to `POST_2H_MONITORING_ADEQUACY.md`, which frames the decision. This
one is narrower: **the exact text the owner would sign**, with every number
filled in, so signing is a decision rather than a drafting exercise.

**No alerting destination is invented here** (ADR-089). The attestation below
describes monitoring **as it actually is** — manual, command-driven, with an
unbounded detection latency that the chosen cadence bounds.

---

## 1. What is inspected, by what surface, and what it would catch

Every row is a real command with a real exit code. Nothing here is aspirational.

| # | What is inspected | Command | Non-zero exit when | What it catches that nothing else does |
| --- | --- | --- | --- | --- |
| 1 | Scheduled-job liveness — all five cron jobs, classified against a multiple of **each job's own interval** | `npm run ops:health` | any job stale or `never_reported` | A `pg_cron` job that silently stopped. `never_reported` is never folded into healthy. |
| 2 | Tick vs. **useful work** | same | — (reported, not gating) | The 2H.0 census defect: 29 042 successful ticks against four rows of work. Separate columns make "succeeding but doing nothing" visible. |
| 3 | Job queue depth and **expired leases** | same | any expired lease | A worker that died holding work. |
| 4 | **Edge Function deployment parity** | same, and `npm run verify:edge-parity` | a function is stale, missing or orphaned | The phase's founding defect — `delete-account` undeployed for days while every test passed. `heartbeat`'s deliberate absence classifies `undeployed_by_design` and is **not** folded into `ok`. |
| 5 | Error-sink volume by classification | same | — (reported) | Failure classes with no owner, without exposing ids or content. |
| 6 | Scheduled-job findings from `cron.job_run_details` | same | any finding | Health row with no job, duplicate job name, tick `pg_cron` recorded as failed. |
| 7 | **Stalled account deletions** | `npm run ops:account-health` | an account went terminal in deletion recovery | The 2026-08-04 incident class — a deletion stranded in `deleting` with every write refused. |
| 8 | **Rollout gate posture** | `npm run rollout:verify` | any gate fails or is unsigned | A gate silently flipping, in either direction. |
| 9 | Hosted **migration parity** | `npx supabase migration list --linked` | local ≠ remote (read, not exit-coded) | Schema drift between the chain and production. |
| 10 | **Destructive posture** — cron catalog, sweeps, reaper | `npm run ops:retention-schedule`, `npm run ops:deletion-reaper-schedule` | — (read) | A sweep or the reaper becoming scheduled without authorization. |
| 11 | **Backup integrity** | `npm run backup:verify -- --manifest <path>` | artifact missing, corrupt, or not a dump | *Currently inapplicable — no backup exists yet (`RG-DEP-3`).* |

### 1.1 What has **no** proactive alert

**All of it.** Every row above requires a person to run a command. ADR-089 holds:
a destination, a threshold and a receiving owner are all owner decisions, and an
unread alert channel is worse than none because it is an *argument* that someone
is watching.

### 1.2 One gap inside the inspected set, named

**The rate limiter has no operator read.** 2H.3 built `rate_limit_events`; none
of 2H.4's five operator reads covers it, so *"is anyone being refused right
now?"* needs raw `service_role` SQL and is **not** in any row above.
Enforcement is proven; visibility is missing. It needs no migration. **It is the
one gap that widens specifically when signup opens.**

---

## 2. Proposed cadence, and the silent-failure duration it implies

**This is the part that makes the signature mean something.** A cadence is a
commitment to a maximum detection latency; without one, the attestation asserts
nothing.

| Inspection | Proposed cadence | **Max silent-failure duration implied** |
| --- | --- | --- |
| `ops:health` (rows 1–6) | **daily** | **≤ 24 h + the job's own staleness window.** For a per-minute job at 3× staleness that is ~24 h; for the hourly heartbeat, ~27 h; for an 04:xx daily prune, **up to ~48 h**, because a missed tick is only classifiable after the next scheduled one. |
| `ops:account-health` (row 7) | **daily**, alongside the above | **≤ 24 h** on top of the reaper's own bounded retry (5 attempts, exponential backoff from 15 min, capped at 6 h) — so a stranded deletion is visible **≤ 24 h** after it goes terminal, against the **two days** the 2026-08-04 incident actually took. |
| `rollout:verify` (row 8) | **weekly**, and before any deploy | ≤ 7 days for a silent gate change. Acceptable only because no gate can change without a repository or hosted change the owner made. |
| `verify:edge-parity` (row 4) | **every deploy**, plus the daily `ops:health` | ≤ 24 h. |
| Migration parity (row 9) | **every deploy** | Bounded by deploy frequency; drift cannot appear without a deploy. |
| Destructive posture (row 10) | **weekly**, and before/after any migration | ≤ 7 days for an unauthorized schedule. **Mitigated structurally**: `202608070084` and ADR-082 mean no migration can schedule a sweep, and no role can execute one. |
| `backup:verify` (row 11) | **weekly**, once a backup exists | ≤ 7 days for a corrupt backup — which is the difference between *having backups* and *having files*. |

### 2.1 The honest worst case

> **With the daily cadence above, the maximum time a silently broken scheduled
> job can go unnoticed is approximately 48 hours** — the daily inspection
> interval plus the staleness window of the least frequent job (the 04:xx daily
> prunes).
>
> For everything inspected per-deploy or weekly, the worst case is **7 days**.

For comparison: the incident that motivated Phase 2H was visible in the database
for **two days** with nobody looking. **The daily cadence makes that case ~24 h,
and makes it a detection rather than an accident.** It does not make it minutes.

---

## 3. The attestation text, for signature

> *Unsigned. To sign, the owner records the block below — with the cadence
> filled in as committed to, not as proposed — in
> `docs/reports/post-2h-rollout/` and re-runs `npm run rollout:verify`.*

```
RG-DEP-4 — MONITORING AND INCIDENT-HANDLING ADEQUACY

Signed by:            Fábio Kyrillos, sole operator
Date:                 ____________________
Scope of adequacy:    initial, invitation-scale signup rollout ONLY.
                      This attestation is void for a general public launch
                      and must be re-taken before one.

I have read POST_2H_MONITORING_ADEQUACY.md and
POST_2H_RG_DEP_4_ATTESTATION.md, and I attest:

1. I understand that NOTHING is proactively alerted. Every inspection
   requires me to run a command. There is no destination, no threshold and
   no escalation, and ADR-089 records that this is deliberate rather than
   an oversight.

2. I commit to the following cadence:
      - npm run ops:health ................ daily
      - npm run ops:account-health ........ daily
      - npm run rollout:verify ............ weekly + before any deploy
      - npm run verify:edge-parity ........ every deploy + daily
      - npm run backup:verify ............. weekly, once a backup exists
      - destructive posture reads ......... weekly + around any migration

3. I accept the detection latency this implies: approximately 48 hours
   for a silently broken scheduled job, and up to 7 days for anything
   inspected weekly.

4. I accept that there is ONE operator, with no rotation, no escalation
   path and no second reader. If I am unavailable, nothing is inspected.

5. I accept two named gaps:
      - the rate limiter has no operator read, so refusal rates are not
        visible without raw SQL;
      - the deployed application exposes no commit identifier over HTTP,
        so "the deployed app is the merge SHA" is read from a dashboard.

6. I understand this attestation is about MONITORING ADEQUACY ONLY. It
   does not open signup, authorize a retention purge, arm the deletion
   reaper, or satisfy any other rollout gate.

Signature: ____________________
```

---

## 4. If the owner would rather not sign this

Entirely reasonable, and it is the recommendation in
`POST_2H_MONITORING_ADEQUACY.md` §6. The smallest closing action is **one
destination for one exit code**:

- a scheduled GitHub Actions workflow running `npm run ops:health` and opening
  an issue on non-zero — roughly an hour of work, no migration, no new
  dependency, and it consumes the exit-code contract that already exists;
- **or** an OS-level scheduled task piping the same exit code to email.

Either turns the 48-hour worst case into the workflow's interval. Pairing it
with the rate-limiter operator read (§1.2) would close the only gap that rollout
itself widens.

**Both paths are legitimate.** What is not legitimate is a signature with no
cadence in it — that is a signature on nothing, which is why §3's block refuses
to be signable without one.
