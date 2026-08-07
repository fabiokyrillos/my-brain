# Post-2H — Monitoring adequacy (`RG-DEP-4`)

**Date:** 2026-08-07 · **Track:** A5 · **Not part of Phase 2H.**
**This document does not sign `RG-DEP-4`.** It is the decision packet the
signature needs, and §6 states the question in the form the owner must answer.

---

## 0. The one-sentence adequacy statement

> **Everything is observable; nothing is proactively alerted.** Every failure
> class this product has actually suffered is now computable and returns a
> non-zero exit code from a command — and **no command runs unless a person runs
> it.** Whether that is adequate depends entirely on one number the owner must
> supply: **how long may a silent failure last?**

---

## 1. What was read, live

`npm run ops:health` — 2026-08-07, error window 7 days, staleness 3× each job's
own interval:

```
JOB QUEUE
  interpret_entry      completed 4   claimable now 0   expired leases 0

SCHEDULED JOBS
  byok-prune-validation-attempts   never_reported   17 4 * * *   never reported
  my-brain-entry-dispatch          current          * * * * *    1 min since last success
      succeeding, but has never reported useful work
  my-brain-hourly-heartbeat        current          0 * * * *    54 min since last success
  my-brain-job-reaper              current          * * * * *    1 min since last success
      succeeding, but has never reported useful work
  sh-prune-auth-event-attempts     never_reported   43 4 * * *   never reported

EDGE FUNCTION PARITY
  delete-account  ok (v3)    heartbeat  undeployed_by_design    process-jobs  ok (v22)

ERROR SINK (last 7 days)
  server_action  other  unclassified  x1   0 with an owner   last 2026-08-07T07:39:38Z

NEEDS ATTENTION
  byok-prune-validation-attempts is never_reported
  sh-prune-auth-event-attempts is never_reported
```

Also read: `npm run verify:edge-parity` → all green; `npm run rollout:verify` →
25 pass · 3 fail · 2 owner-signature; `npm run ops:deletion-reaper-schedule` →
unarmed, 0/2 Vault secrets.

**The two `never_reported` jobs are correct and are not a fault.** Both are
04:xx daily prunes that have not ticked since 2H.4 shipped the reporting. "No
evidence of a successful run" reads as *no evidence*, never as health — that is
the designed classification, and `ops:health` exiting non-zero for it is the
mechanism working. They resolve on their own at ~04:17 and ~04:43 UTC.

---

## 2. Adequacy by dimension

| Dimension | Observable? | How | Proactively alerted? |
| --- | --- | --- | --- |
| **Scheduled-job health** | **yes** | `scheduled_job_liveness`, classified against a multiple of each job's own interval | **no** |
| **Stale / never-reported jobs** | **yes** | same; `never_reported` is a distinct class from healthy | **no** |
| **Tick vs. useful work** | **yes** | `last_success_at` and `last_useful_at` are separate columns — the 2H.0 census defect (29 042 ticks, 4 rows of work) cannot recur | **no** |
| **Edge Function parity** | **yes** | `verify:edge-parity`; `undeployed_by_design` is not folded into `ok` | **no** |
| **Queue depth** | **yes** | `operator_job_queue_health` | **no** |
| **Expired leases** | **yes** | same read | **no** |
| **Error-sink classes** | **yes** | `operator_error_event_volume` — classification and counts, never an id or an owner | **no** |
| **Stalled deletions** | **yes** | `operator_stalled_deletions` / `ops:account-health`, with reason codes | **no** |
| **Rate limiter state** | **partial — see §3** | `rate_limit_events` exists and is written; **no operator read aggregates it** | **no** |
| **Migration parity** | **yes** | `npx supabase migration list --linked` | **no** |
| **Application deployment identity** | **NO — see §4** | nothing exposes the deployed commit over HTTP | **no** |
| **Storage orphans** | **yes** | `verify:storage:orphans` | **no** |
| **Rollout gate posture** | **yes** | `rollout:verify` | **no** |

---

## 3. Gap — the rate limiter has no operator read

2H.3 built `public.rate_limit_events` (owner, bucket, outcome, time) and 2H.4
built five operator reads — **none of which covers it.** So the questions "is
anyone being refused right now?" and "is a ceiling mis-set?" are answerable only
by direct `service_role` SQL, not by `ops:health`.

**Why this matters more after signup opens than it does today.** With three
accounts a refusal is a curiosity. With public signup, a refusal rate is the
first signal of both abuse and of a ceiling set too low — and a ceiling too low
is indistinguishable, from the user's side, from the product being broken.

