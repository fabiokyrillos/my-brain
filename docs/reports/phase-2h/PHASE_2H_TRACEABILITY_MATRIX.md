# Phase 2H traceability matrix

**Generated — do not edit by hand.** `npm run docs:phase-2h:traceability`
rewrites this file and fails rather than print an unresolved claim, so an
edit here produces a status nothing checked (`2H-CLOSE-001`).

Delivery is evidenced by **citation**: a requirement is delivered when an
acceptance record under `docs/reports/phase-2h/` names its id. A requirement that
is not delivered must be declared in the generator with a reason and a
destination, and the generator refuses an id that is neither. A requirement
that is **partially delivered** must be declared *and* cited — the
declaration says what is still missing, the citation proves the rest landed.

Both directions are checked: an id the PRD declares and nothing cites is a
finding, and so is an id an acceptance record cites and the PRD does not
declare.

- **44** requirements declared
- **44** delivered
- **0** partially delivered
- **0** not delivered, each named with a destination
- **5** of 5 budgeted migrations spent, each by the slice it was allocated to

## Migration budget — `2H-CLOSE-002`

Allocated per slice and **non-transferable**. A count alone cannot catch the
failure this table exists for: five migrations with two belonging to one
slice and none to another spends the budget exactly and breaks the rule.

| Slice | Allocated | In the chain |
| --- | --- | --- |
| 2H.1 | 1 — `202608070079` | `202608070079_phase_2h_deletion_recovery.sql` |
| 2H.2 | 1 — `202608070080` | `202608070080_phase_2h_error_sink_and_deadman.sql` |
| 2H.3 | 1 — `202608070081` | `202608070081_phase_2h_rate_limiting.sql` |
| 2H.4 | 1 — `202608070082` | `202608070082_phase_2h_operator_surfaces.sql` |
| 2H.5 | 1 — `202608070083` | `202608070083_phase_2h_retention.sql` |
| 2H.0 | 0 | — |
| 2H.6 | 0 | — |

## 2H-RECOVER

| Requirement | Status | Evidence |
| --- | --- | --- |
| `2H-RECOVER-001` | delivered | `PHASE_2H_SLICE_01_ACCEPTANCE.md` |
| `2H-RECOVER-002` | delivered | `PHASE_2H_SLICE_01_ACCEPTANCE.md` |
| `2H-RECOVER-003` | delivered | `PHASE_2H_SLICE_01_ACCEPTANCE.md` |
| `2H-RECOVER-004` | delivered | `PHASE_2H_SLICE_01_ACCEPTANCE.md` |
| `2H-RECOVER-005` | delivered | `PHASE_2H_SLICE_01_ACCEPTANCE.md` |
| `2H-RECOVER-006` | delivered | `PHASE_2H_SLICE_01_ACCEPTANCE.md` |

## 2H-SINK

| Requirement | Status | Evidence |
| --- | --- | --- |
| `2H-SINK-001` | delivered | `PHASE_2H_SLICE_02_ACCEPTANCE.md` |
| `2H-SINK-002` | delivered | `PHASE_2H_SLICE_02_ACCEPTANCE.md` |
| `2H-SINK-003` | delivered | `PHASE_2H_SLICE_02_ACCEPTANCE.md` |
| `2H-SINK-004` | delivered | `PHASE_2H_SLICE_02_ACCEPTANCE.md` |
| `2H-SINK-005` | delivered | `PHASE_2H_SLICE_02_ACCEPTANCE.md`, `PHASE_2H_SLICE_04_ACCEPTANCE.md`, `PHASE_2H_SLICE_04_DEPLOYMENT.md` |

## 2H-DEADMAN

| Requirement | Status | Evidence |
| --- | --- | --- |
| `2H-DEADMAN-001` | delivered | `PHASE_2H_EDGE_DEPLOYMENT_EVIDENCE.md`, `PHASE_2H_SLICE_00_ACCEPTANCE.md`, `PHASE_2H_SLICE_02_ACCEPTANCE.md`, `PHASE_2H_SLICE_04_ACCEPTANCE.md` |
| `2H-DEADMAN-002` | delivered | `PHASE_2H_SLICE_00_ACCEPTANCE.md`, `PHASE_2H_SLICE_02_ACCEPTANCE.md` |
| `2H-DEADMAN-003` | delivered | `PHASE_2H_SLICE_02_ACCEPTANCE.md` |
| `2H-DEADMAN-004` | delivered | `PHASE_2H_SLICE_02_ACCEPTANCE.md`, `PHASE_2H_SLICE_04_ACCEPTANCE.md` |

