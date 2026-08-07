# Phase 2H — traceability contract

- **Status:** Planning artifact under ADR-085. This document **specifies** the mechanism; `2H-CLOSE-001` **builds** it, in slice 2H.6.
- **Why it is specified now and built later:** every previous generator (`2F`, `BYOK`, `Signup Hardening`, `2G`) was written in its phase's closeout slice, because a fail-closed generator run against a phase with zero acceptance records reports every requirement unresolved — which is *correct* and would make CI red for the whole phase. Specifying the contract now fixes the shape before the first slice writes an acceptance record in the wrong one; building it now would either fail the build or require a "planning mode" flag that suppresses findings, and a generator with a switch that makes findings disappear is not a fail-closed generator.

---

## 1. Paths, fixed now

| Thing | Path |
| --- | --- |
| Requirement source (the only legal declaration site) | `docs/initiatives/phase-2h/PHASE_2H_PRD.md` |
| Acceptance records (the only legal citation site) | `docs/reports/phase-2h/` |
| Generated matrix | `docs/reports/phase-2h/PHASE_2H_TRACEABILITY_MATRIX.md` |
| Generator | `scripts/generate-phase-2h-traceability.mjs` |
| Guard | `src/lib/closeout/phase-2h-traceability.test.ts` |
| npm script | `docs:phase-2h:traceability` |

## 2. The rules the generator must implement

Inherited verbatim from `2G-CLOSE-001`: **derive what can be derived, resolve what is declared, and fail rather than print an unresolved claim.**

1. **Inventory is derived**, from the PRD's own declaration shape `- **2H-FAMILY-000:**`. A requirement living only in prose is not declared and is not counted. This is the same shape the A13 phase-start detector matches, so the two cannot disagree about what a declaration is.
2. **Delivery is evidenced by citation.** A requirement counts as delivered when an acceptance record under `docs/reports/phase-2h/` names its id. A column somebody typed is not evidence.
3. **Non-delivery must be declared**, because nothing on disk can evidence an absence. `UNDELIVERED` carries a reason **and** a destination per id; `PARTIAL` carries what landed, what is missing, and where the remainder lives — and a partial must still be *cited*, so the category cannot smuggle an unevidenced claim past rule 2.
4. **Both directions are cross-checked.** An id declared undelivered while an acceptance record claims it is a finding; so is an id that is neither cited nor declared. That pair is the entire point.
5. **The migration budget is read from the chain, not restated.** Phase 2H is allocated five (ADR-085 §4); a sixth `phase_2h` migration is a finding even if every other check passes, and a migration attributed to a slice other than its allocation is a finding too — the allocation is per-slice and non-transferable.
6. **Every function takes an explicit `root`**, so the guard can run it against fixture repositories carrying one deliberate defect each, **and** against the real repository as a positive control — because a guard proven only in the failing direction may be refusing everything.

## 3. What the guard must assert

At minimum, one fixture per rule above, each carrying exactly one defect:

- an id declared in the PRD and cited nowhere → finding;
- an id cited by an acceptance record but absent from the PRD → finding;
- an id in `UNDELIVERED` that an acceptance record also claims → finding;
- an id in `UNDELIVERED` with no destination → finding;
- an id in `PARTIAL` that no acceptance record cites → finding;
- a sixth `phase_2h` migration → finding;
- a migration whose slice attribution does not match its allocation → finding;
- the real repository → the positive control.

## 4. The interim state, stated so nobody mistakes it for coverage

Until 2H.6 ships `2H-CLOSE-001`, **Phase 2H has no automated traceability**. The declared inventory is `PHASE_2H_PRD.md` and nothing verifies that it stays reconciled with the acceptance records. That is a known, bounded gap of exactly one phase's planning period, recorded here rather than discovered at closeout — and it is the reason `2H-CLOSE-001` is a requirement rather than a chore.

## 5. Current count, as of this document

44 requirements declared across nine families: `2H-DEPLOY` (7), `2H-RECOVER` (6), `2H-SINK` (5), `2H-DEADMAN` (4), `2H-RATE` (6), `2H-RETENTION` (4), `2H-BACKUP` (2), `2H-OPS` (5), `2H-CLOSE` (5). **0 delivered, 0 cited, 0 of 5 migrations spent** — the phase is in planning and nothing has been implemented, merged or deployed.
