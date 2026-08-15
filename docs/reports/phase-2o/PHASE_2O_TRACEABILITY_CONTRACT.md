# Phase 2O — traceability contract

**A contract, not a plan, and not an authorization.** It defines what this phase
is mechanically forbidden from claiming. Its enforcement lives in
`src/lib/closeout/phase-2o-declarations.test.ts`, which runs in CI, and — when
implementation is authorized — in a generated matrix that may not be typed by
hand.

The phase is authorized for **planning only** (ADR-115). **All twelve owner
decisions are OPEN and none is signed.** Twenty-four refusals: **eleven live
during planning, thirteen armed at implementation.** The planning half is live
today.

---

## 1. Refusals live during planning

**R-2O-1 — A requirement may not exist without a classification.**
Every declared identifier appears exactly once in `PHASE_2O_PRD.md`, in this
repository's declaration shape `- **2O-FAMILY-000:**`. Duplicates, gaps within a
family, and identifiers declared outside the PRD are refused. **113 declared.**

**R-2O-2 — A family name may not contain a digit.**
`2O-[A-Z]+-\d{3}` is the shape the phase-start detector and the traceability
generator both use. `2K-A11Y` matched neither, and seven accessibility
requirements became invisible to every prose count. This phase's accessibility
family is `2O-ACCESS`, for that reason.

**R-2O-3 — The count may not drift.**
Wherever the PRD or the plan states this phase's total, it states the number the
PRD actually declares. The extraction that checks it is proved non-zero, because
an assertion over an empty set passes trivially.

**R-2O-4 — No migration may exist.**
No file in `supabase/migrations/` may be attributable to this phase during
planning. The proposed budget is **2 allocated · obligation ZERO · 0 spent ·
none created**, and it is **unsigned**. An allocation is a destination, not a
permission.

**R-2O-5 — An unsigned decision may not be described as settled.**
Twelve decisions are open. A document that presents one as decided, that reads a
recommendation as an outcome, or that marks a requirement authorized before the
owner answers, is refused. **Recommendations are the agent's; signatures are the
owner's, and this package contains none.**

**R-2O-6 — The declined options must stay visible.**
A decision whose alternatives have been deleted is a decision nobody can review.
Every `OD-2O-*` keeps its A/B/C.

**R-2O-7 — Closing artifacts may not exist.**
No acceptance record, traceability matrix, closing report or deployment record
for this phase may exist during planning. A planning package that grows an
acceptance record has started implementing under an authorization that forbids
it. This refusal **inverts at closeout**, and is kept rather than deleted then,
because a deleted assertion cannot be told apart from a satisfied one.

**R-2O-8 — No product code may change.**
The planning commit touches documentation and governance guards only. A change
under `src/app/`, `src/features/`, `supabase/`, `public/` or `e2e/` that is not a
guard is refused.

**R-2O-9 — The successor may not be started.**
No `2P-*` requirement, no `PHASE_2P_*` governing artifact, no accepted ADR whose
heading names the successor, and no source or migration file marked as successor
implementation. Enforced by **A13**, retargeted by ADR-115's own commit.

**R-2O-10 — The authorizing ADR may not name the successor in its heading.**
An ADR that named the phase it hands the guard to would start that phase in the
act of authorizing this one. ADR-092's first draft did exactly that and was
reworded. ADR-115's heading says *the roadmap successor*.

**R-2O-11 — Inherited facts may not be reclassified.**
Signup closed. Rollout gate **25 · 3 · 2**. 94 migrations, parity
`202608140094`. Push implemented, hosted, **failing with HTTP 403 on a real
iPhone**, **never executed on Android**. No screen-reader run executed or
claimed. ADR-055 neither satisfied nor superseded, expiring **2026-10-27**.
`2N-RELATION-TRIGGER`, `2N-IDENTITY-EXTRACTION`, `2N-FILES-WRITER`,
`2N-MOBILE`, `2N-PRIVACY-FREETEXT` and `2N-RELATION-END-ANNOUNCEMENT` open and
**unabsorbed**. A document that softens any of these is refused.

---

## 2. Refusals armed at implementation

