# Phase 2L — Work and execution · implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL — use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to execute this plan slice by slice.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** **implementation authorized through closeout by ADR-103** (2026-08-09),
which also signs the five owner decisions. Planning was authorized by ADR-102.

**What ADR-103 does not authorize:** any migration; any deployment; any database, RLS,
grant, policy or Auth change; a new RPC or a second write path; opening public signup;
executing a rollout residual; spending a BYOK credential or calling any provider; and
**planning, scoping, naming or starting any successor phase.**

**Derived from:** `PHASE_2L_PRD.md` (82 requirements, ten families).
**Evidence:** `docs/reports/phase-2l/PHASE_2L_CURRENT_EXPERIENCE_AUDIT.md`,
`..._UX_GAPS_AND_OPPORTUNITIES.md`, `..._THREAT_MODEL.md`,
`..._TRACEABILITY_CONTRACT.md`.

**Architecture.** **Six vertical slices, 2L.0–2L.5, plus one closing step, 2L.6.**
2L.6 is deliberately **not** a slice: it delivers no requirement, builds nothing and
exists only to re-audit the successor and stop. Every count of "six slices" in this
package means 2L.0–2L.5. Each slice is independently closeable: it
delivers user-visible behaviour, carries its own tests, its own accessibility entries
and its own acceptance record, and is merged before the next begins. **The
accessibility lane is entered in the slice that builds the surface, never at
closeout** — deferring it is what produced Phase 2I's partial and Phase 2J found a
real defect on the lane's first execution.

**Tech stack.** The repository's current stack as proven at the 2L.0 baseline.
Next.js 16 App Router — **read the relevant guide under `node_modules/next/dist/docs/`
before writing any framework-level code**; TypeScript strict; React; Supabase /
PostgreSQL / RLS; Vitest; Playwright (desktop + Pixel 7).

---

## Global constraints

- Current code, migrations, hosted state and permanent decisions outrank this plan.
- **No second task-mutation write path.** Everything routes through
  `public.apply_task_command` via the existing `work-command.ts` /
  `detail-command.ts` modules.
- **No set-valued RPC** (ADR-057). Bulk is iteration over the single-item authority.
- **No stored per-user view state** (`2L-VIEW-007`). The URL is the state.
- **No new RLS policy, grant, role, secret, external service or service-role client.**
- **No provider call, no AI operation, no rate-limit slot** anywhere in this phase.
- User content never enters telemetry — not a title, description, note, name, filter
  value or search term.
- Migration ceiling **ONE**, allocated to slice 2L.3 only, non-transferable;
  `1 allocated · 0 spent` is the preferred close.
- Every requirement ends in exactly one of: `built`, `baseline`, `partial`,
  `not-built-by-rule`, `undelivered`. `Complete`, `green`, `deployed` and `verified`
  are evidence claims, not synonyms for a document existing.
- A limitation is never upgraded to a pass. A check that was not executed is reported
  as not executed.

## Gates

| Gate | Meaning |
|---|---|
| **G0 — preflight** | Correct repository, branch, clean worktree, fetched remote, exact base SHA, no unrelated changes. |
| **G1 — current truth** | Slice 2L.0's measurements executed and any divergence from the audit recorded, before product code. |
| **G2 — reconciliation** | Every parent-roadmap item classified (done in the audit §5; re-confirmed at 2L.0 against the implementation baseline). |
| **G3 — owner decisions** | **DISCHARGED by ADR-103**: all five signed — OD-2L-1 **B**, OD-2L-2 **A**, OD-2L-3 **A**, OD-2L-4 **50**, OD-2L-5 **A**. No requirement is blocked or gated on an unsigned decision. |
| **G4 — planning convergence** | PRD, plan, threat model, traceability contract, gaps and budget agree. Discharged by the corrected planning package. |
| **G5 — implementation authorization** | **DISCHARGED by ADR-103.** |
| **G6 — slice acceptance** | Tests first and red for the right reason; focused green; lint and typecheck zero-error; full suite; build; `git diff --check`; full diff review; PR-head CI green; merge; exact-merge-SHA CI green (ADR-090: green ×1); acceptance record. |
| **G7 — independent closeout** | All 82 classified from executed evidence by a generator that refuses rather than prints an unresolved claim. |
| **G8 — hosted parity** | Only if a migration is spent: exact merged bytes, chain order, negative controls, RLS/grants, producer→consumer behaviour, zero fixture residue. **With OD-2L-2 signed as A, no migration is expected and no deployment may be invented.** |
| **G9 — successor review** | Re-audit the successor against the closed product, present amendments, and **stop for owner authorization**. |

