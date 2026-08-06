# Reports — index and placement rule

Every report this repository has produced lives here, filed under the **phase or
initiative that governed the work**. This file is the map. It is one of only two
markdown files allowed directly in `docs/reports/`; the other is the durable loop
handoff. `src/lib/closeout/reports-taxonomy-guard.test.ts` enforces that in the
`application` CI job.

`docs/STATE.md` remains the authority on what is *currently* true. This index says
where the record of each initiative lives, not what the product does today.

---

## The placement rule

1. **Every new phase or initiative gets its own subdirectory before its first
   report is committed.** Lowercase kebab-case: `phase-2g`, `signup-hardening`,
   `entity-graph`.
2. **Every slice files into the owning phase or initiative directory.** Slices do
   not get directories of their own — the filename already carries the slice, and
   one directory per slice buries a two-file slice three levels down.
3. **Acceptance, deployment, adversarial review, gate and evidence artifacts stay
   with their initiative**, next to the report they support. A deployment
   transcript is not a separate kind of thing; it is that initiative's record.
4. **Nothing new goes in `docs/reports/` itself** unless it is genuinely
   cross-phase — an index over all initiatives, or durable handoff state a fresh
   context must find without knowing any phase name. The allowlist is
   `README.md` and `AUTONOMOUS_LOOP_HANDOFF.md`, and it is small on purpose.
5. **Placement is review-covered.** The guard fails CI with the expected path
   when a report lands at the root, and rejects a directory name that is not
   kebab-case at any depth. It reads the filesystem only — no git history — and
   constrains nothing inside an initiative directory, so no historical tree is
   frozen.

Generators write into these directories too. When a phase adds a traceability
matrix, its generator's output path and its per-slice artifact scan both point at
that phase's directory (`scripts/generate-*-traceability.mjs`).

---

## Where each initiative lives

| Directory | Initiative | Status |
| --- | --- | --- |
| [`phase-2x/`](./phase-2x/) | Phase 2X — asynchronous capture, projections, hotfixes | historical, closed |
| [`phase-2c/`](./phase-2c/) | Phase 2C — candidate confirmation and task materialization | historical, closed |
| [`phase-2d/`](./phase-2d/) | Phase 2D — daily cycle | historical, closed |
| [`pre-2e/`](./pre-2e/) | Pre-2E foundation hardening | historical, closed |
| [`phase-2e/`](./phase-2e/) | Phase 2E — task commands | historical, closed |
| [`phase-2f/`](./phase-2f/) | Phase 2F — operations and cleanup | historical, closed |
| [`phase-2g/`](./phase-2g/) | Phase 2G — Conversational Creation (definition study, threat model, slice evidence) | closed 2026-08-06; 27 delivered, 2 partial with a named blocker |
| [`phase-2h/`](./phase-2h/) | Phase 2H — Deploy and Operate (threat model, traceability contract, slice evidence) | **ACTIVE (PLANNING)** — authorized by ADR-085, 2026-08-06 |
| [`product-ux/`](./product-ux/) | Product UX/UI remediation, including its evidence captures | historical, closed |
| [`entity-graph/`](./entity-graph/) | Entity Graph Completion (EGC) | historical, closed |
| [`byok/`](./byok/) | BYOK — bring your own key | historical, closed and deployed |
| [`signup-hardening/`](./signup-hardening/) | Signup Hardening SH.0–SH.7 | closed 2026-08-05; **public signup remains closed** |
| [`shared/governance/`](./shared/governance/) | Initiative-independent governance material | living |

**The active initiative is Phase 2H — Deploy and Operate** (ADR-085,
2026-08-06), and it is **in planning**: the authorization covers planning
artifacts, research, tests and generators, and explicitly does **not** cover
merging an implementation PR, deploying a migration, enabling retention,
executing a purge, opening signup, or deploying `process-jobs` (ADR-086). Its
governing pair lives in `docs/initiatives/phase-2h/`; its reports file here.
Phase 2G closed on 2026-08-06 and its directory is historical, with two
requirements partial on a single named blocker.

---

