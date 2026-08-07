# Phase 2H — Deploy and Operate — Implementation Plan

- **Status:** APPROVED FOR PLANNING (ADR-085). **No slice below is authorized to merge as an implementation PR or to deploy.**
- **Governs:** `PHASE_2H_PRD.md` (44 declared requirements across nine families).
- **Threat model:** `docs/reports/phase-2h/PHASE_2H_THREAT_MODEL.md` — T-2H-01…T-2H-24 are the per-slice review floor.
- **Traceability:** `docs/reports/phase-2h/PHASE_2H_TRACEABILITY_CONTRACT.md`; the generator itself is `2H-CLOSE-001`, built in 2H.6.

---

## 1. The migration budget — FIVE, allocated and not transferable

| Slice | Allocation | What it buys | Spent |
| --- | --- | --- | --- |
| 2H.0 — gates | **0** | nothing; 2H.0 writes no DDL by construction | — |
| 2H.1 — deletion recovery | **1** | `2H-RECOVER` — the reaper, its state columns, the operator-readable reason projection, the audit hook | not yet |
| 2H.2 — sink and dead-man | **1** | `2H-SINK` + `2H-DEADMAN` — the sink table, the scheduled-job success ledger, both classifications, both unscheduled sweeps | not yet |
| 2H.3 — rate limiting | **1** | `2H-RATE` — the limiter state, the ceiling-parameterised function, the `failureKind` vocabulary widening | not yet |
| 2H.4 — operator surfaces | **1** | `2H-OPS` — the read functions and their `service_role`-only grants | not yet |
| 2H.5 — deploy, retention, backup | **1** | `2H-RETENTION-001/002` sweeps and twins for the classes 2H.2 added | not yet |
| 2H.6 — closeout | **0** | nothing; the closeout writes no DDL (ADR-061) | — |
| **Total** | **5** | | **0 of 5** |

**The rules, restated because a budget that bends is not a budget.**

1. An unspent allocation is **not borrowable** by another slice. If 2H.2 needs two, the work stops and asks the owner — it does not take 2H.4's.
2. Signup Hardening's eight and Phase 2G's one are spent and cannot be reused.
3. Every migration updates `AUTHORIZED_MIGRATION_HEAD` in `egc-invariants.test.ts` **in the same commit**.
4. **No migration in this phase schedules a destructive sweep** (ADR-082, and `2H-RETENTION-002` makes it assertable). Scheduling is authorization; it lives in an operator script.
5. Migrations are append-only. None is applied to the hosted project by this plan; each slice's deployment is a separate, explicitly authorized step gated on §3.

## 2. Slices

Each slice: its own branch, thematic commits, a PR, PR-head CI, and — only under an explicit merge authorization — merge plus **exact merge-SHA CI green on all three jobs**, a preserved branch, and an acceptance record under `docs/reports/phase-2h/` citing every requirement it delivers.

### 2H.0 — Pre-code gates (0 migrations)

Nothing in 2H.1…2H.6 is implemented until every gate here is **executed and green**. This is ADR-073's tiered discipline, and the tier matters: these are *all-implementation* gates, not deployment ones.

| Gate | What it proves | Why it must precede code |
| --- | --- | --- |
| **G-2H.1** — merge-SHA CI for `508cf6c` green ×3 | the baseline this phase builds on is actually verified | ADR-085 makes it a hard precondition; the `application` job is presently **queued** |
| **G-2H.2** — deployment census | what is deployed, at what version, against which migration head, for the app and both Edge Functions | the phase's founding defect was a parity gap nobody measured |
| **G-2H.3** — scheduled-job census | every `pg_cron` entry, its schedule, its last run, read from the catalog at run time | `2H-DEADMAN` cannot cover jobs it does not know exist |
| **G-2H.4** — deletion-stall reproduction | the historical failure reproduced deliberately in a test environment | `2H-RECOVER-006` is a regression test only if the regression is first reproduced |
| **G-2H.5** — owner value signature | §14's thresholds signed, including the two blank rate ceilings | a limiter with an invented ceiling is an invention with a limiter |
| **G-2H.6** — hosting decision recorded | `2H-DEPLOY-005`'s ADR written with alternatives | the runbook cannot be written against an unnamed platform |

G-2H.1 is the only gate this session can neither execute nor waive.

### 2H.1 — Deletion recovery (1 migration)

**Requirements:** `2H-RECOVER-001…006`.
**Why first:** it is the only family in this phase addressing a defect that has already caused user-visible harm, and it is the one the record already committed to (`"Destination: Phase 2H, beside the error sink and dead-man switch. Needs a migration; not taken opportunistically."`).

Order within the slice — deliberately, because the dangerous version of this slice builds the retry before the bound: **(1)** attempt/backoff/terminal-state columns and the bounded classification; **(2)** the reaper that consumes them; **(3)** the operator-readable reason projection; **(4)** the audit hook; **(5)** the reproduction test. A reaper written before its ceiling is a retry loop against the most destructive operation in the product.

**Refused by construction:** the reaper performing deletion itself; any grant on `account_deletion_log`; any path that lets a retry delete what the executor refused to delete.

### 2H.2 — Error sink and cron dead-man switch (1 migration)

