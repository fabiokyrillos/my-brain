# Signup Hardening — implementation plan

Status: **Approved — owner approval 2026-08-04, recorded in `ADR-077` and Amendment `A-1`.**
Drafted 2026-08-02 as Proposed (that history stands). Governs the requirements in
`docs/SIGNUP_HARDENING_PRD.md`, on the evidence in
`docs/reports/SIGNUP_HARDENING_FINDINGS.md` and the threats in
`docs/reports/SIGNUP_HARDENING_THREAT_MODEL.md`. Baseline `main` = `b007ffa`, head
`202608010069`.

Append-only once approved; changes are numbered amendments (`A-1`, `A-2`, …).

---

## 0. Pre-code gates

`ADR-068` was explicit that the earlier mistake was making one external dependency block every
slice. This plan therefore separates three gate tiers, and each gate names which tier it belongs
to. **Learn the BYOK lesson literally:** a CAPTCHA vendor decision blocks only the slice that
integrates CAPTCHA, not the deletion work.

### 0.1 Gates that block ALL implementation

| Gate | What proves it | Owner action? |
| --- | --- | --- |
| **SH-G0.1 — owned-data and storage census complete** | `docs/reports/SIGNUP_HARDENING_FINDINGS.md` merged; the table matrix and storage inventory are its §3/§7 | no (done in this PR) |
| **SH-G0.2 — deletion-cascade drill authored and green in CI** | SH-DELETE-001 pgtap builds a row-complete fixture, deletes `auth.users`, asserts zero residue; green in the `database` job | no |
| **SH-G0.3 — privileged-boundary inventory** | FINDINGS §3–§4 grant/RPC/DEFINER matrix; SH-EXPOSURE-002 census test skeleton | no |
| **SH-G0.4 — quota/retention value sheet owner-signed** | PRD §20 table approved (owner decision recorded as an amendment or ADR) | **yes** |

SH-G0.2 is the load-bearing pre-code gate: it is fail-closed against T-32, and it must be green
before SH.2 designs deletion, because deletion's correctness rests on the cascade actually
completing against a populated account (FINDINGS §3.2 — currently unproven).

### 0.2 Gates that block DEPLOYMENT (a slice may be built and merged behind them; it may not be
executed against the shared environment until they pass)

| Gate | What proves it | Owner action? |
| --- | --- | --- |
| **SH-GD.1 — hosted Auth configuration readback** | `disable_signup` still `true`; `site_url`, `additional_redirect_urls`, `mailer_autoconfirm`, password policy, GoTrue rate limits recorded exactly (SH-SIGNUP-004/005/007, SH-THROTTLE-005) | **yes** (dashboard) |
| **SH-GD.2 — production backup verified restorable** | SH-ROLLOUT-006 restore-to-disposable transcript, before any deletion/purge runs against production | **yes** |
| **SH-GD.3 — disposable-account + fixture strategy** | the deletion/suspension journeys name their disposable-account provisioning (admin-created until signup opens) and cleanup, the BYOK C11 pattern | **yes** (provision accounts) |
| **SH-GD.4 — hosting/SMTP decision recorded** | not *built* (that is Phase 2H) but the decision and its owner recorded, so slices know whether email-confirmation journeys can run | **yes** |

### 0.3 Gates that block PUBLIC SIGNUP only (the rollout gate; nothing in the initiative waits on
these)

The full list is `docs/reports/SIGNUP_ROLLOUT_GATE_DEFINITION.md`. It is generated and fail-closed
(SH-ROLLOUT-001/002). No slice is blocked by it — it is the *output* the initiative produces.

### 0.4 Vendor / owner decisions required up front

| Decision | Tier it gates | Recommended |
| --- | --- | --- |
| CAPTCHA provider | SH.5 only | Cloudflare Turnstile (GoTrue-native, privacy-friendly) — ADR-076 |
| Admin boundary shape | SH.3 only | operator CLI, no product admin UI, no service-role HTTP — ADR-075 |
| Deletion executor location | SH.2 only | Edge Function, self-only, not `src/` — ADR-074 |
| Quota/retention values | SH.6 only | PRD §20 defaults — SH-G0.4 |
| Hosting platform + SMTP | rollout only (Phase 2H) | recorded, not chosen here |