### Per-slice gate commands

```powershell
npm run lint
npm run typecheck
npx vitest run <the slice's own test files>     # focused
npm test                                        # full
npm run build
npx playwright test e2e/accessibility.spec.ts --project=desktop
npx playwright test e2e/accessibility.spec.ts --project=mobile
git diff --check
```

Windows local baseline: three test **files** fail to load (shebang parse) and the run
reports fewer tests than CI. That is a known local baseline, green in CI; it is never
a reason to accept a red suite, and chain guards only speak in CI.

---

## Slice 2L.0 — audit-derived foundations, decisions and guards

**Delivers:** measurement, decisions and the guards later slices are held to. **Zero
product code, zero migrations.**

**Requirements:** `2L-AUDIT-001…006`.

**Depends on:** G5.

**Likely files**
- Create: `docs/reports/phase-2l/PHASE_2L_SLICE_00_ACCEPTANCE.md`.
- Create: `src/lib/closeout/phase-2l-work-authority-guard.test.ts` — the
  no-second-write-path guard, proved **red against a planted second path before**
  any slice writes one.
- Create: `src/lib/closeout/phase-2l-vocabulary-guard.test.ts` — enumerates every
  enforcement point of the Work event vocabulary **by name** and fails if a new copy
  appears.
- Read only: `taxonomy.ts`, `detail-controls.ts`, `work-projection.ts`,
  `202607170024`…`202608090089` for the `workView` enum, `database.types.ts` for the
  `tasks` columns.

**Authority reused:** none written; this slice measures.

**Tests first**
- [ ] A guard that fails when a second task-mutation write path exists, proved red
      against a planted call site before it is made green.
- [ ] A guard that fails when the Work event vocabulary gains a copy, proved red
      against a planted duplicate.
- [ ] A derivation test asserting the editable field set comes from `actionPolicy`
      rather than from a literal list.

**Steps**
- [ ] **M1 — the authority census.** Re-derive statuses, actions, policies,
      eligibility and undo strategies from the repository; diff against audit §1.5;
      record divergence. (`2L-AUDIT-001`, `2L-AUDIT-002`)
- [ ] **M2 — the bulk cost measurement.** Establish, by construction and by test, how
      many round trips, audit rows and undo rows an *n*-item iteration produces, and
      whether any per-item failure can leave a state the domain cannot describe.
      **Confirms** the signed ceiling of 50 is safe, and stops if it is not.
      (`2L-AUDIT-003`)
- [ ] **M3 — the view enforcement census.** Name every enforcement point of the
      `workView` value set — application constant, table CHECK, property validator —
      and state which a new view would require changing. **A count is not the
      measurement; the names are.** **Confirms** that OD-2L-2 option A needs no
      migration. (`2L-AUDIT-004`)
- [ ] **M4 — the derived-sensitivity contract.** Read the `tasks` columns and the
      `source_entry_id` relationship, then **fix the executable contract OD-2L-1
      option B requires**: how the source classification is read, owner-scoped and
      bounded per page; what a manual task resolves to; and what a removed,
      inaccessible or foreign source resolves to. This is the one place 2L.0 may
      produce an executable foundation contract rather than only a measurement.
      (`2L-AUDIT-005`)
- [ ] **M5 — residual disposition.** Record which inherited residuals belong to this
      phase and which leave it, with a destination for each. (`2L-AUDIT-006`)

**Gate G-2L.0.** All five measurements executed and recorded; the guards proved red
before green; the derived-sensitivity contract fixed; **82 requirements extracted
mechanically with no duplicate and no unclassifiable family name**; zero migrations.
Any divergence from the signed decisions is a **stop**, not an adjustment.

**Acceptance record:** `PHASE_2L_SLICE_00_ACCEPTANCE.md`.

---

