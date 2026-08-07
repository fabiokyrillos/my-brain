# Phase 2H — Deploy and Operate — PRD

- **Status:** APPROVED FOR PLANNING (ADR-085, 2026-08-06, an owner decision). **Implementation is not authorized to merge or deploy by this document.**
- **Governing decision:** `ADR-085`. Roadmap position: `ADR-068`. Scope origin: `docs/reports/phase-2g/PHASE_2G_DEFINITION.md` §18 and `docs/initiatives/signup-hardening/SIGNUP_HARDENING_IMPLEMENTATION_PLAN.md` §362.
- **Companion artifacts:** `PHASE_2H_IMPLEMENTATION_PLAN.md` (slices, gates, budget), `docs/reports/phase-2h/PHASE_2H_THREAT_MODEL.md` (T-2H-01…T-2H-24), `docs/reports/phase-2h/PHASE_2H_TRACEABILITY_CONTRACT.md` (how this document is proven).
- **Predecessor:** Phase 2G — Conversational Creation, COMPLETE 2026-08-06, hosted parity `202608060078`.

---

## 1. What this phase is

Every phase up to now built product against a database. This one builds **the ability to run it** — and it is the first phase whose subject is the deployment itself rather than a feature inside it.

The trigger is not a roadmap slot. It is a defect that already happened. On 2026-08-04 the `delete-account` Edge Function stopped working, because migration `202608050077` revoked a grant the deployed build depended on. Every deletion answered `credential_not_erased`. **Nothing noticed for two days**, and nothing re-ran the stalled executor; what surfaced it was a person trying to delete an account. A green repository, green CI on three jobs and a merged PR all proved nothing, because the code had been correct since `357cd63` and simply was not running anywhere.

That single incident contains this phase's entire thesis:

- there was **no retry** (`2H-RECOVER`),
- there was **no error sink** to record the failure (`2H-SINK`),
- there was **no liveness check** on the scheduled work (`2H-DEADMAN`),
- there was **no operator surface** to see any of it (`2H-OPS`),
- and there was **no deployment contract** that would have caught the parity gap before a user did (`2H-DEPLOY`).

Distributed rate limiting (`2H-RATE`) joins them because it is the last open `Critical` from the architecture review (C1), and because — as the Phase 2G definition study argued and this PRD adopts — *a rate limiter cannot be validated against a surface nobody can reach*. Deployment is what finally makes it testable. Retention (`2H-RETENTION`) and backup (`2H-BACKUP`) join for the same reason.

## 2. What this phase is explicitly not

