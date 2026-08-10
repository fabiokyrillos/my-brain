# Phase 2M — Calendar, daily planning and notifications · implementation plan

**Status:** planning artifact. Authorized by **ADR-104** for **planning only**.
Nothing here is authorized to run. The plan is derived from
`docs/initiatives/phase-2m/PHASE_2M_PRD.md` and from
`docs/reports/phase-2m/PHASE_2M_CURRENT_EXPERIENCE_AUDIT.md`; every slice's
requirements are the PRD's, and no requirement is introduced here.

**Baseline:** `main` at `5e6174bb3f50da5f8560c5b7702642b0b1e83545`; 89
migrations; hosted parity `202608090089` (live read-only reading, 2026-08-09);
signup closed.

**Scope:** Phase 2M declares 94 requirements across thirteen families, and this
plan executes none of them — it says when each would be executed if the owner
authorizes implementation.

**Shape:** six slices plus a stop step, the same shape Phase 2L used. It differs
in two ways that both add time and both are stated rather than smoothed: it may
spend a migration, which brings back parity verification and a deployment
record; and it depends on **owner-run hardware**, which an implementer cannot
schedule.

---

## Global constraints

1. **Test-first.** A behaviour without a failing test first is not started.
2. **No second write path.** Every task mutation goes through the existing
   validated command path. A guard fails the build if a second appears.
3. **Migration before producers.** If any product event is declared, the
   migration that admits it is applied and parity-verified **before** the first
   producer exists. This repository has paid for the reverse twice
   (`202608080087`, `202608090089`).
4. **Nothing moves by itself.** No plan, task, reminder or day changes without a
   typed, confirmed operation with an audit row and, where the domain supports
   it, an undo.
5. **Nothing leaves the application** unless OD-2M-4 signs it, and then only
   content-free.
6. **Zero classification persisted.** OD-2L-1 B holds throughout.
7. **One local-day definition.** Application and database agree, and the
   agreement is tested.
8. **A ceiling is not an obligation.** Migration ceiling 2 (1 if OD-2M-4 is not
   signed for delivery; 0 if no event is declared). Spending fewer is the
   preferred outcome.
9. **CI green on the exact merge SHA** for every slice, one complete run
   (ADR-090).
10. **No emulated run may be recorded as a real-device claim.**

---

## Gates

| Gate | Meaning |
|---|---|
| **G0** | Preflight: clean worktree, `main` synced, no competing branch or PR, baseline SHA, migration count and hosted parity confirmed |
| **G1** | The slice's gating decision is **signed and published** before the slice begins |
| **G2** | Requirements declared in the PRD, tests written first |
| **G3** | Lint, typecheck, unit and behavioural suites green |
| **G4** | Playwright desktop + mobile, both locales where copy or locale is affected |
| **G5** | Accessibility lane entry or a source-derived mirror for every new surface |
| **G6** | Sensitivity: every new content surface derives and masks; convergence guard green |
| **G7** | Telemetry: vocabulary migration applied **before** producers; every event has a consumer |
| **G8** | Migration applied, `supabase db lint` clean, hosted parity read live and read-only, deployment recorded |
| **G9** | Real-device record: **executed** with device/date/observation, or **not executed** |
| **G10** | Acceptance record written; CI green on the exact merge SHA |

