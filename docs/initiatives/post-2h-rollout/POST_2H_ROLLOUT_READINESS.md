# Post-2H rollout readiness — the governing artifact

**Authorized:** 2026-08-07, owner instruction, at the start of the first
post-2H session.
**Status:** in execution.
**This is NOT Phase 2I. It is not a phase.** No successor phase is authorized,
and beginning this work does not authorize one.

---

## 1. What this is, and what bounds it

A **bounded post-2H rollout-readiness effort**: close the engineering-owned half
of the fail-closed signup rollout gate, and name the exact owner action for
every item engineering cannot close.

It carries **no requirement families**, **no slice structure**, and **no phase
gates**. It has one migration, separately authorized (ADR-091), which is **not**
charged to Phase 2H's spent budget of five.

**Phase 2H history is not rewritten.** Every Phase 2H acceptance document,
including the ones that say "green ×3", remains exactly as written. Where a 2H
artifact is now superseded — the pgTAP comment about the five sweeps, the
deployment runbook's gate — the old text is **struck or annotated, never
deleted**, so a reader can tell that a rule was replaced rather than that it
never existed.

---

## 2. The work

| # | Item | State | Blocker |
| --- | --- | --- | --- |
| **A0** | Record the new owner CI policy | **done** — ADR-090, handoff §39, runbook §9 amended | — |
| **A1** | Correct the `202608050077` fresh-database scheduling defect | **done** — migration `202608070084`, ADR-091, chain-built regression coverage | deploy after merge-SHA CI |
| **A2** | Backup readiness | **done** — toolchain built, 23 guard assertions green | **owner: one local install + two secrets** |
| **A3** | Restore drill | **INCOMPLETE, and recorded as such** | A2 |
| **A4** | SMTP rollout path | **done** — inventory, exact steps, exact verification | **owner: sending domain + DNS + credential** |
| **A5** | Monitoring adequacy | **done** — packet written, decision framed | **owner signature** |
| **A6** | Legal review packet | **done** — machinery audited and consistent | **owner + professional review** |
| **A7** | Re-run the rollout gate | **done** — see §4 | — |

Records: `docs/reports/post-2h-rollout/`.

---

## 3. Two things that were deliberately NOT done

These are the actions that would have made the numbers look better and the
system no safer.

1. **`docs/reports/signup-hardening/SIGNUP_HARDENING_BACKUP_RESTORE.md` was not
   created.** `RG-DEP-3` passes on that file's *existence*. Writing it would
   have turned the gate green without a restore ever having happened. It gets
   written when the drill runs.
2. **No alerting destination was invented for `RG-DEP-4`.** ADR-089 holds: an
   unread alert channel is worse than none, because it is an *argument* that
   someone is watching.

Neither owner-signature gate was satisfied on the owner's behalf.

---

## 4. The rollout gate, re-read after this work

`npm run rollout:verify` — **25 pass · 3 fail · 2 owner-signature ·
"SIGNUP MUST NOT OPEN"**. Unchanged, and correctly so: this effort built
mechanisms and packets, and **not one of the four remaining items is closable
without an owner act.**

| Gate | Verdict | What closes it |
| --- | --- | --- |
| `RG-QUO-3` | **FAIL** | Owner enables a retention schedule — **which is the authorization of the first live purge of user content.** Not taken, not recommended lightly, and `npm run sh6:retention-dry-run` comes first. |
| `RG-DEP-1` | **FAIL** | Owner configures Resend SMTP. Moves on a readback — no document needed. `POST_2H_SMTP_ROLLOUT_PATH.md`. |
| `RG-DEP-3` | **FAIL** | Owner completes the backup install, then the drill runs. `POST_2H_BACKUP_READINESS.md`. |
| `RG-LEG-4` | **OWNER** | Professional review, attestation, banner removal. `POST_2H_LEGAL_REVIEW_PACKET.md`. |
| `RG-DEP-4` | **OWNER** | Owner signs monitoring adequacy — with a **stated cadence**, or after one alert destination exists. `POST_2H_MONITORING_ADEQUACY.md`. |

