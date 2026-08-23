# Phase 2R — threat model

**Planning artifact. Nothing here is implemented, and no threat below is
closed.** Every item carries the disposition **OPEN — planned**, because a threat
model written before the work cannot honestly record a mitigation as verified.
Slice 2R.5 re-dispositions each one against what was actually built.

Scope: the recurrence model, its materialisation path, the series-edit
semantics, and the delivery of recurring reminders. Threats already closed by
earlier phases are re-stated only where recurrence could reopen them.

---

## The threats

### `T-2R-1` — a series or occurrence crossing an owner boundary

**Why recurrence reopens it.** A recurrence introduces a **relationship** —
series to occurrence — and this repository's rule is that a relationship's own
`user_id` is **never** proof of ownership on its own. Every prior relationship
table here proves ownership by composite foreign key `(user_id, id)`, and the
polymorphic ones need a trigger.

**Planned mitigation.** Composite FK `(user_id, id)`; forced RLS; least-privilege
grants; and a **negative control** in pgTAP proving a second owner is refused —
not merely that the first owner succeeds. Asserted through real roles, because
`postgres` bypasses RLS and a definer function is therefore the isolation.

**Disposition: OPEN — planned.** `2R-MODEL-008`.

### `T-2R-2` — materialisation writing on behalf of the wrong owner

**Why it is distinct from `T-2R-1`.** Materialisation runs **unattended**. A read
path that leaks is a disclosure; a write path that leaks **creates rows in
someone else's account**, and no RLS policy protects against a definer function
that resolves the owner incorrectly, because such a function runs with
`rolbypassrls`.

**Planned mitigation.** The owner is derived from the series row itself, never
passed in by the caller; `SECURITY DEFINER` with an explicit empty `search_path`;
caller validated; least-privilege grants; and the write audited with actor,
source, reason, target, time and resulting state.

**Disposition: OPEN — planned.** `2R-MODEL-008`, `2R-TRUST-001`, `2R-TRUST-005`.

### `T-2R-3` — a rule that computes without bound

**The threat.** A rule such as *"every minute"*, or one whose next-instant search
never terminates because no valid instant exists (a February 30th, an
hour that does not exist on the day it is sought), turns the hourly heartbeat
into a hang or a runaway.

**This is the threat that most argues for `OD-2R-2` option A.** A closed set of
enumerated patterns cannot express an unbounded rule; an `RRULE` subset can, and
its failure is silent.

**Planned mitigation.** Validation at the boundary against a closed vocabulary; a
minimum interval; a bounded search for the next valid instant that **raises**
rather than looping when it finds none; and `OD-2R-5`'s three unrepresentable
cases decided in advance rather than discovered at runtime.

**Disposition: OPEN — planned.** `2R-MODEL-002`, `2R-TIME-002` … `-004`.

### `T-2R-4` — delivery amplification

**The threat.** Recurrence multiplies notifications by construction. A series
unprocessed for days, or several series colliding on one morning, could produce a
burst — the product spamming its own owner, and spending on every send.

**Planned mitigation.** Quiet hours, the daily cap and the 24-hour cooldown
already exist and already operate on `reminders` rows; `OD-2R-3` option A keeps
them operating on exactly one row per series, so they are **unchanged rather than
re-implemented**. `2R-NOTIFY-005` additionally requires that a missed series
deliver at most what the cap allows and never a backlog at once.

**Disposition: OPEN — planned.** `2R-NOTIFY-001` … `-005`.

### `T-2R-5` — content leaking into a notification

**Why it is listed.** The content-free contract is established and holds today.
Recurrence adds a new producer of notifications, and a new producer is a new
chance to include a title *"for clarity"*.

**Planned mitigation.** Type, destination and locale only. Nothing that could
name a task, a person or a day. Asserted at the producer, not at the surface.

**Disposition: OPEN — planned.** `2R-NOTIFY-006`.

### `T-2R-6` — a rule string reaching a surface

**The threat.** A raw rule — an `RRULE`, a JSON fragment, a cron expression — is
both unreadable and a small disclosure of internal shape. This repository has
already ruled that the owner's vocabulary is never the column's.

**Planned mitigation.** `2R-SURFACE-004`: no surface renders a raw rule, asserted
by scanning the rendered output rather than by reviewing the code.

**Disposition: OPEN — planned.**

### `T-2R-7` — an undo that does not restore