**Requirements:** `2H-SINK-001…004`, `2H-DEADMAN-001…003`.
**Why together:** they share one migration honestly — both are append-only observability tables with the same retention shape and the same "record the shape, never the payload" rule. Splitting them would spend two allocations on one design.
`2H-SINK-005` and `2H-DEADMAN-004` land in 2H.4, because a producer's consumer is a different slice's work and claiming it here would be the ADR-084 failure again.

### 2H.3 — Distributed rate limiting (1 migration)

**Requirements:** `2H-RATE-001…006`.
**Blocked on:** G-2H.5's owner-signed ceilings. This slice does not start with a placeholder number.
**Reuses:** SH.5's per-IP throttle mechanism. A second limiter design is a finding, not a choice.
**Proof shape:** SH.6's concurrency proof (N racers, ceiling M, exactly M admitted) against a real database — not a serial loop, which proves only that arithmetic works.

### 2H.4 — Operator surfaces (1 migration)

**Requirements:** `2H-OPS-001…005`, plus `2H-SINK-005` and `2H-DEADMAN-004` — the consumers that make 2H.2's producers visible.
**Bound by ADR-075:** operator CLI over `service_role` SQL. No product admin UI, no service-role HTTP endpoint. A dashboard route in this slice is a scope violation, not a stretch goal.

### 2H.5 — Deploy, retention and backup (1 migration)

**Requirements:** `2H-DEPLOY-001…007`, `2H-RETENTION-001…004`, `2H-BACKUP-001…002`.
**The migration buys only** `2H-RETENTION-001/002` — sweeps and twins for the classes 2H.2 introduced. Everything else in this slice is documents, scripts and assertions.
**`2H-DEPLOY-007` produces the `process-jobs` audit ADR-086 asks for and stops there.** Deploying it is an owner action taken separately; bundling it into this slice's merge is exactly what ADR-086 rejects.
**Nothing here executes:** the restore drill is a written procedure plus a script; retention scheduling is a script requiring `--enable`; the runbook's destructive steps are marked owner-only.

### 2H.6 — Closeout (0 migrations)

**Requirements:** `2H-CLOSE-001…005`. Builds the fail-closed traceability generator and its mutation-proven test, reconciles the budget, writes the final report with every undelivered requirement's destination, re-reads the destructive posture, and re-verifies A13.

## 3. What gates a merge and what gates a deployment

Two different bars, and conflating them is how the deletion defect survived a green repository.

**A merge requires:** the slice's PR-head CI green on all three jobs; the acceptance record written and citing each requirement; the threat-model rows for the slice answered; the budget line reconciled; **and an explicit merge authorization** — green CI is not authorization.

**A deployment additionally requires:** all three jobs green on the **exact merge SHA**; a re-read of hosted parity before and after; `verify:edge-parity` green for every function the slice touches; and, for anything destructive, the specific owner authorization that action needs. ADR-085 makes `508cf6c`'s three-job green a precondition for the first of these in this phase.

## 4. Adversarial review of this plan

| Attack on the plan | Answer |
| --- | --- |
| "The retry loop deletes something the executor refused to" | `2H-RECOVER-003` forbids it structurally — the reaper re-invokes, never deletes — and 2H.1's internal order builds the bound before the loop |
| "The reaper retries forever and hides a permanent failure" | `2H-RECOVER-002`'s ceiling plus the terminal `stalled` classification, and `2H-OPS-002` makes that classification readable |
| "The error sink leaks user content" | `2H-SINK-002` is asserted by an executed probe over the writer, not by review; `2H-OPS-004` repeats the rule at the read side |
| "The dead-man switch passes because it fires on everything" | `2H-DEADMAN-003` requires an executed negative control — the lesson from a probe whose controls agreed with its positives |
| "The sink records failures nobody reads" | `2H-SINK-005` fails if no consumer exists; this is ADR-084's producer-with-no-consumer, made assertable |
| "Rate limiting ships with an invented ceiling" | G-2H.5 blocks 2H.3 until the owner signs, and the two ceilings are deliberately blank in the PRD |
| "The limiter admits traffic when its own state is unreadable" | `2H-RATE-005` is fail-closed and fault-injected |
| "A retention migration quietly schedules a purge" | `2H-RETENTION-002` is a requirement so a guard can assert it over the migration text; ADR-082 is the decision behind it |
| "Operator tooling grows into an admin UI" | ADR-075 binds `2H-OPS`; a route in 2H.4 is a scope violation |
| "The budget grows one migration at a time" | Allocations are per-slice and non-transferable; `2H-CLOSE-002` makes a sixth a finding |
| "`process-jobs` gets deployed as a side effect" | ADR-086 + `2H-DEPLOY-007`: the slice produces an audit, never a deploy |
| "The phase closes claiming a green baseline it never had" | ADR-085 and G-2H.1 make `508cf6c`'s three-job green a precondition, and it is presently **not** met |

## 5. What this plan does not schedule

No slice below opens signup, enables retention, executes a purge, deploys `process-jobs`, configures SMTP, or performs the restore drill. Those are owner actions, they remain recorded in `docs/TODO.md`, and documenting them here is not their completion.