## Durable handoff state

[`AUTONOMOUS_LOOP_HANDOFF.md`](./AUTONOMOUS_LOOP_HANDOFF.md) — §1–§32, the
append-only record of every loop boundary through the start of SH.6. It stays at
the reports root because a fresh context must find it without knowing which phase
it belongs to.

[`../../AUTONOMOUS_LOOP_HANDOFF.md`](../../AUTONOMOUS_LOOP_HANDOFF.md) at the
repository root continues the same log from §33. **Read both**: §33 was written
by a loop that did not find the older file and recorded that it "did not exist
before §33". It did. The two files are one log split across two paths, and the
root file now says so.

---

## Directory contents

### `phase-2x/` — Phase 2X

Eighteen slice reports (`PHASE_2X_SLICE_01..18_REPORT.md`), Slice 18's evidence
capture, two hotfix reports (candidate lifecycle, correction conflict), the
projections prework report, two architecture reviews spanning 2X.3–2X.4 and
2X.5–2X.8, and `PHASE_2X_TRACEABILITY_MATRIX.md`.

### `phase-2c/` — Phase 2C

Slice 2C.1 is recorded across seven files (`_RED`, four `_GREEN` stages,
`_DATABASE_GREEN`, `_FINAL_ACCEPTANCE`) because it was driven test-first in
stages; slices 2C.2–2C.6 have one report each. Plus
`PHASE_2C_TRACEABILITY_MATRIX.md`.

### `phase-2d/` — Phase 2D

Six slice reports and `PHASE_2D_TRACEABILITY_MATRIX.md`.

### `pre-2e/` — Pre-2E foundation hardening

`PRE_2E_FOUNDATION_HARDENING_REPORT.md` — the response to
`docs/reviews/ARCHITECTURE_REVIEW_2026_07.md`, executed between Phase 2D and
Phase 2E.

### `phase-2e/` — Phase 2E

Eight slice reports plus Slice 2E.7's design document, the Gate 1 hardening
cutover report, `PHASE_2E_PROGRESS.md`, `PHASE_2E_FINAL_REPORT.md` and
`PHASE_2E_TRACEABILITY_MATRIX.md`.

### `phase-2f/` — Phase 2F

The pre-code material (`PHASE_2F_PROPOSAL_ADVERSARIAL_REVIEW.md`,
`PHASE_2F_PRD_REV3_FINAL_REVIEW.md`, `PHASE_2F_PRE_CODE_GATE_REPORT.md`), then
per-slice plans, PRDs, reports and acceptances for 2F.1–2F.6 — the naming is
asymmetric by history, not by rule, and the generator accepts either an
`_ACCEPTANCE` or a `_REPORT` as a slice's acceptance-bearing artifact. Slice
2F.4 also carries a blast-radius analysis. Closed by `PHASE_2F_REPORT.md` and
`PHASE_2F_TRACEABILITY_MATRIX.md`.

### `phase-2g/` — Phase 2G

`PHASE_2G_DEFINITION.md` — the study of whether the phase should exist, which
declares no requirement and plans no work — then the threat model, the four
slice acceptance records, the online-journey blocker and harness acceptances,
`PHASE_2G_TRACEABILITY_MATRIX.md` and `PHASE_2G_REPORT.md`. Closed 2026-08-06.

### `phase-2h/` — Phase 2H (active, planning)

`PHASE_2H_THREAT_MODEL.md` (T-2H-01…T-2H-24, the per-slice review floor) and
`PHASE_2H_TRACEABILITY_CONTRACT.md`, which **specifies** the fail-closed
generator that `2H-CLOSE-001` builds in slice 2H.6 — deliberately not built
during planning, because a fail-closed generator run against a phase with zero
acceptance records reports every requirement unresolved. The governing pair
(PRD, implementation plan) lives in `docs/initiatives/phase-2h/`. Slice
acceptance records file here as they are produced; there are none yet, and
nothing has been implemented, merged or deployed.

### `product-ux/` — Product UX/UI remediation