**The threat.** *"This and future"* rewrites a rule. An undo that restores the
rule but not the already-materialised occurrence — or vice versa — leaves a state
neither the owner nor the product chose. An undo asserted but never exercised is
the specific failure this repository has recorded before.

**Planned mitigation.** Every series operation has a **real** undo, **exercised**
in a test rather than asserted; anything without one becomes an explicit
confirmation and is reported as such.

**Disposition: OPEN — planned.** `2R-SERIES-007`, `2R-SERIES-008`.

### `T-2R-8` — materialisation mistaken for autonomy

**The threat, and it is a governance threat rather than a technical one.** The
product has a per-category automation framework with policy states, calibration
thresholds and an eligibility decision. Materialising the next occurrence of a
rule the owner **explicitly created** is not automation in that sense — but it is
an unattended write, and a later reader could reasonably mistake it for one, or a
future author could wire it to the automation policy "for consistency".

**This threat is sharpened by a fact the audit found.** `task` and `person` are
already stored as `automatic_when_eligible` — the owner's own setting, from
2026-08-20. The product is safe only because **no consumer of the eligibility
decision writes anything**. Adding the first unattended writer to the product is
exactly the moment that property could be lost by accident.

**Planned mitigation.** `2R-TRUST-002`: materialisation carries **no**
`automation_category_policies` state, is never reported as autonomy, and is
asserted not to consume `automation_category_status` or
`automation_category_decision`. `2R-TRUST-003`: all six categories read exactly
as at baseline, **re-read at closeout** rather than assumed.

**Disposition: OPEN — planned.** The most important item in this model.

### `T-2R-9` — the migration widening authority

**The threat.** A migration that adds a grant, relaxes a policy, changes a
retention rule or moves authority while ostensibly adding a column.

**Planned mitigation.** The destination is exclusive and named in advance
(`2R-MODEL-009`); `2R-TRUST-004` asserts no grant, RLS policy, retention rule or
authority moves, against the migration's own diff; a second migration of any kind
is a **stop condition**.

**Disposition: OPEN — planned.**

### `T-2R-10` — silent spend

**The threat.** An AI call or BYOK credit consumed to classify, parse or describe
a rule.

**Planned mitigation.** `2R-TRUST-007`: no AI call is made by this phase. The
recurrence model is deterministic by construction — a rule is validated, not
interpreted — so no path needs a model. A half that could only be proved by
spending the owner's credential is recorded **unspendable**, never as a pass.

**Disposition: OPEN — planned.**

### `T-2R-11` — the successor phase starting by accident

**The threat.** A file, a note or a backlog line that starts the phase after this
one without an owner decision.

**Planned mitigation.** The phase-start detector is retargeted in the **same
commit** that authorizes this package, so the invariant is never unenforced in
between, and `2R-CLOSE-010` re-asserts it at closeout.

**Disposition: OPEN — planned.**

### `T-2R-12` — a hardware proof discharged by a document

**The threat.** `2R-MOBILE-003` and the closing checkpoint require the owner's
own device. A record that marks either satisfied without a device session would
be a false claim of exactly the kind this repository has spent phases learning to
refuse.

**Planned mitigation.** `2R-CLOSE-009` makes the guard refuse it, and
`2R-CLOSE-012` makes closure require an owner decision after a checkpoint rather
than a green pipeline.

**Disposition: OPEN — planned.**

---

## Inherited properties this phase must not weaken

Re-proved at closeout, not assumed:

| property | source | how recurrence could threaten it |
|---|---|---|
| No reviews surface resolves governed content | ADR-124 / ADR-127 Decision 5.1 | untouched — recurrence has no reviews surface |
| Quiet hours · daily cap · 24-hour cooldown | Phase 2M heartbeat | `T-2R-4` |
| Content-free notifications | Phase 2M | `T-2R-5` |
| One timezone authority | Local Day Correction | a second occurrence-instant computation |
| All six automation categories unchanged | audit §5, as measured | `T-2R-8` |
| Signup closed · rollout 25 · 3 · 2 | Signup Hardening | not touched; re-read at closeout |
| `2P-ACCESS-005` **NOT EXECUTED — OWNER WAIVED** | ADR-125 / ADR-130 | `2R-ACCESS-005` forbids any screen-reader claim |

---

## Summary

**Twelve threats, all OPEN — planned. Zero closed, and none may be reported as
closed before slice 2R.5 re-dispositions it against what was built.**