---

## 1. Migration budget

**Proposed budget: eight migrations**, allocated below. This is an estimate for owner approval,
not a licence; a slice that needs more than its allocation stops and asks (the BYOK.1 discipline),
and any increase is an owner ADR plus an append-only amendment here and in the PRD. Every migration
updates `AUTHORIZED_MIGRATION_HEAD` in `src/lib/closeout/egc-invariants.test.ts` in the same
commit.

| Slice | Migrations | Content |
| --- | --- | --- |
| SH.0 | 0 | census, drill (drill is a pgtap test, not a migration), gates |
| SH.1 | 2 | `account_lifecycle` table + RLS + grants + `handle_new_user` change + backfill; lifecycle predicate wiring into capture/claim/heartbeat RPCs (a second migration because it `create or replace`s several existing functions and the count is honest about that) |
| SH.2 | 1 | `account_deletion_log` + the deletion-start lifecycle transition surface |
| SH.3 | 1 | admin transition functions (`suspend_account`, `reactivate_account`, `begin_account_deletion_admin`) + suspension worker/heartbeat predicate finalization |
| SH.4 | 1 | `policy_acceptances` + validated acceptance write path |
| SH.5 | 1 | `auth_event_attempts` + throttle claim/finalize + prune |
| SH.6 | 2 | quotas (capture/jobs/storage predicates); retention sweeps + `service_role` revokes + `handle_new_user` revoke + `audit_logs` disposition |
| SH.7 | 0 | traceability, rollout script, re-census (read-only) |

**Migration-content changes get an ADR even when the count does not** (the ADR-071 precedent):
SH.1's wiring migration replaces existing capture and claim functions, and that is recorded, not
folded into "the lifecycle table".

## 2. What this plan explicitly does not do

- It does not open signup, flip `disable_signup`, or build the rollout flip (SH-ROLLOUT-005 is
  post-initiative).
- It does not build an operator dashboard, alerting, or credential-health view — that is the
  Operations initiative (§8).
- It does not select a hosting platform or build a deploy pipeline (Phase 2H).
- It does not deliver professional legal review (a labeled owner gate).
- It does not scan uploads for malware or add an isolation worker (recorded open item,
  SH-STORAGE-006).
- It does not change BYOK; it revokes a `service_role` grant BYOK left (SH-EXPOSURE-001) and
  consumes BYOK's residue-verifier pattern.

## 3. Slice sequence

Each slice: exact scope, requirements, migrations, code surfaces, tests, adversarial review,
docs, deployment needs, stop conditions, PR/CI boundary. Slices are ordered so each is
independently reviewable and no slice depends on a later one. **Deletion, suspension and rollout
never share a PR.**

> **The planning PR is not SH.0.** This document, the PRD, the findings, the threat model, the
> rollout-gate skeleton and ADR-073…ADR-076 ship in a **documentation-only** planning PR that
> contains no product code, no migration, and no executable test — so "implementation has not
> started" stays literally true. SH.0 below is the **first implementation slice**, executed only
> after the owner approves the package.

### SH.0 — Census, contracts, pre-code gates (no migration)

- **Scope:** the cascade drill (SH-DELETE-001) as a CI pgtap; the grant-matrix census skeleton
  (SH-EXPOSURE-002); the owner-signed quota/retention value sheet recorded as a PRD amendment;
  confirming the CAPTCHA/admin/executor ADRs to *Accepted*; the retention schedule
  (SH-RETENTION-001) and storage no-scan posture (SH-STORAGE-006) as owner-accepted decisions.
- **Requirements:** SH-DELETE-001, SH-CAPTCHA-001, SH-RETENTION-001, SH-STORAGE-006,
  SH-ROLLOUT-001 (skeleton), SH-G0.* gates.
- **Migrations:** 0 (the drill and census are pgtap tests over existing schema, not migrations).
- **Tests:** the drill and census-skeleton run in the CI `database` job on fixtures; they turn red
  the moment a later slice adds an uncovered user-owned table.
