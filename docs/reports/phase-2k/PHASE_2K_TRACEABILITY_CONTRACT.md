# Phase 2K — Traceability contract

**What this is.** The rules a Phase 2K traceability matrix must satisfy, and the refusals a generator must implement. It is written **independently of the PRD** so that the two can disagree — a disagreement is a defect that blocks closeout rather than something the tooling silently reconciles.

**What this is not.** It is not a copy of the PRD's requirement table, and the matrix must not be produced by reading only this file or only the PRD. The generator reads **both**, plus the repository, and refuses when they diverge. If a single table produced the PRD, the plan and the matrix, one wrong premise would propagate into all three and appear confirmed three times — which is exactly the failure this repository has already paid for.

**Status.** Planning artifact. The matrix itself, the generator and the guard are **built in slice 2K.8**, from executed evidence. Nothing here authorizes creating them now.

---

## 1. Independence rules

1. **Two sources, cross-checked.** The generator reads the PRD's declared requirements *and* the implementation plan's per-slice coverage. A requirement present in one and absent from the other is a **refusal**, not a merge.
2. **Evidence is read from the repository, never from prose.** A citation is resolved against the working tree at generation time. A path that does not exist is a refusal. A line number past end-of-file is a refusal.
3. **The contract may refuse a classification the PRD asserts.** If the PRD says `baseline` and the cited evidence does not exist or does not support it, the generator refuses. The PRD is not privileged over the repository.
4. **No requirement may be introduced by the matrix.** An id in the matrix that neither the PRD nor the plan declares is a refusal — that is how scope creeps in silently at closeout.
5. **The generator resolves what it declares.** Per ADR-062: a generator that emits a citation it did not resolve is emitting a claim, not evidence.

---

## 2. Classification vocabulary

Exactly one per requirement, at close. No unclassified row is permitted.

| Class | Means | Minimum evidence |
|---|---|---|
| `built` | Phase 2K work delivers it | A file+line the phase added or changed, **and** a test that fails without it |
| `baseline` | The product already delivered it before Phase 2K | A file+line **predating** the phase's first commit, and a test or executed probe pinning the behaviour |
| `partial` | A useful portion delivered | Evidence for the delivered part **and** a named, specific remainder |
| `not-built-by-rule` | Implementation would violate a signed constraint or rejected scope | The **named rule** — an ADR id, a signed decision id, or a guard file |
| `undelivered` | Desirable, authorized, absent | An owner **and** a destination |

`complete`, `green`, `deployed` and `verified` are evidence claims about executed runs. They are never synonyms for a document existing.

---

## 3. Refusal conditions

A generator run **must fail** — non-zero exit, no matrix emitted — on any of these. Each must have an executed mutation test proving the refusal fires; a guard whose failure modes are unasserted is not a guard.

| # | Refusal | Detection |
|---|---|---|
| R1 | **Requirement without classification** | Any declared id absent from the matrix, or present with an empty class |
| R2 | **Duplicate id** | The same id declared twice anywhere, or appearing twice in the matrix |
| R3 | **PRD requirement missing from the plan** | An id in the PRD covered by no slice |
| R4 | **Plan requirement missing from the PRD** | The converse — a slice claiming coverage of an undeclared id |
| R5 | **Nonexistent evidence** | A cited path absent from the working tree, or a line number past end-of-file |
| R6 | **Classification incompatible with evidence** | `built` whose only citation predates the phase; `not-built-by-rule` citing a file rather than a rule; `baseline` citing a file the phase created |
| R7 | **Baseline without proof** | `baseline` with no test or executed probe pinning the behaviour — a comment is not proof |
| R8 | **Partial without remainder** | `partial` whose remainder field is empty, or restates the requirement instead of naming what is missing |
| R9 | **Not-built without a rule** | `not-built-by-rule` naming no ADR id, decision id or guard file |
| R10 | **Undelivered without destination** | `undelivered` missing an owner or a destination |
| R11 | **Migration or event pinned to a superseded file** | A citation to a migration later superseded, or to a vocabulary copy no longer live. *(Precedent: a Phase 2J guard was pinned to a superseded migration, and `202608080087` removed a frozen third vocabulary copy.)* |
| R12 | **Acceptance record created before execution** | A slice acceptance record whose commit predates the evidence it cites, or which exists for a slice with no merged implementation commit |
| R13 | **Budget inconsistency** | Migrations counted in the matrix exceeding the allocation, or per-slice reconciliation disagreeing with the total |
| R14 | **Successor scope present** | A declared requirement in a successor-phase namespace, or a governing artifact for a phase this package does not authorize |
| R15 | **Signed decision contradicted** | A row whose classification or evidence contradicts a signed decision: a `2K-ACT-008/009` row describing deletion rather than archival (OD-2K-3); a `2K-PRIVACY-003/004` row citing a persisted excerpt or a stored classification (OD-2K-2); a `2K-AUDIT-004/005` row describing an ADR-055 renewal, a renewal date, or any claim that current retrieval was removed, disabled or degraded (OD-2K-6). A signed decision is an input the matrix may not quietly relitigate |
| R16 | **A slice claimed as executed that was not** | Any language asserting execution — "executed slices", a slice marked delivered — without a merged implementation commit and an acceptance record postdating it. Related to R12, and separated from it because R12 checks the record's timestamp while this checks the *claim* |
| R17 | **Continuity carrying reusable authorization** | Any plan, requirement, test or implementation in which the continuity payload transports `issuedAt`, `observedBefore`, a confirmation id, an operation key, a request fingerprint, an observed pre-state, a computed preview, or a mutation payload — in any combination, under any name, and regardless of stated intent. Also refused: any text offering the implementer a **choice** between transporting a clock and requesting a fresh confirmation. The contract has exactly one reading — *returning always re-derives with a new `issuedAt` and always requires a fresh confirmation* — and a second reading is the defect, not an option. Added after the first draft of `2K-CONT-006` contained precisely this contradiction |