`PRODUCT_UX_FINDINGS.md` (35 findings) and `PRODUCT_UX_CLOSEOUT.md`.
`SLICE_G5_REMINDER_INVESTIGATION.md` is this initiative's Slice G5 — the
pre-implementation investigation that stopped at DEC-7 — despite its name not
carrying the `PRODUCT_UX_` prefix. `ux-evidence/` holds the per-slice capture
directories (`baseline`, `slice-a`…`slice-h`); `e2e/online-route-audit.spec.ts`
writes into `ux-evidence/slice-h`.

### `entity-graph/` — Entity Graph Completion

Gate inventories `EGC_G01` (writers), `EGC_G02` (reachability), `EGC_G04`
(locale-ternary baseline) — each of which a closeout test still reads — plus
acceptances for slices 1 and 2, `ENTITY_GRAPH_FINDINGS.md`, `EGC_REPORT.md` and
`EGC_TRACEABILITY_MATRIX.md`.

### `byok/` — BYOK

Gates `G01` (provider census), `G02` (crypto interop), `G03` (master-key
procedure) and `G05_HOSTED_SIGNUP_CLOSURE_EVIDENCE.md` — G-0.5 of
`docs/initiatives/byok/BYOK_IMPLEMENTATION_PLAN.md`, which also gated the start of Entity Graph
Completion. `GENERATED_ACCOUNT_CLEANUP_EVIDENCE.md` is the owner-authorized
follow-on to that gate's §7. Then `BYOK_SECURITY_DEFINITION.md`, acceptances for
slices 1–5, `BYOK_DEPLOYED_ACCEPTANCE.md`, `BYOK_INCIDENT_RUNBOOK.md` (the live
rotation and incident procedure — operational, not historical) and
`BYOK_TRACEABILITY_MATRIX.md`.

Both hosted-signup evidence files sit here rather than under
`signup-hardening/` because BYOK's plan is what commissioned them; they are the
antecedents of Signup Hardening, not part of it.

### `signup-hardening/` — Signup Hardening

Acceptances for SH.0–SH.6 (`SIGNUP_HARDENING_SLICE_00..06_ACCEPTANCE.md`; SH.7's
record is the final report). Governing material:
`SIGNUP_HARDENING_THREAT_MODEL.md`, `SIGNUP_HARDENING_FINDINGS.md`,
`SIGNUP_ROLLOUT_GATE_DEFINITION.md` — the authority `scripts/verify-signup-rollout.mjs`
implements. Deployment and hosted-state evidence:
`SIGNUP_HARDENING_DEPLOYED_ACCEPTANCE.md`,
`SIGNUP_HARDENING_MIGRATION_075_DEPLOYMENT.md`,
`SIGNUP_HARDENING_SH6_DEPLOYMENT.md`,
`SIGNUP_HARDENING_HOSTED_AUTH_READBACK.md`,
`SIGNUP_HARDENING_ORIGIN_VERIFICATION.md`,
`SIGNUP_HARDENING_RETENTION_SCHEDULE.md`. Operational:
`SIGNUP_HARDENING_ADMIN_RUNBOOK.md`, and
`SH_DELETE_015_ORPHAN_MANIFEST.md`, which `scripts/sh-delete-015-remove-orphans.mjs`
parses as its authorization. Closed by `SIGNUP_HARDENING_FINAL_REPORT.md` and
`SIGNUP_HARDENING_TRACEABILITY_MATRIX.md`.

### `shared/governance/`

`SLICE_REPORT_TEMPLATE.md` — the shape a slice report takes. It belongs to no
phase, which is why it is here rather than in the last phase that used it.

---

## One known stale reference, left deliberately

`supabase/migrations/202607250054_pre_2e_rpc_version_retirement.sql:26` cites
`docs/reports/PHASE_2C_TRACEABILITY_MATRIX.md` in a comment. Migrations are
append-only and already applied to a shared environment, so the citation was
**not** rewritten. The file is now at
[`phase-2c/PHASE_2C_TRACEABILITY_MATRIX.md`](./phase-2c/PHASE_2C_TRACEABILITY_MATRIX.md).