- **The drill may fail, and that is a finding, not a defeat.** If SH-DELETE-001 shows the bulk
  `delete from auth.users` **blocks** on one of the 43 composite `NO ACTION` FKs (FINDINGS §3.2,
  an unverified risk), SH.0 stops and records it: the remediation is an owner-approved migration
  converting the offending FKs to `on delete cascade`, which is **not** in the §1 budget and is a
  budget amendment (`A-n`), not a silent spend. The drill existing and being honest about a block
  is the whole point of making it the all-implementation gate.
- **Stop conditions:** SH-G0.4 (owner sign-off on the value sheet) and SH-GD.2 (backup
  verification) are owner actions.
- **PR/CI boundary:** one implementation PR, three jobs green, merge-SHA green, branch preserved —
  the standing discipline. This is where implementation begins; the planning PR before it begins
  nothing.

### SH.1 — Account lifecycle foundation

- **Scope:** `account_lifecycle`; the `handle_new_user` seed + backfill; the lifecycle predicate
  wired into `capture_entry_async`, `enqueue_entry_reprocessing`, all three claim functions,
  `run_user_heartbeat`; the app-shell server-side status read and the non-active state surface;
  server-side action refusal.
- **Requirements:** SH-LIFECYCLE-001…010, SH-WORKER-003, SH-EXPOSURE-004 (the `handle_new_user`
  revoke rides with the function change), SH-COPY-001.
- **Migrations:** 2 (§1). Both carry the DEFINER catalog assertions (SH-EXPOSURE-008).
- **Tests:** pgtap on the table, grants, transitions, and every wired predicate; unit on the
  app-shell read and direct action refusal; a SQL-reachability test that the predicate is
  identical across the three claim paths (SH-WORKER-003) — the pattern that guards command
  surfaces today.
- **Adversarial review floor:** suspension-bypass via direct RPC (T-11); the claim-path asymmetry
  (the credential predicate is on the drain but not the direct claim — the lifecycle predicate
  must be on both); backfill leaving a user stateless.
- **Deployment:** the migrations apply behind SH-GD.1; the state surface is testable in CI
  offline.
- **Stop conditions:** none owner-only; fully buildable and CI-provable. Deployment waits on
  SH-GD.1 readback.
- **PR/CI boundary:** one PR; three jobs green; merge-SHA green; branch preserved.

### SH.2 — Account deletion and zero-residue cleanup

- **Scope:** the deletion request surface (re-auth + typed confirmation); the `deleting`
  transition; the Edge Function executor (resumable, self-only, storage enumeration, stop-on-
  unknown); `account_deletion_log`; the whole-account residue verifier (extending
  `byok_residue.sql`); the storage-orphan scanner; the six-orphan classification procedure and
  manifest; the deletion-capability guard.
- **Requirements:** SH-DELETE-002…016, SH-STORAGE-001/003, SH-WORKER-002, SH-COPY-003,
  SH-OPERATIONS-006.
- **Migrations:** 1.
- **Tests:** deno for the executor (self-only, crash-resume, stop-on-unknown, two-user storage
  collision); pgtap for the deletion transition, the log's append-only posture, the residue
  verifier's calibration and negative control; unit for the guard and receipt; the residue verifier
  enters CI permanently (SH-OPERATIONS-006).
- **Adversarial review floor:** delete-another-user (T-01), storage of another user (T-07),
  job-claim during deletion (T-04), partial-deletion zombie (T-08), name-heuristic deletion (T-09),
  future-table escape (T-32).
- **Deployment:** the executor deploys as a new Edge Function; the end-to-end journey
  (SH-DELETE-012) and the six-orphan deletion (SH-DELETE-015) run against the deployment behind
  SH-GD.2 (backup verified) and SH-GD.3 (disposable accounts). The six-orphan deletion is `IRR` +
  `O` — owner-authorized, executed once, manifest recorded first.
- **Stop conditions:** SH-DELETE-015's actual deletion of the six orphans is an owner-authorized,
  irreversible step performed only after the manifest is recorded — a true stop, like BYOK's owner
  cutover. The code, scanner, manifest procedure and journey are built and merged before stopping.
- **PR/CI boundary:** one PR (deletion only — no suspension, no rollout).

### SH.3 — Suspension and the administrative boundary

- **Scope:** the admin transition functions; the operator CLI; the provider-side ban runbook step;
  the suspended surface; suspension's effect on jobs, heartbeat, reminders; the worker
  re-verification of lifecycle at reload; the three-vocabulary distinction.
