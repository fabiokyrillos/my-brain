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
| [`phase-2h/`](./phase-2h/) | Phase 2H — Deploy and Operate (threat model, traceability contract, slice evidence) | **COMPLETE** 2026-08-07 — 44 declared · 44 delivered; hosted parity `202608070083` |
| [`post-2h-rollout/`](./post-2h-rollout/) | Post-2H rollout readiness — backup, SMTP, monitoring adequacy and legal packets | **NOT a phase.** Bounded owner-authorized effort, 2026-08-07; migration `202608070084` deployed |
| [`phase-2i/`](./phase-2i/) | Phase 2I — Foundation and Findability (current-experience audit, threat model, traceability contract, gaps, eight slice acceptances, closing report) | **COMPLETE** 2026-08-07 — 61 declared · 61 classified · 0 undelivered; `1 allocated · 0 spent`; hosted parity unchanged at `202608070084` |
| [`phase-2j/`](./phase-2j/) | Phase 2J — Today, Capture and Attention (audit, threat model, traceability contract, gaps, eight slice acceptances, matrix, closing report, deployment record) | **COMPLETE** 2026-08-08 — 74 declared · 74 classified · 0 unclassified; `2 allocated · 2 spent` (unchanged); **DEPLOYED, hosted parity `202608080087`**. The deployment probe found the declared telemetry events refused by an un-widened third vocabulary copy; the post-2J correction `202608080087` removed that duplication the same day and telemetry is proved live producer → consumer |
| [`phase-2k/`](./phase-2k/) | Phase 2K — Conversar as the primary interface (current-experience audit, gaps, threat model, traceability contract, slice acceptances) | **CONCLUDED** — planning authorized by ADR-097 (2026-08-08), **implementation authorized through closeout by ADR-101 (2026-08-09)**, which also signed the last two open decisions (OD-2K-1, OD-2K-4). **79** requirements across eleven families — **not the 68 this line and four other documents stated**; the undercount was `2K-A11Y`, whose family name contains digits. 79 declared · 79 classified · 0 unclassified — **66 built, 9 baseline, 4 partial** since 2026-08-11 (**it read 67/9/3 from the phase's close until then**). **CONCLUDED 2026-08-09, after an extraordinary post-phase correction** — slices 2K.0–2K.6 and 2K.8 executed and merged; 2K.7 is not implemented, by rule. `1 allocated · 1 spent`, **not retroactively reclassified**. **The phase reached closeout with its telemetry INERT on the deployed project**; the owner then authorized one exclusively corrective migration, **`202608090089`, outside this phase's budget and charged to no phase**, which deletes the hardcoded surface copy in `private.record_product_event`. Hosted telemetry proved operational producer → writer → RLS-scoped **aggregation**, **13/13**, with zero residue. Matrix and closing report written from executed evidence. **SECOND CORRECTION, 2026-08-11 (§7b of the report, §9 of the deployment record):** Phase 2M found that this phase's **declared consumer** could never have executed — it read `product_events.occurred_at`, a column that has never existed, and authenticated through a grant Turnstile has refused since SH.5 — so the 13/13 proof reached the aggregation through a query written for the occasion. `2K-METRICS-007` moved **`built` → `partial`**; the repair belongs to Phase 2M and **no historical execution is claimed** |
| [`phase-2l/`](./phase-2l/) | Phase 2L — Work and execution (audit, gaps, threat model, traceability contract, six slice acceptance records, the traceability matrix, the closing report and the successor re-audit) | **COMPLETE** (2026-08-09) — planning by ADR-102, implementation through closeout by ADR-103, which signed all five owner decisions. **82 requirements declared, 82 classified: 73 built, 5 baseline, 3 partial, 1 not-built-by-rule, 0 undelivered** — after a post-closeout correction (2026-08-09) that reclassified `2L-BULK-011` and `2L-CLOSE-004` from `partial` **from evidence**: a missing proof was executed and a live read-only `migration list --linked` was taken. The generator now refuses a `partial` whose remainder is vacuous. **Migration budget `1 allocated · 0 spent`** — the allocation lapsed under OD-2L-2 A, so no migration exists, **no deployment record was created** and there is no G8. Hosted parity unmoved at `202608090089`; signup closed; no new RPC, write path, grant, policy, telemetry event name or gesture. Three partials each name a remainder and a destination; `2L-MOBILE-008` and `2L-ACCESS-008` are reported **NOT EXECUTED** and need owner-run hardware, and `2L-METRICS-005` needs a migration the successor must spend before its producers exist. The successor is re-audited and **stopped for owner authorization**: no successor artifact, no successor requirement, and A13 is not retargeted here |
| [`phase-2m/`](./phase-2m/) | Phase 2M — Calendar, daily planning and notifications (current-experience audit, UX gaps, threat model, traceability contract) | **IMPLEMENTATION AUTHORIZED THROUGH CLOSEOUT** (2026-08-11, ADR-105; planning by ADR-104), which signed all seven owner decisions — **OD-2M-1 A** (calendar renders tasks and reminders, both protected by derived sensitivity), **OD-2M-2** (one vocabulary migration before any producer, `calendar` as its own surface), **OD-2M-3 A** (`planned_at` is an intention), **OD-2M-4 B** (push, opt-in, **content-free** — the first egress of user-linked data in this product), **OD-2M-5** (owner-run hardware proof, **blocks closeout**), **OD-2M-6 A** (visible controls only), **OD-2M-7** (recurrence out, own initiative, closing `not-built-by-rule`). 94 requirements, thirteen families, six slices. Migration budget **2 allocated · 0 spent, NON-TRANSFERABLE**. Baseline `62753ce` — **the baseline moved during owner review (PR #166) and every audit negative was re-executed**. The audit's seven findings stand: `planned_at` is read by nothing; **a service worker exists and is registered in production**, so the predecessor's "no service worker" is wrong and the push-absence guard cannot see `public/sw.js`; five schedule preferences are inert; no event entity exists and the calendar does not need one; reminder sensitivity is derivable through `reminders.entry_id`; telemetry has five enforcement points; and two implementations of the user's local day exist. Slices 2M.0 and 2M.1 are complete; migration 1 is deployed and hosted parity is `202608110090`. Budget **2 allocated · 1 spent** |
| [`product-ux/`](./product-ux/) | Product UX/UI remediation, including its evidence captures | historical, closed |
| [`entity-graph/`](./entity-graph/) | Entity Graph Completion (EGC) | historical, closed |
| [`byok/`](./byok/) | BYOK — bring your own key | historical, closed and deployed |
| [`signup-hardening/`](./signup-hardening/) | Signup Hardening SH.0–SH.7 | closed 2026-08-05; **public signup remains closed** |
| [`shared/governance/`](./shared/governance/) | Initiative-independent governance material | living |

**The active initiative is Phase 2M — Calendar, daily planning and
notifications.** Planning was authorized by ADR-104 (2026-08-09) and
**implementation through closeout by ADR-105** (2026-08-11), which signed all
seven owner decisions. Its governing pair lives in
`docs/initiatives/phase-2m/`; its evidence files here. **Two migrations are
authorized and non-transferable**; **the first is spent and deployed** —
`202608110090`, the daily-cycle telemetry vocabulary and the `calendar` surface,
applied 2026-08-11, so **hosted parity is `202608110090`** — and the second is
notification consent, subscription and delivery in slice 2M.4b. The phase carries
a **mandatory owner hardware checkpoint** after its push slice.

**Its predecessor, Phase 2L — Work and execution, is complete** (planning by
ADR-102, implementation through closeout by ADR-103, both 2026-08-09), with its
closeout corrected the same day from evidence. Before it, **Phase 2K — Conversar
as the primary interface is concluded** (planning by ADR-097, 2026-08-08;
implementation through closeout by ADR-101, 2026-08-09), **after an
extraordinary post-phase correction the owner authorized separately**: the phase
reached closeout with its telemetry inert on the deployed project, and migration
`202608090089` closed that **outside Phase 2K's budget and charged to no phase**.

**No successor to Phase 2M is authorized, planned, or given artifacts**, and A13
now targets that successor, which is **not started**. Nothing here covers opening
signup, executing rollout residuals, or running ADR-055's offline spike. Phases
2H, 2I, 2J, 2K and 2L are closed.

This line has now been stale twice, and both times the failure was the same:
naming an initiative that had stopped being the active one. Until 2026-08-08 it
still named Phase 2H after 2I and 2J had both closed; until 2026-08-09 it still
described Phase 2K as *in planning only*, long after ADR-101 authorized
implementation and every slice had merged. It is corrected with each
authorization rather than at the next reader's expense, because an index that
names the wrong active initiative is the one document a new reader trusts first.

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

### `phase-2m/` — Phase 2M (planning ADR-104, 2026-08-09; implementation through closeout ADR-105, 2026-08-11)

`PHASE_2M_CURRENT_EXPERIENCE_AUDIT.md` (the falsifiable re-derivation of
calendar, planning, review, timezone, recurrence and notification behaviour from
source, whose central finding is that `planned_at` is **write-then-display** —
stored, audited, editable and rendered, and read by no predicate anywhere — and
whose §12 corrects the predecessor's re-audit on the service worker),
`PHASE_2M_UX_GAPS_AND_OPPORTUNITIES.md` (eight ranked gaps, six cheap
opportunities Phase 2L already paid for, and six opportunities recorded as
**deliberately not taken** so that refusing them is a decision rather than an
omission), `PHASE_2M_THREAT_MODEL.md` (T-01…T-28, including the first outbound
trust boundary this product would ever have) and
`PHASE_2M_TRACEABILITY_CONTRACT.md`, which **specifies** the fail-closed
generator and its twenty-seven refusals — deliberately not built during planning,
for the reason Phase 2H recorded: a fail-closed generator run against a phase
with zero acceptance records reports every requirement unresolved. The governing
pair (PRD, implementation plan) lives in `docs/initiatives/phase-2m/`.

`PHASE_2M_SLICE_00_ACCEPTANCE.md` records the foundations slice — the single
local-day contract, the three implementations it replaced, and four guards.
`PHASE_2M_DEPLOYMENT.md` records **migration 1**, applied to the hosted project
on 2026-08-11 after CI went green on its exact merge SHA: the dry run, the
apply, the live read-only parity reading, the hosted proof through the real
authenticated writer with six non-vacuous negative controls, zero residue proved
owner-scoped, and **three probe defects found and corrected** — a remote smoke
that had been unrunnable since Phase 2H, and two funnel readers that queried a
column `product_events` does not have while signing in through a path Turnstile
refuses.

`PHASE_2M_SLICE_01_ACCEPTANCE.md` records the calendar slice in all **three**
parts — migration 1, the surface at `/app/calendar`, and rescheduling from it —
including the three decisions inside part 3 (the verb subset **derived** from
`actionPolicy(...).changedFields` rather than listed; the projection carrying the
answer and never the status; the return position reusing Phase 2L's *mechanism*
with the calendar's own vocabulary), what the slice deliberately cannot do
(clear a planned day, because `clear_planned` does not exist and inventing it
would be a second write authority), and the exact line between what **42 browser
journeys** proved on desktop and Pixel 7 in both locales and what is **written
and not executed** because it needs the deployment.

**No traceability matrix and no closing report exists yet**, and neither may be
created before its gate. **Two migrations are authorized and non-transferable** —
telemetry plus the `calendar` surface in slice 2M.1, **spent and deployed**, and
push consent/subscription/delivery in slice 2M.4b, still unspent. A third is a
stop condition.

### `phase-2l/` — Phase 2L (planning ADR-102; implementation through closeout ADR-103, both 2026-08-09)

`PHASE_2L_CURRENT_EXPERIENCE_AUDIT.md` (the falsifiable re-derivation of the
Work surface from source, whose finding is that the *domain* ships in depth
while the *surface* exposes four buttons and a link),
`PHASE_2L_UX_GAPS_AND_OPPORTUNITIES.md` (twelve ranked gaps, plus nine
opportunities recorded as **rejected or deferred** so that refusing them is a
decision rather than an omission), `PHASE_2L_THREAT_MODEL.md` (T-2L-01…T-2L-20, several of which
name a residual risk rather than claiming a mitigation) and
`PHASE_2L_TRACEABILITY_CONTRACT.md`, which **specifies** the fail-closed
generator and its nineteen refusals — deliberately not built during planning,
for the reason Phase 2H recorded: a fail-closed generator run against a phase
with zero acceptance records reports every requirement unresolved. The governing
pair (PRD, implementation plan) lives in `docs/initiatives/phase-2l/`.
**No slice acceptance record, no traceability matrix and no closing report
exists yet**, and none may be created before its gate. **No migration is
authorized and none is expected**: OD-2L-2 is signed as option A, so the single
allocation lapses and the budget closes `1 allocated · 0 spent` — which is why
**no deployment record may be created either**.

### `phase-2k/` — Phase 2K (concluded 2026-08-09, after an extraordinary post-phase correction)

`PHASE_2K_CURRENT_EXPERIENCE_AUDIT.md` (the falsifiable re-derivation of the
Conversar surface from source, whose five findings reshaped the phase),
`PHASE_2K_UX_GAPS_AND_OPPORTUNITIES.md` (eleven ranked gaps, one of which is
recorded as *not* a gap because the roadmap would otherwise have rebuilt it),
`PHASE_2K_THREAT_MODEL.md` (T-2K-01…T-2K-10, each with the falsifying evidence
that would disprove its mitigation) and `PHASE_2K_TRACEABILITY_CONTRACT.md`,
which **specifies** the fail-closed generator and its sixteen refusals —
deliberately not built during planning, for the reason Phase 2H recorded: a
fail-closed generator run against a phase with zero acceptance records reports
every requirement unresolved. The governing pair (PRD, implementation plan)
lives in `docs/initiatives/phase-2k/`. Slice acceptance records file here as
they are produced: `PHASE_2K_SLICE_00_ACCEPTANCE.md` (the three measurements,
the ADR-055 retirement, zero product code) and `PHASE_2K_SLICE_01_ACCEPTANCE.md`
(the card grammar, the read-only previews and the first sensitivity policy
Conversar has ever had) `PHASE_2K_SLICE_02_ACCEPTANCE.md` (edit before
confirming, a discard that writes nothing, and the memory undo that archives)
`PHASE_2K_SLICE_03_ACCEPTANCE.md` (continuity by server re-derivation,
with a handle that is incapable of authorizing) and
`PHASE_2K_SLICE_04_ACCEPTANCE.md` (sources per answer, and the end of the
persisted excerpt) and `PHASE_2K_SLICE_05_ACCEPTANCE.md` (the two exclusions
the answer path already computed and threw away) and
`PHASE_2K_SLICE_06_ACCEPTANCE.md` (deterministic suggestions that cost
nothing, and zero when none is honest). **Implementation is authorized by ADR-101; nothing is
deployed and the budget is still `1 allocated · 0 spent`.**

### `phase-2h/` — Phase 2H (closed)

`PHASE_2H_THREAT_MODEL.md` (T-2H-01…T-2H-24, the per-slice review floor) and
`PHASE_2H_TRACEABILITY_CONTRACT.md`, which **specifies** the fail-closed
generator that `2H-CLOSE-001` builds in slice 2H.6 — deliberately not built
during planning, because a fail-closed generator run against a phase with zero
acceptance records reports every requirement unresolved. The governing pair
(PRD, implementation plan) lives in `docs/initiatives/phase-2h/`. Slice
acceptance records file here as they are produced. The phase **closed
2026-08-07** — 44 declared · 44 delivered, hosted parity `202608070083` — so
this section's former "nothing has been implemented, merged or deployed" is
corrected here rather than left standing.

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