### Per-slice gate commands

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npx playwright test --project=desktop
npx playwright test --project=mobile
npx supabase db lint --linked --level warning   # only where a migration is spent
npx supabase migration list --linked            # read-only parity, G8 and closeout
git diff --check
```

---

## Slice 2M.0 — audit-derived foundations, decisions and guards

**Gating decisions:** OD-2M-7 (recurrence) must be signed before this slice ends;
OD-2M-1, OD-2M-2, OD-2M-3 and OD-2M-6 must be signed before 2M.1 begins.

**Requirements:** `2M-AUDIT-001` … `-008`, `2M-RECUR-001` … `-003`.

**Depends on:** nothing. This is the first slice.

**Delivers, in order:**

1. Re-derive every `planned_at` read and write at the implementation baseline
   and record divergence from the audit (`2M-AUDIT-001`). The absence of a
   read-side predicate is **re-proved by search**, not inherited.
2. Enumerate the telemetry enforcement points by name and record which a
   migration changes (`2M-AUDIT-002`).
3. Measure reminder-sensitivity derivability through `reminders.entry_id`
   (`2M-AUDIT-003`) — as input to OD-2M-1, not as a chosen answer.
4. Measure both local-day implementations across DST transitions in two
   hemispheres and record every disagreement (`2M-AUDIT-004`).
5. Decide and record the end state of each of the five inert scheduling
   preferences (`2M-AUDIT-005`).
6. Prove the push-absence assertion cannot see `public/sw.js`, and record the
   guard change any push work would require — **as a measurement**
   (`2M-AUDIT-006`).
7. Record inherited-residual destinations (`2M-AUDIT-007`).
8. Publish the signed decisions and wire the per-slice decision gate
   (`2M-AUDIT-008`).
9. Ship the recurrence guard: no recurrence field, column, parameter or expander,
   including one added "in preparation"; and re-assert the existing
   `recurrence_requested` refusal by test (`2M-RECUR-001`…`-003`).

**Tests first:** the recurrence guard's mutation cases (plant a repeat field,
prove it fires, restore, prove it passes); the two-implementation DST comparison
as a failing test before any correction.

**No product surface ships in this slice. No migration is created in it.**

---

## Slice 2M.1 — the calendar surface

**Gating decisions:** OD-2M-1, OD-2M-3, OD-2M-6 signed. OD-2M-2 signed **if any
event is to be declared** — and if so, the migration lands here, before any
producer.

**Requirements:** `2M-CAL-001` … `-011`, `2M-PRIVACY-001` … `-006`,
`2M-TIME-001` … `-003`, `2M-MOBILE-001`, `2M-MOBILE-002`, `2M-ACCESS-001` …
`-003`, `2M-ACCESS-005`.

**Depends on:** 2M.0.

**Delivers:**

1. **The migration, if OD-2M-2 spends one** — event-name CHECK, property
   validator, and the surface CHECK if `calendar` is declared — applied,
   linted, parity-verified, deployed and recorded (**G8**), **before** any
   producer exists.
2. The calendar route, outside `/app/work` and not a `workView` value
   (`2M-CAL-001`).
3. The five lanes over existing sources, with committed-versus-suggested derived
   from existing state (`2M-CAL-002`, `-003`).
4. The URL as the complete view state, with fail-closed **narrower** defaults and
   a declared navigation bound (`2M-CAL-004`, `-005`, `-006`).
5. Day, week and agenda orientations; the mobile default chosen and recorded;
   anchor preserved across orientation change (`2M-CAL-007`).
6. Open-and-return through the existing continuity contract (`2M-CAL-008`).
7. Reschedule through the **existing** command path, with confirmation, truthful
   partial results and undo where the operation happened (`2M-CAL-009`, `-010`).
8. Sensitivity: `calendar` joins `GOVERNED_SURFACES` in the same change that
   ships its first consumer; tasks derive through `task-derivation.ts`; reminders
   per OD-2M-1 (`2M-PRIVACY-001` … `-006`).
9. Timezone: one local-day definition, a true local day end, boundaries computed
   from `profiles.timezone` (`2M-TIME-001` … `-003`).
10. Universal states, keyboard operability, programmatic structure, focus
    management, non-colour-only distinctions.

**Tests first:** the URL fail-closed matrix (unknown, malformed, out-of-range,
foreign id → default, never wider); a derived-sensitivity negative case (a task
whose source is absent from the map renders most-protective); the DST day-length
case; the no-gesture guard extended to calendar files if OD-2M-6 signs A.

---

## Slice 2M.2 — the daily planner and `planned_at` semantics

**Gating decisions:** OD-2M-3 signed.

**Requirements:** `2M-PLAN-001` … `-010`, `2M-TIME-004`, `2M-TIME-006`,
`2M-MOBILE-004`, `2M-ACCESS-004`.

**Depends on:** 2M.1 (the calendar's lane contracts and the sensitivity wiring).

**Delivers:**

1. One declared meaning for `planned_at`, in one module, read by every surface
   (`2M-PLAN-001`).
2. `clear_planned` through the existing validated command path, closing the
   asymmetry with `clear_due` (`2M-PLAN-002`).
3. Read-side semantics: a filter and an ordering, **within** the three-view Work
   taxonomy as filters, never as a fourth view (`2M-PLAN-003`).
4. The planner surface — choose today's focus from what exists, create nothing
   implicitly (`2M-PLAN-004`).
5. **Nothing moves by itself** (`2M-PLAN-005`), enforced by a guard as well as by
   review.
6. Overload and conflict made visible, named, and never auto-resolved
   (`2M-PLAN-006`, `-007`, `-008`).
7. Multi-item planning reusing Phase 2L's selection, preview, ceiling of 50 and
   partial-result contracts (`2M-PLAN-009`).
8. Full provenance on every planning write (`2M-PLAN-010`).

**Tests first:** a test that fails if any planner code path writes without a
confirmation token; the conflict enumeration as a table-driven test; DST
transition tests in both directions and both hemispheres.

---

## Slice 2M.3 — reviews, closure, and the inert preferences

**Gating decisions:** the `2M-AUDIT-005` end-state record is published.

**Requirements:** `2M-REVIEW-001` … `-008`, `2M-TIME-005`, `2M-ACCESS-006`.

**Depends on:** 2M.2 (planning operations are what a review acts through).

**Delivers:**

1. The daily review flow and the next-day flow, composed from existing records,
   stating plainly what could not be read (`2M-REVIEW-001`, `-002`).
2. Review-to-action: carry-forward, reschedule, plan, archive, follow-up — each
   an explicit, typed, confirmed operation on the existing command path
   (`2M-REVIEW-003`).
3. A guard that fails the build if any review path acquires a direct write
   (`2M-REVIEW-004`).
4. Truthful results, partial results, undo where supported, explicit
   irreversibility where not (`2M-REVIEW-005`).
5. The five inert preferences reach their declared end state; the settings
   surface never offers a control that changes nothing (`2M-REVIEW-006`).
6. The *"nothing runs from a configured schedule"* copy is either corrected in
   the same change or re-asserted by a test (`2M-REVIEW-007`).
7. Review content renders through `review_summary` (`2M-REVIEW-008`).

**Tests first:** the direct-write guard; a test that a settings control without a
consumer fails; a timezone-change test across every dated surface.

**Note.** Review generation is an existing provider call and is **unchanged**.
If any part of this slice would introduce a new model call, it stops and asks —
cost, consent and provenance are a separate decision.

---

## Slice 2M.4 — notification consent, content and frequency

**Gating decisions:** **OD-2M-4 signed.** If it signs option A (no outbound
delivery), this slice ships the governance half and `2M-NOTIFY-011` closes the
outbound half `not-built-by-rule`. If it signs option B, this slice **splits**:
2M.4a governance, 2M.4b delivery with its own migration and its own security
review.

**Requirements:** `2M-NOTIFY-001` … `-011`, `2M-MOBILE-003`, `2M-MOBILE-005`.

**Depends on:** 2M.3.

**Delivers (2M.4a — governance, always):**

1. An explicit consent record with a declared shape, a recorded time and a
   one-step revocation (`2M-NOTIFY-001`, `-002`).
2. No permission requested on first load, on sign-in, or from an unrelated
   surface (`2M-NOTIFY-003`).
3. Per-type, per-frequency and quiet-period controls, each with a consumer that
   reads it (`2M-NOTIFY-004`).
4. Quiet hours, the daily cap, the 24-hour cooldown and deduplication proved
   **per channel** rather than inherited (`2M-NOTIFY-005`).
5. The content prohibition enforced **by construction**, plus a guard against a
   content-carrying parameter on the payload or on `notificationCopy`
   (`2M-NOTIFY-006`, `-007`).
6. In-app rows remain where content is shown, and any change to what they carry
   is deliberate and recorded (`2M-NOTIFY-008`).
7. Delivery auditability and distinguishable revoked / expired / failed states
   with bounded retry (`2M-NOTIFY-009`, `-010`).

**Delivers (2M.4b — only if OD-2M-4 signs B):** the consent/subscription
migration, the sender, the `push` handler added to the **already-registered**
`public/sw.js` with its update-ordering and stale-worker behaviour defined, the
permission UX, and quiet-hours enforcement **at send time**. Blocks closeout on
**G9**.

**Tests first:** a guard that fails on any permission request outside the
designated surface; a payload-shape test that fails if a content field is added;
per-channel quiet-hours tests.

---

## Slice 2M.5 — accessibility closure, telemetry, real device, security and closeout

**Requirements:** `2M-ACCESS-007`, `2M-METRICS-001` … `-006`, `2M-DEVICE-001` …
`-005`, `2M-TIME-007`, `2M-CLOSE-001` … `-006`, and the closing classification
of every family.

**Depends on:** 2M.4.

**Delivers:**

1. The accessibility lane closed for every new surface; the owner-run
   screen-reader session recorded as executed or not executed
   (`2M-ACCESS-006`, `-007`).
2. Telemetry: every declared event has a **real consumer**; the measurement
   questions were stated before the producers; no property can carry content; and
   if no migration was spent, the dependent requirements close
   `not-built-by-rule` with a destination (`2M-METRICS-001` … `-006`).
3. Real-device verification per OD-2M-5: the hardware-dependent list, the
   blocks-slice versus blocks-closeout split, the iOS Safari and Android Chrome
   checklists, and the executed/not-executed record — including the two inherited
   Phase 2L residuals (`2M-DEVICE-001` … `-005`).
4. The no-fixed-offset guard over the surfaces it names (`2M-TIME-007`).
5. Closeout: generated classification, real remainders, budget reconciliation,
   a **live** parity reading, named residual destinations, and the successor
   **not started** (`2M-CLOSE-001` … `-006`).

---

## Step 2M.6 — successor re-audit, then stop

Not a slice. Delivers no requirement, creates no successor artifact, declares no
successor requirement and does not retarget the phase-start guard — that belongs
to the successor's own authorizing commit. It reports what Phase 2M changed under
the successor's feet, restates ADR-055's **2026-10-27** expiry as neither
satisfied nor superseded, and stops.

---

## Deployment

- **If no migration is spent:** nothing is deployed; the closing record says so
  and the live parity reading proves it.
- **If a migration is spent:** it is applied and linted locally, deployed, and
  **hosted parity is read live and read-only** with the reading recorded by date
  — before the producers that depend on it exist, and again at closeout.
- No Edge Function change is planned. If one becomes necessary, edge parity is
  verified explicitly rather than assumed.

---

## Traceability

Closeout regenerates the classification **from the slice records**, never typed.
The refusals are `docs/reports/phase-2m/PHASE_2M_TRACEABILITY_CONTRACT.md`. The
matrix is created **only at closeout**, and nothing in this plan may create an
acceptance report, a final matrix or a closing report before its gate.

---

## Independent review

Before the closing report, an independent pass re-reads the classification
against the requirement text — not against the slice's own summary — and checks
specifically for: a `partial` whose remainder is vacuous, a claim that was argued
rather than proved, a real-device claim that was not executed, an event with no
consumer, and a producer that predates its migration. Each of those has been a
real defect in this repository, and three of them were found only by such a pass.

---

## Final verification checklist

- [ ] Every declared requirement classified exactly once, by the generator
- [ ] No `partial` with a vacuous remainder
- [ ] Migration budget reconciled; nothing outside it
- [ ] Every producer post-dates its migration
- [ ] Every declared event has a consumer
- [ ] Every real-device claim executed, or recorded as not executed
- [ ] No notification content outside the application
- [ ] Timezone and DST proved, both implementations agreeing
- [ ] No recurrence anywhere, including "in preparation"
- [ ] Every gesture-reachable action also reachable visibly and by keyboard
- [ ] Hosted parity read live at close
- [ ] Signup and rollout untouched
- [ ] Successor **not started**