## Slice 2L.1 — quick edit, responsive task surface, and undo where it belongs

**Delivers:** editing a task without leaving the list; a task detail that is a panel on
wide screens and a full surface on narrow ones; and an undo affordance on the surfaces
where operations are actually performed.

**Requirements:** `2L-EDIT-001…010`; `2L-PRIVACY-001…008` (OD-2L-1 option B);
`2L-ACCESS-001…004`, `2L-ACCESS-006`, `2L-ACCESS-007` for the surfaces it builds.

**Depends on:** 2L.0. OD-2L-1 is signed as **option B**, so the derived-sensitivity contract is part of this slice rather than a question it waits on.

**Likely files**
- Modify: `src/features/operations/task-list.tsx`,
  `src/features/operations/work-item-actions.tsx`,
  `src/features/daily-cycle/task-detail-view.tsx`,
  `src/app/[locale]/app/work/[taskId]/page.tsx`, `src/app/operations.css`.
- Create: `src/features/operations/quick-edit.tsx` (or equivalent) and its tests;
  `src/features/operations/copy.ts` — the typed copy module the surface currently
  lacks; an undo affordance component and its tests.
- Modify: `e2e/accessibility.spec.ts` — Work list, quick edit and task detail fixtures
  added to `SURFACES`.
- **Not modified:** `taxonomy.ts`, `apply.ts`, `work-command.ts`,
  `detail-command.ts`, any migration.

**Authority reused:** `applyTaskDetailCommand` → `list_task_command_candidates` →
`public.apply_task_command`; `detailControlFor`/`buildDetailPatch` for shape and
bounds; `loadTaskCommandUndoOperation` → `public.undo_operation` for the undo.

**Tests first**
- [ ] Editable fields are derived from `actionPolicy`; a planted hand-written list
      fails.
- [ ] Each of the four declared value refusals renders its own localized sentence in
      both locales.
- [ ] A stale pre-state refuses and offers refresh; it never overwrites.
- [ ] A repeated submission under one operation key replays and says so.
- [ ] The undo control renders while the operation is undoable, **disappears** when
      the row is spent or expired, and never renders for an operation with no domain
      reversal — each proved against a fixture in that exact state.
- [ ] A destructive verb cannot be applied from a quick-edit control; the control
      opens the server-issued confirmation.
- [ ] Panel and full-screen render from one component; a viewport change does not
      change the control set.
- [ ] **OD-2L-1 option B, proved in the list and in the detail, from one contract:**
      a task whose source entry is `highly_sensitive` is masked in place with a
      working local reveal; a task whose source is `normal` is not; a **manual** task
      resolves to *no derivable classification* and is never silently treated as
      `normal`; and a **removed, inaccessible or foreign** source resolves to the most
      protective presentation, byte-identically across all three causes.
- [ ] The derived classification is **re-read, never stored** — proved by asserting no
      write occurs on the read path and no new persisted copy of a title, description
      or source content exists.
- [ ] The derivation is bounded **per page**, not per user, and adds no service-role
      path, no grant and no `security definer` helper.

**Gate G-2L.1.** Focused suite green; full gate; accessibility lane green at both
viewports **including the new Work entries**; locale-ternary ceiling not raised;
diff review; **zero migrations**.

---

## Slice 2L.2 — selection and bulk actions with true partial results

**Delivers:** explicit multi-selection, a preview computed from the same eligibility
rules the apply path uses, confirmation where the policy requires it, execution that
continues past a refusal, and a per-item result.

**Requirements:** `2L-BULK-001…012`; `2L-ACCESS-001…006` for the selection bar, the
preview and the result; `2L-PRIVACY-004`.

**Depends on:** 2L.1 (it reuses the outcome vocabulary and the copy module). OD-2L-3
is signed as **option A** and OD-2L-4 as **50**, so both are inputs rather than gates.

**Likely files**
- Create: `src/features/operations/selection.ts` (pure selection model + bounds),
  `src/features/operations/bulk-preview.ts` (pure; eligibility partition),
  `src/features/operations/bulk-result.ts` (pure; the partial-result shape),
  the selection bar / preview / result components, and their tests.
- Modify: `src/features/operations/actions.ts` — **one** Server Action that iterates
  the existing apply path; no new RPC.
