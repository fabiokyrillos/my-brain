# Phase 2M — slice 2M.2 acceptance record

**Slice:** 2M.2 — the daily planner and `planned_at` semantics.
**Signed decisions executed against:** OD-2M-3 A (`planned_at` is an intention),
OD-2M-6 A (visible controls only), OD-2L-3 A and OD-2L-4 (bulk eligibility and
the ceiling of 50, reused).
**Migration spent:** **migration 3**, `202608110091_phase_2m_clear_planned.sql`,
authorized by **ADR-106**.
**Budget after this slice:** `3 allocated · 2 spent`, all three NON-TRANSFERABLE.
Migration 2 remains reserved exclusively for push in 2M.4b.
**Hosted parity:** **unchanged at `202608110090`.** Migration 3 is in the tree
and is **not deployed**; deployment is at the phase's deployment step.

---

## 1. The stop condition, and what was done about it

Slice 2M.1's closing record raised the third migration as the stop condition
ADR-105 declared it to be, **before a line of this slice was written**, with the
cause located in a named line (`202607270060:892-903`) and three resolutions
costed. The owner chose **(b)**: a third migration, for `clear_planned` and
nothing else. That authorization is **ADR-106**, and the budget, the PRD's
refusal list, the implementation plan's constraint 8 and the traceability
contract's R-13 were all amended in the same change — with the declarations
guard extended to assert the new budget, ADR-106's three narrowing properties,
and the contract's refusal, so the authorization cannot widen by being re-read.

**The rule moved up rather than dissolved.** A **fourth** migration is a stop
condition, so is migration 3 carrying anything but `clear_planned`, and so is
reallocating migration 2.

---

## 2. Requirements

| Requirement | Status | Evidence |
|---|---|---|
| `2M-PLAN-001` | **built** | `src/features/planning/planned-at.ts` declares the meaning, the write verbs (derived), the local-day reduction, the ordering and the words; `planned-at-declaration.test.ts` scans every non-test module for a second declaration |
| `2M-PLAN-002` | **built, not yet deployed** | migration `202608110091`; `clear-planned.test.ts` (17 cases); `supabase/tests/phase_2m_clear_planned.sql` (18 assertions) |
| `2M-PLAN-003` | **built** | `WORK_PLANNED_FILTERS`, `planned_asc`/`planned_desc`, the projection predicate and order, the filter control, `work-planned-filter.test.ts` (15 cases) |
| `2M-PLAN-004` | **built** | `/app/calendar/plan`, two lists, no composer; `planner-view.test.tsx` asserts the absence by role |
| `2M-PLAN-005` | **built** | `phase-2m-planner-authority-guard.test.ts` — no write, no RPC, no Server Action, no privileged client, no timer, no apply-from-effect |
| `2M-PLAN-006` | **built** | `planner-capacity.ts` + 8 cases; a count, declared hours, and the explicit absence of any duration |
| `2M-PLAN-007` | **built** | `planner-conflicts.ts`, three kinds, each proved reachable; 18 cases including four DST |
| `2M-PLAN-008` | **built** | the conflict region carries no button and no form; the module has no writer and mutates nothing |
| `2M-PLAN-009` | **built** | Phase 2L's `BulkBar`, `SELECTION_CEILING`, selection module and partial-result contract, reused unchanged |
| `2M-PLAN-010` | **built** | the audit row `apply_task_command` writes; this surface keeps no second record |
| `2M-TIME-004` | **built** | four DST cases, both directions, both hemispheres, in `planner-conflicts.test.ts` |
| `2M-TIME-006` | **partial** | the planner and the Work list render `planned_at` through one formatter, asserted in two suites. **Not** asserted across the calendar and the notification list. Destination: slice 2M.3 |
| `2M-MOBILE-004` | **partial** | every change is confirmed or undoable and the affordance is hoisted where the operation happened, asserted in jsdom. **Not** proved at a touch viewport |
| `2M-ACCESS-004` | **partial** | every region is labelled and the overload is a `status`; asserted in jsdom. **Not** proved by a browser lane |

---

## 3. What is NOT proved, stated as a remainder rather than rounded up

