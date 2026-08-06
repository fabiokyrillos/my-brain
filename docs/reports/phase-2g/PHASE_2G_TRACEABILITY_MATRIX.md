# Phase 2G traceability matrix

**Generated — do not edit by hand.** `npm run docs:phase-2g:traceability`
rewrites this file and fails rather than print an unresolved claim, so an
edit here produces a status nothing checked (2G-CLOSE-001).

Delivery is evidenced by **citation**: a requirement is delivered when an
acceptance record under `docs/reports/phase-2g/` names its id. A requirement that
is not delivered must be declared in the generator with a reason and a
destination, and the generator refuses an id that is neither. A requirement
that is **partially delivered** must be declared *and* cited — the
declaration says what is still missing, the citation proves the rest landed.

- **29** requirements declared
- **27** delivered
- **2** partially delivered, each with its single remaining blocker named
- **0** not delivered, each named with a destination
- **1** of 1 budgeted migrations spent: `202608060078_phase_2g_composer_capture_source.sql`

## 2G-CREATE

| Requirement | Status | Evidence |
| --- | --- | --- |
| `2G-CREATE-001` | delivered | `PHASE_2G_SLICE_01_ACCEPTANCE.md` |
| `2G-CREATE-002` | delivered | `PHASE_2G_SLICE_01_ACCEPTANCE.md`, `PHASE_2G_SLICE_02_ACCEPTANCE.md` |
| `2G-CREATE-003` | delivered | `PHASE_2G_SLICE_01_ACCEPTANCE.md` |
| `2G-CREATE-004` | delivered | `PHASE_2G_SLICE_01_ACCEPTANCE.md` |
| `2G-CREATE-005` | delivered | `PHASE_2G_SLICE_01_ACCEPTANCE.md` |
| `2G-CREATE-006` | delivered | `PHASE_2G_SLICE_01_ACCEPTANCE.md` |

## 2G-ROUTE

| Requirement | Status | Evidence |
| --- | --- | --- |
| `2G-ROUTE-001` | delivered | `PHASE_2G_SLICE_01_ACCEPTANCE.md`, `PHASE_2G_SLICE_02_ACCEPTANCE.md` |
| `2G-ROUTE-002` | delivered | `PHASE_2G_SLICE_02_ACCEPTANCE.md` |
| `2G-ROUTE-003` | delivered | `PHASE_2G_SLICE_02_ACCEPTANCE.md` |
| `2G-ROUTE-004` | delivered | `PHASE_2G_SLICE_02_ACCEPTANCE.md` |
| `2G-ROUTE-005` | delivered | `PHASE_2G_SLICE_02_ACCEPTANCE.md`, `PHASE_2G_SLICE_04_ACCEPTANCE.md` |
| `2G-ROUTE-006` | delivered | `PHASE_2G_SLICE_02_ACCEPTANCE.md` |
| `2G-ROUTE-007` | delivered | `PHASE_2G_SLICE_02_ACCEPTANCE.md` |
| `2G-ROUTE-008` | partially delivered | `PHASE_2G_ONLINE_HARNESS_ACCEPTANCE.md`, `PHASE_2G_SLICE_02_ACCEPTANCE.md`, `PHASE_2G_SLICE_04_ACCEPTANCE.md` — delivered: the authenticated online journeys execute against the deployed project again — 80 of 87 cases pass and none fails, on a session fixture proven in both directions; **remaining: the conversational-creation journey itself (sentence → preview → confirm → task → undo) still cannot run: every turn is a provider call under BYOK and BYOK_TEST_USER_A_OPENAI_API_KEY is not provisioned** → PHASE_2G_ONLINE_HARNESS_ACCEPTANCE.md — one owner action, a disposable provider credential |

## 2G-CAPTURE

| Requirement | Status | Evidence |
| --- | --- | --- |
| `2G-CAPTURE-001` | delivered | `PHASE_2G_SLICE_03_ACCEPTANCE.md` |
| `2G-CAPTURE-002` | delivered | `PHASE_2G_SLICE_03_ACCEPTANCE.md` |
| `2G-CAPTURE-003` | delivered | `PHASE_2G_SLICE_03_ACCEPTANCE.md` |
| `2G-CAPTURE-004` | delivered | `PHASE_2G_SLICE_03_ACCEPTANCE.md` |
| `2G-CAPTURE-005` | delivered | `PHASE_2G_SLICE_03_ACCEPTANCE.md` |
| `2G-CAPTURE-006` | delivered | `PHASE_2G_SLICE_03_ACCEPTANCE.md` |

## 2G-SAFETY

| Requirement | Status | Evidence |
| --- | --- | --- |
| `2G-SAFETY-001` | delivered | `PHASE_2G_SLICE_02_ACCEPTANCE.md`, `PHASE_2G_SLICE_04_ACCEPTANCE.md` |
| `2G-SAFETY-002` | delivered | `PHASE_2G_SLICE_04_ACCEPTANCE.md` |
| `2G-SAFETY-003` | delivered | `PHASE_2G_SLICE_04_ACCEPTANCE.md` |
| `2G-SAFETY-004` | delivered | `PHASE_2G_SLICE_04_ACCEPTANCE.md` |
| `2G-SAFETY-005` | delivered | `PHASE_2G_SLICE_04_ACCEPTANCE.md` |

## 2G-CLOSE

| Requirement | Status | Evidence |
| --- | --- | --- |
| `2G-CLOSE-001` | delivered | `PHASE_2G_SLICE_04_ACCEPTANCE.md` |
| `2G-CLOSE-002` | delivered | `PHASE_2G_SLICE_04_ACCEPTANCE.md` |
| `2G-CLOSE-003` | partially delivered | `PHASE_2G_ONLINE_HARNESS_ACCEPTANCE.md`, `PHASE_2G_SLICE_04_ACCEPTANCE.md` — delivered: the authenticated journey set runs against the deployed project on disposable fixtures that are created and deleted per spec, with the funnel statement already recorded; **remaining: the conversational-creation subset of that set, for the same single credential reason** → PHASE_2G_ONLINE_HARNESS_ACCEPTANCE.md — the same owner action |
| `2G-CLOSE-004` | delivered | `PHASE_2G_SLICE_04_ACCEPTANCE.md` |