- **Requirements:** SH-SUSPEND-001…009, SH-ADMIN-001…006, SH-WORKER-001/004/005, SH-COPY-002.
- **Migrations:** 1.
- **Tests:** pgtap on the admin functions' grants (non-vacuous), the suspend/reactivate audit, the
  no-data-change census, the job-stays-queued behavior; deno on the handler re-verification; unit
  on the CLI (dry-run default, readback, no content printed) and the three-vocabulary distinction;
  e2e on the suspended surface.
- **Adversarial review floor:** over-broad service-role endpoint (T-10), suspension bypass via
  direct call (T-11), admin-without-audit (T-12), suspended work still running (T-13).
- **Deployment:** SH-WORKER-004/005 execute against the deployment (suspend a disposable account
  with a queued job, observe skip across ticks, reactivate, observe completion) behind SH-GD.3.
- **Stop conditions:** SH-ADMIN-005 (provider-side sign-in ban) is an owner/operator step with the
  admin API key — recorded runbook command, not automated. The rest is fully built.
- **PR/CI boundary:** one PR (suspension + admin only).

### SH.4 — Terms, Privacy, and versioned consent

- **Scope:** the two draft documents in both locales; the public legal routes; the version
  constants; `policy_acceptances`; the validated acceptance write; the signup consent control; the
  first-session / version-bump interposition; the decline path; the policy-text-to-retention pin.
- **Requirements:** SH-LEGAL-001…014, SH-COPY-001.
- **Migrations:** 1.
- **Tests:** pgtap on `policy_acceptances` (append-only, stale-version refusal); unit on the
  version constant single-source, the server-side consent refusal, the interposition gate reading
  the table not a cookie, the version-bump re-interposition, the policy-text/retention pin; e2e on
  the routes and consent control; accessibility/locale gates.
- **Adversarial review floor:** version drift (T-28), browser-only consent (T-29), version change
  without re-acceptance (T-30), retention-copy falsehood (T-31).
- **Deployment:** offline-testable; no owner action except supplying operator-identity and
  governing-law placeholders (SH-LEGAL-002/003) and, at rollout, removing the "needs legal review"
  banner (SH-LEGAL-013).
- **Stop conditions:** owner values for the placeholders — recorded, not blocking the mechanism.
- **PR/CI boundary:** one PR.

### SH.5 — Signup, confirmation, recovery, CAPTCHA, throttling

- **Scope:** the app-level signup gate; `signup_disabled` copy; the origin-not-header fix; the
  hosted readbacks (redirect allowlist, confirmation, password policy, GoTrue limits); the
  confirmation-resend surface; enumeration-uniform responses; `auth_event_attempts` + throttle
  claim/finalize/prune; CAPTCHA integration behind provider enforcement; the callback allowlist
  guard-of-the-guard; session-fixation pins; disposable-email posture.
- **Requirements:** SH-SIGNUP-001…013, SH-CAPTCHA-002…005, SH-THROTTLE-001…007, SH-COPY-004/005.
- **Migrations:** 1.
- **Tests:** pgtap on the throttle table (shapes), ceilings under genuine concurrency, retention,
  the lockout matrix, the no-plaintext-of-nonexistent rule; unit on the gate, the origin fix,
  enumeration uniformity, the CAPTCHA copy, `safeAuthNext`, session freshness; e2e on the forms;
  deployed scripts for CAPTCHA enforcement (missing/invalid token) and the throttle concurrency,
  and readbacks for the hosted config.
- **Adversarial review floor:** flood (T-14), email bomb (T-15), recovery abuse (T-16),
  enumeration (T-17), CAPTCHA bypass (T-18), fixation (T-19), open redirect (T-20), throttle race
  (T-21).
- **Deployment:** the hosted readbacks and the CAPTCHA/throttle deployed probes run behind SH-GD.1
  and SH-GD.3. CAPTCHA enforcement is a hosted setting the owner enables; the app carries the
  widget and passes the token.
- **Stop conditions:** hosted config changes (CAPTCHA on, password policy, redirect allowlist) are
  owner dashboard actions with exact recorded steps and readbacks — true stops for the *hosted*
  half; the app half is built and merged first.