- Modify: `e2e/accessibility.spec.ts`.
- **Not modified:** any migration; `apply.ts`; `taxonomy.ts`.

**Authority reused:** the same `applyWorkCommand`/`applyTaskDetailCommand` path, once
per item, each with its own operation key.

**Tests first**
- [ ] The bulk-eligible operation set is **derived** from `actionPolicy`; a planted
      hand-written list fails; **`cancel_task` is absent, asserted by name**, and the
      set is exactly status-within-active, priority, due date, planned date and
      authorized relation assignment (OD-2L-3 A).
- [ ] The preview's eligible/refused partition equals what the apply path decides —
      asserted by driving both over the same fixtures, not by re-implementing the
      rule.
- [ ] **The middle item fails and the rest still apply.** The canonical test: *n*
      items, item *k* refused, result reports *n-1* applied and 1 refused with its
      reason, and the applied items are actually applied.
- [ ] Every item failing is reported as a total failure, not as a silent success.
- [ ] A confirmation for set A cannot be consumed for set B, for a different
      operation, or a second time.
- [ ] **The ceiling is 50** (OD-2L-4): selecting a 51st item is **refused with a
      stated reason**, never silently truncated, and the bound is visible before it is
      reached.
- [ ] A foreign, deleted or ineligible id produces an outcome that is **byte-identical**
      across those three causes.
- [ ] Undo after a bulk applies to the applied subset only and never claims an item
      that was not applied.
- [ ] The result announces once and does not move focus per item.

**Gate G-2L.2.** All of the above green; full gate; accessibility lane green at both
viewports including selection, preview and result; **the partial-result test is a
release blocker** — a bulk action that reports a partial as a success is the phase's
signature failure mode; **zero migrations**.

---

## Slice 2L.3 — Work views, filters, ordering, grouping, and return continuity

**Delivers:** the canonical taxonomy, URL-expressible narrowing within a view, and a
back affordance that returns the user to exactly where they were.

**Requirements:** `2L-VIEW-001…009`; `2L-RETURN-001…005`; `2L-ACCESS-001…005`.

**Depends on:** 2L.1. **OD-2L-2 is signed as option A**, so the taxonomy stays at
`today`/`all`/`waiting` and every additional destination is a filter within them.

**Migration allocation: none is spent.** The single allocation lapses unspent, which
is the signed outcome. **If any part of this slice appears to need a migration, the
slice stops and presents the case — it does not drift to option B.**

**Likely files**
- Modify: `src/features/daily-cycle/work-projection.ts` — the declared taxonomy,
  filter/order/group parsing, all fail-closed to declared defaults.
- Modify: `src/features/daily-cycle/work-view.tsx`,
  `src/features/daily-cycle/task-detail-view.tsx` (the back link),
  `src/app/[locale]/app/work/page.tsx`, `.../work/[taskId]/page.tsx`,
  `src/features/shell/pagination-links.tsx` if it must carry more parameters.
- Create: `src/features/operations/work-position.ts` — the return payload, `.strict()`,
  navigation identifiers only; and its tests.
- **Not created:** any migration; a fourth `workView` value; a saved-view table; a
  preference column; an index. OD-2L-2 is signed as **option A**, so this slice's
  allocation lapses unspent and the file list has no SQL in it at all.

**Tests first**
- [ ] Every taxonomy member is declared in one module and consumed everywhere; a
      second declaration fails the build.
- [ ] An unknown/malformed/foreign view, filter, order or group parameter resolves to
      the declared default and **never widens** the result set — proved per parameter.
- [ ] View + filter + order + group + page compose; each is preserved across the
      others.
- [ ] The return payload is `.strict()` and refuses, **by name**, every field that
      could authorize: confirmation id, operation key, `issuedAt`, `observedBefore`,
      fingerprint, patch, preview, mutation, session, expected — each proved against a
      planted instance, in the shape `2K-CONT-003` established.
- [ ] Returning issues a **fresh owner-scoped query**; a planted stale snapshot is not
      rendered.
- [ ] A no-longer-valid position resolves to the nearest valid one **and says so**.
- [ ] **`workView` is unchanged and unwidened**, asserted against the application
      constant and the deployed validator's declared values by name — so a fourth
      view cannot arrive without the guard noticing.

