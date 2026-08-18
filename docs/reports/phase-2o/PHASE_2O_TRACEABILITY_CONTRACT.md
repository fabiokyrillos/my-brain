# Phase 2O — traceability contract

**A contract, not a plan, and not an authorization.** It defines what this phase
is mechanically forbidden from claiming. Its enforcement lives in
`src/lib/closeout/phase-2o-declarations.test.ts`, which runs in CI, and — when
implementation is authorized — in a generated matrix that may not be typed by
hand.

Planning was authorized by ADR-115, **all twelve owner decisions are SIGNED by
ADR-116**, the one flagged interpretation was confirmed by **ADR-117**, and
**implementation through closeout is authorized by ADR-118** (2026-08-15).
Signing the decisions and authorizing the work were two separate acts, as they
were at ADR-104/ADR-105 and ADR-108/ADR-112.

**Two refusals moved when ADR-118 landed, and neither was deleted.** `R-2O-7`
inverted — an acceptance record per delivered slice is now required rather than
forbidden, while the *phase*-closing artifacts stay refused until 2O.8 — and
`R-2O-8` is **discharged**, because product code is what the authorization is
for. Both are restated in place below with their superseded form quoted.

**Twenty-eight numbered refusals — eleven live during planning, seventeen armed
at implementation — plus one sub-refusal, `R-2O-13b`, added by ADR-117.** The
planning half is live today. Sub-lettering rather than renumbering is
deliberate: `R-2O-14` … `R-2O-28` are cited by other documents, and moving them
to make room would be the renumbering this phase forbids of its requirements.

**R-2O-5 inverted rather than being deleted**, which is this repository's
standing pattern. Under ADR-115 it refused a document that described an open
decision as settled. Under ADR-116 the decisions are settled, so it refuses the
mirror error: a document that re-opens, softens or silently re-decides one. **The
failure being prevented is unchanged — a document disagreeing with the owner's
actual signature. Only the direction moved.** Four refusals are **added**
(`R-2O-25` … `R-2O-28`), each created by a specific signature.

---

## 1. Refusals live during planning

**R-2O-1 — A requirement may not exist without a classification.**
Every declared identifier appears exactly once in `PHASE_2O_PRD.md`, in this
repository's declaration shape `- **2O-FAMILY-000:**`. Duplicates, gaps within a
family, and identifiers declared outside the PRD are refused. **116 declared.**

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
planning. The budget is **signed by `OD-2O-9`: 2 allocated · obligation ZERO ·
0 spent · none created · NON-TRANSFERABLE**. An allocation is a destination, not
a permission — and **M2 no longer has a destination at all**, because all three
it was reserved for were signed **A**.

**R-2O-5 — A signed decision may not be silently re-decided.** *(Inverted by
ADR-116; the pre-signature form is kept below because a deleted refusal records
nothing.)*
All twelve are signed. A document that re-opens one, softens it, describes it as
open, or acts on a branch the owner declined, is refused. **Recommendations are
the agent's; signatures are the owner's** — and where a signature did not
cleanly reach a case, the package **states the interpretation and says it is an
interpretation** rather than resolving it as though the owner had spoken. That
is what `2O-AICONFIG-004` did for `embedding_model`, and **ADR-117 then
confirmed it** — which is the mechanism working, not a defect: a flagged reading
is a question the owner can answer, and an absorbed one is a question nobody
ever sees. **Once confirmed, the flag becomes a false statement about who
decided, so it is inverted rather than left standing** — with the superseded
wording quoted, never deleted.
*Pre-signature form, retained: "An unsigned decision may not be described as
settled — a document that presents one as decided, or reads a recommendation as
an outcome, is refused."*

**R-2O-6 — The declined options must stay visible.**
A decision whose alternatives have been deleted is a decision nobody can review.
Every `OD-2O-*` keeps its A/B/C.

**R-2O-7 — A delivered slice leaves an acceptance record; an undelivered phase
leaves no closing artifact.** *(Inverted in part by ADR-118, and kept rather
than deleted.)*
Every slice that ships records its acceptance under `docs/reports/phase-2o/`,
and the **absence** of that record for a delivered slice is now the defect. The
*phase*-closing artifacts — the traceability matrix, the closing report and a
deployment record — stay refused until 2O.8, because any of them mid-flight is a
phase claiming to be finished. That half inverts in 2O.8's own commit.
*Pre-authorization form, retained: "No acceptance record, traceability matrix,
closing report or deployment record for this phase may exist during planning. A
planning package that grows an acceptance record has started implementing under
an authorization that forbids it."*