- **PR/CI boundary:** one PR. (Large; may split into SH.5a signup/recovery/gate and SH.5b
  CAPTCHA/throttle if review load demands — decided at plan time against the diff, not blindly.)

### SH.6 — Quotas, retention, exposure closures

- **Scope:** entry/job/concurrency/storage/attachment quotas; the single-source size/MIME
  constants; the AI input bounds; the `process-jobs` body bound; the retention sweeps with
  dry-runs and boundary tests; the `service_role` revokes on the BYOK tables; the full grant-matrix
  census; the `audit_logs` direct-write disposition; the `handle_new_user` revoke (if not already
  in SH.1); the proxy fail-open bounding; the `heartbeat` disposition; the signed-URL constant.
- **Requirements:** SH-QUOTA-001…010, SH-RETENTION-002…010, SH-EXPOSURE-001/002/003/005/006,
  SH-STORAGE-004, SH-COPY-004/006.
- **Migrations:** 2.
- **Tests:** pgtap on every quota predicate (including two-user drain fairness) and every sweep
  (scheduler-only, bounded, boundary-exact, non-vacuous revoke probes); deno on the `process-jobs`
  bound; unit on the constants single-source, the AI bounds, the proxy behavior, the copy pins.
- **Adversarial review floor:** quota race (T-21), multi-account (T-22), storage exhaustion (T-23),
  oversized upload (T-24), RPC over-exposure (T-25), service_role ciphertext read (T-26), Edge
  flood (T-27), retention-copy contradiction (T-31).
- **Deployment:** the retention dry-runs record their transcripts before the first live sweep
  against production (SH-RETENTION-008, `IRR`+`S`, behind SH-GD.2); the `service_role` revoke and
  the `heartbeat` disposition are readback-verified against the deployment.
- **Stop conditions:** first live production purges are owner-authorized after dry-run transcripts
  — the ADR-057 dry-run discipline.
- **PR/CI boundary:** one PR (may split retention from quotas if the diff warrants).

### SH.7 — Rollout gates and convergence

- **Scope:** the rollout gate definition (final); the gate-verification script; the synthetic
  end-to-end journey; the traceability generator; the post-initiative re-census
  (SH-EXPOSURE-007); the final report; the storage-scanner-in-rollout wiring.
- **Requirements:** SH-ROLLOUT-002/003/004, SH-OPERATIONS-001/005, SH-EXPOSURE-007,
  SH-STORAGE-002/005.
- **Migrations:** 0.
- **Tests:** the gate script's own tests (each gate fails closed on a missing artifact); the
  traceability generator regenerates content-identically and fails on drift; the re-census matches
  the declared delta; the doc/script gate-list parity test (SH-ROLLOUT-004).
- **Adversarial review floor:** gate-on-docs-not-config (T-33), open-before-monitoring (T-34),
  future-table escape re-checked (T-32).
- **Deployment:** the synthetic journey and the readback gates run against the deployment behind
  SH-GD.1/2/3.
- **Stop conditions:** the initiative closes here; **opening signup (SH-ROLLOUT-005) is
  post-initiative and owner-only** — the gate script must be green in one run, then the owner
  flips, then it re-runs green.
- **PR/CI boundary:** one PR.

## 4. Standing discipline (unchanged from BYOK/EGC)

Own branch per slice; thematic commits; PR-head CI green on all three jobs; exact merge-SHA CI
green; preserved branch; acceptance report; per-slice adversarial review with findings fixed or
recorded. pgTAP is the highest-risk artifact (Docker unavailable locally) — scrutinize it
statically and hard before pushing, the BYOK lesson.

## 5. Test strategy specifics

- **CI-visible vs. credential-gated.** The cascade drill, residue verifier, grant-matrix census,
  throttle/quota concurrency and all pgtap run in the CI `database` job. The credential-free e2e
  home for consent-control and legal-route assertions is `e2e/foundation.spec.ts` (which already
  asserts "signup and reset forms expose the complete validated fields"). Every authenticated
  journey (deletion, suspension, CAPTCHA, hosted readbacks) is credential-gated and manual — its
  transcript is the acceptance evidence, and the plan says so per requirement (`S` flag).