**There is no Playwright lane for the planner in this slice.** The calendar's
local lane composes the page from the real stylesheets and the exact DOM the
components emit, and it is only legitimate because
`calendar-mirror-guard.test.ts` re-derives every load-bearing class from the
component sources on each run. A planner spec without that guard would be a
fixture prettier than the value — the trap this phase has already paid for
twice — so none was written rather than one that proves less than it appears to.

**Consequence, stated plainly:** `2M-MOBILE-004` and `2M-ACCESS-004` are
**partial** for the planner, and `2M-TIME-006` is partial for the two surfaces
it does not yet cover. Their destination is slice 2M.3, which touches the same
surface and can carry one mirrored lane and one guard for both.

**A real screen reader and a real phone are not proved anywhere**, and nothing
in this slice may be cited as discharging the OD-2M-5 hardware checkpoint. **An
emulated viewport is a viewport, not a device.**

---

## 4. Defects found and fixed inside this slice

1. **`buildCanonicalPatch` would have sent an empty patch.** `clear_planned`
   carries no patch field, and the RPC *requires* the `plannedAt` key — so the
   preview would have offered a control the database then refused.
2. **The `planned_at` delta coalesced with `??`.** Null reads as absent, so a
   cleared plan would have rendered as *unchanged* while the write removed it.
   `due_at` had always tested for `undefined`; `planned_at` had never needed to,
   because until this requirement no command could send a null.
3. **The task detail rendered the planned day with `timeStyle: "short"`** — a day
   the user chose, presented as a time they reserved, which is exactly what
   OD-2M-3 A says the column is not.
4. **The Work list carried an inline locale ternary** for the same column, three
   files from a calendar that had independently decided it meant something else.
5. **All three funnel readers died at `createClient`.** See §5.

---

## 5. The obligation that could not be closed by writing a document

`scripts/phase-2k-conversation-funnel-reader.mjs` was **executed once against the
deployed project**, as required.

**It failed.** `supabaseKey is required`, before a single row was read:
`getLinkedSupabaseCredentials` returns `{ url, publishableKey, serviceRoleKey }`
and has never returned an `anonKey`. This is the **third** defect in that file
and, like the two before it, it had never fired — because nothing had ever run
it. **"Corrected" is not the same as "runnable".**

**The same defect was in Phase 2J's reader and in Phase 2M's own.** The last of
those is the **declared single consumer** of the six events migration
`202608110090` admitted, so `2M-METRICS-003` — *every declared event has a real
consumer; an event nothing reads is not delivered* — was resting on a script that
could not execute. It was found by running the neighbour and **checking rather
than assuming**.

All three are fixed. Both readers were then run against the deployed project and
**exited 0**:

| reader | result |
| --- | --- |
| `phase-2k-conversation-funnel-reader.mjs` | **executed**, exit 0, report printed, 0 events |
| `phase-2m-daily-cycle-funnel-reader.mjs` | **executed**, exit 0, report printed, 0 events |

**Recorded honestly:** each ran as a **freshly minted disposable owner**, deleted
immediately afterwards, so each reports zero events *for that owner*. That proves
**executability and the exit-code contract**. It does **not** measure the real
owner's funnel, and this record does not claim it does. Zero residue: the
accounts were deleted (`HTTP 200`) and neither reader writes anything, by design.

---

## 6. Gates

| Gate | Result |
| --- | --- |
| `npm run lint` | zero errors, zero warnings |
| `npm run typecheck` | zero errors |
| `npm test` | **5630 passed**, 0 failed — 3 files unparsed, the Windows shebang baseline, green in CI |
| `npm run build` | green; `/[locale]/app/calendar/plan` present |
| pgTAP | **written, not executed locally** — no Docker on this machine; runs in the `database` CI job |
| `supabase db lint --linked` | **not run** — it lints the *remote* schema, which does not yet contain migration 3; it belongs to the deployment step |
| Playwright | **not run for the planner** — see §3 |
| hosted parity | read live and read-only: **`202608110090`**, local `202608110091` **not applied** |

**One transient is recorded rather than suppressed.** A single full-suite run
reported one failing test that four subsequent untouched runs did not reproduce.
It occurred in the same command that had just rewritten a guard's own corpus,
which is this repository's recorded mid-write-read signature. It is named here
because a flake is a defect until it is explained, and this one has an
explanation that does not require the product to be wrong.
