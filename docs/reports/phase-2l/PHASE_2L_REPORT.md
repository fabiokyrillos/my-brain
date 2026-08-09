# Phase 2L — Work and execution · closing report

**PHASE 2L IS COMPLETE.** 82 requirements declared, **82 classified**, none
unclassified. **Migration budget: `1 allocated · 0 spent`.** Hosted parity is
unmoved at `202608090089`, 89 migrations. Public signup remains closed.

| | |
|---|---|
| Authorization | ADR-102 (planning), **ADR-103** (implementation through closeout; all five decisions signed) |
| Slices | 2L.0 – 2L.5, each merged with CI green on its **exact merge SHA** |
| Requirements | 82 declared · 82 classified · **0 unclassified** |
| Classification | **71 built · 5 baseline · 5 partial · 1 not-built-by-rule · 0 undelivered** |
| Migrations | **0 spent** against 1 allocated |
| Deployment | **none** — no schema changed, so none was created |
| New RPCs, write paths, grants, policies, roles, secrets | **none** |
| New telemetry event names or properties | **none** |
| Gestures | **none** |

---

## 1. What the phase actually delivers

**Work is now a surface you can work on.** Before 2L a task could be acted on in
four fixed ways from a row, or edited one at a time on its own page; there was no
selection, no bulk operation, no filtering beyond three tabs, no way back to
where you were, and no undo anywhere except inside the natural-language console.

- **Quick edit** — every verb the taxonomy admits, from the row, through the
  *same* component the detail page mounts. No second control set and no second
  write path.
- **A responsive task detail** — one implementation, mounted by its own route and
  by an intercepting route beside the list. On a narrow viewport the list is
  *removed* rather than covered, which is the difference between a surface and an
  untrapped modal.
- **Undo where operations happen** — the mechanism has existed since Phase 2E and
  exactly one surface offered it. Now the surfaces that perform the operations
  do.
- **Selection and bulk** with a preview computed from the same eligibility rule
  the apply path uses, execution that continues past a refusal, and a per-item
  result that cannot report a partial as a success.
- **Filters, ordering, grouping and return continuity**, entirely in the URL.
- **A sensitivity posture for Work**, derived from the source entry and re-read
  at presentation time.

---

## 2. The five signed decisions, and what each cost

| Decision | Signed | Outcome |
|---|---|---|
| **OD-2L-1** | option B — derive from the source entry | Delivered. Coverage is **partial by construction** and the product says so, in two places, rather than leaving it to this report |
| **OD-2L-2** | option A — three views, richer URL filters | Delivered, and it is why the migration was not needed. `workView` is untouched |
| **OD-2L-3** | option A — non-destructive, bounded-value only | Delivered. `cancel_task` is excluded *by being destructive*, so the confirmation arm is unreachable rather than unused |
| **OD-2L-4** | 50, matching `WORK_PAGE_SIZE` | Delivered, derived from the page size so the two cannot drift |
| **OD-2L-5** | option A — no gesture | Delivered, with a permanent guard that fires on a handler added "in preparation" |

**No decision was reopened, softened or worked around.** The traceability
generator refuses a matrix row that would contradict one, and that refusal is
proved by executing it.

---

## 3. What the phase found, rather than built

Four findings that were not in the plan and are worth carrying forward.

**Hoje was printing what Work had started withholding.** Found in slice 2L.1's
own diff review. `tasks` carried no classification at all before this phase, so
Hoje printing a task title was not a divergence — there was nothing to diverge
from. The moment Work began withholding one, the same task was masked on
`/app/work` and printed in full on `/app`. Fixed in the slice that created it.

**Three controls were below the minimum, and only measurement found them.** The
row's **title link** — the way into a task — computed to **16px**;
`.panel-view-all` to 18px; the relation filter's escape hatch to 12px. They were
found because the target-size locator was widened *and then run*. **A check
widened without being run would have been green about controls it never looked
at.**

**A guard's own fixture check had gone stale.** The accessibility mirror guard
sliced from one builder to `const SURFACES = [`, which passed only because that
builder happened to be last. Appending two made it read their markup.

**A vocabulary declaration moved, and the guard was updated rather than worked
around.** `workViews` moved to a client-safe module; the 2L.0 guard now reads the
new home **and** asserts the old one only re-exports. A file that did both would
have satisfied the old assertion while being two vocabularies.

---

## 4. The five partials, each with its remainder

| id | Remainder | Destination |
|---|---|---|
| `2L-BULK-011` | None in behaviour. Foreign and deleted are byte-identical; `ineligible` is deliberately distinct and reveals nothing, being reachable only for a row that came back from the caller's own resolution | Recorded in slice 2L.2's record §1; no work outstanding |
| `2L-MOBILE-008` | A real-device session | Owner-run hardware; same standing as `G-2J.4b` |
| `2L-ACCESS-008` | A real screen-reader session **and** a real-device session | Owner-run hardware |
| `2L-METRICS-005` | Selection and bulk preview have no admitting event name | The successor phase that spends a migration on the Work event vocabulary. Inventing one here would produce a producer the deployed CHECK rejects — the defect that cost `202608080087` and `202608090089` |
| `2L-CLOSE-004` | A live `migration list --linked` reading | This phase changed no schema, so it never needed one; recorded as a limitation rather than claimed as executed |

**One `not-built-by-rule`:** `2L-BULK-007`. A confirmation authorizing exactly
one previewed set has **no subject** when nothing bulk-eligible requires one —
which is what OD-2L-3 option A signed.

---

## 5. What was not executed, stated once and plainly

- **No hosted probe of any kind.** No schema changed, so there was nothing to
  verify hosted, and no deployment record was created.
- **No real device, no real screen reader, no real IME.** Every mobile assertion
  is an emulated viewport in a headless browser.
- **No authenticated online journey**, and **no hydrated interactivity** in a
  browser: CI has no Supabase session, so the reveal toggle actually revealing
  and the panel actually intercepting are proved structurally and by jsdom, not
  by a browser.
- **No bulk run and no filter against a real database.** Both are proved against
  injected clients that answer per task id — stronger than a stub, weaker than a
  probe.

None of these is rounded up anywhere in this phase's records.

---

## 6. Posture at close

| Item | State |
|---|---|
| Migrations | **89**, unchanged; hosted parity `202608090089` |
| Public signup | **closed**; the rollout gate reads **25 pass · 3 fail · 2 owner-signature**, untouched by this phase |
| `apply_task_command` call sites | **1** |
| `undo_operation` caller modules | **4** |
| Service-role on a product path | none |
| BYOK credentials spent, provider calls, rate-limit slots | **none** |
| **ADR-055** | expires **2026-10-27**, **neither satisfied nor superseded** by this phase, which adds no semantic retrieval of any kind |

---

## 7. The successor — re-audited, and stopped

Step 2L.6 is **not a slice**. It delivers no requirement, builds nothing, and
**creates no successor artifact and declares no successor requirement.** Its
findings are in `PHASE_2L_SUCCESSOR_REAUDIT.md`.

**Work stops there, for owner authorization.** Retargeting the A13 guard belongs
to *that* authorization's commit, never to this phase's closeout.