- **Non-vacuous negative controls everywhere.** The EGC/BYOK rule: prove the scanner sees rows
  before deletion; prove a second account survives; prove a grant existed before it is revoked.
- **Genuine concurrency, not sequential calls described as concurrent** — the BYOK C10 standard for
  every ceiling.

## 6. Rollout register (the gate content, summarized; the authority is
`docs/reports/SIGNUP_ROLLOUT_GATE_DEFINITION.md`)

BYOK closed and green; no project-key fallback; account deletion executed with zero residue
including storage; suspension and reactivation executed; worker suspension enforcement executed;
Terms and Privacy present and versioned; consent enforced server-side; email confirmation active;
CAPTCHA active (provider-enforced); signup and recovery throttling active; infrastructure quotas
active; PostgREST exposure review recorded; Edge Function auth review recorded; redirect
configuration verified by readback; production SMTP and domain ready; backup/restore verified;
monitoring and incident handling adequate (owner-signed); production smoke green; the synthetic
signup→delete journey leaves zero residue.

## 7. Retention schedule (SH-RETENTION-001 — owner-accepted before SH.6)

| Class | Rule | Mechanism | Why |
| --- | --- | --- | --- |
| `jobs` (terminal) | 90 d | scheduler-only sweep | Jobs page history window |
| `notifications` | 180 d | scheduler-only sweep | product history |
| `product_events` | 180 d | scheduler-only sweep | the documented promise |
| `heartbeat_runs` | 30 d | scheduler-only sweep | telemetry only |
| `undo_operations` | 30 d past expiry | scheduler-only sweep | expiry is 24 h |
| `auth_event_attempts` | 30 d | scheduler-only sweep | abuse evidence, bounded |
| `credential_validation_attempts` | 30 d (exists) | existing BYOK sweep | unchanged |
| `audit_logs` | retained | none | audit integrity |
| `ai_usage_events` | retained | none | billing reconciliation |
| interpretation versions | retained | none | immutable product history |

Each swept class ships a dry-run (SH-RETENTION-008) recorded before the first production run.

## 8. BYOK-OPERATIONS and the Phase 2H boundary

`BYOK-OPERATIONS` carries six requirements recorded as **not built** — an operator dashboard,
alerting, and an admin view of credential health. The census confirms none exists, and
`2F-OPERATIONS-002` recorded the same gap before BYOK. The question `ADR-068` implies but does not
answer is where these belong. Recommendation, per requirement, with reasoning:

| BYOK-OPERATIONS req | Destination | Reasoning |
| --- | --- | --- |
| -001 isolation matrix executed | **done** (BYOK close) | already executed 2026-08-02; not a residual |
| -002 residue verifier in closeout | **done** (BYOK close) | `byok_residue.sql` runs in CI |
| -003 incident/rotation runbook | **done** (BYOK close) | committed, "written not drilled"; production rotation is a separate owner action |
| -004 traceability generator | **done** (BYOK close) | `BYOK_TRACEABILITY_MATRIX.md` |
| -005 SECURITY.md records the boundary | **done** (BYOK close) | recorded |
| -006 rollout gates as a checklist | **partially inherited by Signup Hardening** | BYOK's §19 rollout table is the seed of `SIGNUP_ROLLOUT_GATE_DEFINITION.md`; the *operator-surface* half (a dashboard/alerting to watch those gates live) is **not** Signup Hardening |

The genuine unbuilt residual is **operator tooling** — a dashboard, alerting, credential-health and
account-health views, and the production master-key rotation execution. Recommendation:

- **It does not belong in Signup Hardening.** Signup Hardening builds the administrative *boundary*
  (suspension, deletion, audit, the operator CLI) — the capability. A dashboard to *watch* that
  boundary is a different concern, and absorbing it here would repeat exactly the "operator
  dashboard nearby, so fold it in" mistake `ADR-068` warns against. The prompt's own instruction is
  explicit: do not silently absorb an operator dashboard.
- **It belongs to a dedicated Operations initiative aligned with Phase 2H — Deploy and Operate.**
  Phase 2H already owns distributed rate limiting, error sink, cron dead-man, deploy runbook and
  backup (per `PHASE_2G_DEFINITION.md`); operator surfaces sit naturally beside them, and they
  presuppose a hosting platform Phase 2H selects.