**R-2O-12 — A control may not exist for a preference with no consumer.**
This is the inherited rule **`R-24`** — *the settings surface never offers a
control that changes nothing* — strengthened. `consumerEvidence` becomes derived
from the tree rather than declared, so a row claiming a consumer that does not
exist fails the build, and a rendered control with no row fails the build.
(`R-24` belongs to the mobile-first PRD's numbering; this phase's own refusals
carry the `R-2O-` prefix precisely so the two can never be confused.)

**R-2O-13 — `planning_day` and `planning_time` may not gain a control.**
Retired by `2M-AUDIT-005`. The columns stay and the payload keeps carrying them;
what may not exist is an input.

**R-2O-14 — A route may not be redirected or ended to achieve consolidation.**
ADR-114 Decision 6 preserves every current URL. Consolidation uses the Dados e
IA pattern: a section that reaches a route which keeps its own URL, filters and
deep links.

**R-2O-15 — Sign-out may not become unreachable.**
`mobile-reachability-guard.test.ts` is re-derived in the same change as any
navigation restructuring, and must still fail in both directions.

**R-2O-16 — An absence may not be asserted without a planted divergence.**
Every guard asserting that a surface no longer says something carries a fixture
marker proving the corpus rendered, and a planted counter-example proving the
guard can fail.

**R-2O-17 — No surface may make a model call to render itself.**
The shape `2K-SUGG-001` refused. It binds every cost, quota, onboarding and
preferences surface in this phase.

**R-2O-18 — No price may be forecast.**
Prices are provider facts recorded at call time. A prediction is an invention.

**R-2O-19 — An export is complete or it refuses.**
Completeness is derived from the same enumeration the deletion path uses, and
the sharing is asserted so the two cannot drift.

**R-2O-20 — A telemetry event may not be declared without a real producer and a
real consumer.**
A producer with no consumer is invisible; this product shipped one and did not
notice for weeks. The consumer is **executed** against the deployed project
before measurement is claimed, and residue is proved **owner-scoped**, because
`service_role` can neither read nor delete `product_events`.

**R-2O-21 — One migration updates every copy of the event vocabulary.**
The check constraint, `private.validate_product_event_properties`, and the
writer's own list, in the same file. Two of the three have frozen before.

**R-2O-22 — A migration may not schedule a destructive sweep.**
Scheduling is authorization. A retention schedule, if ever armed, is armed by an
operator script.

**R-2O-23 — Signup may not open, and no gate may be closed by writing a file.**
`RG-DEP-1`, `RG-DEP-3`, `RG-QUO-3`, `RG-LEG-4` and `RG-DEP-4` are owner and
operator work. The dossier reads `rollout:verify`'s real output.

**R-2O-24 — The closeout may not retarget A13.**
Retargeting belongs to the next authorization's own commit, so the invariant is
never unenforced in between.

---

## 3. Classification vocabulary

At closeout every one of the 113 requirements takes exactly one:

| Classification | Meaning |
|---|---|
| `built` | delivered by this phase, with evidence |
| `baseline` | already true before the phase; re-asserted, not claimed as delivery |
| `partial` | delivered in part, with a **named, non-vacuous** remainder **and a destination** |
| `not-built-by-rule` | deliberately not built, because a decision or a standing rule forbade it |
| `undelivered` | promised and not delivered — a defect, reported as one |

**A `partial` with a vacuous remainder is refused by the generator.** Phase 2L's
closeout produced two and had to be corrected the same day; the generator has
refused them since.

---

## 4. What a correct close looks like

- 113 declared, 113 classified, 0 unclassified.
- The matrix **generated** by `scripts/generate-phase-2o-traceability.mjs`,
  carrying `Do not edit by hand`, and never typed.
- Counts in `STATE.md`, `TODO.md` and `CHANGELOG.md` **re-derived from the
  matrix**, never transcribed.
- Budget reported as allocated versus spent, naming the slice that spent each.
  **An allocation closing unspent is a correct outcome; an unnecessary spend is
  a defect.**
- The successor re-audited against the tree the phase leaves, and **not
  started**.
- Every carried residual named with a destination, and none silently absorbed.