**Opening signup remains a separate explicit owner action after the gate is
satisfied.** Nothing in this effort opens it, and nothing in it should be read
as recommending that it be opened.

---

## 5. Posture, re-read live at the close of this work

Signup **disabled** at both layers · CAPTCHA **enforced** (`turnstile`) · SMTP
**unconfigured** (every `smtp_*` field null) · exactly **five** cron jobs, none
a user-content sweep · `delete-account` **v3** and `process-jobs` **v22** at
parity, `heartbeat` undeployed by design, `verify:edge-parity` fully green ·
deletion reaper **unarmed**, 0/2 Vault secrets · **eight sweeps built, zero
scheduled** · **no purge has ever run** · restore drill **not executed** ·
hosted parity `202608070083` with `202608070084` local-only pending its
merge-SHA gate · **Phase 2I not started**, A13 green.

---

## 6. Two findings this effort produced

1. **`scripts/phase-2h-restore-drill.mjs` counted a table that does not exist**
   (`public.entities`). Found by the first census ever taken against the live
   project. It would have produced a **false check-1 failure on a good
   restore** — check 1 being the only one that measures whether the data came
   back. Fixed at the source: one list, in `backup-shared.mjs`, imported by
   both, and asserted against the generated database types.
   *Suspect the probe before the product — eight times now.*
2. **A pgTAP fixture depended on the defect being present, and CI proved it.**
   `phase_2h_error_sink_and_deadman.sql` test 46 needed a job that had never
   reported, and **borrowed `sh-prune-notifications` from the catalog** — a job
   that existed only because `202608050077` scheduled it. Its retained comment
   even noted the job was absent on hosted and called the divergence "harmless
   here". It was not: the moment `202608070084` unscheduled the five, the
   subject vanished and the assertion read `NULL`.

   **The test was right to break** — it was measuring the environment, not the
   product. And there was **no surviving job to borrow**: the heartbeat, the
   reaper, the dispatch drain and `sh-prune-auth-event-attempts` all report
   their own runs since 2H.4, and the BYOK prune's job *name* differs between a
   chain-built database and hosted. So the suite now **schedules its own
   subject** inside its transaction, exactly as the T-2H-14 probe fifteen lines
   below it already did — which also removes the environment dependence the old
   comment had to apologise for.

   *A fixture must not borrow a live catalog entry.* This repository has now
   learned that twice in one day, the other being the `public.entities` phantom.
3. **The rollout gate would have passed `RG-QUO-3` in any rebuilt environment,
   with nobody having authorized a purge.** `verify-signup-rollout.mjs`
   computes `retentionSweepsScheduled` as *"all five user-content sweeps are in
   `cron.job`"* — and `202608050077` scheduled all five at apply time. So the
   gate whose entire purpose is to require an **authorized** retention
   activation would have been satisfied **by the defect ADR-082 was written
   about.** Hosted never reached that state only because an operator removed the
   five the same day, which means the gate has been honest **by accident rather
   than by construction.** After `202608070084` the only way it can pass is
   `npm run sh6:retention-schedule -- --enable`, an operator act — which is what
   it always meant. Hosted behaviour is unchanged; a rebuilt environment can no
   longer read one gate greener than the truth.
4. **The rate limiter has no operator read.** 2H.3 built `rate_limit_events`;
   2H.4's five operator reads do not cover it. Enforcement is proven; visibility
   is missing. It is the one gap that **widens specifically because signup
   opened**, and it is the ADR-084 shape again — a producer whose refusals
   nobody reads. Needs no migration. Recommended before signup opens.

---

## 7. Where this stops

Every remaining item requires one of the owner stop conditions: an external
credential, a DNS action, a professional signoff, a monitoring signature, or the
execution of a destructive purge. **All work independent of those is finished.**