**R-2O-8 — DISCHARGED by ADR-118.** *(Retained, because a deleted refusal
records nothing.)*
It refused any change under `src/app/`, `src/features/`, `supabase/`, `public/`
or `e2e/` that was not a guard, and it was correct for as long as the
authorization was planning-only. Implementation is now authorized and product
code is the thing being authorized, so the refusal is spent rather than broken.
**What replaces it is not nothing:** the migration ceiling (`R-2O-4`,
`R-2O-25`), the CSP freeze (`R-2O-27`), the authority refusals and the stop
conditions all bind product code directly, and every one of them is live.
*Pre-authorization form, retained: "No product code may change. The planning
commit touches documentation and governance guards only."*

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

**R-2O-13b — `embedding_model` may not gain a control, and may not be touched.**
*(Added by ADR-117.)* `OD-2O-6` **A**'s *only* reaches it: a registry row saying
**real consumers, no authorized control**, and no input. The row may not claim
it has no consumer — it has six, and `2O-ACTIVATION-005`'s tree-derived
`consumerEvidence` would fail such a row. **And the column may not be removed,
altered, renamed, re-defaulted or migrated** to tidy away the asymmetry.

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

**R-2O-25 — M2 may not be spent, on anything.** *(Added by ADR-116 Decision 4.)*
Its three reserved destinations were signed **A**, and the budget is
non-transferable. **M2 closes unspent by construction**, that is the correct
close rather than an omission, and a migration created to use it up is refused —
the worst version of the unnecessary-spend defect, because it would be a schema
change made to improve the appearance of a budget.

**R-2O-26 — The screen-reader run may never be promoted by anything but a run.**
*(Added by ADR-116 Decision 3.)* `2O-ACCESS-006` may close **`built` only on a
recorded execution naming device, software and version**. Documentation, an
emulator, an automated accessibility scan, or an inference from one are each
refused as evidence. Absent a run it closes **`partial`** with a remainder and a
destination. Under `OD-2O-12` **B** it does not alone block closeout — and that
concession is exactly why the evidence rule is absolute.

**R-2O-27 — The CSP may not change.** *(Added by ADR-116 Decision 7.)* The
appearance control's inline script is possible because `script-src` already
carries `'unsafe-inline'`, **verified in `next.config.ts` rather than assumed**.
`csp.test.ts`'s header shape must come out of this phase unchanged; a CSP change
is a deployment-boundary change and a **stop condition**.

**R-2O-28 — The stored appearance value is untrusted input.** *(Added by
ADR-116, closing T-16.)* It is validated against the **closed set of three**
before it reaches any DOM attribute, anything else falls back to
follow-the-machine, and the inline script never interpolates the stored value
into its own source. `localStorage` is writable by any script on the origin, so
a value read from it is attacker-controlled by definition.

---

## 3. Classification vocabulary

At closeout every one of the 116 requirements takes exactly one:

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

### 3.1 One requirement was corrected in place at closeout, and none was renumbered

**`2O-NOTIFY-005` described a capability the product has never had.** It asked
for an *important-reminder override* to be stated where consent is given; slice
2O.6 went looking for the object and found none, and `decideDelivery` refuses
inside quiet hours with no exemption for type, priority or urgency.

**ADR-120 corrects the requirement rather than building the capability**, which
is the direction this contract has taken every time the two disagreed. The
identifier keeps its number and its position, the superseded sentence is quoted
beneath the new one, and the classification is re-derived from the corrected
rule and the real evidence — closing `built`, as slice 2O.6 had it, but now
`built` against a requirement that asks for what the product does.

**Neither slice 2O.6's nor slice 2O.7's acceptance record is edited.** A record
states what was true when it was written, and rewriting one to agree with a
later decision destroys the only evidence of what was believed at the time. The
correction is recorded in slice 2O.8's record instead — the pattern ADR-119 set
for `2O-PRIVACY-001`, applied a second time.

**This is not a renumbering and does not move the total.** 116 declared before
the correction, 116 after, asserted by the generator on every run.

---

## 4. What a correct close looks like

- 116 declared, 116 classified, 0 unclassified.
- The matrix **generated** by `scripts/generate-phase-2o-traceability.mjs`,
  carrying `Do not edit by hand`, and never typed.
- Counts in `STATE.md`, `TODO.md` and `CHANGELOG.md` **re-derived from the
  matrix**, never transcribed.
- Budget reported as allocated versus spent, naming the slice that spent each.
  **An allocation closing unspent is a correct outcome; an unnecessary spend is
  a defect.** **M2 is expected to close unspent** — it has no destination — and
  M1 closes unspent too if no real producer and consumer ship.
- The successor re-audited against the tree the phase leaves, and **not
  started**.
- Every carried residual named with a destination, and none silently absorbed.