- **Roadmap ordering, explicit:** Signup Hardening → Phase 2G (Conversational Creation) → Phase 2H
  (Deploy and Operate, which absorbs the Operations/operator-surface residual) → open self-service
  signup. The production master-key rotation execution is an owner action that can happen whenever
  the owner chooses; it is not sequenced by these phases and is tracked in `TODO.md` as a standing
  owner item.

## 9. Adversarial planning review (run before opening this PR)

The threat model's T-01…T-35 are the per-slice review floor. Beyond them, this plan was attacked on
the planning failure modes the prompt names; each is answered here.

| Attack on the plan | Answer |
| --- | --- |
| Deletion as a single-cascade assumption | SH-DELETE-001 drill proves the cascade against a *row-complete* account before SH.2 designs deletion; SH.0 gate SH-G0.2 blocks all implementation until it is green |
| An unknown table added after the census | SH-DELETE-001/011 enumerate from the catalog at run time; a new table fails the drill by name (T-32) |
| A storage object without owner metadata | object keys are `<uid>/…` by construction; the scanner classifies by prefix-vs-`auth.users` and path-vs-`attachments`, not by metadata a blob may lack (SH-STORAGE-001) |
| Deleting the wrong user's object | SH-DELETE-006/016 exact-prefix match + cross-owner reference check + colliding-name negative control |
| Worker claim during deletion | SH-LIFECYCLE-006 puts the predicate on *both* claim paths; SH-WORKER-002 (T-04) |
| Suspended user invoking Edge Functions directly | SH-LIFECYCLE-005/006 + SH-WORKER-001 put the refusal in the DB and the handler; tested by direct calls (T-11) |
| Generic service-role route exposed to users | SH-ADMIN-001/003: admin is `service_role` SQL + operator CLI, no HTTP route, pinned (T-10) |
| Rate limits that race | every ceiling is DB-enforced under advisory locks with a genuine-concurrency test; no process counters exist to race (T-21) |
| CAPTCHA only in the UI | SH-CAPTCHA-002 provider-enforced, proven with a raw missing-token call (T-18) |
| Legal acceptance in browser state | SH-LEGAL-008/011: server-side `policy_acceptances` row is the record (T-29) |
| Consent version changed without re-acceptance | SH-LEGAL-009 re-interposition on constant bump (T-30) |
| Rollout gate on docs not config | SH-ROLLOUT-001/002/005: absent artifact = failure; script executes readbacks; no manual-confidence path (T-33) |
| Signup opened before monitoring | SH-ROLLOUT-004/006 enumerate monitoring and backup as gates (T-34) |
| Retention copy promising deletion while audit data stays identifiable | SH-DELETE-009 de-identifies the log; SH-LEGAL-014 pins policy text to the residue verifier's enumerated set (T-31) |

Findings from this review are already folded into the requirements above; none was argued down.

## 10. Amendments

Numbered `A-1`, `A-2`, …, append-only.

### A-1 — Owner approval; SH-G0.4 satisfied; implementation begins at SH.0 (2026-08-04)

`ADR-077` records the owner's approval of this plan, the PRD, the supporting reports,
ADR-073…ADR-076 (now Accepted), the §1 eight-migration budget, the SH.0–SH.7 sequence, the
PRD §20 value sheet as proposed, the §7 retention schedule as proposed, the ADR-074/075/076
architecture decisions, the v1 no-malware-scanner posture, and the Phase 2H destination for
the operator surfaces. Consequences for this plan:

- **SH-G0.4 is satisfied.** The remaining §0.1 all-implementation gates (SH-G0.2 drill
  green in CI, SH-G0.3 census skeleton) are SH.0 deliverables proven by the CI `database`
  job on SH.0's own PR.
- **The §0.2 deployment gates (SH-GD.1…SH-GD.4) remain open owner actions** — they block
  shared-environment execution at each slice's point of use, never repository work.
- Public signup stays disabled throughout; SH-ROLLOUT-005 stays post-initiative and
  owner-only, gated by one successful fail-closed rollout-gate run.
- Approval of the retention schedule is not authorization for any production purge; the
  six 2026-07-16 orphaned storage objects still require manifest-then-owner-authorization
  (SH-DELETE-015).