- **It does not open public signup.** That is guarded by `verify-signup-rollout.mjs`'s fail-closed checklist, currently reading 25 pass · 3 fail · 2 owner-signature, and by `signup-config-guard.test.ts`. Phase 2H may make some of those gates *satisfiable*; it may never flip them.
- **It does not enable retention sweeps or execute a purge.** ADR-082 is binding: a migration that schedules a destructive sweep has already authorized it. Every retention deliverable here is a mechanism or a script; **enabling is an owner action and is the authorization of the first live production purge.**
- **It does not deploy `process-jobs`.** ADR-086 records that as a separate owner decision. `2H-DEPLOY-007` produces the audit that decision needs; it does not take the decision.
- **It does not build semantic retrieval, AI provenance (`2E-COMMAND-012`, ADR-057's reopening gate unexecuted), a second write path to `public.tasks`, or a product admin UI** (ADR-075: the administrative boundary is an operator CLI over `service_role` SQL, with no product admin UI and no service-role HTTP endpoint — `2H-OPS` is bound by that decision, not an exception to it).
- **It does not absorb Phase 2G's two partial requirements.** `2G-ROUTE-008` and `2G-CLOSE-003` keep their own destination and their own single blocker (a disposable provider credential, one owner action).

## 3. Requirement families

`2H-DEPLOY` · `2H-RECOVER` · `2H-SINK` · `2H-DEADMAN` · `2H-RATE` · `2H-RETENTION` · `2H-BACKUP` · `2H-OPS` · `2H-CLOSE`

Every requirement below is declared in this repository's declaration shape (`- **2H-FAMILY-000:**`). A requirement that lives only in prose elsewhere is **not** declared and is not counted by the traceability generator.

---

## 4. `2H-RECOVER` — the stalled-deletion mechanism

The first-class requirement of this phase, promoted from a closeout residual because the record already names it in these words: *"`re-runnable` was implemented as a property, not a mechanism."* The executor is idempotent and stops rather than forces — both true, both good — but **nothing re-runs it**, so one failed invocation strands an account in `deleting` with every write refused and no bound on how long that lasts.

- **2H-RECOVER-001:** A stalled account deletion is retried automatically. An `account_lifecycle` row in `deleting` whose last executor attempt is older than a declared threshold is re-invoked without human action, by the same `service_role` path the product uses, and the mechanism is a database-scheduled reaper in the shape `reap_expired_jobs` already establishes — not a new bespoke scheduler. Slice 2H.1. Migration: yes. Evidence: pgTAP.
- **2H-RECOVER-002:** Retry is bounded and never infinite. Attempts carry a count, a bounded backoff and a terminal `stalled` classification after the ceiling; a deletion that cannot complete stops being retried and becomes **visible** rather than silently looping. The ceiling and the backoff are declared values in this PRD's §14 value sheet, not magic numbers in a function body. Slice 2H.1. Migration: same. Evidence: pgTAP.
- **2H-RECOVER-003:** Retry cannot resurrect data or weaken the executor's own refusals. The reaper re-invokes the executor; it never performs deletion itself, never bypasses the `credential_not_erased` stop, and holds no capability the executor does not already hold. A retry that could delete rows the executor refused to delete would be a second write path to the most destructive operation in the product. Slice 2H.1. Migration: same. Evidence: pgTAP + Deno tests on the executor.
- **2H-RECOVER-004:** A stalled deletion's stop reason becomes readable by an operator **without widening `account_deletion_log`**. That table is revoked from every role including `service_role`, holds a session hash, and an invariant test keeps it that way; the requirement is a projection carrying the reason code, the attempt count and the timestamps — and **never** the session hash or any credential material — exposed through the operator path ADR-075 already sanctions. Slice 2H.1. Migration: same. Evidence: pgTAP grant probes proving the base table is still unreadable.
- **2H-RECOVER-005:** Every automatic retry is auditable. Actor (`reaper`), source, reason, target, time and resulting state land in `audit_logs` through the existing writer, so an account that was retried eleven times can be reconstructed after the fact. Slice 2H.1. Migration: same. Evidence: pgTAP.
- **2H-RECOVER-006:** The mechanism is proven against the **actual** historical defect, not a synthetic one. A test drives an account to `deleting`, makes the executor fail in the exact shape `202608050077` produced (`credential_not_erased` from a revoked grant), and asserts the account is retried, bounded, classified and visible — so this requirement is a regression test for a defect that happened, not a description of one that might. Slice 2H.1. Migration: none. Evidence: pgTAP + Deno.

## 5. `2H-SINK` — the error sink (H7)

- **2H-SINK-001:** A server-side error sink exists: a bounded, append-only record of unhandled failures in Server Actions, route handlers, Edge Functions and scheduled jobs, carrying operation, timestamp, a classified reason and a correlation id. Slice 2H.2. Migration: yes. Evidence: pgTAP + unit.
- **2H-SINK-002:** The sink never stores user content, file content, prompts, model output, credentials, tokens or session identifiers. What is recorded is the *shape* of a failure, not its payload. Asserted by an executed probe over the writer, not by review. Slice 2H.2. Migration: same. Evidence: pgTAP + unit.
- **2H-SINK-003:** Writing to the sink can never fail the operation that is already failing. The writer is best-effort and its own failure is swallowed **and counted**, so a broken sink is visible rather than silent — the `producer-with-no-consumer` failure ADR-084 records. Slice 2H.2. Migration: same. Evidence: unit.
- **2H-SINK-004:** The sink is bounded: a declared retention window (§14) enforced by the same unscheduled-sweep mechanism SH.6 established, and **not scheduled by its migration** (ADR-082). Slice 2H.2. Migration: same. Evidence: pgTAP.
- **2H-SINK-005:** The sink has at least one reachable consumer before the phase closes. A producer with no consumer is invisible on both sides (ADR-084); the consumer is the `2H-OPS` operator read, and this requirement fails if that read does not exist. Slice 2H.4. Migration: none. Evidence: integration.

## 6. `2H-DEADMAN` — the cron dead-man switch (H8)

- **2H-DEADMAN-001:** Every scheduled database job (`run_all_heartbeats`, the entry-job drain tick, the job reaper, the `2H-RECOVER` reaper) records its last successful run, so "did this run?" is answerable from data rather than from provider logs. Slice 2H.2. Migration: same as `2H-SINK`. Evidence: pgTAP.
- **2H-DEADMAN-002:** A scheduled job that has not succeeded within a declared multiple of its own interval (§14) is classified **stale**, and staleness is a readable state — the dead-man's switch is the *classification*, not an alert. Slice 2H.2. Migration: same. Evidence: pgTAP.
- **2H-DEADMAN-003:** The switch is proven by an executed negative control: a job whose last success is backdated past its threshold reads stale, and one inside its threshold does not. A probe whose control agrees with its positive has measured nothing (Phase 2G's fourth lesson). Slice 2H.2. Migration: none. Evidence: pgTAP.
- **2H-DEADMAN-004:** The switch covers the **Edge Function deployment parity** gap too: the newest deployable commit per function, as `verify:edge-parity` computes it, is readable beside the liveness state — because the deletion stall was a parity defect that no liveness check would have caught. Slice 2H.4. Migration: none. Evidence: integration.

## 7. `2H-RATE` — distributed rate limiting (C1)

C1 has been the architecture review's only open `Critical` since before Phase 2E, re-raised deliberately at each closeout rather than allowed to age (`SECURITY.md`, `PHASE_2F_PROPOSAL.md:218`).

- **2H-RATE-001:** AI operations and uploads are rate limited per user across processes, in the database, not in application memory. The limiter reuses the mechanism SH.5's per-IP auth throttle established rather than inventing a second one. Slice 2H.3. Migration: yes. Evidence: pgTAP.
- **2H-RATE-002:** The ceilings are declared values (§14), taken as required parameters rather than defaulted in the function body — ADR-080's discipline, restated because a limiter with a silent default is a limiter nobody has agreed to. Slice 2H.3. Migration: same. Evidence: pgTAP.
- **2H-RATE-003:** A refusal is a named, recorded outcome. It emits a product event whose `failureKind` is a **member of both** the database vocabulary and `contracts.ts` — the exact two-validator check ADR-084 exists because of. Slice 2H.3. Migration: same. Evidence: pgTAP + unit.
- **2H-RATE-004:** The limiter is proven under genuine concurrency against a real database, in the shape SH.6's quota proof used (N racers, ceiling M, exactly M admitted) — not by a serial loop. Slice 2H.3. Migration: none. Evidence: executed script.
- **2H-RATE-005:** The limiter is fail-closed. If the limit state cannot be read, the operation is refused, not admitted. Asserted by an executed fault injection. Slice 2H.3. Migration: none. Evidence: pgTAP.
- **2H-RATE-006:** Rate limiting does not become a second spend control. BYOK made the owner not the payer and SH.6 owns the infrastructure quotas; `2H-RATE` bounds *request rate*, and the per-user USD spend ceiling stays withdrawn (ADR-083 §5). Stated as a scope boundary, verified by the absence of a spend column. Slice 2H.3. Migration: none. Evidence: review + census.

## 8. `2H-DEPLOY` — the deployment contract

- **2H-DEPLOY-001:** A deploy runbook exists that a person who did not write the code can execute: ordered steps, the migration-before-code hazard SH.1 recorded, the rollback posture, and what to verify after each step. Slice 2H.5. Migration: none. Evidence: document + executed dry read.
- **2H-DEPLOY-002:** The environment and secret contract is written down and machine-checked: every variable the deployed application and both Edge Functions require, which are `NEXT_PUBLIC_*`-safe, and which must never be (service-role key, heartbeat secret, OpenAI key, BYOK master key). Slice 2H.5. Migration: none. Evidence: unit.
- **2H-DEPLOY-003:** `verify:edge-parity` runs as part of the deploy path, not as a thing someone remembers. A deploy that leaves a function behind its deployable source is a reported failure. Slice 2H.5. Migration: none. Evidence: executed script.
- **2H-DEPLOY-004:** Migration parity between the repository chain and the hosted project is verified and recorded by the same path, so `202608060078`-style drift is detected by a run rather than by a reader. Slice 2H.5. Migration: none. Evidence: executed script.
- **2H-DEPLOY-005:** The hosting platform decision (`M19`/`M20`) is **recorded as a decision with alternatives and consequences**, not assumed from the current provider. Slice 2H.0. Migration: none. Evidence: ADR.
- **2H-DEPLOY-006:** No deployment step in this phase executes a destructive production action. The runbook's destructive steps (retention enablement, purge, signup flip) are marked **owner-only** and carry the authorization each one needs. Slice 2H.5. Migration: none. Evidence: document + guard.
- **2H-DEPLOY-007:** The `process-jobs` staleness is discharged by a **written audit**, per ADR-086: the diff between the deployed `8982d74` and current worker source is read against every migration applied since, and every RPC the worker calls is checked for a signature or grant change — the exact defect class that stalled `delete-account`. The audit produces a recommendation; **it does not deploy**, and the deploy remains a separately authorized owner action. Slice 2H.5. Migration: none. Evidence: written audit citing executed reads.

## 9. `2H-RETENTION` — retention, as a mechanism only

- **2H-RETENTION-001:** The declared retention windows (§14 and the Privacy Policy) have a sweep and a twin for every class, extending SH.6's mechanism to the classes this phase adds (`2H-SINK`, `2H-DEADMAN` history). Slice 2H.5. Migration: yes. Evidence: pgTAP.
- **2H-RETENTION-002:** **No migration in this phase schedules a sweep.** ADR-082 is binding and restated as a requirement so a guard can assert it: scheduling *is* authorization. Slice 2H.5. Migration: same. Evidence: guard over the migration text.
- **2H-RETENTION-003:** The operator scheduling script reports a dry run first and requires an explicit `--enable` flag, reusing `sh6:retention-schedule`'s shape. Enabling remains the owner's authorization of the first live purge, and this PRD does not grant it. Slice 2H.5. Migration: none. Evidence: executed dry run showing 0 eligible or a counted number.
- **2H-RETENTION-004:** A policy claim and an enforced window can never silently diverge: an assertion pins that every window stated to users has a built sweep, and that "not implemented" and "implemented, not scheduled" stay distinguishable in the record. Slice 2H.5. Migration: none. Evidence: unit.

## 10. `2H-BACKUP` — restore, proven rather than assumed

- **2H-BACKUP-001:** The backup posture is written down: what is backed up, by whom, at what frequency, with what retention, and what is **not** covered (storage objects, Edge Function source, hosted Auth configuration). Slice 2H.5. Migration: none. Evidence: document.
- **2H-BACKUP-002:** A restore drill procedure exists that restores into a **disposable** project and verifies row counts and RLS posture after restore — never into production. This satisfies the mechanism half of rollout gate `RG-DEP-3`; **executing the drill remains an owner action** and this phase does not perform it. Slice 2H.5. Migration: none. Evidence: document + script.

## 11. `2H-OPS` — the operator surfaces

Bound by ADR-075: an operator CLI over `service_role` SQL. **No product admin UI, no service-role HTTP endpoint.** This family is the Operations residual Signup Hardening's plan routed here (`BYOK-OPERATIONS-006`'s operator half, `2F-OPERATIONS-002`).

- **2H-OPS-001:** An operator health read exists covering job queue depth and expired leases, scheduled-job liveness (`2H-DEADMAN`), Edge Function parity (`2H-DEPLOY-003`) and error-sink volume by class (`2H-SINK-005`). Slice 2H.4. Migration: yes. Evidence: integration.
- **2H-OPS-002:** An operator account-health read exists covering lifecycle state distribution and **stalled deletions with their reason codes** (`2H-RECOVER-004`) — the read whose absence made the deletion stall take a day to diagnose. Slice 2H.4. Migration: same. Evidence: integration.
- **2H-OPS-003:** Every operator read is read-only and least-privilege: no operator surface introduced by this phase can mutate product state, and each is granted to `service_role` only, with `authenticated` and `anon` refused by executed probe. Slice 2H.4. Migration: same. Evidence: pgTAP grant probes.
- **2H-OPS-004:** No operator read returns user content, file content, credential material or a session identifier. Aggregates and classifications only. Slice 2H.4. Migration: same. Evidence: pgTAP.
- **2H-OPS-005:** Alerting is **defined and deliberately not built** unless the owner selects a destination: this phase produces the readable state and names alerting as the decision it depends on. Recorded as a bounded scope statement so a later reader does not mistake the gap for an oversight. Slice 2H.4. Migration: none. Evidence: recorded decision.

## 12. `2H-CLOSE` — closeout

- **2H-CLOSE-001:** A fail-closed traceability generator writes `docs/reports/phase-2h/PHASE_2H_TRACEABILITY_MATRIX.md` from this PRD's declaration shape and the acceptance records on disk, proving every `2H-*` requirement is delivered-and-cited, partial-and-cited, or undelivered-with-a-reason-and-destination — and failing rather than printing an unresolved claim. Proven in both directions by fixture mutation, per `2G-CLOSE-001`'s pattern. Slice 2H.6. Migration: none. Evidence: unit.
- **2H-CLOSE-002:** The migration budget is reconciled against the chain: five allocated, each spent by the slice it was allocated to, and a sixth `phase_2h` migration is a finding even if every other check passes. Slice 2H.6. Migration: none. Evidence: unit.
- **2H-CLOSE-003:** The final report states what was **not** delivered, with a destination for each, and re-raises every inherited deferral by name (`2E-COMMAND-012`; semantic retrieval and ADR-055's 2026-10-27 expiry; Phase 2G's two partials; ADR-086's `process-jobs` decision if still open). Slice 2H.6. Migration: none. Evidence: document + generator cross-check.
- **2H-CLOSE-004:** The closeout writes nothing to production (ADR-061's posture) and asserts the destructive posture unchanged: signup closed, retention unscheduled, no purge executed. Slice 2H.6. Migration: none. Evidence: executed read-backs.
- **2H-CLOSE-005:** The A13 phase-start guard is re-verified at close: Phase 2I remains unstarted, and the guard's four signals are intact. Slice 2H.6. Migration: none. Evidence: unit.

---

## 13. Preconditions this phase inherits and must re-establish

| Precondition | State at authorization | Who clears it |
| --- | --- | --- |
| All three merge-SHA CI jobs green for `508cf6c` | **NOT met.** `database and journey` ✅, `edge worker` ✅, **`application` cancelled** at `2026-08-06T16:10:47Z` after ~15 min queued with **zero steps executed** — never acquired a runner, never reached `Set up job`, so it tested nothing. Run `31116254874` = `failure`. GitHub Actions runner availability, not a code failure. | A fresh successful run of that job. Timing is an owner decision while the incident continues; re-checked before **any** 2H implementation merge or deployment (ADR-085) |
| Hosted migration parity `202608060078` | current | re-read at 2H.0 |
| `process-jobs` deployed build | stale at `8982d74` | ADR-086 — owner, separately |
| Public signup | closed at both layers | unchanged by this phase |
| Retention sweeps | built, **unscheduled** | owner, and enabling *is* the purge authorization |
| Turnstile CAPTCHA | enforced | unchanged by this phase |
| `BYOK_TEST_USER_A_OPENAI_API_KEY` | not provisioned | owner; blocks Phase 2G's two partials, not this phase |

## 14. Value sheet — the numbers this phase must not invent

Thresholds are listed here so they are argued once, in the open, rather than appearing inside a function body. Each is **proposed** until the owner signs it, following ADR-073's tiered-gate discipline.

### 14.1 Governing for execution — the owner's execution authorization adopts this table as written

**Status change, 2026-08-07.** These six values were proposed and unsigned while the phase was planning-only. The owner's execution authorization directs that *"other Phase 2H thresholds remain governed by the accepted PRD value sheet"* and that no value be silently changed, so the table below is what the slices implement, unchanged, and each consuming slice cites it. This is recorded here rather than assumed, because a threshold that arrives in a function body without a paper trail is exactly what §14 exists to prevent.

Slice 2H.1 consumes the first three. They are passed as **required arguments** with no default anywhere in the signature, so the numbers a running system uses are readable in the operator act that armed it (`scripts/phase-2h-deletion-reaper-schedule.mjs`) rather than buried in DDL.

| Value | Proposed | Consumes |
| --- | --- | --- |
| Stalled-deletion retry threshold | 15 minutes since last attempt | `2H-RECOVER-001` |
| Stalled-deletion attempt ceiling | 5, then terminal `stalled` | `2H-RECOVER-002` |
| Stalled-deletion backoff | exponential, base 2, capped at 6 hours | `2H-RECOVER-002` |
| Error-sink retention window | 90 days | `2H-SINK-004` |
| Scheduled-job staleness multiple | 3× the job's own interval | `2H-DEADMAN-002` |
| Dead-man history retention | 90 days | `2H-RETENTION-001` |

### 14.2 SIGNED — the `2H-RATE` ceilings (gate G-2H.5, owner signature 2026-08-06)

**G-2H.5 is CLEARED for planning.** The signature does **not** authorize implementing, migrating, merging or deploying slice 2H.3. The decision request that produced these values, with the alternatives considered and their consequences, is `docs/reports/phase-2h/PHASE_2H_RATE_LIMIT_DECISION_REQUEST.md`.

| # | Decision | **Signed value** | Consumes |
| --- | --- | --- | --- |
| **V-1** | AI operations ceiling | **60 operations per user per rolling hour** | `2H-RATE-001`, `2H-RATE-002` |
| **V-2** | Upload operations ceiling | **20 accepted upload requests per user per rolling hour** | `2H-RATE-001`, `2H-RATE-002` |
| **V-3** | Window shape | **Rolling window — not a fixed clock-hour window** | `2H-RATE-001` |
| **V-4** | Retries | **Bounded automatic worker retries do NOT consume a new slot; user-initiated retries DO** | `2H-RATE-001` |
| **V-5** | Background jobs | **Yes — provider-reaching background work consumes the owning user's AI slot. However, work already admitted by the drain must not be double-refused by a second admission decision.** | `2H-RATE-001` |
| **V-6** | Exemptions | **None, including the owner** | `2H-RATE-001` |

**Three consequences these values carry into 2H.3, stated here so the slice inherits them rather than rediscovering them:**

- **V-3 forbids the cheap implementation.** A fixed clock-hour counter admits 2× the ceiling across a boundary — 120 AI operations in two minutes at 59 and 01 past. The rolling window is the requirement, not an optimisation.
- **V-5 is two rules, and the second is the hard one.** A background job consumes its owner's slot, *and* the limiter must not refuse work the drain has already admitted (`drain_claims_per_owner_per_tick = 5`). So admission happens **once**, at claim time, not again at provider-call time — otherwise a claimed job dies mid-flight and burns a retry it did not earn.
- **V-6 makes the owner's own account the control's first test subject.** No exemption path may exist to be accidentally widened later; `2H-RATE-004`'s concurrency proof runs against an ordinary account, and a control the owner is exempt from is a control nobody has exercised.

`2H-RATE-004` proves V-1 and V-2 under genuine concurrency with the signed number as `M` (60 racers against 60, 20 against 20 — exactly `M` admitted). `2H-RATE-006` still forbids either ceiling becoming a spend control: under BYOK the user pays, and these bound availability and fairness, not cost.

## 15. Definition of done

The standard contract (`docs/ENGINEERING_STANDARDS.md`), plus: every requirement above delivered-and-cited or undelivered-with-a-destination as `2H-CLOSE-001` proves; the five-migration budget spent exactly as allocated; all three CI jobs green on each slice's exact merge SHA; and the destructive posture — signup closed, retention unscheduled, no purge — unchanged and re-read at close.
