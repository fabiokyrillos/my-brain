# Phase 2M — successor re-audit

**`2M-CLOSE-006`. This is a report, not a plan.** It declares no requirement,
creates no governing artifact, allocates no migration, authorizes no
implementation, and does not retarget the phase-start guard. Retargeting belongs
to the successor's own authorizing commit and to nothing else.

Written 2026-08-12, against the product as it stands at the close of Phase 2M.

---

## 1. What the successor was described as, before this phase ran

`docs/initiatives/product-ux/PHASE_2K_2O_MASTER_IMPLEMENTATION_PLAN.md` Task 7
describes the roadmap successor as consuming *"source, explanation, continuity,
Work, and calendar contracts"* and auditing **identity, mentions, entity merging,
provenance, memory lifecycle, sensitivity, file processing, deletion, and graph
feasibility**. It is explicitly planning-only and requires the owner's
authorization before any artifact is created.

Nothing below changes that description. It records what moved underneath it.

---

## 2. What Phase 2M changed under the successor's feet

**A calendar contract now exists, and it is derived rather than stored.** Every
calendar item comes from records that already existed; no new commitment type was
created. A successor auditing entity provenance inherits a surface that reads
tasks, reminders and entries through one projection.

**Sensitivity is derived from the source entry and is not a column.** OD-2L-1 B
refused a persisted classification and Phase 2M held that line: the calendar, the
planner and the day review all inherit sensitivity from the entry a task came
from. Any successor work on sensitivity inherits a *derivation*, not a field —
and inherits the consequence that a surface rendering a task title is inside that
contract whether it knows it or not.

**`planned_at` has one declared meaning for the first time.** It is an
*intention*, distinct from a deadline, under OD-2M-3 A. It was previously written
by nothing and read by nothing. A successor touching Work, planning or provenance
now has a second dated axis to account for, with a guard that keeps its meaning
single.

**There is one local-day contract**, replacing three implementations. Any dated
feature the successor adds should route through `src/lib/time/local-day.ts`
rather than growing a fourth.

**Telemetry gained a `calendar` surface and six events**, all with real
producers and readers. The product-events vocabulary now has **three copies** —
the CHECK, the validator and the writer's own list — and a successor adding an
event must move all three.

**Push exists as an egress path.** This is the first time user-linked data leaves
the product to a third party. It is opt-in, content-free by construction, and
governed by six controls applied in SQL before anything is sent. A successor
auditing deletion or privacy inherits a subscription table, a delivery ledger and
a retention window that reuses the signed 90 days rather than minting one.

**Two surfaces were shipped and did not work for the whole of the phase**, which
is a fact about the test estate rather than about those surfaces: a
server-to-client boundary is only exercised when a real server renders a real
page, and no lane did that until slice 2M.5. That estate gap is now closed by a
guard, and the lesson generalises to anything the successor ships behind a client
component.

---

## 3. What the successor would inherit as open

These are recorded so an authorization decision can be made with them in view.
None is a recommendation.

1. **Push does not deliver.** `HTTP 403` from Apple Web Push on the owner's real
   iPhone, with a configuration self-check that answers `pair: "consistent"`. No
   root cause is asserted. Destination:
   `docs/initiatives/push-hardware-validation/`.
2. **Android is unvalidated**, and the owner has no Android device. Whether that
   is acceptable, deferred, or funded with a borrowed device is an owner
   decision that has not been taken.
3. **No real screen reader has been run** against any Phase 2M surface.
4. **Four `daily-cycle` surfaces render instants in the host's zone**, recorded
   with an enumerated, self-cleaning guard exemption.
5. **`2L-MOBILE-008` and `2L-ACCESS-008`** are still open, re-stated rather than
   absorbed.
6. **`2E-COMMAND-012`** remains deferred behind ADR-057's unexecuted reopening
   gate.
7. **`RG-QUO-3`, `RG-DEP-1` and `RG-DEP-3`** still fail the signup rollout gate,
   and `RG-DEP-4` is an unsigned owner signature. **Signup must not open**, and
   neither this phase nor this report changes that.
8. **ADR-055 expires 2026-10-27**, neither satisfied nor superseded.

---

## 4. What the owner has to decide before anything starts

Stated as questions, with no option preferred:

1. Does the roadmap successor start at all, and on the subject Task 7 describes?
2. Is push's real-device validation a precondition for it, a parallel track, or
   accepted as an open residual for longer?
3. Is the Android gap accepted, deferred with a date, or funded?
4. Does the successor get a migration budget, and how many, non-transferable?

**No answer is assumed here, and no artifact exists that would presuppose one.**

---

## 5. The guard's own status

The phase-start guard reports **no start signal**: no governing artifact
filename in the successor's shape, no declared requirement in the successor's
namespace, no accepted ADR whose heading names it, and no implementation file
matching it. That was true before this report and is true after it — this
document is deliberately shaped so that it stays true.