**Gate G-2L.3.** All of the above green; full gate; accessibility lane green;
**budget reconciled in this slice's acceptance record as `1 allocated · 0 spent`**.
There is no migration and therefore no deployment and no G8 — and inventing either
would be the fabrication this gate exists to prevent.

---

## Slice 2L.4 — mobile Work interaction

**Delivers:** thumb reach, bounded density, stable selection, no hover dependency, and
— only if OD-2L-5 selects option B — one gesture that accelerates a visible control.

**Requirements:** `2L-MOBILE-001…010`; `2L-ACCESS-001…007` re-run for the mobile
layouts.

**Depends on:** 2L.2 and 2L.3. **OD-2L-5 is signed as option A — no gesture.**

**Likely files**
- Modify: `src/app/operations.css` (the mobile breakpoints; `.list-row` was authored
  for a ~1036px stack and says so at `operations.css:99`), the selection bar and row
  components.
- Modify: `e2e/accessibility.spec.ts` — mobile-specific fixtures.
- Create: `src/lib/closeout/phase-2l-no-gesture-guard.test.ts` — the permanent guard
  proving no touch, pointer, drag or swipe handler exists on a Work surface.
- **Not created:** any gesture handler, including one added "in preparation" for a
  later phase. OD-2L-5 is signed as **option A**.

**Tests first**
- [ ] Every control on every Work surface measures at or above the minimum **from
      paint** at the mobile viewport — the check that caught the 16px Phase 2I defect.
- [ ] No action is reachable only on hover; a hover-only affordance fails.
- [ ] Selection survives scroll, re-render, orientation change and keyboard
      appearance; the count is announced when it changes.
- [ ] The page body never scrolls horizontally at the mobile viewport, and every
      row's primary action is reachable without horizontal scrolling.
- [ ] **No gesture exists** (OD-2L-5 A): a permanent guard walks the Work surfaces
      for a touch, pointer, drag or swipe handler and fails on one — proved red
      against a planted handler before it is made green, including a handler added
      "in preparation".
- [ ] Every Work surface reflows at **200% zoom** and at **320 CSS px** with no lost
      content, no unreachable control and no clipped text.
- [ ] **IME composition** is never submitted mid-composition, never treated as a
      completed value, and never discarded by a re-render.

**Gate G-2L.4.** All of the above green at the mobile project; full gate;
**a real-device claim is never made** — `2L-MOBILE-008` and `2L-ACCESS-008` require
this to be reported as an emulated viewport; **zero gestures**; **zero migrations**.

---

## Slice 2L.5 — accessibility closure, telemetry, security and closeout

**Delivers:** the accessibility lane consolidated, content-free Work telemetry with a
consumer, the threat model closed, and the phase classified.

**Requirements:** `2L-ACCESS-001…008`; `2L-METRICS-001…007`; `2L-CLOSE-001…007`.

**Depends on:** 2L.1–2L.4.

**Likely files**
- Modify: `src/features/product-analytics/contracts.ts` and its interaction-event
  producers — **only** with values the deployed vocabulary already admits, unless the
  2L.3 migration was spent and carried them.
- Create: `src/lib/closeout/phase-2l-telemetry-guard.test.ts`,
  `src/lib/closeout/phase-2l-traceability.test.ts`,
  `scripts/generate-phase-2l-traceability.mjs`.
- Create: `docs/reports/phase-2l/PHASE_2L_TRACEABILITY_MATRIX.md` and
  `PHASE_2L_REPORT.md` — **from executed evidence only, at this gate and not before**.
- Modify: `docs/STATE.md`, `docs/TODO.md`, `docs/CHANGELOG.md`,
  `docs/reports/README.md`.

**Tests first**
- [ ] Every declared event's properties are closed enums, booleans or bounded counts;
      a planted free-text property fails.
- [ ] Every declared event is **written through the production writer**, so a declared
      but unwritable vocabulary cannot reach a deployment. This is the test whose
      absence cost `202608080087` and `202608090089`.
- [ ] Every declared event has a consumer; a producer with no consumer fails.
- [ ] The vocabulary's enforcement points are enumerated **by name** and proved to name
      one vocabulary.