---

## 4. Evidence classes

| Class | Accepted as | Not accepted as |
|---|---|---|
| Source citation | `built`, `baseline` | Proof that a behaviour is *exercised* |
| Unit/component test | `built`, `baseline` | Proof of hosted behaviour |
| pgTAP test | Database behaviour, RLS, grants | Proof of UI behaviour |
| Structural guard | An invariant holds across a directory | Proof a feature works |
| Playwright, executed | UX, keyboard, focus, viewport | Proof of screen-reader behaviour |
| Hosted probe, executed | Deployed behaviour, parity | Anything, unless residue is proved zero |
| Signed decision / ADR | `not-built-by-rule` | `built` |
| Manual session | Only what it recorded, labelled manual | Anything automated |

**Positive controls are mandatory for every denial.** A refusal proof is vacuous if the same session could not perform the permitted action. This is the failure recorded as *"a control must not be exempt"* — an always-passing test key produced two wrong published verdicts.

---

## 5. Per-family expectations

Stated so the matrix can be **checked** rather than merely filled. These are expectations, not classifications: the audit predicts them and executed evidence decides them. A family closing far from its expectation is a signal to re-read the audit, not to adjust the expectation.

| Family | Expected shape at close |
|---|---|
| `2K-AUDIT` | Mostly `built`. `2K-AUDIT-004..006` must cite an accepted ADR by id |
| `2K-CARD` | Mixed. Task preview immutability expected `baseline` citing pre-phase code; the shared vocabulary `built` |
| `2K-ACT` | Mixed. Task undo `baseline`; memory undo `built` **and archival, never deletion** (OD-2K-3) — a matrix row claiming a memory was removed is a refusal, not a classification; editable parameters `built` |
| `2K-CONT` | Expected `built` throughout — the audit found no continuity capability |
| `2K-SRC` | `2K-SRC-001/002` expected `baseline` **with proof**; the rest `built` |
| `2K-EXPL` | Expected `built`; `2K-EXPL-006` may close `baseline` (nothing exposes reasoning today) |
| `2K-SUGG` | Expected `built` |
| `2K-PRIVACY` | `2K-PRIVACY-005/006` expected `baseline`; the rest `built`. `2K-PRIVACY-003/004` must cite the **absence** of a persisted excerpt and the render-time re-read (OD-2K-2), never a stored classification travelling with a copy |
| `2K-A11Y` | Mixed `built`/`partial`. Any AT claim must be labelled manual or an evidenced negative |
| `2K-METRICS` | `built`, or `undelivered` with a destination if the migration is not authorized |
| `2K-CLOSE` | `built` |
| **2K.7 candidates** | **All `not-built-by-rule`**, each naming ADR-055 **and** OD-2K-A |

---

## 6. Matrix schema

One row per requirement:

| Column | Rule |
|---|---|
| `id` | Unique across the phase; matches `2K-[A-Z]+-\d{3}` |
| `family` | One of the eleven declared families |
| `slice` | The slice that delivered it, or `—` for `not-built-by-rule` |
| `classification` | Exactly one of the five |
| `evidence` | One or more resolvable citations; every one checked at generation time |
| `remainder` | Required and non-empty iff `partial` |
| `rule` | Required iff `not-built-by-rule`; an ADR id, decision id or guard path |
| `owner` + `destination` | Both required iff `undelivered` |
| `migration` | The migration id charged, or `none` |

---

## 7. Budget reconciliation

- Allocation: **1** (OD-2K-C). Reconciled **per slice**, not by total count.
- `1 allocated · 0 spent` is a legitimate close and must not be reported as a shortfall.
- A migration charged to a slice whose plan declared none is **R13**.
- A migration created without separate implementation authorization is a governance failure, not a budget question, and closeout must say so plainly.

## 8. What closeout may not do

- Upgrade a limitation to a pass.
- Report an unexecuted check as executed, skipped or inferred interchangeably — the three are distinct and must be labelled.
- Claim hosted parity without an executed `migration list --linked` in the same session.
- Claim a metric is delivered when only a producer exists. A producer with no consumer records nothing, which SH.6 proved over weeks.
- Restate ADR-055 as satisfied or superseded unless `2K-AUDIT-004`'s ADR actually did so.
- Treat completion of Phase 2K as progress toward opening signup.

## 9. Handoff

At close the matrix, the closing report and the residual list must together answer, without the reader opening the code: what was built, what already existed, what was refused and by which rule, what remains and who owns it, what was spent, and what was proved by execution versus asserted by document.