**Severity: medium, and not blocking.** The mechanism is fail-closed and proven
(80-vs-60 and 30-vs-20 executed in CI); it is the *visibility* that is missing,
not the enforcement. It needs no migration — an operator read over an existing
table, in the shape the other five already have. **Recommendation: build it
before signup opens, not before this signature.**

> This is precisely the ADR-084 shape: a producer whose refusals nobody reads.
> SH.6's quota refusals recorded nothing for weeks and the code looked as though
> it recorded. Naming it here is what stops the same silence twice.

---

## 4. Gap — the deployed application cannot be identified over HTTP

Carried from 2H.5 (F-2H.5-4, low). `verify:edge-parity` can assert *the deployed
function matches its source*; **nothing can assert *the deployed application is
the merge SHA***. The response carries `server: Vercel` and `x-vercel-id`,
neither of which names a commit, so the authoritative reading is the Vercel
dashboard — a human looking at a screen.

Cheap to close (a build-time constant on a health route) and unchanged in
severity. Recorded so the signature is given knowing it.

---

## 5. What has no proactive alert — which is everything

**ADR-089 is the reason, and it still holds.** Alerting needs a destination, a
threshold, and an owner who has agreed to receive it. All three are owner
decisions. **No destination is invented here to satisfy a checkbox** — an unread
alert channel is worse than none, because it is an *argument* that someone is
watching.

What exists instead is the whole interface an integration needs:

| Command | Exits non-zero when |
| --- | --- |
| `npm run ops:health` | expired lease · stale or never-reported scheduled job · scheduled-job finding · stale/missing/orphaned Edge deployment |
| `npm run ops:account-health` | an account has gone terminal in deletion recovery |
| `npm run rollout:verify` | any gate fails or is unsigned |
| `npm run verify:edge-parity` | a deployed function is behind its source |
| `npm run backup:verify` | a backup artifact is missing, corrupt, or not a dump |

Any of cron, a CI schedule, a monitoring agent's exec check, or a person can
consume these. **The decision left is where the exit code goes.**

### The honest characterisation of today's posture

**Manual polling, at a cadence nobody has specified.** Detection latency for
every class in §2 is *however long until someone next runs the command*. The
2026-08-04 deletion stall — the incident that motivated Phase 2H — sat visible
in the database for **two days**, and the only thing that reported it was a
person looking. Phase 2H made that state *computable in one command*. It did not
make anyone run the command.

---

## 6. The adequacy decision, in the form the owner must answer

`RG-DEP-4` asks whether monitoring and incident handling are adequate **for
initial signup rollout** — not in general.

### What is genuinely strong

- Every failure class the product has actually suffered is computable.
- Liveness is classified against each job's own interval, and `never_reported`
  is never health.
- `useful` is derived from real work, so the census defect cannot recur.
- Deployment parity is measured for the layer that historically drifted.
- The error sink cannot leak content — it has nowhere to put a message.
- Everything is one command and an exit code away from any alerting system.

### What is genuinely weak

- **Nothing pushes.** Detection latency is unbounded.
- **The rate limiter is invisible in the operator surface** (§3) — the one gap
  that grows specifically because signup opened.
- **The deployed application commit is not machine-readable** (§4).
- **A single operator.** No rotation, no escalation, no second reader.

### The question

> **Given that initial rollout is a bounded, invitation-scale opening and that
> the owner is the only operator: is a detection latency of "whenever I next run
> `npm run ops:health`" acceptable?**

The two answers, both defensible:

**Sign it.** Justified if rollout stays small and the owner commits to a
**stated cadence** — daily `ops:health`, weekly `rollout:verify` and
`backup:verify`. The mechanisms are real; the missing part is a habit, and at
this scale a habit is a legitimate control. *If this is the answer, write the
cadence into the attestation.* An adequacy signature with no cadence in it is a
signature on nothing.

**Do not sign yet.** Justified if the answer to "how long may a silent failure
last?" is shorter than a day. Then the smallest closing action is **one
destination for one exit code**: a scheduled GitHub Actions workflow running
`ops:health` and opening an issue on non-zero, or a cron entry piping it to
email. Roughly an hour of work, no migration, no new dependency. Building the
§3 rate-limiter read alongside it would close the only gap that rollout itself
widens.

**Recommendation, offered and not substituted for the decision:** take the
second, and pair it with the §3 read. The gap between "computable" and
"reported" is the exact gap that produced the incident this phase was built
around, and closing it is cheap enough that the argument for deferring it is
weak.

**No signature is given here, and none may be inferred from this
recommendation.** `RG-DEP-4` reads `OWNER` until the owner records an
attestation.