- [ ] The traceability generator **refuses** against a mutated repository: an
      unclassified requirement, a duplicate id, a citation that does not resolve, a
      partial with no remainder, a hosted claim with no execution, and a limitation
      classified as a pass — each proved to refuse.

**Gate G-2L.5 / G7.** The generator emits only after refusing on real findings; every
requirement classified once; every unexecuted check reported as unexecuted; budget
reconciled per slice; rollout gate re-read live and reported unchanged; ADR-055's
2026-10-27 expiry restated as neither satisfied nor superseded.

---

## Step 2L.6 — successor re-audit, then stop

**Not a slice.** It delivers no requirement, builds nothing, and **creates no
successor artifact and declares no successor requirement.**

- [ ] Re-audit the roadmap successor's candidate scope against the newly closed
      product.
- [ ] Present: what 2L changed that the roadmap did not anticipate; which successor
      items are already built or baseline; which conflict with a signed decision;
      newly discovered product, privacy, cost or migration decisions; a revised slice
      order and estimate; inherited residuals and whether they belong there.
- [ ] **Stop for owner authorization.** Retargeting the A13 guard is part of *that*
      authorization's commit, never of this phase's closeout.

---

## Deployment

**There is nothing to deploy.** OD-2L-2 is signed as option A, so no migration exists,
hosted parity stays `202608090089`, and **no deployment record may be created**.
Inventing a deployment for a phase that changed no schema would be a fabricated
evidence claim, and `2L-CLOSE-004` requires the parity line to come from a live reading
rather than from a filename either way.

Hosted *probes* remain permitted where a requirement genuinely needs one — owner scope,
RLS, producer→writer→consumer, negative controls, partial-bulk behaviour, idempotency —
executed on disposable fixtures with **zero residue proved owner-scoped**, with no BYOK
credential, no provider call, no signup change and no service-role on a product path.

---

## Traceability

| Slice | Requirements | Migrations |
|---|---|---|
| 2L.0 | `2L-AUDIT-001…006` | 0 |
| 2L.1 | `2L-EDIT-001…010`, `2L-PRIVACY-001…008` | 0 |
| 2L.2 | `2L-BULK-001…012` | 0 |
| 2L.3 | `2L-VIEW-001…009`, `2L-RETURN-001…005` | **0** — OD-2L-2 A; the allocation lapses unspent |
| 2L.4 | `2L-MOBILE-001…010` | 0 |
| 2L.5 | `2L-ACCESS-001…008`, `2L-METRICS-001…007`, `2L-CLOSE-001…007` | 0 |
| 2L.6 *(step, not a slice)* | none — it delivers no requirement | 0 |

**6 + 10 + 8 + 12 + 9 + 5 + 10 + 8 + 7 + 7 = 82.** Every declared requirement has
exactly one slice. `2L-ACCESS` is executed *per slice* and *closed* in 2L.5; that is
an execution note, not a second assignment.

---

## Independent review

Before the owner is asked for closeout acceptance, the package and the executed
evidence must be reviewed by something that did not write them — a second pass whose
brief is to find a requirement classified more generously than its evidence supports.
Phase 2K's own record is the argument: six of its twelve defects were in guards,
probes and tooling rather than in the product, and its requirement count was wrong in
five documents until it was extracted mechanically.

---

## Final verification checklist

- [ ] Every parent-roadmap Etapa 4.1–4.3 item has a destination: delivered, narrowed
      with a reason, or rejected with a reason.
- [ ] Every declared requirement classified exactly once, from executed evidence.
- [ ] Every partial and undelivered item names its remainder, owner and destination.
- [ ] Migration budget reconciled per slice; a zero-spend close reported as legitimate.
- [ ] Every destructive operation proves preview, authority, confirmation, truthful
      result and its real undo semantics.
- [ ] Every bulk operation proves partial-result truth on a mixed set.
- [ ] Every gesture, if any, proves a visible equivalent.
- [ ] No telemetry property carries user content.
- [ ] Accessibility proved at both viewports on every Work surface; real-device and
      screen-reader sessions reported as executed or not executed.
- [ ] Signup rollout gate re-read live and reported unchanged.
- [ ] No successor phase started, scoped or named.