## 2H-RATE

| Requirement | Status | Evidence |
| --- | --- | --- |
| `2H-RATE-001` | delivered | `PHASE_2H_SLICE_03_ACCEPTANCE.md` |
| `2H-RATE-002` | delivered | `PHASE_2H_SLICE_03_ACCEPTANCE.md` |
| `2H-RATE-003` | delivered | `PHASE_2H_SLICE_03_ACCEPTANCE.md` |
| `2H-RATE-004` | delivered | `PHASE_2H_SLICE_03_ACCEPTANCE.md` |
| `2H-RATE-005` | delivered | `PHASE_2H_SLICE_03_ACCEPTANCE.md` |
| `2H-RATE-006` | delivered | `PHASE_2H_SLICE_03_ACCEPTANCE.md` |

## 2H-DEPLOY

| Requirement | Status | Evidence |
| --- | --- | --- |
| `2H-DEPLOY-001` | delivered | `PHASE_2H_SLICE_03_ACCEPTANCE.md`, `PHASE_2H_SLICE_05_ACCEPTANCE.md` |
| `2H-DEPLOY-002` | delivered | `PHASE_2H_SLICE_05_ACCEPTANCE.md` |
| `2H-DEPLOY-003` | delivered | `PHASE_2H_EDGE_DEPLOYMENT_EVIDENCE.md`, `PHASE_2H_SLICE_05_ACCEPTANCE.md` |
| `2H-DEPLOY-004` | delivered | `PHASE_2H_SLICE_05_ACCEPTANCE.md` |
| `2H-DEPLOY-005` | delivered | `PHASE_2H_SLICE_00_ACCEPTANCE.md`, `PHASE_2H_SLICE_05_ACCEPTANCE.md` |
| `2H-DEPLOY-006` | delivered | `PHASE_2H_SLICE_05_ACCEPTANCE.md` |
| `2H-DEPLOY-007` | delivered | `PHASE_2H_EDGE_DEPLOYMENT_EVIDENCE.md`, `PHASE_2H_SLICE_00_ACCEPTANCE.md`, `PHASE_2H_SLICE_05_ACCEPTANCE.md` |

## 2H-RETENTION

| Requirement | Status | Evidence |
| --- | --- | --- |
| `2H-RETENTION-001` | delivered | `PHASE_2H_SLICE_05_ACCEPTANCE.md` |
| `2H-RETENTION-002` | delivered | `PHASE_2H_SLICE_05_ACCEPTANCE.md` |
| `2H-RETENTION-003` | delivered | `PHASE_2H_SLICE_05_ACCEPTANCE.md` |
| `2H-RETENTION-004` | delivered | `PHASE_2H_SLICE_05_ACCEPTANCE.md` |

## 2H-BACKUP

| Requirement | Status | Evidence |
| --- | --- | --- |
| `2H-BACKUP-001` | delivered | `PHASE_2H_SLICE_05_ACCEPTANCE.md` |
| `2H-BACKUP-002` | delivered | `PHASE_2H_SLICE_05_ACCEPTANCE.md` |

## 2H-OPS

| Requirement | Status | Evidence |
| --- | --- | --- |
| `2H-OPS-001` | delivered | `PHASE_2H_SLICE_04_ACCEPTANCE.md` |
| `2H-OPS-002` | delivered | `PHASE_2H_SLICE_04_ACCEPTANCE.md` |
| `2H-OPS-003` | delivered | `PHASE_2H_SLICE_04_ACCEPTANCE.md`, `PHASE_2H_SLICE_05_ACCEPTANCE.md` |
| `2H-OPS-004` | delivered | `PHASE_2H_SLICE_04_ACCEPTANCE.md` |
| `2H-OPS-005` | delivered | `PHASE_2H_SLICE_04_ACCEPTANCE.md` |

## 2H-CLOSE

| Requirement | Status | Evidence |
| --- | --- | --- |
| `2H-CLOSE-001` | delivered | `PHASE_2H_SLICE_06_ACCEPTANCE.md` |
| `2H-CLOSE-002` | delivered | `PHASE_2H_SLICE_06_ACCEPTANCE.md` |
| `2H-CLOSE-003` | delivered | `PHASE_2H_SLICE_06_ACCEPTANCE.md` |
| `2H-CLOSE-004` | delivered | `PHASE_2H_SLICE_06_ACCEPTANCE.md` |
| `2H-CLOSE-005` | delivered | `PHASE_2H_SLICE_06_ACCEPTANCE.md` |