The two that deserve the most attention are **`T-2R-8`** — because this phase
would add the product's **first unattended writer**, at a moment when two
automation categories already carry the owner's stored consent and only the
absence of a consumer keeps them inert — and **`T-2R-3`**, because it is the one
whose failure mode is a hang rather than a wrong answer.

---

## Disposition after ADR-132 (2026-08-23)

**Zero threats are CLOSED, and that is the correct outcome.** Closing a threat
requires the mitigation to exist and to have been exercised. **Nothing is
implemented**, so nothing above may be reported as mitigated — the sections above
are not rewritten, and this table is the disposition.

**What the signatures did change** is the *shape* of several threats: a decision
can remove an attack surface before any code is written, and where that happened
it is recorded as **NARROWED BY DECISION** — which is a smaller open threat, not
a closed one.

| threat | disposition | what the signature changed |
|---|---|---|
| `T-2R-1` — series or occurrence crossing an owner boundary | **OPEN — planned** | unchanged. Composite FK, forced RLS and a **negative control** all still have to be written |
| `T-2R-2` — materialisation writing for the wrong owner | **OPEN — planned** | `OD-2R-3` A keeps exactly one unattended write path instead of a horizon job, so the surface is **one function, not two** — still unwritten |
| `T-2R-3` — a rule that computes without bound | **OPEN — NARROWED BY DECISION** | `OD-2R-2` A is the mitigation's foundation: **a closed set cannot express an unbounded rule**, and `RRULE` is refused by name. The bounded next-instant search that **raises** rather than looping is still unwritten |
| `T-2R-4` — delivery amplification | **OPEN — NARROWED BY DECISION** | `OD-2R-3` A keeps quiet hours, the daily cap and the 24-hour cooldown **operating on exactly one row**, so they are inherited rather than re-implemented. `2R-NOTIFY-005`'s no-burst rule is still unwritten |
| `T-2R-5` — content leaking into a notification | **OPEN — planned** | unchanged |
| `T-2R-6` — a rule string reaching a surface | **OPEN — NARROWED BY DECISION** | `OD-2R-2` A means there is **no `RRULE` string in existence to leak**; what remains is not rendering the JSON object, which `2R-SURFACE-004` still has to assert |
| `T-2R-7` — an undo that does not restore | **OPEN — planned** | `OD-2R-4` A's narrower default reduces how much a wrong undo could destroy; the **exercised** undo is still unwritten |
| `T-2R-8` — materialisation mistaken for autonomy | **OPEN — planned. Still the most important item in this model** | unchanged by signature, and **one input moved**: the owner has **undone** the 2026-08-20 opt-in, so all six categories are `suggest_only` again (audit §10.3). That removes the stored consent this threat was sharpened by — **but not the threat**, because this phase would still add the product's **first unattended writer**, and `2R-TRUST-002`'s prohibition is still unwritten |
| `T-2R-9` — the migration widening authority | **OPEN — planned** | `OD-2R-7` A makes the destination **exclusive and allocated**, so a widening is now a stop condition rather than a judgement call. The diff assertion is still unwritten |
| `T-2R-10` — silent spend | **OPEN — planned** | `OD-2R-2` A makes the model **deterministic by construction** — a rule is validated, not interpreted — so no path needs a model at all. ADR-132 D12 forbids the spend |
| `T-2R-11` — the successor phase starting by accident | **OPEN — planned** | unchanged. The detector is retargeted and re-proved with a mutation control, but `2R-CLOSE-010` re-asserts it at closeout |
| `T-2R-12` — a hardware proof discharged by a document | **OPEN — planned** | unchanged, and `OD-2R-6` A adds nothing to the device surface |

**Summary: 12 open · 0 closed · 4 narrowed by decision.**

### Two threats the signatures did not create, checked because they could have

- **`OD-2R-8`'s lift** is **limited to reminders**. It creates no threat, because
  it widens no write path — it removes a *refusal*, not a *constraint*. Had it
  reached tasks, `T-2R-2` would have acquired the task confirmation lifecycle;
  `OD-2R-6` A is what keeps that boundary, and stop condition 9 enforces it.
- **`OD-2R-9`'s routing out** removes no mitigation from this phase, because
  neither defect is a threat — both are correctness defects on surfaces this
  phase does not touch.

### What would have to happen for any of these to close

A slice ships the mitigation, its test exercises it rather than asserting it, and
slice 2R.5 re-dispositions the threat against **what was actually built**. Until
then, **every line in this model is a plan.**
